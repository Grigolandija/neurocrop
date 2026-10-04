-- Snapshot lifecycle/configuration changes, not every re-evaluation of a signal.
-- Raw observations and diagnostic episodes retain the detailed measurements.
CREATE OR REPLACE FUNCTION diagnostic_metadata_state(entity_name TEXT, item JSONB)
RETURNS JSONB LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE entity_name
    WHEN 'nodes' THEN item - ARRAY['last_seen','last_received_at','last_battery_mv','last_battery_percent','last_rssi','last_snr','last_spreading_factor','last_error_flags','last_error_counters','last_sensor_presence','last_gateway_ids']
    WHEN 'alert_workflows' THEN
      (item - ARRAY['updated_at','last_detected_at','context']) ||
      jsonb_build_object('context', COALESCE(item->'context','{}'::jsonb) - ARRAY['timestamp','currentValue','detail'])
    WHEN 'crop_risk_episodes' THEN item - ARRAY['last_detected_at','current_deviation','previous_deviation']
    ELSE item
  END
$$;

CREATE OR REPLACE FUNCTION capture_diagnostic_metadata() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item JSONB; tenant TEXT;
BEGIN
  item := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  tenant := item->>'organization_id';
  IF TG_OP='UPDATE' AND
    diagnostic_metadata_state(TG_TABLE_NAME,to_jsonb(OLD)) = diagnostic_metadata_state(TG_TABLE_NAME,item)
  THEN RETURN NEW; END IF;
  IF tenant IS NOT NULL AND EXISTS (SELECT 1 FROM organizations WHERE id=tenant) THEN
    INSERT INTO diagnostic_metadata_history(organization_id,entity,entity_id,operation,snapshot)
    VALUES(tenant,TG_TABLE_NAME,COALESCE(item->>'id',item->>'dev_eui',item->>'alert_id',item->>'risk_id',concat(item->>'node_dev_eui',':',item->>'port')),TG_OP,item);
  END IF;
  RETURN COALESCE(NEW,OLD);
END $$;

CREATE INDEX idx_diagnostic_history_retention ON diagnostic_metadata_history(recorded_at,id);
CREATE INDEX idx_diagnostic_history_entity ON diagnostic_metadata_history(organization_id,entity,entity_id,recorded_at DESC,id DESC);
