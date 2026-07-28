CREATE TABLE IF NOT EXISTS push_subscriptions (
    id              TEXT PRIMARY KEY,
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint        TEXT NOT NULL UNIQUE,
    p256dh          TEXT NOT NULL,
    auth_secret     TEXT NOT NULL,
    user_agent      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_organization
  ON push_subscriptions (organization_id);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id);

CREATE TABLE IF NOT EXISTS push_deliveries (
    organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    alert_id        TEXT NOT NULL,
    subscription_id TEXT NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
    delivered_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, alert_id, subscription_id)
);

CREATE INDEX IF NOT EXISTS idx_push_deliveries_delivered
  ON push_deliveries (delivered_at);
