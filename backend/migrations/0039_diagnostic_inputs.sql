ALTER TABLE measurements ADD COLUMN ppfd REAL CHECK (ppfd IS NULL OR (ppfd>=0 AND ppfd<=5000));
ALTER TABLE measurement_rollups ADD COLUMN ppfd_sum DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE measurement_rollups ADD COLUMN ppfd_count INTEGER NOT NULL DEFAULT 0;
CREATE FUNCTION update_ppfd_rollup() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.ppfd IS NOT NULL AND measurement_sensor_available(NEW.raw_object,'par_probe') THEN
   UPDATE measurement_rollups SET ppfd_sum=ppfd_sum+NEW.ppfd,ppfd_count=ppfd_count+1
   WHERE dev_eui=NEW.dev_eui AND bucket_start=to_timestamp(floor(extract(epoch FROM NEW.time)/(bucket_minutes*60))*(bucket_minutes*60));
 END IF;
 RETURN NEW;
END $$;
-- PostgreSQL orders triggers by name; base rollups must exist before this update.
CREATE TRIGGER z_measurement_ppfd_rollup AFTER INSERT ON measurements FOR EACH ROW EXECUTE FUNCTION update_ppfd_rollup();
CREATE TABLE farms (
 id TEXT PRIMARY KEY,organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 name TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(organization_id,id)
);
ALTER TABLE areas ADD COLUMN farm_id TEXT;
ALTER TABLE areas ADD CONSTRAINT areas_farm_tenant_fk FOREIGN KEY(organization_id,farm_id) REFERENCES farms(organization_id,id);
