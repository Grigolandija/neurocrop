import path from 'path';
import { pathToFileURL } from 'url';
import { closePool, pool } from './db.js';
import { loadMigrations, verifyAppliedMigration } from './migration-files.js';

const MIGRATION_LOCK_ID = 1647213901;
export async function runMigrations({ directory, databasePool = pool } = {}) {
  const migrations = await loadMigrations(directory);
  const client = await databasePool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        checksum   TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const { rows } = await client.query(
      'SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version ASC'
    );
    const appliedByVersion = new Map(rows.map((row) => [row.version, row]));
    let newlyApplied = 0;

    for (const migration of migrations) {
      const applied = appliedByVersion.get(migration.version);
      verifyAppliedMigration(migration, applied);
      if (applied) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await client.query(
          `INSERT INTO schema_migrations (version, name, checksum)
           VALUES ($1, $2, $3)`,
          [migration.version, migration.name, migration.checksum]
        );
        await client.query('COMMIT');
        newlyApplied += 1;
        console.log(`[db] migration ${migration.fileName} applied`);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    return { applied: newlyApplied, currentVersion: migrations.at(-1)?.version || null };
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]).catch(() => {});
    client.release();
  }
}

const isCommand = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isCommand) {
  runMigrations()
    .then((result) => console.log(`[db] migrations ready at ${result.currentVersion || 'none'}`))
    .catch((error) => {
      console.error('[db] migration failed:', error.message);
      process.exitCode = 1;
    })
    .finally(() => closePool());
}
