import fs from 'node:fs';

const registryPath = new URL('./metric-registry.json', import.meta.url);
const parsed = JSON.parse(fs.readFileSync(registryPath, 'utf8'));

if (parsed?.version !== 1 || !parsed.metrics || typeof parsed.metrics !== 'object') {
  throw new Error('Metric registry is missing or uses an unsupported version');
}

const uniqueRegistryValue = (name, values) => {
  if (new Set(values).size !== values.length) {
    throw new Error(`Metric registry contains duplicate ${name} values`);
  }
};

for (const [metricId, definition] of Object.entries(parsed.metrics)) {
  if (!definition.label || !definition.labelLt || typeof definition.unit !== 'string') {
    throw new Error(`Metric registry metadata is incomplete for ${metricId}`);
  }
  if (!Array.isArray(definition.physicalRange)
    || definition.physicalRange.length !== 2
    || !definition.physicalRange.every(Number.isFinite)
    || definition.physicalRange[0] >= definition.physicalRange[1]) {
    throw new Error(`Metric registry physical range is invalid for ${metricId}`);
  }
  if (Boolean(definition.telemetryKey) !== Boolean(definition.column)) {
    throw new Error(`Metric registry transport/storage mapping is incomplete for ${metricId}`);
  }
  if (definition.heatmap && !parsed.palettes?.[definition.heatmap.palette]) {
    throw new Error(`Metric registry heatmap palette is missing for ${metricId}`);
  }
}
uniqueRegistryValue('telemetryKey', Object.values(parsed.metrics).map((definition) => definition.telemetryKey).filter(Boolean));
uniqueRegistryValue('column', Object.values(parsed.metrics).map((definition) => definition.column).filter(Boolean));
uniqueRegistryValue('heatmap key', Object.values(parsed.metrics).map((definition) => definition.heatmap?.key).filter(Boolean));
uniqueRegistryValue('heatmap field', Object.values(parsed.metrics).map((definition) => definition.heatmap?.field).filter(Boolean));

export const METRIC_REGISTRY_VERSION = parsed.version;
export const METRIC_DEFINITIONS = Object.freeze(parsed.metrics);
export const METRIC_PALETTES = Object.freeze(parsed.palettes || {});

export function getMetricDefinition(metricId) {
  return METRIC_DEFINITIONS[metricId] || null;
}

export const METRIC_MAP = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS)
    .filter(([, definition]) => definition.telemetryKey && definition.column)
    .map(([metricId, definition]) => [definition.telemetryKey, metricId])
));

export const METRIC_TO_COLUMN = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS)
    .filter(([, definition]) => definition.column)
    .map(([metricId, definition]) => [metricId, definition.column])
));

export const METRIC_UNITS = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS).map(([metricId, definition]) => [metricId, definition.unit])
));

export const METRIC_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS).map(([metricId, definition]) => [metricId, definition.label])
));

export const METRIC_INTERVAL_SEC = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS).map(([metricId, definition]) => [metricId, definition.intervalSec])
));

export const METRIC_SENSOR_KEYS = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS)
    .filter(([, definition]) => definition.sensorKey)
    .map(([metricId, definition]) => [metricId, definition.sensorKey])
));

export const REGISTERED_TELEMETRY_DEFINITIONS = Object.freeze(
  Object.entries(METRIC_DEFINITIONS)
    .filter(([, definition]) => definition.telemetryKey && definition.column)
    .map(([metricId, definition]) => Object.freeze({
      metricId,
      telemetryKey: definition.telemetryKey,
      column: definition.column
    }))
);

export const PROFILE_METRIC_LIMITS = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS).map(([metricId, definition]) => [metricId, definition.physicalRange])
));

export const TELEMETRY_METRIC_RANGES = Object.freeze(Object.fromEntries(
  Object.values(METRIC_DEFINITIONS)
    .filter((definition) => definition.telemetryKey)
    .map((definition) => [definition.telemetryKey, definition.physicalRange])
));

export const DEFAULT_CROP_PROFILE_METRICS = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS)
    .filter(([, definition]) => definition.profile?.enabled)
    .map(([metricId, definition]) => [metricId, {
      label: definition.label,
      unit: definition.unit,
      decimals: definition.decimals,
      optimal: definition.profile.optimal,
      warning: definition.profile.warning,
      critical: definition.profile.critical,
      ...(definition.profile.lightingSchedule
        ? { lightingSchedule: definition.profile.lightingSchedule }
        : {})
    }])
));

export const DEFAULT_SCORE_RULES = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS).map(([metricId, definition]) => [metricId, {
    column: definition.column || metricId,
    optimal: definition.profile.optimal,
    warning: definition.profile.warning,
    critical: definition.profile.critical,
    growth: definition.profile.growth
  }])
));

export const AUTOMATIC_BAND_PADDING = Object.freeze(Object.fromEntries(
  Object.entries(METRIC_DEFINITIONS).map(([metricId, definition]) => [metricId, {
    warning: definition.profile.warningPadding,
    critical: definition.profile.criticalPadding,
    floor: definition.physicalRange[0],
    ceiling: definition.physicalRange[1]
  }])
));

export function defaultCropProfileMetricsJson() {
  return JSON.stringify(DEFAULT_CROP_PROFILE_METRICS);
}

export function profileMetricIds(section) {
  return Object.entries(METRIC_DEFINITIONS)
    .filter(([, definition]) => definition.profile?.enabled && definition.profile.section === section)
    .map(([metricId]) => metricId);
}
