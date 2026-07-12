#!/usr/bin/env bash
set -Eeuo pipefail

CONFIG_PATH="${RCLONE_CONFIG:-/etc/neurocrop-rclone.conf}"
REMOTE_NAME="neurocrop-r2"
CRYPT_NAME="neurocrop-r2-crypt"

read -r -p "R2 bucket name [neurocrop-backups]: " bucket
bucket="${bucket:-neurocrop-backups}"
read -r -p "R2 S3 endpoint URL: " endpoint
read -r -p "R2 Access Key ID: " access_key
read -r -s -p "R2 Secret Access Key: " secret_key
printf '\n'

if [[ ! "$bucket" =~ ^[a-z0-9][a-z0-9.-]+$ ]]; then
  echo "Invalid bucket name" >&2
  exit 1
fi
if [[ ! "$endpoint" =~ ^https://[a-zA-Z0-9.-]+\.r2\.cloudflarestorage\.com/?$ ]]; then
  echo "Invalid Cloudflare R2 endpoint" >&2
  exit 1
fi
if [[ -z "$access_key" || -z "$secret_key" ]]; then
  echo "R2 credentials are required" >&2
  exit 1
fi

crypt_password="$(openssl rand -base64 36 | tr -d '\n')"
crypt_salt="$(openssl rand -base64 36 | tr -d '\n')"

umask 077
install -d -m 700 "$(dirname "$CONFIG_PATH")"
rclone --config "$CONFIG_PATH" config create "$REMOTE_NAME" s3 \
  provider Cloudflare \
  env_auth false \
  access_key_id "$access_key" \
  secret_access_key "$secret_key" \
  endpoint "${endpoint%/}" \
  region auto \
  no_check_bucket true
rclone --config "$CONFIG_PATH" config create "$CRYPT_NAME" crypt \
  remote "${REMOTE_NAME}:${bucket}/database" \
  filename_encryption standard \
  directory_name_encryption true \
  password "$crypt_password" \
  password2 "$crypt_salt"
chmod 600 "$CONFIG_PATH"

rclone --config "$CONFIG_PATH" lsd "${REMOTE_NAME}:${bucket}" >/dev/null

cat <<EOF

R2 connection verified.

SAVE THESE TWO RECOVERY VALUES OUTSIDE THE VPS:
Crypt password: ${crypt_password}
Crypt salt:     ${crypt_salt}

They are required to decrypt backups if this VPS and its rclone config are lost.
EOF
