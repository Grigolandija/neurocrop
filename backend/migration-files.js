import { createHash } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const MIGRATION_FILE = /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/;
const DEFAULT_DIRECTORY = fileURLToPath(new URL('./migrations/', import.meta.url));

function checksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

export async function loadMigrations(directory = DEFAULT_DIRECTORY) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const migrations = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const match = MIGRATION_FILE.exec(entry.name);
    if (!match) continue;
    const sql = await fs.readFile(path.join(directory, entry.name), 'utf8');
    if (!sql.trim()) throw new Error(`Migration ${entry.name} is empty`);
    migrations.push({
      version: match[1],
      name: match[2],
      fileName: entry.name,
      sql,
      checksum: checksum(sql)
    });
  }

  migrations.sort((a, b) => a.version.localeCompare(b.version));
  const versions = new Set();
  for (const migration of migrations) {
    if (versions.has(migration.version)) throw new Error(`Duplicate migration version ${migration.version}`);
    versions.add(migration.version);
  }
  return migrations;
}

export function verifyAppliedMigration(migration, applied) {
  if (!applied) return;
  if (applied.checksum !== migration.checksum) {
    throw new Error(
      `Migration ${migration.fileName} was modified after it was applied; create a new migration instead`
    );
  }
}
