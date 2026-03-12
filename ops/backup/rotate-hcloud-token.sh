#!/usr/bin/env bash
set -Eeuo pipefail

# Rotate Hetzner API token without backup downtime.
# Usage:
#   NEW_HCLOUD_TOKEN=... HCLOUD_TOKEN_FILE=/etc/guesthomebook/hcloud-token ./rotate-hcloud-token.sh
# or:
#   ./rotate-hcloud-token.sh <new_token>

HCLOUD_TOKEN_FILE="${HCLOUD_TOKEN_FILE:-/etc/guesthomebook/hcloud-token}"
NEW_HCLOUD_TOKEN="${NEW_HCLOUD_TOKEN:-${1:-}}"

if [[ -z "$NEW_HCLOUD_TOKEN" ]]; then
  echo "Missing new token. Provide NEW_HCLOUD_TOKEN env var or first argument." >&2
  exit 1
fi

install -d -m 700 "$(dirname "$HCLOUD_TOKEN_FILE")"
tmp_file="$(mktemp "${HCLOUD_TOKEN_FILE}.tmp.XXXXXX")"
trap 'rm -f "$tmp_file"' EXIT

printf '%s' "$NEW_HCLOUD_TOKEN" >"$tmp_file"
chmod 600 "$tmp_file"
mv "$tmp_file" "$HCLOUD_TOKEN_FILE"

echo "Hetzner token rotated in ${HCLOUD_TOKEN_FILE}"
