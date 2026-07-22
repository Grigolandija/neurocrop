import { normalizeTelemetryNumber } from './telemetry-values.js';

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validBand(value) {
  const numeric = Array.isArray(value) ? value.map(normalizeTelemetryNumber) : [];
  return Array.isArray(value)
    && value.length === 2
    && numeric.every((item) => item !== null)
    && numeric[0] < numeric[1];
}

export function validateCropProfileMetrics(metrics, { allowEmpty = true } = {}) {
  if (!isPlainObject(metrics)) return 'Metrics must be an object';
  const entries = Object.entries(metrics);
  if (!allowEmpty && entries.length === 0) return 'At least one metric is required';
  if (entries.length > 64) return 'Too many profile metrics';

  for (const [metricId, metric] of entries) {
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(metricId)) return `Invalid metric id: ${metricId}`;
    if (!isPlainObject(metric)) return `${metricId} must be an object`;
    if (!validBand(metric.optimal)) return `${metricId}.optimal must contain an increasing numeric minimum and maximum`;
    for (const bandName of ['warning', 'critical']) {
      if (metric[bandName] !== undefined && !validBand(metric[bandName])) {
        return `${metricId}.${bandName} must contain an increasing numeric minimum and maximum`;
      }
    }
    const scoreWeight = normalizeTelemetryNumber(metric.scoreWeight);
    if (metric.scoreWeight !== undefined
      && (scoreWeight === null || scoreWeight < 0 || scoreWeight > 3)) {
      return `${metricId}.scoreWeight must be between 0 and 3`;
    }
    if (metricId === 'lux' && metric.lightingSchedule !== undefined) {
      const schedule = metric.lightingSchedule;
      if (!isPlainObject(schedule)) return 'lux.lightingSchedule must be an object';
      if (schedule.enabled !== undefined && typeof schedule.enabled !== 'boolean') return 'lux.lightingSchedule.enabled must be boolean';
      for (const field of ['start', 'end']) {
        if (schedule[field] !== undefined && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(schedule[field]))) {
          return `lux.lightingSchedule.${field} must use HH:MM format`;
        }
      }
      const darkThresholdLux = normalizeTelemetryNumber(schedule.darkThresholdLux);
      if (schedule.darkThresholdLux !== undefined && (darkThresholdLux === null || darkThresholdLux < 0)) {
        return 'lux.lightingSchedule.darkThresholdLux must be zero or greater';
      }
    }
  }
  return null;
}
