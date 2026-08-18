-- The unique (dev_eui, time) index can theoretically be scanned backwards for
-- latest-by-device reads, but PostgreSQL does not reliably choose it for the
-- parameterized LATERAL query used by the Readings batch endpoint.  Keep the
-- ordering explicit so each Node reads its own newest rows instead of scanning
-- the global time index and filtering tens of thousands of unrelated samples.
CREATE INDEX IF NOT EXISTS idx_measurements_deveui_time
  ON measurements (dev_eui, time DESC);
