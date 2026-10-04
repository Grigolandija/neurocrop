import { normalizeTelemetryNumber } from '../telemetry-values.js';
import { buildAgronomicInteractionCandidates } from './live.js';
import { METRIC_LABELS, METRIC_UNITS } from '../metrics.js';

import { METRIC_GROUPS, ACTION_TEMPLATES, EFFECTS, DIAGNOSTIC_CONTEXT, SINGLE_DIAGNOSIS_TITLES, SINGLE_DIAGNOSIS_IMPACTS, CATALOG_RULES } from './catalog.js';

const DIRECT_CRITICAL_CONDITION_METRICS = new Set(['ph']);

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

function diagnosticReading(snapshot, evaluation) {
  const metric = snapshot.profileMetrics?.[evaluation.metricId] || {};
  const rule = snapshot.scoreRules?.[evaluation.metricId];
  return {
    metricId: evaluation.metricId,
    metricLabel: metric.label || METRIC_LABELS[evaluation.metricId] || evaluation.metricId,
    value: evaluation.value,
    unit: metric.unit || METRIC_UNITS[evaluation.metricId] || '',
    target: rule?.optimal || metric.optimal || null,
    state: evaluation.state,
    direction: evaluation.direction
  };
}

function formatDiagnosticNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function diagnosticDeviation(evaluation, target, unit) {
  if (!Array.isArray(target) || target.length !== 2) return null;
  const boundary = evaluation.direction === 'high' ? Number(target[1]) : Number(target[0]);
  const difference = Math.abs(Number(evaluation.value) - boundary);
  const formatted = formatDiagnosticNumber(difference);
  if (formatted === null) return null;
  const normalizedUnit = unit === 'degC' ? ' °C' : unit === '%' ? '%' : unit ? ` ${unit}` : '';
  return `${formatted}${normalizedUnit} ${evaluation.direction === 'high' ? 'above' : 'below'} target`;
}

function buildDiagnosisSummary(snapshot, evaluation, label, availableContext) {
  const primaryReading = diagnosticReading(snapshot, evaluation);
  const deviation = diagnosticDeviation(evaluation, primaryReading.target, primaryReading.unit);
  const opening = deviation
    ? `${label} is ${deviation}.`
    : `${label} is outside its crop-profile target.`;
  const contextByMetric = new Map(availableContext.map((item) => [item.metricId, item]));
  const materiallyOutside = (item) => {
    if (!item || (item.direction !== 'high' && item.direction !== 'low')) return false;
    const reading = diagnosticReading(snapshot, item);
    if (!Array.isArray(reading.target) || reading.target.length !== 2) return false;
    const boundary = item.direction === 'high' ? Number(reading.target[1]) : Number(reading.target[0]);
    const difference = Math.abs(Number(item.value) - boundary);
    const tolerance = VERIFICATION_POLICIES[item.metricId]?.noiseFloor || 0;
    return difference > tolerance;
  };

  if (evaluation.metricId === 'ph') {
    const direction = evaluation.direction === 'low' ? 'acidic' : 'alkaline';
    const consequence = evaluation.direction === 'low'
      ? 'This can disrupt nutrient availability and increase the risk of root injury.'
      : 'This can reduce micronutrient availability and create nutrient lockout.';
    return `${opening} The nutrient solution is ${direction}. ${consequence} EC and root-zone readings would help identify the cause and confirm the plant-level effect.`;
  }

  if (evaluation.metricId === 'airTemp' && evaluation.direction === 'high') {
    const humidity = contextByMetric.get('humidity');
    const vpd = contextByMetric.get('vpd');
    const signals = [];
    if (humidity && !materiallyOutside(humidity) && humidity.direction !== 'optimal') signals.push('relative humidity is close to its target boundary');
    if (materiallyOutside(humidity) && humidity.direction === 'low') signals.push('low relative humidity increases drying demand');
    if (materiallyOutside(humidity) && humidity.direction === 'high') signals.push('high relative humidity can restrict evaporative cooling');
    if (materiallyOutside(vpd) && vpd.direction === 'high') signals.push('high VPD reinforces transpiration demand');
    if (materiallyOutside(vpd) && vpd.direction === 'low') signals.push('low VPD can restrict evaporative leaf cooling');
    if (vpd?.direction === 'optimal') signals.push('VPD remains inside its configured target');
    const context = signals.length ? `${signals.join(', while ')}.` : '';
    return `${opening} ${context} This is an emerging canopy heat risk; leaf temperature and persistence over time would confirm plant-level heat stress.`.replace(/\s+/g, ' ').trim();
  }

  const deviatingContext = availableContext
    .filter(materiallyOutside)
    .map((item) => `${METRIC_LABELS[item.metricId] || item.metricId} is ${item.direction}`);
  const impact = SINGLE_DIAGNOSIS_IMPACTS[evaluation.metricId]?.[evaluation.direction] || '';
  const context = deviatingContext.length
    ? ` Supporting context: ${deviatingContext.join(' and ')}.`
    : availableContext.length
      ? ' Available supporting readings do not show a second material target deviation.'
      : ' Related readings are needed to identify the cause and plant-level effect.';
  return `${opening} ${impact}${context}`.replace(/\s+/g, ' ').trim();
}

