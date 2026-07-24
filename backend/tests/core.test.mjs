import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { calcAbsoluteHumidity, calcDewPoint, calcVPD } from '../calculations.js';
import { getAllowedOrigins, getSessionCookieOptions, getTrustProxyHops, publicError } from '../config.js';
import { buildCurrentMetricEvaluations, buildScoreFromMetricValues, buildScoreRules, buildSectionDashboardState, evaluateMetricValue, statusFromMeasurementTime } from '../score.js';
import { validateCropProfileMetrics } from '../validation.js';
import { createMemoryRateLimiter } from '../rate-limit.js';
import { METRIC_TO_COLUMN } from '../metrics.js';
import { buildNodeHealth, expectedUplinkIntervalSec, normalizeErrorCounters, normalizeErrorFlags } from '../node-health.js';
import { buildTodayActions, evaluateActionOutcome, getActionVerificationPolicy } from '../today-actions.js';
import { invitationState } from '../invitation-state.js';
import { compactTelemetryMetadata, normalizeTelemetryBoolean, normalizeTelemetryNumber, normalizeTelemetryTimestamp } from '../telemetry-values.js';
import { getMeasurementRetentionDays, runMeasurementRetention } from '../measurement-retention.js';
import { hashUserPassword, MAX_PASSWORD_LENGTH, sessionCookieClearOptions, sessionCookieOptions, verifyUserPassword } from '../auth-users.js';
import { sendInvitationEmail } from '../email.js';

test('production CORS defaults never trust localhost', () => {
  assert.deepEqual(getAllowedOrigins({}), ['https://neurocrop.lt', 'https://www.neurocrop.lt']);
  assert.equal(getAllowedOrigins({ ALLOW_LOCAL_DEV_ORIGINS: 'true' }).includes('http://localhost:4173'), true);
  assert.deepEqual(getAllowedOrigins({}), ['https://neurocrop.lt', 'https://www.neurocrop.lt']);
});

test('trusted proxy hops are explicit and validated', () => {
  assert.equal(getTrustProxyHops({}), 0);
  assert.equal(getTrustProxyHops({ TRUST_PROXY_HOPS: '1' }), 1);
  assert.throws(() => getTrustProxyHops({ TRUST_PROXY_HOPS: 'all' }), /integer between 0 and 10/);
});

test('production API stays private behind the shared Caddy network', () => {
  const compose = fs.readFileSync(new URL('../../deploy/production.compose.yml', import.meta.url), 'utf8');
  assert.equal(/^\s*ports:/m.test(compose), false);
  assert.match(compose, /external:\s+true/);
  assert.match(compose, /name:\s+chirpstack_default/);
  assert.match(compose, /TRUST_PROXY_HOPS:\s+"1"/);
  assert.match(compose, /neurocrop-ingest:[\s\S]*?command: \["node", "ingest\.js"\]/);
  assert.match(compose, /neurocrop-ingest:[\s\S]*?healthcheck:\n\s+disable: true/);
});

test('production deployment waits for API and ingest processes', () => {
  const deploy = fs.readFileSync(new URL('../../deploy/deploy.sh', import.meta.url), 'utf8');
  assert.match(deploy, /docker inspect[\s\S]*neurocrop-ingest/);
  assert.match(deploy, /test "\$ingest_health" = running/);
});

test('production frontend sends baseline browser security headers', () => {
  const nginx = fs.readFileSync(new URL('../../deploy/nginx.conf.template', import.meta.url), 'utf8');
  assert.match(nginx, /X-Content-Type-Options "nosniff"/);
  assert.match(nginx, /X-Frame-Options "SAMEORIGIN"/);
  assert.match(nginx, /Referrer-Policy "strict-origin-when-cross-origin"/);
  assert.match(nginx, /Permissions-Policy "camera=\(\), microphone=\(\), geolocation=\(\)"/);
  assert.match(nginx, /max-age=31536000, immutable/);
});

test('telemetry values reject malformed numbers and poisoned timestamps', () => {
  assert.equal(normalizeTelemetryNumber('23.5'), 23.5);
  assert.equal(normalizeTelemetryNumber('not-a-number'), null);
  assert.equal(normalizeTelemetryNumber(true), null);
  assert.equal(normalizeTelemetryNumber({ value: 23.5 }), null);
  assert.equal(normalizeTelemetryBoolean('false'), false);
  assert.equal(normalizeTelemetryBoolean('1'), true);
  assert.equal(normalizeTelemetryBoolean('yes'), null);

  const now = new Date('2026-07-22T12:00:00Z');
  assert.equal(normalizeTelemetryTimestamp('2026-07-22T11:59:00Z', now).toISOString(), '2026-07-22T11:59:00.000Z');
  assert.equal(normalizeTelemetryTimestamp('invalid', now).toISOString(), now.toISOString());
  assert.equal(normalizeTelemetryTimestamp('2099-01-01T00:00:00Z', now).toISOString(), now.toISOString());
});

