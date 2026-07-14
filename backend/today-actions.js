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
      .filter((evaluation) => evaluation.state === 'critical' || evaluation.state === 'warning')
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
