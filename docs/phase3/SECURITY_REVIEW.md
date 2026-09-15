# Security Review — Phase 3

Scope: iterative governed runtime, hybrid orchestrator, context engine,
evaluators, step/checkpoint persistence and the new HTTP input/trajectory
routes. Controlled local/synthetic only; production remains `NO_GO`.

## Threat model updates

| Threat | Vector | Control | Evidence |
| --- | --- | --- | --- |
| Tool-selection injection | hostile prompt/tool output names a tool | catalog + agent-profile allowlist; capability validation rejects unknown/unauthorized tools with zero effect | P3-GOV-001, `validateDecision` |
| Policy injection via model output | decision carries `policyDecision: ALLOW` | `sanitizeLoopDecision` strips unknown fields; policy runs after and independently | P3-ORCH-005, P3-COMPAT-003 |
| Knowledge poisoning | retrieved text instructs to change policy | knowledge observations are UNTRUSTED; governance is a mandatory separate context item | P3-CONTEXT-001 |
| Context poisoning | tool output contains instructions | same trust split; orchestrator never receives raw internals | P3-CONTEXT-001 |
| Loop exhaustion / cost amplification | orchestrator keeps searching/calling | `maxSteps`, `maxToolCalls`, `maxKnowledgeCalls`, `maxReplans`, `maxModelCalls`, `maxCostUsd`, `maxDurationMs` enforced by the runtime; repeated identical decisions stop with `LOOP_DETECTED`; non-idempotent tools stop before a second effect; alternation cycles stop on closure | P3-BUDGET-001/002/003, P3-LOOP-DETECT-001..005, P3-EVAL-007/009 |
| Approval bypass | model selects a high-risk tool | policy/approval gate is outside the model; `requiresApproval` and `REQUIRE_APPROVAL` both force the durable pause | P3-PAUSE-002, P3-WORKER-004 |
| Step replay attack | duplicate message/event | step store orders by `step_number` and rejects conflicting writes; effect journal fences duplicate effects by operation key | P3-CHECKPOINT-006, effect journal tests |
| Checkpoint tampering | modified digest/tenant/version | integrity digest, binding and version checks fail closed with `STATE_CONFLICT` | P3-CHECKPOINT-003/005 |
| Cross-tenant access | read another tenant's steps/checkpoints | RLS `FORCE` + tenant context; adapter returns `null`/empty for foreign tenants | P3-TENANT-001 |
| Terminal resurrection | re-run a completed execution | terminal checkpoints rejected; store refuses new steps after `SUCCEEDED` | P3-CHECKPOINT-004 |
| Prompt/response fabrication | "feito" without an effect | false-success detection refuses `COMPLETED` whenever `ACTION_CONFIRMED` lacks the claimed effect observation (exact tool when named; a side-effecting tool otherwise). A prior successful read never satisfies the claim | P3-GROUNDING-002..007 |
| Unsupported factual claims | model adds facts without evidence | claim/evidence contract; unsupported claims fail RESPOND and allow one bounded revision | P3-GROUNDING-001, P3-EVAL-010 |
| User-input spoofing | public body injects `resume` | `parseExecutionSubmission` strips `executionId` and `resume`; only the durable binding reaches the runtime | `parseExecutionSubmission` + P3-WORKER-003 |
| Audit/telemetry blind spots | untracked loop behavior | per-step audit actions and per-execution telemetry attributes (no high-cardinality ids) | `RUNTIME_V2_AUDIT_ACTIONS`, benchmark/telemetry tests |

## Trusted-infrastructure boundary

Checkpoint and step digests are unkeyed integrity hashes, not authenticity
proofs: an actor with direct write access to the step store (or the database)
could re-seal a forged checkpoint. The store is treated as trusted
infrastructure in this phase; keyed signing (KMS/HMAC) is out of scope and
recorded as production debt.

## Explicit non-guarantees

- No provider/channel/RAG security, no IdP, no distributed rate limiting.
- No exactly-once guarantee for external providers (journal is the fence for
  deterministic tools only).
- Trajectory export is metadata-only; it contains no payloads, no user
  content and no hidden reasoning.
- No real clinical/financial/appointment action is reachable in this phase.

## Secrets and data

Synthetic fixtures only. No secrets in code, tests or docs. Logs and audit
events never include user content payloads from the loop; observation
summaries are bounded and sanitized.
