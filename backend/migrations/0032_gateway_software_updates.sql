ALTER TABLE gateways
  ADD COLUMN IF NOT EXISTS agent_version TEXT,
  ADD COLUMN IF NOT EXISTS target_agent_version TEXT,
  ADD COLUMN IF NOT EXISTS update_status TEXT NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS update_error TEXT,
  ADD COLUMN IF NOT EXISTS update_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS update_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS update_completed_at TIMESTAMPTZ;

ALTER TABLE gateways
  DROP CONSTRAINT IF EXISTS gateways_update_status_check;

ALTER TABLE gateways
  ADD CONSTRAINT gateways_update_status_check
  CHECK (update_status IN (
    'idle', 'scheduled', 'downloading', 'verifying', 'installing',
    'succeeded', 'failed', 'rolled_back'
  ));

CREATE TABLE IF NOT EXISTS gateway_update_policy (
  singleton          BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  release_version    TEXT,
  rollout_percent    INTEGER NOT NULL DEFAULT 0 CHECK (rollout_percent BETWEEN 0 AND 100),
  paused             BOOLEAN NOT NULL DEFAULT true,
  updated_by         TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO gateway_update_policy (singleton)
VALUES (true)
ON CONFLICT (singleton) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_gateways_update_status
  ON gateways (update_status, updated_at DESC);
