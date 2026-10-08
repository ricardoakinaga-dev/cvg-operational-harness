#!/usr/bin/env bash
# PLAN0374 Fase C (C6) — scheduled logical backup of the harness data schema
# with kernel audit chain anchors kept outside the database.
#
#   backup.sh [--env-file /etc/cvg-harness/backup.env]
#
# 1. chain-anchors.mjs (harness image) exports a REPEATABLE READ snapshot,
#    verifies every anchored tenant's kernel audit chain in it and emits the
#    ledger heads (anchors).
# 2. pg_dump --format=custom --snapshot=<id> dumps exactly that state with
#    the read-only backup role (pinned postgres client image).
# 3. The set (dump, anchors.json, SHA256SUMS, manifest.json) is written to
#    CVG_BACKUP_DIR; anchors + sums + manifest are copied to the independent
#    CVG_BACKUP_ANCHOR_DIR (they detect a truncated or altered dump later).
# 4. Sets older than CVG_BACKUP_RETENTION_DAYS are pruned, only after a
#    successful run. Any failure exits non-zero and leaves no partial set.
#
# Needs docker, flock, sha256sum and coreutils. Never prints secrets.
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/harness/backup/common.sh
source "$SCRIPT_DIR/common.sh"
CVG_SCRIPT_EVENT=backup

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || cvg_die "--env-file requires a path"
      cvg_load_env_file "$2"
      shift 2
      ;;
    *) cvg_die "unknown argument: $1" ;;
  esac
done

cvg_require CVG_BACKUP_DATABASE_URL CVG_BACKUP_DATABASE_PASSWORD POSTGRES_SCHEMA \
  CVG_BACKUP_TENANT_IDS CVG_BACKUP_DIR CVG_BACKUP_ANCHOR_DIR CVG_BACKUP_PG_IMAGE \
  CVG_BACKUP_DOCKER_NETWORK
