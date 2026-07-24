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
  waterTemp: 'Water temperature'
};

const METRIC_UNITS = {
  airTemp: 'degC', humidity: '%', co2: 'ppm', lux: 'lx', soilTemp: 'degC',
  vpd: 'kPa', soilMoisture: '%', ec: 'mS/cm', ph: 'pH', leafTemp: 'degC',
  soilEc: 'mS/cm', waterTemp: 'degC'
};

function rule(id, decisionGroup, primaryMetric, requiredMetrics, copy, match, priority = 50) {
  return Object.freeze({
    id,
    decisionGroup,
    primaryMetric,
    requiredMetrics: Object.freeze(requiredMetrics),
    relatedMetrics: Object.freeze([...new Set(requiredMetrics)]),
    evidenceLevel: 'scientific-consensus',
    evidenceCodes: Object.freeze(['plant-water-relations', 'controlled-environment-horticulture']),
    priority,
    ...copy,
    match
  });
}

export const AGRONOMIC_INTERACTION_RULES = Object.freeze([
  rule('ATM_ROOT_DROUGHT', 'water-stress', 'soilMoisture', ['vpd', 'soilMoisture'], {
    title: 'Relieve combined atmospheric and root-zone water stress',
    reason: 'High VPD and low soil moisture increase water loss while limiting root water supply.',
    recommendedAction: 'Check irrigation delivery first, then reduce VPD gradually without creating condensation risk.',
    expectedEffect: 'Root water supply and transpiration demand move back into balance.'
  }, (c) => c.high('vpd') && c.low('soilMoisture'), 96),
  rule('CANOPY_HYDRAULIC_STRESS', 'water-stress', 'leafTemp', ['leafTemp', 'vpd'], {
    title: 'Check canopy water stress and cooling',
    reason: 'High leaf temperature together with high VPD indicates that canopy cooling may be insufficient.',
    recommendedAction: 'Verify irrigation and airflow, then reduce canopy heat load or VPD gradually.',
    expectedEffect: 'Leaf cooling improves and transpiration pressure decreases.'
  }, (c) => c.high('leafTemp') && c.high('vpd'), 94),
  rule('DRY_SALINE_ROOT_ZONE', 'root-salinity', 'soilEc', ['vpd', 'soilMoisture', 'soilEc'], {
    title: 'Correct dry and saline root-zone conditions',
    reason: 'High VPD, low substrate moisture, and high root-zone EC combine water deficit with osmotic stress.',
    recommendedAction: 'Verify irrigation uniformity and drainage, then correct moisture and salinity in controlled steps.',
    expectedEffect: 'Root water uptake improves while salt concentration falls.'
  }, (c) => c.high('vpd') && c.low('soilMoisture') && c.high('soilEc'), 100),
  rule('WET_ROOT_UPTAKE_LIMIT', 'water-stress', 'leafTemp', ['vpd', 'soilMoisture', 'leafTemp'], {
    title: 'Check root uptake before adding more irrigation',
    reason: 'The canopy is hot under high demand even though the root zone is already wet, so extra irrigation may worsen oxygen limitation.',
    recommendedAction: 'Do not irrigate automatically; inspect drainage, root health, water temperature, and root-zone oxygenation.',
    expectedEffect: 'The cause of weak uptake is corrected without overwatering the crop.'
  }, (c) => c.high('vpd') && c.high('soilMoisture') && c.high('leafTemp'), 100),
  rule('LOW_DEMAND_OVERWATERING', 'irrigation-balance', 'soilMoisture', ['vpd', 'soilMoisture'], {
    title: 'Reduce irrigation under low atmospheric demand',
    reason: 'Low VPD reduces transpiration while high soil moisture indicates that irrigation exceeds current crop demand.',
    recommendedAction: 'Extend the irrigation interval and verify drainage before the next event.',
    expectedEffect: 'Root-zone aeration improves without creating canopy water stress.'
  }, (c) => c.low('vpd') && c.high('soilMoisture'), 90),
  rule('WARM_WET_ROOT_ZONE', 'root-health', 'soilTemp', ['soilTemp', 'soilMoisture'], {
    title: 'Reduce warm, saturated root-zone risk',
    reason: 'High root-zone temperature and high moisture can reduce oxygen availability and increase root disease pressure.',
    recommendedAction: 'Improve drainage and root-zone cooling; inspect roots before changing nutrient strength.',
    expectedEffect: 'Root-zone oxygen conditions and root function improve.'
  }, (c) => c.high('soilTemp') && c.high('soilMoisture'), 88),
  rule('HOT_CONCENTRATED_SOLUTION', 'solution-stress', 'waterTemp', ['waterTemp', 'ec'], {
    title: 'Cool and verify the concentrated nutrient solution',
    reason: 'High nutrient-solution temperature combined with high EC increases root stress and reduces dissolved oxygen.',
    recommendedAction: 'Cool the solution, verify dosing calibration, and check dissolved oxygen before irrigation.',
    expectedEffect: 'Nutrient delivery becomes safer and root oxygen availability improves.'
  }, (c) => c.high('waterTemp') && c.high('ec'), 92),
  rule('HOT_ROOT_SYSTEM', 'root-health', 'waterTemp', ['waterTemp', 'soilTemp'], {
    title: 'Cool the irrigation and root-zone system',
    reason: 'Both irrigation water and root-zone temperatures are above target, increasing root respiration and oxygen demand.',
    recommendedAction: 'Check tank cooling, pipe heat gain, irrigation timing, and root-zone ventilation.',
    expectedEffect: 'Root temperatures and oxygen demand move toward the crop target.'
  }, (c) => c.high('waterTemp') && c.high('soilTemp'), 90),
  rule('HOT_CANOPY_COLD_ROOT', 'temperature-gradient', 'soilTemp', ['airTemp', 'soilTemp'], {
    title: 'Correct the canopy-to-root temperature mismatch',
    reason: 'Hot air with a cold root zone can create high shoot demand while root uptake remains slow.',
    recommendedAction: 'Reduce canopy heat load and warm the root zone gradually rather than increasing irrigation.',
    expectedEffect: 'Shoot demand and root uptake become better synchronized.'
  }, (c) => c.high('airTemp') && c.low('soilTemp'), 86),
  rule('ROOT_SALT_ACCUMULATION', 'root-salinity', 'soilEc', ['ec', 'soilEc'], {
    title: 'Investigate salt accumulation in the root zone',
    reason: 'Root-zone EC is high while incoming solution EC is not high, indicating concentration or insufficient leaching.',
    recommendedAction: 'Check drainage fraction and irrigation uniformity before applying a controlled flush.',
    expectedEffect: 'Root-zone salinity decreases without unnecessary nutrient dilution.'
  }, (c) => c.high('soilEc') && !c.high('ec'), 91),
  rule('SYSTEMIC_HIGH_SALINITY', 'solution-stress', 'soilEc', ['ec', 'soilEc'], {
    title: 'Reduce system-wide salinity pressure',
    reason: 'Both solution EC and root-zone EC are above target, indicating excessive nutrient concentration across the system.',
    recommendedAction: 'Verify dosing calibration, lower feed EC in steps, and monitor drainage EC.',
    expectedEffect: 'Osmotic stress decreases across the irrigation and root-zone system.'
  }, (c) => c.high('ec') && c.high('soilEc'), 94),
  rule('HIGH_PH_AVAILABILITY', 'nutrient-availability', 'ph', ['ph', 'ec'], {
    title: 'Correct high pH before increasing nutrients',
    reason: 'High pH can restrict micronutrient availability even when nutrient concentration is adequate.',
    recommendedAction: 'Verify pH calibration and lower pH gradually; do not increase EC solely to correct deficiency symptoms.',
    expectedEffect: 'Nutrient availability improves without increasing salt load.'
  }, (c) => c.high('ph') && !c.low('ec'), 84),
  rule('LOW_PH_HIGH_EC', 'nutrient-availability', 'ph', ['ph', 'ec'], {
    title: 'Correct acidic, concentrated feed conditions',
    reason: 'Low pH together with high EC increases the risk of nutrient imbalance and root injury.',
    recommendedAction: 'Verify both probes, raise pH gradually, and reduce nutrient concentration if confirmed.',
    expectedEffect: 'Root chemical stress decreases and nutrient balance improves.'
  }, (c) => c.low('ph') && c.high('ec'), 90),
  rule('LIGHT_CO2_LIMITATION', 'photosynthesis', 'co2', ['lux', 'co2'], {
    title: 'Match CO2 supply to active light',
    reason: 'Light is available for photosynthesis while CO2 remains below its crop-profile target.',
    recommendedAction: 'Check CO2 schedule, delivery uniformity, ventilation losses, and sensor calibration.',
    expectedEffect: 'Carbon supply better matches available light.'
  }, (c) => c.lightActive() && c.low('co2'), 82),
  rule('DARK_CO2_WASTE', 'photosynthesis', 'co2', ['lux', 'co2'], {
    title: 'Stop unnecessary CO2 dosing in darkness',
    reason: 'CO2 is above target while measured light is inactive, so enrichment may not produce a photosynthetic return.',
    recommendedAction: 'Check dosing schedules, valve leakage, ventilation, and the configured photoperiod.',
    expectedEffect: 'CO2 use and operating cost decrease without reducing photosynthesis.'
  }, (c) => c.dark() && c.high('co2'), 78),
  rule('LIGHT_VPD_LOAD', 'canopy-load', 'vpd', ['lux', 'vpd'], {
    title: 'Reduce high light and VPD load together',
    reason: 'Strong light and high VPD jointly increase leaf energy load and transpiration demand.',
    recommendedAction: 'Coordinate shading, ventilation, cooling, and humidity rather than changing only one control.',
    expectedEffect: 'Canopy heat and water demand decrease together.'
  }, (c) => c.lightHigh() && c.high('vpd'), 88),
  rule('PHOTOTHERMAL_CANOPY', 'canopy-load', 'leafTemp', ['lux', 'leafTemp'], {
    title: 'Reduce excessive canopy radiation load',
    reason: 'High light and high leaf temperature indicate that absorbed radiation exceeds current canopy cooling.',
    recommendedAction: 'Check shading, lamp distance, airflow, and irrigation before reducing light permanently.',
    expectedEffect: 'Leaf temperature falls while useful light is preserved.'
  }, (c) => c.lightHigh() && c.high('leafTemp'), 87),
  rule('RAPID_GROWTH_LOW_TRANSPIRATION', 'canopy-load', 'vpd', ['lux', 'vpd'], {
    title: 'Restore transpiration under active light',
    reason: 'High light with low VPD can limit transpiration and nutrient transport during active photosynthesis.',
    recommendedAction: 'Reduce humidity or raise temperature gradually while maintaining adequate irrigation.',
    expectedEffect: 'Transpiration and nutrient transport better match the light period.'
  }, (c) => c.lightHigh() && c.low('vpd'), 82),
  rule('CONDENSATION_IMMINENT', 'condensation', 'humidity', ['airTemp', 'humidity', 'leafTemp'], {
    title: 'Prevent imminent canopy condensation',
    reason: 'Leaf temperature is within 1 degC of the air dew point while humidity is above target.',
    recommendedAction: 'Increase gentle air movement and create a small temperature or humidity margin without shocking the crop.',
    expectedEffect: 'Leaf surfaces remain above dew point and disease risk decreases.'
  }, (c) => c.high('humidity') && c.dewPointMargin() !== null && c.dewPointMargin() <= 1, 99),
  rule('COLD_LEAF_CONDENSATION', 'condensation', 'leafTemp', ['airTemp', 'humidity', 'leafTemp'], {
    title: 'Warm cold leaf surfaces above dew point',
    reason: 'Leaf temperature is below target and close to the calculated dew point, creating condensation risk.',
    recommendedAction: 'Check cold drafts and raise leaf temperature gently while maintaining air movement.',
    expectedEffect: 'Dew-point margin increases and leaf wetness risk falls.'
  }, (c) => c.low('leafTemp') && c.dewPointMargin() !== null && c.dewPointMargin() <= 1, 97),
  rule('ROOT_ZONE_DILUTION', 'root-nutrition', 'soilEc', ['soilMoisture', 'soilEc'], {
    title: 'Correct an over-wet, diluted root zone',
    reason: 'High root-zone moisture together with low root-zone EC suggests excess irrigation or nutrient dilution.',
    recommendedAction: 'Check irrigation volume and drainage, then restore nutrient strength only after moisture normalizes.',
    expectedEffect: 'Root-zone aeration and nutrient concentration return toward target.'
  }, (c) => c.high('soilMoisture') && c.low('soilEc'), 84),
  rule('HIGH_DEMAND_LOW_FEED', 'root-nutrition', 'ec', ['lux', 'ec'], {
    title: 'Check nutrient supply during high light demand',
    reason: 'High light raises growth demand while nutrient-solution EC is below target.',
    recommendedAction: 'Verify dosing and irrigation frequency before increasing EC gradually.',
    expectedEffect: 'Nutrient supply better matches active growth demand.'
  }, (c) => c.lightHigh() && c.low('ec'), 80),
  rule('DRYBACK_CONCENTRATION', 'root-salinity', 'soilEc', ['soilMoisture', 'soilEc', 'ec'], {
    title: 'Correct dryback-driven salt concentration',
    reason: 'Low substrate moisture and high root-zone EC despite non-high feed EC indicate concentration during dryback.',
    recommendedAction: 'Shorten excessive dryback and verify distribution uniformity before changing feed concentration.',
    expectedEffect: 'Root-zone EC falls as moisture distribution stabilizes.'
  }, (c) => c.low('soilMoisture') && c.high('soilEc') && !c.high('ec'), 93),
  rule('ALKALINE_SALINE_DRY_ROOT', 'root-salinity', 'ph', ['ph', 'soilEc', 'soilMoisture'], {
    title: 'Correct alkaline, saline dry-root conditions',
    reason: 'High pH, high root-zone EC, and low moisture jointly restrict water and nutrient uptake.',
    recommendedAction: 'Verify sensors, restore moisture carefully, then correct pH and salinity in controlled steps.',
    expectedEffect: 'Water uptake and nutrient availability improve without abrupt root-zone change.'
  }, (c) => c.high('ph') && c.high('soilEc') && c.low('soilMoisture'), 98),
  rule('COLD_CONCENTRATED_FEED', 'solution-stress', 'waterTemp', ['waterTemp', 'ec', 'ph'], {
    title: 'Correct cold, concentrated nutrient delivery',
    reason: 'Cold irrigation water with high EC and high pH can slow uptake while reducing nutrient availability.',
    recommendedAction: 'Warm the solution gradually, verify dosing and pH probes, then correct EC and pH.',
    expectedEffect: 'Root uptake and nutrient availability improve together.'
  }, (c) => c.low('waterTemp') && c.high('ec') && c.high('ph'), 89)
]);

