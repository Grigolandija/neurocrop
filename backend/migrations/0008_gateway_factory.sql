CREATE TABLE IF NOT EXISTS gateway_activations (
    id             UUID PRIMARY KEY,
    token_hash     TEXT NOT NULL UNIQUE,
    gateway_id     TEXT NOT NULL UNIQUE CHECK (gateway_id ~ '^[0-9a-f]{16}$'),
    serial_number  TEXT NOT NULL UNIQUE,
    display_name   TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'consumed', 'revoked')),
    expires_at     TIMESTAMPTZ NOT NULL,
    consumed_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateway_activations_status_expires
    ON gateway_activations (status, expires_at);

CREATE TABLE IF NOT EXISTS gateways (
    gateway_id          TEXT PRIMARY KEY CHECK (gateway_id ~ '^[0-9a-f]{16}$'),
    serial_number       TEXT NOT NULL UNIQUE,
    display_name        TEXT NOT NULL,
    organization_id     TEXT REFERENCES organizations(id) ON DELETE SET NULL,
    device_token_hash   TEXT NOT NULL,
    concentrator_eui    TEXT CHECK (concentrator_eui IS NULL OR concentrator_eui ~ '^[0-9a-f]{16}$'),
    hardware_model      TEXT,
    image_version       TEXT,
    status              TEXT NOT NULL DEFAULT 'provisioning'
                        CHECK (status IN ('provisioning', 'online', 'offline', 'configuration_error', 'retired')),
    last_ip             INET,
    last_health         JSONB NOT NULL DEFAULT '{}'::jsonb,
    first_enrolled_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_enrolled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateways_status_last_seen
    ON gateways (status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_gateways_organization
    ON gateways (organization_id, first_enrolled_at DESC);
