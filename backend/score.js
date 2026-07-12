import { calcVPD } from './calculations.js';

const DEFAULT_SCORE_RULES = {
  airTemp: { column: 'temperature', optimal: [22, 26], warning: [20, 28], critical: [18, 30], growth: true },
  humidity: { column: 'humidity', optimal: [60, 70], warning: [55, 75], critical: [45, 85], growth: true },
  co2: { column: 'co2', optimal: [900, 1100], warning: [750, 1250], critical: [550, 1500], growth: true },
  soilTemp: { column: 'soil_temperature', optimal: [20, 24], warning: [18, 26], critical: [15, 30], growth: true },
  vpd: { column: 'vpd', optimal: [0.8, 1.2], warning: [0.6, 1.5], critical: [0.4, 1.8], growth: true },
  batteryLevel: { column: 'battery_percent', optimal: [55, 100], warning: [35, 100], critical: [0, 100], growth: false }
};

const AUTOMATIC_BAND_PADDING = {
  airTemp: { warning: [2, 2], critical: [4, 4] },
  humidity: { warning: [5, 5], critical: [15, 15], floor: 0, ceiling: 100 },
  co2: { warning: [150, 150], critical: [400, 400], floor: 0 },
  soilTemp: { warning: [2, 2], critical: [5, 6] },
  vpd: { warning: [0.2, 0.2], critical: [0.6, 0.6], floor: 0 },
  batteryLevel: { warning: [20, 0], critical: [55, 0], floor: 0, ceiling: 100 }
};

const SENSOR_PRESENCE_BY_METRIC = {
  airTemp: 'sht45',
  humidity: 'sht45',
  vpd: 'sht45',
  co2: 'scd41',
  soilTemp: 'ds18b20'
};

function measurementHasMetricSensor(measurement, metricId) {
  const sensorId = SENSOR_PRESENCE_BY_METRIC[metricId];
  if (!sensorId) return true;
  const reportedPresence = measurement?.raw_object?.sensors?.[sensorId]?.present;
  return reportedPresence !== false;
}

function getExpectedGrowthMetrics(nodeRows, measurements, scoreRules, availableMetrics) {
  const expected = new Set(
    availableMetrics.filter((metricId) => scoreRules[metricId]?.growth)
  );

  for (const [metricId, rule] of Object.entries(scoreRules)) {
    if (!rule.growth) continue;
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
      critical: automaticBands.critical
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
    severity = 1;
  } else if (numeric > rule.critical[1]) {
    state = 'critical';
    direction = 'high';
    severity = 1;
  } else if (numeric < rule.warning[0]) {
    state = 'warning';
    direction = 'low';
    const span = Math.max(rule.warning[0] - rule.critical[0], 0.0001);
    severity = 0.68 + ((rule.warning[0] - numeric) / span) * 0.32;
  } else if (numeric > rule.warning[1]) {
    state = 'warning';
    direction = 'high';
    const span = Math.max(rule.critical[1] - rule.warning[1], 0.0001);
    severity = 0.68 + ((numeric - rule.warning[1]) / span) * 0.32;
  } else if (numeric < rule.optimal[0]) {
    state = 'warning';
    direction = 'low';
    const span = Math.max(rule.optimal[0] - rule.warning[0], 0.0001);
    severity = 0.34 + ((rule.optimal[0] - numeric) / span) * 0.33;
  } else if (numeric > rule.optimal[1]) {
    state = 'warning';
    direction = 'high';
    const span = Math.max(rule.warning[1] - rule.optimal[1], 0.0001);
    severity = 0.34 + ((numeric - rule.optimal[1]) / span) * 0.33;
  }

  return {
    metricId,
    value: numeric,
    state,
    direction,
    severity: Math.max(0, Math.min(severity, 1))
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

const SCORE_GROUPS = [
  // Climate readings are correlated, so the worst climate deviation is one group,
  // rather than three independent penalties. Weights are normalized across only
  // the groups currently measured in a section.
  { id: 'climate', weight: 0.6, metrics: ['airTemp', 'humidity', 'vpd'] },
  { id: 'co2', weight: 0.25, metrics: ['co2'] },
  { id: 'root_temperature', weight: 0.15, metrics: ['soilTemp'] }
];

function deriveScoreFromEvaluations(evaluations, scoreRules) {
  const evaluationByMetric = new Map(
    evaluations
      .filter((item) => item && scoreRules[item.metricId]?.growth)
      .map((item) => [item.metricId, item])
  );

  const groups = SCORE_GROUPS
    .map((group) => {
      const members = group.metrics
        .map((metricId) => evaluationByMetric.get(metricId))
        .filter(Boolean);
      if (!members.length) return null;

      const driver = [...members].sort((left, right) => right.severity - left.severity)[0];
      return {
        id: group.id,
        weight: group.weight,
        severity: driver.severity,
        state: driver.state,
        mainDriver: driver.metricId,
        metrics: members.map((member) => member.metricId)
      };
    })
    .filter(Boolean);

  if (!groups.length) {
    return {
      score: null,
      conditionStatus: 'unknown',
      mainDriver: null,
      scoreGroups: []
    };
  }

  const totalWeight = groups.reduce((sum, group) => sum + group.weight, 0);
  const averageSeverity = groups.reduce((sum, group) => sum + group.severity * group.weight, 0) / totalWeight;
  const worstGroup = [...groups].sort((left, right) => right.severity - left.severity)[0];
  const riskIndex = Math.round((averageSeverity * 0.65 + worstGroup.severity * 0.35) * 100);
  const score = Math.max(0, 100 - riskIndex);
  const conditionStatus = groups.some((group) => group.state === 'critical')
    ? 'critical'
    : groups.some((group) => group.state === 'warning')
      ? 'warning'
      : 'optimal';

  return {
    score,
    conditionStatus,
    mainDriver: worstGroup.mainDriver,
    scoreGroups: groups
  };
}

export function buildSectionDashboardState(nodeRows, measurements, profileMetrics = {}) {
  const now = Date.now();
  const scoreRules = buildScoreRules(profileMetrics);

  const statuses = nodeRows.map((node, index) => {
    const measurement = measurements[index];
    const expectedIntervalSec = measurement?.raw_object?.expected_uplink_interval_s || 300;
    return statusFromMeasurementTime(node.last_received_at || node.last_seen || measurement?.time, now, expectedIntervalSec);
  });

  const nodeSummary = {
    live: statuses.filter((status) => status === 'live').length,
    delayed: statuses.filter((status) => status === 'delayed').length,
    stale: statuses.filter((status) => status === 'stale').length,
    offline: statuses.filter((status) => status === 'offline').length
  };

  const currentMeasurements = measurements.filter((measurement, index) =>
    measurement && ['live', 'delayed'].includes(statuses[index])
  );
  const metricValues = buildMetricValuesFromLatestMeasurements(currentMeasurements, scoreRules);
  const evaluations = Object.entries(metricValues)
    .map(([metricId, values]) => evaluateMetricValue(metricId, median(values), scoreRules))
    .filter(Boolean);

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
