# Runtime V2 Architecture

## Position in the system

```
Client → HTTP (Phase 2) → durable execution + queue (Phase 2)
       → Worker claim/lease/heartbeat (Phase 2)
       → createOperationalHarness (public composition root)
            ├── RuntimeRegistry
            │     ├── single_pass → SinglePassGovernedRuntime (V1)
            │     └── iterative   → IterativeGovernedRuntime (V2)
            └── ports: model gateway, policy, approvals, tools,
                       knowledge, audit, telemetry, step store
       → persistence (Phase 2 + Phase 3 step/checkpoint authority)
```

Runtime V2 is placed **over** the Phase 2 durable spine. It does not claim
jobs, does not touch SQL directly, and does not bypass the effect journal.

## Loop lifecycle

```
LOAD (checkpoint | initial state)
  → BUILD_CONTEXT (ContextEngine)
  → DECIDE (IterativeOrchestrator; deterministic rules first)
  → VALIDATE (schema → semantic → capability)
  → GOVERN (budget, loop detection, policy, approval)
  → ACT (tool | knowledge | verify | replan | respond | pause | handoff | stop)
  → OBSERVE (structured Observation with provenance)
  → CHECKPOINT (bounded state + budget usage + digest)
  → EVALUATE (CompletionEvaluator + SufficiencyEvaluator)
  → CONTINUE / PAUSE / STOP
```

## Component responsibilities

| Component            | Responsibility                                          | Owns state | Calls model            | Executes tool  | Authorizes              | Durable                |
| -------------------- | ------------------------------------------------------- | ---------- | ---------------------- | -------------- | ----------------------- | ---------------------- |
| HTTP/API             | accept submissions, resolve approvals/input, trajectory | no         | no                     | no             | no (authenticates only) | Phase 2 tables         |
| Worker               | claim, lease, invoke harness, persist lifecycle         | lease      | no                     | no             | no                      | yes                    |
| Runtime V2           | loop, step ledger, checkpoints, budgets, stop           | loop state | no (delegates)         | no (delegates) | no                      | yes (step store)       |
| Hybrid Orchestrator  | select next step                                        | stateless  | yes (decision support) | no             | no                      | version pinned         |
| Context Engine       | assemble per-step semantics                             | stateless  | no                     | no             | no                      | no                     |
| Policy Engine        | authorize tool execution                                | no         | no                     | no             | yes                     | Phase 2                |
| Approval Engine      | human gate                                              | no         | no                     | no             | human                   | Phase 2 durable        |
| Tool Registry        | execute capabilities                                    | no         | no                     | yes            | no                      | Phase 2 effect journal |
| Knowledge Provider   | evidence retrieval                                      | no         | no                     | no             | no                      | synthetic (Phase 3)    |
| Completion Evaluator | decide sufficiency/completion                           | no         | optional               | no             | no                      | result persisted       |
| Persistence          | remember                                                | yes        | no                     | no             | no                      | yes                    |
| Audit / Telemetry    | prove / observe                                         | no         | no                     | no             | no                      | Phase 2 sinks          |

## Explicit prohibitions

- Worker never orchestrates (`worker does not orchestrate`).
- Runtime never claims jobs and never persists SQL directly.
- Orchestrator never persists and never authorizes.
- Model never receives DB access or tool execution authority.
- Evaluator never executes tools.
- Context engine never authorizes.
- Approvals can never be bypassed by a model decision.

## Sequence (real trajectory)

```
Client → POST /v1/executions
  → execution RECEIVED/QUEUED + outbox
  → Worker claimNext + lease
  → POST state RUNNING
  → harness.execute({ runtimeProfile: 'iterative' })
    → step 1 CALL_TOOL  → policy ALLOW → effect journal RESERVE→STARTED→CONFIRMED
    → checkpoint (step 1)
    → step 2 REPLAN     (observation: unavailable)
    → checkpoint (step 2)
    → step 3 CALL_TOOL  → effect journal
    → step 4 VERIFY     (tool-result)
    → step 5 RESPOND    → completion COMPLETE
    → final checkpoint + audit runtime.completed + telemetry
  → transition SUCCEEDED with RuntimeResult
Client → GET /v1/executions/:id | GET /v1/executions/:id/trajectory
```

## C4/C5 certification mapping

- C0 contracts → `packages/contracts/src/execution-v2.ts`
- C1 single-process loop → `iterative-runtime.test.ts`
- C2 durable multi-step integration → `operational-harness-iterative.test.ts`
- C3 process restart/checkpoint → `operational-harness-iterative-postgres.integration.test.ts` (fresh pool restart)
- C4 adversarial/budget/policy proof → loop evals + governance tests
- C5 certified synthetic hybrid loop → this phase's evidence bundle + critic
