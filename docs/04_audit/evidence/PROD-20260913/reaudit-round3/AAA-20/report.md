# AAA-20 — builder report (reaudit-round3)

- Task: `AAA-20` — "Compor identidade confiável e rotação de credenciais" (`AUD-20260912-F08`), P2/S2, gate `G_SPEC`.
- Round: `PROD-20260913/reaudit-round3`, lane `lane20` (builder). Status: **IMPLEMENTED — pending independent review** (builder output; not VERIFIED).
- Scope honored: only `apps/api/src/main.ts`, `apps/api/src/operator-identity.ts`, `apps/api/src/server.ts`, `packages/shared/src/auth.ts` and their tests; evidence only under this directory. No commit, no reset/clean/checkout; preexisting changes preserved.
- D04 remains PENDING: this lane built the **contract + simulated/injectable implementation**. No real IdP, audience, provider, secret or egress.

## Files changed (sha256)

| File                                                               | sha256                                                             |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `apps/api/src/main.ts`                                             | `58350adf73e399dbd503db0f123bfe531c0b8aa1d69f3950597be2b41d0d1487` |
| `apps/api/src/operator-identity.ts`                                | `6e8af7c746ff5016fa38462a69401e9afce5f7755b5a2eab11f01b0e902da829` |
| `apps/api/src/server.ts`                                           | `2280a49e29bf31663a21efcfc8bb469f4c52132423487035b66215e65eeb2a18` |
| `packages/shared/src/auth.ts`                                      | `6dec8799b7e82f181697a9b27ba09a6d62c77fe012548d4b99bef0fc1d945123` |
| `apps/api/src/__tests__/identity-trusted-resolver.test.ts` (new)   | `87979527cf7b55436a76eccbcbe08fcb7eb9bca2fc3a267f1043f2b1230df0f3` |
| `apps/api/src/__tests__/identity-composition-wiring.test.ts` (new) | `f5518b767033166185c2469098ccd43fd9690ad66bb8782675710bf22dac401d` |
| `apps/api/src/__tests__/identity-key-ring-rotation.test.ts` (new)  | `7dfba8f038b37f3cb853a7f4fb42adda77f62f04915698994537d191d40bdd09` |
| `packages/shared/src/__tests__/auth-identity-mode.test.ts` (new)   | `b20d913b7993a0f3de213564ff3d87220aff58e96fa9bf3d8711a681a23232fa` |

`server.ts` already carried preexisting lane changes before this BUILD; this lane added the identity-mode composition, effective-resolver wrapper, trusted-mode mutation tightening and the mechanical resolver rename. Pre-BUILD hashes are in `contract-note.md`/`manifest.json`.

## What was built

- **Port + mode contract (`packages/shared/src/auth.ts`)**: `OperatorIdentityResolver` port, `IdentityMode` (`simulation|trusted`), `CVG_IDENTITY_MODE`, `parseIdentityMode` (default `simulation` only for `NODE_ENV=test`, otherwise fail-closed `trusted`), `IdentitySigningKey` and `IdentityKeyRingPort`.
- **Resolver contract (`apps/api/src/operator-identity.ts`)**: HMAC tokens now carry `kid`; the resolver enforces signature, `aud`, bounded `iat`/`exp`, `jti` replay cache, and selects keys through the key ring; `createLocalIdentityKeyRing` implements current/previous rotation with `rotationWindowSeconds` (default 3600, cap 86400) and immediate revocation; `createConfiguredOperatorIdentityResolver` builds a resolver from the explicit runtime key ring env.
- **Composition (`apps/api/src/server.ts`)**: `identityMode` option; production cannot compose `simulation`; in `trusted` mode simulation headers never authorize, a resolver is mandatory, resolver identities must be tenant-bound and mutations require identity; `buildServerFromEnv` keeps failing production startup without a resolver and passes the mode through.
- **Entrypoint (`apps/api/src/main.ts`)**: builds the configured resolver and passes it to `buildServerFromEnv`; without key material in production the real process exits 1 (verified by spawning the entrypoint).

