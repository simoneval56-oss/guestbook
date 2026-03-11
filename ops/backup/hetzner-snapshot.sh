#!/usr/bin/env bash
set -Eeuo pipefail

# Optional helper script for Hetzner Cloud snapshots.
# Requires: hcloud CLI + HCLOUD_TOKEN + HCLOUD_SERVER_ID

HCLOUD_SERVER_ID="${HCLOUD_SERVER_ID:-}"
HCLOUD_SNAPSHOT_DESCRIPTION="${HCLOUD_SNAPSHOT_DESCRIPTION:-guesthomebook-$(date -u +'%Y%m%dT%H%M%SZ')}"

if [[ -z "${HCLOUD_TOKEN:-}" ]]; then
  echo "HCLOUD_TOKEN is required" >&2
  exit 1
fi

if [[ -z "$HCLOUD_SERVER_ID" ]]; then
  echo "HCLOUD_SERVER_ID is required" >&2
  exit 1
fi

if ! command -v hcloud >/dev/null 2>&1; then
  echo "hcloud CLI not found" >&2
  exit 1
fi

export HCLOUD_TOKEN
hcloud server create-image "$HCLOUD_SERVER_ID" --type snapshot --description "$HCLOUD_SNAPSHOT_DESCRIPTION"
