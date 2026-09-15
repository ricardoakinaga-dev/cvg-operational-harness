# AAA-19 — consumer contínuo e shutdown recuperável (reaudit-round3, builder)

- Task: `AAA-19` (P2/S2, gate `G_SPEC`, role worker), program `AAA-20260912`.
- Round: `PROD-20260913/reaudit-round3`. Builder lane (not an independent verification).
- Candidate: working tree at HEAD `512bc11` (dirty tree preserved; no commit/reset/clean).
- Scope: `apps/worker/` only; evidence under `docs/04_audit/evidence/PROD-20260913/reaudit-round3/AAA-19/`.
- Fixtures: synthetic only. Disposable PostgreSQL 16.15 at `127.0.0.1:55481`, database
  `lane19_r3_7444` (created for this lane). Port 5432 never touched. No provider, channel,
  IdP, patient data or external effect.

## 1. Status

**NO_PRODUCT_CHANGE_REQUIRED** — every AAA-19 acceptance behavior was already present in the
frozen candidate product code (`apps/worker/src` unchanged byte-for-byte versus
`reaudit-round2/manifest.json`, 25/25 worker files identical). This round added **5 negative-first
discriminating tests** (2 in the new entrypoint integration file, 3 in existing suites) and proved
their discrimination by neutralization. Two transient cross-lane breakages (concurrent AAA-20
edits in `apps/api`) were observed and resolved by that lane; no fix was made outside `apps/worker`.

## 2. Files changed (exact)

| file | change | sha256 |
|---|---|---|
| `apps/worker/src/__tests__/continuous-worker.test.ts` | +2 tests (startup matrix; dead-letter → requeue → consume) | `e9eeed02db9f73777bb87f6d90a919ad704987a592e5a028d18bb0fadaaf0f44` |
| `apps/worker/src/__tests__/postgres-controlled-hardening.test.ts` | +1 test (outbound suppressed without touching injected ports) | `20a834f38edce656a32fb55c19a4a19282ea63ee105d53c6ed11e4258b008b40` |
| `apps/worker/src/__tests__/continuous-worker-entrypoint.integration.test.ts` | new file, 2 DB-conditional tests (real SIGTERM drain around restart; preflight before first claim) | `18a9da5459999d24417af639d9119d544f06749b7e527a0d8523632d3f407ac5` |
| `apps/worker/src/main.ts` | **net-zero**: temporarily modified for neutralization A/B, restored byte-identically | `9138a3d079aa2da3a20964a177faf335a6146019543c9b0f44bdf3b5c5c9c4f5` (equals frozen manifest hash) |

No other file in `apps/worker/` differs from the frozen candidate manifest. `package.json`,
persistence, migrations, `server.ts`, docs registries and other lanes' files were not touched.
`git diff` for tracked worker product files is exactly the preexisting AAA-19 diff.

## 3. Per-acceptance result

| # | Acceptance | Result | Command / evidence | Exit |
|---|---|---|---|---|
| 1 | Events before/after restart consumed, no loss/duplication | PASS | `TEST_DATABASE_URL=… npx vitest run --no-file-parallelism apps/worker` → `consumes events enqueued before and after a simulated restart` (focused-unit.log), PG `continuous-worker-postgres.integration.test.ts` (postgres-gate.log), NEW entrypoint restart + per-event journal=1 (focused-entrypoint.log) | 0 |
| 2 | SIGTERM loses no effect; drain/release recoverable (discriminating test added) | PASS | NEW `consumes events around a restart and drains on a real SIGTERM without loss or duplication` (real signal → exit 0, `worker.shutdown.completed`, 1 journal row/event) + existing `finishes an in-flight handler on SIGTERM…` and `releases the lease on a bounded SIGTERM…`; neutralization B (shutdown.install disabled) → test fails (exit 143) | 0 (test), 1 (neutralized) |
| 3 | Poison event does not block the queue (dead-letter) and requeue works | PASS | existing `dead-letters a poison event without blocking the queue`; NEW `dead-letters a failing event and consumes it after an operator requeue` (maxAttempts=1 → dead_letter → `requeueDeadLetter` → second worker processes; 1 journal row); PG poison dead-letter | 0 |
| 4 | Startup without configuration fails closed (adapter/tenant/database/RLS/controlled-mode) | PASS | NEW `fails closed for each missing continuous configuration dimension` (queue_adapter_missing, controlled_tenant_missing, postgres_database_missing, postgres_rls_required, controlled_mode_required, production_controlled_worker_forbidden) + real entrypoint exit 1 (existing) + `npm run test:worker:startup` | 0 |
| 5 | Queue lag observable and lease/heartbeat with retry/backoff | PASS | existing `observes queue lag while a handler is in flight`, `prefers an explicit outboxBacklog probe…`, `heartbeats the claimed lease…`, `renews the lease through the adapter heartbeat seam…`, `detects a lost lease and fails closed…`, `backs off and recovers when the claim boundary fails`, `backs off while idle…`; PG lag=2 + heartbeat metrics | 0 |
| 6 | PROD-05 role preflight runs before the first claim (no regression) | PASS | NEW `runs the role preflight before the first claim and leaves the queue untouched on rejection` (permissive-policy role → entrypoint exits 1, event `pending`, attempts 0, 0 journal/attempt rows, no `worker.continuous_ready`); existing preflight matrix; neutralization A (preflight disabled) → test fails (no exit) | 0 (test), 1 (neutralized) |
| 7 | No real effect path composed (outbound suppressed, handlers synthetic) | PASS | NEW `suppresses outbound without touching any injected port` (throwing ports; result `controlled_outbound_suppressed`/`externalEffects:false`); existing noop-handler assertions; entrypoint logs `externalEffects:false`, `durable:true`; handlers synthetic only | 0 |

