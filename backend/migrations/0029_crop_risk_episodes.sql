CREATE TABLE IF NOT EXISTS crop_risk_episodes (
    organization_id   TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    risk_id           TEXT NOT NULL,
    section_id        TEXT NOT NULL,
    metric_id         TEXT NOT NULL,
    risk_kind         TEXT NOT NULL,
    active            BOOLEAN NOT NULL DEFAULT true,
    first_detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_detected_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at       TIMESTAMPTZ,
    current_deviation REAL,
    previous_deviation REAL,
    PRIMARY KEY (organization_id, risk_id),
    CONSTRAINT crop_risk_episodes_section_fkey
        FOREIGN KEY (organization_id, section_id)
        REFERENCES sections (organization_id, id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crop_risk_episodes_org_active_priority
    ON crop_risk_episodes (organization_id, active, last_detected_at DESC);
