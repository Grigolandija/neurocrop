-- Physical Node installation is entered once in Nodes and used by the 3D map.
-- Existing diagnostic metadata triggers retain each height change in history.
ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS installation_height_cm REAL,
  ADD COLUMN IF NOT EXISTS installation_height_recorded_at TIMESTAMPTZ,
  ADD CONSTRAINT nodes_installation_height_check
    CHECK (installation_height_cm IS NULL OR installation_height_cm BETWEEN 0 AND 10000);