test('historical telemetry stores only metadata required by product queries', () => {
  assert.deepEqual(
    compactTelemetryMetadata({
      temperature: 23.4,
      humidity: 66,
      firmware_version: '2.1.5',
      expected_uplink_interval_s: 600,
      sensors: {
        sht45: { present: true, fresh: true, raw: 123 },
        scd41: { present: false, fresh: false }
      },
      unused_debug_payload: { oversized: true }
    }, { last_tx_failed: false }),
    {
      firmware_version: '2.1.5',
      expected_uplink_interval_s: 600,
      sensors: {
        sht45: { present: true },
        scd41: { present: false }
      },
      error_flags: { last_tx_failed: false }
    }
  );
});

test('measurement retention is bounded, batched and protected by an advisory lock', async () => {
  assert.equal(getMeasurementRetentionDays({}), 35);
  assert.equal(getMeasurementRetentionDays({ MEASUREMENT_RETENTION_DAYS: '60' }), 60);
  assert.throws(
    () => getMeasurementRetentionDays({ MEASUREMENT_RETENTION_DAYS: '14' }),
    /between 31 and 365/
  );

  const calls = [];
  let deleteCall = 0;
  const client = {
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('pg_try_advisory_lock')) return { rows: [{ locked: true }], rowCount: 1 };
      if (sql.includes('DELETE FROM measurements')) {
        deleteCall += 1;
        return { rows: [], rowCount: deleteCall === 1 ? 2 : 1 };
      }
      return { rows: [{ pg_advisory_unlock: true }], rowCount: 1 };
    },
    release() {
      calls.push({ sql: 'release', params: [] });
    }
  };

  const result = await runMeasurementRetention(
    { connect: async () => client },
    { retentionDays: 35, batchSize: 2, maxBatches: 5, now: '2026-07-24T12:00:00.000Z' }
  );

  assert.equal(result.deleted, 3);
  assert.equal(result.cutoff.toISOString(), '2026-06-19T12:00:00.000Z');
  assert.equal(calls.filter((call) => call.sql.includes('DELETE FROM measurements')).length, 2);
  assert.equal(calls.some((call) => call.sql === 'ANALYZE measurements'), true);
  assert.equal(calls.at(-1).sql, 'release');
});

