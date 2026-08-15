-- Freshness monitoring uses MAX(received_at).  A descending index avoids a
-- full measurements-table scan as retained history grows.
CREATE INDEX IF NOT EXISTS idx_measurements_received_at_desc
  ON measurements (received_at DESC);
