#!/bin/sh
set -eu

api_base_url=${NEUROCROP_API_BASE_URL:-/api}
escaped=$(printf '%s' "$api_base_url" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.NEUROCROP_CONFIG = { apiBaseUrl: "%s" };\n' "$escaped" \
  > /usr/share/nginx/html/runtime-config.js

