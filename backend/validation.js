function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function validBand(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every((item) => Number.isFinite(Number(item)))
    && Number(value[0]) < Number(value[1]);
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
    if (metricId === 'lux' && metric.lightingSchedule !== undefined) {
      const schedule = metric.lightingSchedule;
      if (!isPlainObject(schedule)) return 'lux.lightingSchedule must be an object';
      if (schedule.enabled !== undefined && typeof schedule.enabled !== 'boolean') return 'lux.lightingSchedule.enabled must be boolean';
      for (const field of ['start', 'end']) {
        if (schedule[field] !== undefined && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(schedule[field]))) {
          return `lux.lightingSchedule.${field} must use HH:MM format`;
        }
      }
      if (schedule.darkThresholdLux !== undefined && (!Number.isFinite(Number(schedule.darkThresholdLux)) || Number(schedule.darkThresholdLux) < 0)) {
        return 'lux.lightingSchedule.darkThresholdLux must be zero or greater';
      }
    }
  }
  return null;
}
