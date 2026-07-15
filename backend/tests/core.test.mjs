import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calcAbsoluteHumidity, calcDewPoint, calcVPD } from '../calculations.js';
import { getAllowedOrigins, getSessionCookieOptions, publicError } from '../config.js';
import { buildCurrentMetricEvaluations, buildScoreFromMetricValues, buildScoreRules, buildSectionDashboardState, evaluateMetricValue, statusFromMeasurementTime } from '../score.js';
import { validateCropProfileMetrics } from '../validation.js';
import { createMemoryRateLimiter } from '../rate-limit.js';
import { METRIC_TO_COLUMN } from '../metrics.js';
import { buildNodeHealth, expectedUplinkIntervalSec, normalizeErrorCounters, normalizeErrorFlags } from '../node-health.js';
import { buildTodayActions, evaluateActionOutcome } from '../today-actions.js';

test('production CORS defaults never trust localhost', () => {
  assert.deepEqual(getAllowedOrigins({}), ['https://neurocrop.lt', 'https://www.neurocrop.lt']);
  assert.equal(getAllowedOrigins({ ALLOW_LOCAL_DEV_ORIGINS: 'true' }).includes('http://localhost:4173'), true);
});

test('session cookies default to secure SameSite=Lax', () => {
  assert.deepEqual(getSessionCookieOptions({}), { httpOnly: true, secure: true, sameSite: 'lax' });
  assert.throws(
    () => getSessionCookieOptions({ SESSION_SAME_SITE: 'none', SESSION_COOKIE_SECURE: 'false' }),
    /requires a secure/
  );
});

test('server errors do not expose internal details', () => {
  assert.deepEqual(publicError(new Error('password=secret relation users')), {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error'
  });
  assert.equal(publicError(Object.assign(new Error('Invalid range'), { status: 400 })).message, 'Invalid range');
});

test('climate calculations reject impossible sensor values', () => {
  assert.equal(calcVPD(25, 50), 1.584);
  assert.equal(calcVPD(25, 101), null);
  assert.equal(calcDewPoint(25, 0), null);
  assert.equal(calcAbsoluteHumidity(-100, 50), null);
});

test('future timestamps outside clock-skew tolerance are not live', () => {
  const now = Date.parse('2026-07-12T12:00:00Z');
  assert.equal(statusFromMeasurementTime('2026-07-12T12:02:00Z', now, 300), 'live');
  assert.equal(statusFromMeasurementTime('2026-07-12T13:00:00Z', now, 300), 'offline');
});

test('node health ignores historical counters without an active fault', () => {
  const health = buildNodeHealth({
    transportStatus: 'live',
    errorFlags: { raw: 0, sensor_missing: false },
    errorCounters: { read_fail: 0, reinit: 9, tx_fail: 0 }
  });
  assert.equal(health.state, 'healthy');
  assert.equal(health.detail, 'No active device faults');
  assert.equal(health.diagnostics.counters.reinit, 0);
});

test('node health distinguishes active faults, recovery warnings and offline nodes', () => {
  const missing = buildNodeHealth({ transportStatus: 'live', errorFlags: { sensor_missing: true } });
  assert.equal(missing.state, 'fault');
  assert.equal(missing.reasons[0].code, 'sensor_missing');

  const recovered = buildNodeHealth({ transportStatus: 'live', errorFlags: { tx_timeout: true } });
  assert.equal(recovered.state, 'watch');
  assert.equal(recovered.detail, 'Transmission timeout recovery');

  const offline = buildNodeHealth({ transportStatus: 'offline', errorFlags: { sensor_missing: true } });
  assert.equal(offline.state, 'offline');
  assert.equal(offline.reasons[0].code, 'offline');
});