test('measurement presence remains compatible with older firmware without converting null to zero', () => {
  const source = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  assert.match(source, /normalizeTelemetryBoolean\(measurement\?\.raw_object\?\.sensors/);
  assert.match(source, /normalizeTelemetryNumber\(measurementMetricValue\(measurement, metric\)\) !== null/);
  assert.match(source, /IS NULL OR lower\([^\n]+\) IN \('true', '1'\)/);
  assert.match(source, /const numericValue = normalizeTelemetryNumber\(value\);\n\s+if \(numericValue === null\) return;/);
  assert.doesNotMatch(source, /if \(!Number\.isFinite\(Number\(value\)\)\) return;/);
});

test('successful invitation delivery tolerates a non-JSON provider response', async () => {
  const originalKey = process.env.RESEND_API_KEY;
  const originalFetch = globalThis.fetch;
  process.env.RESEND_API_KEY = 'test-key';
  globalThis.fetch = async () => ({ ok: true, text: async () => 'accepted' });

  try {
    const result = await sendInvitationEmail({
      to: 'grower@example.com',
      organizationName: 'Test farm',
      role: 'grower',
      inviteUrl: 'https://neurocrop.lt/invite/test'
    });
    assert.deepEqual(result, { sent: true, response: 'accepted' });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalKey;
  }
});

test('production uptime confirms failures and cannot let notification errors mask the probe', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/uptime.yml', import.meta.url), 'utf8');
  assert.match(workflow, /push:[\s\S]*?paths:[\s\S]*?- \.github\/workflows\/uptime\.yml/);
  assert.equal((workflow.match(/for attempt in 1 2 3/g) || []).length, 2);
  assert.equal((workflow.match(/test "\$attempt" = 3 \|\| sleep 10/g) || []).length, 2);
  assert.match(workflow, /cron: "\*\/15 \* \* \* \*"/);
  assert.match(workflow, /--header 'Accept: text\/html,application\/xhtml\+xml'/);
  assert.match(workflow, /--user-agent 'Mozilla\/5\.0 \(compatible; NeuroCrop-Uptime\/1\.0;/);
  assert.match(workflow, /jq -e '\.status == "ok"'/);
  assert.match(workflow, /https:\/\/neurocrop\.lt\//);
  assert.match(workflow, /<title>NeuroCrop Control Center<\/title>/);
  assert.match(workflow, /id: frontend/);
  assert.match(workflow, /name: Send outage email\n\s+if:[\s\S]*?continue-on-error: true/);
  assert.match(workflow, /name: Fail confirmed outage/);
  assert.match(workflow, /API=\$API_OUTCOME frontend=\$FRONTEND_OUTCOME/);
});

test('platform monitor ignores archived nodes when checking uplink freshness', () => {
  const monitor = fs.readFileSync(new URL('../scripts/monitor-platform.sh', import.meta.url), 'utf8');
  assert.match(
    monitor,
    /FROM nodes WHERE organization_id <> 'org-neurocrop-demo' AND archived_at IS NULL AND section_id IS NOT NULL/
  );
});

test('session cookies default to secure SameSite=Lax', () => {
  assert.deepEqual(getSessionCookieOptions({}), { httpOnly: true, secure: true, sameSite: 'lax' });
  assert.throws(
    () => getSessionCookieOptions({ SESSION_SAME_SITE: 'none', SESSION_COOKIE_SECURE: 'false' }),
    /requires a secure/
  );
});

test('logout cookie options expire the cookie instead of extending it', () => {
  const { maxAge, ...expectedClearOptions } = sessionCookieOptions();
  assert.equal(maxAge > 0, true);
  assert.deepEqual(sessionCookieClearOptions(), expectedClearOptions);
  assert.equal('maxAge' in sessionCookieClearOptions(), false);
});

test('password hashing rejects pathological input before running scrypt', () => {
  const password = 'correct horse battery staple';
  const hash = hashUserPassword(password);
  assert.equal(verifyUserPassword(password, hash), true);
  assert.equal(verifyUserPassword('wrong password', hash), false);
  assert.equal(verifyUserPassword('x'.repeat(MAX_PASSWORD_LENGTH + 1), hash), false);
  assert.throws(
    () => hashUserPassword('x'.repeat(MAX_PASSWORD_LENGTH + 1)),
    /at most 1024 characters/
  );
});

test('login has both account and IP rate limits and logout uses clear-only cookie options', () => {
  const source = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  assert.match(source, /authIpLimiter\.isLimited\(ipAttemptKey\)/);
  assert.match(source, /authIpLimiter\.record\(ipAttemptKey\)/);
  assert.match(source, /dummyLoginPasswordHash/);
  assert.match(source, /clearCookie\('neurocrop_session', sessionCookieClearOptions\(\)\)/);
});

test('invitation acceptance is rate limited before reserving a database connection', () => {
  const source = fs.readFileSync(new URL('../team-routes.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf("app.post('/auth/accept-invite'");
  const route = source.slice(routeStart);
  assert.ok(routeStart >= 0);
  assert.match(route, /invitationAcceptanceLimiter\.isLimited\(attemptKey\)/);
  assert.ok(route.indexOf('invitationAcceptanceLimiter.isLimited(attemptKey)') < route.indexOf('client = await pool.connect()'));
});

test('invitation creation serializes duplicate checks and does not expose provider errors', () => {
  const teamSource = fs.readFileSync(new URL('../team-routes.js', import.meta.url), 'utf8');
  const routeStart = teamSource.indexOf("app.post('/invitations'");
  const route = teamSource.slice(routeStart, teamSource.indexOf("app.delete('/invitations/", routeStart));
  assert.match(route, /pg_advisory_xact_lock/);
  assert.ok(route.indexOf('BEGIN') < route.indexOf('activeInvitationRows'));
  assert.ok(route.indexOf("client.query('COMMIT')") < route.indexOf('sendInvitationEmail'));
  assert.match(route, /error: 'Email delivery failed'/);
  assert.doesNotMatch(route, /emailDelivery = \{ sent: false, error: error\.message \}/);

  const organizationSource = fs.readFileSync(new URL('../organization-routes.js', import.meta.url), 'utf8');
  assert.doesNotMatch(organizationSource, /emailDelivery = \{ sent: false, error: error\.message \}/);
});

test('database connection acquisition stays inside route error boundaries', () => {
  for (const filename of ['api.js', 'team-routes.js', 'organization-routes.js']) {
    const source = fs.readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');
    assert.equal(/const client = await pool\.connect\(\)/.test(source), false, `${filename} acquires an unguarded client`);
  }

  const api = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  for (const routeName of ["/readings/latest", "/history", "/exports/measurements.csv", "/nodes/register"]) {
    const routeStart = api.indexOf(`app.get('${routeName}'`) >= 0
      ? api.indexOf(`app.get('${routeName}'`)
      : api.indexOf(`app.post('${routeName}'`);
    const route = api.slice(routeStart, routeStart + 900);
    assert.ok(route.indexOf('try {') >= 0 && route.indexOf('try {') < route.indexOf('await getSectionById'), `${routeName} must guard its first database query`);
  }
});

test('VPD history is aggregated in PostgreSQL instead of loading every raw row into Node', () => {
  const source = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  assert.match(source, /const VPD_SQL_EXPRESSION/);
  assert.match(source, /percentile_cont\(0\.5\) WITHIN GROUP \(ORDER BY \$\{VPD_SQL_EXPRESSION\}\)/);
  assert.equal(/SELECT time, temperature, humidity\s+FROM measurements/.test(source), false);
});

test('ingestion normalizes device identity, deduplicates MQTT deliveries and commits atomically', () => {
  const source = fs.readFileSync(new URL('../ingest.js', import.meta.url), 'utf8');
  assert.match(source, /String\(dev\.devEui \|\| ''\)\.trim\(\)\.toLowerCase\(\)/);
  assert.match(source, /pg_advisory_xact_lock\(hashtext\(\$1\)\)/);
  assert.match(source, /ON CONFLICT \(dev_eui, time\) DO NOTHING/);
  assert.ok(source.indexOf('await runMigrations()') < source.indexOf('mqtt.connect(MQTT_URL)'));
  assert.ok(source.indexOf("dbClient.query('BEGIN')") < source.indexOf('UPDATE nodes SET'));
  assert.ok(source.indexOf('INSERT INTO measurements') < source.indexOf("dbClient.query('COMMIT')"));
});

test('API and ingestion workers close gracefully on Docker SIGTERM', () => {
  const api = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  const ingest = fs.readFileSync(new URL('../ingest.js', import.meta.url), 'utf8');
  assert.match(api, /process\.on\('SIGTERM'/);
  assert.match(api, /server\.close\(resolve\)/);
  assert.match(ingest, /process\.on\('SIGTERM'/);
  assert.match(ingest, /client\.end\(false, \{\}, resolve\)/);
});

test('server errors do not expose internal details', () => {
  assert.deepEqual(publicError(new Error('password=secret relation users')), {
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Internal server error'
  });
  assert.equal(publicError(Object.assign(new Error('Invalid range'), { status: 400 })).message, 'Invalid range');
});

test('invitation links preserve revoked, expired and accepted states', () => {
  const now = new Date('2026-07-22T10:00:00Z');
  const pending = { expires_at: '2026-07-23T10:00:00Z', organization_status: 'active' };
  assert.equal(invitationState(pending, now), 'pending');
  assert.equal(invitationState({ ...pending, revoked_at: '2026-07-22T09:00:00Z' }, now), 'revoked');
  assert.equal(invitationState({ ...pending, accepted_at: '2026-07-22T09:00:00Z' }, now), 'accepted');
  assert.equal(invitationState({ ...pending, expires_at: '2026-07-22T09:59:59Z' }, now), 'expired');
  assert.equal(invitationState({ ...pending, organization_status: 'archived' }, now), 'unavailable');
  assert.equal(invitationState(null, now), 'invalid');
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
  assert.match(validateCropProfileMetrics({ airTemp: { optimal: [null, 24] } }), /increasing/);
  assert.match(validateCropProfileMetrics({ airTemp: { optimal: ['', 24] } }), /increasing/);
  assert.match(validateCropProfileMetrics({ airTemp: { optimal: [false, 24] } }), /increasing/);
  assert.equal(validateCropProfileMetrics({ vpd: { optimal: [0.8, 1.2], scoreWeight: 1.5 } }), null);
  assert.match(validateCropProfileMetrics({ vpd: { optimal: [0.8, 1.2], scoreWeight: null } }), /between 0 and 3/);
  assert.match(validateCropProfileMetrics({ vpd: { optimal: [0.8, 1.2], scoreWeight: 4 } }), /between 0 and 3/);
});

test('lighting schedules are validated without exposing hardware assumptions', () => {
  assert.equal(validateCropProfileMetrics({ lux: { optimal: [10000, 30000], lightingSchedule: { enabled: true, start: '06:00', end: '22:00', darkThresholdLux: 100 } } }), null);
  assert.match(validateCropProfileMetrics({ lux: { optimal: [10000, 30000], lightingSchedule: { enabled: true, start: '25:00', end: '22:00' } } }), /HH:MM/);
  assert.match(validateCropProfileMetrics({ lux: { optimal: [10000, 30000], lightingSchedule: { darkThresholdLux: null } } }), /zero or greater/);
  assert.match(validateCropProfileMetrics({ lux: { optimal: [10000, 30000], lightingSchedule: { darkThresholdLux: -1 } } }), /zero or greater/);
});

test('score rules use saved optimal ranges and automatic alert bands', () => {
  const rules = buildScoreRules({ airTemp: { optimal: [18, 22] } });
  assert.deepEqual(rules.airTemp.warning, [16, 24]);
  assert.deepEqual(rules.airTemp.critical, [14, 26]);
  assert.equal(evaluateMetricValue('airTemp', 23, rules).state, 'warning');
  assert.equal(evaluateMetricValue('airTemp', 27, rules).state, 'critical');
  assert.equal(evaluateMetricValue('airTemp', null, rules), null);
  assert.equal(evaluateMetricValue('airTemp', false, rules), null);
  assert.deepEqual(buildScoreRules({ airTemp: { optimal: [null, 22] } }).airTemp.optimal, [22, 26]);
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

test('instantaneous light is a context metric, not a score penalty', () => {
  const contextualOnly = buildScoreFromMetricValues({ lux: 0 });
  const withOptimalClimate = buildScoreFromMetricValues({ airTemp: 24, lux: 0 });
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

test('today actions exclude context-only light deviations', () => {
  const actions = buildTodayActions([{
    section: { id: 'section-1', name: 'North block' },
    profileMetrics: {},
    scoreRules: {
      lux: { growth: false, optimal: [10000, 30000] }
    },
    evaluations: [
      { metricId: 'lux', state: 'critical', severity: 1, direction: 'low', value: 0 }
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

test('completed actions wait for a metric-specific verification window and enough samples', () => {
  const action = { metricId: 'humidity', value: 88, target: [60, 70] };
  const feedback = { status: 'completed', createdAt: '2026-07-14T12:00:00Z' };
  const samples = [
    { value: 80, observedAt: '2026-07-14T12:10:00Z' },
    { value: 76, observedAt: '2026-07-14T12:20:00Z' },
    { value: 72, observedAt: '2026-07-14T12:30:00Z' }
  ];

  const tooEarly = evaluateActionOutcome(action, feedback, { samples }, '2026-07-14T12:05:00Z');
  assert.equal(tooEarly.state, 'awaiting_data');
  assert.equal(tooEarly.requiredSampleCount, 3);

  const collecting = evaluateActionOutcome(action, feedback, { samples: samples.slice(0, 2) }, '2026-07-14T12:30:00Z');
  assert.equal(collecting.state, 'awaiting_data');
  assert.equal(collecting.sampleCount, 2);

  const expired = evaluateActionOutcome(action, feedback, { samples: samples.slice(0, 2) }, '2026-07-14T13:01:00Z');
  assert.equal(expired.state, 'insufficient_data');

  const improving = evaluateActionOutcome(action, feedback, { samples }, '2026-07-14T12:31:00Z');
  assert.equal(improving.state, 'improving');
  assert.equal(improving.baselineValue, 88);
  assert.equal(improving.currentValue, 76);
  assert.equal(improving.sampleCount, 3);
  assert.equal(evaluateActionOutcome(action, { ...feedback, status: 'deferred' }, {}).state, 'not_applicable');
});

test('action verification never interprets missing values as a real zero', () => {
  const outcome = evaluateActionOutcome(
    { metricId: 'humidity', value: null, target: [60, 70] },
    { status: 'completed', createdAt: '2026-07-14T12:00:00Z' },
    { samples: [
      { value: null, observedAt: '2026-07-14T12:10:00Z' },
      { value: '', observedAt: '2026-07-14T12:20:00Z' },
      { value: false, observedAt: '2026-07-14T12:30:00Z' }
    ] },
    '2026-07-14T13:01:00Z'
  );
  assert.equal(outcome.baselineValue, null);
  assert.equal(outcome.currentValue, null);
  assert.equal(outcome.sampleCount, 0);
  assert.equal(outcome.state, 'insufficient_data');
});

test('action verification uses a stable median and ignores later unrelated recovery', () => {
  const action = { metricId: 'humidity', value: 88, target: [60, 70] };
  const feedback = { status: 'completed', createdAt: '2026-07-14T12:00:00Z' };
  const outcome = evaluateActionOutcome(action, feedback, { samples: [
    { value: 76, observedAt: '2026-07-14T12:10:00Z' },
    { value: 200, observedAt: '2026-07-14T12:20:00Z' },
    { value: 72, observedAt: '2026-07-14T12:30:00Z' },
    { value: 68, observedAt: '2026-07-14T12:40:00Z' }
  ] }, '2026-07-14T13:30:00Z');

  assert.equal(outcome.state, 'improving');
  assert.equal(outcome.currentValue, 76);
  assert.equal(outcome.observedAt, '2026-07-14T12:30:00Z');
  assert.equal(outcome.method, 'median-first-qualified-samples');
});

test('action verification separates target reached, sensor noise and worsening', () => {
  const action = { metricId: 'humidity', value: 88, target: [60, 70] };
  const feedback = { status: 'completed', createdAt: '2026-07-14T12:00:00Z' };
  const evidence = (values) => ({ samples: values.map((value, index) => ({
    value,
    observedAt: `2026-07-14T12:${10 + index * 10}:00Z`
  })) });

  assert.equal(evaluateActionOutcome(action, feedback, evidence([69, 68, 67]), '2026-07-14T12:31:00Z').state, 'target_reached');
  assert.equal(evaluateActionOutcome(action, feedback, evidence([87.5, 88, 88.5]), '2026-07-14T12:31:00Z').state, 'unchanged');
  assert.equal(evaluateActionOutcome(action, feedback, evidence([90, 92, 94]), '2026-07-14T12:31:00Z').state, 'worsened');
  assert.deepEqual(getActionVerificationPolicy('vpd'), {
    delayMinutes: 10,
    windowMinutes: 60,
    minSamples: 3,
    noiseFloor: 0.03
  });
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

test('all supported product parameters have explicit scoring or context-only rules', () => {
  const persistedMetrics = [
    'airTemp', 'humidity', 'co2', 'lux', 'soilTemp', 'vpd', 'soilMoisture',
    'ec', 'ph', 'leafTemp', 'soilEc', 'waterTemp'
  ];
  const rules = buildScoreRules({});
  assert.equal(rules.lux.growth, false);
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

test('coverage accepts boolean-like presence values from older decoders', () => {
  const now = new Date().toISOString();
  const state = buildSectionDashboardState(
    [{ last_received_at: now, last_sensor_presence: { sht45: 'true', scd41: '1' } }],
    [{
      time: now,
      temperature: 24,
      humidity: 65,
      raw_object: { expected_uplink_interval_s: 300, sensors: { sht45: { present: 'true' } } }
    }],
    {}
  );
  assert.equal(state.coverage.liveMetrics, 3);
  assert.equal(state.coverage.expectedMetrics, 4);
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
  assert.match(route, /n\.organization_id=af\.organization_id/);
  assert.match(route, /evaluateActionOutcome/);
  assert.match(route, /metricSeriesSnapshot/);
  assert.match(route, /INTERVAL '4 hours'/);
  assert.match(route, /DISTINCT ON \(action_id, COALESCE\(action_payload->>'observedAt'/);
});

test('latest readings expose a one-hour change from a bounded historical baseline', () => {
  const source = fs.readFileSync(new URL('../api.js', import.meta.url), 'utf8');
  const routeStart = source.indexOf("app.get('/readings/latest'");
  const route = source.slice(routeStart, source.indexOf("function historicalSensorPresenceCondition", routeStart));
  assert.ok(routeStart >= 0);
  assert.match(route, /INTERVAL '1 hour'/);
  assert.match(route, /INTERVAL '80 minutes'/);
  assert.match(route, /INTERVAL '40 minutes'/);
  assert.match(route, /oneHourBaselineSourcesByMetric/);
  assert.match(route, /change1h:/);
});
