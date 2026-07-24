CREATE TABLE IF NOT EXISTS alert_workflows (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    alert_id       TEXT NOT NULL,
    status         TEXT NOT NULL CHECK (status IN ('acknowledged', 'snoozed', 'resolved')),
    context        JSONB NOT NULL DEFAULT '{}'::jsonb,
    acknowledged_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    snoozed_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    snoozed_at     TIMESTAMPTZ,
    snoozed_until  TIMESTAMPTZ,
    resolved_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    resolved_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, alert_id),
    CHECK (jsonb_typeof(context) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_alert_workflows_org_updated
    ON alert_workflows (organization_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS interventions (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    section_id      TEXT NOT NULL,
    alert_id        TEXT,
    metric          TEXT NOT NULL DEFAULT '',
    action_type     TEXT NOT NULL,
    note            TEXT NOT NULL DEFAULT '',
    performed_at    TIMESTAMPTZ NOT NULL,
    performed_by    TEXT REFERENCES users(id) ON DELETE SET NULL,
    outcome_status  TEXT CHECK (outcome_status IN ('successful', 'no_change', 'made_worse', 'not_relevant')),
    outcome_observed_at TIMESTAMPTZ,
    before_value    REAL,
    after_value     REAL,
    outcome_note    TEXT NOT NULL DEFAULT '',
    outcome_recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    outcome_recorded_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT interventions_section_tenant_fkey
        FOREIGN KEY (organization_id, section_id)
        REFERENCES sections (organization_id, id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_interventions_org_section_time
    ON interventions (organization_id, section_id, performed_at DESC);
