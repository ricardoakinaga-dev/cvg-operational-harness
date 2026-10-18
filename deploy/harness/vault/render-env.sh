#!/usr/bin/env bash
# PLAN0374 Fase C (C4, decided 2026-10-16: HashiCorp Vault on the hospital
# server). Renders one env file per Vault KV v2 secret under
# secret/cvg-harness/<name> into /etc/cvg-harness/<name>.env (mode 0600),
# atomically, without ever printing a value.
#
#   VAULT_ADDR=https://127.0.0.1:8200 VAULT_TOKEN=... \
#     render-env.sh harness backup alert-relay
#
# Needs: vault CLI, jq. Run by the deploy unit before `docker compose up`.
set -Eeuo pipefail
umask 077

OUT_DIR="${CVG_ENV_DIR:-/etc/cvg-harness}"
MOUNT="${CVG_VAULT_KV_MOUNT:-secret}"
PREFIX="${CVG_VAULT_KV_PREFIX:-cvg-harness}"

log() {
  printf '{"time":"%s","event":"render_env.%s","message":"%s"}\n' \
    "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" "$2" >&2
}
die() {
  log failed "$1"
  exit 1
}

[[ $# -gt 0 ]] || die "usage: render-env.sh <secret-name>..."
command -v vault >/dev/null || die "vault CLI not found"
command -v jq >/dev/null || die "jq not found"
[[ -n "${VAULT_ADDR:-}" ]] || die "VAULT_ADDR is required"
[[ "$OUT_DIR" == /* ]] || die "CVG_ENV_DIR must be absolute"
mkdir -p "$OUT_DIR"

for name in "$@"; do
  [[ "$name" =~ ^[a-z][a-z0-9-]{0,40}$ ]] || die "invalid secret name"
  tmp="$(mktemp "$OUT_DIR/.$name.env.XXXXXX")"
  trap 'rm -f -- "$tmp"' EXIT
  vault kv get -mount="$MOUNT" -format=json "$PREFIX/$name" |
    jq -er '.data.data | to_entries[]
      | select(.key | test("^[A-Z_][A-Z0-9_]*$"))
      | select(.value | type == "string")
      | select(.value | test("[\n\r]") | not)
      | "\(.key)=\(.value)"' >"$tmp" ||
    die "secret $name could not be read or has no valid KEY=value entry"
  count="$(wc -l <"$tmp")"
  [[ "$count" -gt 0 ]] || die "secret $name is empty"
  chmod 0600 "$tmp"
  mv -f -- "$tmp" "$OUT_DIR/$name.env"
  trap - EXIT
  log rendered "name=$name keys=$count"
done
