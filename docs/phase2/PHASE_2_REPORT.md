# Phase 2 — Durable Execution Spine & Canonical Runtime Composition

Candidate: `AAA-21-PHASE2-DURABLE-EXECUTION-SPINE`  
Repair: `AAA-21-R4` (R1/R2/R3 implementation retained)  
Captured: 2026-09-14, `America/Sao_Paulo`  
Controlled verdict: `CONDITIONAL_PASS`; final R4 critic window returned no
report within its bounded period  
Production: `NO_GO`  
Maximum defensible durability: `D5` (controlled worker boundary; R4 synthetic
journal fixture; real PostgreSQL)

## Executive summary

Phase 2 now has one neutral execution path:

```text
authenticated HTTP → execution identity + queue → leased worker
→ createOperationalHarness → policy/approval/effect boundary → durable outcome
```

The R3 repair closed the remaining durability gaps in the frozen contract:
bounded retry/dead-letter behavior, safe cancellation, configurable controlled
worker shutdown, application/database invariants, queue row-count guards, and
operational PostgreSQL startup preflight. It also adds a real child-process
fault/restart proof: a child is interrupted after a committed claim and a
distinct child recovers the stale lease and completes the execution.

The R4 repair closes the remaining controlled vertical-path gap. The default
worker remains effect-free, while an explicit non-production controlled flag
adds one versioned no-I/O synthetic tool. A persisted `requestedTool` now
travels through HTTP, the durable queue, the public
`createOperationalHarness` boundary, policy, and the journal; the controlled
memory and PostgreSQL proofs show one `CONFIRMED` row, status visibility, and
idempotent replay without a second synthetic invocation. `demo:phase2` and
`verify:phase2` provide bounded, safety-guarded entry points.

The current candidate passed the focused R4 run (`5 files / 31 tests`), the
full monorepo regression (`250 files / 1,727 passed / 110 skipped`), the worker
smoke, the web E2E suite, and the complete PostgreSQL catalog against a
disposable PostgreSQL 15 instance (`24 files / 190 tests / 0 skips`). The R3
process test adds real child boundaries and stale-lease recovery; the R4
vertical test adds the durable synthetic journal assertion. The final
independent critic window was executed but returned no report within its
bounded period; production remains forbidden.

## Candidate identity

The working tree was already dirty before this repair and contains unrelated
historical changes. `HEAD` alone is not the candidate identity. The
candidate-frozen fingerprint and before/after no-mutation comparison are
captured by the Gauntlet procedure and bound in `CANDIDATE_IDENTITY.json` and
`evidence/FINAL_SENTINEL.json`.

## Canonical execution spine

The states are `RECEIVED`, `QUEUED`, `CLAIMED`, `RUNNING`,
`WAITING_APPROVAL`, `WAITING_USER`, `SUCCEEDED`, `FAILED_RETRYABLE`,
`FAILED_TERMINAL`, and `CANCELLED`. Claims increment the execution attempt,
carry an expiry, and use the attempt as a fence token for heartbeat and active
transitions. Terminal states cannot be resurrected.

`maxAttempts` defaults to `3`. A retryable transition at the bound becomes
`FAILED_TERMINAL` with `retry_exhausted`; the paired queue item becomes
`dead_letter` in the same transaction. The in-memory and PostgreSQL adapters
share the transition-payload validator and reject malformed result, failure,
approval, lease, and timestamp shapes.

## HTTP and identity

`POST /v1/executions` validates the request, binds tenant authority and
idempotency, persists/queues it, and returns `202`. The API does not execute
the runtime inline. `GET /v1/executions/:executionId` is tenant scoped and
omits the stored request from the public view.

`POST /v1/executions/:executionId/cancel` is authenticated, tenant scoped, and
requires a valid idempotency key. It allows only known pre-effect states,
rejects `CLAIMED`/`RUNNING` with a conflict, and is idempotent for an already
cancelled execution. The first cancellation records a durable execution event
and the API safety audit entry.

## Persistence and queue

`0016_operational_execution_spine.sql` and
`0017_runtime_approval_execution_binding.sql` define execution, queue, event,
effect-journal, approval linkage, composite tenant keys, RLS, quarantine
fields, approval foreign keys, and execution-binding uniqueness.
`0018_operational_execution_invariants.sql` adds fail-closed checks for
payload/failure/state/lease/completed-time shapes.

