const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

const TELEMETRY_RANGES = Object.freeze({
  temperature: [-80, 80],
  humidity: [0, 100],
  co2: [0, 100000],
  lux: [0, 2000000],
  soil_temperature: [-80, 80],
  soil_moisture: [0, 100],
  ec: [0, 100],
  ph: [0, 14],
  soil_ec: [0, 100],
  leaf_temperature: [-80, 80],
  water_temperature: [-80, 100],
  air_pressure: [300, 1200],
  battery_mv: [0, 20000],
  battery_percent: [0, 100],
  firmware_build: [0, 2147483647],
  expected_uplink_interval_s: [1, 86400],
  error_counter: [0, 65535],
  rssi: [-200, 0],
  snr: [-50, 50],
  spreading_factor: [5, 12],
});

export function normalizeTelemetryNumber(value) {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean' || typeof value === 'object') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function normalizeTelemetryValue(metric, value) {
  const numeric = normalizeTelemetryNumber(value);
  const range = TELEMETRY_RANGES[metric];
  if (numeric === null || !range) return null;
  return numeric >= range[0] && numeric <= range[1] ? numeric : null;
}

export function redactConnectionUrl(value) {
  try {
    const url = new URL(String(value));
    if (!url.protocol || !url.hostname) return '[invalid URL]';
    url.username = '';
    url.password = '';
    return url.toString();
  } catch {
    return '[invalid URL]';
  }
}

export function normalizeTelemetryBoolean(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
}

export function normalizeTelemetryTimestamp(value, now = new Date()) {
  const fallback = new Date(now);
  const candidate = value ? new Date(value) : fallback;
  if (!Number.isFinite(candidate.getTime()) || candidate.getTime() > fallback.getTime() + MAX_FUTURE_SKEW_MS) {
    return fallback;
  }
  return candidate;
}

export function normalizeSoilEcDepths(value) {
  const telemetry = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const readings = new Map();
  const add = (depthValue, measurementValue) => {
    const depthCm = normalizeTelemetryNumber(String(depthValue).replace(/cm$/i, ''));
    const measurement = normalizeTelemetryValue('soil_ec', measurementValue);
    if (depthCm === null || depthCm <= 0 || depthCm > 500 || measurement === null) return;
    readings.set(depthCm, { depthCm, value: measurement });
  };
  const profile = telemetry.soil_ec_depths
    ?? telemetry.soil_ec_by_depth
    ?? telemetry.soilEcByDepth
    ?? (telemetry.soil_ec && typeof telemetry.soil_ec === 'object' ? telemetry.soil_ec : undefined);
  if (Array.isArray(profile)) {
    profile.forEach((reading) => {
      if (!reading || typeof reading !== 'object' || Array.isArray(reading)) return;
      add(reading.depth_cm ?? reading.depthCm ?? reading.depth, reading.value ?? reading.soil_ec ?? reading.soilEc);
    });
  } else if (profile && typeof profile === 'object') {
    Object.entries(profile).forEach(([depth, measurement]) => add(depth, measurement));
  }
  Object.entries(telemetry).forEach(([key, measurement]) => {
    const match = key.match(/^soil_ec_(?:depth_)?(\d+(?:\.\d+)?)(?:_?cm)?$/i);
    if (match) add(match[1], measurement);
  });
  return [...readings.values()].sort((left, right) => left.depthCm - right.depthCm);
}

export function compactTelemetryMetadata(value, normalizedErrorFlags = {}) {
  const telemetry = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sensors = {};

  for (const [sensor, state] of Object.entries(telemetry.sensors || {})) {
    const present = normalizeTelemetryBoolean(state?.present);
    if (present !== null) sensors[sensor] = { present };
  }

  const metadata = {};
  const expectedIntervalSec = normalizeTelemetryValue('expected_uplink_interval_s', telemetry.expected_uplink_interval_s);
  if (expectedIntervalSec !== null) metadata.expected_uplink_interval_s = expectedIntervalSec;
  if (telemetry.firmware_version !== undefined && telemetry.firmware_version !== null) {
    metadata.firmware_version = String(telemetry.firmware_version).slice(0, 64);
  }
  if (Object.keys(sensors).length) metadata.sensors = sensors;
  const soilEcDepths = normalizeSoilEcDepths(telemetry);
  if (soilEcDepths.length) metadata.soil_ec_depths = soilEcDepths;
  const lastTxFailed = normalizeTelemetryBoolean(normalizedErrorFlags?.last_tx_failed);
  if (lastTxFailed !== null) metadata.error_flags = { last_tx_failed: lastTxFailed };

  return metadata;
}
