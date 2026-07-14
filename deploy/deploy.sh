#!/bin/sh
set -eu

environment=${1:?Usage: deploy.sh staging|production backend-image [frontend-image]}
image=${2:?Usage: deploy.sh staging|production backend-image [frontend-image]}
frontend_image=${3:-}
case "$environment" in staging|production) ;; *) echo "Unknown environment: $environment" >&2; exit 2 ;; esac

deploy_dir="/opt/neurocrop-deploy/$environment"
compose_file="$deploy_dir/compose.yml"
state_file="$deploy_dir/image.env"
previous_file="$deploy_dir/previous-image.env"

test -f "$compose_file" || { echo "Missing $compose_file" >&2; exit 1; }
mkdir -p "$deploy_dir"

# Backend images run as node (uid/gid 1000). Bind-mounted Compose secrets keep
# their host permissions, so grant only the container's group read access.
prepare_secret() {
  secret_file=$1
  test -f "$secret_file" || { echo "Missing secret: $secret_file" >&2; exit 1; }
  chown root:1000 "$secret_file"
  chmod 640 "$secret_file"
}

if test "$environment" = production; then
  for secret_file in \
    /opt/neurocrop-backend/.session_secret \
    /opt/neurocrop-backend/.chirpstack_api_token \
    /opt/neurocrop-backend/.chirpstack_application_id \
    /opt/neurocrop-backend/.chirpstack_device_profile_id \
    /opt/neurocrop-backend/.default_otaa_app_key \
    /opt/neurocrop-backend/.resend_api_key
  do
    prepare_secret "$secret_file"
  done
else
  prepare_secret /opt/neurocrop-deploy/staging/session_secret
fi

if test -f "$state_file"; then
  cp "$state_file" "$previous_file"
  chmod 600 "$previous_file"
fi

printf 'NEUROCROP_BACKEND_IMAGE=%s\n' "$image" > "$state_file"
if test "$environment" = staging; then
  test -n "$frontend_image" || { echo "Staging requires a frontend image" >&2; exit 1; }
  printf 'NEUROCROP_FRONTEND_IMAGE=%s\n' "$frontend_image" >> "$state_file"
fi
chmod 600 "$state_file"

docker compose --env-file "$deploy_dir/runtime.env" --env-file "$state_file" -f "$compose_file" pull
docker compose --env-file "$deploy_dir/runtime.env" --env-file "$state_file" -f "$compose_file" up -d --remove-orphans

container="neurocrop-api"
test "$environment" = staging && container="neurocrop-api-staging"
for attempt in $(seq 1 30); do
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)
  if test "$health" = healthy; then
    if test "$environment" = staging; then
      frontend_health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' neurocrop-frontend-staging 2>/dev/null || true)
      test "$frontend_health" = healthy || { sleep 2; continue; }
    fi
    echo "$environment deployed: $image"
    exit 0
  fi
  sleep 2
done

echo "Deployment did not become healthy; rolling back." >&2
sh "$(dirname "$0")/rollback.sh" "$environment"
exit 1
