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
