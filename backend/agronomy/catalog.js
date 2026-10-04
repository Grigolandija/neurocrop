// Authoritative agronomic conditions, decisions and priorities for live and historical analysis.
// Crop limits remain in each observation's crop profile.
export const HISTORICAL_INCLUSION_MINUTES = 30;
export const LEGACY_MIN_COVERAGE_PCT = 50;
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


export const METRIC_GROUPS = {
  airTemp: 'climate', humidity: 'climate', vpd: 'climate',
  co2: 'carbon-light', lux: 'carbon-light',
  soilTemp: 'root-zone', soilMoisture: 'root-zone', soilEc: 'root-zone',
  ec: 'nutrition', ph: 'nutrition', waterTemp: 'nutrition',
  leafTemp: 'canopy'
};

export const ACTION_TEMPLATES = {
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
  waterTemp: { low: 'Check tank and irrigation-loop heating.', high: 'Cool the tank and inspect irrigation-loop temperature.' }
};

export const EFFECTS = {
  humidity: 'VPD and condensation risk move closer to the crop target.',
  vpd: 'Transpiration pressure moves closer to the crop target.',
  airTemp: 'Climate stress decreases and VPD becomes more stable.',
  co2: 'Photosynthesis conditions become more stable.',
  lux: 'Light exposure moves closer to the configured photoperiod target.',
  soilMoisture: 'Root-zone water availability moves closer to target.',
  ec: 'Nutrient concentration moves closer to target.',
  ph: 'Nutrient availability moves closer to the configured range.'
};

export const DIAGNOSTIC_CONTEXT = {
  airTemp: ['humidity', 'vpd', 'leafTemp'],
  humidity: ['airTemp', 'vpd', 'leafTemp'],
  vpd: ['airTemp', 'humidity', 'leafTemp', 'soilMoisture'],
  co2: ['lux', 'airTemp'],
  soilTemp: ['soilMoisture', 'waterTemp'],
  soilMoisture: ['vpd', 'soilEc', 'soilTemp'],
  ec: ['ph', 'soilEc', 'waterTemp'],
  ph: ['ec', 'soilEc'],
  leafTemp: ['airTemp', 'humidity', 'vpd'],
  soilEc: ['soilMoisture', 'ec', 'ph'],
  waterTemp: ['ec', 'soilTemp']
};

export const SINGLE_DIAGNOSIS_TITLES = {
  airTemp: { low: 'Emerging cold-stress risk', high: 'Emerging canopy heat risk' },
  humidity: { low: 'Emerging atmospheric drying risk', high: 'Emerging condensation risk' },
  vpd: { low: 'Emerging low-transpiration risk', high: 'Emerging high-transpiration risk' },
  co2: { low: 'Potential carbon limitation', high: 'Potential inefficient CO2 enrichment' },
  soilTemp: { low: 'Potential restricted root activity', high: 'Potential elevated root respiration' },
  soilMoisture: { low: 'Potential root-zone water deficit', high: 'Potential root-zone oxygen limitation' },
  ec: { low: 'Potential insufficient nutrient concentration', high: 'Potential osmotic root stress' },
  ph: { low: 'Strongly acidic nutrient solution', high: 'Strongly alkaline nutrient solution' },
  leafTemp: { low: 'Emerging cold-canopy risk', high: 'Emerging insufficient canopy cooling' },
  soilEc: { low: 'Potential diluted root-zone nutrition', high: 'Potential root-zone salinity stress' },
  waterTemp: { low: 'Potential cold irrigation stress', high: 'Potential low root-zone oxygen availability' }
};

export const SINGLE_DIAGNOSIS_IMPACTS = {
  airTemp: {
    low: 'Low air temperature can slow development and photosynthetic activity.',
    high: 'High air temperature increases respiration and canopy heat load.'
  },
  humidity: {
    low: 'Low relative humidity can increase atmospheric drying demand.',
    high: 'High relative humidity can restrict evaporative cooling and increase condensation risk.'
  },
  vpd: {
    low: 'Low VPD can restrict transpiration and nutrient transport.',
    high: 'High VPD can increase water loss and stomatal stress.'
  },
  co2: {
    low: 'Low CO2 can limit photosynthesis when useful light is available.',
    high: 'High CO2 may indicate inefficient enrichment or insufficient air exchange.'
  },
  soilTemp: {
    low: 'Low root-zone temperature can slow water and nutrient uptake.',
    high: 'High root-zone temperature increases respiration and oxygen demand.'
  },
  soilMoisture: {
    low: 'Low root-zone moisture can restrict water uptake.',
    high: 'High root-zone moisture can reduce oxygen availability around roots.'
  },
  ec: {
    low: 'Low solution EC can indicate insufficient total nutrient concentration.',
    high: 'High solution EC increases osmotic pressure and can restrict root water uptake.'
  },
  ph: {
    low: 'Low pH can disrupt nutrient availability and increase the risk of root injury.',
    high: 'High pH can reduce micronutrient availability and create nutrient lockout.'
  },
  leafTemp: {
    low: 'Low leaf temperature can indicate cold airflow or condensation risk.',
    high: 'High leaf temperature can indicate insufficient canopy cooling.'
  },
  soilEc: {
    low: 'Low root-zone EC can indicate nutrient dilution.',
    high: 'High root-zone EC can create salinity and osmotic stress.'
  },
  waterTemp: {
    low: 'Cold irrigation water can slow root activity.',
    high: 'Warm irrigation water holds less oxygen and can increase root stress.'
  }
};

