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
  return (snapshot.measurements || []).map((measurement, index) => ({
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

function uniformityThreshold(metricId, target) {
  const noiseFloor = getActionVerificationPolicy(metricId).noiseFloor;
  const targetSpan = Array.isArray(target) && target.length === 2
    ? Math.abs(Number(target[1]) - Number(target[0]))
    : 0;
  return Math.max(noiseFloor * 4, Number.isFinite(targetSpan) ? targetSpan * 0.2 : 0);
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
      const threshold = uniformityThreshold(metricId, target);
      if (!(threshold > 0) || spread <= threshold) return null;
      const center = median(values);
      const affected = samples.filter((sample) => Math.abs(sample.value - center) > threshold / 2);
      const metric = snapshot.profileMetrics?.[metricId] || {};
      const state = spread >= threshold * 2 ? 'critical' : 'warning';
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
        direction: 'high',
        priority: state === 'critical' ? 'now' : 'today',
        severity: Math.min(1, spread / threshold - 1),
        value: Number(spread.toFixed(4)),
        unit,
        target: [0, Number(threshold.toFixed(4))],
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
        distribution: { minimum: low, maximum: high, median: center, spread, threshold }
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

export function buildCropRisks(actions = [], sectionSnapshots = [], episodes = new Map(), now = new Date()) {
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

  return [...byId.values()].map((risk) => {
    const episode = episodes.get(String(risk.id));
    const firstDetectedAt = episode?.first_detected_at || risk.observedAt || now.toISOString();
    const durationMinutes = Math.max(0, Math.floor((now.getTime() - new Date(firstDetectedAt).getTime()) / 60_000));
    const trend = trendFromEpisode(risk, episode);
    return {
      ...risk,
      firstDetectedAt,
      durationMinutes,
      trend,
      priorityScore: priorityScore(risk, durationMinutes, trend)
    };
  }).sort((left, right) =>
    right.priorityScore - left.priorityScore
    || new Date(right.observedAt || 0) - new Date(left.observedAt || 0)
  );
}
