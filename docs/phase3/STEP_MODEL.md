# Step Model

## Definitions

- **Execution**: the durable task (Phase 2 identity, queue, lease, result).
- **Step**: one cognitive iteration inside the execution, numbered
  sequentially from 1.

Steps are sequential in Phase 3. Step `N+1` cannot settle before step `N`
settles; the step store enforces this ordering for both adapters.

## Step types

| Type         | Meaning                                                            |
| ------------ | ------------------------------------------------------------------ |
| `MODEL`      | Pure reasoning/planning step (e.g. REPLAN).                        |
| `TOOL`       | A tool invocation governed by policy/approval/effect journal.      |
| `KNOWLEDGE`  | A knowledge search step (synthetic provider).                      |
| `POLICY`     | A policy outcome that terminates a tool path (denial/loop).        |
| `APPROVAL`   | An approval outcome recorded on the tool path.                     |
| `USER_INPUT` | A clarification pause awaiting durable user input.                 |
| `VERIFY`     | Explicit verification of tool result / evidence / response claims. |
| `RESPOND`    | Final response composition.                                        |
| `HANDOFF`    | Human takeover outcome.                                            |
| `STOP`       | Explicit stop decision.                                            |

`THINK` is intentionally absent: the orchestrator decision is recorded on the
step that acts on it (`decisionType`), so no empty reasoning step is persisted.

## Statuses and transitions

```
PENDING → RUNNING → SUCCEEDED
              ├──→ FAILED → RUNNING   (technical retry of the same step)
              └──→ WAITING → RUNNING  (pause resumed: approval/user input)
PENDING → SKIPPED
```

`SUCCEEDED` and `SKIPPED` are terminal. `FAILED → RUNNING` exists only for a
retry of the same step; the effect journal still fences duplicate effects.

## Identity and content

`ExecutionStep` carries: `stepId`, `executionId`, `tenantId`, `stepNumber`,
`stepType`, `status`, `attempt`, `sideEffecting`, `startedAt`, `completedAt`,
`decisionType`, `reasonCode`, `observationRefs`, `errorCode`, `stopReason`.

Step rows never contain hidden reasoning, model prose, or raw payloads.
Observations carry bounded payloads and live in the checkpoint/state; step
rows reference them by id.

## Step numbering semantics

- One step number per cognitive iteration, independent of how many store rows
  are written for it (start/complete updates share the number).
- Pauses consume their step number (the loop resumes at the following
  number), except an approval pause, which keeps the in-flight step number so
  the same governed tool step completes after approval.
- Budget `maxSteps` counts completed, failed and waiting steps, not internal
  plumbing.
