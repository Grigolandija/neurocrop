export const DEFAULT_CROP_PROFILE_METRICS = Object.freeze({
  airTemp: { label: 'Air temperature', unit: 'degC', decimals: 1, optimal: [22, 26], warning: [20, 28], critical: [18, 30] },
  humidity: { label: 'Relative humidity', unit: '%', decimals: 0, optimal: [60, 70], warning: [55, 75], critical: [45, 85] },
  co2: { label: 'CO2', unit: 'ppm', decimals: 0, optimal: [900, 1100], warning: [750, 1250], critical: [550, 1500] },
  vpd: { label: 'VPD', unit: 'kPa', decimals: 2, optimal: [0.8, 1.2], warning: [0.6, 1.5], critical: [0.4, 1.8] },
  leafTemp: { label: 'Leaf temperature', unit: 'degC', decimals: 1, optimal: [20, 25], warning: [18, 27], critical: [15, 30] },
  soilTemp: { label: 'Substrate temperature', unit: 'degC', decimals: 1, optimal: [20, 24], warning: [18, 26], critical: [15, 30] },
  soilMoisture: { label: 'Substrate moisture', unit: '%', decimals: 0, optimal: [45, 65], warning: [37, 73], critical: [27, 83] },
  ec: { label: 'Nutrient EC', unit: 'mS/cm', decimals: 2, optimal: [1.8, 2.8], warning: [1.4, 3.2], critical: [0.8, 3.8] },
  soilEc: { label: 'Substrate EC', unit: 'mS/cm', decimals: 2, optimal: [1.5, 2.5], warning: [1.2, 2.9], critical: [0.7, 3.5] },
  ph: { label: 'Nutrient pH', unit: 'pH', decimals: 2, optimal: [5.8, 6.4], warning: [5.5, 6.8], critical: [5, 7.2] },
  waterTemp: { label: 'Water temperature', unit: 'degC', decimals: 1, optimal: [18, 22], warning: [16, 24], critical: [13, 28] },
  lux: {
    label: 'Light',
    unit: 'lx',
    decimals: 0,
    optimal: [10000, 35000],
    warning: [5000, 45000],
    critical: [0, 60000],
    lightingSchedule: {
      enabled: false,
      start: '06:00',
      end: '22:00',
      timeZone: 'Europe/Vilnius',
      darkThresholdLux: 100
    }
  }
});

export function defaultCropProfileMetricsJson() {
  return JSON.stringify(DEFAULT_CROP_PROFILE_METRICS);
}
