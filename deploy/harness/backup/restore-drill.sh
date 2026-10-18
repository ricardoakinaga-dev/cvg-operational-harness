#!/usr/bin/env bash
# PLAN0374 Fase C (C6) — monthly restore rehearsal of a backup set.
#
#   restore-drill.sh [--env-file /etc/cvg-harness/backup.env] [--set <dir>]
#
# Never touches the production database: the restore goes into a disposable
# PostgreSQL container on a new `--internal` Docker network (no route out),
# created and removed by this script, as scripts/restore-audit-chain-proof.ts
# does. Steps:
#   1. Pick the newest set in CVG_BACKUP_DIR (or --set) and check the dump
#      and anchors against the independent copy in CVG_BACKUP_ANCHOR_DIR.
#   2. Start the disposable PostgreSQL (random throwaway password) and wait
#      for two real queries two seconds apart (FULLTEST F-03).
#   3. pg_restore --no-owner --no-acl --exit-on-error into a scratch database.
#   4. chain-anchors.mjs verify (harness image, same verifier): every
#      anchored ledger must have the same event count and head hash, with no
#      extra ledger.
#   5. Write a JSON report to CVG_RESTORE_EVIDENCE_DIR; exit non-zero on any
#      failure. The container and the network are always removed.
set -Eeuo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=deploy/harness/backup/common.sh
source "$SCRIPT_DIR/common.sh"
CVG_SCRIPT_EVENT=restore_drill

