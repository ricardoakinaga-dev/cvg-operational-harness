# AAA-20 — contract note (reaudit-round3 builder)

- Task: `AAA-20` — "Compor identidade confiável e rotação de credenciais" (P2/S2, gate `G_SPEC`, role integration; finding `AUD-20260912-F08`).
- Round: `PROD-20260913/reaudit-round3`; builder lane; local reversible work, synthetic data, no real IdP/audience/provider/secret/egress, no production, no commit.
- Owned paths: `apps/api/src/main.ts`, `apps/api/src/operator-identity.ts`, `apps/api/src/server.ts`, `packages/shared/src/auth.ts` + their tests. Evidence path: `docs/04_audit/evidence/PROD-20260913/reaudit-round3/AAA-20/`.
- Candidate: working tree at HEAD `512bc11` (dirty; preexisting changes preserved; no `git reset/clean/checkout`).
- D04 remains PENDING: this lane builds the **contract and a simulated/injectable implementation**, not a real integration. Production still requires a real injected resolver; nothing here approves D04 or production.

## Baseline observed before editing

| Artifact                            | sha256 (pre-BUILD)                                                 |
| ----------------------------------- | ------------------------------------------------------------------ |
| `apps/api/src/main.ts`              | `8ea9a2d607934fb75a3565165587a715ed55b4f9a62f3d2b28fe1783ddceae50` |
| `apps/api/src/operator-identity.ts` | `85f1226d763f76564db582d00f760f920971f4c57443698535394df4a28037ee` |
| `apps/api/src/server.ts`            | `5804ef6e929208166c84c14caf12a1eb1693fb538e784914270698cb211636f8` |
| `packages/shared/src/auth.ts`       | `ef3d2083697510e8e2f5b3dd3030429972b17d0590d0746b18ef66c2ccfaa657` |

Baseline behavior relevant to the finding:

- `buildServerFromEnv` already requires an injected resolver in the production PostgreSQL branch, but `main.ts` calls it with no options (F08).
- `resolveOperatorIdentity` silently falls back to `parseOperatorIdentity(headers)` when `NODE_ENV === 'test'` even if a trusted-resolver deployment was intended; and there is no explicit distinction between simulation headers and trusted claims.
- `operator-identity.ts` already validates HMAC signature, `aud`, `iat`/`exp`, bounded lifetime and replay (`jti` cache), and accepts a `secret` array (previous secret) — but there is no key-ring port, no `kid` binding, no explicit revocation and no bounded rotation window.

## Acceptance mapping (backlog AAA-20)

| #   | Acceptance                                                                                                              | Plan                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Resolver injected in composition; production startup fails without resolver (no fake fallback)                          | `main.ts` builds a resolver from an explicit env key ring (runtime secret mechanism, synthetic in tests) and passes it to `buildServerFromEnv`; `buildServerFromEnv` keeps failing production startup without a resolver; `identityMode` is passed through to `buildServer`; low-level `buildServer` (test fixture API) stays fail-closed per request (401) to preserve the existing production-boundary assertions. |
| 2   | Trusted claims separated from simulation headers; spoofed role/tenant rejected; invalid identity never becomes fake     | New `CVG_IDENTITY_MODE=simulation                                                                                                                                                                                                                                                                                                                                                                                    | trusted`(or`identityMode`option). Default:`test`→`simulation`, otherwise `trusted`. In `trusted`, `x-operator-id`/`x-operator-role`/`x-tenant-id` never authorize; a trusted resolver is mandatory, returned identities must be tenant-bound, mutations require identity, and header/resolver tenant mismatch stays 403. |
| 3   | Audience/expiry/replay in the resolver contract, synthetic and injectable; production requires a real injected resolver | Key-ring-backed HMAC token contract in `operator-identity.ts` (audience, bounded lifetime, clock skew, replay cache) exercised over HTTP with synthetic secrets; production startup requires the resolver (injected or from the explicit runtime key-ring env), never the simulation headers.                                                                                                                        |
| 4   | Rotation current/previous with revocation and bounded window (`IdentityKeyRingPort`)                                    | Port in `packages/shared/src/auth.ts`; deterministic local implementation in `operator-identity.ts` with `kid`, current/previous keys, `rotationWindowSeconds` (default 3600, max 86400), explicit `revokedKeyIds`, per-request `keysAt(now)`. No real credential.                                                                                                                                                   |
| 5   | UI session compatible; document the transition                                                                          | Test/default `simulation` mode keeps the current header flow working unchanged; `development` keeps failing closed by default and can opt in to `simulation` explicitly; the transition to `trusted` is `CVG_IDENTITY_MODE=trusted` + resolver injected.                                                                                                                                                             |
| 6   | No authorization change beyond what is necessary; journeys/RBAC stay green                                              | Role/permission tables untouched; existing resolver-based and simulation-based tests remain; only trusted mode tightens (no header fallback, tenant-bound identity, authenticated mutations).                                                                                                                                                                                                                        |

## Negative-first test plan (write RED before implementation)

1. `apps/api/src/__tests__/identity-trusted-resolver.test.ts`
   - trusted + no resolver: simulation headers alone → 401 (even in `NODE_ENV=test`);
   - trusted + resolver: spoofed `x-operator-role` does not grant admin; spoofed `x-tenant-id` mismatch → 403; tenant-less trusted identity → 401;
   - trusted forces authenticated mutations; explicit simulation still authorizes headers.
2. `apps/api/src/__tests__/identity-composition-wiring.test.ts`
   - `buildServerFromEnv` passes the injected resolver to `buildServer` (simulation headers → 401; valid token → 200);
   - wrong audience, expired and replayed tokens over HTTP → 401;
   - `CVG_IDENTITY_MODE` unknown value and production `simulation` fail startup.
3. `apps/api/src/__tests__/identity-key-ring-rotation.test.ts`
   - current/previous within window OK; previous past window rejected; revoked key rejected; unknown/missing `kid` rejected; mismatched `kid`/signature rejected; bounded window and duplicate/weak key configuration rejected; env key-ring factory (`createConfiguredOperatorIdentityResolver`) works and sanitizes invalid input.
4. `packages/shared/src/__tests__/auth-identity-mode.test.ts`
   - `parseIdentityMode` defaults/values/unknown fail-closed.

## Compatibility / transition

- `buildServer()` without `identityMode` keeps today's behavior: `NODE_ENV=test` → simulation headers; anything else → resolver mandatory (per-request 401 without one). No existing test needs a new option.
- Production composition: `CVG_IDENTITY_MODE` defaults to `trusted`; `simulation` is rejected at startup.
- UI/console keeps sending simulation headers for controlled test/dev flows; switching an environment to `trusted` requires the token key ring (or an injected resolver) and the UI must present trusted claims. This transition is documented here, not executed.

## Limits

- No real IdP, protocol, audience mapping, secret or egress; the key ring is a local deterministic HMAC contract for controlled tests.
- The resolver API is synchronous (in-process); a remote introspection adapter would require an async port revision.
- `main.ts` entrypoint wiring is exercised indirectly through the env factory it composes; process-level startup is covered by the existing startup-failure tests.
- No production/VERIFIED claim: this is builder output for independent review.
