# Phase 3 — Technical specification

## Execution model

An Execution is the durable unit owned by the Phase 2 spine. A Step is one
cognitive iteration inside an Execution. Runtime V2 loads a bounded
`AgentLoopState` from a durable checkpoint, iterates
`BUILD_CONTEXT → DECIDE → GOVERN → ACT → OBSERVE → EVALUATE → CHECKPOINT`,
and stops deterministically.

## Contracts (neutral, `@cvg/harness-contracts`)

- `RuntimeProfile = 'single_pass' | 'iterative'` selected per execution
  (`RuntimeInput.runtimeProfile`), resolved by the harness registry.
- `ExecutionStep` with canonical identity, type, status, attempt,
  side-effecting flag, decision type and observation references.
- `Observation` with source, trust (`TRUSTED`/`UNTRUSTED`) and provenance.
- `LoopDecision` with 9 decision types and 13 reason codes; validated by
  `validateLoopDecision` and sanitized by `sanitizeLoopDecision`.
- `AgentLoopState` (structured cognitive state; no chain-of-thought),
  `ExecutionCheckpoint` and `CheckpointVersion=1`.
- `IterativeOrchestrator` returning `{ decision, usage? }`.
- `CompletionEvaluator`, `SufficiencyEvaluator`, evidence references and
  `QuestionRequest`.
- `ContextEngine` and `StepContext` with priority/trust/provenance items.
- `ExecutionTrajectory` (safe, payload-free export).

## Authority split

`LLM proposes → orchestrator selects → policy authorizes → approval
human-gates → runtime enforces → tool executes → persistence remembers →
audit proves → telemetry observes.`

## Runtime V2 invariants

1. A decision must pass schema, semantic and capability validation before any
   effect; invalid decisions produce zero effect.
2. Tool selection is limited to the catalog exposed to the agent profile.
3. Budgets (`maxSteps`, `maxModelCalls`, `maxToolCalls`, `maxDurationMs`,
   `maxCostUsd`, `maxTokens`, optional knowledge/replan/verification/repair)
   are enforced by the runtime, persisted across restarts, and never reset.
4. Active duration excludes paused wall-clock time.
5. Side-effecting steps persist their decision before the effect and their
   observation after it; the Phase 2 effect journal fences duplicates.
6. A terminal execution cannot resume or execute a new step.
7. Checkpoints are bound to tenant, execution, runtime version and digest;
   mismatches fail closed.
8. Observations from tools/knowledge/user/model are UNTRUSTED data and never
   modify governance.
9. Loop signatures (hashed decision material) stop repeated identical
   decisions before another effect; a non-idempotent tool stops before a
   second identical invocation and alternating cycles are detected on
   closure.
10. Completion requires an explicit RESPOND and a completion evaluation, not
    a model's opinion.

## Persistence

Migration `0019_iterative_execution_steps` adds `operational_execution_steps`,
`operational_execution_checkpoints`, the `operational_executions.resume`
binding, RLS policies and revokes. Phase 2 tables/contracts are unchanged and
Runtime V1 ignores the new tables.
