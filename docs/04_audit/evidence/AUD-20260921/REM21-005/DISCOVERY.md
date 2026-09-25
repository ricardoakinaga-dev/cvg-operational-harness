# REM21-005 — Discovery

- program: `AUD21-COMPREHENSIVE-REMEDIATION`
- task: `REM21-005`
- finding: `A21-F04`
- source finding: `docs/04_audit/0566_comprehensive_repository_audit_2026-09-21.md:117-120`
- status: `DISCOVERY_COMPLETE / BUILD_AUDIT_RECORDED`
- authorization: `G21-1` only; local, synthetic and disposable
- production: `NO_GO`
- runtime used for inspection: Node `v22.23.2`

## Connected path inspected

The connected path is a Vite/React browser application, not an SSR/RSC
application:

```text
apps/web/src/main.tsx
  -> QueryClientProvider
  -> App.tsx
  -> currentOperatorIdentity()
  -> apiClient.operatorInit(identity)
  -> configured AuthHeadersProvider
  -> Fastify /v1 route
  -> requireOperatorIdentity()
  -> trusted resolver or controlled simulation parser
```

The current browser path is unsafe for a qualified profile:

- `apps/web/src/api/client.ts` defaults `ApiClientOptions.auth` to
  `simulationAuthHeaders`, which emits `x-operator-id`, `x-operator-role` and
  `x-tenant-id` from caller-provided values;
- `apps/web/src/App.tsx` owns editable operator, role and tenant fields and
  derives client-side capability flags from them; the Admin panel is selected
  by those same fields;
- `apps/web/src/main.tsx` only composes the query provider and never bootstraps
  a server-owned identity/session;
- `ApiSession` already keeps a token in memory and clears it on identity change
  or `401`, but no runtime composes it with `App` or with a session endpoint;
- the API has trusted HMAC identity resolution and explicit test-only
  simulation mode, but no browser session bootstrap endpoint;
- trusted operator tokens carry `iat`, `exp` and `jti`, and the resolver
  rejects the same token on a second request. Therefore a reusable browser
  bearer token cannot be introduced as a shortcut without reopening
  `REM21-003`;
- the existing Playwright project declares Chromium only and its current
  journeys type operator, role and tenant values into the UI.

## Reproduction of the finding

The following static observations reproduce the authority injection without
requiring a server or any real data:

1. The initial `App` state contains `role: 'Operator'` and no server session.
2. Typing `Admin` in `Papel operacional` changes `canReviewEvidence` and
   renders `PlatformPanel` without a server-authenticated identity transition.
3. Typing another `Tenant ID` changes every API request header and the UI
   scope summary.
4. `resetApiClientOptions()` restores simulation headers, so a qualified
   build cannot safely inherit the current default.

This is an `E1` static finding. It does not assert a production exploit or
external identity compromise; it proves that the browser currently presents
self-asserted authority to the API in the default composition.

## Requirements and boundaries

### Facts

- `CURRENT`: the API's trusted resolver validates signed identity claims and
  tenant binding; trusted mode does not fall back to simulation headers.
- `CURRENT`: the resolver's `jti` replay fence is intentionally one-use per
  request token, including the existing cross-request replay negative test.
- `CURRENT`: all work is local and uses synthetic fixtures only.
- `UNKNOWN`: an approved external IdP, browser-facing BFF, cookie/session
  authority, production key custody and cross-browser qualification do not
  exist in this repository.

### Non-negotiable invariants

1. The browser never chooses `operatorId`, role or tenant as authority.
2. The API remains the authorization owner for actor, role, resource and
   tenant; UI flags are only a usability projection.
3. Expired, missing, revoked or invalid session state reaches no protected
   operation and is represented as a reauthentication state.
4. A one-use signed bootstrap token is not reused as a long-lived bearer.
5. A tenant transition invalidates the old browser scope before new data is
   rendered; late responses cannot repopulate the old scope.
6. Simulation remains available only in an explicitly controlled test profile;
   it is not the default of a development/production build.
7. No token or session secret is written to localStorage, sessionStorage, URL,
   logs, screenshots or durable application data.
8. Local in-memory sessions are non-durable and cannot qualify production.

## Selected direction for PRD/SPEC

Use a one-time trusted-token bootstrap into an explicitly injected server-side
session store. `GET /v1/session` authenticates the signed bootstrap token,
creates a short-lived local session and returns only the server-resolved
identity plus expiry; the response sets an `HttpOnly`, `SameSite=Strict`
session cookie. Subsequent API calls use `credentials: include` and resolve
the session on the server, so the one-use token is not replayed. Logout revokes
the server session and clears the cookie.

The local implementation may provide an in-memory session store only in the
controlled test/homolog profile. A production composition must inject a
durable/owned session authority or fail closed; this task does not invent an
IdP, provider, channel, credential or production signoff.

The trusted web bootstrap receives a token only through an explicit runtime
bridge owned by the host/test harness. It does not expose editable identity
fields and does not decode claims in the browser. If the bridge or local
session authority is absent, the UI remains locked in `authentication_required`
and does not send simulation headers.

## State and ownership map

| State                                   | Class                    | Source of truth                         | Owner                   | Browser representation                                                               |
| --------------------------------------- | ------------------------ | --------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------ |
| resolved identity, role, tenant, expiry | `session` / server       | trusted resolver + session store        | API/session authority   | read-only snapshot                                                                   |
| bootstrap token                         | `session`                | host/IdP/test bridge                    | runtime boundary        | memory during bootstrap only                                                         |
| session status                          | `workflow_state_machine` | bootstrap/401/expiry/logout transitions | web session coordinator | `loading`, `authenticated`, `authentication_required`, `expired`, `reauthenticating` |
| selected conversation/session           | `local_ui`               | current component                       | App                     | ephemeral, scope-bound                                                               |
| conversations, approvals, tasks, audit  | `server`                 | API                                     | API/persistence         | query results, invalidated on session/tenant change                                  |
| role-based button visibility            | `derived`                | server-owned identity snapshot          | App                     | hint only; server rechecks                                                           |
| URL navigation                          | `url_navigation`         | browser/router                          | browser                 | no identity or tenant claims                                                         |

## Trust boundary and user journey

```text
host/IdP/test bridge -- one-use signed token --> API /v1/session
API verifies signature/issuer/audience/time/jti and binds tenant
API creates local session + HttpOnly cookie
browser receives read-only identity/expiry
browser requests data with cookie
API resolves cookie session and enforces authorization/RLS
401/expiry/logout -> revoke/clear scope -> reauthentication state
```

The browser is an untrusted presentation layer. It may hide an Admin panel for
an Operator, but it cannot grant Admin capability; only the API can do that.

## Evidence required before BUILD is considered verified

- `E1`: qualified bundle/config contains no editable operator/role/tenant
  controls and no simulation auth default;
- `E2`: typecheck, lint and build pass with the trusted composition;
- `E3`: component tests cover loading, authenticated, expired, unauthorized,
  logout and late-response scope isolation;
- `E4`: API boundary tests cover signed bootstrap, malformed/tampered/expired
  token, cookie session, logout, role authorization and tenant isolation;
- `E4/E6`: browser test uses only synthetic signed fixtures and proves login,
  expiry/401 reauth, authz denial and tenant isolation;
- `E7`: independent fresh-context review of the connected path. No such review
  is claimed at Discovery time.

## Discovery decision

`REM21-005` is ready for PRD/SPEC. The task is not ready for production or
external IdP validation. The remaining external handoff is G21-5 for a real
session authority, cookie topology, key custody, browser matrix and operational
signoff.
