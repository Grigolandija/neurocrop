-- The unique index created by the measurement deduplication constraint already
-- supports latest-by-device queries. These older indexes duplicate that storage.
DROP INDEX IF EXISTS idx_measurements_deveui_time;
DROP INDEX IF EXISTS idx_measurements_deveui_received_at;

-- Demo history is for UI validation, not long-term telemetry retention.
DELETE FROM measurements
WHERE raw_object->>'demo' = 'true'
  AND time < now() - INTERVAL '7 days';

-- Keep only metadata consumed by history, scoring and diagnostics.
UPDATE measurements
SET raw_object = jsonb_strip_nulls(jsonb_build_object(
  'firmware_version', raw_object->'firmware_version',
  'expected_uplink_interval_s', raw_object->'expected_uplink_interval_s',
  'sensors', (
    SELECT jsonb_object_agg(
      sensor.key,
      jsonb_strip_nulls(jsonb_build_object('present', sensor.value->'present'))
    )
    FROM jsonb_each(COALESCE(raw_object->'sensors', '{}'::jsonb)) AS sensor
  ),
  'error_flags', raw_object->'error_flags',
  'demo', raw_object->'demo'
))
WHERE raw_object->>'demo' = 'true';
