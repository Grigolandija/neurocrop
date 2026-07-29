const DEFAULT_INTERVAL_MS = 60_000;

const METRICS = {
  temperature: { amplitude: 0.6, min: -40, max: 85, digits: 2 },
  humidity: { amplitude: 2, min: 0, max: 100, digits: 2 },
  co2: { amplitude: 35, min: 0, max: 20_000, digits: 0 },
  lux: { amplitude: 0.08, relative: true, min: 0, max: 200_000, digits: 0 },
  soil_temperature: { amplitude: 0.3, min: -40, max: 85, digits: 2 },
  soil_moisture: { amplitude: 1.2, min: 0, max: 100, digits: 2 },
  ec: { amplitude: 0.05, min: 0, max: 20, digits: 3 },
  ph: { amplitude: 0.03, min: 0, max: 14, digits: 3 },
  soil_ec: { amplitude: 0.05, min: 0, max: 20, digits: 3 },
  leaf_temperature: { amplitude: 0.5, min: -40, max: 85, digits: 2 },
  water_temperature: { amplitude: 0.2, min: -40, max: 85, digits: 2 }
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function numeric(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function devicePhase(devEui) {
  return [...String(devEui)].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 360;
}

export function generateSimulatedMeasurement(profile, devEui, now = new Date()) {
  const minute = Math.floor(now.getTime() / DEFAULT_INTERVAL_MS);
  const phase = (devicePhase(devEui) * Math.PI) / 180;
  const wave = Math.sin((minute / 7) + phase);
  const secondaryWave = Math.cos((minute / 13) + phase * 1.7);
  const result = {};

  for (const [metric, rules] of Object.entries(METRICS)) {
    const baseline = numeric(profile?.[metric]);
    const amplitude = rules.relative ? baseline * rules.amplitude : rules.amplitude;
    const value = baseline + amplitude * (wave * 0.72 + secondaryWave * 0.28);
    result[metric] = Number(clamp(value, rules.min, rules.max).toFixed(rules.digits));
  }
  result.soil_ec_depths = [
    { depthCm: 10, value: Number(clamp(result.soil_ec * 0.92 + wave * 0.04, 0, 20).toFixed(3)) },
    { depthCm: 20, value: result.soil_ec },
    { depthCm: 30, value: Number(clamp(result.soil_ec * 1.08 - secondaryWave * 0.04, 0, 20).toFixed(3)) },
  ];

  const batteryPercent = Math.round(clamp(numeric(profile?.battery_percent, 90), 1, 100));
  return {
    ...result,
    battery_percent: batteryPercent,
    battery_mv: Math.round(3000 + batteryPercent * 12),
    rssi: Math.round(-58 + wave * 4),
    snr: Number((8 + secondaryWave * 1.5).toFixed(1)),
    spreading_factor: 7
  };
}

export async function storeSimulatedNodeMeasurements(pool, now = new Date()) {
  const observedAt = new Date(Math.floor(now.getTime() / DEFAULT_INTERVAL_MS) * DEFAULT_INTERVAL_MS);
  const client = await pool.connect();
  let stored = 0;

  try {
    await client.query('BEGIN');
    const { rows: nodes } = await client.query(
      `SELECT dev_eui, factory_serial, simulation_profile
       FROM nodes
       WHERE source='simulated'
         AND factory_status='assigned'
         AND organization_id IS NOT NULL
         AND area_id IS NOT NULL
         AND section_id IS NOT NULL
         AND archived_at IS NULL
         AND simulation_profile IS NOT NULL
       ORDER BY dev_eui`
    );

    for (const node of nodes) {
      const measurement = generateSimulatedMeasurement(node.simulation_profile, node.dev_eui, observedAt);
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [node.dev_eui]);
      const { rows: insertedRows } = await client.query(
        `INSERT INTO measurements (
           time, dev_eui, temperature, humidity, co2, lux, soil_temperature,
           soil_moisture, ec, ph, soil_ec, leaf_temperature, water_temperature,
           air_pressure, battery_mv, battery_percent, firmware_build, profile,
           battery_critical, vpd_out_of_range, err_read_fail, err_reinit,
           err_tx_fail, rssi, snr, spreading_factor, raw_object, received_at
         )
         VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NULL,$14,$15,NULL,
           'normal',$16,false,0,0,0,$17,$18,$19,$20::jsonb,$1
         )
         ON CONFLICT (dev_eui, time) DO NOTHING
         RETURNING time`,
        [
          observedAt, node.dev_eui, measurement.temperature, measurement.humidity,
          measurement.co2, measurement.lux, measurement.soil_temperature,
          measurement.soil_moisture, measurement.ec, measurement.ph,
          measurement.soil_ec, measurement.leaf_temperature,
          measurement.water_temperature, measurement.battery_mv,
          measurement.battery_percent, measurement.battery_percent <= 15,
          measurement.rssi, measurement.snr, measurement.spreading_factor,
          JSON.stringify({ source: 'simulated', serialNumber: node.factory_serial, soil_ec_depths: measurement.soil_ec_depths })
        ]
      );

      if (!insertedRows[0]) continue;
      stored += 1;
      await client.query(
        `UPDATE nodes SET
           last_seen=$2,
           last_received_at=$2,
           last_battery_mv=$3,
           last_battery_percent=$4,
           last_firmware_version='simulator-1.0',
           last_profile='normal',
           last_rssi=$5,
           last_snr=$6,
           last_spreading_factor=$7,
           last_sensor_presence=$8::jsonb,
           last_error_flags='{}'::jsonb,
           last_error_counters='{"read_fail":0,"reinit":0,"tx_fail":0}'::jsonb
         WHERE dev_eui=$1
           AND source='simulated'
           AND factory_status='assigned'
           AND archived_at IS NULL`,
        [
          node.dev_eui, observedAt, measurement.battery_mv,
          measurement.battery_percent, measurement.rssi, measurement.snr,
          measurement.spreading_factor,
          JSON.stringify({
            sht45: true,
            scd41: true,
            bh1750: true,
            ds18b20: true,
            soil_moisture: true,
            ec: true,
            ph: true,
            soil_ec: true,
            leaf_temperature: true,
            water_temperature: true
          })
        ]
      );
    }

    await client.query('COMMIT');
    return stored;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function startSimulatedNodeGenerator(pool, options = {}) {
  const intervalMs = Math.max(10_000, Number(options.intervalMs || process.env.SIMULATED_NODE_INTERVAL_MS || DEFAULT_INTERVAL_MS));
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const stored = await storeSimulatedNodeMeasurements(pool);
      if (stored) console.log(`[simulated-nodes] stored ${stored} measurements`);
    } catch (error) {
      console.error('[simulated-nodes] generation failed:', error.message);
    } finally {
      running = false;
    }
  };

  void tick();
  const timer = setInterval(() => { void tick(); }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
