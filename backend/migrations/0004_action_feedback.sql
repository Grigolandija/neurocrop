CREATE TABLE IF NOT EXISTS action_feedback (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    action_id       TEXT NOT NULL,
    section_id      TEXT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    metric_id       TEXT NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('completed', 'deferred', 'failed')),
    note            TEXT NOT NULL DEFAULT '',
    action_payload  JSONB NOT NULL,
    created_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_action_feedback_org_action_time
    ON action_feedback (organization_id, action_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_feedback_org_section_time
    ON action_feedback (organization_id, section_id, created_at DESC);
