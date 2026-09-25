# REM21-005 — Technical Specification

- program: `AUD21-COMPREHENSIVE-REMEDIATION`
- task: `REM21-005`
- finding: `A21-F04`
- status: `SPEC_COMPLETE / BUILD_AUDIT_RECORDED`
- implementation scope: local, synthetic and disposable
- production: `NO_GO`

## Selected architecture

Use a one-time trusted-token bootstrap followed by an explicitly owned
server-side session:

```text
runtime bridge -> GET /v1/session with x-cvg-operator-token
API trusted resolver -> signed claims + jti claim
API session store -> opaque session id, identity, absolute expiry
Set-Cookie: cvg_operator_session=...; HttpOnly; SameSite=Strict; Path=/
web ApiSession -> read-only identity/expiry, credentials: include
protected route -> server session resolver -> RBAC + tenant scope
401/expiry/logout -> revoke/clear -> authentication_required
```

The one-use token is never reused after bootstrap. A cookie session is an
opaque server-side reference, not a browser-supplied operator/role/tenant
claim. The local store is an injected in-memory implementation with expiry
cleanup; no production default is allowed.

## Contract types

### Server session port

```ts
export interface OperatorSessionRecord {
  sessionId: string
  identity: OperatorIdentity // tenant-bound in trusted mode
  expiresAt: number // epoch milliseconds, absolute
}

export interface OperatorSessionStore {
  create(input: {
    identity: OperatorIdentity
    expiresAt: number
  }): Promise<OperatorSessionRecord>
  get(sessionId: string): Promise<OperatorSessionRecord | null>
  revoke(sessionId: string): Promise<void>
}
```

The store must reject blank/oversized IDs, reject expired records, and never
return an identity for a revoked or expired record. `create` must not extend
the trusted token's expiry. A durable implementation is a later owner task.

### API response

`GET /v1/session`:

```json
{
  "success": true,
  "data": {
    "identity": {
      "operatorId": "operator.synthetic",
      "role": "Supervisor",
      "tenantId": "tenant_00000000-0000-4000-8000-000000000901"
    },
    "expiresAt": "2026-09-21T20:00:00.000Z"
  },
  "error": null,
  "meta": { "correlationId": "..." }
}
```

The response never returns the raw token, signature, `jti`, key ID or session
ID. It sets `Cache-Control: no-store` and the opaque cookie. Missing session
store is a fail-closed configuration error in the trusted composition, not a
simulation fallback.

`POST /v1/session/logout` is idempotent: it revokes the cookie-backed session
when present, clears the cookie, returns `204` or the standard success envelope
without identity data, and does not require the browser to submit an identity.

### Cookie contract

- name: `cvg_operator_session`;
- value: opaque random ID, never identity JSON or a signed client-readable
  claim;
- `HttpOnly`, `SameSite=Strict`, `Path=/`, `Secure` when HTTPS is enforced;
- bounded `Max-Age`/`Expires` at the session expiry;
- no token/cookie value in runtime logs or API data;
- local test harness may use an HTTP-compatible cookie because it is disposable;
  production secure-cookie policy remains unqualified.

## Server request resolution

1. In trusted mode, if `cvg_operator_session` is present and a session store is
   injected, resolve the opaque session and enforce tenant-bound identity.
2. Otherwise, resolve `x-cvg-operator-token` through the existing signed
   resolver, including issuer/audience/time/signature and post-auth `jti`
   replay checks.
3. Never parse simulation headers in trusted mode.
4. For `GET /v1/session`, require a fresh trusted token and create the cookie
   only after the resolver returns a valid tenant-bound identity and expiry.
5. For simulation mode, retain the existing controlled headers only when the
   mode was explicitly selected by a test fixture; no cookie session is used by
   the qualified path.

The session resolver must be request-scoped and must not cache an identity by
attacker-controlled cookie across revocation. The existing effective resolver
memoization remains limited to the same request headers object.

## Frontend composition

### Runtime mode

```ts
type WebIdentityMode = 'trusted' | 'simulation'
```

- default: `trusted` for Vite development/production builds;
- `simulation`: allowed only in Vitest or when the Playwright command
  explicitly sets a test-only web identity mode;
- an invalid mode fails closed at startup/build configuration;
- trusted mode does not render `ID do operador`, `Papel operacional` or
  `Tenant ID` inputs.

### Session coordinator

`ApiSession` is extended/used as the single in-memory session snapshot:

```ts
type WebSessionStatus =
  | 'loading'
  | 'authenticated'
  | 'authentication_required'
  | 'expired'
  | 'reauthenticating'

interface TrustedWebSession {
  identity: OperatorIdentity
  expiresAt: string
}
```

The coordinator owns `status`, `session`, generation and `lastError`. It
clears the snapshot and advances generation on logout, expiry or 401. All
App data effects are gated by the generation/scope token already used for
tenant race protection. It does not decode a token or write browser storage.

### Runtime bootstrap bridge

