# shellcheck shell=bash
# PLAN0374 Fase C (C6) — helpers shared by backup.sh and restore-drill.sh.
# Sourced, never executed. No secret is ever passed on a command line:
# passwords reach containers only through `-e NAME` from the caller's env.

CVG_SCHEMA_PATTERN='^[a-z][a-z0-9_]{0,62}$'
CVG_TENANT_PATTERN='^tenant_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
CVG_DIGEST_PATTERN='^sha256:[0-9a-f]{64}$'
CVG_PINNED_IMAGE_PATTERN='^[^[:space:]@]+@sha256:[0-9a-f]{64}$'
CVG_ZERO_DIGEST='sha256:0000000000000000000000000000000000000000000000000000000000000000'

cvg_now() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# One JSON line on stderr per event. Messages are fixed strings or validated
# identifiers; never connection strings.
cvg_log() {
  local event="$1" message="${2:-}"
  printf '{"time":"%s","event":"%s","message":"%s"}\n' \
    "$(cvg_now)" "$event" "${message//\"/\'}" >&2
}

cvg_die() {
  cvg_log "${CVG_SCRIPT_EVENT:-cvg}.failed" "$1"
  exit 1
}

# Reads KEY=value lines without evaluating them (URLs carry '&' and JSON
# carries quotes). Surrounding single or double quotes are stripped.
cvg_load_env_file() {
  local file="$1" line key value
  [[ -f "$file" && -r "$file" ]] || cvg_die "env file not readable: $file"
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    if [[ "$line" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      value="${BASH_REMATCH[2]}"
      if [[ "$value" =~ ^\'(.*)\'$ || "$value" =~ ^\"(.*)\"$ ]]; then
        value="${BASH_REMATCH[1]}"
      fi
      export "$key=$value"
    fi
  done <"$file"
}

cvg_require() {
  local name
  for name in "$@"; do
    [[ -n "${!name:-}" ]] || cvg_die "$name is required"
  done
}

cvg_require_absolute_dir_var() {
  local name="$1"
  [[ "${!name}" == /* ]] || cvg_die "$name must be an absolute path"
}

cvg_require_pinned_image() {
  local name="$1" value="${!1}"
  [[ "$value" =~ $CVG_PINNED_IMAGE_PATTERN ]] ||
    cvg_die "$name must be pinned by digest (repo@sha256:...)"
  [[ "$value" != *"@$CVG_ZERO_DIGEST" ]] ||
    cvg_die "$name still has the placeholder digest"
}

# The harness image (pg driver + compiled kernel audit verifier).
cvg_harness_image() {
  cvg_require CVG_HARNESS_IMAGE_REPOSITORY CVG_HARNESS_IMAGE_DIGEST
  [[ "$CVG_HARNESS_IMAGE_DIGEST" =~ $CVG_DIGEST_PATTERN ]] ||
    cvg_die "CVG_HARNESS_IMAGE_DIGEST must be sha256:<64 hex>"
  [[ "$CVG_HARNESS_IMAGE_DIGEST" != "$CVG_ZERO_DIGEST" ]] ||
    cvg_die "CVG_HARNESS_IMAGE_DIGEST still has the placeholder digest"
  printf '%s@%s' "$CVG_HARNESS_IMAGE_REPOSITORY" "$CVG_HARNESS_IMAGE_DIGEST"
}

# A libpq/node-postgres URL without an embedded password.
cvg_require_passwordless_url() {
  local name="$1" value="${!1}"
  [[ "$value" =~ ^postgres(ql)?://[^:/@]+@[^/]+/[^/?]+ ]] ||
    cvg_die "$name must be postgres://<role>@<host>:<port>/<db>[?...] without a password"
}

# Same hardening as the serving containers (0802, condition 7).
CVG_HARDENED_RUN=(
  --read-only
  --cap-drop ALL
  --security-opt no-new-privileges
  --tmpfs /tmp:rw,noexec,nosuid,size=16m
)
