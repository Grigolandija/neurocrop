#!/usr/bin/env bash
set -Eeuo pipefail

PG_CONTAINER="${PG_CONTAINER:-postgresql}"
PGUSER="${PGUSER:-chirpstack}"
API_HEALTH_URL="${API_HEALTH_URL:-https://api.neurocrop.lt/health}"
MONITOR_EMAIL_TO="${MONITOR_EMAIL_TO:-agrigas1@gmail.com}"
MONITOR_EMAIL_FROM="${MONITOR_EMAIL_FROM:-NeuroCrop Monitoring <noreply@neurocrop.lt>}"
RESEND_API_KEY_FILE="${RESEND_API_KEY_FILE:-/opt/neurocrop-backend/.resend_api_key}"
MONITOR_STATE_DIR="${MONITOR_STATE_DIR:-/var/lib/neurocrop-monitor}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/neurocrop}"
DISK_WARNING_PERCENT="${DISK_WARNING_PERCENT:-85}"
MEASUREMENT_STALE_MINUTES="${MEASUREMENT_STALE_MINUTES:-20}"
NODE_STALE_MINUTES="${NODE_STALE_MINUTES:-30}"
BACKUP_STALE_HOURS="${BACKUP_STALE_HOURS:-30}"
RESTORE_TEST_STALE_HOURS="${RESTORE_TEST_STALE_HOURS:-192}"
HEARTBEAT_URL="${HEARTBEAT_URL:-}"
EXPECTED_CONTAINERS="${EXPECTED_CONTAINERS:-neurocrop-api neurocrop-ingest neurocrop-caddy postgresql mosquitto chirpstack chirpstack-rest-api redis}"

umask 077
mkdir -p "$MONITOR_STATE_DIR"
issues_file="$(mktemp "${MONITOR_STATE_DIR}/issues.XXXXXX")"
trap 'rm -f "$issues_file"' EXIT

add_issue() {
  printf '%s | %s\n' "$1" "$2" >>"$issues_file"
}

for container in $EXPECTED_CONTAINERS; do
  if ! docker inspect "$container" >/dev/null 2>&1; then
    add_issue "Docker" "Container ${container} is missing"
    continue
  fi
  running="$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || printf false)"
  if [[ "$running" != "true" ]]; then
    add_issue "Docker" "Container ${container} is not running"
    continue
  fi
  health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || printf unknown)"
  if [[ "$health" == "unhealthy" ]]; then add_issue "Docker" "Container ${container} is unhealthy"; fi
done

api_body="$(curl --silent --show-error --fail --max-time 10 "$API_HEALTH_URL" 2>/dev/null || true)"
if [[ "$api_body" != *'"status":"ok"'* ]]; then add_issue "API" "Health endpoint failed: ${API_HEALTH_URL}"; fi

if ! docker exec "$PG_CONTAINER" pg_isready -U "$PGUSER" -d neurocrop >/dev/null 2>&1; then
  add_issue "PostgreSQL" "neurocrop database is not ready"
else
  if ! docker exec "$PG_CONTAINER" psql -U "$PGUSER" -d neurocrop -v ON_ERROR_STOP=1 -Atqc 'SELECT 1' >/dev/null 2>&1; then
    add_issue "PostgreSQL" "neurocrop test query failed"
  fi
fi
if ! docker exec "$PG_CONTAINER" pg_isready -U "$PGUSER" -d chirpstack >/dev/null 2>&1; then
  add_issue "PostgreSQL" "chirpstack database is not ready"
fi

mqtt_topic="neurocrop/monitor/$(date +%s)-$$"
if ! docker exec mosquitto sh -c "mosquitto_sub -h 127.0.0.1 -t '$mqtt_topic' -C 1 -W 5 >/dev/null & subscriber=\$!; sleep 1; mosquitto_pub -h 127.0.0.1 -t '$mqtt_topic' -m ok; wait \$subscriber" >/dev/null 2>&1; then
  add_issue "MQTT" "Broker publish/subscribe loop failed"
fi

disk_used="$(df -P / | awk 'NR==2 {gsub(/%/, "", $5); print $5}')"
if [[ "$disk_used" =~ ^[0-9]+$ ]] && (( disk_used >= DISK_WARNING_PERCENT )); then
  add_issue "Disk" "Root filesystem usage is ${disk_used}%"
fi

measurement_age="$(docker exec "$PG_CONTAINER" psql -U "$PGUSER" -d neurocrop -Atqc \
  "SELECT COALESCE(EXTRACT(EPOCH FROM (now()-max(received_at)))::bigint, -1) FROM measurements;" 2>/dev/null || printf -- -1)"
