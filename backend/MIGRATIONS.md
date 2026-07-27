# Database migrations

The API applies pending migrations before opening its HTTP port. If a migration fails, startup stops and the transaction is rolled back.

## Rules

1. Never execute `schema.sql` manually. It is retained only as the frozen pre-migration schema snapshot.
2. Never edit an applied migration. Its SHA-256 checksum is stored in `schema_migrations` and startup will reject changed history.
3. Add every schema change as the next numbered file in `migrations/`, for example `0002_add_audit_log.sql`.
4. Write migrations so they can run inside a PostgreSQL transaction.
5. Back up production before applying a migration that changes or deletes existing data.

## Commands

Apply pending migrations without starting the API:

```sh
npm run migrate
```

Inspect production migration history:

```sql
SELECT version, name, checksum, applied_at
FROM schema_migrations
ORDER BY version;
```

The first deployment to an existing NeuroCrop database safely runs the idempotent `0001_baseline.sql` and records it. New databases are created by the same migration.

## Deployment order

1. Create and verify a database backup.
2. Build the new immutable backend image containing the migration files.
3. Run `npm run migrate` as a one-off deployment step.
4. Start or roll the API containers; they verify migration history again before listening.
5. Run health and critical-flow smoke tests.

The advisory lock in `migrate.js` serializes migration execution when multiple API containers start together.

## Data integrity migration

`0010_data_integrity.sql` repairs legacy cross-organization assignments before
adding tenant-scoped foreign keys. It also keeps only the most recently received
row when exact `(dev_eui, time)` measurement duplicates exist, then creates the
database uniqueness constraint used by ingestion.

Apply this migration to staging first and compare Area, Section, Node and
measurement counts with a pre-migration backup before promoting it to production.

## Unsupported demo pressure cleanup

`0011_remove_unsupported_air_pressure.sql` clears only synthetic pressure readings
tagged with `demo: true`, removes the stale demo sensor-presence flag, and removes
`airPressure` from stored crop-profile metrics. The nullable measurement column is
retained for backwards compatibility with historical external integrations.

## Measurement storage policy

`0012_measurement_storage.sql` removes two indexes duplicated by the canonical
`(dev_eui, time)` uniqueness constraint, limits synthetic demo history to seven
days, and compacts its repeated JSON metadata.

The API retention worker keeps 35 days of raw measurements by default, slightly
more than the product's 31-day history and CSV window. Cleanup runs every six
hours in bounded batches and uses a PostgreSQL advisory lock, so only one API
replica performs it. Override the policy with `MEASUREMENT_RETENTION_DAYS` using
an integer from 31 to 365.

After deploying the first cleanup, regular `VACUUM` makes deleted pages reusable.
To return already allocated space to the operating system immediately, schedule
a maintenance window and run:

```sql
VACUUM (FULL, ANALYZE) measurements;
```

`VACUUM FULL` takes an exclusive table lock, so it must not be run during active
ingestion.

## Measurement rollups

`0021_measurement_rollups.sql` backfills per-Node 10-minute and hourly summaries
from retained raw measurements. An `AFTER INSERT` trigger updates both
resolutions in the same transaction as every accepted uplink, so Trends and the
historical climate map never wait for a separate aggregation job.

The 10-minute summaries are retained for 93 days by default and hourly summaries
for 1095 days. The same bounded retention worker removes expired summaries.
Override these windows with `MEASUREMENT_ROLLUP_10M_RETENTION_DAYS` (31–3650)
and `MEASUREMENT_ROLLUP_60M_RETENTION_DAYS` (365–3650).

The product currently exposes at most 31 days in Trends and 24 hours in the
historical climate map. Longer aggregate retention is intentional: it permits
future seasonal views without retaining every raw uplink.
