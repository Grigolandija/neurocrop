-- Legacy inventory can contain mixed-case DevEUIs, while API input is normalized.
-- These indexes keep case-insensitive ownership and history operations bounded.
CREATE INDEX IF NOT EXISTS idx_nodes_dev_eui_lower
  ON nodes (lower(dev_eui));

CREATE INDEX IF NOT EXISTS idx_measurements_dev_eui_lower
  ON measurements (lower(dev_eui));