function dewPointCelsius(airTemp, humidity) {
  if (!Number.isFinite(airTemp) || !Number.isFinite(humidity) || humidity <= 0 || humidity > 100) return null;
  const a = 17.27;
  const b = 237.3;
  const gamma = Math.log(humidity / 100) + (a * airTemp) / (b + airTemp);
  return (b * gamma) / (a - gamma);
}

function makeContext(snapshot) {
  const evaluations = new Map((snapshot.evaluations || []).map((item) => [item.metricId, item]));
  const evaluation = (metricId) => evaluations.get(metricId) || null;
  const value = (metricId) => {
    const numeric = Number(evaluation(metricId)?.value);
    return Number.isFinite(numeric) ? numeric : null;
  };
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
      const dewPoint = dewPointCelsius(value('airTemp'), value('humidity'));
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
      status: 'confirmed',
      label: 'Confirmed',
      title: definition.title,
      summary: definition.reason,
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
    if (!definition.requiredMetrics.every((metricId) => context.evaluation(metricId))) continue;
    if (!definition.match(context)) continue;
    const candidate = buildInteractionCandidate(snapshot, definition, context);
    if (!candidate) continue;
    candidates.push(candidate);
    matchedGroups.add(definition.decisionGroup);
  }

  return candidates;
}
