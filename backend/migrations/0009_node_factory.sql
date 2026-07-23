ALTER TABLE nodes
    ADD COLUMN IF NOT EXISTS factory_serial TEXT,
    ADD COLUMN IF NOT EXISTS factory_status TEXT,
    ADD COLUMN IF NOT EXISTS factory_provisioned_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS factory_firmware_version TEXT;

UPDATE nodes
SET factory_status = CASE
    WHEN organization_id IS NULL THEN 'unassigned'
    ELSE 'assigned'
END
WHERE factory_status IS NULL;

ALTER TABLE nodes
    ALTER COLUMN factory_status SET DEFAULT 'unassigned',
    ALTER COLUMN factory_status SET NOT NULL;

ALTER TABLE nodes
    DROP CONSTRAINT IF EXISTS nodes_factory_status_check;

ALTER TABLE nodes
    ADD CONSTRAINT nodes_factory_status_check
    CHECK (factory_status IN ('unassigned', 'assigned', 'retired'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_nodes_factory_serial_unique
    ON nodes (factory_serial)
    WHERE factory_serial IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nodes_factory_inventory
    ON nodes (factory_status, factory_provisioned_at DESC);
