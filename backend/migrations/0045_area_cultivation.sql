-- Area is the default cultivation scope. Existing single-scope identities and history are retained.
-- Unknown cultivation must stay explicit instead of silently applying the starter profile.
ALTER TABLE sections ALTER COLUMN crop_profile DROP NOT NULL, ALTER COLUMN crop_profile DROP DEFAULT;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS is_area_default BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE sections ADD COLUMN IF NOT EXISTS inherit_area_profile BOOLEAN NOT NULL DEFAULT false;
CREATE UNIQUE INDEX sections_one_area_default ON sections (organization_id,area_id) WHERE is_area_default AND area_id IS NOT NULL;

UPDATE sections s SET is_area_default=true
FROM (SELECT organization_id,area_id,min(id) AS id FROM sections WHERE area_id IS NOT NULL GROUP BY organization_id,area_id HAVING count(*)=1) only_scope
WHERE s.organization_id=only_scope.organization_id AND s.id=only_scope.id;

INSERT INTO sections (id,organization_id,area_id,name,crop_profile,is_area_default)
SELECT 'area-scope-'||a.id,a.organization_id,a.id,a.name,
  (SELECT CASE WHEN count(DISTINCT s.crop_profile)=1 THEN min(s.crop_profile) ELSE NULL END FROM sections s WHERE s.organization_id=a.organization_id AND s.area_id=a.id),true
FROM areas a WHERE NOT EXISTS (SELECT 1 FROM sections s WHERE s.organization_id=a.organization_id AND s.area_id=a.id AND s.is_area_default);

-- Previously ungrouped Nodes start participating in Area evaluation. No readings are changed.
UPDATE nodes n SET section_id=s.id FROM sections s
WHERE n.organization_id=s.organization_id AND n.area_id=s.area_id AND n.section_id IS NULL AND s.is_area_default;

CREATE FUNCTION maintain_area_cultivation_scope() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    INSERT INTO sections (id,organization_id,area_id,name,crop_profile,is_area_default)
    VALUES ('area-scope-'||NEW.id,NEW.organization_id,NEW.id,NEW.name,NULL,true);
  ELSIF NEW.name IS DISTINCT FROM OLD.name THEN
    UPDATE sections SET name=NEW.name WHERE organization_id=NEW.organization_id AND area_id=NEW.id AND is_area_default;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER areas_cultivation_scope AFTER INSERT OR UPDATE OF name ON areas FOR EACH ROW EXECUTE FUNCTION maintain_area_cultivation_scope();

-- Serialize group profile inheritance against Area profile edits without changing historical scope IDs.
CREATE FUNCTION inherit_area_cultivation_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.inherit_area_profile AND NOT NEW.is_area_default THEN
    SELECT crop_profile INTO NEW.crop_profile FROM sections
    WHERE organization_id=NEW.organization_id AND area_id=NEW.area_id AND is_area_default FOR SHARE;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sections_inherit_area_profile BEFORE INSERT OR UPDATE OF area_id,inherit_area_profile ON sections
FOR EACH ROW EXECUTE FUNCTION inherit_area_cultivation_profile();
