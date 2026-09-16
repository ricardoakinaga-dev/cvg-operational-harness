# Stop Model

## Stop taxonomy

| Stop reason                                                      | Authority                 | Meaning                                                                                                                                                          |
| ---------------------------------------------------------------- | ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMPLETED`                                                      | evaluator + runtime       | A RESPOND step was accepted and completion is grounded.                                                                                                          |
| `NEEDS_USER_INPUT`                                               | orchestrator + runtime    | A question is pending; execution is durable.                                                                                                                     |
| `APPROVAL_REQUIRED`                                              | policy/approval + runtime | A human approval is pending; execution is durable.                                                                                                               |
| `HUMAN_TAKEOVER`                                                 | policy/orchestrator       | Handoff outcome, no channel implemented.                                                                                                                         |
| `POLICY_DENIED`                                                  | policy/approval           | Zero unauthorized effect.                                                                                                                                        |
| `INSUFFICIENT_EVIDENCE`                                          | evaluator                 | The agent tried to finalize without sufficient evidence.                                                                                                         |
| `MAX_STEPS`                                                      | runtime                   | Step budget exhausted.                                                                                                                                           |
| `MAX_MODEL_CALLS` / `MAX_TOKENS` / `MAX_COST`                    | runtime                   | Model budget exhausted.                                                                                                                                          |
| `MAX_TOOL_CALLS`                                                 | runtime                   | Tool budget exhausted before an effect.                                                                                                                          |
| `MAX_KNOWLEDGE_CALLS` / `MAX_REPLANS` / `MAX_VERIFICATION_CALLS` | runtime                   | Optional budgets exhausted.                                                                                                                                      |
| `MAX_DURATION`                                                   | runtime                   | Active-duration budget exhausted.                                                                                                                                |
| `VERIFICATION_FAILED`                                            | runtime                   | Verification failed terminally (e.g. false success).                                                                                                             |
| `LOOP_DETECTED`                                                  | runtime                   | Repeated/alternating decisions stopped before another effect (non-idempotent tools stop before a second invocation; alternation cycles are detected on closure). |
| `TOOL_FAILURE`                                                   | tool adapter              | Includes `unknown_effect:` (terminal reconciliation).                                                                                                            |
| `MODEL_FAILURE` / `INTERNAL_FAILURE`                             | runtime                   | Technical retryable.                                                                                                                                             |
| `STATE_CONFLICT`                                                 | runtime                   | Integrity/version/binding violation, fails closed.                                                                                                               |
| `UNSAFE_REQUEST`                                                 | runtime                   | Invalid identity/budget/envelope.                                                                                                                                |
| `CANCELLED`                                                      | operator/store            | Cancellation between attempts; no new effect.                                                                                                                    |

## Stop authority

- The runtime has final authority to stop for budget, deadline, safety,
  integrity and repeated-decision reasons.
- The orchestrator may propose stop; the runtime validates it and the
  completion evaluator must accept before `COMPLETED`.
- `COMPLETED` never means "the model stopped talking".
- A finalizing decision (`RESPOND`/`STOP`) with incomplete evidence stops with
  `INSUFFICIENT_EVIDENCE` instead of completing.

## Pause versus stop

`NEEDS_USER_INPUT` and `APPROVAL_REQUIRED` are pauses: the worker records
`WAITING_USER`/`WAITING_APPROVAL`, ends the attempt, and a durable
`provideUserInput`/`resolveApproval` re-queues the same execution.

## Budget stops and audit

A budget stop grants a bounded 200 ms audit grace so the deterministic stop
reason survives; if even that grace fails, the budget stop reason is retained
and the audit failure is a telemetry event. Non-budget stops still downgrade
to `INSUFFICIENT_EVIDENCE` when the final audit cannot be recorded.
