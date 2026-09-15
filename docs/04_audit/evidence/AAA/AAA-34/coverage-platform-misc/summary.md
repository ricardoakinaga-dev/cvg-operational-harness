# AAA-34 / coverage-platform-misc — behavioral coverage hardening

- status: `IMPLEMENTED_PENDING_INDEPENDENT_REVIEW`
- scope: `packages/shared`, `packages/platform`, `packages/rag`, `packages/tools`,
  `packages/workflows`, `apps/worker` — tests only
- product code changed: none (verified by `git status` on the scoped paths)
- runtime state / execution log / backlog: not touched (shared tracking is outside
  this lane; evidence published here only)
- data: synthetic fixtures only; no real data, no egress, no commit/push/deploy,
  no npm install
- PostgreSQL: disposable fixture `127.0.0.1:55432/cvg_aaa16_test` only; port 5432
  never touched; `DATABASE_URL` never set

## 1. Added test files (untracked, tests only)

| file | sha256 |
| --- | --- |
| packages/shared/src/__tests__/ids-hardening.test.ts | `5daa1227900ad05b6275f873c56d1ef08a2420db52916921f041c2ff54d838d2` |
| packages/shared/src/__tests__/audit-governance-hardening.test.ts | `53e20aa73eb7d363912725368c6f1e1040b9801e46c56cc255cac830f91804f0` |
| packages/shared/src/__tests__/shared-branches-hardening.test.ts | `4351512f771822c1355e1ca015ebe5ce426b42ef0f03425f8d80d78946e2b5e7` |
| packages/platform/src/__tests__/event-bus-hardening.test.ts | `ab34c50585c782e71b03c25104205ccef8bd32688112585bad22cd390a01ee75` |
| packages/platform/src/__tests__/tool-invocation-boundary-hardening.test.ts | `fbcb8d80d6541f6b7e015ba099555280bde750737d509a3b90d537655145e3af` |
| packages/platform/src/__tests__/plugin-gateway-hardening.test.ts | `cce954925796adf389209e5feb5b77152958da7d22e4fe0e17e1807bcc3e95e4` |
| packages/platform/src/__tests__/platform-misc-hardening.test.ts | `e6f86f2a66728f28dbda755b7571e093f95767ae14781f01f548ad19e1b015bd` |
| packages/platform/src/__tests__/secretary-preset-hardening.test.ts | `9c113665050ba7bef9bb7b287aa80687e1c31e2de2389d1a2820e5edc687f8e3` |
| packages/rag/src/__tests__/institutional-rag-hardening.test.ts | `f44e97f395092e0438f915a9b24a9ab5eddeec69b65d6a50360dbdf667cecd5a` |
| packages/tools/src/__tests__/local-handlers-hardening.test.ts | `8a4a587789497308046e65f0c4483154686e383e62991bef44c5fbc315a77831` |
| apps/worker/src/__tests__/controlled-worker-hardening.test.ts | `bf602c4d108e432006f6560968c5e12b7541e1b4067269e4d6b329cad999d536` |
| apps/worker/src/__tests__/postgres-controlled-hardening.test.ts | `bd26808f4413c713dbb1ae6f11bf9f4a033db9453d92270300984b6618a7b18e` |

90 new tests; none skipped, none `.only`, every test has assertions.

## 2. Package-level before/after (focused coverage per package)

Measured with `npx vitest run <pkg> --coverage --coverage.include='<pkg>/**/*.ts'
--coverage.exclude='**/*.test.ts'` (worker additionally excludes `**/main.ts`, the
same bootstrap exclusion used by `vitest.config.mts`). Full logs and
`coverage-summary.json` per package are in `before/` and `after/`.

| package | statements before → after | branches before → after | functions | lines |
| --- | --- | --- | --- | --- |
| packages/shared | 86.23 → **98.16** | 78.26 → **96.46** | 90.76 → 100 | 89.81 → 99.21 |
| packages/platform | 90.41 → **94.51** | 86.00 → **91.36** | 95.33 → 97.20 | 91.33 → 95.03 |
| packages/rag | 86.00 → **100** | 72.41 → **93.10** | 80.00 → 100 | 85.41 → 100 |
| packages/tools | 92.30 → **100** | 83.58 → **100** | 100 → 100 | 95.34 → 100 |
| packages/workflows | 97.91 → 97.91 | 88.75 → 88.75 | 100 → 100 | 97.77 → 97.77 |
| apps/worker (no main.ts) | 82.43 → **97.29** | 77.02 → **92.56** | 79.16 → 95.83 | 83.80 → 97.18 |

All scoped packages meet statements ≥90% and branches ≥85%. Platform reaches
branches ≥90% (91.36) as requested. Workflows already exceeded both bars before
this lane and was left unchanged to preserve other lanes.

## 3. Requested files — before/after (statements % / branches %)

