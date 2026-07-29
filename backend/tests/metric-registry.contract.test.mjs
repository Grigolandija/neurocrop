import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import {
  DEFAULT_CROP_PROFILE_METRICS,
  DEFAULT_SCORE_RULES,
  METRIC_DEFINITIONS,
  METRIC_MAP,
  METRIC_TO_COLUMN,
  REGISTERED_TELEMETRY_DEFINITIONS
} from '../metric-registry.js';
import { publicHeatmapMeasurements } from '../greenhouse-map-routes.js';
import { ROLLUP_METRICS } from '../measurement-rollups.js';
import { normalizeRegisteredTelemetry, normalizeSoilEcDepths } from '../telemetry-values.js';
import { validateCropProfileMetrics } from '../validation.js';

const entries = Object.entries(METRIC_DEFINITIONS);

test('canonical metric registry has unique transport, storage and heatmap contracts', () => {
  const unique = (values, name) => {
    assert.equal(new Set(values).size, values.length, `${name} values must be unique`);
  };
  unique(entries.map(([, metric]) => metric.telemetryKey).filter(Boolean), 'telemetryKey');
  unique(entries.map(([, metric]) => metric.column).filter(Boolean), 'column');
  unique(entries.map(([, metric]) => metric.heatmap?.key).filter(Boolean), 'heatmap key');
  unique(entries.map(([, metric]) => metric.heatmap?.field).filter(Boolean), 'heatmap field');

  for (const [metricId, metric] of entries) {
    assert.ok(metric.label && metric.labelLt && metric.unit !== undefined, `${metricId} metadata is incomplete`);
    assert.equal(metric.physicalRange.length, 2, `${metricId} physical range is invalid`);
    assert.ok(metric.physicalRange[0] < metric.physicalRange[1], `${metricId} physical range must increase`);
    if (metric.telemetryKey) {
      assert.equal(METRIC_MAP[metric.telemetryKey], metricId);
      assert.equal(METRIC_TO_COLUMN[metricId], metric.column);
    }
    if (metric.heatmap) {
      assert.ok(ROLLUP_METRICS[metricId], `${metricId} has no history rollup mapping`);
    }
  }
});

test('every registered storage and history column exists in database migrations', async () => {
  const measurementSchema = [
    await fs.readFile(new URL('../migrations/0001_baseline.sql', import.meta.url), 'utf8'),
    await fs.readFile(new URL('../migrations/0002_extended_growth_metrics.sql', import.meta.url), 'utf8')
  ].join('\n');
  const rollupSchema = await fs.readFile(new URL('../migrations/0021_measurement_rollups.sql', import.meta.url), 'utf8');
  for (const { metricId, column } of REGISTERED_TELEMETRY_DEFINITIONS) {
    assert.match(measurementSchema, new RegExp(`\\b${column}\\b`), `${metricId} DB column is missing`);
    const [sum, count] = ROLLUP_METRICS[metricId];
    assert.match(rollupSchema, new RegExp(`\\b${sum}\\b`), `${metricId} rollup sum is missing`);
    assert.match(rollupSchema, new RegExp(`\\b${count}\\b`), `${metricId} rollup count is missing`);
  }
  assert.match(rollupSchema, /\bvpd_sum\b/);
  assert.match(rollupSchema, /\bvpd_count\b/);
});

test('profile defaults, scoring rules and migration all match the registry', async () => {
  assert.equal(validateCropProfileMetrics(DEFAULT_CROP_PROFILE_METRICS, { allowEmpty: false }), null);
  for (const [metricId, metric] of entries.filter(([, definition]) => definition.profile.enabled)) {
    assert.deepEqual(DEFAULT_CROP_PROFILE_METRICS[metricId].optimal, metric.profile.optimal);
    assert.deepEqual(DEFAULT_SCORE_RULES[metricId].optimal, metric.profile.optimal);
    assert.equal(DEFAULT_CROP_PROFILE_METRICS[metricId].label, metric.label);
    assert.equal(DEFAULT_CROP_PROFILE_METRICS[metricId].unit, metric.unit);
  }

  const sql = await fs.readFile(new URL('../migrations/0028_crop_profile_starter_metrics.sql', import.meta.url), 'utf8');
  const embedded = sql.match(/SELECT\s+'(\{[\s\S]*?\})'::jsonb;/)?.[1];
  assert.ok(embedded, 'starter metric JSON is missing from migration');
  assert.deepEqual(JSON.parse(embedded), DEFAULT_CROP_PROFILE_METRICS);
});

test('registered payload values round-trip from telemetry to DB and map fields', () => {
  const payload = Object.fromEntries(REGISTERED_TELEMETRY_DEFINITIONS.map(({ telemetryKey, metricId }) => {
    const [minimum, maximum] = METRIC_DEFINITIONS[metricId].physicalRange;
    return [telemetryKey, (minimum + maximum) / 2];
  }));
  payload.temperature = 24;
  payload.humidity = 65;
  payload.soil_ec_depths = [
    { depth_cm: 10, value: 1.4 },
    { depth_cm: 20, value: 1.8 },
    { depth_cm: 30, value: 2.2 }
  ];

  const normalized = normalizeRegisteredTelemetry(payload);
  for (const { telemetryKey } of REGISTERED_TELEMETRY_DEFINITIONS) {
    assert.equal(normalized[telemetryKey], payload[telemetryKey], `${telemetryKey} did not normalize`);
  }
  const mapValues = publicHeatmapMeasurements({ ...normalized, raw_object: payload, time: '2026-07-29T10:00:00.000Z' });
  for (const [metricId, metric] of entries.filter(([, definition]) => definition.heatmap)) {
    assert.notEqual(mapValues[metric.heatmap.field], undefined, `${metricId} is missing from map payload`);
  }
  assert.deepEqual(mapValues.soilEcByDepth, normalizeSoilEcDepths(payload));
  assert.equal(mapValues.measuredAt, '2026-07-29T10:00:00.000Z');
});

test('registered payload rejects impossible values without losing valid siblings', () => {
  const normalized = normalizeRegisteredTelemetry({ temperature: 20, humidity: 101, co2: '900' });
  assert.equal(normalized.temperature, 20);
  assert.equal(normalized.humidity, null);
  assert.equal(normalized.co2, 900);
});

test('ingest INSERT columns are generated from the canonical registry', async () => {
  const source = await fs.readFile(new URL('../ingest.js', import.meta.url), 'utf8');
  assert.match(source, /REGISTERED_TELEMETRY_DEFINITIONS/);
  assert.match(source, /registeredColumns\.join/);
  assert.doesNotMatch(source, /time,dev_eui,temperature,humidity,co2,lux/);
});
