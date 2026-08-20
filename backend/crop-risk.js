import { calcVPD } from './calculations.js';
import { METRIC_TO_COLUMN } from './metrics.js';
import { getActionVerificationPolicy } from './today-actions.js';
import { normalizeTelemetryNumber } from './telemetry-values.js';

const CAUSE_HINTS = {
  airTemp: 'Uneven heating, ventilation, shading, or air circulation',
  humidity: 'Uneven air exchange, humidification, or canopy airflow',
  vpd: 'Uneven temperature, humidity, or canopy airflow',
  co2: 'Uneven CO₂ delivery, ventilation, or air mixing',
  lux: 'Uneven lighting, shading, or sensor exposure',
  soilTemp: 'Uneven root-zone heating or irrigation-water temperature',
  soilMoisture: 'Uneven irrigation delivery, drainage, or substrate condition',
  soilEc: 'Uneven nutrient delivery, dryback, or salt accumulation',
  ec: 'Uneven nutrient mixing, dosing, or distribution',
  ph: 'Uneven solution mixing, dosing, or probe calibration',
  leafTemp: 'Uneven canopy airflow, radiation, or water availability',
  waterTemp: 'Uneven tank or irrigation-loop temperature'
};

const UNIFORMITY_LIMITS = Object.freeze({
  airTemp: { warning: 2, critical: 3 },
  humidity: { warning: 8, critical: 12 },
  vpd: { warning: 0.4, critical: 0.6 },
  co2: { warning: 200, critical: 350 },
  lux: { warning: 5000, critical: 8000 },
  soilTemp: { warning: 2, critical: 3 },
  soilMoisture: { warning: 10, critical: 18 },
  ec: { warning: 0.5, critical: 1 },
  ph: { warning: 0.4, critical: 0.8 },
  soilEc: { warning: 0.5, critical: 1 },
  leafTemp: { warning: 2, critical: 3 },
  waterTemp: { warning: 2, critical: 3 }
});

export const UNIFORMITY_WARNING_PERSISTENCE_MINUTES = 15;
export const UNIFORMITY_CRITICAL_PERSISTENCE_MINUTES = 5;

function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function metricValue(measurement, metricId) {
  if (!measurement) return null;
  if (metricId === 'vpd') return normalizeTelemetryNumber(calcVPD(measurement.temperature, measurement.humidity));
  const column = METRIC_TO_COLUMN[metricId];
  return column ? normalizeTelemetryNumber(measurement[column]) : null;
}

