# AAA-19 — contract note (reaudit-round3 builder)

- Task: `AAA-19` — "Entregar consumer contínuo e shutdown recuperável" (P2/S2, gate `G_SPEC`, role worker).
- Round: `PROD-20260913/reaudit-round3`; builder lane; local reversible work, synthetic data, disposable database, no production, no commit.
- Owned path: `apps/worker/` (source + tests). Evidence path: `docs/04_audit/evidence/PROD-20260913/reaudit-round3/AAA-19/`.
- Candidate: working tree at HEAD `512bc11` (dirty, preexisting AAA-19 implementation preserved; no `git reset/clean/checkout`).

## What the task requires (backlog AAA-19 acceptance)

1. Events before/after restart consumed with no loss/duplication.
2. SIGTERM loses no effect: shutdown drains/releases recoverably (add a discriminating test if missing).
3. Poison event does not block the queue (dead-letter) and requeue works.
4. Startup without configuration fails closed: missing adapter / tenant / database / RLS / controlled-mode.
5. Queue lag observable (backlog probe/metric) and lease/heartbeat with retry/backoff.
6. PROD-05 role preflight runs before the first claim (do not regress).
7. No real effect path composed (outbound suppressed, handlers synthetic).

Validation required by the backlog: `npm run test:worker:startup` + continuous PostgreSQL consumer/lease-failure integration.

## Where the behavior lives (read before editing)

- `apps/worker/src/continuous-worker.ts` — supervised pump: bounded concurrency, idle/error exponential backoff, `claimNext(leaseMs)` once, heartbeat/ownership re-check (`heartbeatClaim` seam), fail-closed on lease loss, counters + lag metric, `stop({drainMs})` drain-or-release, fail-closed option parsing.
- `apps/worker/src/main.ts` — opt-in `CVG_WORKER_RUN_MODE=continuous` entrypoint; runs `assertPostgresWorkerPreflight` before `worker.start()`; composes `createShutdownController` (SIGTERM/SIGINT) bounded by `drainMs + 5s`; only controlled handlers.
- `apps/worker/src/postgres-controlled.ts` — fail-closed env gates (production rejected, DATABASE_URL/RLS/controlled-mode/tenant required), `createPostgresContinuousWorker`, tenant-scoped read-only backlog probe, synthetic handlers (`messageOutbound` suppressed).
- `apps/worker/src/postgres-role-preflight.ts` — PROD-05 role/RLS/policy/privilege preflight before the first claim.
- `apps/worker/src/jobs/process-outbox-event.ts` — single-claim dispatch through the adapter ack/fail boundary; unknown types dead-letter terminally.

## Method (what I will change and why)

Baseline inspection shows the implementation is present and covered for acceptance 1, 4 (partially), 5, 7 (partially). This round is **negative-first test strengthening**, not a rewrite:

1. `apps/worker/src/__tests__/continuous-worker.test.ts` (extend):
   - fail-closed startup matrix for every missing dimension (adapter/tenant/database/RLS/controlled-mode/production) — acceptance 4.
   - dead-letter → operator `requeueDeadLetter` → re-consumption succeeds without duplication — acceptance 3.
2. `apps/worker/src/__tests__/continuous-worker-entrypoint.integration.test.ts` (new, DB-conditional on `TEST_DATABASE_URL`):
   - real-entrypoint SIGTERM: claim/process events, send `SIGTERM`, assert exit 0 + `worker.shutdown.completed` + exactly one journal record per event (drain, no loss/duplication) — acceptance 2.
   - real-entrypoint preflight-before-first-claim: permissive-policy role makes the preflight fail; assert process exits 1 and the pending event is untouched (`pending`, `attempts=0`, no effect journal, no `worker.continuous_ready`) — acceptance 6.
3. `apps/worker/src/__tests__/postgres-controlled-hardening.test.ts` (extend):
   - default `createPostgresControlledHandlers().messageOutbound` must return `controlled_outbound_suppressed` / `externalEffects:false` without touching injected ports (throwing stubs) — acceptance 7.

Discrimination: tests 1b (requeue), 2a (real signal), 2b (ordering) fail if the corresponding behavior regresses; test 3 fails if an outbound effect port is composed.

## Test commands (gates)

- `npm run typecheck`
- `npx prettier --check` on changed files
- `npx eslint apps/worker`
- `TEST_DATABASE_URL=postgres://cvg_prod@127.0.0.1:55481/lane19_r3_7444 npx vitest run --no-file-parallelism apps/worker`
- `npm run test:worker:startup`
- `TEST_DATABASE_URL=... npm run test:postgres`

Environment: Node 22.23.2; PostgreSQL 16.15 at `127.0.0.1:55481` (user `cvg_prod`, trust); disposable database `lane19_r3_7444`; port 5432 never touched.

## Acceptance / evidence mapping

- Each acceptance item will be recorded in `manifest.json` with the command, exit code and log path; per-file sha256 of changed sources; limitations and skips listed.
- Status will be `IMPLEMENTED` (behavior already present, verified with new discriminating tests) or `NO_PRODUCT_CHANGE_REQUIRED`; a product fix is made only if a new test demonstrates a gap.
- I am the builder: this is not a VERIFIED claim; independent review follows.
