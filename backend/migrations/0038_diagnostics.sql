-- New observations retain their original meaning when nodes or profiles move.
CREATE TABLE diagnostic_contexts (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  area_id TEXT,
  section_id TEXT,
  node_id TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id,id)
);
ALTER TABLE measurements ADD COLUMN diagnostic_context_id TEXT;
ALTER TABLE measurements ADD COLUMN device_measured_at TIMESTAMPTZ;
CREATE INDEX idx_measurement_diagnostic_context ON measurements (diagnostic_context_id,time);
CREATE INDEX idx_diagnostic_context_area ON diagnostic_contexts(organization_id,area_id);

CREATE TABLE diagnostic_metadata_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  operation TEXT NOT NULL, snapshot JSONB NOT NULL
);
CREATE FUNCTION capture_diagnostic_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item JSONB; tenant TEXT;
BEGIN
  item := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  tenant := item->>'organization_id';
  IF TG_TABLE_NAME='nodes' AND TG_OP='UPDATE' AND
    (to_jsonb(OLD)-ARRAY['last_seen','last_received_at','last_battery_mv','last_battery_percent','last_rssi','last_snr','last_spreading_factor','last_error_flags','last_error_counters','last_sensor_presence','last_gateway_ids']) =
    (to_jsonb(NEW)-ARRAY['last_seen','last_received_at','last_battery_mv','last_battery_percent','last_rssi','last_snr','last_spreading_factor','last_error_flags','last_error_counters','last_sensor_presence','last_gateway_ids']) THEN RETURN NEW; END IF;
  IF tenant IS NOT NULL AND EXISTS (SELECT 1 FROM organizations WHERE id=tenant) THEN
    INSERT INTO diagnostic_metadata_history(organization_id,entity,entity_id,operation,snapshot)
    VALUES(tenant,TG_TABLE_NAME,COALESCE(item->>'id',item->>'dev_eui',item->>'alert_id',item->>'risk_id',concat(item->>'node_dev_eui',':',item->>'port')),TG_OP,item);
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER diagnostic_nodes AFTER INSERT OR UPDATE OR DELETE ON nodes FOR EACH ROW EXECUTE FUNCTION capture_diagnostic_metadata();
CREATE TRIGGER diagnostic_sections AFTER INSERT OR UPDATE OR DELETE ON sections FOR EACH ROW EXECUTE FUNCTION capture_diagnostic_metadata();
CREATE TRIGGER diagnostic_profiles AFTER INSERT OR UPDATE OR DELETE ON crop_profiles FOR EACH ROW EXECUTE FUNCTION capture_diagnostic_metadata();
CREATE TRIGGER diagnostic_sensors AFTER INSERT OR UPDATE OR DELETE ON node_sensor_configs FOR EACH ROW EXECUTE FUNCTION capture_diagnostic_metadata();

CREATE TABLE diagnostic_cycles (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  section_id TEXT NOT NULL, crop TEXT NOT NULL, cultivar TEXT, batch_id TEXT, experiment_id TEXT,
  stage TEXT NOT NULL DEFAULT '', starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ,
  CHECK (ends_at IS NULL OR ends_at>starts_at),
  FOREIGN KEY(organization_id,section_id) REFERENCES sections(organization_id,id) ON DELETE CASCADE
);
CREATE TABLE diagnostic_calibrations (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL, port TEXT NOT NULL, calibrated_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ, reference TEXT NOT NULL, uncertainty REAL,
  coefficients JSONB NOT NULL DEFAULT '{}', created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  CHECK (uncertainty IS NULL OR uncertainty>=0), CHECK (expires_at IS NULL OR expires_at>calibrated_at)
);
CREATE FUNCTION capture_measurement_diagnostic_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ctx JSONB; tenant TEXT; context_id TEXT;
BEGIN
  SELECT n.organization_id,jsonb_build_object('areaId',n.area_id,'sectionId',n.section_id,
    'nodeId',n.dev_eui,'nodeName',n.name,'source',n.source,'sectionName',s.name,'areaName',a.name,
    'profileId',s.crop_profile,'stage',p.stage,'metrics',COALESCE(p.metrics,'{}'::jsonb),
    'sensors',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM node_sensor_configs c WHERE c.node_dev_eui=n.dev_eui AND c.organization_id=n.organization_id),'[]'::jsonb),
    'cycles',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM diagnostic_cycles c WHERE c.organization_id=n.organization_id AND c.section_id=n.section_id AND c.starts_at<=NEW.time AND (c.ends_at IS NULL OR c.ends_at>NEW.time)),'[]'::jsonb),
    'calibrations',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM diagnostic_calibrations c WHERE c.organization_id=n.organization_id AND c.node_id=n.dev_eui AND c.calibrated_at<=NEW.time AND (c.expires_at IS NULL OR c.expires_at>NEW.time)),'[]'::jsonb))
  INTO tenant,ctx FROM nodes n
  LEFT JOIN sections s ON s.organization_id=n.organization_id AND s.id=n.section_id
  LEFT JOIN areas a ON a.organization_id=n.organization_id AND a.id=n.area_id
  LEFT JOIN crop_profiles p ON p.organization_id=n.organization_id AND p.id=s.crop_profile
  WHERE n.dev_eui=NEW.dev_eui;
  IF tenant IS NOT NULL THEN
    context_id := md5(tenant || ctx::text);
    INSERT INTO diagnostic_contexts(organization_id,id,area_id,section_id,node_id,snapshot)
    VALUES(tenant,context_id,ctx->>'areaId',ctx->>'sectionId',NEW.dev_eui,ctx) ON CONFLICT DO NOTHING;
    NEW.diagnostic_context_id := context_id;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER measurement_diagnostic_context BEFORE INSERT ON measurements FOR EACH ROW EXECUTE FUNCTION capture_measurement_diagnostic_context();

