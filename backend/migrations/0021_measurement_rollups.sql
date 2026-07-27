-- Bounded raw retention protects storage, while these per-node rollups keep
-- Trends and historical climate maps fast as telemetry volume grows.
CREATE TABLE IF NOT EXISTS measurement_rollups (
  bucket_minutes SMALLINT NOT NULL CHECK (bucket_minutes IN (10, 60)),
  bucket_start TIMESTAMPTZ NOT NULL,
  dev_eui TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  measured_at TIMESTAMPTZ NOT NULL,
  temperature_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  temperature_count INTEGER NOT NULL DEFAULT 0,
  humidity_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  humidity_count INTEGER NOT NULL DEFAULT 0,
  co2_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  co2_count INTEGER NOT NULL DEFAULT 0,
  lux_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  lux_count INTEGER NOT NULL DEFAULT 0,
  lux_max DOUBLE PRECISION,
  soil_temperature_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  soil_temperature_count INTEGER NOT NULL DEFAULT 0,
  soil_moisture_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  soil_moisture_count INTEGER NOT NULL DEFAULT 0,
  ec_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  ec_count INTEGER NOT NULL DEFAULT 0,
  ph_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  ph_count INTEGER NOT NULL DEFAULT 0,
  soil_ec_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  soil_ec_count INTEGER NOT NULL DEFAULT 0,
  leaf_temperature_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  leaf_temperature_count INTEGER NOT NULL DEFAULT 0,
  water_temperature_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  water_temperature_count INTEGER NOT NULL DEFAULT 0,
  battery_percent_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  battery_percent_count INTEGER NOT NULL DEFAULT 0,
  vpd_sum DOUBLE PRECISION NOT NULL DEFAULT 0,
  vpd_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_minutes, dev_eui, bucket_start),
  CONSTRAINT measurement_rollups_node_fkey
    FOREIGN KEY (dev_eui) REFERENCES nodes(dev_eui)
    ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_measurement_rollups_retention
  ON measurement_rollups (bucket_minutes, bucket_start);

CREATE OR REPLACE FUNCTION measurement_sensor_available(payload JSONB, sensor_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT payload->'sensors'->sensor_key->>'present' IS NULL
    OR lower(payload->'sensors'->sensor_key->>'present') IN ('true', '1');
$$;

-- Prevent an uplink from landing between the backfill snapshot and trigger
-- installation. The migration is transactional, so ingestion resumes with the
-- trigger active after commit.
LOCK TABLE measurements IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO measurement_rollups (
  bucket_minutes, bucket_start, dev_eui, sample_count, measured_at,
  temperature_sum, temperature_count,
  humidity_sum, humidity_count,
  co2_sum, co2_count,
  lux_sum, lux_count, lux_max,
  soil_temperature_sum, soil_temperature_count,
  soil_moisture_sum, soil_moisture_count,
  ec_sum, ec_count,
  ph_sum, ph_count,
  soil_ec_sum, soil_ec_count,
  leaf_temperature_sum, leaf_temperature_count,
  water_temperature_sum, water_temperature_count,
  battery_percent_sum, battery_percent_count,
  vpd_sum, vpd_count
)
SELECT
  resolution.bucket_minutes,
  to_timestamp(
    floor(extract(epoch FROM measurement.time) / (resolution.bucket_minutes * 60))
    * (resolution.bucket_minutes * 60)
  ) AS bucket_start,
  measurement.dev_eui,
  COUNT(*)::integer,
  MAX(measurement.time),
  COALESCE(SUM(measurement.temperature)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'sht45')), 0),
  COUNT(measurement.temperature)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'sht45'))::integer,
  COALESCE(SUM(measurement.humidity)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'sht45')), 0),
  COUNT(measurement.humidity)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'sht45'))::integer,
  COALESCE(SUM(measurement.co2)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'scd41')), 0),
  COUNT(measurement.co2)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'scd41'))::integer,
  COALESCE(SUM(measurement.lux)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'bh1750')), 0),
  COUNT(measurement.lux)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'bh1750'))::integer,
  MAX(measurement.lux)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'bh1750')),
  COALESCE(SUM(measurement.soil_temperature)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'ds18b20')), 0),
  COUNT(measurement.soil_temperature)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'ds18b20'))::integer,
  COALESCE(SUM(measurement.soil_moisture)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'soil_moisture_probe')), 0),
  COUNT(measurement.soil_moisture)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'soil_moisture_probe'))::integer,
  COALESCE(SUM(measurement.ec)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'ec_probe')), 0),
  COUNT(measurement.ec)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'ec_probe'))::integer,
  COALESCE(SUM(measurement.ph)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'ph_probe')), 0),
  COUNT(measurement.ph)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'ph_probe'))::integer,
  COALESCE(SUM(measurement.soil_ec)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'soil_ec_probe')), 0),
  COUNT(measurement.soil_ec)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'soil_ec_probe'))::integer,
  COALESCE(SUM(measurement.leaf_temperature)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'leaf_temperature_probe')), 0),
  COUNT(measurement.leaf_temperature)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'leaf_temperature_probe'))::integer,
  COALESCE(SUM(measurement.water_temperature)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'water_temperature_probe')), 0),
  COUNT(measurement.water_temperature)
    FILTER (WHERE measurement_sensor_available(measurement.raw_object, 'water_temperature_probe'))::integer,
  COALESCE(SUM(measurement.battery_percent), 0),
  COUNT(measurement.battery_percent)::integer,
  COALESCE(SUM(
    0.6108::double precision
    * exp((17.27 * measurement.temperature::double precision)
      / (measurement.temperature::double precision + 237.3))
    * (1.0 - measurement.humidity::double precision / 100.0)
  ) FILTER (
    WHERE measurement.temperature BETWEEN -80 AND 80
      AND measurement.humidity BETWEEN 0 AND 100
      AND measurement_sensor_available(measurement.raw_object, 'sht45')
  ), 0),
  COUNT(*) FILTER (
    WHERE measurement.temperature BETWEEN -80 AND 80
      AND measurement.humidity BETWEEN 0 AND 100
      AND measurement_sensor_available(measurement.raw_object, 'sht45')
  )::integer
