ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_clerk_user_id
  ON users (clerk_user_id)
  WHERE clerk_user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS clerk_session_contexts (
    session_id      TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clerk_session_contexts_user
  ON clerk_session_contexts (user_id);

CREATE INDEX IF NOT EXISTS idx_clerk_session_contexts_organization
  ON clerk_session_contexts (organization_id);
