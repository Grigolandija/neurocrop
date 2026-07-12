import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calcAbsoluteHumidity, calcDewPoint, calcVPD } from '../calculations.js';
import { getAllowedOrigins, getSessionCookieOptions, publicError } from '../config.js';
import { buildScoreRules, buildSectionDashboardState, evaluateMetricValue, statusFromMeasurementTime } from '../score.js';
import { validateCropProfileMetrics } from '../validation.js';
import { createMemoryRateLimiter } from '../rate-limit.js';

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

test('profile metric validation rejects malformed and reversed bands', () => {
  assert.equal(validateCropProfileMetrics({ airTemp: { optimal: [18, 24] } }), null);
  assert.match(validateCropProfileMetrics({ airTemp: { optimal: [24, 18] } }), /increasing/);
  assert.match(validateCropProfileMetrics({ airTemp: { optimal: ['x', 24] } }), /increasing/);
});

test('score rules use saved optimal ranges and automatic alert bands', () => {
  const rules = buildScoreRules({ airTemp: { optimal: [18, 22] } });
  assert.deepEqual(rules.airTemp.warning, [16, 24]);
  assert.deepEqual(rules.airTemp.critical, [14, 26]);
  assert.equal(evaluateMetricValue('airTemp', 23, rules).state, 'warning');
  assert.equal(evaluateMetricValue('airTemp', 27, rules).state, 'critical');
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
