CREATE TABLE IF NOT EXISTS greenhouse_map_layout_history (
    organization_id TEXT NOT NULL,
    area_id          TEXT NOT NULL,
    revision         INTEGER NOT NULL CHECK (revision > 0),
    map_data         JSONB NOT NULL,
    valid_from       TIMESTAMPTZ NOT NULL,
    valid_to         TIMESTAMPTZ,
    source           TEXT NOT NULL DEFAULT 'recorded'
                     CHECK (source IN ('backfill', 'recorded')),
    recorded_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (organization_id, area_id, revision),
    CONSTRAINT greenhouse_map_layout_history_area_fkey
        FOREIGN KEY (organization_id, area_id)
        REFERENCES areas (organization_id, id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CHECK (jsonb_typeof(map_data) = 'object'),
    CHECK (valid_to IS NULL OR valid_to > valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_greenhouse_map_layout_history_open
    ON greenhouse_map_layout_history (organization_id, area_id)
    WHERE valid_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_greenhouse_map_layout_history_window
    ON greenhouse_map_layout_history (organization_id, area_id, valid_from, valid_to);

INSERT INTO greenhouse_map_layout_history (
    organization_id,
    area_id,
    revision,
    map_data,
    valid_from,
    valid_to,
    source,
    recorded_by
)
SELECT
    organization_id,
    area_id,
    revision,
    map_data,
    TIMESTAMPTZ '1970-01-01 00:00:00+00',
    NULL,
    'backfill',
    updated_by
FROM greenhouse_maps
ON CONFLICT (organization_id, area_id, revision) DO NOTHING;
