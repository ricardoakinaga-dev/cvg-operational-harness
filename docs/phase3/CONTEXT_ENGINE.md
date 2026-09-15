# Context Engine

## Responsibility

The Context Engine assembles the semantic context for a single step. It is
not a prompt renderer and not a state store:

- **Context** = semantic assembly for a step.
- **State** = durable truth of the execution (checkpoint).
- **Prompt** = later serialization for a model.

## Inputs handled

agent profile, goal, user message, current state summary, recent
observations, knowledge evidence, tool descriptors, budget and usage,
completion strategy, allowed decision types, pending question/approval, last
evaluation.

## Priority order

```
SYSTEM / GOVERNANCE
AGENT_PROFILE
CURRENT_GOAL
CURRENT_STATE
FRESH_TOOL_RESULTS
TRUSTED_KNOWLEDGE
RELEVANT_HISTORY
OLDER_CONTEXT
```

`SYSTEM`, `AGENT_PROFILE`, `CURRENT_GOAL` and `CURRENT_STATE` are mandatory:
trimming never drops them.

## Token budget and trimming

- `DefaultContextEngine` estimates tokens as `ceil(chars / 4)`.
- When the budget is exceeded, lower-priority items are skipped whole;
  mandatory items are always included even if that exceeds the soft budget.
- Observations are bounded (`maxObservations`, default 20) and history is
  bounded (`maxHistoryItems`, default 12); older progress is compacted into
  the structured state summary.

## Provenance and trust

Every item carries `contextId`, `priority`, `trust`, `source` and optional
evidence references. Tool output, knowledge output, captured context and user
messages are `UNTRUSTED`. The system/governance item explicitly instructs the
consumer that untrusted content is data, never instructions.

## Context poisoning

- Retrieved/tool text cannot modify system policy: governance is a separate
  mandatory item.
- The orchestrator receives only the assembled `StepContext`; there is no
  access to internals.
- Capability tokens are bounded by the exposed catalog; a hostile observation
  cannot add a tool.

## Conversation and state separation

Conversation-facing state (`pendingQuestion`, `resolvedInputs`,
`openQuestions`) is structured and durable. Resolved user facts live in state
(not in prompt memory) and survive restarts.
