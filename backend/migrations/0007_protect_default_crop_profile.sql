UPDATE crop_profiles
SET name = 'Default', updated_at = now()
WHERE id = 'default' AND name <> 'Default';
