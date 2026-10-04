import { METRIC_LABELS, METRIC_UNITS } from '../metrics.js';
import { AGRONOMIC_INTERACTION_RULES } from './catalog.js';
import { calcDewPoint } from '../calculations.js';
import { normalizeTelemetryNumber } from '../telemetry-values.js';

function makeContext(snapshot) {
  const evaluations = new Map((snapshot.evaluations || []).map((item) => [item.metricId, item]));
  const evaluation = (metricId) => evaluations.get(metricId) || null;
  const value = metricId => normalizeTelemetryNumber(evaluation(metricId)?.value);
  const direction = (metricId) => evaluation(metricId)?.direction;
  const target = (metricId) => snapshot.scoreRules?.[metricId]?.optimal || snapshot.profileMetrics?.[metricId]?.optimal || null;
  return {
    evaluation,
    value,
    target,
    high: (metricId) => direction(metricId) === 'high',
    low: (metricId) => direction(metricId) === 'low',
    lightActive: () => {
      const light = value('lux');
      const range = target('lux');
      return light !== null && Array.isArray(range) && light >= Math.max(100, Number(range[0]) * 0.2);
    },
    lightHigh: () => {
      const light = value('lux');
      const range = target('lux');
      return light !== null && Array.isArray(range) && light >= Number(range[1]);
    },
    dark: () => {
      const light = value('lux');
      const range = target('lux');
      return light !== null && light <= Math.max(50, Array.isArray(range) ? Number(range[0]) * 0.02 : 50);
    },
    dewPointMargin: () => {
      const dewPoint = calcDewPoint(value('airTemp'), value('humidity'));
      const leafTemp = value('leafTemp');
      return dewPoint === null || leafTemp === null ? null : leafTemp - dewPoint;
    }
  };
}

function readingFor(snapshot, context, metricId) {
  const evaluation = context.evaluation(metricId);
  if (!evaluation) return null;
  const metric = snapshot.profileMetrics?.[metricId] || {};
  return {
    metricId,
    metricLabel: metric.label || METRIC_LABELS[metricId] || metricId,
    value: evaluation.value,
    unit: metric.unit || METRIC_UNITS[metricId] || '',
    target: context.target(metricId),
    state: evaluation.state,
    direction: evaluation.direction
  };
}

function readingReason(reading) {
  const direction = reading.direction === 'high' ? 'above' : reading.direction === 'low' ? 'below' : 'inside';
  return `${reading.metricLabel} is ${direction} its crop-profile target`;
}

function buildInteractionCandidate(snapshot, definition, context) {
  const primary = context.evaluation(definition.primaryMetric);
  if (!primary || !['critical', 'warning'].includes(primary.state)) return null;
  const relatedReadings = definition.relatedMetrics
    .map((metricId) => readingFor(snapshot, context, metricId))
    .filter(Boolean);
  if (relatedReadings.length !== definition.requiredMetrics.length) return null;
  const observedTimes = definition.relatedMetrics
    .map((metricId) => snapshot.observedAtByMetric?.[metricId])
    .filter(Boolean)
    .sort();
  const metric = snapshot.profileMetrics?.[definition.primaryMetric] || {};
  const primaryReading = relatedReadings.find((item) => item.metricId === definition.primaryMetric);
  const dewPointMargin = context.dewPointMargin();
  const relatedSeverity = definition.relatedMetrics
    .map((metricId) => Number(context.evaluation(metricId)?.severity || 0))
    .filter(Number.isFinite);

  return {
    id: `${snapshot.section.id}:${definition.primaryMetric}:rule:${definition.id}`,
    areaId: snapshot.section.area_id,
    areaName: snapshot.section.area_name || '',
    sectionId: snapshot.section.id,
    sectionName: snapshot.section.name,
    profileId: snapshot.section.crop_profile || null,
    metricId: definition.primaryMetric,
    metricLabel: primaryReading.metricLabel,
    state: relatedReadings.some((item) => item.state === 'critical') ? 'critical' : 'warning',
    priority: relatedReadings.some((item) => item.state === 'critical') ? 'now' : 'today',
    severity: Number(Math.max(primary.severity || 0, ...relatedSeverity).toFixed(3)),
    direction: primary.direction,
    value: primary.value,
    unit: metric.unit || METRIC_UNITS[definition.primaryMetric] || '',
    target: primaryReading.target,
    title: definition.title,
    reason: definition.reason,
    recommendedAction: definition.recommendedAction,
    expectedEffect: definition.expectedEffect,
    observedAt: observedTimes.at(-1) || snapshot.latestReceivedAt || null,
    confidence: snapshot.reportingNodes > 0 && snapshot.reportingNodes === snapshot.registeredNodes ? 'high' : 'medium',
    ruleType: 'interaction',
    ruleId: definition.id,
    decisionGroup: definition.decisionGroup,
    relatedMetrics: [...definition.relatedMetrics],
    relatedReadings,
    why: relatedReadings.filter((item) => item.direction !== 'optimal').map(readingReason),
    derived: dewPointMargin === null ? {} : { dewPointMargin: Number(dewPointMargin.toFixed(2)), unit: 'degC' },
    evidence: {
      level: definition.evidenceLevel,
      codes: [...definition.evidenceCodes]
    },
    diagnosis: {
      status: 'observed_condition',
      label: 'Observed conditions',
      title: definition.title,
      summary: definition.reason,
      mechanism: definition.reason,
      likelyImpact: definition.expectedEffect,
      decision: definition.recommendedAction,
      verifyNext: relatedReadings.map((item) => item.metricLabel),
      avoid: '',
      evidence: {
        level: definition.evidenceLevel,
        ruleIds: [definition.id],
        codes: [...definition.evidenceCodes]
      },
      missingMetrics: []
    }
  };
}

export function buildAgronomicInteractionCandidates(snapshot) {
  const context = makeContext(snapshot);
  const matchedGroups = new Set();
  const candidates = [];
  const orderedRules = [...AGRONOMIC_INTERACTION_RULES].sort((left, right) => right.priority - left.priority);

  for (const definition of orderedRules) {
    if (matchedGroups.has(definition.decisionGroup)) continue;
    if (!definition.requiredMetrics.every((metricId) => context.evaluation(metricId) && context.value(metricId) !== null)) continue;
    if (!definition.match(context)) continue;
    const candidate = buildInteractionCandidate(snapshot, definition, context);
    if (!candidate) continue;
    candidates.push(candidate);
    matchedGroups.add(definition.decisionGroup);
  }

  return candidates;
}
