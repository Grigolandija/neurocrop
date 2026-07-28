ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'physical',
  ADD COLUMN IF NOT EXISTS simulation_profile JSONB;

ALTER TABLE nodes
  DROP CONSTRAINT IF EXISTS nodes_source_check,
  DROP CONSTRAINT IF EXISTS nodes_simulation_profile_check;

ALTER TABLE nodes
  ADD CONSTRAINT nodes_source_check
    CHECK (source IN ('physical', 'simulated')),
  ADD CONSTRAINT nodes_simulation_profile_check
    CHECK (
      source <> 'simulated'
      OR (
        simulation_profile IS NOT NULL
        AND jsonb_typeof(simulation_profile) = 'object'
      )
    );

CREATE INDEX IF NOT EXISTS idx_nodes_active_simulated
  ON nodes (factory_status, dev_eui)
  WHERE source = 'simulated' AND archived_at IS NULL;

INSERT INTO nodes (
  dev_eui,
  name,
  node_type,
  factory_serial,
  factory_status,
  factory_provisioned_at,
  factory_firmware_version,
  source,
  simulation_profile
)
VALUES
  ('f100000000000001', 'SIM-000001', 'air', 'SIM-000001', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":24,"humidity":50,"co2":950,"lux":32000,"soil_temperature":21.5,"soil_moisture":55,"ec":1.8,"ph":6.2,"soil_ec":1.5,"leaf_temperature":23.1,"water_temperature":20,"battery_percent":92}'::jsonb),
  ('f100000000000002', 'SIM-000002', 'air', 'SIM-000002', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":19,"humidity":70,"co2":720,"lux":18000,"soil_temperature":18,"soil_moisture":68,"ec":1.3,"ph":5.9,"soil_ec":1.1,"leaf_temperature":18.2,"water_temperature":17.5,"battery_percent":87}'::jsonb),
  ('f100000000000003', 'SIM-000003', 'air', 'SIM-000003', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":27,"humidity":42,"co2":1200,"lux":42000,"soil_temperature":24,"soil_moisture":38,"ec":2.4,"ph":6.5,"soil_ec":2.1,"leaf_temperature":28,"water_temperature":22,"battery_percent":78}'::jsonb),
  ('f100000000000004', 'SIM-000004', 'air', 'SIM-000004', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":21.5,"humidity":60,"co2":800,"lux":26000,"soil_temperature":20,"soil_moisture":62,"ec":1.6,"ph":6,"soil_ec":1.4,"leaf_temperature":20.8,"water_temperature":19,"battery_percent":96}'::jsonb),
  ('f100000000000005', 'SIM-000005', 'air', 'SIM-000005', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":30,"humidity":35,"co2":1450,"lux":50000,"soil_temperature":26,"soil_moisture":30,"ec":2.8,"ph":6.8,"soil_ec":2.5,"leaf_temperature":31,"water_temperature":24,"battery_percent":65}'::jsonb),
  ('f100000000000006', 'SIM-000006', 'air', 'SIM-000006', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":17,"humidity":78,"co2":650,"lux":12000,"soil_temperature":16,"soil_moisture":75,"ec":1,"ph":5.7,"soil_ec":0.9,"leaf_temperature":16.2,"water_temperature":15.5,"battery_percent":83}'::jsonb),
  ('f100000000000007', 'SIM-000007', 'air', 'SIM-000007', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":23,"humidity":58,"co2":1050,"lux":35000,"soil_temperature":21,"soil_moisture":48,"ec":2,"ph":6.3,"soil_ec":1.7,"leaf_temperature":22,"water_temperature":19.5,"battery_percent":74}'::jsonb),
  ('f100000000000008', 'SIM-000008', 'air', 'SIM-000008', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":25.5,"humidity":66,"co2":880,"lux":22000,"soil_temperature":23,"soil_moisture":72,"ec":1.4,"ph":5.8,"soil_ec":1.2,"leaf_temperature":24.6,"water_temperature":21,"battery_percent":69}'::jsonb),
  ('f100000000000009', 'SIM-000009', 'air', 'SIM-000009', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":20,"humidity":45,"co2":560,"lux":40000,"soil_temperature":18.5,"soil_moisture":44,"ec":2.2,"ph":6.6,"soil_ec":1.9,"leaf_temperature":19,"water_temperature":18,"battery_percent":90}'::jsonb),
  ('f10000000000000a', 'SIM-000010', 'air', 'SIM-000010', 'unassigned', now(), 'simulator-1.0', 'simulated',
   '{"temperature":28,"humidity":82,"co2":1300,"lux":15000,"soil_temperature":25,"soil_moisture":80,"ec":2.6,"ph":6.1,"soil_ec":2.3,"leaf_temperature":27,"water_temperature":23,"battery_percent":58}'::jsonb)
ON CONFLICT (dev_eui) DO NOTHING;
