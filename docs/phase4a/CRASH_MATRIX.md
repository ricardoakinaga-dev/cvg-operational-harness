# Crash and recovery matrix — AAA-4A

| Failure point                                                           | Durable fact that must win                 | Recovery behavior                                                                                     | Current proof                                             |
| ----------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Before turn acceptance                                                  | No accepted message                        | A later request can be accepted once                                                                  | Memory and disposable PostgreSQL integration              |
| After acceptance before plan commit                                     | Accepted turn without terminal response    | Reprocess/replay using stored idempotency                                                             | Memory and disposable PostgreSQL integration              |
| Correction commits before an execution claim                            | New state version and invalidated proposal | Reject the stale claim before Harness entry; commit a bounded clarification                           | Claim race regression                                     |
| Correction commits after claim but before effect authorization          | New state version and corrected facts      | Reject the claim at the second store fence; do not call Harness; commit a bounded clarification       | Post-claim authorization race regression                  |
| After effect authorization before Harness call                          | Authorized `IN_FLIGHT` lease               | The authorization transaction is the ordering point; later corrections cannot retroactively revoke it | Store fence and service integration                       |
| Harness returns approval required                                       | Proposal-bound waiting outcome             | Authenticated resume only                                                                             | Service Desk journey                                      |
| Harness confirms effect before response commit                          | Existing execution/effect journal          | Replay terminal outcome and compose response                                                          | In-memory public Harness/journal test                     |
| Response commit before delivery                                         | Persisted response and pending delivery    | Deliver the same response id/key                                                                      | Delivery tests                                            |
| Delivery fails after effect                                             | Terminal execution plus failed delivery    | Retry delivery only                                                                                   | Concurrent delivery/replay tests                          |
| Process crashes after sink accepts response but before `DELIVERED` mark | Durable row may remain `SENDING`           | Reclaim after lease expiry and retry the same `deliveryKey`; sink deduplicates                        | Contract/documented limitation; no external sink in scope |
| Stale PostgreSQL execution lease                                        | Lease token and attempt row                | Reclaim only expired lease; fence old worker                                                          | Disposable PostgreSQL integration                         |
| Stale PostgreSQL delivery lease                                         | Lease token and attempt row                | Reclaim only expired lease; fence old worker                                                          | SQL adapter/migration and delivery tests                  |
| Process restart with PostgreSQL                                         | Session, turn, claim and delivery rows     | Load exact scoped records and replay                                                                  | Disposable PG reload/recovery test                        |

The matrix separates execution uncertainty from message delivery. “Exactly
once” is not claimed for an effect outside the existing journal; the package
uses operation-key idempotency and records uncertainty when the authority's
terminal result cannot be observed. The controlled run proves the database
lease and delivery behavior; it does not simulate a production OS or network
partition. PostgreSQL delivery calls the external sink outside the SQL
transaction. That boundary is deliberately at-least-once: a production sink
must deduplicate the stable `deliveryKey` to prevent duplicate user-visible
messages after the crash window.
