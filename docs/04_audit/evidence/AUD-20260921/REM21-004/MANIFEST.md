# REM21-004 — Evidence Manifest

- program: `AUD21-COMPREHENSIVE-REMEDIATION`
- task: `REM21-004`
- finding: `A21-F03`
- status: `PASS_LOCAL / FINAL_CERT_DEFERRED`
- scope: `local/synthetic/disposable`
- production: `NO_GO`
- node: `v22.23.2`
- source: `docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md`
- source SHA-256: `87c7a9667e4a813eb4f5a105aed3f67bfd299c75c983f5c266208accd971435a`

## Implementation

- `packages/shared/src/ssrf.ts`
- `packages/channel-gateway/src/adapters/ssrf-node.ts`
- `packages/channel-gateway/src/adapters/evolution.ts`
- `packages/channel-gateway/src/adapters/chatwoot.ts`
- `packages/model-gateway/src/providers/ssrf-node.ts`
- `packages/model-gateway/src/providers/openai-compatible.ts`
- `packages/model-gateway/src/providers/ollama.ts`

## Checks recorded

- shared, channel and model focused suite: `PASS`, 5/5 files and 92/92
  tests;
- affected package regression: `PASS`, 28 files and 322/322 tests;
- validated-address transport receives the approved address and bypasses the
  fallback hostname fetch: `PASS`;
- redirect re-resolution/re-binding: `PASS`;
- default Node transport loopback integration preserved `Host` and JSON body:
  `PASS`;
- public HTTP base URLs rejected for EvolutionAPI and Chatwoot: `PASS`;
- public/non-loopback HTTP rejected for model providers: `PASS`;
- private DNS answer rejected before injected transport: `PASS`;
- Node 22 typecheck: `PASS`;
- focused ESLint: `PASS`;
- `docs:check-links`: `PASS`, `broken: []`;
- `git diff --check`: `PASS`;
- targeted Prettier: `PASS`.
- final fresh-context critic 03: `PASS`; I1 remains unclaimed.
- task-local `sha256sums.txt`: `PASS`, all listed artifacts `OK`.

## Decision and limitations

The validated address is now part of the transport contract. The default Node
path uses a deterministic `lookup` with no connection-pool reuse, keeps the
original hostname as HTTP authority and HTTPS SNI, and never follows redirects
implicitly. HTTP is limited to explicit loopback/private homologation;
external integrations are HTTPS-only.

This is a local remediation result, not a release certification. Full
candidate-bound freeze, independent I1 acceptance, PostgreSQL/external gates
and final decision remain deferred to `REM21-019`. No provider, channel,
credential, real data, commit, push or deploy was used.
