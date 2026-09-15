# P2-1 — scenario map (test -> invariant -> assertion)

All cases live in `packages/agent-runtime/src/__tests__/runtime-journal.test.ts`
(`describe('P2-1: start-of-turn approval releaseExpired sweep')`), in-memory
journal + deterministic model, synthetic only.

| # | Scenario                                                     | Invariant / contract                                  | Key assertions                                                                                                                    |
| - | ------------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1 | Orphaned RESERVED/EXECUTING approval + journal RESERVED, TTL expired | T-18 / section 4: no EFFECT_STARTED -> APPROVED       | next request turn returns `approval_required`; orphan status `APPROVED`; journal `ABANDONED`; tool/outbox never called             |
| 2 | Orphaned approval, journal record absent (no EFFECT_STARTED) | Section 4: expired reservation without effect proof    | orphan status `APPROVED`; tool/outbox never called                                                                                |
| 3 | Orphaned approval + journal EFFECT_STARTED, TTL expired      | T-18 / section 4: possibly-started effect -> UNCERTAIN | orphan status `UNCERTAIN`; journal `UNCERTAIN`; tool/outbox never called                                                          |
| 4 | `approvals.releaseExpired` throws                            | Fail closed; no effect                                | outcome `denied`, reason `approval_sweep_failed`; providerCalls 0; tool/outbox never called                                       |
| 5 | Effect journal `get` throws during evidence collection       | Missing proof is never a release                      | orphan status `UNCERTAIN`; tool/outbox never called                                                                               |
| 6 | Exported `sweepExpiredApprovals` helper (periodic worker)    | AAA03-R3-F03 helper; sweep never executes             | counters `{released:1, uncertain:1}`; first `APPROVED`, second `UNCERTAIN`; tool/outbox never called                              |

Additional interaction covered by existing regressions (now sweep-aware):
`AAA-10 T-18` (journal sweep + execution turn), `T-06` (crash after effect ->
`operation_uncertain`), `T-14` (replay), `T-07/T-17` (outbox), `T-08`
(concurrency) — all green in the full suite.
