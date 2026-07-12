#!/usr/bin/env bash
set -Eeuo pipefail

REPOSITORY="${NEUROCROP_GITHUB_REPOSITORY:-Grigolandija/neurocrop}"
WORKFLOW="${NEUROCROP_CI_WORKFLOW:-ci.yml}"
SOURCE_DIR="${NEUROCROP_STAGING_SOURCE:-/opt/neurocrop-staging-source}"
DEPLOY_DIR="${NEUROCROP_STAGING_DEPLOY_DIR:-/opt/neurocrop-deploy/staging}"
DEPLOY_ROOT="$(dirname "$DEPLOY_DIR")"
STATE_FILE="${DEPLOY_DIR}/last-deployed-ci-sha"
LOCK_FILE="${NEUROCROP_STAGING_UPDATE_LOCK:-/var/lock/neurocrop-staging-update.lock}"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "[staging-update] another update is already running"
  exit 0
fi

api_url="https://api.github.com/repos/${REPOSITORY}/actions/workflows/${WORKFLOW}/runs?branch=main&status=success&per_page=1"
payload="$(curl --fail --silent --show-error --max-time 20 \
  -H 'Accept: application/vnd.github+json' \
  -H 'X-GitHub-Api-Version: 2022-11-28' \
  "$api_url")"
sha="$(printf '%s' "$payload" | python3 -c 'import json,sys; runs=json.load(sys.stdin).get("workflow_runs", []); print(runs[0].get("head_sha", "") if runs else "")')"

if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
  echo "[staging-update] no successful main CI run found" >&2
  exit 1
fi
if [[ "$(cat "$STATE_FILE" 2>/dev/null || true)" == "$sha" ]]; then
  echo "[staging-update] already deployed ${sha:0:12}"
  exit 0
fi

git -C "$SOURCE_DIR" fetch --quiet origin main
git -C "$SOURCE_DIR" checkout --quiet --detach "$sha"

backend_image="neurocrop-backend:staging-${sha}"
frontend_image="neurocrop-frontend:staging-${sha}"
docker build --quiet -t "$backend_image" "$SOURCE_DIR/backend" >/dev/null
docker build --quiet -f "$SOURCE_DIR/deploy/frontend.Dockerfile" -t "$frontend_image" "$SOURCE_DIR" >/dev/null

install -m 600 "$SOURCE_DIR/deploy/staging.compose.yml" "$DEPLOY_DIR/compose.yml"
install -m 700 "$SOURCE_DIR/deploy/deploy.sh" "$DEPLOY_ROOT/deploy.sh"
install -m 700 "$SOURCE_DIR/deploy/rollback.sh" "$DEPLOY_ROOT/rollback.sh"

if [[ -s "$DEPLOY_DIR/image.env" ]]; then
  cp "$DEPLOY_DIR/image.env" "$DEPLOY_DIR/previous-image.env"
  chmod 600 "$DEPLOY_DIR/previous-image.env"
fi
cat >"$DEPLOY_DIR/image.env" <<EOF
NEUROCROP_BACKEND_IMAGE=${backend_image}
NEUROCROP_FRONTEND_IMAGE=${frontend_image}
EOF
chmod 600 "$DEPLOY_DIR/image.env"

cd "$DEPLOY_DIR"
docker compose --env-file runtime.env --env-file image.env -f compose.yml up -d --remove-orphans
for attempt in $(seq 1 60); do
  api_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' neurocrop-api-staging 2>/dev/null || true)"
  frontend_health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' neurocrop-frontend-staging 2>/dev/null || true)"
  if [[ "$api_health" == "healthy" && "$frontend_health" == "healthy" ]]; then
    printf '%s\n' "$sha" >"$STATE_FILE"
    echo "[staging-update] deployed ${sha:0:12}"
    exit 0
  fi
  sleep 2
done

echo "[staging-update] deployment did not become healthy; rolling back" >&2
"$DEPLOY_ROOT/rollback.sh" staging
exit 1
