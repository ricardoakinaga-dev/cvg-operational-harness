# AAA-21 production-readiness matrix

Production remains **NO_GO**. This matrix describes the controlled candidate;
it is not a release approval.

| Area                                       | Status                               | Evidence / blocker                                                                                                               |
| ------------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Canonical HTTP submission                  | PROVEN_CONTROLLED                    | API integration, R4 HTTP→queue→worker vertical proof, and full PostgreSQL catalog; no inline worker call                         |
| Durable identity and idempotency           | PROVEN_DISPOSABLE_PG                 | unique tenant/key authority and concurrent duplicate proof                                                                       |
| Queue/outbox atomicity                     | PROVEN_DISPOSABLE_PG                 | transactional pairing, row-count guards, live claim/dead-letter tests                                                            |
| Worker claim/fencing/recovery              | PROVEN_DISPOSABLE_PG                 | live concurrent claims plus controlled lease/recovery/shutdown tests                                                             |
| Public `createOperationalHarness` boundary | PROVEN                               | worker source and integration tests                                                                                              |
| Policy before effect                       | PROVEN_SYNTHETIC                     | governed runtime fixtures; real effects remain forbidden                                                                         |
| Approval pause/resume                      | PROVEN_CONTROLLED                    | authenticated decision, binding, lifecycle, and live schema tests; D4 process restart not claimed                                |
| Safe cancellation/retry                    | PROVEN_DISPOSABLE_PG                 | bounded attempts, dead-letter, pre-effect cancel, active conflict, idempotent repeat                                             |
| Effect journal                             | PROVEN_SYNTHETIC                     | R4 memory/PG fixture confirms one journal row, replay, and one executor call; uncertain crash tests remain; no external provider |
| Tenant isolation                           | PROVEN_DISPOSABLE_PG                 | API cross-tenant proof, FORCE RLS, minimal operational role preflight                                                            |
| Durable audit/telemetry                    | PROVEN_CONTROLLED                    | causal execution event and worker signals; external sink certification absent                                                    |
| PostgreSQL durability                      | PROVEN_DISPOSABLE_PG                 | 24 files / 190 tests / 0 skips on isolated PostgreSQL 15; R3 child proof plus R4 journaled-tool proof                            |
| Process restart / fault injection          | PROVEN_CONTROLLED_DISPOSABLE_PG      | R3 child-process fault/reclaim proof remains valid for the empty-tool boundary; R4 adds the public synthetic-effect path         |
| Baseline regression                        | PROVEN_CONTROLLED                    | full suite 250 files / 1,727 passed / 110 skipped; global format debt remains                                                    |
| Independent critic                         | BLOCKED_NO_REPORT; CONDITIONAL_LIMIT | R4 fresh read-only window and matching mutation sentinel are recorded separately; no report is treated as approval               |
| External data/providers/effects            | NOT_AUTHORIZED                       | explicitly out of scope                                                                                                          |
| Production deployment                      | NO_GO                                | controlled-only guard and repository safety rules                                                                                |

The matrix does not promote a controlled or disposable-PostgreSQL result to
production readiness. Real patient/clinical/financial/appointment actions,
providers, channels, RAG sources, and unrestricted effects remain blocked.
