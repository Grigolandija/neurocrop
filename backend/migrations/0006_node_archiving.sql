ALTER TABLE nodes
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_nodes_active_org_section
    ON nodes (organization_id, section_id)
    WHERE archived_at IS NULL;