test('node diagnostics normalize decoder values and profile intervals', () => {
  assert.deepEqual(normalizeErrorFlags({ raw: '4', tx_timeout: 'false', sensor_missing: '1' }), {
    raw: 4,
    tx_timeout: false,
    sensor_missing: true
  });
  assert.deepEqual(normalizeErrorCounters({ read_fail: 99, reinit: 8, tx_fail: -2 }, { sensor_stale: true }), {
    read_fail: 15,
    reinit: 8,
    tx_fail: 0
  });
  assert.equal(expectedUplinkIntervalSec('power-save'), 900);
  assert.equal(expectedUplinkIntervalSec('unknown'), 300);
});

test('profile metric validation rejects malformed and reversed bands', () => {
  assert.equal(validateCropProfileMetrics({ airTemp: { optimal: [18, 24] } }), null);
  assert.match(validateCropProfileMetrics({ airTemp: { optimal: [24, 18] } }), /increasing/);
  assert.match(validateCropProfileMetrics({ airTemp: { optimal: ['x', 24] } }), /increasing/);
  assert.equal(validateCropProfileMetrics({ vpd: { optimal: [0.8, 1.2], scoreWeight: 1.5 } }), null);
  assert.match(validateCropProfileMetrics({ vpd: { optimal: [0.8, 1.2], scoreWeight: 4 } }), /between 0 and 3/);
});

test('lighting schedules are validated without exposing hardware assumptions', () => {
  assert.equal(validateCropProfileMetrics({ lux: { optimal: [10000, 30000], lightingSchedule: { enabled: true, start: '06:00', end: '22:00', darkThresholdLux: 100 } } }), null);
  assert.match(validateCropProfileMetrics({ lux: { optimal: [10000, 30000], lightingSchedule: { enabled: true, start: '25:00', end: '22:00' } } }), /HH:MM/);
  assert.match(validateCropProfileMetrics({ lux: { optimal: [10000, 30000], lightingSchedule: { darkThresholdLux: -1 } } }), /zero or greater/);
});

test('score rules use saved optimal ranges and automatic alert bands', () => {
  const rules = buildScoreRules({ airTemp: { optimal: [18, 22] } });
  assert.deepEqual(rules.airTemp.warning, [16, 24]);
  assert.deepEqual(rules.airTemp.critical, [14, 26]);
  assert.equal(evaluateMetricValue('airTemp', 23, rules).state, 'warning');
  assert.equal(evaluateMetricValue('airTemp', 27, rules).state, 'critical');
});

test('score crosses the optimal boundary smoothly without a warning cliff', () => {
  const profile = {
    airTemp: { optimal: [22, 26] },
    humidity: { optimal: [60, 70] },
    vpd: { optimal: [0.8, 1.2] }
  };
  const values = [1.2, 1.201, 1.21, 1.25, 1.3, 1.4];
  const scores = values.map((vpd) => buildScoreFromMetricValues({ airTemp: 24, humidity: 65, vpd }, profile).score);
  const rules = buildScoreRules(profile);

  assert.deepEqual(scores, [100, 99, 99, 99, 97, 94]);
  assert.equal(evaluateMetricValue('vpd', 1.2, rules).severity, 0);
  assert.ok(evaluateMetricValue('vpd', 1.201, rules).severity < 0.001);
  assert.ok(scores.every((score, index) => index === 0 || score <= scores[index - 1]));
});

test('severity stays continuous at warning and critical edges on both sides', () => {
  const rules = {
    vpd: {
      optimal: [0.8, 1.2], warning: [0.6, 1.4], critical: [0.4, 1.8],
      growth: true, scoreWeight: 1
    }
  };
  const severity = (value) => evaluateMetricValue('vpd', value, rules).severity;

  assert.ok(Math.abs(severity(1.4 - 1e-6) - severity(1.4 + 1e-6)) < 0.0001);
  assert.ok(Math.abs(severity(1.8 - 1e-6) - severity(1.8 + 1e-6)) < 0.0001);
  assert.ok(Math.abs(severity(0.6 - 1e-6) - severity(0.6 + 1e-6)) < 0.0001);
  assert.ok(Math.abs(severity(0.4 - 1e-6) - severity(0.4 + 1e-6)) < 0.0001);
  assert.ok(severity(2) > severity(1.8));
  assert.ok(severity(0.2) > severity(0.4));
});

