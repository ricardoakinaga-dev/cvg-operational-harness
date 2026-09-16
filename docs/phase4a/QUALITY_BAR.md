# Phase 4A frozen quality bar — AAA-4A v1

Scope is controlled synthetic execution. Production is `NO_GO`. A critical
failure in authority, durability, tenant isolation, or false-success
containment cannot be downgraded to a conditional pass.

| ID                  | Dimension          | Required proof                                                                                          |
| ------------------- | ------------------ | ------------------------------------------------------------------------------------------------------- |
| P4A-ARCH-001        | Boundary           | Conversation is above the Harness; Core/Harness compiles without it.                                    |
| P4A-CONV-001        | Conversation model | Distinct conversation/session/turn/message/execution identities and transitions.                        |
| P4A-STATE-001       | State              | Bounded structured working memory, checkpoint digest, no chain-of-thought or cross-session memory.      |
| P4A-INTERP-001      | Interpretation     | Rules-first plus typed optional model fallback; malformed output fails closed.                          |
| P4A-CORRECT-001     | Correction         | Corrections invalidate stale entities, proposals, approvals and operation keys.                         |
| P4A-REF-001         | References         | Ordinal/pronominal references resolve only within bounded eligible state.                               |
| P4A-SIDE-001        | Side questions     | Pending primary goal survives a bounded interruption and resumes safely.                                |
| P4A-ACTION-001      | Governance         | Every action uses the public Harness Runtime and existing policy/approval/journal.                      |
| P4A-APPROVAL-001    | Approval           | Natural language cannot grant approval; resume is authenticated/proposal-bound.                         |
| P4A-GROUND-001      | Grounding          | Response claims are source-backed; failed/uncertain effects never render success.                       |
| P4A-DELIVERY-001    | Delivery           | Stable response idempotency and delivery retry do not rerun effects.                                    |
| P4A-CRASH-001       | Recovery           | Restart/replay loads durable turn/checkpoint/effect state and preserves one outcome.                    |
| P4A-TENANT-001      | Isolation          | Memory and PostgreSQL paths reject cross-tenant IDOR and spoofed payload tenants.                       |
| P4A-CONCURRENCY-001 | Concurrency        | At least 20 same-goal calls remain deterministic with no duplicate effect.                              |
| P4A-SEC-001         | Adversarial        | Injection, fake success, hidden capability, oversized/malformed data and unsafe references fail closed. |
| P4A-CONSUMER-001    | Generality         | Service Desk and independent Knowledge Assistant compose through public APIs.                           |
| P4A-EVAL-001        | Evidence           | Golden corpus, adversarial corpus, performance, critic reports and candidate identity are current.      |

Target floors: architecture A4/A5; durability R5; grounding G5; transaction
integrity T5; knowledge K4/K5; security S5; naturalness N4; generality C3/C4.
Triple-A axes require at least 90/100 each with no critical defect. A missing
fresh critic or unproven environment gate yields `CONDITIONAL_PASS` at most.
