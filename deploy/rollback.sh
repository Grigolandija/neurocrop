#!/bin/sh
set -eu

environment=${1:?Usage: rollback.sh staging|production}
case "$environment" in staging|production) ;; *) echo "Unknown environment: $environment" >&2; exit 2 ;; esac

deploy_dir="/opt/neurocrop-deploy/$environment"
previous_file="$deploy_dir/previous-image"
test -s "$previous_file" || { echo "No previous image recorded for $environment" >&2; exit 1; }

previous_image=$(cat "$previous_file")
printf 'NEUROCROP_BACKEND_IMAGE=%s\n' "$previous_image" > "$deploy_dir/image.env"
docker compose --env-file "$deploy_dir/runtime.env" --env-file "$deploy_dir/image.env" -f "$deploy_dir/compose.yml" up -d --remove-orphans
echo "$environment rolled back to $previous_image"