Aggregate gates: typecheck 0; prettier 0; eslint 0; worker suite with DB 15 files/91 tests (0
failed, 0 skipped); worker suite without DB 74 passed/17 conditionally skipped; startup smoke 0;
`test:postgres` 19 files/163 tests (0 failed, 0 skipped).

## 4. Negative-first / added tests

New tests (all pass on the frozen candidate):

1. `fails closed for each missing continuous configuration dimension` — acceptance 4.
2. `dead-letters a failing event and consumes it after an operator requeue` — acceptance 3.
3. `consumes events around a restart and drains on a real SIGTERM without loss or duplication` —
   acceptance 1+2, real `tsx apps/worker/src/main.ts` process and real `SIGTERM`.
4. `runs the role preflight before the first claim and leaves the queue untouched on rejection` —
   acceptance 6, real entrypoint against a disposable schema with a real permissive-policy role.
5. `suppresses outbound without touching any injected port` — acceptance 7.

Discrimination (temporary neutralization of `apps/worker/src/main.ts`, restored afterwards):
- disable `assertPostgresWorkerPreflight` → test 4 fails (entrypoint keeps running and would claim),
  `neutralization-preflight.log`, exit 1.
- disable `shutdown.install(process)` → test 3 fails (`{code:143}` instead of `{code:0}`),
  `neutralization-shutdown.log`, exit 1.
Restoration verified: `main.ts` sha256 equals the frozen candidate hash and the entrypoint test
passes again (`entrypoint-post-restore-green.log`, exit 0).

## 5. Skips and reasons

- The new file's 2 tests use the repository's existing conditional pattern
  (`describe.skip` when `TEST_DATABASE_URL` is absent), identical to
  `continuous-worker-postgres.integration.test.ts` and `postgres-role-preflight.test.ts`.
  Without `TEST_DATABASE_URL`: 3 files / 17 tests skipped, all DB-conditional. With it: 0 skipped.
- No unconditional skip, no `.only`, no `.todo`, no threshold change, no existing test weakened.

## 6. Limitations

- Builder output only; this is **not** a VERIFIED claim. Independent review is required.
- Release-path through a real signal is not exercised end-to-end at the entrypoint: the composed
  default handlers are too fast to hold a lease past `drainMs`, and no test seam was added to slow
  them; the release-retry path is proven at unit level and over PostgreSQL with `worker.stop`.
- Periodic sweeps remain dependency-injected and disabled in the entrypoint pending AAA-21/D01
  (`worker.sweeps_disabled`); unchanged from the frozen candidate.
- Prior-builder limitation remains: worker workspace dependencies are not registered in
  `apps/worker/package.json` (forbidden path this round).
- `npm test` (whole repo) was not re-run in this round; the required gates were run instead. During
  the session, concurrent AAA-20 edits in `apps/api` (untracked identity tests + `server.ts`)
  transiently failed typecheck (28 errors, none in worker/packages) and
  `postgres-outbox-bridge.integration.test.ts` (`createEffectiveOperatorIdentityResolver is not
  defined`); the other lane finished, and the final runs of typecheck and of the worker and
  postgres suites are green (`cross-lane-bridge-failure.log` records the transient moment).
- Local disposable PostgreSQL only; no physical crash/fsync/failover testing, no Docker, no
  production enablement. Production remains NO-GO.

## 7. Blockers

None at the final state. The only cross-lane issue (transient `apps/api` identity composition
breakage) resolved without intervention in this lane.
