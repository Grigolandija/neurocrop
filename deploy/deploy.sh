#!/bin/sh
set -eu

environment=${1:?Usage: deploy.sh staging|production image}
image=${2:?Usage: deploy.sh staging|production image}
case "$environment" in staging|production) ;; *) echo "Unknown environment: $environment" >&2; exit 2 ;; esac

deploy_dir="/opt/neurocrop-deploy/$environment"
compose_file="$deploy_dir/compose.yml"
state_file="$deploy_dir/image.env"
previous_file="$deploy_dir/previous-image"

test -f "$compose_file" || { echo "Missing $compose_file" >&2; exit 1; }
mkdir -p "$deploy_dir"

if test -f "$state_file"; then
  sed -n 's/^NEUROCROP_BACKEND_IMAGE=//p' "$state_file" > "$previous_file"
fi

printf 'NEUROCROP_BACKEND_IMAGE=%s\n' "$image" > "$state_file"
chmod 600 "$state_file"

docker compose --env-file "$deploy_dir/runtime.env" --env-file "$state_file" -f "$compose_file" pull
docker compose --env-file "$deploy_dir/runtime.env" --env-file "$state_file" -f "$compose_file" up -d --remove-orphans

container="neurocrop-api"
test "$environment" = staging && container="neurocrop-api-staging"
for attempt in $(seq 1 30); do
  health=$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container" 2>/dev/null || true)
  test "$health" = healthy && { echo "$environment deployed: $image"; exit 0; }
  sleep 2
done

echo "Deployment did not become healthy; rolling back." >&2
sh "$(dirname "$0")/rollback.sh" "$environment"
exit 1
