ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS last_gateway_ids TEXT[] NOT NULL DEFAULT '{}'::text[];