function distanceFromTarget(value, target) {
  if (!Number.isFinite(value) || !Array.isArray(target) || target.length !== 2) return null;
  const low = Number(target[0]);
  const high = Number(target[1]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (value < low) return low - value;
  if (value > high) return value - high;
  return 0;
}

function nodeValues(snapshot, metricId) {
  const measurements = snapshot.uniformityMeasurements || snapshot.measurements || [];
  return measurements.map((measurement, index) => ({
    value: metricValue(measurement, metricId),
    node: snapshot.nodes?.[index] || null,
    status: snapshot.nodeStatuses?.[index] || snapshot.statuses?.[index] || 'unknown'
  })).filter((sample) =>
    sample.value !== null && ['live', 'delayed'].includes(sample.status)
  );
}

function distributionForAction(action, snapshot) {
  const samples = nodeValues(snapshot, action.metricId);
  const target = action.target;
  const affected = samples.filter((sample) => {
    const distance = distanceFromTarget(sample.value, target);
    return distance !== null && distance > 0;
  });
  return {
    reportingNodes: samples.length,
    registeredNodes: Number(snapshot.registeredNodes ?? snapshot.nodes?.length ?? 0),
    affectedNodes: affected.length,
    affectedNodeNames: affected.map((sample) => String(sample.node?.name || sample.node?.dev_eui || '')).filter(Boolean),
    affectedFraction: samples.length ? affected.length / samples.length : 0
  };
}

export function uniformityLimits(metricId, target) {
  const configured = UNIFORMITY_LIMITS[metricId];
  if (configured) return { ...configured, recovery: Number((configured.warning * 0.8).toFixed(6)) };
  const noiseFloor = getActionVerificationPolicy(metricId).noiseFloor;
  const targetSpan = Array.isArray(target) && target.length === 2
    ? Math.abs(Number(target[1]) - Number(target[0]))
    : 0;
  const warning = Math.max(noiseFloor * 6, Number.isFinite(targetSpan) ? targetSpan * 0.35 : 0);
  const critical = Math.max(warning * 1.75, noiseFloor * 10);
  return { warning, critical, recovery: warning * 0.8 };
}

export function buildUniformityRisks(sectionSnapshots = []) {
  return sectionSnapshots.flatMap((snapshot) => {
    const metrics = Object.keys(snapshot.scoreRules || {}).filter((metricId) =>
      snapshot.scoreRules?.[metricId]?.growth !== false
    );
    return metrics.map((metricId) => {
      const samples = nodeValues(snapshot, metricId);
      if (samples.length < 3) return null;
      const values = samples.map((sample) => sample.value);
      const low = Math.min(...values);
      const high = Math.max(...values);
      const spread = high - low;
      const target = snapshot.scoreRules?.[metricId]?.optimal;
      const limits = uniformityLimits(metricId, target);
      if (!(limits.warning > 0) || spread <= limits.recovery) return null;
      const center = median(values);
      const affected = samples.filter((sample) => Math.abs(sample.value - center) > limits.warning / 2);
      const metric = snapshot.profileMetrics?.[metricId] || {};
      const state = spread >= limits.critical ? 'critical' : 'warning';
      const triggered = spread > limits.warning;
      const unit = metric.unit || '';
      const label = metric.label || metricId;
      return {
        id: `${snapshot.section.id}:${metricId}:uneven`,
        riskKind: 'uniformity',
        verificationMode: 'uniformity',
        areaId: snapshot.section.area_id,
        areaName: snapshot.section.area_name || '',
        sectionId: snapshot.section.id,
        sectionName: snapshot.section.name,
        profileId: snapshot.section.crop_profile || null,
        metricId,
        metricLabel: label,
        state,
        triggered,
        direction: 'high',
        priority: state === 'critical' ? 'now' : 'today',
        severity: Math.max(0, Math.min(1, (spread - limits.warning) / Math.max(limits.critical - limits.warning, limits.warning))),
        value: Number(spread.toFixed(4)),
        unit,
        target: [0, Number(limits.warning.toFixed(4))],
        title: `Investigate uneven ${label.toLowerCase()}`,
        reason: `${label} differs by ${Number(spread.toFixed(2))}${unit ? ` ${unit}` : ''} between reporting nodes.`,
        recommendedAction: `Inspect distribution, equipment delivery, and sensor placement in ${snapshot.section.name}.`,
        expectedEffect: `The difference between the highest and lowest ${label.toLowerCase()} readings decreases.`,
        likelyCause: CAUSE_HINTS[metricId] || 'Uneven delivery, local conditions, or sensor placement',
        observedAt: snapshot.observedAtByMetric?.[metricId] || snapshot.latestReceivedAt || null,
        confidence: samples.length === Number(snapshot.registeredNodes ?? snapshot.nodes?.length ?? 0) ? 'high' : 'medium',
        reportingNodes: samples.length,
        registeredNodes: Number(snapshot.registeredNodes ?? snapshot.nodes?.length ?? 0),
        affectedNodes: affected.length || 1,
        affectedNodeNames: affected.map((sample) => String(sample.node?.name || sample.node?.dev_eui || '')).filter(Boolean),
        affectedFraction: (affected.length || 1) / samples.length,
        distribution: {
          minimum: low,
          maximum: high,
          median: center,
          spread,
          threshold: limits.warning,
          criticalThreshold: limits.critical,
          recoveryThreshold: limits.recovery
        }
      };
    }).filter(Boolean);
  });
}

function trendFromEpisode(risk, episode) {
  const previous = Number(episode?.previous_deviation);
  const current = Number(risk.deviation);
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 'new';
  const tolerance = Math.max(getActionVerificationPolicy(risk.metricId).noiseFloor, Math.abs(previous) * 0.05);
  if (current > previous + tolerance) return 'worsening';
  if (current < previous - tolerance) return 'recovering';
  return 'stable';
}

function priorityScore(risk, durationMinutes, trend) {
  const severity = Math.max(0, Math.min(1, Number(risk.severity) || 0));
  const durationWeight = Math.min(1, Math.log1p(Math.max(0, durationMinutes)) / Math.log(1441));
  const coverageWeight = Math.max(0, Math.min(1, Number(risk.affectedFraction) || 0));
  const trendWeight = trend === 'worsening' ? 1 : trend === 'stable' ? 0.45 : trend === 'new' ? 0.35 : 0;
  const criticalWeight = risk.state === 'critical' ? 1 : 0;
  return Math.round((criticalWeight * 34 + severity * 28 + durationWeight * 18 + coverageWeight * 12 + trendWeight * 8) * 10) / 10;
}

export function buildCropRisks(actions = [], sectionSnapshots = [], episodes = null, now = new Date()) {
  const snapshotsBySection = new Map(sectionSnapshots.map((snapshot) => [String(snapshot.section.id), snapshot]));
  const normalRisks = actions.map((action) => {
    const snapshot = snapshotsBySection.get(String(action.sectionId));
    const distribution = snapshot ? distributionForAction(action, snapshot) : {
      reportingNodes: 0, registeredNodes: 0, affectedNodes: 0, affectedNodeNames: [], affectedFraction: 0
    };
    return {
      ...action,
      riskKind: action.riskKind || 'target-deviation',
      likelyCause: action.likelyCause || action.diagnosis?.title || action.title,
      deviation: distanceFromTarget(Number(action.value), action.target) ?? (Number(action.severity) || 0),
      ...distribution
    };
  });
  const uniformityRisks = buildUniformityRisks(sectionSnapshots).map((risk) => ({
    ...risk,
    deviation: Number(risk.distribution?.spread || risk.value || 0)
  }));
  const byId = new Map([...normalRisks, ...uniformityRisks].map((risk) => [String(risk.id), risk]));

  const lifecycleAvailable = episodes instanceof Map;
  return [...byId.values()].map((risk) => {
    const episode = lifecycleAvailable ? episodes.get(String(risk.id)) : null;
    const firstDetectedAt = episode?.first_detected_at || risk.observedAt || now.toISOString();
    const durationMinutes = Math.max(0, Math.floor((now.getTime() - new Date(firstDetectedAt).getTime()) / 60_000));
    const trend = trendFromEpisode(risk, episode);
    if (risk.riskKind === 'uniformity' && lifecycleAvailable) {
      if (!episode) return null;
      const persistenceMinutes = risk.state === 'critical'
        ? UNIFORMITY_CRITICAL_PERSISTENCE_MINUTES
        : UNIFORMITY_WARNING_PERSISTENCE_MINUTES;
      if (durationMinutes < persistenceMinutes) return null;
    }
    return {
      ...risk,
      firstDetectedAt,
      durationMinutes,
      trend,
      priorityScore: priorityScore(risk, durationMinutes, trend)
    };
  }).filter(Boolean).sort((left, right) =>
    right.priorityScore - left.priorityScore
    || new Date(right.observedAt || 0) - new Date(left.observedAt || 0)
  );
}
