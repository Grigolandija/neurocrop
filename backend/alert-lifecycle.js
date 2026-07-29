import { METRIC_LABELS, METRIC_UNITS } from './metrics.js';

function latestTimestamp(values) {
  const timestamps = values
    .map((value) => new Date(value || 0).getTime())
    .filter(Number.isFinite);
  return timestamps.length ? new Date(Math.max(...timestamps)).toISOString() : null;
}

function displayNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function metricAlert(snapshot, evaluation) {
  const target = snapshot.scoreRules?.[evaluation.metricId]?.optimal;
  if (!Array.isArray(target) || target.length !== 2) return null;
  const label = snapshot.profileMetrics?.[evaluation.metricId]?.label
    || METRIC_LABELS[evaluation.metricId]
    || evaluation.metricId;
  const unit = snapshot.profileMetrics?.[evaluation.metricId]?.unit
    || METRIC_UNITS[evaluation.metricId]
    || '';
  const direction = evaluation.direction === 'low' ? 'below' : evaluation.direction === 'high' ? 'above' : 'outside';
  const current = displayNumber(evaluation.value);
  const targetLow = displayNumber(target[0]);
  const targetHigh = displayNumber(target[1]);
  const unitSuffix = unit ? ` ${unit}` : '';
  const timestamp = snapshot.observedAtByMetric?.[evaluation.metricId] || snapshot.latestReceivedAt || null;

  return {
    id: `metric:${snapshot.section.area_id}:${snapshot.section.id}:${evaluation.metricId}`,
    kind: 'metric',
    tone: evaluation.state === 'critical' ? 'critical' : 'warning',
    siteId: snapshot.section.area_id,
    siteName: snapshot.section.area_name || snapshot.section.area_id,
    zoneId: snapshot.section.id,
    zoneName: snapshot.section.name,
    metricKey: evaluation.metricId,
    title: `${label} ${direction} target`,
    detail: current === null
      ? 'Current value is unavailable'
      : `Current ${current}${unitSuffix} · target ${targetLow}–${targetHigh}${unitSuffix}`,
    timestamp,
    icon: 'fa-triangle-exclamation',
    currentValue: Number(evaluation.value),
    targetLow: Number(target[0]),
    targetHigh: Number(target[1]),
    unit,
    direction
  };
}

function offlineAlert(snapshot, node, index) {
  if (snapshot.nodeStatuses?.[index] !== 'offline') return null;
  const devEui = String(node.dev_eui || '').trim().toLowerCase();
  if (!devEui) return null;
  const timestamp = node.last_received_at || node.last_seen || snapshot.measurements?.[index]?.time || null;
  const nodeName = node.name || devEui;
  return {
    id: `offline:${snapshot.section.area_id}:${snapshot.section.id}:${devEui}`,
    kind: 'offline',
    tone: 'offline',
    siteId: snapshot.section.area_id,
    siteName: snapshot.section.area_name || snapshot.section.area_id,
    zoneId: snapshot.section.id,
    zoneName: snapshot.section.name,
    nodeId: devEui,
    title: 'Node has stopped reporting',
    detail: `${nodeName} · no recent uplink`,
    timestamp,
    icon: 'fa-link-slash'
  };
}

export function buildCanonicalAlertState(sectionSnapshots = []) {
  const alerts = sectionSnapshots.flatMap((snapshot) => {
    const metricAlerts = (snapshot.evaluations || [])
      .filter((evaluation) =>
        ['warning', 'critical'].includes(evaluation.state)
        && snapshot.scoreRules?.[evaluation.metricId]?.growth !== false
      )
      .map((evaluation) => metricAlert(snapshot, evaluation))
      .filter(Boolean);
    const offlineAlerts = (snapshot.nodes || [])
      .map((node, index) => offlineAlert(snapshot, node, index))
      .filter(Boolean);
    return [...metricAlerts, ...offlineAlerts];
  });

  const toneRank = { critical: 0, warning: 1, offline: 2 };
  const sortedAlerts = alerts.sort((left, right) =>
    (toneRank[left.tone] ?? 3) - (toneRank[right.tone] ?? 3)
    || new Date(right.timestamp || 0) - new Date(left.timestamp || 0)
  );
  const clearableIds = sectionSnapshots.flatMap((snapshot) => [
    ...(snapshot.evaluations || [])
      .filter((evaluation) =>
        evaluation.state === 'optimal'
        && snapshot.scoreRules?.[evaluation.metricId]?.growth !== false
      )
      .map((evaluation) => `metric:${snapshot.section.area_id}:${snapshot.section.id}:${evaluation.metricId}`),
    ...(snapshot.nodes || [])
      .filter((_, index) => ['live', 'delayed'].includes(snapshot.nodeStatuses?.[index]))
      .map((node) => `offline:${snapshot.section.area_id}:${snapshot.section.id}:${String(node.dev_eui || '').trim().toLowerCase()}`)
      .filter((id) => !id.endsWith(':'))
  ]);

  return { alerts: sortedAlerts, clearableIds: [...new Set(clearableIds)] };
}

export function buildCanonicalAlerts(sectionSnapshots = []) {
  return buildCanonicalAlertState(sectionSnapshots).alerts;
}

export function canonicalAlertContext(alert) {
  return {
    id: alert.id,
    kind: alert.kind,
    tone: alert.tone,
    siteId: alert.siteId,
    siteName: alert.siteName,
    zoneId: alert.zoneId,
    zoneName: alert.zoneName,
    nodeId: alert.nodeId || '',
    metricKey: alert.metricKey || '',
    title: alert.title,
    detail: alert.detail,
    timestamp: alert.timestamp || '',
    icon: alert.icon,
    ...(Number.isFinite(alert.currentValue) ? { currentValue: alert.currentValue } : {}),
    ...(Number.isFinite(alert.targetLow) ? { targetLow: alert.targetLow } : {}),
    ...(Number.isFinite(alert.targetHigh) ? { targetHigh: alert.targetHigh } : {}),
    ...(alert.unit ? { unit: alert.unit } : {}),
    ...(alert.direction ? { direction: alert.direction } : {})
  };
}
