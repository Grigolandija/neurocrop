ALTER TABLE node_sensor_configs
  ADD COLUMN IF NOT EXISTS medium TEXT NOT NULL DEFAULT 'air',
  ADD COLUMN IF NOT EXISTS target_type TEXT NOT NULL DEFAULT 'section',
  ADD COLUMN IF NOT EXISTS target_name TEXT,
  ADD COLUMN IF NOT EXISTS spatial_scope TEXT NOT NULL DEFAULT 'representative',
  ADD COLUMN IF NOT EXISTS depth_cm REAL,
  ADD COLUMN IF NOT EXISTS height_cm REAL,
  ADD COLUMN IF NOT EXISTS use_for_section_score BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_spatial_interpolation BOOLEAN NOT NULL DEFAULT true;

-- Configure each physical sensor independently. Older builds grouped all I2C
-- devices into one row, so an incubator CO2 sensor and greenhouse air sensor
-- could not have different contexts.
ALTER TABLE node_sensor_configs
  DROP CONSTRAINT IF EXISTS node_sensor_configs_port_check;

UPDATE node_sensor_configs SET port='sht45' WHERE port='internal';
UPDATE node_sensor_configs SET port='scd4x' WHERE port='i2c';
UPDATE node_sensor_configs SET port='ds18b20' WHERE port='onewire';

ALTER TABLE node_sensor_configs
  ADD CONSTRAINT node_sensor_configs_port_check
    CHECK (port ~ '^[a-z0-9][a-z0-9:_-]{0,63}$');

ALTER TABLE node_sensor_configs
  DROP CONSTRAINT IF EXISTS node_sensor_configs_medium_check,
  ADD CONSTRAINT node_sensor_configs_medium_check
    CHECK (medium IN ('air', 'substrate', 'water', 'plant', 'equipment', 'custom')),
  DROP CONSTRAINT IF EXISTS node_sensor_configs_target_type_check,
  ADD CONSTRAINT node_sensor_configs_target_type_check
    CHECK (target_type IN ('section', 'pot', 'bed', 'incubator', 'reservoir', 'pipe', 'equipment', 'custom')),
  DROP CONSTRAINT IF EXISTS node_sensor_configs_spatial_scope_check,
  ADD CONSTRAINT node_sensor_configs_spatial_scope_check
    CHECK (spatial_scope IN ('point', 'representative')),
  DROP CONSTRAINT IF EXISTS node_sensor_configs_depth_check,
  ADD CONSTRAINT node_sensor_configs_depth_check
    CHECK (depth_cm IS NULL OR (depth_cm >= 0 AND depth_cm <= 10000)),
  DROP CONSTRAINT IF EXISTS node_sensor_configs_height_check,
  ADD CONSTRAINT node_sensor_configs_height_check
    CHECK (height_cm IS NULL OR (height_cm >= 0 AND height_cm <= 10000));

-- Existing configured DS18B20 probes must not silently become a continuous
-- whole-Section field. The grower can explicitly promote one to a
-- representative Section probe after confirming its installation.
UPDATE node_sensor_configs
SET medium='substrate',
    target_type=CASE
      WHEN role='water_temperature' THEN 'reservoir'
      WHEN role='pipe_temperature' THEN 'pipe'
      ELSE 'pot'
    END,
    spatial_scope='point',
    use_for_section_score=false,
    allow_spatial_interpolation=false
WHERE port='ds18b20';

COMMENT ON COLUMN node_sensor_configs.spatial_scope IS
  'point means only the named target; representative means the reading may represent its Section';
COMMENT ON COLUMN node_sensor_configs.allow_spatial_interpolation IS
  'Explicit permission to use this sensor channel as an input to an Area heatmap';
