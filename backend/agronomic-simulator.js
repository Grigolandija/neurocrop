import { buildScoreFromMetricValues, buildScoreRules, evaluateMetricValue } from './score.js';
import { buildTodayActions } from './today-actions.js';
import { calcVPD } from './calculations.js';

export const SIMULATOR_METRICS = Object.freeze([
  'airTemp', 'humidity', 'co2', 'lux', 'leafTemp',
  'soilMoisture', 'soilTemp', 'ec', 'ph', 'soilEc', 'waterTemp'
]);

function temporalDiagnosis(diagnosis, durationMinutes) {
  if (!diagnosis) return null;
  if (diagnosis.status === 'confirmed') {
    return {
      ...diagnosis,
      temporalStatus: durationMinutes >= 10 ? 'persistent' : 'snapshot',
      durationMinutes
    };
  }
  if (diagnosis.status === 'insufficient_data') {
    return { ...diagnosis, temporalStatus: 'insufficient_data', durationMinutes };
  }
  if (durationMinutes >= 10) {
    return {
      ...diagnosis,
      status: 'likely',
      label: 'Likely',
      title: String(diagnosis.title || '').replace(/^Emerging /, 'Likely '),
      temporalStatus: durationMinutes >= 30 ? 'persistent' : 'sustained',
      summary: `${diagnosis.summary} The simulated deviation persists for ${durationMinutes} minutes.`,
      durationMinutes
    };
  }
  return {
    ...diagnosis,
    status: 'emerging',
    label: 'Emerging',
    temporalStatus: 'snapshot',
    durationMinutes
  };
}

export function simulateAgronomicScenario({
  profileId = 'simulated-profile',
  profileName = 'Selected crop profile',
  profileMetrics = {},
  values = {},
  durationMinutes = 1
}) {
  const selectedMetrics = Object.keys(values);
  if (selectedMetrics.length < 2 || selectedMetrics.length > 3) {
    throw new Error('Select between 2 and 3 parameters');
  }
  if (selectedMetrics.some((metricId) => !SIMULATOR_METRICS.includes(metricId))) {
    throw new Error('The scenario contains an unsupported parameter');
  }
  const inputValues = Object.fromEntries(selectedMetrics.map((metricId) => {
    const value = Number(values[metricId]);
    if (!Number.isFinite(value)) throw new Error(`Invalid value for ${metricId}`);
    return [metricId, value];
  }));
  const normalizedValues = { ...inputValues };
  if (Number.isFinite(inputValues.airTemp) && Number.isFinite(inputValues.humidity)) {
    const derivedVpd = calcVPD(inputValues.airTemp, inputValues.humidity);
    if (derivedVpd === null) throw new Error('Invalid air temperature or relative humidity');
    normalizedValues.vpd = Number(derivedVpd.toFixed(3));
  }
  const normalizedDuration = Number(durationMinutes);
  if (!Number.isFinite(normalizedDuration) || normalizedDuration < 1 || normalizedDuration > 1440) {
    throw new Error('Duration must be between 1 and 1440 minutes');
  }

  const scoreRules = buildScoreRules(profileMetrics);
  const evaluationMetrics = Object.keys(normalizedValues);
  const evaluations = evaluationMetrics.map((metricId) =>
    evaluateMetricValue(metricId, normalizedValues[metricId], scoreRules)
  );
  const observedAt = new Date().toISOString();
  const actions = buildTodayActions([{
    section: {
      id: 'simulated-section',
      name: 'Simulated Section',
      area_id: 'simulated-area',
      area_name: 'Scenario Simulator',
      crop_profile: profileId
    },
    profileMetrics,
    scoreRules,
    evaluations,
    observedAtByMetric: Object.fromEntries(evaluationMetrics.map((metricId) => [metricId, observedAt])),
    latestReceivedAt: observedAt,
    reportingNodes: 1,
    registeredNodes: 1
  }]);
  const score = buildScoreFromMetricValues(normalizedValues, profileMetrics);
  const primary = actions[0] || null;
  const diagnosis = primary
    ? temporalDiagnosis(primary.diagnosis, normalizedDuration)
    : {
        status: 'stable',
        label: 'Stable',
        title: 'Selected conditions remain inside the crop profile',
        summary: `No actionable deviation was found in the ${selectedMetrics.length} simulated parameters.`,
        temporalStatus: normalizedDuration >= 10 ? 'persistent' : 'snapshot',
        durationMinutes: normalizedDuration,
        missingMetrics: []
      };

  return {
    generatedAt: observedAt,
    profile: { id: profileId, name: profileName },
    durationMinutes: normalizedDuration,
    values: normalizedValues,
    inputValues,
    derivedValues: normalizedValues.vpd === undefined ? {} : { vpd: normalizedValues.vpd },
    score: score.score,
    conditionStatus: score.conditionStatus,
    mainDriver: score.mainDriver,
    diagnosis,
    action: primary ? { ...primary, diagnosis } : null,
    limitations: [
      'This is a rule-based scenario, not a yield forecast.',
      'The result assumes the selected values persist for the chosen duration.',
      'Unselected parameters remain unknown and can change the real outcome.'
    ]
  };
}
