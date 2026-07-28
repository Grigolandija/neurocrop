CREATE OR REPLACE FUNCTION ensure_organization_default_crop_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO crop_profiles (
    id, organization_id, name, hero_name, stage, hint,
    requires_review, metrics, created_at, updated_at
  ) VALUES (
    'default', NEW.id, 'Default', 'Default', 'Default',
    'Universal starter profile. Review target ranges before assigning it to production sections.',
    false, '{}'::jsonb, now(), now()
  )
  ON CONFLICT (organization_id, id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_ensure_default_crop_profile ON organizations;
CREATE TRIGGER organizations_ensure_default_crop_profile
AFTER INSERT ON organizations
FOR EACH ROW
EXECUTE FUNCTION ensure_organization_default_crop_profile();

INSERT INTO crop_profiles (
  id, organization_id, name, hero_name, stage, hint,
  requires_review, metrics, created_at, updated_at
)
SELECT
  'default', organization.id, 'Default', 'Default', 'Default',
  'Universal starter profile. Review target ranges before assigning it to production sections.',
  false, '{}'::jsonb, now(), now()
FROM organizations organization
ON CONFLICT (organization_id, id) DO NOTHING;
