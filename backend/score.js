import { calcVPD } from './calculations.js';

const DEFAULT_SCORE_RULES = {
  airTemp: { column: 'temperature', optimal: [22, 26], warning: [20, 28], critical: [18, 30], growth: true },
  humidity: { column: 'humidity', optimal: [60, 70], warning: [55, 75], critical: [45, 85], growth: true },
  co2: { column: 'co2', optimal: [900, 1100], warning: [750, 1250], critical: [550, 1500], growth: true },
  // Light is stored and trended, but it cannot penalize an instantaneous score
  // without a photoperiod schedule: 0 lx at night is expected, not a crop failure.
  lux: { column: 'lux', optimal: [10000, 35000], warning: [5000, 45000], critical: [0, 60000], growth: false },
  soilTemp: { column: 'soil_temperature', optimal: [20, 24], warning: [18, 26], critical: [15, 30], growth: true },
  soilMoisture: { column: 'soil_moisture', optimal: [45, 65], warning: [37, 73], critical: [27, 83], growth: true },
  ec: { column: 'ec', optimal: [1.8, 2.8], warning: [1.4, 3.2], critical: [0.8, 3.8], growth: true },
  ph: { column: 'ph', optimal: [5.8, 6.4], warning: [5.5, 6.8], critical: [5, 7.2], growth: true },
  soilEc: { column: 'soil_ec', optimal: [1.5, 2.5], warning: [1.2, 2.9], critical: [0.7, 3.5], growth: true },
  leafTemp: { column: 'leaf_temperature', optimal: [20, 25], warning: [18, 27], critical: [15, 30], growth: true },
  waterTemp: { column: 'water_temperature', optimal: [18, 22], warning: [16, 24], critical: [13, 28], growth: true },
  // Normal weather-driven pressure changes are diagnostic context, not a direct
  // crop stress signal at greenhouse elevations.
  airPressure: { column: 'air_pressure', optimal: [995, 1025], warning: [989, 1031], critical: [981, 1039], growth: false },
  vpd: { column: 'vpd', optimal: [0.8, 1.2], warning: [0.6, 1.5], critical: [0.4, 1.8], growth: true },
  batteryLevel: { column: 'battery_percent', optimal: [55, 100], warning: [35, 100], critical: [0, 100], growth: false }
};

const AUTOMATIC_BAND_PADDING = {
  airTemp: { warning: [2, 2], critical: [4, 4] },
  humidity: { warning: [5, 5], critical: [15, 15], floor: 0, ceiling: 100 },
  co2: { warning: [150, 150], critical: [400, 400], floor: 0 },
  lux: { warning: [5000, 10000], critical: [10000, 25000], floor: 0 },
  soilTemp: { warning: [2, 2], critical: [5, 6] },
  soilMoisture: { warning: [8, 8], critical: [18, 18], floor: 0, ceiling: 100 },
  ec: { warning: [0.4, 0.4], critical: [1, 1], floor: 0 },
  ph: { warning: [0.3, 0.4], critical: [0.8, 0.8], floor: 0, ceiling: 14 },
  soilEc: { warning: [0.3, 0.4], critical: [0.8, 1], floor: 0 },
  leafTemp: { warning: [2, 2], critical: [5, 5] },
  waterTemp: { warning: [2, 2], critical: [5, 6] },
  airPressure: { warning: [6, 6], critical: [14, 14], floor: 850, ceiling: 1100 },
  vpd: { warning: [0.2, 0.2], critical: [0.6, 0.6], floor: 0 },
  batteryLevel: { warning: [20, 0], critical: [55, 0], floor: 0, ceiling: 100 }
};

const SENSOR_PRESENCE_BY_METRIC = {
  airTemp: 'sht45',
  humidity: 'sht45',
  vpd: 'sht45',
  co2: 'scd41',
  lux: 'bh1750',
  soilTemp: 'ds18b20',
  soilMoisture: 'soil_moisture_probe',
  ec: 'ec_probe',
  ph: 'ph_probe',
  soilEc: 'soil_ec_probe',
  leafTemp: 'leaf_temperature_probe',
  waterTemp: 'water_temperature_probe',
  airPressure: 'pressure_sensor'
};

function measurementHasMetricSensor(measurement, metricId) {
  const sensorId = SENSOR_PRESENCE_BY_METRIC[metricId];
  if (!sensorId) return true;
  const reportedPresence = measurement?.raw_object?.sensors?.[sensorId]?.present;
  return reportedPresence !== false;
}

function getExpectedGrowthMetrics(nodeRows, measurements, scoreRules, availableMetrics) {
  const expected = new Set(
    availableMetrics.filter((metricId) => metricId !== 'batteryLevel')
  );

  for (const [metricId, rule] of Object.entries(scoreRules)) {
    if (metricId === 'batteryLevel') continue;
    const sensorId = SENSOR_PRESENCE_BY_METRIC[metricId];
    if (!sensorId) continue;
    const installed = nodeRows.some((node) => node?.last_sensor_presence?.[sensorId] === true)
      || measurements.some((measurement) => measurement?.raw_object?.sensors?.[sensorId]?.present === true);
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
  const numeric = candidate.map(Number);
  if (!numeric.every(Number.isFinite)) return fallback;
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
    rules[metricId] = {
      ...baseRule,
      optimal,
      warning: automaticBands.warning,
      critical: automaticBands.critical,
      scoreWeight: Number.isFinite(Number(profileMetric.scoreWeight))
        ? Math.max(0, Math.min(Number(profileMetric.scoreWeight), 3))
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
  if (ageSec <= interval * 3) return 'live';
  if (ageSec <= interval * 6) return 'delayed';
  if (ageSec <= interval * 12) return 'stale';
  return 'offline';
}

export const SCORE_MODEL_VERSION = '2.0.0';
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
  if (!rule || value === null || value === undefined || !Number.isFinite(Number(value))) return null;

  const numeric = Number(value);
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
        .filter((value) => value !== null && value !== undefined && Number.isFinite(Number(value)))
        .map(Number);
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
  { id: 'climate', weight: 0.35, metrics: { vpd: 0.45, airTemp: 0.4, humidity: 0.15 } },
  { id: 'root_water', weight: 0.25, metrics: { soilMoisture: 1 } },
  { id: 'nutrition', weight: 0.2, metrics: { ec: 0.4, ph: 0.4, soilEc: 0.2 } },
  { id: 'plant_temperature', weight: 0.12, metrics: { leafTemp: 0.45, soilTemp: 0.35, waterTemp: 0.2 } },
  // Instantaneous CO2 is contextual and receives less weight until the score is
  // photoperiod-aware. Light itself is evaluated through 24 h photoperiod/DLI.
  { id: 'carbon', weight: 0.08, metrics: { co2: 1 } }
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

  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const averageSeverity = groups.reduce((sum, group) => sum + group.severity * group.weight, 0) / totalWeight;
  const worstGroup = [...groups].sort((left, right) => right.severity - left.severity)[0];
  const limitingFactorActivation = smoothstep((worstGroup.severity - 0.25) / 0.75);
  const limitingFactorPenalty = (1 - averageSeverity) * 0.3 * limitingFactorActivation;
  const risk = clamp01(averageSeverity + limitingFactorPenalty);
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
    mainDriver: conditionStatus === 'optimal' ? null : worstGroup.mainDriver,
    scoreGroups: groups,
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

  return {
    ...scoreState,
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
