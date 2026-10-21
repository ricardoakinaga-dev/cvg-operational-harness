<!-- Lead: links absolutos da candidata normalizados para paths portáteis; resposta original preservada no runtime privado. -->
**Decision: REJECT for production readiness within the API/web lane.** Six substantive defects are confirmed by source inspection. Their proposed probes remain **NOT_RUN by I1**.

Artifact: `/home/ricardo/cvg-critical-audit-20261020/candidate`, commit `3704e3f853e45e9a967dfc07b366eb9c6acb51a5`.

I independently inspected the frozen source without edits, descendants, installations, network calls, application processes or database processes. I did not consult earlier audit reports, `.gauntlet`, builder history or consolidation reports. The Lead reports full-suite, E2E **12/12**, syntax and lint PASS under Node 22; those are supplied evidence, not executions witnessed by I1, and do not resolve the cases below.

1. **I1-01 — P1: Operator/Approver can read unrelated cases within their tenant.**  
   **Q2; confidence: high; confirmed static defect.**

   Conversation listing and timeline check `conversation:view_assigned`, but pass only tenant/resource identifiers to persistence. Session audit accepts either `audit:view_full` or `audit:view_limited` and returns the same event collection. Execution reads likewise pass their complete view after a role/tenant check.

   Evidence: [conversation list, server.ts:1394](../../../../apps/api/src/server.ts), [timeline:1675](../../../../apps/api/src/server.ts), [session audit:2247](../../../../apps/api/src/server.ts), [execution response:951](../../../../apps/api/src/server.ts). The [role matrix](../../../../packages/shared/src/auth.ts) grants these permissions to Operator/Approver.

   **Trigger/impact:** an authenticated Operator discovers conversations through the listing and reads another case’s messages or audit events. This is an authorization failure **inside one tenant**; I did not establish a cross-tenant bypass. SPEC0107 requires case association for Operator audit access. The assignment capability remains proposed in SPEC0176; its absence is a production blocker, not permission to treat all cases as assigned.

   **Lead probe:** seed two synthetic cases in tenant T. Create a trusted cookie session for Operator B, without assigning B to case A. Use `app.inject` for:
   ```text
   GET /v1/conversations
   GET /v1/conversations/<A>/timeline
   GET /v1/audit/sessions/<A-session>
   ```
   Check for A’s identifiers, message marker and audit marker in successful responses. Repeat with Approver.

2. **I1-02 — P1: The shipped web bootstrap cannot restore a valid cookie-only session.**  
   **Q1/Q5/Q7; confidence: high; confirmed static defect.**

   The actual web entrypoint constructs `createTrustedSessionBootstrap()`. Its `load()` rejects locally when no bootstrap token exists, before contacting the API. The default provider deletes the one-use global token after consuming it. Meanwhile, the API explicitly supports an existing cookie without another token.

   Evidence: [web entrypoint:14](../../../../apps/web/src/main.tsx), [token requirement and consumption:55](../../../../apps/web/src/auth/session.ts), [API cookie restoration:771](../../../../apps/api/src/server.ts). This violates [SPEC0144’s reload invariant](../../../../docs/02_spec/0144_trusted_operator_session_production.md).

   **Trigger/impact:** reload or reopen the console with a valid operational cookie and no new host-provided token. The console demands authentication despite a valid server session.

   **Lead probe:** mock `apiClient.getSession` to return a valid session, then:
   ```ts
   await createTrustedSessionBootstrap(() => null).load()
   ```
   Observe rejection and zero calls to `getSession`. For browser confirmation, establish a session once, preserve its cookie, remove bootstrap-provider/init-script injection, and reload. Existing trusted component tests inject a replacement bootstrap; the trusted E2E helper injects a token through `addInitScript`, so those paths do not prove cookie-only restoration.

3. **I1-03 — P2: Concurrent task updates can reopen a terminal task.**  
   **Q3/Q4; confidence: high; confirmed static race.**

   The handler reads the task, validates the transition, and separately updates it. PostgreSQL’s update predicates contain task ID and tenant scope, but no expected status. Tenant-scoped repository calls do not combine the handler’s read and update into one conditional operation.

   Evidence: [handler:1780](../../../../apps/api/src/server.ts), [unconditional SQL update:1036](../../../../packages/persistence/src/postgres.ts), [repository dispatch:530](../../../../packages/persistence/src/tenant-scoped-postgres.ts).

   **Trigger/impact:** two requests both read `open`; one commits `done`, then the other commits `in_progress`. Both transitions passed validation, and the completed task becomes active again. Audit entries also describe transitions from stale state.

   **Lead probe:** seed an open task. Wrap `app.persistence.tasks.findById` with a barrier so both requests capture `open`. Send concurrent authenticated PATCH requests with `{"status":"done"}` and `{"status":"in_progress"}`. Release both reads, force the `done` update to finish first, then release `in_progress`. Check for two successful responses and final `in_progress`. The inspected lifecycle test covers sequential terminal rejection, not this interleaving.

