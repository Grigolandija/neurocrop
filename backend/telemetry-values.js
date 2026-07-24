const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;

export function normalizeTelemetryNumber(value) {
  if (value === undefined || value === null || value === '' || typeof value === 'boolean' || typeof value === 'object') {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

export function compactTelemetryMetadata(value, normalizedErrorFlags = {}) {
  const telemetry = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const sensors = {};

  for (const [sensor, state] of Object.entries(telemetry.sensors || {})) {
    const present = normalizeTelemetryBoolean(state?.present);
    if (present !== null) sensors[sensor] = { present };
  }

  const metadata = {};
  const expectedIntervalSec = normalizeTelemetryNumber(telemetry.expected_uplink_interval_s);
  if (expectedIntervalSec !== null) metadata.expected_uplink_interval_s = expectedIntervalSec;
  if (telemetry.firmware_version !== undefined && telemetry.firmware_version !== null) {
    metadata.firmware_version = String(telemetry.firmware_version).slice(0, 64);
  }
  if (Object.keys(sensors).length) metadata.sensors = sensors;
  const lastTxFailed = normalizeTelemetryBoolean(normalizedErrorFlags?.last_tx_failed);
  if (lastTxFailed !== null) metadata.error_flags = { last_tx_failed: lastTxFailed };

  return metadata;
}