| file | before | after |
| --- | --- | --- |
| packages/shared/src/ids.ts | 52.94 / 12.50 | 100 / 75.00 |
| packages/shared/src/errors.ts | 88.88 / 75.00 | 100 / 100 |
| packages/shared/src/audit-governance.ts | 73.21 / 61.46 | 95.53 / 93.57 |
| packages/shared/src/lifecycle.ts | 90.00 / 75.00 | 97.50 / 93.75 |
| packages/platform/src/prompt-composer.ts | 87.50 / 50.00 | 100 / 100 |
| packages/platform/src/tool-invocation-boundary.ts | 70.40 / 63.44 | 97.95 / 94.62 |
| packages/platform/src/event-bus.ts | 82.02 / 77.33 | 98.87 / 98.66 |
| packages/platform/src/retention-ledger.ts | 92.10 / 81.25 | 98.68 / 96.87 |
| packages/platform/src/plugin-gateway.ts | 88.60 / 82.52 | 96.20 / 92.71 |
| packages/platform/src/secretary-preset.ts | 95.45 / 70.00 | 100 / 100 |
| packages/platform/src/model-provider.ts | 89.18 / 70.83 | 100 / 100 |
| packages/rag/src/institutional-rag.ts | 85.71 / 72.41 | 100 / 93.10 |
| packages/tools/src/local/*.ts (9 handlers) | 80–100 / 66.66–100 | 100 / 100 |
| packages/tools/src/contracts.ts | 100 / 83.33 | 100 / 100 |
| apps/worker/src/controlled-worker.ts | 76.00 / 59.25 | 92.00 / 85.18 |
| apps/worker/src/postgres-controlled.ts | 79.74 / 75.00 | 97.46 / 92.64 |
| apps/worker/src/jobs/process-outbox-event.ts | 80.95 / 77.27 | 100 / 95.45 |

Remaining uncovered lines are defensive/unreachable branches (e.g.
`controlled-worker` dispatch default only reachable by bypassing the event-type
gate; `postgres-controlled` line 160 never-reached defensive throw; `onToolAudit`
callback that the deterministic preset never invokes; optional-chaining dead
branches). Documented in `limitations.md`.

## 4. What the new tests exercise

- **shared**: secure-UUID fallback via `getRandomValues` and fail-closed without a
  random source; `zod`/`DomainError`/unknown error mapping; outbox error code
  preservation; full `sanitizeOutboxPayload` matrix (identifiers, PII keys,
  secrets, body/opaque/number/array/primitive roots); `redactSensitiveText`
  patterns; production env gates (webhook secret, inbound scope); SSRF private
  ranges and allowlist branches; shutdown timeout/late-settlement/isShuttingDown.
- **platform**: prompt ordering tiebreak; tool-input/output validators and every
  bounded-clone budget (depth, nodes, keys, arrays, strings, cycles, unsafe keys,
  non-plain values); handler-result normalization; event-bus manifest/hook/duplicate
  validation, invalid scopes/modes, subscription ordering, primitive payloads,
  non-Error hook failures and audit-observer failures; retention kind/expiry/
  metadata/clock validation; plugin registry normalization failures and gateway
  denied paths (binding missing/ambiguous/unversioned/unregistered, actor
  authorization denial/unavailability/throw, policy blocked/clarify, approval
  missing/expired/authority failure, handler failure and audit-unavailable);
  model-provider configuration/freeze paths; secretary-preset fail-closed
  preflight, independent validator identity and final-read fallback.
- **rag**: add-time field validation, missing ids, revoked-republish conflict,
  most-recent-published selection, bidirectional partial matching, medical
  handoff and tenant isolation, list clones, at-rest PII redaction.
- **tools**: context-required failures, legacy deterministic fixtures, tenant
  merge/coercion of non-object input, repository error code mapping for all nine
  handlers, toolFailure normalization.
- **worker**: construction/drain-limit guards, bounded drain and empty-queue stop,
  explicit event id + lease, human-takeover handoff without handler execution,
  rethrow when ack and fail paths are both down; PostgreSQL env gates (DB URL,
  RLS, controlled mode, tenant, schema name), drain-limit parsing, noop handlers,
  pinned-session execution with redacted history and no rebind, mapping/published/
  binding failures, not-configured pinned version, configured-agent fallback.

## 5. Gates (logs in `logs/`)

| gate | result |
| --- | --- |
| focused coverage, all scoped packages | exit 0; bars met (see §2) |
| `npx eslint` on the 12 added files | exit 0 (`logs/lint-scoped.log`) |
| `TEST_DATABASE_URL=... npx vitest run apps/worker/.../postgres-outbox-bridge.integration.test.ts` | exit 0, 2 passed / 0 skipped on the disposable cluster |
| `npm test` (full) | exit 0 — 225 files passed / 4 skipped; 1544 tests passed / 57 skipped; 0 failures (`logs/full-npm-test.log`) |
| `npm run typecheck` | exit 2 — 6 errors, all in other lanes' untracked files (`apps/api/src/__tests__/journey-routes-coverage.test.ts`, `packages/agent-runtime/src/__tests__/runtime-execution-recovery.test.ts`, `runtime-kernel-coverage.test.ts`); zero errors in this lane's files (`logs/typecheck.log`) |
| `npm run lint` | exit 1 — 1 unused-var error in other lane's untracked `apps/api/src/__tests__/build-server-from-env-boundary.test.ts`; zero errors in this lane's files (`logs/lint-global.log`) |

Baseline was 1160 pass / 57 skip. The after full-suite skip count is unchanged at
57 and failures are zero; the pass delta (1544 − 1160) includes this lane's 90
tests plus concurrent lanes' additions.

## 6. Bugs found / production fixes

None. No production code was modified and no RED test demanded a product fix.
Two intentionally unreachable defensive branches were found but are not bugs and
were left untouched (`controlled-worker` unsupported-event default, which cannot
be reached through `processOutboxEvent`; `postgres-controlled` line 160).

## 7. Limitations

See `limitations.md`.
