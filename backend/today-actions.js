const METRIC_LABELS = {
  airTemp: 'Air temperature',
  humidity: 'Relative humidity',
  co2: 'CO2',
  lux: 'Light',
  soilTemp: 'Soil temperature',
  vpd: 'VPD',
  soilMoisture: 'Soil moisture',
  ec: 'EC',
  ph: 'pH',
  leafTemp: 'Leaf temperature',
  soilEc: 'Soil EC',
  waterTemp: 'Water temperature',
  airPressure: 'Air pressure'
};

const METRIC_UNITS = {
  airTemp: 'degC', humidity: '%', co2: 'ppm', lux: 'lx', soilTemp: 'degC',
  vpd: 'kPa', soilMoisture: '%', ec: 'mS/cm', ph: 'pH', leafTemp: 'degC',
  soilEc: 'mS/cm', waterTemp: 'degC', airPressure: 'hPa'
};

const METRIC_GROUPS = {
  airTemp: 'climate', humidity: 'climate', vpd: 'climate', airPressure: 'climate',
  co2: 'carbon-light', lux: 'carbon-light',
  soilTemp: 'root-zone', soilMoisture: 'root-zone', soilEc: 'root-zone',
  ec: 'nutrition', ph: 'nutrition', waterTemp: 'nutrition',
  leafTemp: 'canopy'
};

const ACTION_TEMPLATES = {
  airTemp: { low: 'Check heating and cold-air ingress.', high: 'Increase cooling or ventilation carefully.' },
  humidity: { low: 'Reduce drying and review humidification.', high: 'Increase air exchange and inspect dehumidification.' },
  vpd: { low: 'Reduce humidity or raise temperature gradually.', high: 'Raise humidity or reduce temperature gradually.' },
  co2: { low: 'Check CO2 supply timing and delivery.', high: 'Pause dosing and verify ventilation and calibration.' },
  lux: { low: 'Check the lighting schedule and lamp output.', high: 'Reduce light exposure or verify sensor placement.' },
  soilTemp: { low: 'Check root-zone heating and irrigation temperature.', high: 'Cool the root zone and review irrigation timing.' },
  soilMoisture: { low: 'Check irrigation delivery and substrate moisture.', high: 'Pause excess irrigation and verify drainage.' },
  ec: { low: 'Review nutrient concentration and dosing.', high: 'Reduce concentration and inspect flushing needs.' },
  ph: { low: 'Raise nutrient solution pH toward the profile target.', high: 'Lower nutrient solution pH toward the profile target.' },
  leafTemp: { low: 'Inspect cold airflow and canopy temperature.', high: 'Inspect canopy cooling, airflow, and water stress.' },
  soilEc: { low: 'Review root-zone nutrient concentration.', high: 'Inspect salinity and consider controlled flushing.' },
  waterTemp: { low: 'Check tank and irrigation-loop heating.', high: 'Cool the tank and inspect irrigation-loop temperature.' },
  airPressure: { low: 'Check whether ventilation or weather changes explain the shift.', high: 'Check whether ventilation or weather changes explain the shift.' }
};

const EFFECTS = {
  humidity: 'VPD and condensation risk move closer to the crop target.',
  vpd: 'Transpiration pressure moves closer to the crop target.',
  airTemp: 'Climate stress decreases and VPD becomes more stable.',
  co2: 'Photosynthesis conditions become more stable.',
  lux: 'Light exposure moves closer to the configured photoperiod target.',
  soilMoisture: 'Root-zone water availability moves closer to target.',
  ec: 'Nutrient concentration moves closer to target.',
  ph: 'Nutrient availability moves closer to the configured range.'
};

const MIN_WARNING_ACTION_SEVERITY = 0.05;

const DEFAULT_VERIFICATION_POLICY = Object.freeze({
  delayMinutes: 15,
  windowMinutes: 90,
  minSamples: 3,
  noiseFloor: 0.01
});

const VERIFICATION_POLICIES = Object.freeze({
  airTemp: { delayMinutes: 10, windowMinutes: 60, minSamples: 3, noiseFloor: 0.2 },
  humidity: { delayMinutes: 10, windowMinutes: 60, minSamples: 3, noiseFloor: 1 },
  vpd: { delayMinutes: 10, windowMinutes: 60, minSamples: 3, noiseFloor: 0.03 },
  co2: { delayMinutes: 15, windowMinutes: 120, minSamples: 3, noiseFloor: 25 },
  soilTemp: { delayMinutes: 20, windowMinutes: 120, minSamples: 3, noiseFloor: 0.2 },
  soilMoisture: { delayMinutes: 20, windowMinutes: 180, minSamples: 3, noiseFloor: 1 },
  ec: { delayMinutes: 20, windowMinutes: 180, minSamples: 3, noiseFloor: 0.05 },
  ph: { delayMinutes: 20, windowMinutes: 180, minSamples: 3, noiseFloor: 0.05 },
  soilEc: { delayMinutes: 20, windowMinutes: 180, minSamples: 3, noiseFloor: 0.05 },
  leafTemp: { delayMinutes: 10, windowMinutes: 60, minSamples: 3, noiseFloor: 0.2 },
  waterTemp: { delayMinutes: 20, windowMinutes: 120, minSamples: 3, noiseFloor: 0.2 }
});