export const CATALOG_RULES = {
  airTemp: {
    low: { ruleId: 'S001', evidenceLevel: 'B', evidenceCodes: ['E03', 'E06'], verifyNext: ['Root-zone temperature', 'Leaf temperature', '10–30 min temperature trend'], avoid: 'Do not compensate for cold-limited uptake by increasing irrigation or nutrients first.' },
    high: { ruleId: 'S002', evidenceLevel: 'B', evidenceCodes: ['E03', 'E06'], verifyNext: ['Leaf temperature', 'VPD', 'Light load'], avoid: 'Do not cool or humidify abruptly without checking canopy temperature and VPD.' }
  },
  humidity: {
    low: { ruleId: 'S003', evidenceLevel: 'A', evidenceCodes: ['E01', 'E02'], verifyNext: ['VPD', 'Leaf temperature', '10–30 min humidity trend'], avoid: 'Do not increase humidity from RH alone; first confirm atmospheric demand with VPD.' },
    high: { ruleId: 'S004', evidenceLevel: 'A', evidenceCodes: ['E02', 'E13'], verifyNext: ['Leaf-to-dew-point margin', 'Air movement', 'Night temperature trend'], avoid: 'Do not use RH alone as proof of condensation; confirm the surface temperature margin.' }
  },
  vpd: {
    low: { ruleId: 'S005', evidenceLevel: 'B', evidenceCodes: ['E02', 'E13'], verifyNext: ['Leaf temperature', 'Air movement', 'Calcium-sensitive growth'], avoid: 'Do not raise VPD abruptly; protect the crop from a sudden transpiration increase.' },
    high: { ruleId: 'S006', evidenceLevel: 'B', evidenceCodes: ['E03', 'E04'], verifyNext: ['Root-zone moisture', 'Leaf temperature', '10–30 min VPD trend'], avoid: 'Do not add irrigation or humidity blindly before checking root water supply and canopy response.' }
  },
  co2: {
    low: { ruleId: 'S007', evidenceLevel: 'B', evidenceCodes: ['E04', 'E05'], verifyNext: ['Active light', 'Ventilation state', 'CO2 distribution'], avoid: 'Do not increase CO2 dosing unless useful light is available.' },
    high: { ruleId: 'S008', evidenceLevel: 'B', evidenceCodes: ['E04', 'E05'], verifyNext: ['Active light', 'Dosing schedule', 'Ventilation losses'], avoid: 'Do not intensify enrichment before confirming a photosynthetic return.' }
  },
  lux: {
    low: { ruleId: 'S009', evidenceLevel: 'B', evidenceCodes: ['E05', 'E06'], verifyNext: ['Photoperiod', 'Canopy PPFD', 'Daily light integral'], avoid: 'Do not diagnose light limitation from one lux snapshot; use canopy PPFD and DLI.' },
    high: { ruleId: 'S010', evidenceLevel: 'B', evidenceCodes: ['E05', 'E06'], verifyNext: ['CO2', 'Leaf temperature', 'VPD'], avoid: 'Do not reduce useful light permanently before checking whether another factor is limiting cooling or photosynthesis.' }
  },
  leafTemp: {
    low: { ruleId: 'S011', evidenceLevel: 'C', evidenceCodes: ['E02', 'E03'], verifyNext: ['Air temperature', 'VPD', 'Dew-point margin'], avoid: 'Do not infer cold injury before excluding sensor view and evaporative cooling effects.' },
    high: { ruleId: 'S012', evidenceLevel: 'B', evidenceCodes: ['E03', 'E05'], verifyNext: ['Air temperature', 'VPD', 'Light load'], avoid: 'Do not treat hot leaves as an air-temperature problem only; check canopy energy and water balance.' }
  },
  soilMoisture: {
    low: { ruleId: 'S015', evidenceLevel: 'B', evidenceCodes: ['E01', 'E11'], verifyNext: ['VPD', 'Root-zone EC', 'Dryback curve'], avoid: 'Do not irrigate from one point reading before checking sensor placement and distribution uniformity.' },
    high: { ruleId: 'S016', evidenceLevel: 'B', evidenceCodes: ['E08'], verifyNext: ['Drainage', 'Root-zone temperature', 'Root condition'], avoid: 'Do not add further irrigation until drainage and root-zone aeration are checked.' }
  },
  soilTemp: {
    low: { ruleId: 'S017', evidenceLevel: 'B', evidenceCodes: ['E07'], verifyNext: ['Irrigation-water temperature', 'Soil moisture', 'Air temperature'], avoid: 'Do not compensate for slow cold-root uptake by increasing feed strength.' },
    high: { ruleId: 'S018', evidenceLevel: 'B', evidenceCodes: ['E07', 'E08'], verifyNext: ['Water temperature', 'Soil moisture', 'Root aeration'], avoid: 'Do not assess warm roots independently of moisture and oxygen availability.' }
  },
  ec: {
    low: { ruleId: 'S019', evidenceLevel: 'B', evidenceCodes: ['E09'], verifyNext: ['Nutrient recipe', 'Doser calibration', 'Laboratory ion analysis'], avoid: 'Do not assume which element is deficient from EC alone.' },
    high: { ruleId: 'S020', evidenceLevel: 'B', evidenceCodes: ['E10', 'E11'], verifyNext: ['Root-zone EC', 'Water source', 'Dosing calibration'], avoid: 'Do not flush or dilute before distinguishing feed concentration from root-zone accumulation.' }
  },
  ph: {
    low: { ruleId: 'S021', evidenceLevel: 'B', evidenceCodes: ['E09', 'E10'], verifyNext: ['Probe calibration', 'Mixing time', 'EC and root-zone EC'], avoid: 'Do not correct aggressively until the probe and mixed solution are verified.' },
    high: { ruleId: 'S022', evidenceLevel: 'B', evidenceCodes: ['E09', 'E10'], verifyNext: ['Alkalinity', 'Probe calibration', 'Nutrient recipe'], avoid: 'Do not increase nutrient concentration to compensate for pH-driven availability problems.' }
  },
  soilEc: {
    low: { ruleId: 'S023', evidenceLevel: 'C', evidenceCodes: ['E09', 'E12'], verifyNext: ['Feed EC', 'Soil moisture', 'Drainage EC'], avoid: 'Do not increase fertilizer from one root-zone EC point.' },
    high: { ruleId: 'S024', evidenceLevel: 'B', evidenceCodes: ['E11', 'E12'], verifyNext: ['Soil moisture', 'Feed EC', 'Drainage fraction'], avoid: 'Do not flush before distinguishing salt input from dryback concentration.' }
  },
  waterTemp: {
    low: { ruleId: 'S025', evidenceLevel: 'B', evidenceCodes: ['E07', 'E08'], verifyNext: ['Root-zone temperature', 'Air temperature', 'Irrigation timing'], avoid: 'Do not warm the nutrient solution abruptly.' },
    high: { ruleId: 'S026', evidenceLevel: 'B', evidenceCodes: ['E08'], verifyNext: ['Dissolved oxygen', 'Root-zone temperature', 'Reservoir heat source'], avoid: 'Do not evaluate warm solution without checking oxygen availability.' }
  }
};


