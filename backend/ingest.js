import fs from 'fs';
import mqtt from 'mqtt';
import { pool } from './db.js';
import { runMigrations } from './migrate.js';
import { normalizeErrorCounters, normalizeErrorFlags } from './node-health.js';
import { startSimulatedNodeGenerator } from './simulated-nodes.js';
import { REGISTERED_TELEMETRY_DEFINITIONS } from './metric-registry.js';
import {
  compactTelemetryMetadata,
  normalizeRegisteredTelemetry,
  normalizeTelemetryBoolean,
  normalizeTelemetryTimestamp,
  normalizeTelemetryValue,
  redactConnectionUrl
} from './telemetry-values.js';

const MQTT_URL = process.env.MQTT_URL || 'mqtt://mosquitto:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'application/+/device/+/event/up';
const READY_FILE = process.env.INGEST_READY_FILE || '/tmp/neurocrop-ingest-ready';
const registeredColumns = REGISTERED_TELEMETRY_DEFINITIONS.map(({ column }) => column);
const registeredPlaceholders = REGISTERED_TELEMETRY_DEFINITIONS.map((_, index) => `$${index + 3}`);
const registeredValueCount = REGISTERED_TELEMETRY_DEFINITIONS.length;

function markReady() {
  fs.writeFileSync(READY_FILE, new Date().toISOString(), { mode: 0o600 });
}

function clearReady() {
  try { fs.unlinkSync(READY_FILE); } catch (error) {
    if (error.code !== 'ENOENT') console.error('[ingest] readiness cleanup failed:', error.message);
  }
}

await runMigrations();
clearReady();
const stopSimulatedNodeGenerator = startSimulatedNodeGenerator(pool);
const client = mqtt.connect(MQTT_URL);

client.on('connect', () => {
  markReady();
  console.log(`[ingest] prisijungta prie MQTT: ${redactConnectionUrl(MQTT_URL)}`);
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) { console.error('[ingest] subscribe klaida:', err.message); process.exit(1); }
    console.log(`[ingest] klausomasi: ${MQTT_TOPIC}`);
  });
});
client.on('error', (err) => console.error('[ingest] MQTT klaida:', err.message));
client.on('offline', clearReady);
client.on('close', clearReady);

const readinessHeartbeat = setInterval(() => {
  if (client.connected) markReady();
  else clearReady();
}, 30_000);
readinessHeartbeat.unref?.();

client.on('message', async (topic, payload) => {
  let msg;
  try { msg = JSON.parse(payload.toString()); }
  catch (e) { console.error('[ingest] JSON klaida:', e.message); return; }
  try { await handleUplink(msg); }
  catch (e) { console.error('[ingest] irasymo klaida:', e.message); }
});