cvg_require_passwordless_url CVG_BACKUP_DATABASE_URL
cvg_require_pinned_image CVG_BACKUP_PG_IMAGE
cvg_require_absolute_dir_var CVG_BACKUP_DIR
cvg_require_absolute_dir_var CVG_BACKUP_ANCHOR_DIR
[[ "$POSTGRES_SCHEMA" =~ $CVG_SCHEMA_PATTERN ]] || cvg_die "POSTGRES_SCHEMA is invalid"
IFS=',' read -r -a TENANTS <<<"$CVG_BACKUP_TENANT_IDS"
[[ ${#TENANTS[@]} -gt 0 ]] || cvg_die "CVG_BACKUP_TENANT_IDS is empty"
for tenant in "${TENANTS[@]}"; do
  [[ "$tenant" =~ $CVG_TENANT_PATTERN ]] || cvg_die "invalid tenant id in CVG_BACKUP_TENANT_IDS"
done
RETENTION_DAYS="${CVG_BACKUP_RETENTION_DAYS:-35}"
[[ "$RETENTION_DAYS" =~ ^[1-9][0-9]{0,3}$ ]] || cvg_die "CVG_BACKUP_RETENTION_DAYS must be 1..9999"
BACKUP_DIR="${CVG_BACKUP_DIR%/}"
ANCHOR_DIR="${CVG_BACKUP_ANCHOR_DIR%/}"
[[ "$ANCHOR_DIR" != "$BACKUP_DIR" && "$ANCHOR_DIR/" != "$BACKUP_DIR/"* ]] ||
  cvg_die "CVG_BACKUP_ANCHOR_DIR must be outside CVG_BACKUP_DIR"
HARNESS_IMAGE="$(cvg_harness_image)"
ANCHOR_TIMEOUT_S="${CVG_BACKUP_ANCHOR_TIMEOUT_S:-300}"
[[ "$ANCHOR_TIMEOUT_S" =~ ^[1-9][0-9]{0,4}$ ]] || cvg_die "CVG_BACKUP_ANCHOR_TIMEOUT_S is invalid"

CA_MOUNT=()
if [[ -n "${CVG_HARNESS_DB_CA_FILE:-}" ]]; then
  [[ -r "$CVG_HARNESS_DB_CA_FILE" ]] || cvg_die "CVG_HARNESS_DB_CA_FILE is not readable"
  CA_MOUNT=(-v "$CVG_HARNESS_DB_CA_FILE:/run/cvg/db-ca.pem:ro")
fi

mkdir -p "$BACKUP_DIR" "$ANCHOR_DIR"
exec 9>"$BACKUP_DIR/.backup.lock"
flock -n 9 || cvg_die "another backup is running"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
SET_DIR="$BACKUP_DIR/$STAMP"
PARTIAL_DIR="$BACKUP_DIR/.$STAMP.partial"
WORK_DIR="$(mktemp -d)"
ANCHOR_CONTAINER="cvg-backup-anchors-$STAMP-$$"
ANCHOR_PID=""
STEP="init"

cleanup() {
  local status=$?
  exec 3>&- || true
  if [[ -n "$ANCHOR_PID" ]] && kill -0 "$ANCHOR_PID" 2>/dev/null; then
    docker rm --force "$ANCHOR_CONTAINER" >/dev/null 2>&1 || true
    wait "$ANCHOR_PID" 2>/dev/null || true
  fi
  rm -rf "$WORK_DIR"
  if [[ $status -ne 0 ]]; then
    rm -rf "$PARTIAL_DIR"
    cvg_log backup.failed "step=$STEP"
  fi
}
trap cleanup EXIT

cvg_log backup.started "set=$STAMP schema=$POSTGRES_SCHEMA tenants=${#TENANTS[@]}"
mkdir -p "$PARTIAL_DIR"

# 1. Snapshot + anchors. The container's stdin is a FIFO held open on fd 3:
#    closing fd 3 lets chain-anchors.mjs COMMIT and exit.
STEP="anchors"
mkfifo "$WORK_DIR/hold"
PGPASSWORD="$CVG_BACKUP_DATABASE_PASSWORD" \
  CVG_ANCHOR_DATABASE_URL="$CVG_BACKUP_DATABASE_URL" \
  CVG_ANCHOR_TENANT_IDS="$CVG_BACKUP_TENANT_IDS" \
  docker run --rm -i --name "$ANCHOR_CONTAINER" \
  --network "$CVG_BACKUP_DOCKER_NETWORK" \
  "${CVG_HARDENED_RUN[@]}" \
  -e PGPASSWORD -e CVG_ANCHOR_DATABASE_URL -e CVG_ANCHOR_TENANT_IDS \
  -e POSTGRES_SCHEMA \
  -v "$SCRIPT_DIR/chain-anchors.mjs:/app/scripts/cvg-chain-anchors.mjs:ro" \
  "${CA_MOUNT[@]}" \
  "$HARNESS_IMAGE" node scripts/cvg-chain-anchors.mjs emit \
  <"$WORK_DIR/hold" >"$WORK_DIR/anchors.out" 2>"$WORK_DIR/anchors.err" &
ANCHOR_PID=$!
exec 3>"$WORK_DIR/hold"

deadline=$((SECONDS + ANCHOR_TIMEOUT_S))
until grep -q '^ANCHORS ' "$WORK_DIR/anchors.out" 2>/dev/null; do
  if ! kill -0 "$ANCHOR_PID" 2>/dev/null; then
    tail -n 5 "$WORK_DIR/anchors.err" >&2 || true
    cvg_die "anchor emitter exited before publishing anchors"
  fi
  ((SECONDS < deadline)) || cvg_die "anchor emitter timed out"
  sleep 1
done
SNAPSHOT="$(sed -n 's/^SNAPSHOT //p' "$WORK_DIR/anchors.out" | head -n 1)"
[[ "$SNAPSHOT" =~ ^[0-9A-Fa-f-]+$ ]] || cvg_die "no valid snapshot id"
sed -n 's/^ANCHORS //p' "$WORK_DIR/anchors.out" | head -n 1 >"$PARTIAL_DIR/anchors.json"
[[ -s "$PARTIAL_DIR/anchors.json" ]] || cvg_die "empty anchors document"

# 2. Dump exactly the anchored snapshot.
STEP="pg_dump"
PGPASSWORD="$CVG_BACKUP_DATABASE_PASSWORD" \
  docker run --rm --network "$CVG_BACKUP_DOCKER_NETWORK" \
  --user postgres "${CVG_HARDENED_RUN[@]}" \
  -e PGPASSWORD "${CA_MOUNT[@]}" \
  "$CVG_BACKUP_PG_IMAGE" \
  pg_dump --format=custom --no-password --snapshot="$SNAPSHOT" \
  --schema="$POSTGRES_SCHEMA" --lock-wait-timeout=120s \
  --dbname="$CVG_BACKUP_DATABASE_URL" >"$PARTIAL_DIR/harness.dump"

# Release the snapshot; the emitter must COMMIT cleanly.
STEP="anchors-release"
exec 3>&-
wait "$ANCHOR_PID" || cvg_die "anchor emitter did not release the snapshot cleanly"
ANCHOR_PID=""

# 3. The dump must be readable and contain the audit table data.
STEP="verify-dump"
[[ -s "$PARTIAL_DIR/harness.dump" ]] || cvg_die "empty dump"
docker run --rm -i --network none --user postgres "${CVG_HARDENED_RUN[@]}" \
  "$CVG_BACKUP_PG_IMAGE" pg_restore --list \
  <"$PARTIAL_DIR/harness.dump" >"$WORK_DIR/toc.txt"
grep -Eq "TABLE DATA $POSTGRES_SCHEMA audit_events " "$WORK_DIR/toc.txt" ||
  cvg_die "dump has no audit_events data entry"

STEP="checksums"
(cd "$PARTIAL_DIR" && sha256sum harness.dump anchors.json >SHA256SUMS)
DUMP_SHA="$(cut -d ' ' -f 1 <(grep ' harness.dump$' "$PARTIAL_DIR/SHA256SUMS"))"
DUMP_BYTES="$(stat -c %s "$PARTIAL_DIR/harness.dump")"
PG_DUMP_VERSION="$(docker run --rm --network none --user postgres "${CVG_HARDENED_RUN[@]}" \
  "$CVG_BACKUP_PG_IMAGE" pg_dump --version | tr -cd '[:alnum:] ._()-')"
printf '{"schemaVersion":1,"kind":"cvg-harness-backup-set","set":"%s","createdAt":"%s","schema":"%s","tenants":%d,"snapshot":"%s","dump":{"file":"harness.dump","format":"pg_dump-custom","bytes":%d,"sha256":"%s"},"harnessImage":"%s","pgClientImage":"%s","pgDump":"%s","dataPolicy":"no secrets; anchors hold hashes and counts only"}\n' \
  "$STAMP" "$(cvg_now)" "$POSTGRES_SCHEMA" "${#TENANTS[@]}" "$SNAPSHOT" \
  "$DUMP_BYTES" "$DUMP_SHA" "$HARNESS_IMAGE" "$CVG_BACKUP_PG_IMAGE" \
  "$PG_DUMP_VERSION" >"$PARTIAL_DIR/manifest.json"

# Independent copy of anchors, sums and manifest.
STEP="anchor-copy"
mkdir -p "$ANCHOR_DIR/$STAMP"
cp "$PARTIAL_DIR/anchors.json" "$PARTIAL_DIR/SHA256SUMS" "$PARTIAL_DIR/manifest.json" "$ANCHOR_DIR/$STAMP/"
(cd "$ANCHOR_DIR/$STAMP" && sha256sum --check --quiet <(grep ' anchors.json$' SHA256SUMS))

STEP="publish"
mv "$PARTIAL_DIR" "$SET_DIR"

# 4. Retention: only completed sets matching the stamp format, never the
#    one just written; stale partial directories older than a day.
STEP="retention"
find "$BACKUP_DIR" "$ANCHOR_DIR" -mindepth 1 -maxdepth 1 -type d \
  -regextype posix-extended -regex '.*/[0-9]{8}T[0-9]{6}Z' \
  ! -name "$STAMP" -mtime +"$RETENTION_DAYS" -exec rm -rf {} +
find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '.*.partial' -mtime +1 -exec rm -rf {} +

STEP="done"
cvg_log backup.completed "set=$SET_DIR bytes=$DUMP_BYTES sha256=$DUMP_SHA"