test('agronomic domains give climate and root water more impact than instantaneous CO2', () => {
  const optimal = {
    airTemp: 24, humidity: 65, vpd: 1, soilMoisture: 55,
    ec: 2.3, ph: 6.1, soilEc: 2, leafTemp: 22,
    soilTemp: 22, waterTemp: 20, co2: 1000
  };
  const climateStress = buildScoreFromMetricValues({ ...optimal, vpd: 2.2 });
  const rootWaterStress = buildScoreFromMetricValues({ ...optimal, soilMoisture: 95 });
  const carbonStress = buildScoreFromMetricValues({ ...optimal, co2: 1800 });

  assert.ok(climateStress.score < carbonStress.score);
  assert.ok(rootWaterStress.score < carbonStress.score);
  assert.equal(climateStress.mainDriver, 'vpd');
  assert.equal(climateStress.scoreModelVersion, '2.1.0');
});

test('adding an optimal CO2 sensor does not change a climate-only section score', () => {
  const profile = {
    airTemp: { optimal: [19, 21] },
    humidity: { optimal: [50, 70] },
    vpd: { optimal: [0.5, 0.8] },
    co2: { optimal: [350, 2000] }
  };
  const climateValues = { airTemp: 19.8, humidity: 54.2, vpd: 1.05 };
  const withoutCo2 = buildScoreFromMetricValues(climateValues, profile);
  const withOptimalCo2 = buildScoreFromMetricValues({ ...climateValues, co2: 581 }, profile);

  assert.equal(withOptimalCo2.score, withoutCo2.score);
  assert.equal(withOptimalCo2.conditionStatus, withoutCo2.conditionStatus);
  assert.equal(withOptimalCo2.mainDriver, withoutCo2.mainDriver);
});

test('instantaneous CO2 cannot create a disproportionate limiting-factor penalty', () => {
  const optimalClimate = { airTemp: 24, humidity: 65, vpd: 1 };
  const baseline = buildScoreFromMetricValues(optimalClimate);
  const extremeCo2 = buildScoreFromMetricValues({ ...optimalClimate, co2: 2500 });

  assert.equal(baseline.score, 100);
  assert.ok(extremeCo2.score >= 90);
  assert.ok(baseline.score - extremeCo2.score <= 10);
  assert.equal(extremeCo2.mainDriver, 'co2');
});

test('correlated climate readings share one score domain', () => {
  const result = buildScoreFromMetricValues({ airTemp: 30, humidity: 80, vpd: 1.7 });
  assert.equal(result.scoreGroups.length, 1);
  assert.equal(result.scoreGroups[0].id, 'climate');
  assert.deepEqual(result.scoreGroups[0].metrics.sort(), ['airTemp', 'humidity', 'vpd']);
});

test('instantaneous light and air pressure are context metrics, not score penalties', () => {
  const contextualOnly = buildScoreFromMetricValues({ lux: 0, airPressure: 900 });
  const withOptimalClimate = buildScoreFromMetricValues({ airTemp: 24, lux: 0, airPressure: 900 });
  assert.equal(contextualOnly.score, null);
  assert.equal(withOptimalClimate.score, 100);
});

