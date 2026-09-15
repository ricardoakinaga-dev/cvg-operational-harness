# AAA-21 security review

## Trust boundaries

`Client → API → PostgreSQL/queue → Worker → Harness → Model/Tool` is the main
flow. Audit and telemetry are observers/sinks, not authorities. Tenant context
must be carried from the authenticated API boundary into every storage
operation.

| Risk                              | Control in this slice                                                                                          | Residual risk                                                                                                                 |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| SQL injection                     | Parameterized SQL in the PostgreSQL adapter; no user SQL fragments                                             | Disposable PostgreSQL path exercised; production review remains separate                                                      |
| Tenant bypass                     | Authenticated tenant scope, composite keys, RLS policies, tenant-aware queries                                 | Disposable PostgreSQL RLS and least-privilege role proof passes                                                               |
| IDOR                              | Cross-tenant `GET` returns not-found                                                                           | Broader operator-role matrix remains outside this slice                                                                       |
| Untrusted payload/mass assignment | Explicit parsing and validation; public view omits request                                                     | Runtime schema depth remains bounded by existing contracts                                                                    |
| Unsafe deserialization            | JSON-safe boundary and structured cloning; no executable payload                                               | Provider-specific codecs are future work                                                                                      |
| Tool argument injection           | Policy/harness tool contract remains the authority; synthetic registry only                                    | Real tool adapters are not in scope                                                                                           |
| Approval bypass                   | Paused states have explicit transitions; no effect before approval                                             | Controlled resolver/binding proof passes; process restart is not claimed                                                      |
| Idempotency abuse                 | Tenant+key binding and request-hash conflict                                                                   | Rate limits/quotas are not part of this slice                                                                                 |
| Queue poisoning                   | Validated state/tenant rows, paired queue updates, row-count guards and lease claims                           | R3 disposable PostgreSQL fault/reclaim proof passes for the empty-tool boundary; R4 journaled fixture remains controlled-only |
| Lease stealing                    | Owner/expiry checks and stale recovery                                                                         | Disposable PostgreSQL concurrent-claim and R3 process-recovery proofs pass                                                    |
| Audit tampering                   | Append-only event model and database ownership comments                                                        | Disposable event path passes; production privilege audit is pending                                                           |
| Sensitive log exposure            | Synthetic payloads; public view redacts request                                                                | Production log policy is not approved                                                                                         |
| Synthetic fixture escalation      | Explicit flag, controlled-mode requirement, production rejection, versioned no-I/O tool, and journal authority | Real tool/provider adapters remain out of scope                                                                               |

## Decision

No critical bypass was found in the controlled path. This is an engineering
review, not a production security sign-off. Real providers, real data, and
unrestricted side effects remain forbidden.