## Per-acceptance result

| #   | Acceptance                                                                                                  | Result | Key command / evidence                                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Resolver injected at composition; production startup fails without it (no fake fallback)                    | PASS   | `identity-composition-wiring.test.ts` (resolver pass-through; production and real-entrypoint rejects); `build-server-from-env-boundary.test.ts` green                                           |
| 2   | Trusted claims separated from simulation headers; spoofed role/tenant rejected; invalid identity never fake | PASS   | `identity-trusted-resolver.test.ts` (401 without resolver, 403 spoofed role/tenant, 401 non-tenant-bound, trusted mutations 401, simulation compat 200)                                         |
| 3   | Audience/expiry/replay validated; synthetic and injectable; production requires injected resolver           | PASS   | `trusted-operator-identity.test.ts` (existing, green) + wrong-audience/expired/replay HTTP tests + startup gates                                                                                |
| 4   | current/previous rotation with revocation and bounded window (`IdentityKeyRingPort`)                        | PASS   | `identity-key-ring-rotation.test.ts` (8 tests: window boundary, revocation, `kid` required, invalid configuration)                                                                              |
| 5   | UI session compatible; transition documented                                                                | PASS   | explicit `simulation` test green; `secretary-bootstrap`, `operator-identity-rbac`, `journey-routes-coverage`, `server-boundary-envelope` green; transition in `contract-note.md` §Compatibility |
| 6   | No authorization change beyond needed; journeys/RBAC green                                                  | PASS   | `api-shared-suite.log` (65 files / 383 tests) and `postgres-api.log` (3 files / 51 tests, disposable DB)                                                                                        |

Negative-first: RED log (`red-tests.log`, 19 failing before implementation) precedes the GREEN runs; discriminating negatives are listed in `manifest.json`.

## Gates (exit codes)

- `npm run typecheck` → 0 (`typecheck.log`)
- `npx prettier --check` on the 8 changed files → 0 (`prettier.log`)
- `npx eslint` on the 8 changed files → 0, no findings (`eslint.log`)
- focused vitest (new + `trusted-operator-identity`) → 5 files / 35 tests (`focused-green.log`)
- `npx vitest run apps/api packages/shared --no-file-parallelism --maxWorkers=2` → 65 passed | 1 skipped (66), 383 passed | 18 skipped (401) (`api-shared-suite.log`)
- `TEST_DATABASE_URL=...lane20_r3_15793 npx vitest run --testTimeout=60000 --no-file-parallelism` on the three API postgres files → 3 files / 51 tests (`postgres-api.log`)

## Compatibility impact on existing callers/tests

- `buildServer()` without `identityMode`: unchanged (`test` → simulation headers; other envs → per-request 401 without resolver). No existing test needed new options.
- `buildServerFromEnv`: explicit option → `CVG_IDENTITY_MODE` → process env; production always trusted. Simulated-env tests under `NODE_ENV=test` keep working.
- `requireAuthenticatedMutations` is forced `true` only in trusted mode; simulation-mode tests unchanged.
- `OperatorIdentityResolver` moved to `@cvg/shared` and re-exported by `server.ts` (structurally identical).
- `createTrustedOperatorIdentityResolver`: `secret` optional only alongside `keyRing`; existing validation/error messages preserved.

## Limitations / blockers

- No real identity integration; D04 PENDING, production NO-GO. The env key ring is a runtime-secret HMAC mechanism for controlled composition, not the approved D04 IdP.
- Resolver port is synchronous; remote introspection would need an async revision.
- `main.ts` positive composition is not exercised against a live database (negative startup only). Low-level `buildServer` production without resolver stays per-request 401 to preserve existing production-boundary tests.
- Pre-existing: routes resolving identity twice per request would trip the replay cache with real tokens (unchanged, flagged).
- No blocker for this lane; independent review required before any VERIFIED/DONE.
