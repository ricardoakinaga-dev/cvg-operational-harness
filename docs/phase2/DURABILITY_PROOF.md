# AAA-21 durability proof ledger

| Proof                      | Method                                                                                                                                           | Result                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| Identity dedupe            | concurrent duplicate submissions and request-hash conflict                                                                                       | PASS_DISPOSABLE_PG                                 |
| Tenant visibility          | cross-tenant get plus PostgreSQL RLS                                                                                                             | PASS_DISPOSABLE_PG                                 |
| Claim exclusivity          | concurrent PostgreSQL `SKIP LOCKED` claims                                                                                                       | PASS_DISPOSABLE_PG                                 |
| Lease fencing              | wrong worker/fence transition rejected                                                                                                           | PASS_CONTROLLED + PASS_DISPOSABLE_PG               |
| Fence token                | heartbeat/active transition carries claim attempt                                                                                                | PASS_CONTROLLED + PASS_DISPOSABLE_PG               |
| Stale recovery             | expired claim returns to queue with causal event                                                                                                 | PASS_CONTROLLED + PASS_DISPOSABLE_PG               |
| Terminal finality          | invalid resurrection rejected; retry exhaustion dead-letters                                                                                     | PASS_CONTROLLED + PASS_DISPOSABLE_PG               |
| Safe cancellation          | pre-effect cancel succeeds; active cancel conflicts; repeat is idempotent                                                                        | PASS_CONTROLLED + PASS_DISPOSABLE_PG               |
| Approval pause/resume      | authenticated decision, execution binding, policy re-evaluation, no effect before approval                                                       | PASS_CONTROLLED                                    |
| Approval creation race     | adapter lock plus SQL binding index                                                                                                              | PASS_CONTROLLED + PASS_DISPOSABLE_PG               |
| Effect replay              | confirmed journal returns prior result; R4 duplicate HTTP submission/replay does not execute twice                                               | PASS_SYNTHETIC + PASS_DISPOSABLE_PG                |
| Effect uncertainty         | injected crash makes retry fail closed                                                                                                           | PASS_SYNTHETIC                                     |
| Causal audit payload       | terminal transition event contains buffered audit events and approval identity                                                                   | PASS_CONTROLLED + PASS_DISPOSABLE_PG               |
| SQL invariants             | migration 0018 checks result/failure/retry/cancel/lease/timestamp shape                                                                          | PASS_DISPOSABLE_PG                                 |
| Operational role preflight | minimal non-superuser role passes neutral critical-table/RLS/migration checks                                                                    | PASS_DISPOSABLE_PG                                 |
| Operational worker path    | role submits, claims, executes, reads result/events through public worker runtime                                                                | PASS_DISPOSABLE_PG                                 |
| R4 synthetic-effect path   | requested tool crosses the public worker boundary; one PostgreSQL journal row is `CONFIRMED`, observer count is one, other-tenant lookup is null | PASS_DISPOSABLE_PG                                 |
| Fresh pool continuity      | a new adapter pool reads terminal state/events after execution                                                                                   | PASS_DISPOSABLE_PG                                 |
| Process restart            | real child interruption after claim, new child lease recovery, and terminal completion                                                           | PASS_CONTROLLED_DISPOSABLE_PG                      |
| Fault-injected concurrency | two real child workers share the durable queue while one child is fault-injected                                                                 | PASS_CONTROLLED_DISPOSABLE_PG; empty-tool boundary |

The ledger promotes only the evidence actually exercised. Disposable
PostgreSQL plus the R3 child-process proof establishes D5 for this controlled
candidate's queue/worker boundary; R4 adds a no-I/O synthetic journal path. It
does not imply external-provider exactly-once semantics or production
readiness.
