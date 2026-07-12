import mqtt from 'mqtt';
import { query, pool } from './db.js';

const MQTT_URL = process.env.MQTT_URL || 'mqtt://mosquitto:1883';
const MQTT_TOPIC = process.env.MQTT_TOPIC || 'application/+/device/+/event/up';

const client = mqtt.connect(MQTT_URL);

client.on('connect', () => {
  console.log(`[ingest] prisijungta prie MQTT: ${MQTT_URL}`);
  client.subscribe(MQTT_TOPIC, (err) => {
    if (err) { console.error('[ingest] subscribe klaida:', err.message); process.exit(1); }
    console.log(`[ingest] klausomasi: ${MQTT_TOPIC}`);
  });
});
client.on('error', (err) => console.error('[ingest] MQTT klaida:', err.message));

client.on('message', async (topic, payload) => {
  let msg;
  try { msg = JSON.parse(payload.toString()); }
  catch (e) { console.error('[ingest] JSON klaida:', e.message); return; }
  try { await handleUplink(msg); }
  catch (e) { console.error('[ingest] irasymo klaida:', e.message); }
});

async function handleUplink(msg) {
  const dev = msg.deviceInfo || {};
  const devEui = dev.devEui;
  if (!devEui) return;
  const obj = msg.object || {};
  // LoRa node does not send an independent observation timestamp, so receive time is canonical.
  const receivedAt = msg.time ? new Date(msg.time) : new Date();
  const time = receivedAt;
  const rx = Array.isArray(msg.rxInfo) && msg.rxInfo.length ? msg.rxInfo[0] : {};
  const sf = msg.txInfo?.modulation?.lora?.spreadingFactor ?? null;
  const adaptive = obj.adaptive || {};
  const ec = obj.error_counters || {};
  const sensorPresence = Object.fromEntries(
    Object.entries(obj.sensors || {}).map(([sensor, state]) => [sensor, Boolean(state?.present)])
  );

  // Ingestion never creates inventory records: a device must first be registered.
  const { rows: updatedNodes } = await query(
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
       last_error_counters=$15::jsonb
     WHERE lower(dev_eui)=lower($1)
       AND (last_received_at IS NULL OR last_received_at <= $4)
     RETURNING dev_eui`,
    [
      devEui, n(obj.firmware_build), time, receivedAt, dev.deviceName || null,
      n(obj.battery_mv), n(obj.battery_percent), obj.firmware_version ?? null, adaptive.profile ?? null,
      n(rx.rssi), n(rx.snr), sf, JSON.stringify(sensorPresence),
      JSON.stringify(obj.error_flags || {}), JSON.stringify(ec)
    ]
  );
  if (!updatedNodes[0]) {
    const { rows: knownNodes } = await query(
      'SELECT 1 FROM nodes WHERE lower(dev_eui)=lower($1)',
      [devEui]
    );
    if (!knownNodes[0]) {
      console.warn(`[ingest] ignored unregistered device ${devEui}`);
      return;
    }
  }
  await query(
    `INSERT INTO measurements (
        time,dev_eui,temperature,humidity,co2,lux,soil_temperature,
        battery_mv,battery_percent,firmware_build,profile,battery_critical,
        vpd_out_of_range,err_read_fail,err_reinit,err_tx_fail,rssi,snr,
        spreading_factor,raw_object,received_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
    [time, devEui, n(obj.temperature), n(obj.humidity), n(obj.co2), n(obj.lux),
     n(obj.soil_temperature), n(obj.battery_mv), n(obj.battery_percent),
     n(obj.firmware_build), adaptive.profile ?? null, adaptive.battery_critical ?? null,
     adaptive.vpd_out_of_range ?? null, n(ec.read_fail), n(ec.reinit), n(ec.tx_fail),
     n(rx.rssi), n(rx.snr), sf, JSON.stringify(obj), receivedAt]
  );
  console.log(`[ingest] ${devEui} temp=${obj.temperature ?? 'NA'} co2=${obj.co2 ?? 'NA'} batt=${obj.battery_percent ?? 'NA'}%`);
}
function n(v) { return (v === undefined || v === null) ? null : v; }

process.on('SIGINT', async () => { client.end(); await pool.end(); process.exit(0); });
