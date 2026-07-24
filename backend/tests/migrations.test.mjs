import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadMigrations, verifyAppliedMigration } from '../migration-files.js';

async function temporaryMigrations(files) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'neurocrop-migrations-'));
  await Promise.all(Object.entries(files).map(([name, sql]) => fs.writeFile(path.join(directory, name), sql)));
  return directory;
}

test('migration files are loaded in version order and unrelated files are ignored', async (context) => {
  const directory = await temporaryMigrations({
    '0002_second.sql': 'SELECT 2;',
    'README.md': 'not a migration',
    '0001_first.sql': 'SELECT 1;'
  });
  context.after(() => fs.rm(directory, { recursive: true, force: true }));

  const migrations = await loadMigrations(directory);
  assert.deepEqual(migrations.map((item) => item.version), ['0001', '0002']);
  assert.equal(migrations.every((item) => /^[a-f0-9]{64}$/.test(item.checksum)), true);
});

test('duplicate migration versions are rejected', async (context) => {
  const directory = await temporaryMigrations({
    '0001_first.sql': 'SELECT 1;',
    '0001_duplicate.sql': 'SELECT 2;'
  });
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  await assert.rejects(loadMigrations(directory), /Duplicate migration version 0001/);
});

test('an applied migration cannot be edited in place', async (context) => {
  const directory = await temporaryMigrations({ '0001_first.sql': 'SELECT 1;' });
  context.after(() => fs.rm(directory, { recursive: true, force: true }));
  const [migration] = await loadMigrations(directory);

  assert.doesNotThrow(() => verifyAppliedMigration(migration, { checksum: migration.checksum }));
  assert.throws(
    () => verifyAppliedMigration(migration, { checksum: 'different' }),
    /was modified after it was applied/
  );
});

test('DevEUI changes cascade to node history and sensor configuration', async () => {
  const sql = await fs.readFile(new URL('../migrations/0003_node_deveui_update.sql', import.meta.url), 'utf8');
  assert.match(sql, /FOREIGN KEY \(dev_eui\) REFERENCES nodes\(dev_eui\) ON UPDATE CASCADE/);
  assert.match(sql, /FOREIGN KEY \(node_dev_eui\) REFERENCES nodes\(dev_eui\) ON UPDATE CASCADE ON DELETE CASCADE/);
});

test('completed actions can persist structured execution details', async () => {
  const sql = await fs.readFile(new URL('../migrations/0005_action_execution_details.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS execution_details JSONB/);
  assert.match(sql, /jsonb_typeof\(execution_details\) = 'object'/);
});

test('data integrity migration enforces tenant scope and atomic measurement deduplication', async () => {
  const sql = await fs.readFile(new URL('../migrations/0010_data_integrity.sql', import.meta.url), 'utf8');
  assert.match(sql, /sections_area_tenant_fkey/);
  assert.match(sql, /sections_crop_profile_tenant_fkey/);
  assert.match(sql, /nodes_section_area_tenant_fkey/);
  assert.match(sql, /node_sensor_configs_node_tenant_fkey/);
  assert.match(sql, /action_feedback_section_tenant_fkey/);
  assert.match(sql, /GENERATED ALWAYS AS IDENTITY/);
  assert.match(sql, /UNIQUE \(dev_eui, time\)/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION set_row_updated_at/);
});

test('unsupported air pressure cleanup removes only synthetic readings and profile metadata', async () => {
  const sql = await fs.readFile(new URL('../migrations/0011_remove_unsupported_air_pressure.sql', import.meta.url), 'utf8');
  assert.match(sql, /raw_object->>'demo' = 'true'/);
  assert.match(sql, /air_pressure = NULL/);
  assert.match(sql, /last_sensor_presence - 'pressure_sensor'/);
  assert.match(sql, /metrics - 'airPressure'/);
});

test('measurement storage migration prunes demo history and duplicate indexes', async () => {
  const sql = await fs.readFile(new URL('../migrations/0012_measurement_storage.sql', import.meta.url), 'utf8');
  assert.match(sql, /DROP INDEX IF EXISTS idx_measurements_deveui_time/);
  assert.match(sql, /DROP INDEX IF EXISTS idx_measurements_deveui_received_at/);
  assert.match(sql, /raw_object->>'demo' = 'true'/);
  assert.match(sql, /INTERVAL '7 days'/);
  assert.match(sql, /jsonb_strip_nulls\(jsonb_build_object/);
});

test('area metadata migration preserves existing rows with usable defaults', async () => {
  const sql = await fs.readFile(new URL('../migrations/0013_area_metadata.sql', import.meta.url), 'utf8');
  assert.match(sql, /ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'Growing area'/);
  assert.match(sql, /ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT ''/);
});
