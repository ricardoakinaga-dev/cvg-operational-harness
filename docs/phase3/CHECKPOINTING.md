# Checkpointing

## Purpose

A process death must not lose the loop. After every significant step the
runtime persists a bounded checkpoint sufficient to continue without replaying
the conversation or re-generating decisions for completed steps.

## Content

`ExecutionCheckpoint` (version `1`):

- identity: `checkpointId`, `executionId`, `tenantId`
- versions: `checkpointVersion`, `runtimeProfile`, `runtimeVersion`,
  `orchestratorVersion`
- progress: `stepNumber`
- `state`: `AgentLoopState` (goal, step number, bounded observations, open
  questions, pending question/approval/decision, selected capability, resolved
  inputs, loop signatures, stop reason, last evaluation)
- `budgetUsage`: steps, model calls, tool calls, knowledge calls, verification
  calls, replans, decision repairs, tokens, cost, active duration
- `digest`: SHA-256 over the canonical (sorted-key) checkpoint payload
- `createdAt`

No hidden reasoning, no model prose, no unbounded history.

## Ordering for crash safety

For a side-effecting tool step:

```
1. persist checkpoint WITH pendingDecision + pendingStepNumber
2. record step RUNNING
3. execute tool (effect journal RESERVE → STARTED)
4. record observation + step SUCCEEDED/FAILED
5. checkpoint again (pending cleared)
```

- Crash between 1 and 3: the decision is reused, the tool runs once.
- Crash between 3 and 5: the effect journal replay returns the CONFIRMED
  result (or UNCERTAIN, which fails closed).
- Crash between steps: the checkpoint's `stepNumber` skips completed work.

## Integrity

- Writes validate tenant/execution binding, version and digest before insert.
- Reads recompute the digest and reject tampering.
- Unsupported `checkpointVersion` or a runtime version mismatch fails closed
  with `STATE_CONFLICT`; a checkpoint is never silently resumed under
  incompatible semantics.
- Runtime/orchestrator versions are pinned per execution.

## Durability adapters

- `InMemoryExecutionStepStore`: controlled tests and in-memory demos.
- `PostgresExecutionStepStore`: migration `0019`, tenant-scoped via
  `withTenantContext`, `FORCE ROW LEVEL SECURITY`, sequential ordering guard.

## Budget across restart

`budgetUsage` is restored from the checkpoint, including replan and
verification counters. Restarts do not reset steps, model calls, tool calls,
cost, replans or verification calls. Paused wall-clock time is excluded from
`activeDurationMs`; duration enforcement uses active time only.

## Migration/rollback

The step/checkpoint tables are additive. Runtime V1 ignores them; dropping
them is safe for V1 executions. See `MIGRATION_REPORT.md`.