function actionTitle(evaluation, label) {
  const verb = evaluation.direction === 'low' ? 'Increase' : evaluation.direction === 'high' ? 'Reduce' : 'Check';
  return `${verb} ${label.toLowerCase()}`;
}

function buildCandidate(snapshot, evaluation) {
  const metric = snapshot.profileMetrics?.[evaluation.metricId] || {};
  const rule = snapshot.scoreRules?.[evaluation.metricId];
  const label = metric.label || METRIC_LABELS[evaluation.metricId] || evaluation.metricId;
  const target = rule?.optimal || metric.optimal || null;
  const defaultAction = ACTION_TEMPLATES[evaluation.metricId]?.[evaluation.direction];
  const recommendedAction = metric.action || defaultAction || `Check ${label.toLowerCase()} controls and sensor placement.`;
  const observedAt = snapshot.observedAtByMetric?.[evaluation.metricId] || snapshot.latestReceivedAt || null;

  return {
    id: `${snapshot.section.id}:${evaluation.metricId}:${evaluation.direction}`,
    areaId: snapshot.section.area_id,
    areaName: snapshot.section.area_name || '',
    sectionId: snapshot.section.id,
    sectionName: snapshot.section.name,
    profileId: snapshot.section.crop_profile || null,
    metricId: evaluation.metricId,
    metricLabel: label,
    state: evaluation.state,
    priority: evaluation.state === 'critical' ? 'now' : 'today',
    severity: Number(evaluation.severity.toFixed(3)),
    direction: evaluation.direction,
    value: evaluation.value,
    unit: metric.unit || METRIC_UNITS[evaluation.metricId] || '',
    target,
    title: actionTitle(evaluation, label),
    reason: `${label} is outside the crop profile target in ${snapshot.section.name}.`,
    recommendedAction,
    expectedEffect: EFFECTS[evaluation.metricId] || `${label} moves closer to the crop profile target.`,
    observedAt,
    confidence: snapshot.reportingNodes > 0 && snapshot.reportingNodes === snapshot.registeredNodes ? 'high' : 'medium'
  };
}

export function buildTodayActions(sectionSnapshots, { limit = 3 } = {}) {
  const candidates = sectionSnapshots.flatMap((snapshot) =>
    (snapshot.evaluations || [])
      .filter((evaluation) => snapshot.scoreRules?.[evaluation.metricId]?.growth !== false)
      .filter((evaluation) => evaluation.state === 'critical' || evaluation.state === 'warning')
      .filter((evaluation) => evaluation.state === 'critical' || evaluation.severity >= MIN_WARNING_ACTION_SEVERITY)
      .map((evaluation) => buildCandidate(snapshot, evaluation))
  );

  candidates.sort((left, right) => {
    if (left.state !== right.state) return left.state === 'critical' ? -1 : 1;
    if (left.severity !== right.severity) return right.severity - left.severity;
    return new Date(right.observedAt || 0) - new Date(left.observedAt || 0);
  });

  const selected = [];
  const sectionGroupCounts = new Map();
  for (const candidate of candidates) {
    const groupKey = `${candidate.sectionId}:${METRIC_GROUPS[candidate.metricId] || candidate.metricId}`;
    if (sectionGroupCounts.has(groupKey)) continue;
    if (selected.filter((item) => item.sectionId === candidate.sectionId).length >= 2) continue;
    selected.push(candidate);
    sectionGroupCounts.set(groupKey, 1);
    if (selected.length >= Math.max(1, Math.min(Number(limit) || 3, 3))) break;
  }

  return selected;
}

function distanceFromTarget(value, target) {
  if (!Number.isFinite(Number(value)) || !Array.isArray(target) || target.length !== 2) return null;
  const numeric = Number(value);
  const low = Number(target[0]);
  const high = Number(target[1]);
  if (!Number.isFinite(low) || !Number.isFinite(high)) return null;
  if (numeric < low) return low - numeric;
  if (numeric > high) return numeric - high;
  return 0;
}

