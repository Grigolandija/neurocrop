ALTER TABLE areas
  ADD COLUMN IF NOT EXISTS map_enabled BOOLEAN NOT NULL DEFAULT false;

UPDATE areas a
SET map_enabled=true
WHERE EXISTS (
  SELECT 1
  FROM greenhouse_maps gm
  WHERE gm.organization_id=a.organization_id
    AND gm.area_id=a.id
);