if [[ "$measurement_age" =~ ^[0-9]+$ ]] && (( measurement_age > MEASUREMENT_STALE_MINUTES * 60 )); then
  add_issue "Ingest" "No new measurement for $((measurement_age / 60)) minutes"
elif [[ "$measurement_age" == "-1" ]]; then
  add_issue "Ingest" "Measurement freshness query failed or no measurements exist"
fi

stale_nodes="$(docker exec "$PG_CONTAINER" psql -U "$PGUSER" -d neurocrop -Atqc \
  "SELECT count(*) FROM nodes WHERE organization_id <> 'org-neurocrop-demo' AND archived_at IS NULL AND section_id IS NOT NULL AND last_received_at IS NOT NULL AND last_received_at < now() - interval '${NODE_STALE_MINUTES} minutes';" 2>/dev/null || printf -- -1)"
if [[ "$stale_nodes" =~ ^[0-9]+$ ]] && (( stale_nodes > 0 )); then
  add_issue "Nodes" "${stale_nodes} assigned node(s) have not reported for ${NODE_STALE_MINUTES}+ minutes"
fi

check_marker_age() {
  local path="$1"
  local max_hours="$2"
  local component="$3"
  if [[ ! -s "$path" ]]; then
    add_issue "$component" "Success marker is missing"
    return
  fi
  local age_seconds
  age_seconds=$(( $(date +%s) - $(stat -c %Y "$path") ))
  if (( age_seconds > max_hours * 3600 )); then
    add_issue "$component" "Last success marker is $((age_seconds / 3600)) hours old"
  fi
}
check_marker_age "${BACKUP_DIR}/last-successful-backup" "$BACKUP_STALE_HOURS" "Backup"
check_marker_age "${BACKUP_DIR}/last-successful-restore-test" "$RESTORE_TEST_STALE_HOURS" "Restore test"

sort -u -o "$issues_file" "$issues_file"
current_hash="$(sha256sum "$issues_file" | awk '{print $1}')"
state_file="${MONITOR_STATE_DIR}/last-issues.sha256"
previous_hash="$(cat "$state_file" 2>/dev/null || true)"

send_email() {
  local subject="$1"
  local body="$2"
  if [[ ! -s "$RESEND_API_KEY_FILE" ]]; then
    echo "[monitor] Resend API key is missing" >&2
    return 1
  fi
  payload="$(SUBJECT="$subject" BODY="$body" FROM="$MONITOR_EMAIL_FROM" TO="$MONITOR_EMAIL_TO" python3 - <<'PY'
import json, os
print(json.dumps({
    "from": os.environ["FROM"],
    "to": [os.environ["TO"]],
    "subject": os.environ["SUBJECT"],
    "text": os.environ["BODY"],
}))
PY
)"
  curl --silent --show-error --fail https://api.resend.com/emails \
    -H "Authorization: Bearer $(<"$RESEND_API_KEY_FILE")" \
    -H 'Content-Type: application/json' \
    --data "$payload" >/dev/null
}

issue_count="$(wc -l <"$issues_file" | tr -d ' ')"
if [[ "$current_hash" != "$previous_hash" ]]; then
  if (( issue_count > 0 )); then
    body="NeuroCrop monitoring detected ${issue_count} issue(s) on $(hostname) at $(date -u +%Y-%m-%dT%H:%M:%SZ):

$(cat "$issues_file")

Check: journalctl -u neurocrop-monitor.service -n 100 --no-pager"
    send_email "[NeuroCrop] ${issue_count} monitoring issue(s)" "$body"
    echo "[monitor] alert sent for ${issue_count} issue(s)"
  elif [[ -n "$previous_hash" ]]; then
    send_email "[NeuroCrop] Platform recovered" \
      "All monitored NeuroCrop components are healthy on $(hostname) as of $(date -u +%Y-%m-%dT%H:%M:%SZ)."
    echo "[monitor] recovery sent"
  fi
  printf '%s\n' "$current_hash" >"$state_file"
fi

if (( issue_count == 0 )); then
  if [[ -n "$HEARTBEAT_URL" ]]; then curl --silent --show-error --fail --max-time 10 "$HEARTBEAT_URL" >/dev/null; fi
  echo "[monitor] healthy"
  exit 0
fi

if [[ -n "$HEARTBEAT_URL" ]]; then curl --silent --show-error --max-time 10 "${HEARTBEAT_URL%/}/fail" >/dev/null || true; fi
cat "$issues_file" >&2
exit 1
