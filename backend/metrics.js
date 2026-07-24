export const METRIC_MAP = {
  temperature: 'airTemp',
  humidity: 'humidity',
  co2: 'co2',
  lux: 'lux',
  soil_temperature: 'soilTemp',
  soil_moisture: 'soilMoisture',
  ec: 'ec',
  ph: 'ph',
  soil_ec: 'soilEc',
  leaf_temperature: 'leafTemp',
  water_temperature: 'waterTemp',
  battery_percent: 'batteryLevel',
};
export const METRIC_UNITS = {
  airTemp: '°C', humidity: '%', co2: 'ppm', lux: 'lux',
  soilTemp: '°C', soilMoisture: '%', ec: 'mS/cm', ph: 'pH',
  soilEc: 'mS/cm', leafTemp: '°C', waterTemp: '°C',
  vpd: 'kPa', batteryLevel: '%',
};
export const METRIC_TO_COLUMN = {
  airTemp: 'temperature', humidity: 'humidity', co2: 'co2', lux: 'lux',
  soilTemp: 'soil_temperature', soilMoisture: 'soil_moisture', ec: 'ec', ph: 'ph',
  soilEc: 'soil_ec', leafTemp: 'leaf_temperature', waterTemp: 'water_temperature',
  batteryLevel: 'battery_percent',
};
export const METRIC_INTERVAL_SEC = {
  airTemp: 600, humidity: 600, co2: 1800, lux: 600,
  soilTemp: 600, soilMoisture: 600, ec: 900, ph: 900, soilEc: 900,
  leafTemp: 600, waterTemp: 600, batteryLevel: 21600,
};
