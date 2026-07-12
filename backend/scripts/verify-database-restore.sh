#!/usr/bin/env bash
set -Eeuo pipefail

PG_CONTAINER="${PG_CONTAINER:-postgresql}"
PGUSER="${PGUSER:-chirpstack}"
BACKUP_DATABASES="${BACKUP_DATABASES:-neurocrop chirpstack}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/neurocrop}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
LOCK_FILE="${RESTORE_TEST_LOCK_FILE:-/var/lock/neurocrop-restore-test.lock}"

if [[ "$BACKUP_DIR" != /* || "$BACKUP_DIR" == "/" ]]; then
  echo "[restore-test] BACKUP_DIR must be an absolute, non-root directory" >&2
  exit 1
fi
read -r -a databases <<<"$BACKUP_DATABASES"
for database in "${databases[@]}"; do
  if [[ ! "$database" =~ ^[a-zA-Z0-9_]+$ ]]; then
    echo "[restore-test] invalid database name: ${database}" >&2
    exit 1
  fi
done

umask 077
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[restore-test] another restore test is already running" >&2
  exit 1
fi

download_directory=""
restore_databases=()
cleanup() {
  for restore_db in "${restore_databases[@]:-}"; do
    docker exec "$PG_CONTAINER" dropdb -U "$PGUSER" --if-exists "$restore_db" >/dev/null 2>&1 || true
  done
  if [[ -n "$download_directory" ]]; then rm -rf "$download_directory"; fi
}
trap cleanup EXIT

if [[ -n "$RCLONE_REMOTE" ]]; then
  command -v rclone >/dev/null
  download_directory="$(mktemp -d "${BACKUP_DIR}/.restore-download.XXXXXX")"
fi

verified=()
for database in "${databases[@]}"; do
  if [[ -n "$RCLONE_REMOTE" ]]; then
    backup_name="$(rclone lsf "${RCLONE_REMOTE%/}" --files-only --include "${database}-*.dump" | sort | tail -n 1)"
    if [[ -z "$backup_name" ]]; then
      echo "[restore-test] no R2 backup found for ${database}" >&2
      exit 1
    fi
    backup_path="${download_directory}/${backup_name}"
    rclone copyto "${RCLONE_REMOTE%/}/${backup_name}" "$backup_path"
    rclone copyto "${RCLONE_REMOTE%/}/${backup_name}.sha256" "${backup_path}.sha256"
    echo "[restore-test] downloaded ${database} backup from R2"
  else
    backup_path="$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "${database}-*.dump" -print | sort | tail -n 1)"
  fi

  if [[ -z "$backup_path" || ! -f "$backup_path" || ! -f "${backup_path}.sha256" ]]; then
    echo "[restore-test] complete backup pair is missing for ${database}" >&2
    exit 1
  fi
  (
    cd "$(dirname "$backup_path")"
    sha256sum --check "$(basename "${backup_path}.sha256")"
  )

  restore_db="${database}_restore_test_$(date -u +%Y%m%d%H%M%S)_$$"
  restore_databases+=("$restore_db")
  docker exec "$PG_CONTAINER" createdb -U "$PGUSER" -T template0 "$restore_db"
  docker exec -i "$PG_CONTAINER" pg_restore \
    -U "$PGUSER" -d "$restore_db" --exit-on-error --no-owner --no-acl <"$backup_path"

  table_count="$(docker exec "$PG_CONTAINER" psql -U "$PGUSER" -d "$restore_db" -Atqc \
    "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
  if [[ "$database" == "neurocrop" ]]; then
    required_tables=(organizations users areas sections nodes measurements crop_profiles)
  elif [[ "$database" == "chirpstack" ]]; then
    required_tables=(tenant application device_profile device device_keys gateway)
  else
    required_tables=()
  fi
  for required_table in "${required_tables[@]}"; do
    exists="$(docker exec "$PG_CONTAINER" psql -U "$PGUSER" -d "$restore_db" -Atqc \
      "SELECT to_regclass('public.${required_table}') IS NOT NULL;")"
    if [[ "$exists" != "t" ]]; then
      echo "[restore-test] ${database} table ${required_table} is missing" >&2
      exit 1
    fi
  done
  verified+=("${database}:${table_count}")
done

printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "${verified[*]}" >"${BACKUP_DIR}/last-successful-restore-test"
echo "[restore-test] completed: ${verified[*]}"
