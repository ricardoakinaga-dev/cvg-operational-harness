# Phase 2 AAA-21 — Technical specification

## Canonical ownership

The neutral `packages/harness` execution-spine contract owns request identity,
state transitions, claim fencing, outcome classification, and the public
worker-to-harness boundary. Adapters own storage only. The Secretary
inbound/outbox/runtime path is explicitly legacy and is not imported by the
neutral worker.

## State machine

`RECEIVED -> QUEUED -> CLAIMED -> RUNNING -> SUCCEEDED`

`RUNNING -> WAITING_APPROVAL | WAITING_USER | FAILED_RETRYABLE |
FAILED_TERMINAL | CANCELLED`

`WAITING_APPROVAL | WAITING_USER -> QUEUED` is permitted only through an
explicit resume operation. `FAILED_RETRYABLE -> QUEUED` is permitted by the
retry/recovery operation. Terminal states have no outgoing transition.

## Storage contract

The repository persists an execution row and queue/outbox row in one logical
submission transaction, enforces `(tenant_id, idempotency_key)`, records
append-only execution events, and uses a lease owner plus lease expiry for
worker fencing. The in-memory adapter is intentionally process-local. The
PostgreSQL adapter uses `operational_executions` and
`operational_execution_outbox` with tenant RLS when the existing migration
bootstrap enables tenant isolation.

An approval pause is valid only with a non-null durable `approval_id`. The
approval authority stores the execution reference and immutable action/payload
binding; migration `0017_runtime_approval_execution_binding` adds the
execution-to-approval foreign key, approval-event linkage, and one approval per
tenant/execution/operation binding. The authenticated decision route is
idempotent at the state-machine boundary; command retries never requeue a
non-waiting execution. If a process ends after durable approval creation but
before the separate `REQUESTED -> PENDING` submission, the decision boundary
completes that pending transition before applying the human decision; a
missing execution reference is rejected by the operational adapter.

## Worker contract

The worker claims one execution, transitions it to `RUNNING`, builds the
neutral `RuntimeInput`, and invokes `createOperationalHarness(options).execute`.
The source-level wiring test must fail if the worker imports or calls the
legacy `createGovernedRuntimeComposition` path.

## Failure and effect semantics

Runtime stop reasons are classified into paused, retryable, terminal, or
success outcomes. A synthetic side effect is protected by an operation key and
an effect journal. If a crash is injected after the effect starts and before
confirmation, the approval and effect records are `UNCERTAIN` and are never
silently replayed. Approval-required work is reserved and marked `EXECUTING`
before the tool, then confirmed only after the tool/effect journal outcome.

## R2 repair contract

The execution store applies a bounded retry policy. `maxAttempts` is an
adapter option with a safe default of `3`; the attempt counter increments at
claim time. A retryable transition at or beyond that bound is converted
atomically to `FAILED_TERMINAL`, records `retry_exhausted`, and marks the
paired outbox item `dead_letter`. Retry scheduling remains deterministic in
the controlled harness; provider circuit breaking is deferred to a future
integration phase.

Cancellation is exposed as `POST /v1/executions/:executionId/cancel` and an
equivalent store command. It requires the authenticated operator's tenant
scope and mutation permission. `RECEIVED`, `QUEUED`, `WAITING_APPROVAL`,
`WAITING_USER`, and `FAILED_RETRYABLE` can be cancelled with a durable
`CANCELLED` event. `CLAIMED` and `RUNNING` reject cancellation with a conflict:
the worker may already be inside a non-cancellable effect boundary. The
command is idempotent for an already-cancelled execution and never resumes a
terminal execution.

The neutral worker has a default concurrency of one and accepts an explicit
controlled concurrency setting. Its stop boundary prevents new claims, waits
for active executions, and then closes the pool. A runtime outcome is
published only while the worker still owns the lease; a lost lease is
fail-closed and cannot publish a stale terminal result.

Both adapters enforce the same application invariants: `SUCCEEDED` requires a
result and no failure; failed/cancelled terminal or retryable states require a
failure; `WAITING_APPROVAL` requires an approval id; active states require a
live lease; and completed timestamps exist only on terminal states. Migration
`0018_operational_execution_invariants` adds the corresponding PostgreSQL
checks. Timestamp ordering and cross-table causal ordering remain verified by
the transaction tests.

