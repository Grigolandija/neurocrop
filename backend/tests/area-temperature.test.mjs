import assert from 'node:assert/strict';
import test from 'node:test';
import { AREA_TEMPERATURE_SCENARIO, buildAreaTemperatureActions, evaluateAreaTemperatureOutcome, temperatureSeriesEvidence, mergeAreaTemperatureWorkflow } from '../area-temperature.js';
import { evaluateActionOutcome } from '../today-actions.js';
import { METRIC_SENSOR_KEYS } from '../metrics.js';

const now = Date.parse('2026-10-27T12:00:00Z');
const at = offset => new Date(now + offset * 60_000).toISOString();
const reading = (id, value, offset, state) => ({ dev_eui: id, temperature: value, time: at(offset), raw_object: state ? { sensors: { [METRIC_SENSOR_KEYS.airTemp]: state } } : {} });
function snapshot() {
  return {
    section: { id: 's1', area_id: 'a1', area_name: 'Propagation', name: 'Propagation', crop_profile: 'crop' },
    profileMetrics: { airTemp: { optimal: [18, 24] } },
    nodes: [{ dev_eui: 'n1', name: 'North' }, { dev_eui: 'n2', name: 'South' }],
    nodeStatuses: ['live', 'live'],
    measurements: [reading('n1', 31, 0), reading('n2', 28, 0)],
    recentMeasurements: [-20, -10, 0].flatMap(offset => [reading('n1', 31, offset), reading('n2', 28, offset)]),
  };
}
const action = () => buildAreaTemperatureActions([snapshot()], now)[0];
const feedback = { status: 'completed', createdAt: at(0) };
const evidence = (values, times = [10, 15, 20]) => temperatureSeriesEvidence(times.flatMap((offset, index) => [reading('n1', values[index], offset), reading('n2', 22, offset)]), action(), now + 60 * 60_000);

test('persistent heat produces an Area warning with the worst temperature, real target and frozen sensor cohort', () => {
  const result = action();
  assert.equal(result.scenario, AREA_TEMPERATURE_SCENARIO);
  assert.equal(result.areaId, 'a1');
  assert.equal(result.value, 31);
  assert.equal(result.durationMinutes, 20);
  assert.equal(result.affectedNodes, 2);
  assert.deepEqual(result.verificationNodeIds, ['n1', 'n2']);
  assert.deepEqual(result.target, [18, 24]);
});

test('a spike, repeated packets in one interval, recovery, absent profile and cached or future telemetry cannot confirm heat', () => {
  for (const mutate of [
    s => { s.recentMeasurements = s.recentMeasurements.filter(m => m.time === at(0)); },
    s => { s.recentMeasurements = Array.from({ length: 10 }, (_, i) => reading('n1', 31, -i / 100)); },
    s => { s.recentMeasurements = s.recentMeasurements.map(m => m.time === at(-10) ? { ...m, temperature: 22 } : m); },
    s => { s.section.crop_profile = null; },
    s => { s.profileMetrics.airTemp.optimal = null; },
    s => { s.profileMetrics.airTemp.growth = false; },
    s => { s.measurements = s.measurements.map(m => ({ ...m, raw_object: { sensors: { [METRIC_SENSOR_KEYS.airTemp]: { fresh: false } } } })); },
    s => { s.measurements = s.measurements.map(m => ({ ...m, time: at(1) })); },
    s => { s.nodeStatuses = ['offline', 'delayed']; },
  ]) {
    const source = snapshot(); mutate(source);
    assert.deepEqual(buildAreaTemperatureActions([source], now), []);
  }
});

test('a gap resets the persistence run and a non-hot current reading never produces a warning', () => {
  const source = snapshot();
  source.recentMeasurements = [-20, -5, 0].flatMap(offset => [reading('n1', 31, offset), reading('n2', 28, offset)]);
  assert.deepEqual(buildAreaTemperatureActions([source], now), []);
  source.measurements = source.measurements.map(m => ({ ...m, temperature: 22 }));
  assert.deepEqual(buildAreaTemperatureActions([source], now), []);
});

test('completion does not equal recovery, including before the ten minute settling period', () => {
  const result = evaluateAreaTemperatureOutcome(action(), feedback, evidence([24, 23, 22]), now + 9 * 60_000);
  assert.equal(result.state, 'awaiting_data');
  assert.equal(result.currentValue, null);
});

