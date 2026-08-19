ALTER TABLE alert_notification_preferences
    ADD COLUMN IF NOT EXISTS warning_after_minutes INTEGER NOT NULL DEFAULT 15
    CHECK (warning_after_minutes BETWEEN 0 AND 1440);

ALTER TABLE alert_email_deliveries
    ADD COLUMN IF NOT EXISTS alert_tone TEXT NOT NULL DEFAULT 'warning'
    CHECK (alert_tone IN ('warning', 'critical'));

-- A continuous alert occurrence is delivered once per severity. This keeps a
-- stable warning quiet while still allowing a later critical escalation email.
ALTER TABLE alert_email_deliveries
    DROP CONSTRAINT alert_email_deliveries_pkey;

ALTER TABLE alert_email_deliveries
    ADD CONSTRAINT alert_email_deliveries_pkey PRIMARY KEY (
        organization_id, alert_id, occurrence_started_at, user_id, alert_tone
    );
