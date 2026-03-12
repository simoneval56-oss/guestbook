#!/usr/bin/env bash
set -Eeuo pipefail

# Optional helper script for Hetzner Cloud snapshots.
# Requires: hcloud CLI + HCLOUD_SERVER_ID + auth token (HCLOUD_TOKEN or HCLOUD_TOKEN_FILE).

HCLOUD_SERVER_ID="${HCLOUD_SERVER_ID:-}"
HCLOUD_SNAPSHOT_DESCRIPTION="${HCLOUD_SNAPSHOT_DESCRIPTION:-guesthomebook-$(date -u +'%Y%m%dT%H%M%SZ')}"
HCLOUD_SNAPSHOT_FILTER_PREFIX="${HCLOUD_SNAPSHOT_FILTER_PREFIX:-guesthomebook-}"
HCLOUD_RETENTION_ENABLED="${HCLOUD_RETENTION_ENABLED:-true}"
HCLOUD_RETENTION_COUNT="${HCLOUD_RETENTION_COUNT:-7}"
HCLOUD_TOKEN_FILE="${HCLOUD_TOKEN_FILE:-}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "$cmd not found" >&2
    exit 1
  fi
}

is_truthy() {
  case "${1,,}" in
    1|true|yes|on) return 0 ;;
    *) return 1 ;;
  esac
}

read_hcloud_token() {
  if [[ -n "$HCLOUD_TOKEN_FILE" ]] && [[ -f "$HCLOUD_TOKEN_FILE" ]]; then
    tr -d '\r\n' <"$HCLOUD_TOKEN_FILE"
    return 0
  fi
  if [[ -n "${HCLOUD_TOKEN:-}" ]]; then
    printf '%s' "${HCLOUD_TOKEN}"
    return 0
  fi
  return 1
}

cleanup_old_snapshots() {
  local snapshots_json
  local -a snapshot_ids=()
  local total=0
  local deleted=0

  if ! is_truthy "$HCLOUD_RETENTION_ENABLED"; then
    return 0
  fi

  if ! [[ "$HCLOUD_RETENTION_COUNT" =~ ^[0-9]+$ ]] || [[ "$HCLOUD_RETENTION_COUNT" -lt 1 ]]; then
    echo "HCLOUD_RETENTION_COUNT must be an integer >= 1" >&2
    return 1
  fi

  if [[ -z "$HCLOUD_SNAPSHOT_FILTER_PREFIX" ]]; then
    echo "HCLOUD_SNAPSHOT_FILTER_PREFIX is empty; refusing retention cleanup." >&2
    return 1
  fi

  require_cmd jq

  snapshots_json="$(hcloud image list --type snapshot --output json)"
  mapfile -t snapshot_ids < <(
    printf '%s' "$snapshots_json" | jq -r \
      --arg server_id "$HCLOUD_SERVER_ID" \
      --arg prefix "$HCLOUD_SNAPSHOT_FILTER_PREFIX" \
      '
      map(
        select(
          ((.created_from.id? // "" | tostring) == $server_id)
          and ((.description // "") | startswith($prefix))
        )
      )
      | sort_by(.created)
      | reverse
      | .[].id
      '
  )

  total="${#snapshot_ids[@]}"
  if (( total <= HCLOUD_RETENTION_COUNT )); then
    echo "Snapshot retention: ${total} snapshot(s), nothing to delete."
    return 0
  fi

  for snapshot_id in "${snapshot_ids[@]:HCLOUD_RETENTION_COUNT}"; do
    echo "Deleting old snapshot ${snapshot_id}..."
    hcloud image delete "$snapshot_id"
    ((deleted+=1))
  done

  echo "Snapshot retention: deleted ${deleted} old snapshot(s), kept ${HCLOUD_RETENTION_COUNT}."
}

token="$(read_hcloud_token || true)"
if [[ -z "$token" ]]; then
  echo "HCLOUD_TOKEN (or HCLOUD_TOKEN_FILE) is required" >&2
  exit 1
fi

if [[ -z "$HCLOUD_SERVER_ID" ]]; then
  echo "HCLOUD_SERVER_ID is required" >&2
  exit 1
fi

require_cmd hcloud
export HCLOUD_TOKEN="$token"
hcloud server create-image "$HCLOUD_SERVER_ID" --type snapshot --description "$HCLOUD_SNAPSHOT_DESCRIPTION"
cleanup_old_snapshots