function median(values) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (sorted.length === 0) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function getActionVerificationPolicy(metricId) {
  return { ...DEFAULT_VERIFICATION_POLICY, ...(VERIFICATION_POLICIES[metricId] || {}) };
}

export function evaluateActionOutcome(action, feedback, evidence = {}, now = Date.now()) {
  if (!action || !feedback) return null;
  if (feedback.status !== 'completed') {
    return {
      state: 'not_applicable',
      label: feedback.status === 'deferred' ? 'Deferred' : 'Could not complete',
      currentValue: null,
      observedAt: null
    };
  }

  const feedbackTime = new Date(feedback.createdAt || feedback.created_at || 0).getTime();
  const policy = getActionVerificationPolicy(action.metricId);
  if (!Number.isFinite(feedbackTime)) {
    return { state: 'insufficient_data', label: 'Feedback time is invalid', currentValue: null, observedAt: null };
  }
  const eligibleAtMs = feedbackTime + policy.delayMinutes * 60_000;
  const windowEndsAtMs = feedbackTime + policy.windowMinutes * 60_000;
  const nowMs = new Date(now).getTime();
  const eligibleAt = new Date(eligibleAtMs).toISOString();
  const windowEndsAt = new Date(windowEndsAtMs).toISOString();
  const providedSamples = Array.isArray(evidence.samples)
    ? evidence.samples
    : Number.isFinite(Number(evidence.value)) && evidence.observedAt
      ? [{ value: evidence.value, observedAt: evidence.observedAt }]
      : [];
  const eligibleSamples = providedSamples
    .map((sample) => ({ value: Number(sample.value), observedAt: sample.observedAt }))
    .filter((sample) => {
      const observedAtMs = new Date(sample.observedAt || 0).getTime();
      return Number.isFinite(sample.value)
        && Number.isFinite(observedAtMs)
        && observedAtMs >= eligibleAtMs
        && observedAtMs <= windowEndsAtMs;
    })
    .sort((left, right) => new Date(left.observedAt) - new Date(right.observedAt));
  const verificationSamples = eligibleSamples.slice(0, policy.minSamples);
  const common = {
    baselineValue: Number.isFinite(Number(action.value)) ? Number(action.value) : null,
    baselineObservedAt: action.observedAt || null,
    currentValue: null,
    observedAt: null,
    sampleCount: verificationSamples.length,
    requiredSampleCount: policy.minSamples,
    eligibleAt,
    windowEndsAt,
    method: 'median-first-qualified-samples',
    modelVersion: '1.0.0'
  };
  if (Number.isFinite(nowMs) && nowMs < eligibleAtMs) {
    return { ...common, state: 'awaiting_data', label: 'Waiting for the verification window' };
  }
  if (verificationSamples.length < policy.minSamples) {
    return {
      ...common,
      state: Number.isFinite(nowMs) && nowMs > windowEndsAtMs ? 'insufficient_data' : 'awaiting_data',
      label: Number.isFinite(nowMs) && nowMs > windowEndsAtMs
        ? 'Not enough sensor readings to verify the result'
        : 'Collecting sensor readings'
    };
  }

  const currentValue = median(verificationSamples.map((sample) => sample.value));
  const observedAt = verificationSamples[verificationSamples.length - 1].observedAt;
  const baselineDistance = distanceFromTarget(action.value, action.target);
  const currentDistance = distanceFromTarget(currentValue, action.target);
  if (baselineDistance === null || currentDistance === null) {
    return { ...common, state: 'insufficient_data', label: 'Target or baseline is unavailable', currentValue, observedAt };
  }
  if (currentDistance === 0) {
    return {
      ...common, state: 'target_reached', label: 'Target reached', currentValue, observedAt,
      change: currentValue - Number(action.value), distanceImprovement: baselineDistance
    };
  }

  const targetSpan = Math.max(Math.abs(Number(action.target[1]) - Number(action.target[0])), 0.0001);
  const meaningfulChange = Math.max(policy.noiseFloor, targetSpan * 0.02, baselineDistance * 0.05, 0.0001);
  const improvement = baselineDistance - currentDistance;
  if (improvement > meaningfulChange) {
    return {
      ...common, state: 'improving', label: 'Conditions are improving', currentValue, observedAt,
      change: currentValue - Number(action.value), distanceImprovement: improvement
    };
  }
  return {
    ...common,
    state: improvement < -meaningfulChange ? 'worsened' : 'unchanged',
    label: improvement < -meaningfulChange ? 'Conditions moved further from target' : 'No meaningful change detected',
    currentValue,
    observedAt,
    change: currentValue - Number(action.value),
    distanceImprovement: improvement
  };
}
