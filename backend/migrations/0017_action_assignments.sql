CREATE TABLE IF NOT EXISTS action_assignments (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    action_id       TEXT NOT NULL,
    section_id      TEXT NOT NULL,
    assigned_to     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_by     TEXT REFERENCES users(id) ON DELETE SET NULL,
    priority        TEXT NOT NULL DEFAULT 'normal'
                    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
    due_at          TIMESTAMPTZ,
    action_payload  JSONB NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT action_assignments_section_tenant_fkey
      FOREIGN KEY (organization_id, section_id)
      REFERENCES sections(organization_id, id)
      ON DELETE CASCADE,
    CONSTRAINT action_assignments_org_action_unique
      UNIQUE (organization_id, action_id)
);

CREATE INDEX IF NOT EXISTS idx_action_assignments_assignee
    ON action_assignments (organization_id, assigned_to, active, due_at);