async function handleUplink(msg) {
  const dev = msg.deviceInfo || {};
  const devEui = String(dev.devEui || '').trim().toLowerCase();
  if (!/^[0-9a-f]{16}$/.test(devEui)) {
    console.warn('[ingest] ignored uplink with invalid DevEUI');
    return;
  }
  const obj = msg.object && typeof msg.object === 'object' && !Array.isArray(msg.object) ? msg.object : {};
  // LoRa node does not send an independent observation timestamp, so receive time is canonical.
  const receivedAt = normalizeTelemetryTimestamp(msg.time);
  const time = receivedAt;
  const rx = Array.isArray(msg.rxInfo) && msg.rxInfo.length ? msg.rxInfo[0] : {};
  const gatewayIds = [...new Set(
    (Array.isArray(msg.rxInfo) ? msg.rxInfo : [])
      .map((entry) => String(entry?.gatewayId || '').trim().toLowerCase())
      .filter((value) => /^[0-9a-f]{16}$/.test(value))
  )];
  const sf = msg.txInfo?.modulation?.lora?.spreadingFactor ?? null;
  const adaptive = obj.adaptive || {};
  const errorFlags = normalizeErrorFlags(obj.error_flags);
  const ec = normalizeErrorCounters(obj.error_counters, errorFlags);
  const historicalMetadata = compactTelemetryMetadata(obj, errorFlags);
  const telemetry = normalizeRegisteredTelemetry(obj);
  const sensorPresence = Object.fromEntries(
    Object.entries(obj.sensors || {}).map(([sensor, state]) => [sensor, normalizeTelemetryBoolean(state?.present) === true])
  );

  const dbClient = await pool.connect();
  let inserted = false;
  try {
    await dbClient.query('BEGIN');
    // Serializing a device stream makes duplicate-delivery checks race-safe.
    await dbClient.query('SELECT pg_advisory_xact_lock(hashtext($1))', [devEui]);

    // Ingestion never creates inventory records: a device must first be registered.
    const { rows: updatedNodes } = await dbClient.query(
      `UPDATE nodes SET
         firmware_build=COALESCE($2, firmware_build),
         last_seen=$3,
         last_received_at=$4,
         name=COALESCE(name, $5),
         last_battery_mv=COALESCE($6, last_battery_mv),
         last_battery_percent=COALESCE($7, last_battery_percent),
         last_firmware_version=COALESCE($8, last_firmware_version),
         last_profile=COALESCE($9, last_profile),
         last_rssi=$10,
         last_snr=$11,
         last_spreading_factor=$12,
         last_sensor_presence=$13::jsonb,
         last_error_flags=$14::jsonb,
         last_error_counters=$15::jsonb,
         last_gateway_ids=CASE
           WHEN cardinality($16::text[]) > 0 THEN $16::text[]
           ELSE last_gateway_ids
         END
       WHERE lower(dev_eui)=lower($1)
         AND archived_at IS NULL
         AND (last_received_at IS NULL OR last_received_at <= $4)
       RETURNING dev_eui`,
      [
        devEui, normalizeTelemetryValue('firmware_build', obj.firmware_build), time, receivedAt, dev.deviceName || null,
        normalizeTelemetryValue('battery_mv', obj.battery_mv), telemetry.battery_percent, obj.firmware_version ?? null, adaptive.profile ?? null,
        normalizeTelemetryValue('rssi', rx.rssi), normalizeTelemetryValue('snr', rx.snr), normalizeTelemetryValue('spreading_factor', sf), JSON.stringify(sensorPresence),
        JSON.stringify(errorFlags), JSON.stringify(ec), gatewayIds
      ]
    );
    if (!updatedNodes[0]) {
      const { rows: knownNodes } = await dbClient.query(
        'SELECT archived_at FROM nodes WHERE lower(dev_eui)=lower($1)',
        [devEui]
      );
      if (!knownNodes[0] || knownNodes[0].archived_at) {
        await dbClient.query('ROLLBACK');
        console.warn(`[ingest] ignored ${knownNodes[0] ? 'archived' : 'unregistered'} device ${devEui}`);
        return;
      }
    }

    const { rows: insertedRows } = await dbClient.query(
      `INSERT INTO measurements (
          time,dev_eui,${registeredColumns.join(',')},air_pressure,
          battery_mv,firmware_build,profile,battery_critical,
          vpd_out_of_range,err_read_fail,err_reinit,err_tx_fail,rssi,snr,
          spreading_factor,raw_object,received_at)
       VALUES ($1,$2,${registeredPlaceholders.join(',')},${Array.from(
         { length: 14 },
         (_, index) => `$${registeredValueCount + index + 3}`
       ).join(',')})
       ON CONFLICT (dev_eui, time) DO NOTHING
       RETURNING time`,
      [time, devEui, ...REGISTERED_TELEMETRY_DEFINITIONS.map(({ telemetryKey }) => telemetry[telemetryKey]),
       normalizeTelemetryValue('air_pressure', obj.air_pressure),
       normalizeTelemetryValue('battery_mv', obj.battery_mv),
       normalizeTelemetryValue('firmware_build', obj.firmware_build), adaptive.profile ?? null, normalizeTelemetryBoolean(adaptive.battery_critical),
       normalizeTelemetryBoolean(adaptive.vpd_out_of_range), normalizeTelemetryValue('error_counter', ec.read_fail), normalizeTelemetryValue('error_counter', ec.reinit), normalizeTelemetryValue('error_counter', ec.tx_fail),
       normalizeTelemetryValue('rssi', rx.rssi), normalizeTelemetryValue('snr', rx.snr), normalizeTelemetryValue('spreading_factor', sf), JSON.stringify(historicalMetadata), receivedAt]
    );
    inserted = Boolean(insertedRows[0]);
    await dbClient.query('COMMIT');
  } catch (error) {
    await dbClient.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    dbClient.release();
  }
  if (!inserted) return;
  console.log(`[ingest] stored uplink for ${devEui}`);
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[ingest] ${signal}: shutting down`);
  clearInterval(readinessHeartbeat);
  stopSimulatedNodeGenerator();
  clearReady();
  await new Promise((resolve) => client.end(false, {}, resolve));
  await pool.end();
}
process.on('SIGINT', () => { void shutdown('SIGINT'); });
process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