function buildClimateSynthesis(evaluations) {
  const air = evaluations.get('airTemp');
  const humidity = evaluations.get('humidity');
  const vpd = evaluations.get('vpd');
  if (!air || !humidity || !vpd) return null;

  if (air.direction === 'low' && humidity.direction === 'low' && vpd.direction !== 'high') {
    const vpdState = vpd.direction === 'low'
      ? 'also below target, indicating weak transpiration'
      : 'inside target, so low RH is not producing excessive atmospheric water demand';
    return {
      title: 'Cold-limited growth is the primary constraint',
      summary: `Air temperature is below target and derived VPD is ${vpdState}. Relative humidity alone does not confirm atmospheric drying.`,
      mechanism: 'Low temperature slows enzyme activity, development, and root water and nutrient uptake. Because saturation vapour pressure falls with temperature, a low RH percentage can coexist with acceptable VPD.',
      likelyImpact: 'The crop is more likely to show slower growth and a shoot-to-root uptake mismatch than acute dehydration. Sensitive growth stages may accumulate delay if the condition persists.',
      decision: 'Correct cold-air ingress, heating, or the day/night temperature profile first. Reassess RH only after temperature and VPD stabilize.',
      verifyNext: ['Root-zone temperature', 'Leaf temperature', '10–30 min temperature and VPD trends'],
      avoid: 'Do not humidify or increase irrigation from the RH value alone; that can create condensation or an over-wet root zone without removing the main limitation.',
      evidence: { level: 'A/B', ruleIds: ['S001', 'S003'], codes: ['E01', 'E02', 'E03', 'E06'] },
      recommendedAction: 'Restore the crop temperature profile first, then reassess VPD and relative humidity.',
      expectedEffect: 'Metabolic activity and root uptake recover without creating unnecessary humidity or irrigation risk.'
    };
  }

  if (air.direction === 'low' && humidity.direction === 'low' && vpd.direction === 'high') {
    return {
      title: 'Cold growth limitation with excessive atmospheric demand',
      summary: 'Low temperature is slowing crop activity while derived VPD confirms that the air can still remove water faster than the crop profile allows.',
      mechanism: 'The shoot faces atmospheric water demand while cold-limited roots may supply water and nutrients more slowly, creating an uptake-demand mismatch.',
      likelyImpact: 'Stomatal restriction, uneven transpiration, and delayed nutrient delivery can occur together even though the air is cold.',
      decision: 'Remove cold ingress and reduce VPD gradually while verifying root-zone moisture; coordinate climate correction rather than changing humidity alone.',
      verifyNext: ['Root-zone moisture', 'Root-zone temperature', 'Leaf temperature'],
      avoid: 'Do not respond with irrigation alone; cold roots may not convert additional water into effective uptake.',
      evidence: { level: 'B', ruleIds: ['S001', 'S003', 'S006'], codes: ['E01', 'E02', 'E03', 'E04', 'E06'] },
      recommendedAction: 'Coordinate gradual warming with VPD correction and verify root water supply.',
      expectedEffect: 'Root supply and canopy demand move toward balance without overwatering.'
    };
  }

  return null;
}

