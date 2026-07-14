#!/usr/bin/env bash
set -Eeuo pipefail

PG_CONTAINER="${PG_CONTAINER:-postgresql}"
PGUSER="${PGUSER:-chirpstack}"
BACKUP_DATABASES="${BACKUP_DATABASES:-neurocrop chirpstack}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/neurocrop}"
BACKUP_MIRROR_DIR="${BACKUP_MIRROR_DIR:-}"
RCLONE_REMOTE="${RCLONE_REMOTE:-}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
REQUIRE_OFFSITE_COPY="${REQUIRE_OFFSITE_COPY:-false}"
LOCK_FILE="${BACKUP_LOCK_FILE:-/var/lock/neurocrop-backup.lock}"

validate_backup_directory() {
  local directory="$1"
  local label="$2"
  if [[ "$directory" != /* || "$directory" == "/" ]]; then
    echo "[backup] ${label} must be an absolute, non-root directory" >&2
    exit 1
  fi
}

validate_backup_directory "$BACKUP_DIR" BACKUP_DIR
if [[ -n "$BACKUP_MIRROR_DIR" ]]; then validate_backup_directory "$BACKUP_MIRROR_DIR" BACKUP_MIRROR_DIR; fi

read -r -a databases <<<"$BACKUP_DATABASES"
if [[ "${#databases[@]}" -eq 0 ]]; then
  echo "[backup] BACKUP_DATABASES is empty" >&2
  exit 1
fi
for database in "${databases[@]}"; do
  if [[ ! "$database" =~ ^[a-zA-Z0-9_]+$ ]]; then
    echo "[backup] invalid database name: ${database}" >&2
    exit 1
  fi
done

umask 077
mkdir -p "$BACKUP_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[backup] another backup is already running" >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
partial_paths=()
backup_paths=()
cleanup() {
  for partial_path in "${partial_paths[@]:-}"; do rm -f "$partial_path"; done
}
trap cleanup EXIT

docker inspect "$PG_CONTAINER" >/dev/null 2>&1
if [[ -n "$RCLONE_REMOTE" ]]; then command -v rclone >/dev/null; fi
if [[ -n "$BACKUP_MIRROR_DIR" ]]; then mkdir -p "$BACKUP_MIRROR_DIR"; fi

for database in "${databases[@]}"; do
  docker exec "$PG_CONTAINER" pg_isready -U "$PGUSER" -d "$database" >/dev/null
  base_name="${database}-${timestamp}.dump"
  partial_path="${BACKUP_DIR}/.${base_name}.partial"
  backup_path="${BACKUP_DIR}/${base_name}"
  checksum_path="${backup_path}.sha256"
  partial_paths+=("$partial_path")

  echo "[backup] creating ${backup_path}"
  docker exec "$PG_CONTAINER" pg_dump \
    -U "$PGUSER" -d "$database" \
    --format=custom --compress=9 --no-owner --no-acl >"$partial_path"
  test -s "$partial_path"
  docker exec -i "$PG_CONTAINER" pg_restore --list <"$partial_path" >/dev/null
  mv "$partial_path" "$backup_path"
  chmod 600 "$backup_path"
  (
    cd "$BACKUP_DIR"
    sha256sum "$base_name" >"${base_name}.sha256"
  )
  chmod 600 "$checksum_path"
  backup_paths+=("$backup_path")

  if [[ -n "$BACKUP_MIRROR_DIR" ]]; then
    mirror_partial="${BACKUP_MIRROR_DIR}/.${base_name}.partial"
    install -m 600 "$backup_path" "$mirror_partial"
    mv "$mirror_partial" "${BACKUP_MIRROR_DIR}/${base_name}"
    install -m 600 "$checksum_path" "${BACKUP_MIRROR_DIR}/${base_name}.sha256"
  fi

  if [[ -n "$RCLONE_REMOTE" ]]; then
    rclone copyto --immutable "$backup_path" "${RCLONE_REMOTE%/}/${base_name}"
    rclone copyto --immutable "$checksum_path" "${RCLONE_REMOTE%/}/${base_name}.sha256"
    remote_listing="$(rclone lsf "${RCLONE_REMOTE%/}" --files-only --include "$base_name")"
    [[ "$remote_listing" == "$base_name" ]]
    echo "[backup] encrypted R2 copy verified for ${database}"
  fi
done

offsite_copied=false
if [[ -n "$RCLONE_REMOTE" || -n "$BACKUP_MIRROR_DIR" ]]; then offsite_copied=true; fi
if [[ "$offsite_copied" != "true" && "$REQUIRE_OFFSITE_COPY" == "true" ]]; then
  echo "[backup] local dumps created, but required offsite storage is not configured" >&2
  exit 1
elif [[ "$offsite_copied" != "true" ]]; then
  echo "[backup] warning: offsite storage is not configured" >&2
fi

find "$BACKUP_DIR" -type f \
  \( -name 'neurocrop-*.dump' -o -name 'neurocrop-*.dump.sha256' -o -name 'chirpstack-*.dump' -o -name 'chirpstack-*.dump.sha256' \) \
  -mtime "+${BACKUP_RETENTION_DAYS}" -delete
if [[ -n "$BACKUP_MIRROR_DIR" ]]; then
  find "$BACKUP_MIRROR_DIR" -type f \
    \( -name 'neurocrop-*.dump' -o -name 'neurocrop-*.dump.sha256' -o -name 'chirpstack-*.dump' -o -name 'chirpstack-*.dump.sha256' \) \
    -mtime "+${BACKUP_RETENTION_DAYS}" -delete
fi

printf '%s\n' "${backup_paths[@]}" >"${BACKUP_DIR}/last-successful-backup"
echo "[backup] completed ${#backup_paths[@]} databases at ${timestamp}"
