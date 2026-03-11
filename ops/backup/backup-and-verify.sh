#!/usr/bin/env bash
set -Eeuo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/guesthomebook}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
BACKUP_SCHEMAS="${BACKUP_SCHEMAS:-public}"
DATABASE_URL="${DATABASE_URL:-}"
SUPABASE_ACCESS_TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
SUPABASE_WORKDIR="${SUPABASE_WORKDIR:-/opt/guestbook}"
SUPABASE_PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
SUPABASE_POOLER_URL="${SUPABASE_POOLER_URL:-}"
RESTORE_PG_IMAGE="${RESTORE_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.6.1.054}"
RESTORE_PG_PORT="${RESTORE_PG_PORT:-55432}"
RESTORE_PG_PASSWORD="${RESTORE_PG_PASSWORD:-guesthomebook_restore_check}"
RESTORE_PG_USER="${RESTORE_PG_USER:-supabase_admin}"
ALERT_WEBHOOK_URL="${ALERT_WEBHOOK_URL:-}"
ALERT_NOTIFY_SUCCESS="${ALERT_NOTIFY_SUCCESS:-false}"
ENABLE_VPS_SNAPSHOT="${ENABLE_VPS_SNAPSHOT:-false}"
SNAPSHOT_SCRIPT="${SNAPSHOT_SCRIPT:-}"

REQUIRED_TABLES=("users" "properties" "homebooks" "sections" "subsections" "media")
DB_HOST=""
DB_PORT=""
DB_USER=""
DB_NAME=""
DB_PASSWORD=""

log() {
  printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

json_escape() {
  local raw="${1:-}"
  raw="${raw//\\/\\\\}"
  raw="${raw//\"/\\\"}"
  raw="${raw//$'\n'/\\n}"
  raw="${raw//$'\r'/}"
  echo "$raw"
}

notify_alert() {
  local severity="$1"
  local title="$2"
  local message="$3"
  local details="${4:-{}}"
  if [[ -z "$ALERT_WEBHOOK_URL" ]]; then
    return 0
  fi

  local payload
  payload="$(cat <<EOF
{"app":"guesthomebook","source":"vps_backup","severity":"$(json_escape "$severity")","title":"$(json_escape "$title")","message":"$(json_escape "$message")","occurred_at":"$(date -u +'%Y-%m-%dT%H:%M:%SZ')","details":$details}
EOF
)"

  curl -fsS -m 8 -H "Content-Type: application/json" -d "$payload" "$ALERT_WEBHOOK_URL" >/dev/null || true
}

bootstrap_supabase_link_metadata() {
  local temp_dir="$SUPABASE_WORKDIR/supabase/.temp"
  mkdir -p "$temp_dir"

  if [[ ! -f "$temp_dir/project-ref" ]] && [[ -n "$SUPABASE_PROJECT_REF" ]]; then
    printf '%s' "$SUPABASE_PROJECT_REF" >"$temp_dir/project-ref"
  fi

  if [[ ! -f "$temp_dir/pooler-url" ]] && [[ -n "$SUPABASE_POOLER_URL" ]]; then
    printf '%s' "$SUPABASE_POOLER_URL" >"$temp_dir/pooler-url"
  fi
}

extract_export_value() {
  local key="$1"
  local text="$2"
  printf '%s\n' "$text" | sed -n "s/^export ${key}=\"\\([^\"]*\\)\"$/\\1/p" | head -n 1
}