test('today actions rank critical live readings and suppress duplicate climate advice', () => {
  const now = Date.parse('2026-07-14T12:00:00Z');
  const nodeRows = [
    { last_received_at: '2026-07-14T11:59:00Z' },
    { last_received_at: '2026-07-14T11:58:00Z' }
  ];
  const measurements = [
    {
      time: '2026-07-14T11:59:00Z', temperature: 34, humidity: 92, co2: 300,
      raw_object: { expected_uplink_interval_s: 300, sensors: { sht45: { present: true }, scd41: { present: true } } }
    },
    {
      time: '2026-07-14T11:58:00Z', temperature: 32, humidity: 88, co2: 350,
      raw_object: { expected_uplink_interval_s: 300, sensors: { sht45: { present: true }, scd41: { present: true } } }
    }
  ];
  const profileMetrics = {
    airTemp: { optimal: [20, 24], action: 'Open the roof vents in stages.' },
    humidity: { optimal: [60, 70] },
    co2: { optimal: [700, 900] }
  };
  const current = buildCurrentMetricEvaluations(nodeRows, measurements, profileMetrics, now);
  const actions = buildTodayActions([{
    section: { id: 'section-1', name: 'North block', area_id: 'area-1', area_name: 'Main greenhouse', crop_profile: 'tomato' },
    profileMetrics,
    scoreRules: current.scoreRules,
    evaluations: current.evaluations,
    observedAtByMetric: { airTemp: measurements[0].time, humidity: measurements[0].time, vpd: measurements[0].time, co2: measurements[0].time },
    reportingNodes: 2,
    registeredNodes: 2
  }]);

  assert.equal(actions.length, 2);
  assert.equal(actions[0].state, 'critical');
  assert.equal(actions.filter((action) => ['airTemp', 'humidity', 'vpd'].includes(action.metricId)).length, 1);
  assert.equal(actions.some((action) => action.metricId === 'co2'), true);
  assert.equal(actions.every((action) => action.confidence === 'high'), true);
});

test('today actions ignore stale measurements and return no work for optimal readings', () => {
  const profileMetrics = { airTemp: { optimal: [20, 24] }, humidity: { optimal: [60, 70] } };
  const current = buildCurrentMetricEvaluations(
    [{ last_received_at: '2026-07-14T08:00:00Z' }],
    [{ time: '2026-07-14T08:00:00Z', temperature: 40, humidity: 90, raw_object: { expected_uplink_interval_s: 300, sensors: { sht45: { present: true } } } }],
    profileMetrics,
    Date.parse('2026-07-14T12:00:00Z')
  );
  assert.deepEqual(current.evaluations, []);
  assert.deepEqual(buildTodayActions([{
    section: { id: 'section-1', name: 'North block' },
    profileMetrics,
    scoreRules: current.scoreRules,
    evaluations: current.evaluations
  }]), []);
});

test('today actions exclude context-only light and pressure deviations', () => {
  const actions = buildTodayActions([{
    section: { id: 'section-1', name: 'North block' },
    profileMetrics: {},
    scoreRules: {
      lux: { growth: false, optimal: [10000, 30000] },
      airPressure: { growth: false, optimal: [995, 1025] }
    },
    evaluations: [
      { metricId: 'lux', state: 'critical', severity: 1, direction: 'low', value: 0 },
      { metricId: 'airPressure', state: 'warning', severity: 0.5, direction: 'low', value: 970 }
    ]
  }]);
  assert.deepEqual(actions, []);
});

test('tiny warning deviations remain visible without creating a priority action', () => {
  const profileMetrics = { vpd: { optimal: [0.8, 1.2] } };
  const scoreRules = buildScoreRules(profileMetrics);
  const evaluation = evaluateMetricValue('vpd', 1.21, scoreRules);
  const actions = buildTodayActions([{
    section: { id: 'section-1', name: 'North block' },
    profileMetrics,
    scoreRules,
    evaluations: [evaluation]
  }]);

  assert.equal(evaluation.state, 'warning');
  assert.ok(evaluation.severity < 0.05);
  assert.deepEqual(actions, []);
});

test('completed actions are verified only from newer measurements', () => {
  const action = { value: 88, target: [60, 70] };
  const feedback = { status: 'completed', createdAt: '2026-07-14T12:00:00Z' };
  assert.equal(evaluateActionOutcome(action, feedback, { value: 72, observedAt: '2026-07-14T11:59:00Z' }).state, 'awaiting_data');
  assert.equal(evaluateActionOutcome(action, feedback, { value: 76, observedAt: '2026-07-14T12:10:00Z' }).state, 'improving');
  assert.equal(evaluateActionOutcome(action, feedback, { value: 68, observedAt: '2026-07-14T12:10:00Z' }).state, 'target_reached');
  assert.equal(evaluateActionOutcome(action, feedback, { value: 92, observedAt: '2026-07-14T12:10:00Z' }).state, 'not_improving');
  assert.equal(evaluateActionOutcome(action, { ...feedback, status: 'deferred' }, {}).state, 'not_applicable');
});

