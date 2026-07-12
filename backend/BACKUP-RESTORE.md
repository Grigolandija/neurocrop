# Backup and restore

NeuroCrop creates PostgreSQL custom-format backups of both the `neurocrop` application database and the `chirpstack` LoRaWAN database every day. Every week, both newest R2 copies are downloaded and restored into temporary databases. A backup set is considered valid only after checksum verification and successful restore tests for both databases.

## Recovery targets

- RPO: up to 24 hours with the default daily schedule.
- Restore verification: weekly.
- Local retention: 30 days by default.
- Production requires a copy outside the VPS by setting `REQUIRE_OFFSITE_COPY=true`.

With `RCLONE_REMOTE=neurocrop-r2-crypt:`, the daily job verifies an encrypted R2 upload and the weekly restore test downloads its input from R2 rather than trusting the local disk.

## Install on the VPS

```sh
install -d -m 700 /var/backups/neurocrop
install -m 600 /opt/neurocrop-backend/ops/neurocrop-backup.env.example /etc/neurocrop-backup.env
install -m 644 /opt/neurocrop-backend/ops/systemd/neurocrop-backup.service /etc/systemd/system/
install -m 644 /opt/neurocrop-backend/ops/systemd/neurocrop-backup.timer /etc/systemd/system/
install -m 644 /opt/neurocrop-backend/ops/systemd/neurocrop-restore-test.service /etc/systemd/system/
install -m 644 /opt/neurocrop-backend/ops/systemd/neurocrop-restore-test.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now neurocrop-backup.timer neurocrop-restore-test.timer
```

Before enabling `REQUIRE_OFFSITE_COPY=true`, mount storage that is physically outside the VPS at the configured `BACKUP_MIRROR_DIR`. A second directory on the same VPS is not an offsite backup.

## First verification

Run both jobs manually before relying on the timers:

```sh
systemctl start neurocrop-backup.service
systemctl status neurocrop-backup.service --no-pager
systemctl start neurocrop-restore-test.service
systemctl status neurocrop-restore-test.service --no-pager
```

Inspect schedules and logs:

```sh
systemctl list-timers 'neurocrop-*'
journalctl -u neurocrop-backup.service -u neurocrop-restore-test.service --since today
cat /var/backups/neurocrop/last-successful-backup
cat /var/backups/neurocrop/last-successful-restore-test
```

## Manual restore test

The verification script creates an isolated temporary database, restores the dump, checks required tables and basic queries, and always drops the temporary database:

```sh
/opt/neurocrop-backend/scripts/verify-database-restore.sh /var/backups/neurocrop/neurocrop-YYYYMMDDTHHMMSSZ.dump
```

## Disaster recovery

Do not restore over the production database without first stopping API and ingest containers and preserving the damaged database. The controlled production restore procedure is:

1. Stop API and ingest writes.
2. Verify the selected dump checksum.
3. Restore into a new database name.
4. Run migrations and smoke tests against the new database.
5. Switch the application to the restored database.
6. Preserve the old database until the incident is closed.

This avoids destroying the only remaining copy during an emergency.