The operational PostgreSQL worker uses the same least-privilege preflight
contract as the legacy controlled worker, but with the neutral critical-table
set (`runtime_approvals`, `operational_executions`,
`operational_execution_outbox`, `operational_execution_events`, and
`operational_effect_journal`). It does not claim `durable: true` merely because
`DATABASE_URL` is present. Every execution/queue update that is part of a
claim, transition, recovery, or cancellation transaction must affect exactly
one paired row or fail closed. Active transitions require the worker id and
attempt fence token. The disposable PostgreSQL 15 role suite exercises this
preflight and the real operational worker path; process restart and
fault-injected concurrency remain outside the D3 claim.

Approval decision and execution resume remain separate adapter transactions in
this controlled slice; the API is a retry-safe reconciliation boundary, not a
claim of cross-repository atomicity. A future migration may colocate command
idempotency with both authorities once the repository ownership boundary is
approved.

## R3 durability proof contract

The operational worker exposes a test-only fault boundary owned by the worker
composition, not by PostgreSQL or production configuration. The only enabled
R3 point is `AFTER_CLAIM`, and it is accepted only when
`NODE_ENV !== production` and `CVG_WORKER_CONTROLLED_MODE=true`; unknown or
production fault settings fail closed. The hook terminates the child process
after the claim transaction commits and before Runtime V1/effect execution.

The R3 process proof starts a worker child with a unique `CVG_WORKER_ID`,
submits one synthetic execution to an isolated schema, observes the claimed
lease, and verifies that the child exits by the injected fault without a
terminal result. After the lease expires, a new child with a distinct worker
identity starts from the same PostgreSQL schema, recovers the stale queue row,
executes through `createOperationalHarness`, and persists exactly one terminal
success plus the recovery/claim events. The proof is classified
`PROCESS_RESTART_PROOF`, not simulated restart.

The R3 concurrency proof starts at least two real worker children against the
same tenant/schema while one child is fault-injected after claim. `SKIP
LOCKED`, lease expiry, attempt fencing, and terminal transition evidence must
show one semantic execution, one synthetic effect-journal authority, no stale
worker terminal write, and no lost queue item. The test may use only the
deterministic empty-tool harness; it cannot certify an external exactly-once
provider.

R3 evidence upgrades the defensible durability level to D4 when the process
restart proof passes. D5 is claimed only when the competing-worker fault proof
also passes; otherwise the result remains D4 or lower with the missing gate
named explicitly.

## R4 controlled vertical-effect contract

The operational worker retains an effect-free default composition. A separate
synthetic fixture may be enabled only when `NODE_ENV !== production` and
`CVG_WORKER_CONTROLLED_MODE=true`; the worker rejects the fixture flag in every
other mode. The fixture exposes exactly one versioned low-risk write tool,
`synthetic.phase2-effect`, whose executor returns a deterministic payload and
performs no network, channel, product, clinical, financial, or external
mutation. The `SinglePassOrchestrator` selects it only from the persisted
`RuntimeInput.requestedTool` and the public `createOperationalHarness` factory
remains the only runtime composition boundary.

When the worker has an effect journal, it wraps the fixture registry with
`createJournaledToolRegistry`. The normal path therefore persists
`RESERVED → EFFECT_STARTED → CONFIRMED` in the configured journal and returns
the confirmed result. A duplicate submission or replay with the same tenant,
operation key, and proposal must reuse the durable record and must not call the
synthetic executor a second time. An uncertain journal state remains a
fail-closed outcome requiring reconciliation; R4 does not convert that state
into an automatic retry.

The R4 vertical proof may use an in-memory API/worker for the bounded demo and
an isolated PostgreSQL schema for durable evidence. It must assert the raw
execution, queue, event, effect, audit, telemetry, and status surfaces, and
must report environment-blocked PostgreSQL separately from implementation
failure. `demo:phase2` and `verify:phase2` are controlled verification
commands, not deployment or production-readiness commands.