resolve_db_credentials_from_supabase_token() {
  local dry_run_output=""
  bootstrap_supabase_link_metadata

  if [[ ! -f "$SUPABASE_WORKDIR/supabase/.temp/project-ref" ]] || [[ ! -f "$SUPABASE_WORKDIR/supabase/.temp/pooler-url" ]]; then
    echo "Supabase linked metadata missing for token mode." >&2
    echo "Expected files: $SUPABASE_WORKDIR/supabase/.temp/project-ref and pooler-url" >&2
    exit 1
  fi

  dry_run_output="$(
    SUPABASE_ACCESS_TOKEN="$SUPABASE_ACCESS_TOKEN" \
      supabase --workdir "$SUPABASE_WORKDIR" db dump --linked --dry-run 2>&1
  )" || {
    echo "Unable to generate temporary DB credentials from Supabase CLI." >&2
    exit 1
  }

  DB_HOST="$(extract_export_value "PGHOST" "$dry_run_output")"
  DB_PORT="$(extract_export_value "PGPORT" "$dry_run_output")"
  DB_USER="$(extract_export_value "PGUSER" "$dry_run_output")"
  DB_PASSWORD="$(extract_export_value "PGPASSWORD" "$dry_run_output")"
  DB_NAME="$(extract_export_value "PGDATABASE" "$dry_run_output")"

  if [[ -z "$DB_HOST" ]] || [[ -z "$DB_PORT" ]] || [[ -z "$DB_USER" ]] || [[ -z "$DB_PASSWORD" ]] || [[ -z "$DB_NAME" ]]; then
    echo "Supabase CLI did not return valid temporary DB credentials." >&2
    exit 1
  fi
}

if [[ -n "$DATABASE_URL" ]]; then
  :
elif [[ -n "$SUPABASE_ACCESS_TOKEN" ]]; then
  require_cmd supabase
  resolve_db_credentials_from_supabase_token
else
  echo "Set DATABASE_URL or SUPABASE_ACCESS_TOKEN in backup env." >&2
  exit 1
fi

require_cmd pg_dump
require_cmd pg_restore
require_cmd psql
require_cmd docker
require_cmd sha256sum
if [[ -n "$ALERT_WEBHOOK_URL" ]]; then
  require_cmd curl
fi

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
backup_file="$BACKUP_DIR/db-$timestamp.dump"
checksum_file="$backup_file.sha256"
result_file="$BACKUP_DIR/latest-result.json"
restore_log="$BACKUP_DIR/restore-$timestamp.log"
container_name="ghb-restore-$timestamp"
container_name="${container_name,,}"

cleanup() {
  docker rm -f "$container_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

fail() {
  local reason="$1"
  local details="${2:-{}}"
  local payload
  payload="$(cat <<EOF
{"ok":false,"timestamp":"$timestamp","reason":"$(json_escape "$reason")","details":$details}
EOF
)"
  mkdir -p "$BACKUP_DIR"
  echo "$payload" >"$result_file"
  notify_alert "critical" "Backup/restore failed" "$reason" "$details"
  echo "$reason" >&2
  exit 1
}

mkdir -p "$BACKUP_DIR"

schema_args=()
IFS=',' read -r -a backup_schema_list <<<"$BACKUP_SCHEMAS"
for schema_name in "${backup_schema_list[@]}"; do
  if [[ -n "$schema_name" ]]; then
    schema_args+=(--schema="$schema_name")
  fi
done

if [[ "${#schema_args[@]}" -eq 0 ]]; then
  fail "No backup schemas configured" "{\"step\":\"backup_schema_parse\",\"value\":\"$(json_escape "$BACKUP_SCHEMAS")\"}"
fi

if [[ "$ENABLE_VPS_SNAPSHOT" == "true" ]]; then
  if [[ -n "$SNAPSHOT_SCRIPT" ]] && [[ -x "$SNAPSHOT_SCRIPT" ]]; then
    log "Creating VPS snapshot..."
    if ! "$SNAPSHOT_SCRIPT"; then
      notify_alert "warning" "VPS snapshot failed" "Snapshot script returned non-zero exit code."
    fi
  else
    notify_alert "warning" "VPS snapshot skipped" "ENABLE_VPS_SNAPSHOT=true but SNAPSHOT_SCRIPT is missing or not executable."
  fi
fi

log "Creating DB backup: $backup_file"
if [[ -n "$DATABASE_URL" ]]; then
  if ! pg_dump "$DATABASE_URL" "${schema_args[@]}" --format=custom --no-owner --no-privileges --file "$backup_file"; then
    fail "pg_dump failed" "{\"step\":\"pg_dump\"}"
  fi
else
  if ! PGPASSWORD="$DB_PASSWORD" pg_dump \
    --host="$DB_HOST" \
    --port="$DB_PORT" \
    --username="$DB_USER" \
    --dbname="$DB_NAME" \
    --role=postgres \
    "${schema_args[@]}" \
    --format=custom \
    --no-owner \
    --no-privileges \
    --file="$backup_file"; then
    fail "pg_dump failed (token mode)" "{\"step\":\"pg_dump_token_mode\"}"
  fi