CREATE TABLE diagnostic_episodes (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  signal_key TEXT NOT NULL, area_id TEXT, section_id TEXT, node_id TEXT, metric TEXT NOT NULL,
  kind TEXT NOT NULL, severity TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL,
  last_observed_at TIMESTAMPTZ NOT NULL, ended_at TIMESTAMPTZ, resolution_reason TEXT,
  evidence JSONB NOT NULL, method_version TEXT NOT NULL,
  CHECK (ended_at IS NULL OR ended_at>=started_at)
);
CREATE UNIQUE INDEX idx_diagnostic_open_signal ON diagnostic_episodes(organization_id,signal_key) WHERE ended_at IS NULL;
CREATE INDEX idx_diagnostic_episodes_window ON diagnostic_episodes(organization_id,area_id,started_at);
CREATE TABLE diagnostic_detector_state (
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 cursor_id BIGINT NOT NULL DEFAULT 0, state JSONB NOT NULL DEFAULT '{}', updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Keep old workflow snapshots as evidence as well as the new event-time episodes.
CREATE TRIGGER diagnostic_alert_history AFTER INSERT OR UPDATE ON alert_workflows FOR EACH ROW EXECUTE FUNCTION capture_diagnostic_metadata();
CREATE TRIGGER diagnostic_risk_history AFTER INSERT OR UPDATE ON crop_risk_episodes FOR EACH ROW EXECUTE FUNCTION capture_diagnostic_metadata();
CREATE TABLE diagnostic_reports (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 area_id TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL, snapshot JSONB NOT NULL,
 schedule_key TEXT UNIQUE
);
CREATE INDEX idx_diagnostic_reports_org ON diagnostic_reports(organization_id,created_at DESC);
CREATE TABLE diagnostic_schedules (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 area_id TEXT NOT NULL, days INTEGER NOT NULL CHECK(days IN(7,14,30)),
 enabled BOOLEAN NOT NULL DEFAULT false, next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 time_zone TEXT NOT NULL DEFAULT 'Europe/Vilnius', PRIMARY KEY(organization_id,area_id),
 FOREIGN KEY(organization_id,area_id) REFERENCES areas(organization_id,id) ON DELETE CASCADE
);
CREATE TABLE diagnostic_controller_events (
 id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 area_id TEXT NOT NULL, section_id TEXT, occurred_at TIMESTAMPTZ NOT NULL,
 source TEXT NOT NULL CHECK(source IN('controller','manual')), device_id TEXT NOT NULL,
 channel TEXT NOT NULL, state JSONB NOT NULL, external_id TEXT NOT NULL,
 UNIQUE(organization_id,device_id,external_id),
 FOREIGN KEY(organization_id,area_id) REFERENCES areas(organization_id,id) ON DELETE CASCADE
);

-- A durable queue avoids skipping a slow transaction whose sequence id commits
-- after a later id. Queue acknowledgement and detector state commit together.
CREATE TABLE diagnostic_observation_queue (
 measurement_id BIGINT PRIMARY KEY,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 enqueued_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diagnostic_queue_tenant ON diagnostic_observation_queue(organization_id,measurement_id);
CREATE FUNCTION enqueue_diagnostic_observation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO diagnostic_observation_queue(measurement_id,organization_id)
 SELECT NEW.id,organization_id FROM diagnostic_contexts WHERE id=NEW.diagnostic_context_id
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER diagnostic_enqueue AFTER INSERT ON measurements FOR EACH ROW EXECUTE FUNCTION enqueue_diagnostic_observation();
