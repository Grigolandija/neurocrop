#!/bin/sh
set -eu

request=${SSH_ORIGINAL_COMMAND:-}
environment=${request%%:*}
sha=${request#*:}

case "$environment" in
  staging|production) ;;
  *) echo "Rejected deployment environment" >&2; exit 2 ;;
esac

if test "$request" = "$sha" || test "${#sha}" -ne 40; then
  echo "Rejected deployment revision" >&2
  exit 2
fi
case "$sha" in
  *[!0-9a-f]*) echo "Rejected deployment revision" >&2; exit 2 ;;
esac

backend_image="ghcr.io/grigolandija/neurocrop-backend:${sha}"
frontend_image="ghcr.io/grigolandija/neurocrop-frontend:${sha}"

exec /opt/neurocrop-deploy/deploy.sh "$environment" "$backend_image" "$frontend_image"
