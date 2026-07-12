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
