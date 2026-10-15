-- Bounded, immutable reception evidence. Historical tenant ownership is preserved.
ALTER TABLE nodes ADD COLUMN last_uplink_interval_sec INTEGER
  CHECK(last_uplink_interval_sec BETWEEN 1 AND 86400);

CREATE TABLE uplink_events (
  id TEXT PRIMARY KEY,
  dev_eui TEXT NOT NULL REFERENCES nodes(dev_eui) ON UPDATE CASCADE ON DELETE CASCADE,
  organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
  received_at TIMESTAMPTZ NOT NULL,
  measured_at TIMESTAMPTZ NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_event_id TEXT,
  frame_counter BIGINT,
  f_port INTEGER,
  raw_payload TEXT,
  firmware_version TEXT,
  decoder_version TEXT,
  normalizer_version TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('stored','measurement_duplicate')),
  evidence JSONB NOT NULL,
  CHECK(octet_length(COALESCE(raw_payload,'')) <= 4096)
);
CREATE INDEX uplink_events_node_time ON uplink_events(dev_eui, received_at DESC, id);
CREATE INDEX uplink_events_expiry ON uplink_events(recorded_at);

-- The event is written after the observation, in the same transaction.
ALTER TABLE measurements ADD COLUMN uplink_event_id TEXT;
ALTER TABLE measurements ADD CONSTRAINT measurements_uplink_event_fk
  FOREIGN KEY(uplink_event_id) REFERENCES uplink_events(id)
  ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE node_acceptance_runs (
  id TEXT PRIMARY KEY,
  dev_eui TEXT NOT NULL REFERENCES nodes(dev_eui) ON UPDATE CASCADE ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deadline_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  expected_firmware TEXT NOT NULL,
  firmware_sha256 TEXT NOT NULL,
  expected_sensors JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','passed','failed')),
  result JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX node_acceptance_runs_latest ON node_acceptance_runs(dev_eui, started_at DESC);
