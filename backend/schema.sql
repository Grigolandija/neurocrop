CREATE TABLE IF NOT EXISTS organizations (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    archived_at TIMESTAMPTZ,
    archived_by TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organizations_status ON organizations (status);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS archived_by TEXT;


CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL,
    display_name  TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    is_platform_admin BOOLEAN NOT NULL DEFAULT false,
    is_super_admin BOOLEAN NOT NULL DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower ON users (lower(email));
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_platform_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_archived_by_fkey'
  ) THEN
    ALTER TABLE organizations
      ADD CONSTRAINT organizations_archived_by_fkey
      FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS organization_memberships (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'grower', 'technician', 'viewer')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON organization_memberships (user_id);

CREATE TABLE IF NOT EXISTS invitations (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           TEXT NOT NULL,
    role            TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'grower', 'technician', 'viewer')),
    token_hash      TEXT NOT NULL UNIQUE,
    invited_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    accepted_at     TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations (organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email_lower ON invitations (lower(email));

CREATE TABLE IF NOT EXISTS organization_requests (
    id                TEXT PRIMARY KEY,
    user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_name TEXT NOT NULL,
    status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
    reviewed_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_organization_requests_status ON organization_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_organization_requests_user ON organization_requests (user_id);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id              TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    last_seen_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ;
ALTER TABLE auth_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_org ON auth_sessions (organization_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS areas (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    kind            TEXT NOT NULL DEFAULT 'Growing area',
    location        TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE areas ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'Growing area';
ALTER TABLE areas ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS sections (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    area_id         TEXT REFERENCES areas(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    crop_profile    TEXT DEFAULT 'tomatoes-vegetative',
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nodes (
    dev_eui         TEXT PRIMARY KEY,
    organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    area_id         TEXT REFERENCES areas(id) ON DELETE SET NULL,
    section_id      TEXT REFERENCES sections(id) ON DELETE SET NULL,
    name            TEXT,
    node_type       TEXT DEFAULT 'air',
    firmware_build        INTEGER,
    created_at            TIMESTAMPTZ DEFAULT now(),
    last_seen             TIMESTAMPTZ,
    last_received_at      TIMESTAMPTZ,
    last_battery_mv       INTEGER,
    last_battery_percent  SMALLINT,
    last_firmware_version TEXT,
    last_profile          TEXT,
    last_rssi             INTEGER,
    last_snr              REAL,
    last_spreading_factor SMALLINT,
    last_sensor_presence  JSONB,
    last_error_flags      JSONB,
    last_error_counters   JSONB,
    archived_at           TIMESTAMPTZ
);
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMPTZ;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_battery_mv INTEGER;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_battery_percent SMALLINT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_firmware_version TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_profile TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_rssi INTEGER;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_snr REAL;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_spreading_factor SMALLINT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_sensor_presence JSONB;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_error_flags JSONB;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS last_error_counters JSONB;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_nodes_active_org_section ON nodes (organization_id, section_id) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS measurements (
    time             TIMESTAMPTZ NOT NULL,
    dev_eui          TEXT NOT NULL REFERENCES nodes(dev_eui) ON UPDATE CASCADE,
    temperature      REAL,
    humidity         REAL,
    co2              INTEGER,
    lux              INTEGER,
    soil_temperature REAL,
    soil_moisture    REAL,
    ec               REAL,
    ph               REAL,
    soil_ec          REAL,
    leaf_temperature REAL,
    water_temperature REAL,
    air_pressure     REAL,
    battery_mv       INTEGER,
    battery_percent  INTEGER,
    firmware_build   INTEGER,
    profile          TEXT,
    battery_critical BOOLEAN,
    vpd_out_of_range BOOLEAN,
    err_read_fail    SMALLINT,
    err_reinit       SMALLINT,
    err_tx_fail      SMALLINT,
    rssi             INTEGER,
    snr              REAL,
    spreading_factor SMALLINT,
    raw_object       JSONB,
    received_at      TIMESTAMPTZ NOT NULL
);
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS soil_moisture REAL;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS ec REAL;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS ph REAL;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS soil_ec REAL;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS leaf_temperature REAL;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS water_temperature REAL;
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS air_pressure REAL;
CREATE INDEX IF NOT EXISTS idx_measurements_deveui_time ON measurements (dev_eui, time DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_time ON measurements (time DESC);
CREATE INDEX IF NOT EXISTS idx_measurements_deveui_received_at ON measurements (dev_eui, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_areas_org ON areas (organization_id);
ALTER TABLE sections ALTER COLUMN area_id DROP NOT NULL;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sections_area_id_fkey'
  ) THEN
    ALTER TABLE sections DROP CONSTRAINT sections_area_id_fkey;
  END IF;

  ALTER TABLE sections
    ADD CONSTRAINT sections_area_id_fkey
    FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE SET NULL;
END $$;
CREATE INDEX IF NOT EXISTS idx_sections_org_area ON sections (organization_id, area_id);
CREATE INDEX IF NOT EXISTS idx_nodes_org_section ON nodes (organization_id, section_id);


CREATE TABLE IF NOT EXISTS crop_profiles (
    id              TEXT NOT NULL,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    hero_name       TEXT NOT NULL,
    stage           TEXT DEFAULT '',
    hint            TEXT DEFAULT '',
    requires_review BOOLEAN NOT NULL DEFAULT false,
    metrics         JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, id)
);
DO $$
DECLARE profile_pkey TEXT;
BEGIN
  SELECT conname INTO profile_pkey
  FROM pg_constraint
  WHERE conrelid='crop_profiles'::regclass AND contype='p';

  IF profile_pkey IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid='crop_profiles'::regclass
      AND c.contype='p'
      AND (SELECT array_agg(a.attname ORDER BY k.ordinality)
           FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ordinality)
           JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum) = ARRAY['organization_id', 'id']::name[]
  ) THEN
    EXECUTE format('ALTER TABLE crop_profiles DROP CONSTRAINT %I', profile_pkey);
    ALTER TABLE crop_profiles ADD PRIMARY KEY (organization_id, id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_crop_profiles_org ON crop_profiles (organization_id);

CREATE TABLE IF NOT EXISTS node_sensor_configs (
    node_dev_eui    TEXT NOT NULL REFERENCES nodes(dev_eui) ON UPDATE CASCADE ON DELETE CASCADE,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    port            TEXT NOT NULL CHECK (port IN ('internal', 'i2c', 'onewire')),
    role            TEXT,
    label           TEXT,
    is_enabled      BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (node_dev_eui, port)
);
CREATE INDEX IF NOT EXISTS idx_node_sensor_configs_org ON node_sensor_configs (organization_id);
