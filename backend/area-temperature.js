import { normalizeTelemetryNumber, sensorHasNewMeasurement } from './telemetry-values.js';
import { METRIC_SENSOR_KEYS } from './metrics.js';

export const AREA_TEMPERATURE_SCENARIO = 'area-temperature-v1';
export const TEMPERATURE_POLICY = Object.freeze({ persistenceMinutes: 10, delayMinutes: 10, windowMinutes: 60, minSamples: 3, bucketMinutes: 5 });
const minute = 60_000;
const number = normalizeTelemetryNumber;

function temperature(measurement) {
  if (!sensorHasNewMeasurement(measurement?.raw_object?.sensors?.[METRIC_SENSOR_KEYS.airTemp])) return null;
  return number(measurement?.temperature);
}

// Each complete interval requires a NEW valid reading from every original
// sensor. Match asynchronous uplinks, instead of requiring every sensor to
// transmit in the same wall-clock bucket. Faster sensors cannot vote twice.
export function temperatureSeriesEvidence(measurements = [], action, now = Date.now()) {
  const cohort = new Set(action.verificationNodeIds || []);
  const readings = measurements.flatMap(measurement => {
    const id = String(measurement.dev_eui || '').toLowerCase();
    const value = temperature(measurement), time = new Date(measurement.time).getTime();
    return cohort.has(id) && value !== null && Number.isFinite(time) && time <= Number(now) ? [{ id, value, time }] : [];
  }).sort((a, b) => a.time - b.time);
  const nodes = new Map(), updated = new Set(), samples = [];
  let lastEmitted = -Infinity;
  for (const reading of readings) {
    // Replayed rows at the same timestamp are not additional measurements.
    if (nodes.has(reading.id) && nodes.get(reading.id).time >= reading.time) continue;
    nodes.set(reading.id, reading); updated.add(reading.id);
    if (!cohort.size || updated.size !== cohort.size) continue;
    const values = [...nodes.values()];
    const latest = Math.max(...values.map(item => item.time)), earliest = Math.min(...values.map(item => item.time));
    if (latest - earliest > 10 * minute || latest - lastEmitted < TEMPERATURE_POLICY.bucketMinutes * minute) continue;
    samples.push({ value: Math.max(...values.map(item => item.value)), minimum: Math.min(...values.map(item => item.value)), observedAt: new Date(latest).toISOString(), firstObservedAt: new Date(earliest).toISOString() });
    lastEmitted = latest; updated.clear();
  }
  return { samples };
}

export function buildAreaTemperatureActions(snapshots = [], now = Date.now()) {
  return snapshots.flatMap(snapshot => {
    const target = snapshot.profileMetrics?.airTemp?.optimal;
    if (!snapshot.section.crop_profile || snapshot.profileMetrics?.airTemp?.growth === false || !Array.isArray(target) || target.length !== 2 || target.some(value => number(value) === null) || Number(target[0]) >= Number(target[1])) return [];
    const nodes = (snapshot.nodes || []).flatMap((node, index) => {
      const measurement = snapshot.measurements?.[index];
      const value = temperature(measurement), time = new Date(measurement?.time).getTime();
      return snapshot.nodeStatuses?.[index] === 'live' && value !== null && time <= Number(now)
        ? [{ id: String(node.dev_eui).toLowerCase(), name: node.name || node.dev_eui, value, time }] : [];
    });
    const hot = nodes.filter(node => node.value > Number(target[1]));
    if (!hot.length) return [];
    const cohort = nodes.map(node => node.id);
    const series = temperatureSeriesEvidence(snapshot.recentMeasurements, { verificationNodeIds: cohort }, now).samples;
    // Require three separate time buckets spanning at least ten minutes. A
    // normal observation or a gap starts a new confirmed run.
    let run = [];
    for (const sample of series) {
      const previous = run.at(-1);
      if (sample.value <= Number(target[1]) || (previous && new Date(sample.observedAt) - new Date(previous.observedAt) > 10 * minute)) run = [];
      if (sample.value > Number(target[1])) run.push(sample);
    }
    const last = run.at(-1);
    if (run.length < 3 || new Date(last.observedAt) - new Date(run[0].observedAt) < TEMPERATURE_POLICY.persistenceMinutes * minute || Number(now) - new Date(last.observedAt).getTime() > 10 * minute) return [];
    const maximum = Math.max(...hot.map(node => node.value));
    return [{
      id: `${snapshot.section.id}:airTemp:high`, scenario: AREA_TEMPERATURE_SCENARIO,
      verificationMode: 'area-temperature', verificationNodeIds: cohort,
      areaId: snapshot.section.area_id, areaName: snapshot.section.area_name || snapshot.section.name,
      sectionId: snapshot.section.id, sectionName: snapshot.section.name,
      metricId: 'airTemp', metricLabel: 'Air temperature', direction: 'high', unit: '°C',
      value: maximum, target: target.map(Number), observedAt: new Date(Math.max(...nodes.map(node => node.time))).toISOString(),
      firstDetectedAt: run[0].observedAt,
      durationMinutes: Math.floor((new Date(last.observedAt) - new Date(run[0].observedAt)) / minute),
      reportingNodes: nodes.length, registeredNodes: snapshot.nodes.length,
      affectedNodes: hot.length, affectedNodeNames: hot.map(node => node.name),
      title: 'Area temperature above target',
      recommendedAction: 'Check ventilation, cooling, shading and unwanted heating. Record the actual change or finding.',
      state: 'warning',
    }];
  });
}