FROM measurements measurement
CROSS JOIN (VALUES (10::smallint), (60::smallint)) AS resolution(bucket_minutes)
GROUP BY resolution.bucket_minutes, bucket_start, measurement.dev_eui
ON CONFLICT (bucket_minutes, dev_eui, bucket_start) DO NOTHING;

CREATE OR REPLACE FUNCTION update_measurement_rollups()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO measurement_rollups (
    bucket_minutes, bucket_start, dev_eui, sample_count, measured_at,
    temperature_sum, temperature_count,
    humidity_sum, humidity_count,
    co2_sum, co2_count,
    lux_sum, lux_count, lux_max,
    soil_temperature_sum, soil_temperature_count,
    soil_moisture_sum, soil_moisture_count,
    ec_sum, ec_count,
    ph_sum, ph_count,
    soil_ec_sum, soil_ec_count,
    leaf_temperature_sum, leaf_temperature_count,
    water_temperature_sum, water_temperature_count,
    battery_percent_sum, battery_percent_count,
    vpd_sum, vpd_count
  )
  SELECT
    resolution.bucket_minutes,
    to_timestamp(
      floor(extract(epoch FROM NEW.time) / (resolution.bucket_minutes * 60))
      * (resolution.bucket_minutes * 60)
    ),
    NEW.dev_eui,
    1,
    NEW.time,
    CASE WHEN NEW.temperature IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'sht45') THEN NEW.temperature ELSE 0 END,
    CASE WHEN NEW.temperature IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'sht45') THEN 1 ELSE 0 END,
    CASE WHEN NEW.humidity IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'sht45') THEN NEW.humidity ELSE 0 END,
    CASE WHEN NEW.humidity IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'sht45') THEN 1 ELSE 0 END,
    CASE WHEN NEW.co2 IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'scd41') THEN NEW.co2 ELSE 0 END,
    CASE WHEN NEW.co2 IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'scd41') THEN 1 ELSE 0 END,
    CASE WHEN NEW.lux IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'bh1750') THEN NEW.lux ELSE 0 END,
    CASE WHEN NEW.lux IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'bh1750') THEN 1 ELSE 0 END,
    CASE WHEN NEW.lux IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'bh1750') THEN NEW.lux ELSE NULL END,
    CASE WHEN NEW.soil_temperature IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'ds18b20') THEN NEW.soil_temperature ELSE 0 END,
    CASE WHEN NEW.soil_temperature IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'ds18b20') THEN 1 ELSE 0 END,
    CASE WHEN NEW.soil_moisture IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'soil_moisture_probe') THEN NEW.soil_moisture ELSE 0 END,
    CASE WHEN NEW.soil_moisture IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'soil_moisture_probe') THEN 1 ELSE 0 END,
    CASE WHEN NEW.ec IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'ec_probe') THEN NEW.ec ELSE 0 END,
    CASE WHEN NEW.ec IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'ec_probe') THEN 1 ELSE 0 END,
    CASE WHEN NEW.ph IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'ph_probe') THEN NEW.ph ELSE 0 END,
    CASE WHEN NEW.ph IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'ph_probe') THEN 1 ELSE 0 END,
    CASE WHEN NEW.soil_ec IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'soil_ec_probe') THEN NEW.soil_ec ELSE 0 END,
    CASE WHEN NEW.soil_ec IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'soil_ec_probe') THEN 1 ELSE 0 END,
    CASE WHEN NEW.leaf_temperature IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'leaf_temperature_probe') THEN NEW.leaf_temperature ELSE 0 END,
    CASE WHEN NEW.leaf_temperature IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'leaf_temperature_probe') THEN 1 ELSE 0 END,
    CASE WHEN NEW.water_temperature IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'water_temperature_probe') THEN NEW.water_temperature ELSE 0 END,
    CASE WHEN NEW.water_temperature IS NOT NULL
      AND measurement_sensor_available(NEW.raw_object, 'water_temperature_probe') THEN 1 ELSE 0 END,
    COALESCE(NEW.battery_percent, 0),
    CASE WHEN NEW.battery_percent IS NOT NULL THEN 1 ELSE 0 END,
    CASE WHEN NEW.temperature BETWEEN -80 AND 80
      AND NEW.humidity BETWEEN 0 AND 100
      AND measurement_sensor_available(NEW.raw_object, 'sht45')
      THEN 0.6108::double precision
        * exp((17.27 * NEW.temperature::double precision)
          / (NEW.temperature::double precision + 237.3))
        * (1.0 - NEW.humidity::double precision / 100.0)
      ELSE 0 END,
    CASE WHEN NEW.temperature BETWEEN -80 AND 80
      AND NEW.humidity BETWEEN 0 AND 100
      AND measurement_sensor_available(NEW.raw_object, 'sht45') THEN 1 ELSE 0 END
  FROM (VALUES (10::smallint), (60::smallint)) AS resolution(bucket_minutes)
  ON CONFLICT (bucket_minutes, dev_eui, bucket_start) DO UPDATE SET
    sample_count = measurement_rollups.sample_count + EXCLUDED.sample_count,
    measured_at = GREATEST(measurement_rollups.measured_at, EXCLUDED.measured_at),
    temperature_sum = measurement_rollups.temperature_sum + EXCLUDED.temperature_sum,
    temperature_count = measurement_rollups.temperature_count + EXCLUDED.temperature_count,
    humidity_sum = measurement_rollups.humidity_sum + EXCLUDED.humidity_sum,
    humidity_count = measurement_rollups.humidity_count + EXCLUDED.humidity_count,
    co2_sum = measurement_rollups.co2_sum + EXCLUDED.co2_sum,
    co2_count = measurement_rollups.co2_count + EXCLUDED.co2_count,
    lux_sum = measurement_rollups.lux_sum + EXCLUDED.lux_sum,
    lux_count = measurement_rollups.lux_count + EXCLUDED.lux_count,
    lux_max = CASE
      WHEN measurement_rollups.lux_max IS NULL THEN EXCLUDED.lux_max
      WHEN EXCLUDED.lux_max IS NULL THEN measurement_rollups.lux_max
      ELSE GREATEST(measurement_rollups.lux_max, EXCLUDED.lux_max)
    END,
    soil_temperature_sum = measurement_rollups.soil_temperature_sum + EXCLUDED.soil_temperature_sum,
    soil_temperature_count = measurement_rollups.soil_temperature_count + EXCLUDED.soil_temperature_count,
    soil_moisture_sum = measurement_rollups.soil_moisture_sum + EXCLUDED.soil_moisture_sum,
    soil_moisture_count = measurement_rollups.soil_moisture_count + EXCLUDED.soil_moisture_count,
    ec_sum = measurement_rollups.ec_sum + EXCLUDED.ec_sum,
    ec_count = measurement_rollups.ec_count + EXCLUDED.ec_count,
    ph_sum = measurement_rollups.ph_sum + EXCLUDED.ph_sum,
    ph_count = measurement_rollups.ph_count + EXCLUDED.ph_count,
    soil_ec_sum = measurement_rollups.soil_ec_sum + EXCLUDED.soil_ec_sum,
    soil_ec_count = measurement_rollups.soil_ec_count + EXCLUDED.soil_ec_count,
    leaf_temperature_sum = measurement_rollups.leaf_temperature_sum + EXCLUDED.leaf_temperature_sum,
    leaf_temperature_count = measurement_rollups.leaf_temperature_count + EXCLUDED.leaf_temperature_count,
    water_temperature_sum = measurement_rollups.water_temperature_sum + EXCLUDED.water_temperature_sum,
    water_temperature_count = measurement_rollups.water_temperature_count + EXCLUDED.water_temperature_count,
    battery_percent_sum = measurement_rollups.battery_percent_sum + EXCLUDED.battery_percent_sum,
    battery_percent_count = measurement_rollups.battery_percent_count + EXCLUDED.battery_percent_count,
    vpd_sum = measurement_rollups.vpd_sum + EXCLUDED.vpd_sum,
    vpd_count = measurement_rollups.vpd_count + EXCLUDED.vpd_count;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS measurements_update_rollups ON measurements;
CREATE TRIGGER measurements_update_rollups
  AFTER INSERT ON measurements
  FOR EACH ROW EXECUTE FUNCTION update_measurement_rollups();