SET_ARG=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file)
      [[ $# -ge 2 ]] || cvg_die "--env-file requires a path"
      cvg_load_env_file "$2"
      shift 2
      ;;
    --set)
      [[ $# -ge 2 ]] || cvg_die "--set requires a directory"
      SET_ARG="$2"
      shift 2
      ;;
    *) cvg_die "unknown argument: $1" ;;
  esac
done

cvg_require POSTGRES_SCHEMA CVG_BACKUP_DIR CVG_BACKUP_ANCHOR_DIR \
  CVG_BACKUP_PG_IMAGE CVG_RESTORE_EVIDENCE_DIR
cvg_require_pinned_image CVG_BACKUP_PG_IMAGE
cvg_require_absolute_dir_var CVG_BACKUP_DIR
cvg_require_absolute_dir_var CVG_BACKUP_ANCHOR_DIR
cvg_require_absolute_dir_var CVG_RESTORE_EVIDENCE_DIR
[[ "$POSTGRES_SCHEMA" =~ $CVG_SCHEMA_PATTERN ]] || cvg_die "POSTGRES_SCHEMA is invalid"
HARNESS_IMAGE="$(cvg_harness_image)"
BACKUP_DIR="${CVG_BACKUP_DIR%/}"
ANCHOR_DIR="${CVG_BACKUP_ANCHOR_DIR%/}"

if [[ -n "$SET_ARG" ]]; then
  SET_DIR="${SET_ARG%/}"
else
  SET_DIR="$(find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
    -regextype posix-extended -regex '.*/[0-9]{8}T[0-9]{6}Z' | sort | tail -n 1)"
fi
[[ -n "$SET_DIR" && -d "$SET_DIR" ]] || cvg_die "no backup set found"
SET_NAME="$(basename "$SET_DIR")"
[[ "$SET_NAME" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || cvg_die "set directory name is not a backup stamp"
ANCHOR_SET="$ANCHOR_DIR/$SET_NAME"
[[ -s "$SET_DIR/harness.dump" ]] || cvg_die "set has no dump"
[[ -s "$ANCHOR_SET/anchors.json" && -s "$ANCHOR_SET/SHA256SUMS" ]] ||
  cvg_die "independent anchors for $SET_NAME are missing"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
NETWORK="cvg-restore-drill-$RUN_ID"
PG_CONTAINER="cvg-restore-drill-pg-$RUN_ID"
WORK_DIR="$(mktemp -d)"
STARTED_AT="$(cvg_now)"
STEP="init"
REPORT_FILE="$CVG_RESTORE_EVIDENCE_DIR/restore-drill-$SET_NAME-$RUN_ID.json"

cleanup() {
  local status=$?
  docker rm --force "$PG_CONTAINER" >/dev/null 2>&1 || true
  docker network rm "$NETWORK" >/dev/null 2>&1 || true
  rm -rf "$WORK_DIR"
  if [[ $status -ne 0 ]]; then
    cvg_log restore_drill.failed "step=$STEP set=$SET_NAME"
  fi
}
trap cleanup EXIT

cvg_log restore_drill.started "set=$SET_NAME"

# 1. The dump and the anchors must match the sums kept apart from the set.
STEP="checksums"
(cd "$SET_DIR" && sha256sum --check --quiet "$ANCHOR_SET/SHA256SUMS") ||
  cvg_die "dump or anchors differ from the independent SHA256SUMS"
cmp -s "$SET_DIR/anchors.json" "$ANCHOR_SET/anchors.json" ||
  cvg_die "anchors in the set differ from the independent copy"

# 2. Disposable PostgreSQL on an isolated network.
STEP="scratch-postgres"
docker network create --internal "$NETWORK" >/dev/null
PG_PASSWORD="$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')"
POSTGRES_PASSWORD="$PG_PASSWORD" docker run -d --rm --name "$PG_CONTAINER" \
  --network "$NETWORK" --security-opt no-new-privileges \
  -e POSTGRES_PASSWORD "$CVG_BACKUP_PG_IMAGE" >/dev/null
consecutive=0
for _ in $(seq 1 120); do
  if [[ "$(docker exec "$PG_CONTAINER" psql -U postgres -tAc 'select 1' 2>/dev/null || true)" == "1" ]]; then
    consecutive=$((consecutive + 1))
    ((consecutive >= 2)) && break
    sleep 2
  else
    consecutive=0
    sleep 0.5
  fi
done
((consecutive >= 2)) || cvg_die "scratch PostgreSQL did not become ready"
docker exec "$PG_CONTAINER" createdb -U postgres cvg_restore_drill

# 3. Restore without owners or grants (no production role exists here).
STEP="pg_restore"
docker exec -i "$PG_CONTAINER" pg_restore -U postgres --no-owner --no-acl \
  --exit-on-error -d cvg_restore_drill <"$SET_DIR/harness.dump"
COUNTS="$(docker exec "$PG_CONTAINER" psql -U postgres -d cvg_restore_drill -tA -F ',' -c \
  "SELECT (SELECT count(*) FROM \"$POSTGRES_SCHEMA\".audit_events), (SELECT count(*) FROM \"$POSTGRES_SCHEMA\".outbox_events), (SELECT max(version) FROM \"$POSTGRES_SCHEMA\".schema_migrations)")"
IFS=',' read -r AUDIT_ROWS OUTBOX_ROWS LATEST_MIGRATION <<<"$COUNTS"
[[ "$AUDIT_ROWS" =~ ^[0-9]+$ && "$OUTBOX_ROWS" =~ ^[0-9]+$ ]] ||
  cvg_die "restored row counts are unreadable"
[[ "$LATEST_MIGRATION" =~ ^[0-9]{4}_[a-z0-9_]+$ ]] || cvg_die "restored schema_migrations is empty"

# 4. Same verifier as serving, against the independent anchors.
STEP="verify-anchors"
verify_status=0
PGPASSWORD="$PG_PASSWORD" \
  CVG_ANCHOR_DATABASE_URL="postgres://postgres@$PG_CONTAINER:5432/cvg_restore_drill?sslmode=disable" \
  docker run --rm -i --network "$NETWORK" "${CVG_HARDENED_RUN[@]}" \
  -e PGPASSWORD -e CVG_ANCHOR_DATABASE_URL -e POSTGRES_SCHEMA \
  -v "$SCRIPT_DIR/chain-anchors.mjs:/app/scripts/cvg-chain-anchors.mjs:ro" \
  "$HARNESS_IMAGE" node scripts/cvg-chain-anchors.mjs verify \
  <"$ANCHOR_SET/anchors.json" >"$WORK_DIR/verify.out" 2>"$WORK_DIR/verify.err" ||
  verify_status=$?
VERIFICATION="$(sed -n 's/^REPORT //p' "$WORK_DIR/verify.out" | head -n 1)"
[[ -n "$VERIFICATION" ]] || {
  tail -n 5 "$WORK_DIR/verify.err" >&2 || true
  cvg_die "anchor verification produced no report"
}

# 5. Evidence.
STEP="report"
STATUS="PASS"
[[ $verify_status -eq 0 ]] || STATUS="FAIL"
mkdir -p "$CVG_RESTORE_EVIDENCE_DIR"
printf '{"schemaVersion":1,"kind":"cvg-harness-restore-drill","set":"%s","startedAt":"%s","finishedAt":"%s","target":"disposable PostgreSQL on an internal Docker network (never production)","pgImage":"%s","harnessImage":"%s","checksums":"match","restored":{"auditEvents":%d,"outboxEvents":%d,"latestMigration":"%s"},"verification":%s,"status":"%s"}\n' \
  "$SET_NAME" "$STARTED_AT" "$(cvg_now)" "$CVG_BACKUP_PG_IMAGE" "$HARNESS_IMAGE" \
  "$AUDIT_ROWS" "$OUTBOX_ROWS" "$LATEST_MIGRATION" "$VERIFICATION" "$STATUS" \
  >"$REPORT_FILE"

[[ "$STATUS" == "PASS" ]] || cvg_die "restored chains do not match the anchors (report: $REPORT_FILE)"
STEP="done"
cvg_log restore_drill.completed "set=$SET_NAME report=$REPORT_FILE"
