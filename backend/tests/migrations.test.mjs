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
