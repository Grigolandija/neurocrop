-- NULL height can mean an explicit "unknown", rather than an unset legacy field.
-- Existing metadata / measurement-context triggers snapshot this change.
ALTER TABLE node_sensor_configs ADD COLUMN IF NOT EXISTS height_recorded_at TIMESTAMPTZ;