export function evaluateAreaTemperatureOutcome(action, feedback, evidence = {}, now = Date.now()) {
  const completedAt = new Date(feedback.createdAt || feedback.created_at).getTime();
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(completedAt) || !Number.isFinite(nowMs)) return { state: 'insufficient_data', label: 'Verification time is unavailable' };
  const eligibleAt = completedAt + TEMPERATURE_POLICY.delayMinutes * minute;
  const windowEndsAt = completedAt + TEMPERATURE_POLICY.windowMinutes * minute;
  const samples = (evidence.samples || []).filter(sample => {
    const time = new Date(sample.observedAt).getTime();
    return number(sample.value) !== null && number(sample.minimum) !== null && time >= eligibleAt
      && new Date(sample.firstObservedAt || sample.observedAt).getTime() >= eligibleAt
      && time <= Math.min(nowMs, windowEndsAt);
  }).sort((a, b) => new Date(a.observedAt) - new Date(b.observedAt));
  const recent = samples.slice(-TEMPERATURE_POLICY.minSamples);
  const current = recent.at(-1);
  const target = action.target;
  const common = {
    baselineValue: number(action.value), baselineObservedAt: action.observedAt,
    currentValue: current?.value ?? null, observedAt: current?.observedAt || null,
    sampleCount: recent.length, requiredSampleCount: TEMPERATURE_POLICY.minSamples,
    eligibleAt: new Date(eligibleAt).toISOString(), windowEndsAt: new Date(windowEndsAt).toISOString(),
    samples: samples.map(sample => ({ ...sample })),
    method: 'latest-three-complete-cohort-buckets', modelVersion: 'area-temperature-1',
  };
  const incomplete = recent.length < TEMPERATURE_POLICY.minSamples
    || new Date(current?.observedAt || 0).getTime() < Math.min(nowMs, windowEndsAt) - 10 * minute
    || (recent.length > 1 && new Date(current.observedAt) - new Date(recent[0].observedAt) > 20 * minute);
  if (incomplete || !Array.isArray(target) || common.baselineValue === null) return {
    ...common, state: nowMs > windowEndsAt ? 'insufficient_data' : 'awaiting_data',
    label: nowMs > windowEndsAt ? 'Not enough recent readings from the original sensors' : 'Collecting new readings from the original sensors',
  };
  const reached = recent.every(sample => sample.minimum >= target[0] && sample.value <= target[1]);
  const change = current.value - common.baselineValue;
  if (reached) return { ...common, state: 'target_reached', label: 'Temperature returned to target', change };
  // Cooling below the lower limit is not a successful temperature correction.
  if (recent.some(sample => sample.minimum < target[0])) return { ...common, state: 'worsened', label: 'Temperature fell below target', change };
  const improved = recent.every(sample => sample.value < common.baselineValue - 0.2);
  const worsened = recent.every(sample => sample.value > common.baselineValue + 0.2);
  return { ...common, state: improved ? 'improving' : worsened ? 'worsened' : 'unchanged', label: improved ? 'Temperature is falling but remains above target' : worsened ? 'Temperature increased' : 'No consistent temperature improvement', change };
}

export function mergeAreaTemperatureWorkflow(actions, records, now = Date.now()) {
  const current = new Map(actions.map(action => [action.id, action]));
  const items = records.map(record => ({ ...record, current: current.get(record.action.id) || null }));
  for (const action of actions) {
    const record = records.find(item => item.action.id === action.id);
    const windowEnd = new Date(record?.outcome?.windowEndsAt || 0).getTime();
    const recurrence = record?.outcome?.state === 'target_reached'
      && new Date(action.firstDetectedAt) > new Date(record.outcome.observedAt);
    if (!record || (record.status === 'completed' && (Number(now) > windowEnd || recurrence))) {
      items.unshift({ id: `open:${action.id}`, status: 'open', action, current: action, outcome: null });
    }
  }
  return items;
}
