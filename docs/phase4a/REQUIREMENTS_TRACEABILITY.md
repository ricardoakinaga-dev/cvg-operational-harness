# Phase 4A requirements traceability — AAA-4A

## Superseding implementation snapshot — 2026-09-17

The former planning matrix is retained below as historical gate context. The
controlled build now exists under `packages/conversation`, with synthetic
consumers, a tenant-scoped PostgreSQL adapter/migration, delivery leases,
adversarial tests, a 15-case golden corpus and 15 multi-turn trajectories.
The controlled executable result is **73 passed tests across 12 files** with
disposable PostgreSQL enabled; the structural verifier records 16 assertions.
The PostgreSQL run covered RLS, durable contention, stale lease recovery,
reload and fencing, including the post-claim effect-authorization race.

Status vocabulary in the current evidence is deliberately evidence-based:
`PROVEN_CONTROLLED` means the named local synthetic test or build executed;
`PARTIAL_ENVIRONMENT` means a required external or production environment
proof remains outside scope; `NOT_RUN` means no evidence is claimed. The final
candidate, fresh critics, sentinel and certification result are bound in
`evidence/`. Production, real data, real providers/channels and real effects
remain `NO_GO` regardless of controlled test status.

Status is `IMPLEMENTED_CONTROLLED / AUDIT_COMPLETE / PASS`. The archived
prompt parts under `prompts/` are authoritative; this matrix translates them
into the frozen quality bar. The table below is retained as the original
planning matrix, while candidate-bound proof lives in `evidence/`.

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

The current repository proves the controlled Phase 4A implementation rows
through executable tests and generated evidence. The final controlled
certification contains the required candidate binding, environment execution,
fresh critics and sentinel:

- a current `PHASE_4_HANDOFF=VERIFIED` record;
- validated Phase 4A PRD/SPEC plus the controlled build authorization;
- executable package, synthetic consumers and persistence/delivery fixtures;
- current test, security, performance, critic and candidate-bound evidence;
- three fresh independent critic reports with complete axis scores; and
- a final sentinel captured after the last source change.

No row may be changed to PASS from document inspection alone. Evidence must
come from the named runtime, tests, logs or verified artifact.
