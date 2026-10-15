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

export function gatewayAssociationStatus(gatewayIds, gateways, now = Date.now(), graceSec = 180) {
  const ids = new Set(
    (Array.isArray(gatewayIds) ? gatewayIds : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter((value) => /^[0-9a-f]{16}$/.test(value))
  );
  if (ids.size === 0) return 'unknown';

  const associated = (Array.isArray(gateways) ? gateways : [])
    .filter((gateway) => ids.has(String(gateway?.gateway_id || gateway?.gatewayId || '').trim().toLowerCase()));
  if (associated.length === 0) return 'unknown';

  const graceMs = Math.max(60, Number(graceSec) || 180) * 1000;
  const online = associated.some((gateway) => {
    if (String(gateway?.status || '').toLowerCase() !== 'online') return false;
    const lastSeenMs = new Date(gateway?.last_seen_at || gateway?.lastSeenAt || '').getTime();
    return Number.isFinite(lastSeenMs) && now - lastSeenMs <= graceMs;
  });
  return online ? 'online' : 'offline';
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

export function buildNodeHealth({ transportStatus, gatewayStatus, errorFlags, errorCounters } = {}) {
  const flags = normalizeErrorFlags(errorFlags);
  const counters = normalizeErrorCounters(errorCounters, flags);

  if (transportStatus === 'offline') {
    const gatewayOffline = gatewayStatus === 'offline';
    return {
      state: 'offline',
      label: 'Offline',
      detail: gatewayOffline ? 'Last receiving gateway is offline' : 'No recent uplink',
      reasons: [{
        code: gatewayOffline ? 'gateway_offline' : 'offline',
        severity: 'fault',
        label: gatewayOffline ? 'Gateway offline' : 'No recent uplink'
      }],
      diagnostics: { counters }
    };
  }

  if (transportStatus === 'delayed' || transportStatus === 'stale') {
    const stale = transportStatus === 'stale';
    return {
      state: 'watch',
      label: stale ? 'Uplink stale' : 'Uplink delayed',
      detail: stale ? 'Multiple expected uplinks are missing' : 'The latest expected uplink is late',
      reasons: [{
        code: stale ? 'uplink_stale' : 'uplink_delayed',
        severity: 'watch',
        label: stale ? 'Uplink stale' : 'Uplink delayed'
      }],
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

// Operational evidence only. Elapsed intervals are not a packet-loss estimate.
export function buildNodeSupport(node, now = Date.now()) {
  const reported = node.last_uplink_interval_sec;
  const expectedIntervalSec = Number.isInteger(reported) && reported >= 1 && reported <= 86400
    ? reported : expectedUplinkIntervalSec(node.last_profile);
  const lastReceivedAt = node.last_received_at || node.last_seen || null;
  const received = lastReceivedAt ? +new Date(lastReceivedAt) : NaN;
  const ageSec = Number.isFinite(received) ? Math.max(0, Math.floor((now - received) / 1000)) : null;
  const gateways = Array.isArray(node.receiving_gateways) ? node.receiving_gateways : [];
  const known = gateways.filter(g => g.lastSeenAt && Number.isFinite(+new Date(g.lastSeenAt)));
  const gatewayStatus = known.some(g => now - +new Date(g.lastSeenAt) <= 180_000) ? 'online'
    : known.length === gateways.length && known.length > 0 ? 'offline' : 'unknown';
  const flags = normalizeErrorFlags(node.last_error_flags);
  const elapsedIntervals = ageSec === null ? null : Math.floor(ageSec / expectedIntervalSec);
  const code = ageSec === null ? 'never_received'
    : ageSec > expectedIntervalSec * 2 ? (gatewayStatus === 'offline' ? 'gateway_unavailable' : gatewayStatus === 'online' ? 'node_unavailable' : 'connection_unknown')
    : flags.sensor_missing || flags.sensor_stale ? 'sensor_unavailable'
    : flags.battery_critical || flags.battery_low ? 'battery_attention'
    : Object.entries(flags).some(([key, value]) => key !== 'raw' && value === true) ? 'device_attention' : 'reporting';
  return { code, expectedIntervalSec, elapsedIntervals, lastReceivedAt,
    gatewayStatus, evidenceAt: new Date(now).toISOString() };
}

function normalizeCounter(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(15, Math.trunc(number))) : 0;
}
