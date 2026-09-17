# Phase 4A threat model — AAA-4A

## Assets

The protected assets are tenant/profile scope, pending approval bindings,
proposal and operation identity, effect outcome, approved knowledge references,
bounded working memory and response integrity. Synthetic fixtures contain no
real person, account, appointment, credential or provider data.

## Trust boundaries

1. User text, model output, tool output, knowledge text and persona strings
   enter as untrusted content.
2. The conversation package is an untrusted planner relative to the existing
   Harness authority.
3. The service boundary supplies trusted scope and execution identity.
4. PostgreSQL RLS and the tenant setting protect durable rows.
5. The existing Harness controls policy, approval, capability validation,
   effect journal, audit and telemetry.

## Threats and controls

| Threat                                    | Control                                                                                                                                                        | Residual                                       |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Prompt injection asks for a hidden action | Strict typed interpretation, profile allowlist, manager no execution                                                                                           | Model quality still needs new domain fixtures  |
| “Yes” is treated as approval              | Approval resume requires authenticated exact binding                                                                                                           | Real approval integration is out of scope      |
| Stale correction reuses old approval      | Proposal hash, operation key and approval are invalidated; claim CAS plus the second effect-authorization fence check the active proposal before Harness entry | Real approval provider remains out of scope    |
| Ordinal/pronoun hijack                    | One eligible bounded candidate or clarification                                                                                                                | Ambiguous language remains user-visible        |
| Fake tool success                         | Result identity/effect/evidence verifier and safe fallback                                                                                                     | Existing Runtime remains external authority    |
| Malicious knowledge source                | Profile allowlist, approved flag and version check                                                                                                             | No real RAG claim                              |
| Tenant IDOR or profile switching          | Scoped store, payload identity ignored, RLS migration                                                                                                          | Production identity integration out of scope   |
| Duplicate effect after replay             | Execution claim, owner turn, execution id, lease token and operation key; turn execution identity is persisted                                                 | Production HA/network failure remains untested |
| Runtime agent substitution                | Composition-root agent id/version is checked by the Harness bridge                                                                                             | Runtime registry integration remains external  |
| State/resource exhaustion                 | Text, JSON, entity, goal, source, depth and byte limits                                                                                                        | Limits are deliberately finite                 |
| Handoff leaks secrets/reasoning           | Bounded packet field allowlist                                                                                                                                 | Sink integration is synthetic                  |
| Duplicate response after delivery crash   | Durable delivery lease plus stable `deliveryKey` contract                                                                                                      | External sink must provide idempotency         |

The executable adversarial cases are in `tests/phase4a/conversation-adversarial.test.ts`
and the critical catalog. Findings and environment gaps are recorded in
`SECURITY_REVIEW.md`.
