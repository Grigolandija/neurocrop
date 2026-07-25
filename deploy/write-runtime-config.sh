#!/bin/sh
set -eu

api_base_url=${NEUROCROP_API_BASE_URL:-/api}
greenhouse_map_beta=${NEUROCROP_GREENHOUSE_MAP_BETA:-false}
case "$greenhouse_map_beta" in
  true|TRUE|1|yes|YES) greenhouse_map_beta=true ;;
  *) greenhouse_map_beta=false ;;
esac
escaped=$(printf '%s' "$api_base_url" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.NEUROCROP_CONFIG = { apiBaseUrl: "%s", greenhouseMapBeta: %s };\n' "$escaped" "$greenhouse_map_beta" \
  > /usr/share/nginx/html/runtime-config.js
