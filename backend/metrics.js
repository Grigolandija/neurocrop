export const METRIC_MAP = {
  temperature: 'airTemp',
  humidity: 'humidity',
  co2: 'co2',
  lux: 'lux',
  soil_temperature: 'soilTemp',
  battery_percent: 'batteryLevel',
};
export const METRIC_UNITS = {
  airTemp: '°C', humidity: '%', co2: 'ppm', lux: 'lux',
  soilTemp: '°C', vpd: 'kPa', batteryLevel: '%',
};
export const METRIC_TO_COLUMN = {
  airTemp: 'temperature', humidity: 'humidity', co2: 'co2', lux: 'lux',
  soilTemp: 'soil_temperature', batteryLevel: 'battery_percent',
};
export const METRIC_INTERVAL_SEC = {
  airTemp: 600, humidity: 600, co2: 1800, lux: 600,
  soilTemp: 600, batteryLevel: 21600,
};
