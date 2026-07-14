ALTER TABLE measurements
  DROP CONSTRAINT IF EXISTS measurements_dev_eui_fkey;

ALTER TABLE measurements
  ADD CONSTRAINT measurements_dev_eui_fkey
  FOREIGN KEY (dev_eui) REFERENCES nodes(dev_eui) ON UPDATE CASCADE;

ALTER TABLE node_sensor_configs
  DROP CONSTRAINT IF EXISTS node_sensor_configs_node_dev_eui_fkey;

ALTER TABLE node_sensor_configs
  ADD CONSTRAINT node_sensor_configs_node_dev_eui_fkey
  FOREIGN KEY (node_dev_eui) REFERENCES nodes(dev_eui) ON UPDATE CASCADE ON DELETE CASCADE;