function buildSingleMetricDiagnosis(snapshot, evaluation, label) {
  const evaluations = new Map((snapshot.evaluations || []).map((item) => [item.metricId, item]));
  const contextMetrics = DIAGNOSTIC_CONTEXT[evaluation.metricId] || [];
  const availableContext = contextMetrics.map((metricId) => evaluations.get(metricId)).filter(Boolean);
  const relatedReadings = [evaluation, ...availableContext].map((item) => diagnosticReading(snapshot, item));
  const missingMetrics = contextMetrics.filter((metricId) => !evaluations.has(metricId));
  const status = evaluation.state === 'critical' && DIRECT_CRITICAL_CONDITION_METRICS.has(evaluation.metricId)
    ? 'critical_condition'
    : availableContext.length > 0
      ? 'likely'
      : 'observed_condition';
  const diagnosisTitle = SINGLE_DIAGNOSIS_TITLES[evaluation.metricId]?.[evaluation.direction]
    || `Likely ${label.toLowerCase()} stress`;
  const catalogRule = CATALOG_RULES[evaluation.metricId]?.[evaluation.direction];
  const climateSynthesis = buildClimateSynthesis(evaluations);
  const synthesis = ['airTemp', 'humidity', 'vpd'].includes(evaluation.metricId) ? climateSynthesis : null;
  const summary = synthesis?.summary || buildDiagnosisSummary(snapshot, evaluation, label, availableContext);
  const mechanism = synthesis?.mechanism
    || SINGLE_DIAGNOSIS_IMPACTS[evaluation.metricId]?.[evaluation.direction]
    || 'The selected value changes the crop environment outside its configured target.';
  const likelyImpact = synthesis?.likelyImpact
    || `${mechanism} The actual crop response depends on duration, growth stage, and the related readings listed below.`;

  return {
    diagnosis: {
      status: status === 'likely' ? 'emerging' : status,
      label: status === 'critical_condition'
        ? 'Critical condition'
        : status === 'likely'
          ? 'Emerging'
          : 'Observed condition',
      title: synthesis?.title || diagnosisTitle,
      summary,
      mechanism,
      likelyImpact,
      decision: synthesis?.decision || ACTION_TEMPLATES[evaluation.metricId]?.[evaluation.direction],
      verifyNext: synthesis?.verifyNext || catalogRule?.verifyNext || [],
      avoid: synthesis?.avoid || catalogRule?.avoid || '',
      evidence: synthesis?.evidence || (catalogRule ? {
        level: catalogRule.evidenceLevel,
        ruleIds: [catalogRule.ruleId],
        codes: [...catalogRule.evidenceCodes]
      } : null),
      missingMetrics
    },
    relatedMetrics: relatedReadings.map((item) => item.metricId),
    relatedReadings,
    ...(synthesis ? {
      recommendedAction: synthesis.recommendedAction,
      expectedEffect: synthesis.expectedEffect
    } : {})
  };
}

function buildCandidate(snapshot, evaluation) {
  const metric = snapshot.profileMetrics?.[evaluation.metricId] || {};
  const rule = snapshot.scoreRules?.[evaluation.metricId];
  const label = metric.label || METRIC_LABELS[evaluation.metricId] || evaluation.metricId;
  const target = rule?.optimal || metric.optimal || null;
  const defaultAction = ACTION_TEMPLATES[evaluation.metricId]?.[evaluation.direction];
  const recommendedAction = metric.action || defaultAction || `Check ${label.toLowerCase()} controls and sensor placement.`;
  const observedAt = snapshot.observedAtByMetric?.[evaluation.metricId] || snapshot.latestReceivedAt || null;
  const diagnosticContext = buildSingleMetricDiagnosis(snapshot, evaluation, label);

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
    recommendedAction: diagnosticContext.recommendedAction || recommendedAction,
    expectedEffect: diagnosticContext.expectedEffect || EFFECTS[evaluation.metricId] || `${label} moves closer to the crop profile target.`,
    observedAt,
    confidence: snapshot.reportingNodes > 0 && snapshot.reportingNodes === snapshot.registeredNodes ? 'high' : 'medium',
    ...diagnosticContext
  };
}

export function buildTodayActions(sectionSnapshots, { limit = 3 } = {}) {
  const actionLimit = Math.max(1, Math.min(Number(limit) || 3, 100));
  const candidates = sectionSnapshots.flatMap((snapshot) => {
    const interactionCandidates = buildAgronomicInteractionCandidates(snapshot);
    const coveredMetrics = new Set(interactionCandidates.flatMap((candidate) => candidate.relatedMetrics || []));
    const singleMetricCandidates = (snapshot.evaluations || [])
      .filter((evaluation) => snapshot.scoreRules?.[evaluation.metricId]?.growth !== false)
      .filter((evaluation) => evaluation.state === 'critical' || evaluation.state === 'warning')
      .filter((evaluation) => evaluation.state === 'critical' || evaluation.severity >= MIN_WARNING_ACTION_SEVERITY)
      .filter((evaluation) => !coveredMetrics.has(evaluation.metricId))
      .map((evaluation) => buildCandidate(snapshot, evaluation));
    return [...interactionCandidates, ...singleMetricCandidates];
  });

  candidates.sort((left, right) => {
    if (left.state !== right.state) return left.state === 'critical' ? -1 : 1;
    if (left.severity !== right.severity) return right.severity - left.severity;
    if (left.ruleType !== right.ruleType) return left.ruleType === 'interaction' ? -1 : 1;
    return new Date(right.observedAt || 0) - new Date(left.observedAt || 0);
  });

  const selected = [];
  const sectionGroupCounts = new Map();
  for (const candidate of candidates) {
    const groupKey = candidate.ruleType === 'interaction'
      ? `${candidate.sectionId}:rule:${candidate.decisionGroup}`
      : `${candidate.sectionId}:${METRIC_GROUPS[candidate.metricId] || candidate.metricId}`;
    if (sectionGroupCounts.has(groupKey)) continue;
    if (selected.filter((item) => item.sectionId === candidate.sectionId).length >= 2) continue;
    selected.push(candidate);
    sectionGroupCounts.set(groupKey, 1);
    if (selected.length >= actionLimit) break;
  }

  return selected;
}

