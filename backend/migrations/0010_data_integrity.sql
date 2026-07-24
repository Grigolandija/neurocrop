-- Repair legacy rows before enforcing tenant-scoped relationships.
UPDATE sections s
SET area_id = NULL
WHERE s.area_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM areas a
    WHERE a.id = s.area_id
      AND a.organization_id = s.organization_id
  );

UPDATE nodes n
SET section_id = NULL
WHERE n.section_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM sections s
    WHERE s.id = n.section_id
      AND s.organization_id = n.organization_id
  );

UPDATE nodes n
SET area_id = NULL
WHERE n.area_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM areas a
    WHERE a.id = n.area_id
      AND a.organization_id = n.organization_id
  );

UPDATE nodes n
SET area_id = s.area_id
FROM sections s
WHERE n.organization_id = s.organization_id
  AND n.section_id = s.id
  AND n.area_id IS DISTINCT FROM s.area_id;

UPDATE action_feedback af
SET organization_id = s.organization_id
FROM sections s
WHERE af.section_id = s.id
  AND af.organization_id IS DISTINCT FROM s.organization_id;

DELETE FROM node_sensor_configs c
WHERE NOT EXISTS (
  SELECT 1
  FROM nodes n
  WHERE n.dev_eui = c.node_dev_eui
    AND n.organization_id IS NOT NULL
);

UPDATE node_sensor_configs c
SET organization_id = n.organization_id
FROM nodes n
WHERE n.dev_eui = c.node_dev_eui
  AND n.organization_id IS NOT NULL
  AND c.organization_id IS DISTINCT FROM n.organization_id;

-- Every Section must point to a profile owned by the same organization.
INSERT INTO crop_profiles (
  id, organization_id, name, hero_name, stage, hint, requires_review, metrics
)
SELECT
  'default',
  o.id,
  'Default',
  'Default',
  'Default',
  'Universal starter profile. Review target ranges before assigning it to production sections.',
  false,
  '{}'::jsonb
FROM organizations o
WHERE EXISTS (
  SELECT 1 FROM sections s WHERE s.organization_id = o.id
)
ON CONFLICT (organization_id, id) DO NOTHING;

UPDATE sections s
SET crop_profile = 'default'
WHERE s.crop_profile IS NULL
   OR NOT EXISTS (
     SELECT 1
     FROM crop_profiles cp
     WHERE cp.organization_id = s.organization_id
       AND cp.id = s.crop_profile
   );

ALTER TABLE sections
  ALTER COLUMN crop_profile SET DEFAULT 'default',
  ALTER COLUMN crop_profile SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_areas_org_id_unique
  ON areas (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sections_org_id_unique
  ON sections (organization_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sections_org_id_area_unique
  ON sections (organization_id, id, area_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_org_deveui_unique
  ON nodes (organization_id, dev_eui);

ALTER TABLE sections
  DROP CONSTRAINT IF EXISTS sections_area_id_fkey,
  ADD CONSTRAINT sections_area_tenant_fkey
    FOREIGN KEY (organization_id, area_id)
    REFERENCES areas (organization_id, id)
    ON UPDATE CASCADE
    ON DELETE SET NULL (area_id),
  ADD CONSTRAINT sections_crop_profile_tenant_fkey
    FOREIGN KEY (organization_id, crop_profile)
    REFERENCES crop_profiles (organization_id, id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT;

ALTER TABLE nodes
  DROP CONSTRAINT IF EXISTS nodes_area_id_fkey,
  DROP CONSTRAINT IF EXISTS nodes_section_id_fkey,
  ADD CONSTRAINT nodes_area_tenant_fkey
    FOREIGN KEY (organization_id, area_id)
    REFERENCES areas (organization_id, id)
    ON UPDATE CASCADE
    ON DELETE SET NULL (area_id),
  ADD CONSTRAINT nodes_section_tenant_fkey
    FOREIGN KEY (organization_id, section_id)
    REFERENCES sections (organization_id, id)
    ON UPDATE CASCADE
    ON DELETE SET NULL (section_id),
  ADD CONSTRAINT nodes_section_area_tenant_fkey
    FOREIGN KEY (organization_id, section_id, area_id)
    REFERENCES sections (organization_id, id, area_id)
    ON UPDATE CASCADE
    ON DELETE SET NULL (section_id);

ALTER TABLE node_sensor_configs
  DROP CONSTRAINT IF EXISTS node_sensor_configs_node_dev_eui_fkey,
  ADD CONSTRAINT node_sensor_configs_node_tenant_fkey
    FOREIGN KEY (organization_id, node_dev_eui)
    REFERENCES nodes (organization_id, dev_eui)
    ON UPDATE CASCADE
    ON DELETE CASCADE;

ALTER TABLE action_feedback
  DROP CONSTRAINT IF EXISTS action_feedback_section_id_fkey,
  ADD CONSTRAINT action_feedback_section_tenant_fkey
    FOREIGN KEY (organization_id, section_id)
    REFERENCES sections (organization_id, id)
    ON UPDATE CASCADE
    ON DELETE CASCADE;

-- Stable row identity plus an atomic MQTT deduplication key.
ALTER TABLE measurements
  ADD COLUMN IF NOT EXISTS id BIGINT GENERATED ALWAYS AS IDENTITY;

DELETE FROM measurements stale
USING measurements preferred
WHERE stale.dev_eui = preferred.dev_eui
  AND stale.time = preferred.time
  AND (
    stale.received_at < preferred.received_at
    OR (stale.received_at = preferred.received_at AND stale.id < preferred.id)
  );

ALTER TABLE measurements
  ADD CONSTRAINT measurements_pkey PRIMARY KEY (id),
  ADD CONSTRAINT measurements_dev_eui_time_unique UNIQUE (dev_eui, time);

-- Keep audit timestamps correct for every write path.
CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_set_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
CREATE TRIGGER organization_requests_set_updated_at
  BEFORE UPDATE ON organization_requests
  FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
CREATE TRIGGER crop_profiles_set_updated_at
  BEFORE UPDATE ON crop_profiles
  FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
CREATE TRIGGER node_sensor_configs_set_updated_at
  BEFORE UPDATE ON node_sensor_configs
  FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
CREATE TRIGGER gateways_set_updated_at
  BEFORE UPDATE ON gateways
  FOR EACH ROW EXECUTE FUNCTION set_row_updated_at();
