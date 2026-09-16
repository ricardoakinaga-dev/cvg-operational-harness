# Phase 4A requirements traceability — AAA-4A

Status is `PLANNING_ONLY / BUILD_BLOCKED`. The archived prompt parts under
`prompts/` are authoritative; this matrix translates them into the frozen
quality bar without claiming that planned evidence is already present.

| Quality ID          | Prompt anchors        | Planned implementation surface                          | Required proof                                                                    | Current status |
| ------------------- | --------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------- |
| P4A-ARCH-001        | Parts 1, 8–10         | `packages/conversation` above public Harness ports      | Dependency-direction test; Harness build with package removed                     | Planning only  |
| P4A-CONV-001        | Parts 2, 8–9          | Contracts, identity envelopes, state transitions        | Public type and transition tests for conversation/session/turn/message/execution  | Planning only  |
| P4A-STATE-001       | Parts 2–4, 8–9        | Bounded working memory and checkpoint codec             | Size/depth limits, digest, no CoT or cross-session memory                         | Planning only  |
| P4A-INTERP-001      | Parts 3, 6, 9         | Rules-first interpreter and typed Model Gateway adapter | Paraphrase, malformed-output, injection and zero-execution tests                  | Planning only  |
| P4A-CORRECT-001     | Parts 3–5, 9          | Correction and proposal invalidation                    | Friday/field correction invalidates stale proposal, approval and operation key    | Planning only  |
| P4A-REF-001         | Parts 3–5, 9          | Bounded reference resolver                              | “Second one”/ordinal and pronoun corpus with ambiguity rejection                  | Planning only  |
| P4A-SIDE-001        | Parts 4–5, 9          | Goal stack and pending-question preservation            | Side-question interruption/resume golden conversations                            | Planning only  |
| P4A-ACTION-001      | Parts 1, 6–9          | Harness Runtime bridge                                  | Spy proves policy, approval, journal and effect path are reused                   | Planning only  |
| P4A-APPROVAL-001    | Parts 6–9             | Proposal-bound approval adapter                         | Natural “yes” cannot approve; authenticated proposal-bound resume only            | Planning only  |
| P4A-GROUND-001      | Parts 6–9             | Response Composer and claim verifier                    | Unsupported/fake-success/uncertain claims rejected or repaired                    | Planning only  |
| P4A-DELIVERY-001    | Parts 6–9             | Stable response/outbox delivery port                    | Delivery retry and response failure never rerun a capability effect               | Planning only  |
| P4A-CRASH-001       | Parts 6–9             | Durable turn/state/effect recovery                      | Restart/crash matrix, replay and one-outcome assertions                           | Planning only  |
| P4A-TENANT-001      | Parts 1, 6–9          | Tenant-bound store and trusted-boundary adapters        | Memory/PostgreSQL RLS, IDOR and payload-authority rejection                       | Planning only  |
| P4A-CONCURRENCY-001 | Parts 6–9             | Versioned turn acceptance and idempotency               | At least 20 same-goal calls, one governed effect and deterministic state          | Planning only  |
| P4A-SEC-001         | Parts 6–10, 13        | Untrusted-content handling and bounded validators       | Injection, hidden capability, oversized input, malicious tool/knowledge corpus    | Planning only  |
| P4A-CONSUMER-001    | Parts 1, 11–13, 18    | Service Desk and Knowledge Assistant profiles           | Public-API conformance and profile-isolation tests                                | Planning only  |
| P4A-EVAL-001        | Parts 5, 8–10, 13, 18 | Golden/adversarial/performance evidence bundle          | 15 goldens, mutation variants, critic ledger, candidate identity and final report | Planning only  |

## Evidence state

The current repository proves only the Phase 4 controlled certification and
the Phase 4A planning archive. It does not yet prove any Phase 4A row above.
The following are mandatory before a Phase 4A result can be called AAA:

- a current `PHASE_4_HANDOFF=VERIFIED` record;
- validated Phase 4A PRD/SPEC plus human review;
- executable package, synthetic consumers and persistence/delivery fixtures;
- current test, security, performance, critic and candidate-bound evidence;
- a final sentinel captured after the last source change.

No row may be changed to PASS from document inspection alone. Evidence must
come from the named runtime, tests, logs or verified artifact.