Submission pairs the execution and queue rows transactionally. Claims use
`FOR UPDATE SKIP LOCKED`; claim, transition, recovery, approval resume, and
cancellation all verify the paired queue update affects exactly one row.
The claim query selects the queue execution identifier explicitly, preventing
a lost claim when the adapter is used against PostgreSQL.

## Worker and harness boundary

The neutral worker has default concurrency `1`, accepts bounded controlled
concurrency through `CVG_WORKER_CONCURRENCY`, stops claiming after
`SIGTERM`/`SIGINT`, waits for active work, and closes its pool exactly once.
Terminal results are published only while the worker still owns its lease;
lease loss is fail-closed. The controlled `AFTER_CLAIM` hook is allowlisted,
requires explicit controlled mode, and is unavailable in production; bounded
idle polling lets a second child observe lease recovery.

`OperationalExecutionWorker` invokes the public
`createOperationalHarness(options).execute` boundary. The operational worker
does not require the legacy queue-adapter setting and rejects production.
Its default model, policy, approval, telemetry, and audit ports are
deterministic/synthetic and the tool registry is empty. The only opt-in R4
registry is `synthetic.phase2-effect@v1`, guarded by
`CVG_WORKER_CONTROLLED_MODE=true` and `CVG_WORKER_SYNTHETIC_EFFECT=true`.

## Governance, approval, and effects

Policy is evaluated before every governed effect. Pending approval persists as
`WAITING_APPROVAL` only with a durable approval identifier. The authenticated
decision route is tenant/role scoped, binds the execution and immutable
proposal fields, is retry-safe, and requeues only after durable decision and
binding checks. The worker re-evaluates policy before any effect.

The effect journal states are `RESERVED`, `EFFECT_STARTED`, `CONFIRMED`,
`FAILED`, and `UNCERTAIN`. A confirmed result replays without a second tool
call; an uncertain outcome maps to `unknown_effect` and never silently retries.
This is a synthetic exactly-once boundary, not a claim about an external
provider.

## PostgreSQL proof

The complete `npm run test:postgres` catalog passed against an isolated,
disposable PostgreSQL 15 container: `24 files / 190 tests / 0 skips`.
Evidence includes idempotency, tenant visibility, concurrent claims, retry
exhaustion/dead-lettering, fresh-pool recovery, RLS, and adapter behavior.
The worker role suite also created a non-superuser with only
`SELECT/INSERT/UPDATE` on the five operational critical tables; the neutral
preflight passed and that role submitted and processed an execution through
the real operational worker.

D4/D5 process fault/recovery under the controlled empty-tool boundary pass;
R4 additionally proves a no-I/O synthetic journal confirmation/replay path.
The result still does not establish provider exactly-once behavior or
production readiness.

## Audit and evidence

The exact commands and counts (`250 files / 1,727 passed / 110 skipped`; focused
`5 files / 31 tests`) are in `FINAL_RETEST.md` and
`evidence/AAA-21-R2_REPAIR.md` and
`evidence/AAA-21-R3_PROCESS_RESTART.md`, with the R4 vertical proof in
`evidence/AAA-21-R4_SYNTHETIC_EFFECT.md`. The requirement mapping is in
`REQUIREMENTS_TRACEABILITY.md`; durability claims are in
`DURABILITY_CERTIFICATION.md` and `DURABILITY_PROOF.md`.

The global Prettier check still reports `430` files with existing formatting
drift; the exact R4-touched source/test/document set passes targeted Prettier.
The current Playwright E2E run is green (`6/6`), and no web file was changed
for this backend/persistence slice. The design-director boundary review
therefore records no visual
implementation or visual QA change for this backend/persistence slice.

The independent-critic ledger records the historical attempts and the current
R4 candidate-frozen window. No critic finding is invented when no report is
returned; the matching sentinel proves non-mutation only and the result remains
conditional.

## Safety and non-goals

No real data, patient/clinical/financial/appointment action, provider,
channel, RAG source, external effect, unrestricted production path, legacy
Secretary migration, V2 checkpoint engine, or MCP/multi-agent expansion was
introduced or authorized.
