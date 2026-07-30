import { calcVPD } from './calculations.js';
import { normalizeTelemetryBoolean, normalizeTelemetryNumber } from './telemetry-values.js';
import {
  AUTOMATIC_BAND_PADDING,
  DEFAULT_SCORE_RULES,
  METRIC_SENSOR_KEYS as SENSOR_PRESENCE_BY_METRIC
} from './metric-registry.js';

function measurementHasMetricSensor(measurement, metricId) {
  const sensorId = SENSOR_PRESENCE_BY_METRIC[metricId];
  if (!sensorId) return true;
  const reportedPresence = measurement?.raw_object?.sensors?.[sensorId]?.present;
  return normalizeTelemetryBoolean(reportedPresence) !== false;
}

function getExpectedGrowthMetrics(nodeRows, measurements, scoreRules, availableMetrics) {
  const expected = new Set(
    availableMetrics.filter((metricId) => metricId !== 'batteryLevel')
  );

  for (const [metricId, rule] of Object.entries(scoreRules)) {
    if (metricId === 'batteryLevel') continue;
    const sensorId = SENSOR_PRESENCE_BY_METRIC[metricId];
    if (!sensorId) continue;
    const installed = nodeRows.some(
      (node) => normalizeTelemetryBoolean(node?.last_sensor_presence?.[sensorId]) === true
    ) || measurements.some(
      (measurement) => normalizeTelemetryBoolean(measurement?.raw_object?.sensors?.[sensorId]?.present) === true
    );
    if (installed) expected.add(metricId);
  }

  return [...expected];
}

