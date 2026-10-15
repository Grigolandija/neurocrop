import assert from 'node:assert/strict';
import test from 'node:test';
import { buildUplinkProvenance } from '../uplink-provenance.js';
import { compactTelemetryMetadata, normalizeRegisteredTelemetry } from '../telemetry-values.js';
import { buildNodeSupport } from '../node-health.js';
import { evaluateNodeAcceptance } from '../node-acceptance.js';

const start = new Date('2026-10-15T10:00:00Z');
const object = { firmware_version: '2.1.7', temperature: 22, humidity: 60,
  sensors: { sht45: { present: true, fresh: true } } };
function record(overrides = {}) {
  const msg = { time: start.toISOString(), deviceInfo: { devEui: '0000000000000001', tags: { secret: 'not-for-storage' } },
    deduplicationId: 'uplink-1', fCnt: 12, fPort: 1, data: 'AQID', object, ...overrides };
  return buildUplinkProvenance(msg, { devEui: msg.deviceInfo.devEui, time: start, receivedAt: start,
    telemetry: normalizeRegisteredTelemetry(msg.object), metadata: compactTelemetryMetadata(msg.object) });
}
test('trace distinguishes fresh, cached, invalid and absent measurements without leaking tags or credentials', () => {
  const r = record({ object: { ...object, appKey: 'never-store', co2: 999999, sensors: { scd41: { present: true }, sht45: { present: true, fresh: false } } } });
  assert.equal(r.evidence.metrics.temperature.reason, 'not_new_measurement');
  assert.equal(r.evidence.metrics.temperature.value, null);
  assert.equal(r.evidence.metrics.co2.reason, 'invalid_value');
  assert.equal(r.evidence.metrics.lux.reason, 'not_reported');
  assert.equal(record().evidence.metrics.temperature.reason, 'accepted');
  assert.equal(r.rawPayload, 'AQID');
  assert.equal(record({ data: 'not base64!' }).rawPayload, null);
  assert.equal(record({ object: { ...object, decoder_version: 'codec-3' } }).decoderVersion, 'codec-3');
  assert.equal(record().decoderVersion, null);
  assert.doesNotMatch(JSON.stringify(r), /not-for-storage|never-store|appKey|tags/);
  assert.equal(record({ rxInfo: [{ gatewayId: '0011223344556677' }] }).id, record().id);
  assert.notEqual(record({ deduplicationId: 'uplink-2' }).id, record().id);
  const malformed = record({ rxInfo: [null, 1, { gatewayId: 1234567890123456 }, { gatewayId: 'ABCDEF1234567890', rssi: -80 }] });
  assert.equal(malformed.evidence.gateways[0].id, null);
  assert.equal(malformed.evidence.gateways[1].id, 'abcdef1234567890');
});

test('support separates gateway evidence, node connection, sensor errors and unknown causes', () => {
  const now = +start, node = { last_profile: 'normal', last_received_at: new Date(now - 3600000).toISOString() };
  assert.equal(buildNodeSupport(node, now).code, 'connection_unknown');
  const gateways = [{ lastSeenAt: start.toISOString() }];
  assert.equal(buildNodeSupport({ ...node, receiving_gateways: gateways }, now).code, 'node_unavailable');
  assert.equal(buildNodeSupport({ ...node, receiving_gateways: [{ lastSeenAt: node.last_received_at }] }, now).code, 'gateway_unavailable');
  assert.equal(buildNodeSupport({ ...node, receiving_gateways: [{ lastSeenAt: node.last_received_at }, { lastSeenAt: null }] }, now).code, 'connection_unknown');
  assert.equal(buildNodeSupport({ ...node, last_received_at: start, last_error_flags: { sensor_missing: true } }, now).code, 'sensor_unavailable');
  assert.equal(buildNodeSupport({}, now).code, 'never_received');
  assert.equal(buildNodeSupport(node, now).elapsedIntervals, 12);
  assert.equal(buildNodeSupport({ ...node, last_uplink_interval_sec: 900 }, now).expectedIntervalSec, 900);
  assert.equal(buildNodeSupport({ ...node, last_uplink_interval_sec: true }, now).expectedIntervalSec, 300);
});

test('acceptance requires a new, in-window, correctly decoded firmware-matching uplink with expected sensors', () => {
  const run = { status: 'pending', started_at: start, deadline_at: new Date(+start + 600000),
    expected_firmware: '2.1.7', expected_sensors: ['sht45'] };
  const event = { ...record(), received_at: start, recorded_at: start, measured_at: start, firmware_version: '2.1.7', outcome: 'stored' };
  const evaluate = e => evaluateNodeAcceptance(run, e, new Date(+start + 10000));
  assert.equal(evaluate(event).status, 'passed');
  assert.equal(evaluate(null).status, 'pending');
  assert.equal(evaluate({ ...event, measured_at: new Date(+start - 1) }).status, 'pending');
  assert.equal(evaluate({ ...event, recorded_at: new Date(+start - 1) }).status, 'pending');
  assert.equal(evaluate({ ...event, received_at: new Date(+start + 600001) }).status, 'pending');
  assert.equal(evaluate({ ...event, firmware_version: '2.1.6' }).status, 'pending');
  assert.equal(evaluate({ ...event, outcome: 'measurement_duplicate' }).status, 'pending');
  for (const flag of ['sensor_missing', 'battery_critical', 'boot_fault']) {
    const r = record({ object: { ...object, error_flags: { [flag]: true } } });
    assert.equal(evaluate({ ...event, evidence: r.evidence }).status, 'pending');
  }
  const stale = record({ object: { ...object, sensors: { sht45: { present: true, fresh: false } } } });
  assert.equal(evaluate({ ...event, evidence: stale.evidence }).status, 'pending');
  assert.equal(evaluateNodeAcceptance(run, null, run.deadline_at).status, 'failed');
  assert.equal(evaluateNodeAcceptance({ ...run, status: 'failed', result: { reason: 'superseded' } }, event).status, 'failed');
  assert.equal(evaluateNodeAcceptance({ ...run, expected_sensors: ['sht45', 'scd41'] }, event, start).status, 'pending');
});