function distanceFromTarget(value, target) {
  const numeric = normalizeTelemetryNumber(value);
  if (numeric === null || !Array.isArray(target) || target.length !== 2) return null;
  const low = normalizeTelemetryNumber(target[0]);
  const high = normalizeTelemetryNumber(target[1]);
  if (low === null || high === null) return null;
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

export function isActionFeedbackTransitionAllowed(previousStatus, nextStatus) {
  if (nextStatus === 'completed') return previousStatus === 'in_progress';
  if (nextStatus === 'failed') return previousStatus === 'in_progress';
  if (nextStatus === 'in_progress') return previousStatus === null || previousStatus === undefined;
  return true;
}

export function evaluateActionOutcome(action, feedback, evidence = {}, now = Date.now()) {
  if (!action || !feedback) return null;
  if (feedback.status !== 'completed') {
    return {
      state: 'not_applicable',
      label: feedback.status === 'in_progress'
        ? 'Check in progress'
        : feedback.status === 'deferred'
          ? 'Deferred'
          : 'Could not complete',
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
    : normalizeTelemetryNumber(evidence.value) !== null && evidence.observedAt
      ? [{ value: evidence.value, observedAt: evidence.observedAt }]
      : [];
  const eligibleSamples = providedSamples
    .map((sample) => ({ value: normalizeTelemetryNumber(sample.value), observedAt: sample.observedAt }))
    .filter((sample) => {
      const observedAtMs = new Date(sample.observedAt || 0).getTime();
      return sample.value !== null
        && Number.isFinite(observedAtMs)
        && observedAtMs >= eligibleAtMs
        && observedAtMs <= windowEndsAtMs
        && (!Number.isFinite(nowMs) || observedAtMs <= nowMs);
    })
    .sort((left, right) => new Date(left.observedAt) - new Date(right.observedAt));
  const verificationSamples = eligibleSamples.slice(0, policy.minSamples);
  const common = {
    baselineValue: normalizeTelemetryNumber(action.value),
    baselineObservedAt: action.observedAt || null,
    currentValue: null,
    observedAt: null,
    sampleCount: verificationSamples.length,
    requiredSampleCount: policy.minSamples,
    eligibleAt,
    windowEndsAt,
    method: 'median-first-qualified-samples',
    modelVersion: '1.1.0'
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

  let targetWindow = null;
  for (let index = 0; index <= eligibleSamples.length - policy.minSamples; index += 1) {
    const candidate = eligibleSamples.slice(index, index + policy.minSamples);
    const candidateValue = median(candidate.map((sample) => sample.value));
    if (distanceFromTarget(candidateValue, action.target) === 0) {
      targetWindow = { samples: candidate, value: candidateValue, index };
      break;
    }
  }
  if (targetWindow) {
    const targetObservedAt = targetWindow.samples[targetWindow.samples.length - 1].observedAt;
    return {
      ...common,
      state: 'target_reached',
      label: 'Target reached',
      currentValue: targetWindow.value,
      observedAt: targetObservedAt,
      method: targetWindow.index === 0 ? common.method : 'median-first-target-window',
      change: targetWindow.value - Number(action.value),
      distanceImprovement: baselineDistance
    };
  }

  const targetSpan = Math.max(Math.abs(Number(action.target[1]) - Number(action.target[0])), 0.0001);
  const meaningfulChange = Math.max(policy.noiseFloor, targetSpan * 0.02, baselineDistance * 0.05, 0.0001);
  const improvement = baselineDistance - currentDistance;
  if (improvement > meaningfulChange) {
    return {
      ...common, state: 'improving', label: 'Improvement verified', currentValue, observedAt,
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
