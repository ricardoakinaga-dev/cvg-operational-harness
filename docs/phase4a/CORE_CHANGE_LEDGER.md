# Phase 4A core change ledger — AAA-4A

| Decision  | Change                                                                    | Reason and proof                                                                          |
| --------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| AAA4A-D01 | Added optional `packages/conversation`                                    | Keeps language above the frozen Harness; type/build checks enforce direction              |
| AAA4A-D02 | Added bounded contracts and reducers                                      | Prevents transcript/model prose from becoming authority                                   |
| AAA4A-D03 | Added rules-first interpreter and typed model adapter                     | Deterministic paths avoid unnecessary model calls; invalid output fails closed            |
| AAA4A-D04 | Added proposal-bound plan and Harness bridge                              | Reuses policy, approval, capability, journal, audit and telemetry authority               |
| AAA4A-D05 | Added memory/PostgreSQL stores with CAS and RLS migration                 | Supports scoped durable state without a second execution spine                            |
| AAA4A-D06 | Added execution claims and delivery leases                                | Separates effect idempotency from response delivery retry                                 |
| AAA4A-D07 | Added source verifier and handoff packet                                  | Prevents false success and preserves explicit continuation                                |
| AAA4A-D08 | Added synthetic profiles and 15-case corpus                               | Proves consumer generality without real data or providers                                 |
| AAA4A-D09 | Added controlled scripts and evidence directory                           | Makes scope, skips, candidate and critic status reviewable                                |
| AAA4A-D10 | Added pre-claim state/proposal fencing and current-wins merge             | Correction races cannot reserve stale work or restore invalidated pending state           |
| AAA4A-D11 | Added trusted runtime-agent bridge binding and turn execution persistence | Runtime identity and execution references remain auditable at the boundary                |
| AAA4A-D12 | Added a post-claim effect-authorization fence and race regression         | A correction that commits before the Harness ordering point cannot produce a stale effect |

Primary implementation files are under `packages/conversation/src`; the
consumer and test surfaces are listed in `PHASE_4A_REPORT.md`. Existing
legacy product conversation tables and Harness authorities were not reused as
generic state.
