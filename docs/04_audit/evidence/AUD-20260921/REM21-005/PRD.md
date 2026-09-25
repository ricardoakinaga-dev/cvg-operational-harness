# REM21-005 — Product Requirements

- program: `AUD21-COMPREHENSIVE-REMEDIATION`
- task: `REM21-005`
- finding: `A21-F04`
- status: `PRD_COMPLETE / BUILD_AUDIT_RECORDED`
- scope: local, synthetic, disposable under `G21-1`
- production: `NO_GO`

## Problem

The console currently lets a browser user type an operator ID, role and tenant
and immediately uses those values to choose UI capabilities and API headers.
That is a controlled simulation, but it is the default composition of the web
application and is visually indistinguishable from a qualified operator
session. The browser therefore presents authority instead of consuming
server-owned identity.

## Desired outcome

The qualified web composition starts locked, obtains a server-resolved,
tenant-bound identity from a signed bootstrap/session contract, and exposes
only read-only session context. Authentication loss, expiry, logout and tenant
scope changes clear operational data and return to a reauthentication state.
The controlled simulation remains usable for unit/E2E fixtures only when an
explicit test profile enables it.

## Users and journeys

### J1 — Trusted bootstrap

1. User opens the console.
2. The shell announces that authentication is being established.
3. The host/test bridge supplies a synthetic one-use signed token; no identity
   form is shown.
4. The API verifies it, creates a short-lived session and returns resolved
   operator, role, tenant and expiry.
5. The console renders data and actions permitted by that server snapshot.

### J2 — Session loss and recovery

1. The session expires, is revoked, or an API call returns `401`.
2. In-flight/late data is ignored and sensitive operational panels are cleared.
3. The shell announces `Sessão expirada. Reautentique-se para continuar.`
4. A host-owned reauthentication action can provide a new bootstrap token.
5. If no bridge is available, the console remains locked; it does not fall back
   to typed simulation fields.

### J3 — Logout and tenant boundary

1. The user activates `Encerrar sessão`.
2. The API revokes the server session and clears its cookie.
3. The client clears identity, query state and selected resources.
4. A subsequent login with a different synthetic tenant renders only that
   tenant's results; late responses from the first tenant are discarded.

### J4 — Authorization projection

An Operator may see an approval row but cannot approve it; an Approver or
Supervisor may see the relevant approval action; an Admin may see the platform
panel only when the API returned that role. UI visibility is a projection, not
an authority grant. Direct API calls with forged role/tenant data remain denied.

## Functional requirements

- FR-01: Provide a typed `GET /v1/session` bootstrap contract that accepts a
  trusted one-use token, returns the server-resolved identity and expiry, and
  sets a session cookie only after authentication succeeds.
- FR-02: Resolve subsequent protected requests from the server-side session;
  do not require the browser to repeat the consumed bootstrap token.
- FR-03: Provide an explicit logout operation that revokes the session and
  clears the cookie; make it safe to repeat.
- FR-04: Include `operatorId`, `role`, `tenantId` and `expiresAt` in the
  response only as server-owned read data. The browser must not submit any of
  these fields as authority.
- FR-05: Make absence of a trusted bootstrap source a locked, actionable state.
- FR-06: Make simulation headers and editable identity controls available only
  under the explicit test profile; the trusted/default bundle must not contain
  those controls or default provider bytes.
- FR-07: Clear or invalidate all tenant-scoped query/view state on identity,
  tenant, expiry, 401 and logout transitions.
- FR-08: Keep server RBAC and tenant isolation unchanged as the final authority.
- FR-09: Provide accessible loading, authenticated, expired, unauthorized,
  reauth, empty and error states with a live status announcement and keyboard
  reachable logout/reauth action.
- FR-10: Do not persist bootstrap tokens or session secrets in browser storage,
  URL parameters, application payloads or logs.

## Non-functional requirements

- NFR-01: The session store is bounded by expiry and has deterministic cleanup;
  the local implementation is explicitly non-durable.
- NFR-02: Bootstrap and logout responses use the existing API envelope and
  redacted stable errors (`unauthorized`, `configuration_error` or equivalent)
  without exposing claims, signatures or tenant existence.
- NFR-03: Cookie defaults are `HttpOnly`, `SameSite=Strict`, path `/`,
  `Secure` when HTTPS is required, and `Cache-Control: no-store` on session
  routes.
- NFR-04: The API never trusts the client identity snapshot or `x-tenant-id`
  to widen a trusted session's scope.
- NFR-05: No production session store, IdP, secret, channel or real data is
  created by this task.

## Acceptance criteria

| ID    | Criterion                                                                                          | Minimum evidence                          |
| ----- | -------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| AC-01 | Trusted/default web build has no editable operator, role or tenant controls.                       | bundle/config inspection + component test |
| AC-02 | Missing/invalid/tampered/expired bootstrap cannot open the console.                                | API negative tests + UI error state       |
| AC-03 | Valid synthetic signed bootstrap returns server identity and session cookie.                       | API integration test                      |
| AC-04 | Replaying the consumed bootstrap token is rejected; cookie session continues without replaying it. | replay/session integration test           |
| AC-05 | Logout revokes the session and repeated logout is harmless.                                        | API + component test                      |
| AC-06 | `401` and expiry clear tenant data and expose reauthentication state.                              | component/browser test                    |
| AC-07 | Forged role or tenant headers cannot elevate or cross tenant.                                      | API authz/tenant negative tests           |
| AC-08 | Simulation remains opt-in and explicit for controlled tests only.                                  | config/bundle negative test               |
| AC-09 | Trusted UI exposes no secret/token in storage, URL, logs or rendered identity fields.              | browser inspection/static assertions      |
| AC-10 | Typecheck, lint, formatting and affected regression pass under Node 22.                            | E2/E3 regression commands                 |

## Out of scope / blocked

- Real IdP login, SSO redirect, MFA, enterprise cookie topology or key custody;
- durable multi-instance session storage and session revocation propagation;
- production browser matrix, CSP/CSRF signoff and release certification;
- any real operator, tenant, patient, appointment, provider or channel data;
- changing server permission semantics or granting clinical, financial or
  definitive-record actions.

Those items remain a G21-5/G21-6 handoff and cannot be inferred from local
synthetic evidence.
