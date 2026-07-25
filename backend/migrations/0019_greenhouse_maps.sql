CREATE TABLE IF NOT EXISTS greenhouse_maps (
    organization_id TEXT NOT NULL,
    area_id          TEXT NOT NULL,
    map_data         JSONB NOT NULL,
    revision         INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_by       TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, area_id),
    CONSTRAINT greenhouse_maps_area_tenant_fkey
        FOREIGN KEY (organization_id, area_id)
        REFERENCES areas (organization_id, id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CHECK (jsonb_typeof(map_data) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_greenhouse_maps_org_updated
    ON greenhouse_maps (organization_id, updated_at DESC);