4. **I1-04 — P2: A failed task audit append leaves the status change committed.**  
   **Q4; confidence: high; confirmed static integrity defect.**

   The same handler completes `tasks.updateStatus` before calling `audit.append`; its error handler neither rolls back nor records a durable obligation to finish the audit.

   Evidence: [status write followed by audit append:1785](../../../../apps/api/src/server.ts), [separate persistence methods:4905](../../../../apps/api/src/server.ts).

   **Trigger/impact:** audit storage fails after the status update. The API returns an error while the task has changed, without the required transition event. A client cannot infer whether its command took effect.

   **Lead probe:** after seeding a task, make the next `app.persistence.audit.append` reject with a synthetic error. PATCH the task to `done`; then restore the audit method and read the task and session audit. Check for an error response, persisted `done`, and no corresponding status-change event. A disposable PostgreSQL fault probe can confirm the durable boundary separately.

5. **I1-05 — P2: The approval queue allows decisions without showing their case context.**  
   **Q1/Q2/Q7; confidence: high; confirmed static UI defect.**

   The API client’s `ApprovalView` includes `sessionId` and `summary`. `ApprovalsPanel` drops both from its presentation contract and displays only action name, risk and status beside decision buttons. There is no case-navigation control in the row.

   Evidence: [API DTO:457](../../../../apps/web/src/api/client.ts), [panel contract:1](../../../../apps/web/src/features/approvals/index.tsx), [decision row:59](../../../../apps/web/src/features/approvals/index.tsx). [SPEC0114](../../../../docs/02_spec/0114_superficie_operacional_e_frontend.md) requires summary and context.

   **Trigger/impact:** two pending requests share an action and risk but concern different sessions. They are visually indistinguishable when the approver chooses one. This finding concerns the current internal decision workflow; it does not assert execution of a real clinical or financial effect.

   **Lead probe:** render two approvals with identical action/risk/status, distinct IDs, session IDs and summary markers. Assert that neither summary nor session is visible, then click the second approval button and observe that its ID is submitted without contextual review.

6. **I1-06 — P2: Task and approval list endpoints ignore pagination and return accumulated history.**  
   **Q1/Q3/Q7; confidence: high; confirmed contract defect.**

   Both handlers ignore query pagination. Their PostgreSQL queries select all tenant rows without `LIMIT`; approvals include terminal decisions. SPEC0107 requires bounded listings and explicitly specifies paginated approvals.

   Evidence: [tasks handler:1756](../../../../apps/api/src/server.ts), [approvals handler:1940](../../../../apps/api/src/server.ts), [task query:967](../../../../packages/persistence/src/postgres.ts), [approval query:1221](../../../../packages/persistence/src/postgres.ts).

   **Trigger/impact:** routine console loads increasingly fetch and render all historical records. Unbounded cardinality is established; an exhaustion threshold was not measured.

   **Lead probe:** seed 101 tasks and 101 approvals, including terminal approvals. Request each endpoint with `?limit=1&offset=100`. Check that the response still contains the complete collection and lacks pagination metadata.

The following inventory describes **actual registrations reached by `buildServer`**, rather than exported helper functions. There are **74 explicit method/path registrations**: 63 in `server.ts`, including three constant-named probe routes, plus 11 journey routes registered unconditionally through [the composition call](../../../../apps/api/src/server.ts). This count excludes automatic HEAD handling and OPTIONS interception.

