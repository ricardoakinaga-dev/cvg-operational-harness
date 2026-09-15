# Phase 2 Invariant Report (Runtime V2 impact)

Phase 3 was placed over the Phase 2 durable spine. This report enumerates the
Phase 2 invariants and how Runtime V2 preserves them.

| Invariant | Preservation mechanism | Evidence |
| --- | --- | --- |
| HTTP ingestion persists and enqueues without inline execution | HTTP/API and outbox untouched; iterative executions use the same submit path | `apps/api/src/__tests__/execution-spine.test.ts`; P3-WORKER-001 |
| Durable state machine with legal transitions only | `EXECUTION_STATES` unchanged; `validateExecutionTransitionPayload` extended, not weakened | `packages/harness/src/__tests__/execution-spine.test.ts`; full regression |
| Queue claim/lease/heartbeat/fencing | Worker unchanged; V2 loops run inside the leased attempt with heartbeat active | `operational-harness-worker.test.ts`; P3-WORKER-* |
| Exactly one effect per operation key | `createJournaledToolRegistry` wraps the tool executor for V2 as before; V2 derives a deterministic operation key `${executionId}:s${step}:${toolId}` | effect journal tests; P3-PAUSE-002; P3-CRASH-002 |
| Unknown effect fails closed | `unknown_effect:` results are classified `UNKNOWN_EFFECT`/terminal and never auto-retried | V1/V2 tool path tests |
| Durable approval pause/resume + fencing | V2 uses the same `ApprovalEngine`/`ApprovalExecutionPort`; approval identity is re-validated against the checkpoint binding | P3-PAUSE-002, P3-WORKER-004 |
| Audit durability | V2 emits per-step and terminal audit events through the same buffered sink | `iterative-runtime.test.ts` audit assertions |
| Tenant isolation | No table or adapter bypass; new tables use RLS with the same tenant context helper | P3-TENANT-001 (disposable PostgreSQL) |
| Safe cancellation between attempts | Cancel semantics unchanged (active RUNNING cancel is a conflict, as in Phase 2) | Phase 2 cancel tests; full regression |
| Terminal finality | V2 rejects a terminal checkpoint and cannot write a step after terminal state | P3-CHECKPOINT-004 |
| Bounded retry/backoff/dead-letter | Worker retry semantics unchanged; V2 returns retryable stop reasons (`MODEL_FAILURE`, `INTERNAL_FAILURE`, `TOOL_FAILURE`) | `classifyRuntimeResult` regression |
| No production path | Worker factory rejects `NODE_ENV=production`; V2 is opt-in and production remains `NO_GO` | `operational-harness-worker.test.ts`; P3-COMPAT-002 |

## Changes made to shared Phase 2 code (additive)

1. `STOP_REASONS` extended with Phase 3 reasons; `classifyRuntimeResult`
   handles them (new reasons map to bounded/semantic terminal states).
2. `ExecutionBudget` gained optional iterative budgets.
3. `RuntimeInput` gained optional `runtimeProfile` and `resume`;
   `parseExecutionSubmission` strips both from public bodies.
4. `ExecutionRecord`/`ExecutionView` gained `resume`; `provideUserInput` added
   to the store port, in-memory adapter and PostgreSQL adapter.
5. `ModelRequest` gained optional `purpose`; `TelemetryEvent` gained bounded
   `attributes`.
6. Migration list and worker preflight extended with `0019` and the two new
   tables.

No Phase 2 behaviour was removed or weakened; the full Phase 2 PostgreSQL
catalog still passes (24 files / 190 tests within the 26-file catalog) and the full
regression increased from Phase 2's 1,727 to 1,785 passing tests with no new
failures.
