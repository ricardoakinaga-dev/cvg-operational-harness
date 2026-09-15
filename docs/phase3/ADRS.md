# Phase 3 ADRs

## ADR-01 — Runtime V2 iterative loop

- Status: accepted.
- Context: Runtime V1 is single-pass; Phase 3 requires multiple governed
  steps inside one durable execution.
- Decision: add `IterativeGovernedRuntime` over the Phase 2 spine, selected by
  `runtimeProfile`, without rewriting durability, queueing, leasing, effect
  journal, approvals or tenant isolation.
- Consequences: cognition is additive; V1 remains available; both runtimes
  compose through `createOperationalHarness`.

## ADR-02 — Hybrid Orchestrator

- Status: accepted.
- Context: the next step sometimes needs semantics, sometimes is fully
  determined by state.
- Decision: deterministic rules first, bounded model decision support second;
  the model returns a typed `LoopDecision` and never controls the loop.
- Consequences: lower cost/latency for structural cases, no model sovereignty,
  deterministic tests via scripted orchestrators.

## ADR-03 — Execution vs Step

- Status: accepted.
- Context: budget, pause/resume and audit need a unit smaller than the
  execution and larger than a function call.
- Decision: `ExecutionStep` is the canonical loop unit, sequential by
  `step_number`, persisted in `operational_execution_steps`, with status
  transitions and a side-effecting flag.
- Consequences: budget semantics are explicit; step ordering is enforceable;
  audit can correlate Execution → Step → Tool → Effect.

## ADR-04 — Checkpoint strategy

- Status: accepted.
- Context: process death must not lose or duplicate the loop.
- Decision: persist a bounded structured checkpoint after each significant
  step, and persist the in-flight decision before a side-effecting step; the
  effect journal fences duplicate effects on replay.
- Consequences: no conversation replay, no hidden reasoning storage, bounded
  checkpoint size, crash-safe ordering.

## ADR-05 — Completion evaluation

- Status: accepted.
- Context: `COMPLETED` must not mean "the model wanted to stop".
- Decision: `CompletionEvaluator` with `DETERMINISTIC`, `EVIDENCE_BASED` and
  `HYBRID` strategies; completion requires an explicit RESPOND and grounded
  evidence where configured; model judgement is optional and budgeted.
- Consequences: false-success and insufficient-evidence answers are refused;
  operational completion is deterministic.

## ADR-06 — Context Engine

- Status: accepted.
- Context: prompt construction and state are different concerns.
- Decision: a dedicated `ContextEngine` assembles prioritized, trustedness-
  tagged, provenance-carrying items with a token budget; mandatory governance
  items are never trimmed.
- Consequences: prompt rendering is deferred, poisoning is structurally
  limited, context growth is bounded.

## ADR-07 — Semantic vs technical retry

- Status: accepted.
- Context: Phase 2 solved infrastructure retry; Phase 3 needs "the tool
  worked but the result is insufficient" handling.
- Decision: technical retry remains execution-level (`FAILED_RETRYABLE`);
  semantic retry is a new step (REPLAN/SEARCH) triggered by an evaluation, and
  never re-executes a completed effect.
- Consequences: replans are counted and budgeted; semantic insufficiency
  cannot silently loop forever.

## ADR-08 — Loop detection

- Status: accepted.
- Context: a model can repeat an identical action indefinitely.
- Decision: hash the decision type + capability + normalized arguments into a
  loop signature; keep a bounded ring; stop `LOOP_DETECTED` at the configured
  threshold before executing another effect.
- Consequences: duplicate effects are prevented deterministically; the hash
  contains no sensitive payload, only a digest.

## ADR-09 — Runtime version pinning

- Status: accepted.
- Context: an execution paused under one runtime semantic must not silently
  resume under incompatible semantics.
- Decision: checkpoints persist `checkpointVersion`, `runtimeProfile`,
  `runtimeVersion` and `orchestratorVersion`; a mismatch fails closed with
  `STATE_CONFLICT`. Upgrade policy is manual: finish/cancel under the pinned
  version, or migrate explicitly.
- Consequences: safe hot deployment behavior is documented but not automated;
  no silent semantic drift.

## ADR-10 — Step/checkpoint persistence in PostgreSQL

- Status: accepted.
- Context: durability must survive process and connection loss.
- Decision: `PostgresExecutionStepStore` with additive migration 0019, RLS,
  ordering guard and digest validation.
- Consequences: worker stays neutral; cross-tenant isolation is inherited from
  Phase 2 discipline; rollback is non-destructive to Phase 2.