function median(values) {
  const clean = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function normalizeBand(candidate, fallback) {
  if (!Array.isArray(candidate) || candidate.length !== 2) return fallback;
  const numeric = candidate.map(normalizeTelemetryNumber);
  if (!numeric.every((value) => value !== null)) return fallback;
  return numeric[0] <= numeric[1] ? numeric : fallback;
}

function deriveAutomaticBands(metricId, optimal, fallback) {
  const padding = AUTOMATIC_BAND_PADDING[metricId];
  if (!padding) return { warning: fallback.warning, critical: fallback.critical };

  const clamp = (value) => Math.min(padding.ceiling ?? Infinity, Math.max(padding.floor ?? -Infinity, value));
  return {
    warning: [clamp(optimal[0] - padding.warning[0]), clamp(optimal[1] + padding.warning[1])],
    critical: [clamp(optimal[0] - padding.critical[0]), clamp(optimal[1] + padding.critical[1])]
  };
}

export function buildScoreRules(profileMetrics = {}) {
  const rules = {};

  for (const [metricId, baseRule] of Object.entries(DEFAULT_SCORE_RULES)) {
    const profileMetric = profileMetrics?.[metricId] || {};
    const optimal = normalizeBand(profileMetric.optimal, baseRule.optimal);
    const automaticBands = deriveAutomaticBands(metricId, optimal, baseRule);
    const scoreWeight = normalizeTelemetryNumber(profileMetric.scoreWeight);
    rules[metricId] = {
      ...baseRule,
      optimal,
      warning: automaticBands.warning,
      critical: automaticBands.critical,
      scoreWeight: scoreWeight !== null
        ? Math.max(0, Math.min(scoreWeight, 3))
        : 1
    };
  }

  return rules;
}

export function statusFromMeasurementTime(time, now = Date.now(), expectedIntervalSec = 300) {
  if (!time) return 'offline';
  const interval = Math.max(60, Number(expectedIntervalSec) || 300);
  const ageSec = (now - new Date(time).getTime()) / 1000;
  if (!Number.isFinite(ageSec) || ageSec < -Math.max(interval, 300)) return 'offline';
  if (ageSec <= interval * 1.5) return 'live';
  if (ageSec <= interval * 6) return 'delayed';
  if (ageSec <= interval * 12) return 'stale';
  return 'offline';
}

export const SCORE_MODEL_VERSION = '2.1.0';
const WARNING_EDGE_SEVERITY = 0.2;
const CRITICAL_EDGE_SEVERITY = 0.65;

function clamp01(value) {
  return Math.max(0, Math.min(Number(value) || 0, 1));
}

// Smoothstep keeps sensor noise around a target boundary from creating a
// visible score cliff while preserving monotonic growth toward real stress.
function smoothstep(value) {
  const progress = clamp01(value);
  return progress * progress * (3 - 2 * progress);
}

function directionalSeverity(numeric, rule, direction) {
  const side = direction === 'low' ? 0 : 1;
  const optimalEdge = rule.optimal[side];
  const warningEdge = rule.warning[side];
  const criticalEdge = rule.critical[side];
  const distance = direction === 'low' ? optimalEdge - numeric : numeric - optimalEdge;
  const warningSpan = Math.max(Math.abs(optimalEdge - warningEdge), 0.0001);
  const criticalSpan = Math.max(Math.abs(warningEdge - criticalEdge), 0.0001);

  if (distance <= warningSpan) {
    return WARNING_EDGE_SEVERITY * smoothstep(distance / warningSpan);
  }

  const distancePastWarning = distance - warningSpan;
  if (distancePastWarning <= criticalSpan) {
    return WARNING_EDGE_SEVERITY
      + (CRITICAL_EDGE_SEVERITY - WARNING_EDGE_SEVERITY) * smoothstep(distancePastWarning / criticalSpan);
  }

  const distancePastCritical = distancePastWarning - criticalSpan;
  const extremeSpan = Math.max(criticalSpan, warningSpan);
  return CRITICAL_EDGE_SEVERITY
    + (1 - CRITICAL_EDGE_SEVERITY) * smoothstep(distancePastCritical / extremeSpan);
}

export function evaluateMetricValue(metricId, value, scoreRules) {
  const rule = scoreRules[metricId];
  const numeric = normalizeTelemetryNumber(value);
  if (!rule || numeric === null) return null;
  let state = 'optimal';
  let severity = 0;
  let direction = 'optimal';

  if (numeric < rule.critical[0]) {
    state = 'critical';
    direction = 'low';
    severity = directionalSeverity(numeric, rule, direction);
  } else if (numeric > rule.critical[1]) {
    state = 'critical';
    direction = 'high';
    severity = directionalSeverity(numeric, rule, direction);
  } else if (numeric < rule.optimal[0]) {
    state = 'warning';
    direction = 'low';
    severity = directionalSeverity(numeric, rule, direction);
  } else if (numeric > rule.optimal[1]) {
    state = 'warning';
    direction = 'high';
    severity = directionalSeverity(numeric, rule, direction);
  }

  return {
    metricId,
    value: numeric,
    state,
    direction,
    severity: clamp01(severity)
  };
}

function buildMetricValuesFromLatestMeasurements(measurements, scoreRules) {
  const values = {};

  for (const metricId of Object.keys(scoreRules)) {
    const rule = scoreRules[metricId];

    if (metricId === 'vpd') {
      values.vpd = measurements
        .map((m) => measurementHasMetricSensor(m, metricId) && m?.temperature != null && m?.humidity != null
          ? calcVPD(m.temperature, m.humidity)
          : null)
        .filter(Number.isFinite);
    } else {
      values[metricId] = measurements
        .map((m) => measurementHasMetricSensor(m, metricId) ? m?.[rule.column] : null)
        .map(normalizeTelemetryNumber)
        .filter((value) => value !== null);
    }
  }

  return values;
}

export function buildCurrentMetricEvaluations(nodeRows, measurements, profileMetrics = {}, now = Date.now()) {
  const scoreRules = buildScoreRules(profileMetrics);
  const statuses = nodeRows.map((node, index) => {
    const measurement = measurements[index];
    const expectedIntervalSec = measurement?.raw_object?.expected_uplink_interval_s || 300;
    return statusFromMeasurementTime(node.last_received_at || node.last_seen || measurement?.time, now, expectedIntervalSec);
  });
  const currentMeasurements = measurements.filter((measurement, index) =>
    measurement && ['live', 'delayed'].includes(statuses[index])
  );
  const metricValues = buildMetricValuesFromLatestMeasurements(currentMeasurements, scoreRules);
  const evaluations = Object.entries(metricValues)
    .map(([metricId, values]) => evaluateMetricValue(metricId, median(values), scoreRules))
    .filter(Boolean);

  return { scoreRules, statuses, currentMeasurements, metricValues, evaluations };
}

const SCORE_GROUPS = [
  // VPD is derived from temperature and RH, so these correlated readings share
  // one domain instead of being counted as three independent stresses.
  { id: 'climate', weight: 0.35, limitingCap: 0.18, metrics: { vpd: 0.45, airTemp: 0.4, humidity: 0.15 } },
  { id: 'root_water', weight: 0.25, limitingCap: 0.2, metrics: { soilMoisture: 1 } },
  { id: 'nutrition', weight: 0.2, limitingCap: 0.12, metrics: { ec: 0.4, ph: 0.4, soilEc: 0.2 } },
  { id: 'plant_temperature', weight: 0.12, limitingCap: 0.07, metrics: { leafTemp: 0.45, soilTemp: 0.35, waterTemp: 0.2 } },
  // Instantaneous CO2 is contextual and receives less weight until the score is
  // photoperiod-aware. Light itself is evaluated through 24 h photoperiod/DLI.
  { id: 'carbon', weight: 0.08, limitingCap: 0.02, metrics: { co2: 1 } }
];

function deriveScoreFromEvaluations(evaluations, scoreRules) {
  const evaluationByMetric = new Map(
    evaluations
      .filter((item) => item && scoreRules[item.metricId]?.growth)
      .map((item) => [item.metricId, item])
  );

  const groups = SCORE_GROUPS
    .map((group) => {
      const configuredMetricWeight = Object.entries(group.metrics)
        .map(([metricId, agronomicWeight]) => ({
          metricId,
          agronomicWeight,
          scoreWeight: scoreRules[metricId]?.scoreWeight ?? 1
        }));
      const members = configuredMetricWeight
        .map(({ metricId, agronomicWeight, scoreWeight }) => {
          const evaluation = evaluationByMetric.get(metricId);
          const effectiveWeight = agronomicWeight * scoreWeight;
          return evaluation && effectiveWeight > 0
            ? { ...evaluation, agronomicWeight, scoreWeight, effectiveWeight }
            : null;
        })
        .filter(Boolean);
      if (!members.length) return null;

      const driver = [...members].sort((left, right) => right.severity - left.severity)[0];
      const memberWeightTotal = members.reduce((sum, member) => sum + member.effectiveWeight, 0);
      const weightedMeanSeverity = members.reduce(
        (sum, member) => sum + member.severity * member.effectiveWeight,
        0
      ) / memberWeightTotal;
      const dominantSeverity = driver.severity;
      const severity = dominantSeverity * 0.7 + weightedMeanSeverity * 0.3;
      const defaultWeightTotal = configuredMetricWeight.reduce((sum, member) => sum + member.agronomicWeight, 0);
      const configuredWeightTotal = configuredMetricWeight.reduce(
        (sum, member) => sum + member.agronomicWeight * member.scoreWeight,
        0
      );
      const profileScale = defaultWeightTotal > 0 ? configuredWeightTotal / defaultWeightTotal : 1;
      return {
        id: group.id,
        weight: group.weight * profileScale,
        limitingCap: group.limitingCap * profileScale,
        severity: clamp01(severity),
        state: members.some((member) => member.state === 'critical')
          ? 'critical'
          : members.some((member) => member.state === 'warning') ? 'warning' : 'optimal',
        mainDriver: driver.metricId,
        metrics: members.map((member) => member.metricId),
        dominantSeverity,
        weightedMeanSeverity
      };
    })
    .filter(Boolean);

  if (!groups.length) {
    return {
      score: null,
      conditionStatus: 'unknown',
      mainDriver: null,
      scoreGroups: [],
      scoreModelVersion: SCORE_MODEL_VERSION
    };
  }

  // Domain weights remain absolute. Missing sensors are reflected in coverage,
  // not by inflating the weights of whichever sensors happen to be installed.
  // As a result, adding an optimal sensor cannot change the numerical score.
  const baseRisk = groups.reduce((sum, group) => sum + group.severity * group.weight, 0);
  const worstGroup = [...groups].sort((left, right) => right.severity - left.severity)[0];
  const limitingFactorActivation = smoothstep((worstGroup.severity - 0.25) / 0.75);
  const limitingFactorPenalty = (1 - clamp01(baseRisk))
    * worstGroup.limitingCap
    * limitingFactorActivation;
  const risk = clamp01(baseRisk + limitingFactorPenalty);
  const groupsWithImpact = groups.map((group) => ({
    ...group,
    scoreImpact: group.severity * group.weight
      + (group.id === worstGroup.id ? limitingFactorPenalty : 0)
  }));
  const mainImpactGroup = [...groupsWithImpact]
    .sort((left, right) => right.scoreImpact - left.scoreImpact)[0];
  const conditionStatus = groups.some((group) => group.state === 'critical')
    ? 'critical'
    : groups.some((group) => group.state === 'warning')
      ? 'warning'
      : 'optimal';
  let score = Math.round((1 - risk) * 100);
  if (conditionStatus !== 'optimal' && score === 100) score = 99;

  return {
    score,
    conditionStatus,
    mainDriver: conditionStatus === 'optimal' ? null : mainImpactGroup.mainDriver,
    scoreGroups: groupsWithImpact,
    scoreModelVersion: SCORE_MODEL_VERSION
  };
}

export function buildScoreFromMetricValues(metricValues = {}, profileMetrics = {}) {
  const scoreRules = buildScoreRules(profileMetrics);
  const evaluations = Object.entries(metricValues)
    .map(([metricId, value]) => evaluateMetricValue(metricId, value, scoreRules))
    .filter(Boolean);
  return deriveScoreFromEvaluations(evaluations, scoreRules);
}

export function buildSectionDashboardState(nodeRows, measurements, profileMetrics = {}) {
  const now = Date.now();
  const { scoreRules, statuses, metricValues, evaluations } = buildCurrentMetricEvaluations(
    nodeRows,
    measurements,
    profileMetrics,
    now
  );

  const nodeSummary = {
    live: statuses.filter((status) => status === 'live').length,
    delayed: statuses.filter((status) => status === 'delayed').length,
    stale: statuses.filter((status) => status === 'stale').length,
    offline: statuses.filter((status) => status === 'offline').length
  };

  const availableMetrics = Object.entries(metricValues)
    .filter(([, values]) => values.length > 0)
    .map(([metricId]) => metricId);

  const liveMetrics = availableMetrics.filter((metricId) => metricId !== 'batteryLevel').length;
  const expectedGrowthMetrics = getExpectedGrowthMetrics(nodeRows, measurements, scoreRules, availableMetrics);
  const scoreState = deriveScoreFromEvaluations(evaluations, scoreRules);
  const mainEvaluation = scoreState.mainDriver
    ? evaluations.find((evaluation) => evaluation.metricId === scoreState.mainDriver)
    : null;
  const mainRule = mainEvaluation ? scoreRules[mainEvaluation.metricId] : null;

  return {
    ...scoreState,
    mainCondition: mainEvaluation && mainRule
      ? {
          metricId: mainEvaluation.metricId,
          value: mainEvaluation.value,
          state: mainEvaluation.state,
          direction: mainEvaluation.direction,
          severity: mainEvaluation.severity,
          target: mainRule.optimal
        }
      : null,
    availableMetrics,
    configuredMetrics: expectedGrowthMetrics,
    coverage: {
      liveMetrics,
      expectedMetrics: expectedGrowthMetrics.length,
      reportingNodes: nodeSummary.live + nodeSummary.delayed,
      registeredNodes: nodeRows.length
    },
    nodeSummary,
    computedAt: new Date().toISOString()
  };
}
