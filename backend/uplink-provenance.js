import { createHash } from 'node:crypto';
import { METRIC_DEFINITIONS, REGISTERED_TELEMETRY_DEFINITIONS } from './metric-registry.js';
import { normalizeTelemetryValue, sensorHasNewMeasurement } from './telemetry-values.js';
import { normalizeErrorFlags } from './node-health.js';

export const NORMALIZER_VERSION = 'telemetry-1';
const shortText = value => typeof value === 'string' && value.trim().length <= 128 ? value.trim() || null : null;
const integer = (value, max) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= max ? value : null;

export function uplinkRadioEvidence(value) {
  return (Array.isArray(value) ? value : []).filter(rx => rx && typeof rx === 'object' && !Array.isArray(rx)).slice(0, 32)
    .map(rx => ({ id: typeof rx.gatewayId === 'string' && /^[0-9a-f]{16}$/i.test(rx.gatewayId) ? rx.gatewayId.toLowerCase() : null,
      rssi: normalizeTelemetryValue('rssi', rx.rssi), snr: normalizeTelemetryValue('snr', rx.snr) }));
}

export function buildUplinkProvenance(msg, { devEui, receivedAt, time, metadata, telemetry }) {
  const obj = msg.object || {};
  const sourceEventId = shortText(msg.deduplicationId);
  const rawPayload = typeof msg.data === 'string' && msg.data.length <= 4096
    && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(msg.data) ? msg.data : null;
  const frameCounter = integer(msg.fCnt, 0xffffffff), fPort = integer(msg.fPort, 255);
  const identity = sourceEventId ? [devEui, sourceEventId]
    : [devEui, receivedAt.toISOString(), time.toISOString(), frameCounter, fPort, rawPayload];
  const id = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
  const metrics = Object.fromEntries(REGISTERED_TELEMETRY_DEFINITIONS.map(({ telemetryKey, metricId }) => {
    const sensorKey = METRIC_DEFINITIONS[metricId].sensorKey;
    const state = obj.sensors?.[sensorKey];
    const supplied = obj[telemetryKey] !== undefined && obj[telemetryKey] !== null;
    const reason = !sensorHasNewMeasurement(state) ? 'not_new_measurement'
      : !supplied ? 'not_reported' : normalizeTelemetryValue(telemetryKey, obj[telemetryKey]) === null ? 'invalid_value' : 'accepted';
    return [telemetryKey, { value: telemetry[telemetryKey], reason }];
  }));
  // Whitelist evidence; deviceInfo tags, credentials and arbitrary decoded fields are never persisted.
  return { id, sourceEventId, rawPayload, frameCounter, fPort,
    firmwareVersion: shortText(obj.firmware_version), decoderVersion: shortText(obj.decoder_version),
    evidence: { metrics, sensors: metadata.sensors || {}, errorFlags: normalizeErrorFlags(obj.error_flags),
      expectedIntervalSec: normalizeTelemetryValue('expected_uplink_interval_s', obj.expected_uplink_interval_s),
      timestampSource: obj.measured_at != null || msg.deviceMeasuredAt != null ? 'device' : 'network',
      gateways: uplinkRadioEvidence(msg.rxInfo) } };
}

export async function storeUplinkProvenance(client, record, { devEui, receivedAt, time, organizationId, inserted }) {
  await client.query(`INSERT INTO uplink_events
    (id,dev_eui,organization_id,received_at,measured_at,source_event_id,frame_counter,f_port,
     raw_payload,firmware_version,decoder_version,normalizer_version,outcome,evidence)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
    ON CONFLICT(id) DO NOTHING`, [record.id, devEui, organizationId, receivedAt, time, record.sourceEventId,
    record.frameCounter, record.fPort, record.rawPayload, record.firmwareVersion, record.decoderVersion,
    NORMALIZER_VERSION, inserted ? 'stored' : 'measurement_duplicate', record.evidence]);
}