The browser receives a one-use bootstrap token only from an explicit host/test
bridge, represented by a narrow provider interface. The bridge is not a form,
query parameter, localStorage entry or hard-coded bundle secret. If the bridge
returns no token, bootstrap fails closed with `authentication_required`.

The bridge is a local/test seam for this task. An external IdP/BFF must own the
real implementation and is not claimed by this specification.

### UI states

- `loading`: concise status text and inert/empty operational panels;
- `authenticated`: read-only operator/role/tenant summary, expiry hint,
  logout button, and permitted panel affordances;
- `authentication_required`: explain that a trusted session is required and
  expose a host-owned retry/reauth action when available;
- `expired`: announce expiry and prevent actions until reauthentication;
- `error`: show a safe message and correlation-free retry affordance; never
  show token/claim/signature details.

Use a `role="status"` live region for transitions, preserve keyboard focus on
logout/reauth, and do not rely on color alone for session state.

## Data, authorization and failure boundaries

| Boundary                                 | Owner                       | Failure behavior                               |
| ---------------------------------------- | --------------------------- | ---------------------------------------------- |
| token signature/issuer/audience/time/jti | trusted API resolver        | `401`, no session creation                     |
| bootstrap-to-session creation            | session store/API           | fail closed; no cookie if create fails         |
| cookie session lookup/revocation         | session store/API           | `401`, clear stale cookie, no data             |
| role/resource/tenant authorization       | API route + persistence/RLS | `401/403`, never UI-only denial                |
| UI capability flags                      | web projection              | hidden/disabled only; cannot elevate           |
| query/view data                          | API/persistence             | clear on generation change; ignore late result |
| logout                                   | API + coordinator           | revoke/clear, repeatable, local state cleared  |

No mutation is retried by the session coordinator. `GET` reads retain the
existing bounded retry policy, but a `401` is never retried with a stale
credential. Cookie/session routes use `no-store` and bounded timeout handling.

## Candidate comparison

| Candidate                                                 | Decision             | Reason                                                                                                                        |
| --------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Keep editable simulation fields                           | reject               | reproduces A21-F04 and makes authority injection the default                                                                  |
| Decode a JWT in the browser and trust its claims          | reject               | browser decoding is not authentication; claims are client-controlled presentation data                                        |
| Persist a bearer in localStorage and reuse it             | reject               | XSS/persistence exposure and conflicts with one-use `jti` replay contract                                                     |
| Send a fresh signed token on every API request            | defer                | requires an external token issuer/refresh protocol and creates concurrency races; belongs to G21-5 unless an owner injects it |
| Same-origin opaque server session after one-use bootstrap | select               | smallest design that preserves the existing replay fence and keeps identity authority server-side                             |
| Durable distributed session store now                     | reject for this task | required for production, but needs owner, topology, expiry/revocation and operational qualification not authorized by G21-1   |

## Test contract

### API/integration

- valid signed bootstrap creates cookie and returns identity/expiry;
- missing, malformed, tampered, wrong issuer/audience, future and expired
  tokens return `401` and set no session;
- reusing the consumed bootstrap token fails while the opaque cookie continues
  to authorize within expiry;
- expired/revoked/unknown cookie returns `401` and cannot read a tenant route;
- logout revokes a session, clears cookie and is safe to repeat;
- simulation role/tenant headers cannot override trusted identity;
- Operator cannot perform Approver/Admin actions and tenant A cannot read
  tenant B via cookie/header mutation;
- session store create/get/revoke is bounded, cleanup-safe and fail-closed.

### Frontend/component

- trusted/default render has no identity editing controls;
- bootstrap loading, success, missing bridge, expiry, 401, logout and retry
  states are accessible and generation-safe;
- late tenant A response cannot overwrite tenant B after a new session;
- trusted requests use cookies and never emit simulation headers;
- no token appears in storage, URL, DOM or logs;
- explicit simulation test profile preserves existing controlled fixtures.

### Browser/E2E

Use only synthetic signed tokens and an ephemeral session store. Prove login,
role authorization, tenant isolation, logout/reauth and expiry. Existing
simulation journeys must set their test mode explicitly. Chromium is the
currently executable browser; Firefox/WebKit remain `NOT_RUN` until REM21-014
or an authorized browser matrix is supplied.

## Rollout, rollback and limits

- additive API routes and an optional session-store dependency first;
- keep existing simulation tests behind explicit test configuration;
- trusted/default web path fails closed if bootstrap/session authority is absent;
- rollback is removing the new composition and evidence only in the same local
  worktree; do not rewrite historical AUD20 evidence;
- no migration is required for the in-memory local store;
- a durable production store, CSRF/cookie topology, IdP integration and
  multi-instance revocation are unresolved G21-5 requirements.

## Build gate

BUILD may start only after this SPEC is recorded and the task is marked
`SPEC_READY / BUILD_LOCAL_AUTHORIZED` in the operational records. The first
BUILD step is a RED test for the current editable-field/default-simulation
behavior; a green test without that negative reproduction does not close
`A21-F04`.
