import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { generateSimulatedMeasurement } from '../simulated-nodes.js';

const migrationUrl = new URL('../migrations/0023_simulated_nodes.sql', import.meta.url);
const migration = fs.readFileSync(migrationUrl, 'utf8');

const fullProfile = {
  temperature: 24,
  humidity: 50,
  co2: 950,
  lux: 32000,
  soil_temperature: 21.5,
  soil_moisture: 55,
  ec: 1.8,
  ph: 6.2,
  soil_ec: 1.5,
  leaf_temperature: 23.1,
  water_temperature: 20,
  battery_percent: 92
};

test('simulation migration creates ten free inventory nodes', () => {
  const serials = migration.match(/SIM-\d{6}/g) || [];
  const devEuis = migration.match(/f1[0-9a-f]{14}/g) || [];

  assert.deepEqual([...new Set(serials)], [
    'SIM-000001', 'SIM-000002', 'SIM-000003', 'SIM-000004', 'SIM-000005',
    'SIM-000006', 'SIM-000007', 'SIM-000008', 'SIM-000009', 'SIM-000010'
  ]);
  assert.equal(new Set(devEuis).size, 10);
  assert.match(migration, /source TEXT NOT NULL DEFAULT 'physical'/);
  assert.match(migration, /'unassigned'.*'simulated'/s);
  assert.doesNotMatch(migration, /INSERT INTO nodes \([^)]*organization_id/is);
  assert.doesNotMatch(migration, /INSERT INTO nodes \([^)]*area_id/is);
  assert.doesNotMatch(migration, /INSERT INTO nodes \([^)]*section_id/is);
});

test('every simulated inventory profile contains every supported fake metric', () => {
  const profiles = [...migration.matchAll(/'(\{"temperature".*?\})'::jsonb/g)].map((match) => JSON.parse(match[1]));
  assert.equal(profiles.length, 10);

  for (const profile of profiles) {
    assert.deepEqual(Object.keys(profile).sort(), Object.keys(fullProfile).sort());
    for (const value of Object.values(profile)) assert.equal(Number.isFinite(value), true);
  }
  assert.equal(profiles[0].temperature, 24);
  assert.equal(profiles[0].humidity, 50);
  assert.equal(profiles[1].temperature, 19);
  assert.equal(profiles[1].humidity, 70);
  assert.equal(new Set(profiles.map((profile) => JSON.stringify(profile))).size, 10);
});

test('simulated measurements stay close to their configured baseline', () => {
  const measurement = generateSimulatedMeasurement(
    fullProfile,
    'f100000000000001',
    new Date('2026-07-28T12:34:00.000Z')
  );

  assert.ok(Math.abs(measurement.temperature - 24) <= 0.6);
  assert.ok(Math.abs(measurement.humidity - 50) <= 2);
  assert.ok(Math.abs(measurement.co2 - 950) <= 35);
  assert.ok(Math.abs(measurement.lux - 32000) <= 32000 * 0.08);
  assert.ok(Math.abs(measurement.ph - 6.2) <= 0.03);
  assert.equal(measurement.battery_percent, 92);
  assert.ok(measurement.battery_mv > 3000);
});

test('generator only selects assigned simulated nodes with a complete location', () => {
  const source = fs.readFileSync(new URL('../simulated-nodes.js', import.meta.url), 'utf8');
  assert.match(source, /source='simulated'/);
  assert.match(source, /factory_status='assigned'/);
  assert.match(source, /organization_id IS NOT NULL/);
  assert.match(source, /area_id IS NOT NULL/);
  assert.match(source, /section_id IS NOT NULL/);
  assert.match(source, /ON CONFLICT \(dev_eui, time\) DO NOTHING/);
});

test('ingest worker starts and stops the simulated generator', () => {
  const source = fs.readFileSync(new URL('../ingest.js', import.meta.url), 'utf8');
  assert.match(source, /startSimulatedNodeGenerator\(pool\)/);
  assert.match(source, /stopSimulatedNodeGenerator\(\)/);
});
