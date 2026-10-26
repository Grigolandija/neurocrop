CREATE TABLE farm_plans (
    organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    plan_data JSONB NOT NULL CHECK (jsonb_typeof(plan_data) = 'object'),
    revision INTEGER NOT NULL CHECK (revision > 0),
    updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE farm_plan_area_links (
    organization_id TEXT NOT NULL REFERENCES farm_plans(organization_id) ON DELETE CASCADE,
    zone_id TEXT NOT NULL,
    area_id TEXT NOT NULL,
    PRIMARY KEY (organization_id, zone_id),
    UNIQUE (organization_id, area_id),
    FOREIGN KEY (organization_id, area_id) REFERENCES areas(organization_id, id)
        ON UPDATE CASCADE ON DELETE CASCADE
);

CREATE TABLE farm_plan_history (
    organization_id TEXT NOT NULL REFERENCES farm_plans(organization_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL CHECK (revision > 0),
    plan_data JSONB NOT NULL CHECK (jsonb_typeof(plan_data) = 'object'),
    saved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, revision)
);
