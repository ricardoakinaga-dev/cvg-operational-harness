# AAA-21 recovery scenarios

| Scenario                               | Expected sequence                                                                                 | Current status                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1 — API process ends after acceptance | `QUEUED` remains visible; a worker claims it later                                                | Proven with in-memory HTTP/worker test                                                                                                                                           |
| R2 — worker loses lease                | stale claim is recovered, event appended, stale owner is fenced                                   | Proven in-memory and in disposable PostgreSQL                                                                                                                                    |
| R3 — retryable runtime failure         | failure stores a retry time; next eligible claim increments attempt and exhausts into dead-letter | Proven in-memory and in disposable PostgreSQL                                                                                                                                    |
| R4 — approval pause                    | `RUNNING → WAITING_APPROVAL`; durable approval ID; no effect; authenticated decision queues       | Controlled HTTP/worker test proves role/tenant checks, no effect before approval, duplicate decision safety, approval reservation/confirmation, and resume-equivalent processing |
| R5 — user pause                        | `RUNNING → WAITING_USER`; explicit user action is required                                        | State is supported; end-to-end user interaction is not in scope                                                                                                                  |
| R6 — uncertain effect                  | journal becomes `UNCERTAIN`; next execution fails closed                                          | Synthetic crash/replay test proves no second tool call                                                                                                                           |
| R7 — terminal completion               | terminal row cannot be queued/claimed again                                                       | Contract-tested                                                                                                                                                                  |
| R8 — tenant mismatch                   | request conflict or cross-tenant not-found                                                        | HTTP test proves execution and approval decision isolation at API adapter                                                                                                        |
| R9 — process fault after claim         | `CLAIMED` survives child interruption; a distinct worker recovers and completes                   | Proven with real child processes and disposable PostgreSQL; empty-tool controlled boundary                                                                                       |

The recovery implementation deliberately avoids a claim of exactly-once
external effects. It provides at-most-once replay after a confirmed journal
record and fail-closed behavior after an ambiguous approval/effect outcome.
The PostgreSQL evidence includes fresh-pool continuity and the R3
process-realistic fault/recovery proof. It remains a controlled empty-tool
boundary and does not certify external exactly-once effects.