test('historical score snapshots use the same canonical score model', () => {
  const healthy = buildScoreFromMetricValues({ airTemp: 20, humidity: 60, co2: 700 }, {
    airTemp: { optimal: [18, 22] }, humidity: { optimal: [50, 70] }, co2: { optimal: [500, 900] }
  });
  const hot = buildScoreFromMetricValues({ airTemp: 30, humidity: 60, co2: 700 }, {
    airTemp: { optimal: [18, 22] }, humidity: { optimal: [50, 70] }, co2: { optimal: [500, 900] }
  });
  assert.equal(healthy.score, 100);
  assert.equal(healthy.mainDriver, null);
  assert.ok(hot.score < healthy.score);
  assert.equal(hot.mainDriver, 'airTemp');
});

test('all persisted parameters have explicit scoring or context-only rules', () => {
  const persistedMetrics = [
    'airTemp', 'humidity', 'co2', 'lux', 'soilTemp', 'vpd', 'soilMoisture',
    'ec', 'ph', 'leafTemp', 'soilEc', 'waterTemp', 'airPressure'
  ];
  const rules = buildScoreRules({});
  assert.equal(rules.lux.growth, false);
  assert.equal(rules.airPressure.growth, false);
  assert.deepEqual(persistedMetrics.filter((key) => !rules[key]), []);
  assert.deepEqual(persistedMetrics.filter((key) => key !== 'vpd' && !METRIC_TO_COLUMN[key]), []);
});

test('rate limiter expires attempts and can reset successful keys', () => {
  const limiter = createMemoryRateLimiter({ limit: 2, windowMs: 1000 });
  limiter.record('client', 0);
  assert.equal(limiter.isLimited('client', 0), false);
  limiter.record('client', 10);
  assert.equal(limiter.isLimited('client', 10), true);
  assert.equal(limiter.isLimited('client', 1001), false);
  limiter.record('client', 2000);
  limiter.reset('client');
  assert.equal(limiter.isLimited('client', 2000), false);
});

test('score ignores values from sensors explicitly reported as absent', () => {
  const state = buildSectionDashboardState(
    [{ last_received_at: new Date().toISOString() }],
    [{
      time: new Date().toISOString(),
      temperature: 24,
      humidity: 65,
      soil_temperature: 0,
      raw_object: {
        expected_uplink_interval_s: 300,
        sensors: {
          sht45: { present: true },
          scd41: { present: true },
          ds18b20: { present: false }
        }
      }
    }],
    {}
  );
  assert.equal(state.availableMetrics.includes('soilTemp'), false);
  assert.notEqual(state.mainDriver, 'soilTemp');
  assert.deepEqual(state.coverage, {
    liveMetrics: 3,
    expectedMetrics: 4,
    reportingNodes: 1,
    registeredNodes: 1
  });
  assert.deepEqual(state.configuredMetrics.sort(), ['airTemp', 'co2', 'humidity', 'vpd']);
});

