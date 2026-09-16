# AAA-21 frozen quality bar v1

This bar is frozen before Phase 2 implementation. It is derived from the
authoritative AAA-21 prompt archive and repository safety rules. A result is
PASS only when every required row has current, candidate-bound evidence.

| ID              | Source | Required target                                                                                                                                   | Evidence method                                                                    | Priority |
| --------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------- |
| P2-HTTP         | USER   | One canonical versioned HTTP submission accepts, validates, persists, enqueues, and returns without running the agent inline.                     | Integration request against the actual API boundary plus durable row/outbox query. | Critical |
| P2-STATE        | USER   | Explicit durable state machine rejects illegal transitions and distinguishes queued, running, waiting, retryable, terminal, and cancelled states. | Contract tests, transition tests, and persistence integration proof.               | Critical |
| P2-QUEUE        | USER   | One durable queue/outbox authority hands work from API to worker atomically with the execution record.                                            | Transaction/failure tests and queue evidence.                                      | Critical |
| P2-WORKER       | USER   | A canonical worker claims with ownership/lease, prevents concurrent duplicate processing, recovers stale work, and shuts down safely.             | Two-worker concurrency, lease/recovery, and restart tests.                         | Critical |
| P2-HARNESS      | USER   | Worker invokes the public createOperationalHarness composition; no parallel internal bootstrap is the canonical path.                             | Public-consumer integration test and import/source gate.                           | Critical |
| P2-GOVERNANCE   | USER   | Policy precedes every governed effect; approval-required work pauses durably and resumes after process restart.                                   | Deny, pause/resume, binding, and approval idempotency tests.                       | Critical |
| P2-IDEMP        | USER   | Same tenant plus idempotency key creates one semantic execution; payload mismatch is explicit conflict.                                           | Concurrent duplicate-submission test with durable row/effect assertions.           | Critical |
| P2-EFFECT       | USER   | Effect journal protects synthetic effects, distinguishes unknown outcomes, and never silently retries an uncertain effect.                        | Synthetic side-effect integration and crash-after-effect proof.                    | Critical |
| P2-TENANT       | USER   | Tenant context scopes execution, queue, approval, result, audit, and effect queries.                                                              | Cross-tenant integration matrix and authorization query tests.                     | Critical |
| P2-AUDIT        | USER   | Durable audit events reflect causal order and do not claim completion before durable state/effect completion.                                     | Raw event sequence assertions and audit failure policy test.                       | Critical |
| P2-TELEMETRY    | USER   | Queue, worker, runtime, policy, model, tool, retry, approval, and idempotency signals are observable without high-cardinality labels.             | Telemetry sink assertions and metric contract inspection.                          | High     |
| P2-FAILURE      | USER   | Failure taxonomy separates technical retry, semantic outcome, pause, unknown effect, and terminal/quarantine behavior.                            | Failure matrix tests and durable outcome queries.                                  | High     |
| P2-POSTGRES     | USER   | Real PostgreSQL participates in critical durability proofs when available; otherwise status is explicitly environment-blocked.                    | npm run test:postgres plus version/schema evidence.                                | Critical |
| P2-NOREGRESSION | REPO   | No new unexplained failures, skips, type errors, lint errors, or broken public exports beyond the recorded baseline.                              | Pre/post gate comparison bound to candidate digest.                                | Critical |
| P2-CRITIC       | USER   | Fresh independent critic attempts rejection against raw evidence and the final candidate.                                                         | docs/phase2/evidence/INDEPENDENT_CRITIC.md with mutation sentinel.                 | Critical |
| P2-FUTURE       | USER   | Persistence and worker lifecycle do not encode one execution as permanently one model/tool call; future checkpoints/waiting-user remain possible. | Compatibility inspection and explicit status matrix.                               | High     |

## Verdict rules

- PASS requires all critical rows current and proven, including real PostgreSQL
  evidence and a valid fresh critic.
- CONDITIONAL_PASS is allowed only for explicit environment/independence
  limitations that do not hide a critical implementation failure.
- FAIL applies to any critical bypass, duplicate effect, tenant leak, lost
  work, illegal terminal resurrection, fabricated evidence, or unresolved
  required implementation gap.
- PRODUCTION = NO_GO remains independent of the Phase 2 verdict.
