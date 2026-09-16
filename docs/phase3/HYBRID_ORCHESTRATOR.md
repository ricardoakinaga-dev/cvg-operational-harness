# Hybrid Orchestrator

## Why hybrid

`HybridOrchestrator` combines deterministic control with probabilistic
decision support:

- **Deterministic (runtime-owned):** budgets, allowed decision types, state
  transitions, policy, approvals, tool availability, stop enforcement,
  security, loop detection.
- **Probabilistic (orchestrator):** interpretation, choosing among allowed
  options, planning, query formulation, response intent, sufficiency judgement.

The model never controls the loop: it returns a structured `LoopDecision`,
never `continue = true`.

## Decision contract

`LoopDecision`:

- `decisionType`: `RESPOND | CALL_TOOL | SEARCH_KNOWLEDGE | ASK_USER |
REQUEST_APPROVAL | VERIFY | REPLAN | HANDOFF | STOP`
- `reasonCode`: `MISSING_INFORMATION | EVIDENCE_INCOMPLETE | TOOL_REQUIRED |
ACTION_CONFIRMED | POLICY_REQUIRED | GOAL_SATISFIED | USER_REQUESTED_STOP |
BUDGET_EXHAUSTED | STRATEGY_CHANGED | VERIFICATION_FAILED |
HANDOFF_REQUIRED | LOOP_SUSPECTED | CAPABILITY_UNAVAILABLE`
- optional capability/query/response/verification fields.

## Validation pipeline

```
model text → parse JSON → schema validate → sanitize (drop unknown fields)
          → runtime semantic/capability validation → govern (budget/loop)
          → policy/approval → act
```

- Invalid output can never become a tool execution.
- Controlled repair: at most `maxDecisionRepairs` (decision default 1) repair
  round-trips inside the orchestrator plus the same cap when the runtime
  re-asks with errors.
- Injected authority fields (`policyDecision`, `budgetOverride`, …) are
  stripped by `sanitizeLoopDecision`.

## Rules first

`HybridOrchestrator` accepts deterministic rules executed before any model
call. The runtime itself also resolves structural cases without a model:
pending question re-pause, budget exhaustion, loop detection, invalid
capability, terminal outcomes, and pending approval state.

## Profiles

- `orchestratorProfile` is represented by the `decisionModel` port; provider
  choice is never hardcoded.
- `responseProfile` is represented by the runtime's response composition call
  (`purpose: 'RESPONSE'`), separate from orchestration.
- Evaluation is a separate optional judge (`purpose: 'EVALUATION'`), reported
  with usage.

## Deterministic testing

`ScriptedOrchestrator` and `StaticOrchestrator` make trajectories
deterministic. `ScriptedModelGateway` provides deterministic
orchestrator/response output. Core correctness never depends on a live model;
an optional real-model smoke is non-certifying.