test('coverage denominator follows currently detected sensor hardware', () => {
  const now = new Date().toISOString();
  const internalOnly = buildSectionDashboardState(
    [{ last_received_at: now, last_sensor_presence: { sht45: true, scd41: false, ds18b20: false } }],
    [{
      time: now,
      temperature: 24,
      humidity: 65,
      raw_object: { expected_uplink_interval_s: 300, sensors: { sht45: { present: true }, scd41: { present: false }, ds18b20: { present: false } } }
    }],
    {}
  );
  assert.equal(internalOnly.coverage.liveMetrics, 3);
  assert.equal(internalOnly.coverage.expectedMetrics, 3);

  const fullyConnected = buildSectionDashboardState(
    [{ last_received_at: now, last_sensor_presence: { sht45: true, scd41: true, ds18b20: true } }],
    [{
      time: now,
      temperature: 24,
      humidity: 65,
      co2: 600,
      soil_temperature: 20,
      raw_object: { expected_uplink_interval_s: 300, sensors: { sht45: { present: true }, scd41: { present: true }, ds18b20: { present: true } } }
    }],
    {}
  );
  assert.equal(fullyConnected.coverage.liveMetrics, 5);
  assert.equal(fullyConnected.coverage.expectedMetrics, 5);
});

test('platform organization creation does not grant the creator tenant membership', () => {
  const source = fs.readFileSync(new URL('../organization-routes.js', import.meta.url), 'utf8');
  const createRoute = source.slice(
    source.indexOf("app.post('/platform/organizations'"),
    source.indexOf("app.delete('/platform/organizations/", source.indexOf("app.post('/platform/organizations'"))
  );
  assert.equal(createRoute.includes('INSERT INTO organization_memberships'), false);
});

test('platform node diagnostics are restricted to platform administrators', () => {
  const source = fs.readFileSync(new URL('../organization-routes.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf("app.get('/platform/organizations/:organizationId/nodes'");
  const route = source.slice(routeStart, source.indexOf("app.post('/platform/organizations'", routeStart));
  assert.match(route, /requirePlatformAdmin/);
  assert.match(route, /last_error_flags/);
  assert.match(route, /last_error_counters/);
});

test('platform organization listing includes active node fault counts', () => {
  const source = fs.readFileSync(new URL('../organization-routes.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf("app.get('/platform/organizations'");
  const route = source.slice(routeStart, source.indexOf("app.get('/platform/organizations/:organizationId/nodes'", routeStart));
  assert.match(route, /fault_node_count/);
  assert.match(route, /jsonb_each/);
  assert.match(route, /faultNodeCount/);
});

test('password change verifies the current password and revokes other sessions', () => {
  const source = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  const route = source.slice(
    source.indexOf("app.post('/auth/change-password'"),
    source.indexOf("async function latestForNode", source.indexOf("app.post('/auth/change-password'"))
  );
  assert.match(route, /verifyUserPassword\(currentPassword/);
  assert.match(route, /newPassword\.length < 12/);
  assert.match(route, /token_hash<>\$2/);
  assert.match(route, /hashSessionToken\(req\.cookies\.neurocrop_session\)/);
});

test('action feedback is tenant-scoped, role-protected and keeps an immutable snapshot', () => {
  const source = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf("app.post(\n  '/actions/today/:actionId/feedback'");
  const route = source.slice(routeStart, source.indexOf("app.get('/readings/latest'", routeStart));
  assert.ok(routeStart >= 0);
  assert.match(route, /requireRole\('owner', 'admin', 'grower', 'technician'\)/);
  assert.match(route, /getSectionById\(action\.sectionId, organizationId\)/);
  assert.match(route, /action_payload/);
  assert.match(route, /req\.user\.id/);
  assert.match(route, /pg_advisory_xact_lock/);
  assert.match(route, /deduplicated: true/);
  assert.match(route, /allowedExecutionTypes/);
  assert.match(route, /status === 'completed'/);
  assert.match(route, /execution_details/);
});

test('action history is tenant-scoped and verifies outcomes from section measurements', () => {
  const source = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf("app.get('/actions/history'");
  const route = source.slice(routeStart, source.indexOf("app.get('/readings/latest'", routeStart));
  assert.ok(routeStart >= 0);
  assert.match(route, /WHERE organization_id=\$1/);
  assert.match(route, /n\.organization_id=\$1/);
  assert.match(route, /evaluateActionOutcome/);
  assert.match(route, /DISTINCT ON \(action_id, COALESCE\(action_payload->>'observedAt'/);
});
