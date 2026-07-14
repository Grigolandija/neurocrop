const PROFILE_INTERVALS_SEC = {
  normal: 300,
  intensive: 60,
  power_save: 900
};

const FLAG_DEFINITIONS = {
  boot_fault: { severity: 'fault', label: 'Boot initialization fault' },
  sensor_missing: { severity: 'fault', label: 'Expected sensor missing' },
  battery_critical: { severity: 'fault', label: 'Battery critically low' },
  sensor_stale: { severity: 'watch', label: 'Sensor reading stale' },
  tx_timeout: { severity: 'watch', label: 'Transmission timeout recovery' },
  watchdog_reset: { severity: 'watch', label: 'Watchdog reset reported' },
  last_tx_failed: { severity: 'watch', label: 'Last transmission failed' },
  join_backoff: { severity: 'watch', label: 'Network join backoff active' },
  battery_low: { severity: 'watch', label: 'Battery low' }
};

function isActiveFlag(value) {
  if (typeof value === 'string') {
    return ['true', '1'].includes(value.trim().toLowerCase());
  }
  return value === true || value === 1;
}

export function expectedUplinkIntervalSec(profile) {
  const key = String(profile || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  return PROFILE_INTERVALS_SEC[key] || PROFILE_INTERVALS_SEC.normal;
}

export function normalizeErrorFlags(flags) {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)) return {};
  return Object.fromEntries(Object.entries(flags).map(([key, value]) => {
    if (key === 'raw') {
      const raw = Number(value);
      return [key, Number.isFinite(raw) ? raw : 0];
    }
    return [key, isActiveFlag(value)];
  }));
}

export function normalizeErrorCounters(counters, flags = {}) {
  const source = counters && typeof counters === 'object' && !Array.isArray(counters) ? counters : {};
  const normalizedFlags = normalizeErrorFlags(flags);
  const normalized = {
    read_fail: normalizeCounter(source.read_fail),
    reinit: normalizeCounter(source.reinit),
    tx_fail: normalizeCounter(source.tx_fail)
  };

  // v2.1.4 counted harmless probes of optional sensors as reinitialisations.
  if (normalized.read_fail === 0 && !normalizedFlags.sensor_missing && !normalizedFlags.sensor_stale) {
    normalized.reinit = 0;
  }
  return normalized;
}

export function buildNodeHealth({ transportStatus, errorFlags, errorCounters } = {}) {
  const flags = normalizeErrorFlags(errorFlags);
  const counters = normalizeErrorCounters(errorCounters, flags);

  if (transportStatus === 'offline') {
    return {
      state: 'offline',
      label: 'Offline',
      detail: 'No recent uplink',
      reasons: [{ code: 'offline', severity: 'fault', label: 'No recent uplink' }],
      diagnostics: { counters }
    };
  }

  const reasons = Object.entries(flags)
    .filter(([key, value]) => key !== 'raw' && isActiveFlag(value))
    .map(([code]) => ({
      code,
      ...(FLAG_DEFINITIONS[code] || { severity: 'watch', label: `Device reported ${code.replace(/_/g, ' ')}` })
    }))
    .sort((left, right) => Number(right.severity === 'fault') - Number(left.severity === 'fault'));

  const state = reasons.some((reason) => reason.severity === 'fault')
    ? 'fault'
    : reasons.length
      ? 'watch'
      : 'healthy';
  const label = state === 'fault' ? 'Fault' : state === 'watch' ? 'Watch' : 'Healthy';

  return {
    state,
    label,
    detail: reasons.length ? reasons.map((reason) => reason.label).join(' · ') : 'No active device faults',
    reasons,
    diagnostics: { counters }
  };
}

function normalizeCounter(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(15, Math.trunc(number))) : 0;
}