export const CAUSE_HINTS = {
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

export const UNIFORMITY_LIMITS = Object.freeze({
  airTemp: { warning: 2, critical: 3 },
  humidity: { warning: 8, critical: 12 },
  vpd: { warning: 0.4, critical: 0.6 },
  co2: { warning: 200, critical: 350 },
  lux: { warning: 5000, critical: 8000 },
  soilTemp: { warning: 2, critical: 3 },
  soilMoisture: { warning: 10, critical: 18 },
  ec: { warning: 0.5, critical: 1 },
  ph: { warning: 0.4, critical: 0.8 },
  soilEc: { warning: 0.5, critical: 1 },
  leafTemp: { warning: 2, critical: 3 },
  waterTemp: { warning: 2, critical: 3 }
});


export const SOURCES = {
    solution: { title: 'Oklahoma State Extension · Solution temperature and oxygen', url: 'https://extension.okstate.edu/fact-sheets/principles-of-small-scale-aquaponics' },
    heat: { title: 'MSU Extension · Temperature and crop development', url: 'https://www.canr.msu.edu/uploads/resources/pdfs/high-temperature.pdf' },
    roots: { title: 'UMass Extension · Root function and growing conditions', url: 'https://www.umass.edu/agriculture-food-environment/greenhouse-floriculture/fact-sheets/root-diseases-of-greenhouse-crops' },
    rootTemp: { title: 'UMass Extension · Air and substrate temperature', url: 'https://www.umass.edu/agriculture-food-environment/sites/ag.umass.edu/files/pdf-doc-ppt/handoutlight_temperature_relative_humidity_1_12_2016.pdf' },
    ec: { title: 'UMass Extension · Interpreting EC', url: 'https://www.umass.edu/agriculture-food-environment/greenhouse-floriculture/fact-sheets/soluble-salts-electrical-conductivity-ec-for-greenhouse-crops' },
    ph: { title: 'University of Georgia Extension · pH and plant nutrition', url: 'https://fieldreport.caes.uga.edu/publications/B1256/essential-ph-management-in-greenhouse-crops-ph-and-plant-nutrition/' },
    nutrition: { title: 'UNH Extension · Nutrient problem diagnosis', url: 'https://extension.unh.edu/resource/scouting-managing-greenhouse-nutrient-problems-fact-sheet' },
    co2: { title: 'Oklahoma State Extension · Light and CO₂', url: 'https://extension.okstate.edu/fact-sheets/greenhouse-carbon-dioxide-supplementation' },
    light: { title: 'MSU Extension · Light quantity and photoperiod', url: 'https://www.canr.msu.edu/uploads/resources/pdfs/lightquality.pdf' },
    water: { title: 'MSU Extension · VPD and water balance', url: 'https://www.canr.msu.edu/resources/vpd_vs_relative_humidity' },
};
const verifyClimate = ['Po korekcijos palyginkite nukrypimo trukmę panašiu paros metu, lapų būklę ir gretimų vietų rodmenis.', 'After adjustment compare excursion duration at similar hours, leaf condition and nearby readings.'];
const verifyRoot = ['Kontroliniu metodu pakartokite šaknų zonos matavimą toje pačioje vietoje. Vertinkite ir šaknų būklę, ne tik jutiklio rodmenį.', 'Repeat a reference root-zone measurement at the same location. Assess roots as well as the sensor reading.'];
const verifyNutrition = ['Pakartokite pH ir EC tyrimą tuo pačiu metodu; stebėkite naujo augimo būklę. Vien rodmens sugrįžimas į ribas neįrodo, kad augalas atsigavo.', 'Repeat pH and EC tests using the same method; monitor new growth. A reading returning to target alone does not establish recovery.'];
export const growthAdviceRules = {
    'heat-load': { title: ['Šilumos apkrova gali trikdyti augimą', 'Heat load may disrupt growth'], meaning: ['Temperatūra virš kultūros profilio ribos gali keisti vystymosi tempą ir didinti kvėpavimo sąnaudas. Žydėjimo ar derėjimo pažeidimo iš oro temperatūros vienos nustatyti negalima.', 'Temperature above the crop profile may alter development and increase respiratory demand. Air temperature alone does not establish damage to flowering or fruiting.'], action: ['Patikrinkite vėdinimo ir vėsinimo pajėgumą nukrypimo valandomis. Šešėliavimą didinkite tik įvertinę šviesos kiekį — sumažinus šilumą pernelyg stipriu šešėliu galima apriboti fotosintezę.', 'Check ventilation and cooling capacity during excursions. Assess available light before adding shade; excessive shading can restrict photosynthesis.'], verify: verifyClimate, source: 'heat', priority: 65 },
    'cold-growth': { title: ['Vėsa gali lėtinti vystymąsi ir keisti laistymo poreikį', 'Cool conditions may slow development and change irrigation needs'], meaning: ['Žemesnė nei profilyje numatyta temperatūra gali lėtinti augimą. Įprastas laistymo ir auginimo darbų grafikas tuomet gali nebeatitikti faktinio augalo tempo.', 'Below-profile temperature can slow growth. Existing irrigation and crop scheduling may no longer match actual development.'], action: ['Patikrinkite šildymo režimą ir temperatūrą augalų aukštyje. Prieš išlaikydami ankstesnį laistymo dažnį įvertinkite substrato džiūvimą; neskubinkite augimo vien papildomomis trąšomis.', 'Check heating and temperature at crop height. Assess substrate drying before retaining the previous irrigation frequency; extra fertilizer alone will not accelerate temperature-limited growth.'], verify: verifyClimate, source: 'heat', priority: 60 },
    'root-cold': { title: ['Šalta šaknų zona gali riboti įsisavinimą', 'Cold roots may restrict uptake'], meaning: ['Kai šaknų zona vėsesnė nei numatyta profilyje, vandens ir maisto medžiagų įsisavinimas gali sulėtėti. Tai gali atrodyti kaip tręšimo problema.', 'A root zone colder than the profile target can slow water and nutrient uptake and resemble a nutrition problem.'], action: ['Patikrinkite substrato temperatūrą kontroliniu zondu, suolių ar šaknų zonos šildymą. Tręšimo nedidinkite vien dėl lėto augimo — pirmiausia patikrinkite šaknų temperatūrą, pH ir EC.', 'Verify substrate temperature and bench or root-zone heating. Do not increase fertilizer solely for slow growth; check root temperature, pH and EC first.'], verify: verifyRoot, source: 'rootTemp', priority: 75 },
    'root-hot': { title: ['Per šilta šaknų zona gali bloginti šaknų veiklą', 'An overly warm root zone may impair root function'], meaning: ['Šaknų temperatūra virš profilio ribos keičia jų kvėpavimą ir gali didinti deguonies poreikį. Matavimas pats savaime neparodo deguonies trūkumo ar puvinio.', 'Root temperature above the profile changes respiration and may increase oxygen demand. Temperature alone does not establish oxygen shortage or rot.'], action: ['Patikrinkite karštus vamzdžius, tiesiogiai saulės kaitinamas talpas ir drenažą. Šaknų nevėsinkite nepatikrintu papildomu laistymu, jei substratas jau šlapias.', 'Inspect hot pipes, sun-heated containers and drainage. Do not use extra irrigation as cooling without checking whether the substrate is already wet.'], verify: verifyRoot, source: 'roots', priority: 70 },
    'water-cold': { title: ['Šaltas vanduo gali vėsinti šaknų zoną', 'Cold water may cool the root zone'], meaning: ['Vandens temperatūra žemiau profilio ribos gali vėsinti šaknis laistymo metu; poveikį lemia tiekimo vieta, tūris ir substrato temperatūra.', 'Below-profile water temperature may cool roots during irrigation; the effect depends on delivery, volume and substrate temperature.'], action: ['Pamatuokite temperatūrą ties augalu, ne tik rezervuare, ir palyginkite substratą prieš laistymą bei po jo. Koreguokite tiekimą tik patvirtinę šaknų atvėsimą.', 'Measure water at the plant, not only in the tank, and compare substrate temperature before and after irrigation. Adjust delivery if root cooling is confirmed.'], verify: verifyRoot, source: 'rootTemp', priority: 55 },
    'water-hot': { title: ['Šiltame tirpale verta tikrinti deguonies tiekimą', 'Warm solution warrants checking oxygen supply'], meaning: ['Šiltame vandenyje deguonies tirpumas mažesnis. Hidroponikoje tai svarbu šaknims, tačiau temperatūros jutiklis neišmatuoja ištirpusio deguonies.', 'Oxygen solubility falls as water warms. This matters to hydroponic roots, but a temperature probe does not measure dissolved oxygen.'], action: ['Jei matuojamas hidroponinis tirpalas, patikrinkite jo cirkuliaciją, aeraciją ir ištirpusį deguonį. Jei tai tik laistymo bakas, pirmiausia tikrinkite vandens temperatūrą ties augalais.', 'For hydroponic solution, check circulation, aeration and dissolved oxygen. For an irrigation tank, first check delivery temperature at the plants.'], verify: verifyRoot, source: 'solution', priority: 70 },
    'dry-root': { title: ['Šaknų zonos drėgmė gali riboti vandens tiekimą', 'Root-zone moisture may limit water supply'], meaning: ['Drėgmė žemiau substratui nustatytos ribos rodo galimą vandens tiekimo ribojimą. Vienas zondas neparodo visos sekcijos drėgmės.', 'Moisture below the substrate target suggests possible water-supply limitation. One probe does not represent the entire section.'], action: ['Patikrinkite lašintuvą ir drėgmę keliuose tos vietos gyliuose. Jei trūkumas patvirtinamas, koreguokite laistymo laiką ar dažnį ir patikrinkite paskirstymo vienodumą.', 'Check the emitter and moisture at several depths nearby. If a deficit is confirmed, adjust timing or frequency and verify distribution uniformity.'], verify: verifyRoot, source: 'water', priority: 75 },
    'wet-root': { title: ['Ilgai šlapias substratas gali riboti šaknų aeraciją', 'Persistently wet substrate may restrict root aeration'], meaning: ['Drėgmė virš profilio ribos gali reikšti per lėtą džiūvimą. Užmirkimas mažina oro porų dalį, bet vien drėgmės rodmuo nepatvirtina šaknų ligos.', 'Above-profile moisture may indicate slow drying. Waterlogging reduces air-filled pores, but moisture alone does not diagnose root disease.'], action: ['Prieš kitą laistymą patikrinkite drenažą, šaknų būklę ir kontrolinę substrato drėgmę. Vytimas šlapiame substrate nėra automatinė priežastis pilti daugiau vandens.', 'Before the next irrigation check drainage, roots and reference moisture. Wilting in wet substrate is not an automatic reason to add water.'], verify: verifyRoot, source: 'roots', priority: 80 },
    'substrate-salinity': { title: ['Druskų koncentracija gali apsunkinti vandens įsisavinimą', 'Salt concentration may hinder water uptake'], meaning: ['Aukštas substrato EC rodo didesnę ištirpusių druskų koncentraciją. Augalas gali sunkiau pasisavinti vandenį net tada, kai substratas drėgnas.', 'High substrate EC indicates more dissolved salts. Water uptake can become harder even in moist substrate.'], action: ['Patvirtinkite EC tinkamu substrato tyrimo metodu ir palyginkite su tiekiamo vandens bei tirpalo EC. Tikrinant drenažą nustatykite, ar reikia koreguoti koncentraciją, ar druskų kaupimąsi; nepradėkite nuo papildomų trąšų.', 'Confirm EC with an appropriate substrate test and compare input water and feed EC. Check drainage to distinguish concentrated feed from salt accumulation before changing fertilizer.'], verify: verifyNutrition, source: 'ec', priority: 80 },
    'substrate-low-ec': { title: ['Verta patikrinti maisto medžiagų pasiūlą šaknims', 'Check nutrient supply to the root zone'], meaning: ['Mažas substrato EC gali rodyti mažą druskų koncentraciją, bet neatskleidžia konkretaus elemento trūkumo. Rodmenį veikia drėgmė ir tyrimo metodas.', 'Low substrate EC can indicate dilute salts but does not identify a particular nutrient deficiency. Moisture and testing method affect interpretation.'], action: ['Patikrinkite pH, drėgmę ir trąšų tiekimą. Tręšimą didinkite tik patvirtinę trūkumą substrato ar augalų audinių tyrimu ir atsižvelgę į kultūros poreikį.', 'Check pH, moisture and feed delivery. Increase nutrition only after confirming insufficient supply with substrate or tissue testing against crop requirements.'], verify: verifyNutrition, source: 'nutrition', priority: 50 },
    'solution-high-ec': { title: ['Tiekiamas tirpalas gali būti per koncentruotas', 'Feed solution may be too concentrated'], meaning: ['Tirpalo EC virš profilio ribos gali reikšti per koncentruotą tiekimą. Tai dar neįrodo, kad druskos susikaupė substrate.', 'Solution EC above target may indicate concentrated feed; it does not establish salt accumulation in the substrate.'], action: ['Kontroliniu matuokliu patikrinkite tirpalą ir pradinį vandenį, dozatorių bei maišymo proporcijas. Atskirai pamatuokite substrato EC; nepainiokite skirtingų matavimo vietų ribų.', 'Verify solution and source-water EC, injector operation and mixing ratios. Measure substrate EC separately; targets from different sampling locations are not interchangeable.'], verify: verifyNutrition, source: 'ec', priority: 75 },
    'solution-low-ec': { title: ['Trąšų tiekimas gali neatitikti nustatytos koncentracijos', 'Feed delivery may be below the intended concentration'], meaning: ['Mažas tirpalo EC gali reikšti praskiedimą ar tiekimo neatitikimą. Konkretus maisto medžiagos trūkumas iš EC nenustatomas.', 'Low solution EC can reflect dilution or a feed-delivery mismatch. EC cannot identify a specific nutrient deficiency.'], action: ['Patikrinkite trąšų atsargas, dozatorių, pradinio vandens EC ir pH. Koncentraciją keiskite pagal kontrolinį matavimą ir kultūros profilį, ne vien pagal augalų spalvą.', 'Check fertilizer stock, injector, source-water EC and pH. Adjust concentration using a reference measurement and crop profile, not leaf colour alone.'], verify: verifyNutrition, source: 'nutrition', priority: 55 },
    'ph-high': { title: ['Maisto medžiagos gali būti sunkiau prieinamos, nors trąšų pakanka', 'Nutrients may be less available despite adequate fertilizer'], meaning: ['Per aukštas pH gali mažinti kai kurių mikroelementų, įskaitant geležį, prieinamumą. Didesnė trąšų dozė nepašalina pH sukeltos prieigos problemos.', 'Excessive pH can reduce availability of micronutrients including iron. More fertilizer does not remove a pH-driven availability problem.'], action: ['Patvirtinkite pH kalibruotu matuokliu, nustatykite, ar matuojamas tirpalas, ar substratas, ir patikrinkite vandens šarmingumą. Korekciją parinkite pagal kultūrą ir tyrimą, nespėdami rūgšties dozės.', 'Verify pH with a calibrated meter, identify solution versus substrate sampling and test water alkalinity. Choose a crop-specific correction from testing rather than guessing an acid dose.'], verify: verifyNutrition, source: 'ph', priority: 80 },
    'ph-low': { title: ['Per mažas pH gali išbalansuoti maisto medžiagų prieinamumą', 'Low pH may unbalance nutrient availability'], meaning: ['Per mažas pH gali padidinti kai kurių mikroelementų prieinamumą iki nepageidaujamo lygio. Jautrumas priklauso nuo kultūros ir auginimo terpės.', 'Low pH can make some micronutrients excessively available. Sensitivity depends on the crop and growing medium.'], action: ['Patikrinkite kalibravimą, mėginio vietą, vandens šarmingumą ir trąšų rūgštinantį poveikį. Pirmiausia nustatykite pH kritimo priežastį, o ne didinkite visų maisto medžiagų dozę.', 'Check calibration, sampling location, water alkalinity and fertilizer acidity. Establish why pH is falling before changing overall nutrient supply.'], verify: verifyNutrition, source: 'ph', priority: 80 },
    'co2-low-lit': { title: ['Šviesoje CO₂ gali riboti fotosintezę', 'CO₂ may limit photosynthesis during the light period'], meaning: ['CO₂ žemiau profilio ribos tuo metu, kai užfiksuota šviesa, gali reikšti nepakankamą pasiūlą lapams. Silpna šviesa ar vandens stresas taip pat gali riboti atsaką į papildomą CO₂.', 'Below-target CO₂ during measured light may indicate limited supply to leaves. Low light or water stress can also limit response to enrichment.'], action: ['Patikrinkite CO₂ matuoklį ir oro pasiskirstymą lajoje. Prieš didindami tiekimą įvertinkite šviesos kiekį, VPD ir vėdinimo būseną; papildymas atviromis angomis gali būti neefektyvus.', 'Check the CO₂ sensor and canopy air distribution. Assess light, VPD and ventilation before increasing supply; enrichment with open vents may be inefficient.'], verify: verifyClimate, source: 'co2', priority: 65 },
    'co2-high-lit': { title: ['CO₂ tiekimą verta suderinti su faktine šviesa', 'Match CO₂ supply to available light'], meaning: ['CO₂ virš profilio ribos nereiškia proporcingai didesnės fotosintezės. Naudą lemia šviesa ir kitos augimo sąlygos.', 'Above-profile CO₂ does not imply proportionally greater photosynthesis. Light and other growing conditions determine the response.'], action: ['Patikrinkite matuoklį, tiekimo valdymą ir faktinę šviesą. Jei papildymas vyksta, jo tikslą derinkite su kultūros režimu ir vėdinimu.', 'Check the sensor, supply controls and measured light. If enriching, align the target with the crop regime and ventilation.'], verify: verifyClimate, source: 'co2', priority: 45 },
    'co2-high-dark': { title: ['Tamsoje CO₂ papildymas gali neturėti fotosintetinės naudos', 'CO₂ enrichment in darkness may provide no photosynthetic benefit'], meaning: ['CO₂ virš profilio ribos sutapo su užfiksuota tamsa. Didesnę koncentraciją gali lemti ir augalų ar substrato kvėpavimas, todėl tiekimo gedimas neįrodytas.', 'Above-profile CO₂ coincided with measured darkness. Plant or substrate respiration may also raise CO₂, so a supply fault is not established.'], action: ['Patikrinkite, ar tuo metu iš tiesų veikė CO₂ tiekimas. Jei taip, peržiūrėkite jo susiejimą su apšvietimu ir vožtuvo sandarumą.', 'Check whether CO₂ supply actually operated then. If it did, review the lighting interlock and valve closure.'], verify: verifyClimate, source: 'co2', priority: 55 },
    'light-low': { title: ['Planuotu šviesos metu augalui gali trūkti energijos', 'Light may be insufficient during the planned light period'], meaning: ['Apšvietimas žemiau profilio ribos gali riboti augimui gaunamą energiją. Vien trąšų ar CO₂ didinimas šviesos trūkumo neišsprendžia.', 'Below-profile light can restrict energy available for growth. Extra fertilizer or CO₂ alone does not resolve insufficient light.'], action: ['Patikrinkite šviestuvus, užuolaidas, dangos švarą ir jutiklio padėtį lajos lygyje. Apšvietimo trukmę keiskite tik įvertinę kultūros fotoperiodą ir paros šviesos sumą.', 'Check lamps, screens, cover cleanliness and sensor position at canopy height. Change lighting duration only after checking crop photoperiod and daily light integral.'], verify: verifyClimate, source: 'light', priority: 65 },
    'light-high': { title: ['Didelę šviesos apkrovą reikia derinti su lapų vėsinimu', 'High light load needs adequate leaf cooling'], meaning: ['Šviesa virš profilio ribos gali didinti lapų energinę apkrovą. Tai nepatvirtina nudegimo; reikšmę turi lapų temperatūra, vandens tiekimas ir kultūra.', 'Above-profile light can increase leaf energy load. It does not establish scorch; leaf temperature, water supply and crop sensitivity matter.'], action: ['Prieš stipriau šešėliuodami pamatuokite lapų temperatūrą ir patikrinkite vandens tiekimą. Išsaugokite kultūrai reikalingą paros šviesos kiekį.', 'Check leaf temperature and water supply before adding substantial shade. Preserve the crop’s required daily light quantity.'], verify: verifyClimate, source: 'light', priority: 65 },
    'light-at-night': { title: ['Šviesa už numatyto grafiko gali keisti fotoperiodą', 'Light outside the schedule may alter photoperiod'], meaning: ['Išmatuota šviesa numatytu tamsos metu gali trumpinti nepertraukiamą naktį. Poveikis žydėjimui priklauso nuo kultūros; tyčinis nakties pertraukimas gali būti teisingas režimas.', 'Measured light during scheduled darkness can shorten the uninterrupted night. Flowering effects depend on crop; intentional night interruption may be valid.'], action: ['Patikrinkite laikmatį, grafiką ir šviesos nutekėjimą iš gretimų zonų. Suderinkite faktinį režimą su kultūros žydėjimo strategija.', 'Check timers, schedule and light spill from adjacent areas. Align the actual regime with the crop’s flowering strategy.'], verify: verifyClimate, source: 'light', priority: 60 },
    'dry-saline-root': { title: ['Sausas ir druskingas substratas kartu riboja vandens prieinamumą', 'Dry and saline substrate jointly restrict water availability'], meaning: ['Maža substrato drėgmė ir aukštas jo EC užfiksuoti vienu metu. Galimą vandens deficitą stiprina druskų sukeltas osmosinis poveikis.', 'Low substrate moisture and high substrate EC occurred together. Osmotic effects of salts can compound water deficit.'], action: ['Pirmiausia patikrinkite vandens paskirstymą, substrato EC kontroliniu metodu ir drenažą. Drėgmės atkūrimą bei koncentracijos korekciją planuokite kartu; papildomas koncentruotas tręšimas gali pabloginti padėtį.', 'Check water distribution, reference substrate EC and drainage first. Plan moisture restoration and concentration correction together; additional concentrated fertilizer may worsen conditions.'], verify: verifyNutrition, source: 'ec', priority: 100 },
    'wet-cold-root': { title: ['Šaltas, šlapias substratas gali būti įsisavinimo kliūtis', 'Cold, wet substrate may be an uptake bottleneck'], meaning: ['Per drėgnas pagal profilį substratas sutapo su per žema šaknų temperatūra. Lėtas džiūvimas ir vėsios šaknys gali riboti įsisavinimą.', 'Above-target substrate moisture coincided with below-target root temperature. Slow drying and cold roots can restrict uptake.'], action: ['Prieš papildomą laistymą ar tręšimą patikrinkite drenažą ir šaknų zonos šildymą. Kontroliniu matavimu patvirtinkite sąlygas prie šaknų.', 'Check drainage and root-zone heating before additional irrigation or fertilizer. Verify conditions near roots with a reference measurement.'], verify: verifyRoot, source: 'rootTemp', priority: 95 },
    'ph-ec-imbalance': { title: ['Mažą EC vertinkite kartu su netinkamu pH', 'Interpret low EC together with unsuitable pH'], meaning: ['Mažas tirpalo EC sutapo su pH už profilio ribų. Vien didesnė trąšų koncentracija negarantuoja tinkamo maisto medžiagų prieinamumo.', 'Low solution EC coincided with pH outside the profile. Increasing feed concentration alone does not guarantee nutrient availability.'], action: ['Patikrinkite abu matuoklius ir mėginio vietą. Pirmiausia nustatykite pH neatitikimo bei dozavimo priežastis, tada parinkite suderintą mitybos korekciją.', 'Verify both meters and sampling locations. Establish the pH and dosing causes before choosing a coordinated nutrition correction.'], verify: verifyNutrition, source: 'nutrition', priority: 95 },
    'heat-light-mismatch': { title: ['Šilumos ir šviesos režimai gali būti nesuderinti', 'Temperature and light may be mismatched'], meaning: ['Aukšta temperatūra ir per silpna pagal profilį šviesa sutapo planuotu šviesos metu. Šiluma skatina procesus, kuriems gali trūkti šviesos suteikiamos energijos.', 'Above-profile temperature and below-profile light coincided in the planned light period. Temperature-driven processes may outpace available light energy.'], action: ['Pirmiausia patikrinkite šešėliavimo ir apšvietimo būseną. Šildymo ar vėsinimo tikslą derinkite su faktine šviesa ir kultūros stadija; nesiūloma automatiškai pridėti trąšų.', 'Check shading and lighting first. Align heating or cooling targets with actual light and crop stage rather than automatically adding fertilizer.'], verify: verifyClimate, source: 'heat', priority: 90 },
    'co2-water-limitation': { title: ['Prieš CO₂ papildymą įvertinkite vandens stresą', 'Assess water stress before adding CO₂'], meaning: ['Šviesoje mažas CO₂ sutapo su VPD virš profilio ribos. Jei augalas dėl vandens balanso užveria žioteles, papildomo CO₂ nauda gali būti ribota.', 'Low CO₂ in measured light coincided with above-profile VPD. If water imbalance closes stomata, extra CO₂ may have limited benefit.'], action: ['Pirmiausia patikrinkite šaknų drėgmę ir augalų vandens būklę. Suderinkite vandens tiekimą bei mikroklimatą, tuomet vertinkite CO₂ tiekimo poreikį.', 'Check root moisture and plant water status first. Coordinate water supply and climate before assessing CO₂ enrichment needs.'], verify: verifyClimate, source: 'water', priority: 90 },
};

export const WATER_SOURCES = {
    water: { title: 'MSU Extension · VPD ir augalų vandens balansas', url: 'https://www.canr.msu.edu/resources/vpd_vs_relative_humidity' },
    uptake: { title: 'Wageningen University · VPD, žiotelės ir augalų kokybė', url: 'https://research.wur.nl/en/publications/greenhouse-vapour-pressure-deficit-and-lighting-conditions-during/' },
    dew: { title: 'UMass Extension · Drėgmės ir kondensato valdymas', url: 'https://www.umass.edu/agriculture-food-environment/greenhouse-floriculture/fact-sheets/reducing-humidity-in-greenhouse' },
};

export const GROWTH_RULES = [
 ['heat-load','airTemp',['airTemp'],c=>c.high('airTemp')],
 ['cold-growth','airTemp',['airTemp'],c=>c.low('airTemp')],
 ['root-cold','soilTemp',['soilTemp'],c=>c.low('soilTemp')],
 ['root-hot','soilTemp',['soilTemp'],c=>c.high('soilTemp')],
 ['water-cold','waterTemp',['waterTemp'],c=>c.low('waterTemp')],
 ['water-hot','waterTemp',['waterTemp'],c=>c.high('waterTemp')],
 ['dry-root','soilMoisture',['soilMoisture'],c=>c.low('soilMoisture')],
 ['wet-root','soilMoisture',['soilMoisture'],c=>c.high('soilMoisture')],
 ['substrate-salinity','soilEc',['soilEc'],c=>c.high('soilEc')],
 ['substrate-low-ec','soilEc',['soilEc'],c=>c.low('soilEc')],
 ['solution-high-ec','ec',['ec'],c=>c.high('ec')],
 ['solution-low-ec','ec',['ec'],c=>c.low('ec')],
 ['ph-high','ph',['ph'],c=>c.high('ph')],
 ['ph-low','ph',['ph'],c=>c.low('ph')],
 ['co2-low-lit','co2',['co2','$light'],c=>c.lit&&c.low('co2')],
 ['co2-high-lit','co2',['co2','$light'],c=>c.lit&&c.high('co2')],
 ['co2-high-dark','co2',['co2','$light'],c=>c.dark&&c.high('co2')],
 ['light-low','$light',['$light'],c=>c.day===true&&c.low(c.lightMetric)],
 ['light-high','$light',['$light'],c=>c.high(c.lightMetric)],
 ['light-at-night','$light',['$light'],c=>c.day===false&&c.lit],
 ['dry-saline-root','soilEc',['soilMoisture','soilEc'],c=>c.low('soilMoisture')&&c.high('soilEc')],
 ['wet-cold-root','soilMoisture',['soilMoisture','soilTemp'],c=>c.high('soilMoisture')&&c.low('soilTemp')],
 ['ph-ec-imbalance','ph',['ph','ec'],c=>(c.low('ph')||c.high('ph'))&&c.low('ec')],
 ['heat-light-mismatch','airTemp',['airTemp','$light'],c=>c.day===true&&c.high('airTemp')&&c.low(c.lightMetric)],
 ['co2-water-limitation','co2',['co2','vpd','$light'],c=>c.lit&&c.low('co2')&&c.high('vpd')],
];

export function waterInterpretation(r, lt) {
    const t = (a,b) => lt ? a : b;
        const high = r.kind === 'high-vpd', dew = r.kind === 'leaf-condensation', dry = r.rootDryMinutes >= 30;
        const title = dew ? t('Lapų paviršiuje galėjo susidaryti kondensatas', 'Leaf surfaces may have developed condensation') : high ? dry ? t('Didelė garinimo apkrova sutapo su sausa šaknų zona', 'High evaporative demand coincided with a dry root zone') : t('Galima vandens streso ir ribotos fotosintezės rizika', 'Possible water stress and restricted photosynthesis') : t('Silpnesnis garinimas gali mažinti vandens poreikį', 'Reduced evaporative demand may lower water requirements');
        const meaning = dew
            ? t('Lapo temperatūra pasiekė apskaičiuotą rasos tašką arba nukrito žemiau jo. Tokiomis sąlygomis lapas gali sušlapti, o ilgai drėgni lapai sudaro palankesnes sąlygas daliai grybininių ligų. Tai aplinkos rizika, ne nustatyta infekcija.', 'Measured leaf temperature reached or fell below the calculated dew point. Leaves may become wet, creating conditions favourable to some fungal diseases if wetness persists. This is an environmental risk, not a diagnosed infection.')
            : high ? t('Kai oro garų slėgio deficitas (VPD) didelis, aplinka stipriau skatina augalą netekti vandens. Jei šaknys nespėja jo tiekti, augalas gali užverti žioteles: tuomet ribojamas ir CO₂ patekimas fotosintezei. Vien CO₂ didinimas tokio ribojimo neišsprendžia.', 'High air vapour-pressure deficit (VPD) increases atmospheric demand for water. If roots cannot keep up, plants may close stomata, restricting CO₂ entry for photosynthesis. Adding CO₂ alone does not resolve that limitation.')
                : t('Mažas oro garų slėgio deficitas (VPD) silpnina garinimo varomąją jėgą. Ankstesniam, sausesniam orui pritaikytas laistymo grafikas gali tiekti daugiau vandens, nei augalas tuo metu sunaudoja. Ilgalaikis režimas svarbus augalo prisitaikymui; vienas toks laikotarpis žalos neįrodo.', 'Low air vapour-pressure deficit (VPD) reduces the driving force for water loss. Irrigation scheduled for drier conditions may supply more water than the plant currently uses. Sustained conditions affect plant acclimation; one period does not establish damage.');
        const action = dew ? t('Pirmiausia apžiūrėkite lapus nurodytoje vietoje. Jei jie drėgni, šalinkite užsistovėjusią drėgmę lajoje: patikrinkite oro judėjimą ir derinkite sausinimą ar vėdinimą su šildymu, neperžengdami kultūros temperatūros ribų. Lapus šlapinantį laistymą planuokite taip, kad jie spėtų nudžiūti prieš naktį.', 'First inspect leaves at this location. If wet, address trapped canopy moisture: check air movement and coordinate dehumidification or ventilation with heating within crop temperature limits. Schedule irrigation that wets foliage so leaves can dry before night.')
            : high ? dry ? t('Pirmas prioritetas — vandens tiekimas šaknims šioje vietoje: patikrinkite lašintuvų veikimą ir kontroliniu matavimu patvirtinkite substrato drėgmę. Tik patvirtinus trūkumą koreguokite laistymo laiką ar dažnį. Kartu įvertinkite vėsinimą; vien didesnė vandens dozė oro sąlygų nepakeis.', 'First check water delivery to roots here: inspect emitters and confirm substrate moisture with a reference measurement. Adjust irrigation timing or frequency only if the deficit is confirmed. Also assess cooling; a larger water dose alone will not change air conditions.')
                : t('Prieš didindami laistymą patikrinkite substrato drėgmę ir vandens tiekimą. Jei šaknų zona pakankamai drėgna, pirmiau įvertinkite vėsinimą ar kontroliuojamą oro drėkinimą pagal kultūros ribas. Jei sausa — koreguokite vandens tiekimą. Šių dviejų atvejų sprendimai skiriasi.', 'Check substrate moisture and water delivery before increasing irrigation. If the root zone is adequately moist, first assess cooling or controlled humidification within crop limits. If dry, correct water delivery. These situations require different responses.')
                : t('Laistymo poreikį patvirtinkite pagal substrato drėgmę ir jo džiūvimą, o ne vien laikmatį. Jei substratas išlieka šlapias, peržiūrėkite kitą laistymo ciklą. Jei profilis numato didesnį VPD, patikrinkite drėgmės šalinimą ir oro judėjimą lajoje; vien daugiau šilumos neišneša vandens iš šiltnamio.', 'Confirm irrigation need from substrate moisture and drying, rather than the timer alone. If the substrate remains wet, review the next irrigation cycle. If the profile calls for higher VPD, check moisture removal and canopy airflow; heating alone does not remove water from the greenhouse.');
        const verify = dew ? t('Po korekcijos patikrinkite, ar lapai sausi ir jų temperatūra išlieka aukščiau rasos taško. Mažesnė kambario drėgmė pati savaime nepatvirtina, kad laja išdžiūvo.', 'After adjustment, check that leaves are dry and remain above dew point. Lower room humidity alone does not establish that the canopy is dry.')
            : high ? t('Palyginkite kitą panašų laikotarpį: VPD nukrypimo trukmę, substrato drėgmę ir augalų vytimo požymius. Pagerėjimą turi patvirtinti ir vandens būklė, ne tik mažesnis VPD.', 'Compare the next similar period: duration of high VPD, substrate moisture and signs of wilting. Improvement should include water status, not just a lower VPD.')
                : t('Patikrinkite, ar substratas tarp laistymų džiūsta pagal pasirinktą auginimo strategiją ir ar korekcija nesukėlė per didelio VPD.', 'Check that the substrate dries between irrigations as intended by the growing strategy and that the adjustment has not produced excessive VPD.');

    return {title,meaning,action,verify,priority:dew?100:dry?95:high?80:65,source:dew?WATER_SOURCES.dew:high?WATER_SOURCES.water:WATER_SOURCES.uptake};
}

export const WATER_RULES = Object.freeze({
 'high-vpd': {requiredMetrics:['airTemp','humidity','vpd'],match:c=>c.representative && c.target && c.vpd>c.target[1]},
 'low-vpd': {requiredMetrics:['airTemp','humidity','vpd'],match:c=>c.representative && c.target && c.vpd<c.target[0]},
 'leaf-condensation': {requiredMetrics:['airTemp','humidity','leafTemp'],match:c=>c.leafEnabled && c.dewPoint!==null && c.leaf!==null && c.leaf<=c.dewPoint}
});
export const HISTORICAL_RULES = Object.freeze(GROWTH_RULES.map(([id,primaryMetric,requiredMetrics,match])=>Object.freeze({id,primaryMetric,requiredMetrics:Object.freeze(requiredMetrics),match,interpretation:growthAdviceRules[id]})));
if(HISTORICAL_RULES.some(r=>!r.interpretation))throw new Error('Historical agronomy rule is missing its interpretation');

function freezeKnowledge(value) {
  if (!value || typeof value !== 'object') return;
  for (const child of Object.values(value)) freezeKnowledge(child);
  Object.freeze(value);
}
// Runtime evaluations cannot silently change the knowledge behind a version.
for (const definition of [METRIC_GROUPS,ACTION_TEMPLATES,EFFECTS,DIAGNOSTIC_CONTEXT,SINGLE_DIAGNOSIS_TITLES,SINGLE_DIAGNOSIS_IMPACTS,CATALOG_RULES,CAUSE_HINTS,UNIFORMITY_LIMITS,SOURCES,WATER_SOURCES,GROWTH_RULES,growthAdviceRules,WATER_RULES]) freezeKnowledge(definition);
