# AAA-21 crash matrix

This matrix separates what the source contract provides from what this run
actually proved. “Controlled proof” means deterministic tests against the
in-memory adapter or synthetic journal. The process row below is disposable
PostgreSQL evidence and remains non-production.

| Crash point                                                        | Durable/observable state                                             | Recovery rule                                                                    | Current evidence                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Before submission commit                                           | No accepted execution                                                | Client may retry with the same idempotency key                                   | Contracted; no durable row expected                                      |
| After execution row, before queue row                              | Must commit or roll back as one logical submission                   | Reconcile orphan row before worker consumption                                   | Transactional pairing and row-count guards pass in disposable PostgreSQL |
| After `RECEIVED`/`QUEUED`                                          | Queued execution remains claimable                                   | Worker claims after restart                                                      | In-memory and HTTP tests; SQL source inspection                          |
| After `CLAIMED`, before `RUNNING`                                  | Lease identifies the owner                                           | Expired lease returns to `QUEUED` and appends recovery event                     | Real child fault/restart and disposable PostgreSQL R3 proof PASS         |
| During `RUNNING`, before result                                    | Lease may expire                                                     | Stale recovery makes the execution retryable/queued; fencing rejects stale owner | Controlled and disposable PostgreSQL lease/fencing tests PASS            |
| After effect starts, before confirmation                           | Effect journal is `UNCERTAIN`                                        | Retry is blocked pending explicit reconciliation                                 | Synthetic crash test PASS                                                |
| After approval reservation/`EXECUTING`, before effect confirmation | Approval remains `EXECUTING` or becomes `UNCERTAIN`; no blind re-arm | Reconcile approval/effect explicitly; do not approve a different execution       | Controlled lifecycle source/test; live restart not run                   |
| After human approval, before execution requeue                     | Approval is `APPROVED`, execution remains `WAITING_APPROVAL`         | Idempotent decision retry resolves the same bound execution                      | Controlled HTTP and disposable PostgreSQL catalog PASS                   |
| After confirmed effect, before runtime result commit               | Effect journal is `CONFIRMED`                                        | Replay may return the recorded result; do not invoke the tool again              | Synthetic replay test PASS                                               |
| After result is persisted, before terminal event                   | Execution state transition is the authority                          | Event inspection must show the terminal transition                               | In-memory event sequence PASS                                            |
| After terminal transition                                          | Terminal execution has no outgoing transition                        | No resurrection; operator must create a new semantic execution                   | Terminal-state test PASS                                                 |
| Database unavailable at worker start                               | No false success                                                     | Worker remains unavailable/controlled; production is not authorized              | Startup preflight is fail-closed; live role proof PASS                   |

The R3 process proof exercises a real child interruption, stale-lease recovery,
and two-child worker authority against disposable PostgreSQL. The matrix still
does not claim a PostgreSQL server crash, external-provider exactly-once
behavior, or production readiness.
