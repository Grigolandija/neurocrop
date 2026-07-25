ALTER TABLE alert_workflows
    DROP CONSTRAINT IF EXISTS alert_workflows_status_check;

ALTER TABLE alert_workflows
    ADD CONSTRAINT alert_workflows_status_check
        CHECK (status IN ('open', 'acknowledged', 'snoozed', 'resolved')),
    ADD COLUMN IF NOT EXISTS managed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS first_detected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_detected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS recovered_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS resolution_reason TEXT;

ALTER TABLE alert_workflows
    DROP CONSTRAINT IF EXISTS alert_workflows_resolution_reason_check;

ALTER TABLE alert_workflows
    ADD CONSTRAINT alert_workflows_resolution_reason_check
        CHECK (resolution_reason IS NULL OR resolution_reason IN ('condition_cleared', 'manual'));

CREATE INDEX IF NOT EXISTS idx_alert_workflows_org_active_updated
    ON alert_workflows (organization_id, active, updated_at DESC);

