CREATE TABLE IF NOT EXISTS alert_notification_preferences (
    organization_id     TEXT NOT NULL,
    user_id             TEXT NOT NULL,
    email_alerts_enabled BOOLEAN NOT NULL DEFAULT false,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, user_id),
    CONSTRAINT alert_notification_preferences_membership_fkey
        FOREIGN KEY (organization_id, user_id)
        REFERENCES organization_memberships (organization_id, user_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_alert_notification_preferences_email
    ON alert_notification_preferences (organization_id)
    WHERE email_alerts_enabled=true;

CREATE TABLE IF NOT EXISTS alert_email_deliveries (
    organization_id    TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    alert_id           TEXT NOT NULL,
    occurrence_started_at TIMESTAMPTZ NOT NULL,
    user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status             TEXT NOT NULL CHECK (status IN ('sending', 'sent', 'failed')),
    attempt_count      INTEGER NOT NULL DEFAULT 1,
    last_attempt_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    sent_at            TIMESTAMPTZ,
    last_error         TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (organization_id, alert_id, occurrence_started_at, user_id)
);

CREATE INDEX IF NOT EXISTS idx_alert_email_deliveries_attempt
    ON alert_email_deliveries (status, last_attempt_at)
    WHERE status<>'sent';