test('three complete original-sensor intervals confirm target recovery and share the existing history evaluator', () => {
  const result = evaluateAreaTemperatureOutcome(action(), feedback, evidence([24, 23, 22]), now + 21 * 60_000);
  assert.equal(result.state, 'target_reached');
  assert.equal(result.sampleCount, 3);
  assert.equal(result.currentValue, 22);
  assert.equal(result.baselineValue, 31);
  assert.equal(evaluateActionOutcome(action(), feedback, evidence([24, 23, 22]), now + 21 * 60_000).state, 'target_reached');
});

test('reheating invalidates a previously good window; first good readings cannot freeze a successful outcome', () => {
  const values = evidence([24, 23, 22]).samples;
  values.push({ value: 32, minimum: 22, observedAt: at(25) });
  const result = evaluateAreaTemperatureOutcome(action(), feedback, { samples: values }, now + 26 * 60_000);
  assert.notEqual(result.state, 'target_reached');
  assert.equal(result.currentValue, 32);
});

test('loss of an original sensor, cached values and another sensor cannot manufacture a result', () => {
  const samples = [10, 15, 20].flatMap(offset => [reading('n1', 22, offset), reading('new-node', 22, offset), reading('n2', 22, offset, { state: 'cached_not_due' })]);
  const result = evaluateAreaTemperatureOutcome(action(), feedback, temperatureSeriesEvidence(samples, action(), now + 61 * 60_000), now + 61 * 60_000);
  assert.equal(result.state, 'insufficient_data');
  assert.equal(result.sampleCount, 0);
});

test('all three intervals must be within both boundaries; partial cooling, no change and warming remain distinct', () => {
  for (const [values, state] of [
    [[28, 27, 26], 'improving'], [[31, 31, 31], 'unchanged'], [[33, 34, 35], 'worsened'], [[17, 17, 17], 'worsened'], [[22, 25, 22], 'improving'],
  ]) assert.equal(evaluateAreaTemperatureOutcome(action(), feedback, evidence(values), now + 21 * 60_000).state, state);
});

test('old readings, future readings and wide gaps cannot close the verification window as successful', () => {
  assert.equal(evaluateAreaTemperatureOutcome(action(), feedback, evidence([22, 22, 22]), now + 61 * 60_000).state, 'insufficient_data');
  const future = evidence([22, 22, 22], [50, 55, 60]);
  assert.equal(evaluateAreaTemperatureOutcome(action(), feedback, future, now + 21 * 60_000).state, 'awaiting_data');
  assert.equal(evaluateAreaTemperatureOutcome(action(), feedback, evidence([22, 22, 22], [10, 20, 50]), now + 51 * 60_000).state, 'awaiting_data');
});

test('work and results persist when the current warning disappears; confirmed recurrence creates a new open case', () => {
  const record = { id: 'saved', action: action(), status: 'completed', outcome: { state: 'target_reached', observedAt: at(20), windowEndsAt: at(60) } };
  assert.equal(mergeAreaTemperatureWorkflow([], [record], now + 25 * 60_000)[0].id, 'saved');
  const recurrence = { ...action(), observedAt: at(40), firstDetectedAt: at(25) };
  assert.equal(mergeAreaTemperatureWorkflow([recurrence], [record], now + 40 * 60_000).length, 2);
  assert.equal(mergeAreaTemperatureWorkflow([action()], [{ ...record, status: 'in_progress' }], now + 40 * 60_000).length, 1);
});

test('asynchronous ten-minute sensor uplinks form complete intervals without wall-clock bucket alignment', () => {
  const readings = [10, 20, 30].flatMap(offset => [reading('n1', 23, offset), reading('n2', 22, offset + 3)]);
  const result = evaluateAreaTemperatureOutcome(action(), feedback, temperatureSeriesEvidence(readings, action(), now + 34 * 60_000), now + 34 * 60_000);
  assert.equal(result.state, 'target_reached');
  assert.equal(result.sampleCount, 3);
});

test('duplicate packets and a fast sensor cannot compensate for one missing original sensor observation', () => {
  const readings = Array.from({ length: 20 }, (_, index) => reading('n1', 22, index + 10));
  readings.push(...Array.from({ length: 20 }, () => reading('n2', 22, 10)));
  assert.equal(temperatureSeriesEvidence(readings, action(), now + 35 * 60_000).samples.length, 1);
});

test('all cohort readings, not just the last arrival, must follow the settling period', () => {
  const readings = [9, 14, 19].flatMap(offset => [reading('n1', 22, offset), reading('n2', 22, offset + 2)]);
  const result = evaluateAreaTemperatureOutcome(action(), feedback, temperatureSeriesEvidence(readings, action(), now + 22 * 60_000), now + 22 * 60_000);
  assert.equal(result.state, 'awaiting_data');
  assert.equal(result.sampleCount, 2);
});
