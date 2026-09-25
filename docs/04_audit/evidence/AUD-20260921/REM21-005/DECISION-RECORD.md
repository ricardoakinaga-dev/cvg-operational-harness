# REM21-005 — Frontend/backend identity decision record

## Problem and desired outcome

The browser currently owns editable operator, role and tenant values and sends
them as simulation authority. The qualified console must consume a
server-resolved tenant-bound identity and remain locked when no trusted
session exists.

## Current evidence and unknowns

- `apps/web/src/App.tsx` renders the identity fields and derives authorization
  affordances from them.
- `apps/web/src/api/client.ts` defaults to `simulationAuthHeaders`.
- `apps/web/src/main.tsx` has no session bootstrap.
- `apps/api/src/operator-identity.ts` verifies signed claims and rejects replayed
  `jti` values; the API has no browser session endpoint.
- no external IdP, durable session store, key custody, production cookie
  topology or multibrowser qualification is available in this local scope.

## Constraints and forces

- preserve the REM21-003 one-use replay fence;
- keep unit/E2E fixtures synthetic and local;
- remove authority injection from the default bundle without pretending that
  an IdP or production session service exists;
- keep server-side RBAC/tenant isolation authoritative;
- minimize added modules and avoid a client-side global authority store.

## Invariants and legal states

`authentication_required -> loading -> authenticated -> expired /
authentication_required`; `authenticated -> reauthenticating -> authenticated`
is legal only after a new server-validated bootstrap. Logout always clears the
session and tenant-scoped data. A consumed bootstrap token cannot be reused.

## Candidates

1. Keep editable simulation fields — rejected as the finding itself.
2. Decode and trust browser claims — rejected because the browser is not an
   authorization boundary.
3. Reuse a bearer from localStorage — rejected for secret exposure and replay
   conflict.
4. Fresh signed token per request — deferred because it requires an external
   issuer/refresh protocol and introduces concurrent token sequencing.
5. One-use signed bootstrap into an opaque HttpOnly server session — selected
   as the minimum local design.
6. Durable distributed session store — deferred to the production owner/G21-5.

## Selected design and rationale

Add a typed session API and an injected `OperatorSessionStore`. The API consumes
one trusted bootstrap token, stores the server-resolved identity/expiry under
an opaque session ID, sets a short-lived `HttpOnly; SameSite=Strict` cookie and
resolves later requests from that store. The web session coordinator owns only
an in-memory read snapshot and uses `credentials: include`; it never chooses
the role or tenant and never persists the bootstrap token.

## Complexity budget

- implementation: one server session port/store, two session routes, one web
  session coordinator and explicit mode composition;
- runtime: one extra bootstrap request and an in-memory local session lookup;
- operations: local store cleanup and explicit `NO_GO` when durable authority is
  absent;
- cognition/tests: API contract, negative authz, component state and browser
  recovery tests;
- migration: no database migration; additive route/config rollout.

## Boundaries

- trust: signed token resolver and server session store;
- authorization: API route and persistence/RLS, never React state;
- data: session identity is minimal and tenant-bound; no payload/session ID is
  returned to the browser beyond the read-only snapshot;
- consistency: session expiry/revocation is authoritative on every request;
- retry: no auth retry with stale credentials; only existing bounded GET retry;
- recovery: logout/revoke/reauth clears generation and tenant-scoped views.

## Failure, security and observability

Missing authority, malformed/tampered/expired token, store failure, revoked
cookie and expired session all fail closed. Session endpoints return `no-store`
and safe envelope errors. Correlation IDs may be retained in response metadata,
but raw tokens, claims, cookie values and tenant payloads are not logged.

## Verification and evidence levels

- `E1/E2`: bundle/config, typecheck, lint and build;
- `E3`: component/session state and API client tests;
- `E4`: Fastify session/authz/tenant boundary and Playwright synthetic flow;
- `E6`: replay, expiry, revocation, late-response and missing-store failures;
- `E7`: fresh-context review. No independent verdict is claimed before AUDIT.

## Unresolved risks and handoffs

Real IdP/BFF integration, durable multi-instance revocation, cookie secure/CSRF
policy, browser matrix and production signoff remain `G21-5`/`G21-6` work. A
local in-memory pass cannot close the production part of `A21-F04` or change
the global `NO_GO`.
