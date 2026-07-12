#!/bin/sh
set -eu

environment=${1:?Usage: rollback.sh staging|production}
case "$environment" in staging|production) ;; *) echo "Unknown environment: $environment" >&2; exit 2 ;; esac

deploy_dir="/opt/neurocrop-deploy/$environment"
previous_file="$deploy_dir/previous-image.env"
test -s "$previous_file" || { echo "No previous image recorded for $environment" >&2; exit 1; }

cp "$previous_file" "$deploy_dir/image.env"
chmod 600 "$deploy_dir/image.env"
docker compose --env-file "$deploy_dir/runtime.env" --env-file "$deploy_dir/image.env" -f "$deploy_dir/compose.yml" up -d --remove-orphans
echo "$environment rolled back to $(sed -n 's/^NEUROCROP_BACKEND_IMAGE=//p' "$deploy_dir/image.env")"