| Mounted family | Methods and operations |
|---|---|
| Probes | GET `/health`, `/live`, `/ready`, `/health/metrics` |
| Operator session | GET `/v1/session`; POST `/v1/session/logout` |
| Executions | POST submission; GET execution; POST input/cancel/approval decision; GET trajectory |
| Conversations/takeover | GET list and timeline; POST `/v1/sessions/:sessionId/takeover` |
| Channel inbound | POST `/v1/webhooks/channels/:channel/messages` |
| Tasks | POST/GET `/v1/tasks`; PATCH status |
| Attendance approvals | POST/GET `/v1/approvals`; POST decision |
| Capability approvals | POST issue; GET record; POST revoke/execute |
| Audit/evidence | GET session audit and evidence; POST/GET checkpoints; GET checkpoint; POST transition |
| Plugin catalog | POST/GET catalog; GET record; POST transition |
| Knowledge sources | POST/GET collection; GET record; POST transition |
| Release candidates | POST/GET collection; GET record; POST transition |
| Agents/versions | POST/GET agents; POST/GET versions; POST clone/transition/publish-preflight/publish/rollback |
| Test lab/traces | POST/GET runs and suites; POST suite clone/evaluate/compare; GET suite runs/execution traces; POST evaluation |
| Legacy journeys | Owner/patient search; POST/GET owner, patient and appointment drafts; POST patient link/task; GET slots |

Important mount distinctions: metrics remains registered but returns 404 in production; trajectory remains registered but requires injected `executionSteps`, which the published main does not supply. Journey routes remain mounted when an explicit null adapter makes them fail closed. **OIDC start/callback routes are not mounted.** SPEC0107’s `/v1/sessions/:sessionId/runs` is also not registered; canonical execution uses `/v1/executions`.

The inspected entrypoints and modes are:

| Entrypoint/composition | Reachable mode |
|---|---|
| `npm run dev:api` → `apps/api/src/main.ts`; image/production compose → `apps/api/dist/main.js` | Same main composition: configured identity resolver → production-session bootstrap → environment server factory → listener |
| `NODE_ENV=production` | Trusted identity, PostgreSQL/RLS, durable inbound, dedicated session store, HTTPS and configured webhook authority required; configured identity is currently HMAC, not corporate OIDC |
| Development environment factory | Trusted identity default; memory or PostgreSQL; memory development seeds the legacy secretary preset. It does not automatically compose a browser session store |
| Controlled tests/direct `buildServer` | Simulation defaults only in test; optional unauthenticated fixture mutations. Trusted resolver/store and other adapters may be injected |
| `apps/web/src/main.tsx` | Actual React entry constructs trusted bootstrap by default; simulation requires the controlled test profile |
| Production harness proxy | Serves web assets and proxies `/v1/` on the same HTTPS host; overrides the image’s default NGINX configuration |
| On-prem tunnel template | Exposes only channel webhook paths; other ingress paths return 404 |

Sources include [API main](../../../../apps/api/src/main.ts), [environment composition](../../../../apps/api/src/server.ts), [production compose](../../../../deploy/harness/compose.production.yaml), and [mounted proxy configuration](../../../../deploy/harness/proxy/nginx.conf).

I inspected token verification/replay ordering, cookie lookup, tenant resolution, role checks, approval handlers, HMAC webhook verification/reservations, rate-limit hooks, request validation/error envelopes, admin-route scope checks and web transport/state consumers. These inspections found implemented controls, but do not constitute runtime PASS.

| Frozen criterion | I1 assessment |
|---|---|
| Q1 routes/contracts | **FAIL:** session restoration, approval context and bounded-list contracts |
| Q2 identity/tenant/policy/approval | **FAIL:** person-level case authorization; cross-tenant bypass not established |
| Q3 bounded/idempotent runtime | **FAIL in inspected API scope:** unbounded lists and task race; wider runtime delegated |
| Q4 durable worker/data | **FAIL for task mutation/audit boundary**; worker persistence internals outside lane |
| Q5 integration contracts | **NOT_RUN:** production OIDC and separate-host console integration unavailable in this candidate |
| Q6 deploy/health/recovery | **NOT_RUN by I1:** no startup, deployed browser, database outage or recovery execution |
| Q7 evidence/PRD/SPEC consistency | **FAIL:** cited session, approval and pagination requirements remain unmet; Lead’s passing checks require reconciliation with these negatives |

The corporate OIDC and separate-host design are **unintegrated capabilities**, not demonstrated authentication bypasses. The current web transport uses relative paths; API CORS lacks credential allowance; cookies retain the local name. These differ from SPEC0150’s proposed production transport. Production issuer/MFA, HTTPS browser topology, session-store recovery and the six probes above remain explicit evidence gaps.

HEAD was unchanged before/after, and tracked worktree/index checks were clean. An untracked `.audit/` directory appeared during the review; I did not open or alter it. Full source-fingerprint attestation remains with the Lead. **This verdict grants no production authorization.**