fi

sha256sum "$backup_file" >"$checksum_file"

log "Starting temporary restore container..."
if ! docker run -d --rm --name "$container_name" \
  -e POSTGRES_PASSWORD="$RESTORE_PG_PASSWORD" \
  -e POSTGRES_DB=restorecheck \
  -p "127.0.0.1:${RESTORE_PG_PORT}:5432" \
  "$RESTORE_PG_IMAGE" >/dev/null; then
  fail "Unable to start temporary restore container" "{\"step\":\"docker_run\"}"
fi

ready=false
for _ in $(seq 1 30); do
  if PGPASSWORD="$RESTORE_PG_PASSWORD" psql \
    -h 127.0.0.1 \
    -p "$RESTORE_PG_PORT" \
    -U "$RESTORE_PG_USER" \
    -d restorecheck \
    -Atqc "select 1;" >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 2
done

if [[ "$ready" != "true" ]]; then
  fail "Temporary restore database not ready" "{\"step\":\"wait_postgres\"}"
fi

log "Restoring backup into temporary database..."
if ! PGPASSWORD="$RESTORE_PG_PASSWORD" pg_restore \
  --no-owner \
  --no-privileges \
  -h 127.0.0.1 \
  -p "$RESTORE_PG_PORT" \
  -U "$RESTORE_PG_USER" \
  -d restorecheck \
  "$backup_file" >"$restore_log" 2>&1; then
  log "pg_restore returned non-zero (details in $restore_log). Continuing with validation."
fi

required_tables_csv="$(printf "'%s'," "${REQUIRED_TABLES[@]}")"
required_tables_csv="${required_tables_csv%,}"
table_count="$(PGPASSWORD="$RESTORE_PG_PASSWORD" psql \
  -h 127.0.0.1 \
  -p "$RESTORE_PG_PORT" \
  -U "$RESTORE_PG_USER" \
  -d restorecheck \
  -Atqc "select count(*) from information_schema.tables where table_schema='public' and table_name in (${required_tables_csv});" || echo "0")"

if [[ "$table_count" -lt "${#REQUIRED_TABLES[@]}" ]]; then
  fail "Restore validation failed: missing required tables" "{\"step\":\"validate_tables\",\"found\":$table_count,\"required\":${#REQUIRED_TABLES[@]}}"
fi

users_count="$(PGPASSWORD="$RESTORE_PG_PASSWORD" psql -h 127.0.0.1 -p "$RESTORE_PG_PORT" -U "$RESTORE_PG_USER" -d restorecheck -Atqc "select count(*) from public.users;" || echo "0")"
properties_count="$(PGPASSWORD="$RESTORE_PG_PASSWORD" psql -h 127.0.0.1 -p "$RESTORE_PG_PORT" -U "$RESTORE_PG_USER" -d restorecheck -Atqc "select count(*) from public.properties;" || echo "0")"
homebooks_count="$(PGPASSWORD="$RESTORE_PG_PASSWORD" psql -h 127.0.0.1 -p "$RESTORE_PG_PORT" -U "$RESTORE_PG_USER" -d restorecheck -Atqc "select count(*) from public.homebooks;" || echo "0")"

log "Applying retention cleanup (>${RETENTION_DAYS} days)..."
find "$BACKUP_DIR" -type f -name "db-*.dump" -mtime +"$RETENTION_DAYS" -delete || true
find "$BACKUP_DIR" -type f -name "db-*.dump.sha256" -mtime +"$RETENTION_DAYS" -delete || true

result_payload="$(cat <<EOF
{"ok":true,"timestamp":"$timestamp","backup_file":"$backup_file","checksum_file":"$checksum_file","restore_log":"$restore_log","table_count":$table_count,"users_count":$users_count,"properties_count":$properties_count,"homebooks_count":$homebooks_count}
EOF
)"
echo "$result_payload" >"$result_file"

log "Backup and restore verification completed successfully."
if [[ "$ALERT_NOTIFY_SUCCESS" == "true" ]]; then
  notify_alert "info" "Backup/restore successful" "Daily backup and restore check completed." "$result_payload"
fi
