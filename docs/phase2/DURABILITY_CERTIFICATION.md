# AAA-21 durability certification

## Levels

- **D0** — structural inspection only.
- **D1** — unit and contract evidence.
- **D2** — integration with the persistence abstraction.
- **D3** — real PostgreSQL integration.
- **D4** — process restart with real PostgreSQL.
- **D5** — fault-injected durable execution under concurrency.

## Current certification

**Maximum defensible level: D5 (controlled, non-production).**

The candidate has real PostgreSQL evidence from an isolated PostgreSQL 15
container. The complete guarded catalog passed (`24 files / 190 tests / 0
skips`), including tenant RLS, concurrent claims, idempotency, retry
exhaustion/dead-letter pairing, fresh pool continuity, the least-privilege
operational role preflight, the R3 child-process fault/recovery proof, and the
R4 public synthetic-effect journal proof. The R3 test interrupted one child
after a committed claim, started a distinct child in the same recovery window,
and verified one terminal outcome; the R4 test verified one `CONFIRMED` journal
row and one synthetic executor observation under replay.

D4 and D5 are proven only for the controlled empty-tool worker boundary. This
does not certify a PostgreSQL server crash, an external provider, or production
readiness; production remains `NO_GO`.

## Gate table

| Gate                                       | Result                        | Basis                                                              |
| ------------------------------------------ | ----------------------------- | ------------------------------------------------------------------ |
| Request identity and transition contract   | PASS                          | focused harness/API tests                                          |
| HTTP 202/no inline execution               | PASS                          | API integration tests                                              |
| Authenticated approval pause/resume        | PASS_CONTROLLED               | tenant/role/binding/idempotency and lifecycle tests                |
| Public factory worker boundary             | PASS                          | harness/worker tests and dependency gate                           |
| Synthetic effect uncertainty               | PASS                          | effect-journal crash/replay tests                                  |
| SQL schema/adapters                        | PASS_CONTROLLED               | full PostgreSQL catalog                                            |
| Live PostgreSQL transaction/RLS            | PASS_DISPOSABLE_PG            | 24 files / 190 tests / 0 skips                                     |
| Operational role preflight                 | PASS_DISPOSABLE_PG            | minimal-role suite, 13 tests                                       |
| Fresh pool continuity                      | PASS_DISPOSABLE_PG            | new-pool execution read/event proof                                |
| Process restart with PostgreSQL            | PASS_CONTROLLED_DISPOSABLE_PG | R3 real child interruption/reclaim test                            |
| Concurrent fault injection with PostgreSQL | PASS_CONTROLLED_DISPOSABLE_PG | R3 two-child stale-lease/fault window; R4 remains no-I/O synthetic |
