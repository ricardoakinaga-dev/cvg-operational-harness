#!/usr/bin/env bash
# Independent probe: production entrypoint fail-closed without resolver vs
# passing the resolver gate with a keyring (then failing later on the DB).
set -u
cd /home/ricardo/cvg-agent-secretary-v2
export PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH

COMMON_ENV=(
  NODE_ENV=production
  OPENAI_API_KEY=synthetic-provider-key-not-real
  WEBHOOK_SIGNING_SECRET=synthetic-webhook-signing-secret-0123456789
  POSTGRES_RLS_ENFORCEMENT=true
  INBOUND_TENANT_ID=tenant_00000000-0000-4000-8000-0000000009b1
  INBOUND_AGENT_ID=agent_00000000-0000-4000-8000-0000000009b1
  API_ALLOWED_ORIGINS=https://console.example.test
  API_REQUIRE_HTTPS=true
  API_PERSISTENCE_MODE=postgres
  DATABASE_URL=postgres://fixture:fixture@127.0.0.1:1/fixture
  OUTBOX_DURABLE_INBOUND=true
)

run_case() {
  local label="$1"; shift
  local out
  out=$(env -u CVG_OPERATOR_IDENTITY_KEYRING "${COMMON_ENV[@]}" "$@" node_modules/.bin/tsx apps/api/src/main.ts 2>&1)
  local code=$?
  echo "=== ${label} exit=${code}"
  echo "$out" | tail -4
}

run_case "no keyring / no explicit mode" env -u CVG_IDENTITY_MODE
run_case "explicit simulation mode" env CVG_IDENTITY_MODE=simulation
run_case "invalid keyring JSON" env CVG_IDENTITY_MODE=trusted CVG_OPERATOR_IDENTITY_KEYRING='{not-json'
run_case "valid keyring (resolver gate should pass, DB fails later)" \
  env CVG_IDENTITY_MODE=trusted \
  CVG_OPERATOR_IDENTITY_KEYRING='{"current":{"keyId":"kid_probe_2026","secret":"probe-synthetic-secret-0123456789abcdef"}}'
