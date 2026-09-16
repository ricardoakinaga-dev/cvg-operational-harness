# PROD-20260913 — reaudit round 3, wave review (AAA-19 / AAA-20)

- Reviewer: fresh independent critic (no prior context on this wave; did not build or review it)
- Candidate: working tree at HEAD `512bc11`, branch `main`, dirty tree preserved (no clean/commit/reset)
- Scope: lane AAA-19 (worker tests only), lane AAA-20 (trusted identity composition), M1 regression duty (PROD-06, AAA-22) on these bytes
- Owned paths: read-only; critic wrote only under `docs/04_audit/evidence/PROD-20260913/reaudit-round3/wave-review/` and `/tmp/opencode`
- Verdict: **REWORK** — one material P1 finding on the AAA-20 composition (WAVE3-01); lanes otherwise sound and M1 regression holds

## 1. Fingerprint (real bytes, before vs after)

|                         | value                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Set                     | tracked+untracked non-ignored product/config/test sources: `apps/**`, `packages/**`, `tests/**`, `scripts/**`, `deploy/**`, `package.json`, `package-lock.json`, `Dockerfile`, `tsconfig*`, `*.mts`, `eslint.config.js` (excludes node_modules/dist/coverage/test-results and certification outputs) |
| Count                   | 544 files                                                                                                                                                                                                                                                                                            |
| BEFORE aggregate sha256 | `a5480a6c9cad5061467553ac3497b529b1696084ffae4c8a6a89451b85e9f8e3`                                                                                                                                                                                                                                   |
| AFTER aggregate sha256  | `a5480a6c9cad5061467553ac3497b529b1696084ffae4c8a6a89451b85e9f8e3`                                                                                                                                                                                                                                   |
| Delta                   | **zero changes** (`fingerprint-before.json` == `fingerprint-after.json`)                                                                                                                                                                                                                             |

Method: `git ls-files -co --exclude-standard` -> include filter -> per-file sha256 -> aggregate over sorted `sha256␠␠path` lines (`fingerprint.py`, copied in this directory). Recomputed after all runs: identical.

Independent byte provenance for the lane baselines: `/tmp/cvg-m1-round2-ixwtdmce/candidate` still exists and its hashes match the AAA-20 recorded pre-BUILD baselines and `reaudit-round2/manifest.json`:

- `apps/api/src/server.ts` `5804ef6e…` (matches AAA-20 contract note)
- `apps/api/src/operator-identity.ts` `85f1226d…`
- `apps/api/src/main.ts` `8ea9a2d6…`
- `packages/shared/src/auth.ts` `ef3d2083…`

Changed-vs-round2 census (non-certification): 6 code/test files — the 4 AAA-20 product files, the 2 AAA-19 modified test files — plus 1 new AAA-19 test file, 4 new AAA-20 test files and docs. `package.json`, `package-lock.json`, tsconfig, eslint/prettier/vitest configs are byte-identical to round 2.

## 2. Environment

- Node v22.23.2 (`/home/ricardo/.nvm/versions/node/v22.23.2/bin`), npm 10.9.8
- PostgreSQL 16.15 at `127.0.0.1:55481`, user `cvg_prod` (trust); critic databases `critic_wave3`, `critic_wave3_copy`; port 5432 never touched
- Disposable schema-per-test pattern used by the suites; no real data, provider, channel, IdP or external effect
- Full command ledger and probe log index: `ENVIRONMENT.md` (same directory)

## 3. Lane AAA-19 (worker) — verdict PASS (lane scope)

Claim audited: 5 negative-first discriminating tests, **no product changes**.

Byte proof (vs round-2 candidate, which matches the frozen manifest):

- All `apps/worker/src` product files byte-identical to round 2 except the one new test file (`diff -rq` shows only `continuous-worker-entrypoint.integration.test.ts` as new). `apps/worker/src/main.ts` sha256 `9138a3d0…` equals the frozen candidate hash.
- Test deltas are purely additive: `continuous-worker.test.ts` `+116/-0` lines and test count 23 -> 25; `postgres-controlled-hardening.test.ts` `+32/-0` and 7 -> 8; new entrypoint file has 2 DB-conditional tests. The only `-` line in each `diff -u` is the file header.

Executed evidence (all on the current bytes):

| Gate                                                                                                                                     | Exit | Result                                                            |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ---- | ----------------------------------------------------------------- |
| focused vitest (`continuous-worker`, `postgres-controlled-hardening`, `continuous-worker-entrypoint.integration`) with TEST_DATABASE_URL | 0    | included in 10 files / 93 tests, 0 failed, 0 skipped              |
| full `npx vitest run apps/worker` with TEST_DATABASE_URL                                                                                 | 0    | 15 files / 91 tests, 0 skipped (matches builder claim)            |
| `npm run test:postgres`                                                                                                                  | 0    | 19 files / 163 tests, 0 skipped                                   |
| `npm run test:worker:startup`                                                                                                            | 0    | `worker.startup_smoke_passed`, `worker.controlled_smoke_verified` |

Discrimination independently proven (throwaway copy `/tmp/opencode/critic-wave3/repo-copy`, node_modules symlinked, repo untouched):

1. Baseline in copy: entrypoint integration 2/2 PASS.
2. Neutralized `assertPostgresWorkerPreflight` in the **copy's** `apps/worker/src/main.ts` (sha256 became `c099645e…`): `-t "runs the role preflight before the first claim"` FAILS with exit 1 — "entrypoint did not exit within the timeout" (neutralized worker keeps running and would claim).
3. Restored from repo (sha256 back to `9138a3d0…`): same test PASS.

Disclosed limitations correctly declared: sweeps disabled pending AAA-21/D01; drain-release retry proven at unit/PG level, not through the real-signal release path; worker workspace deps pre-existing gap. No product change means no new production risk in this lane.

## 4. Lane AAA-20 (identity) — verdict REWORK (one P1 finding)

### 4.1 What was verified as true

Delta vs round-2 bytes is confined to the four owned files and is additive/mechanical (`server-delta-r2.diff`): `auth.ts` +47 lines (mode contract), `main.ts` composition wiring, `operator-identity.ts` key-ring/`kid`/factory, `server.ts` `identityMode` + `createEffectiveOperatorIdentityResolver` + mechanical `options.operatorIdentityResolver` -> effective resolver rename across routes. No role/permission table change, no journey/audit/readiness change in this wave.

Independent adversarial results (probes run with Node 22, synthetic keys only):

| Probe                                                                                               | Observed                                                                                             |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| spoofed `x-operator-id/role=Admin` + valid Operator token, `GET /v1/admin/agents`                   | 403 forbidden (header never authorizes)                                                              |
| valid Supervisor token + cross-tenant `x-tenant-id`                                                 | 403 forbidden                                                                                        |
| simulation headers, no token, trusted mode                                                          | 401 unauthorized (no fake fallback)                                                                  |
| expired / wrong-audience / forged-signature tokens                                                  | 401 unauthorized each                                                                                |
| replayed token (same resolver instance)                                                             | first 200, replay 401 unauthorized                                                                   |
| rotation: previous key inside window                                                                | accepted                                                                                             |
| rotation: previous past window / revoked previous / revoked current / unknown `kid` / missing `kid` | rejected ("not active" / "requires a key identifier")                                                |
| valid `kid` token                                                                                   | accepted                                                                                             |
| configured env factory (`CVG_OPERATOR_IDENTITY_KEYRING`), revoked current                           | rejected                                                                                             |
| production entrypoint, no keyring                                                                   | exit 1, "Production requires an injected operator identity resolver"                                 |
| production entrypoint, `CVG_IDENTITY_MODE=simulation`                                               | exit 1, "simulation is forbidden"                                                                    |
| production entrypoint, invalid keyring JSON                                                         | exit 1, sanitized "CVG_OPERATOR_IDENTITY_KEYRING is invalid" (no secret leak)                        |
| production entrypoint, valid keyring + unreachable DB                                               | resolver gate passes; fails later on DB (ECONNREFUSED) — proves the gate is not masking other errors |

`parseIdentityMode` (unit) fails closed to `trusted` outside `test`, rejects unknown values, keeps explicit simulation for UI/dev.

### 4.2 P1 finding — WAVE3-01: trusted composition returns HTTP 500 on 12 admin route paths (23 route registrations)

- Where: `apps/api/src/server.ts:3756` (`requirePlatformScope` resolves identity), `apps/api/src/server.ts:3821` (`createEffectiveOperatorIdentityResolver` has no per-request memoization), `apps/api/src/operator-identity.ts:168-175` (replay cache), second-call sites e.g. `apps/api/src/server.ts:1450-1461` (revoke), `:1345-1352` (issue), plus 21 more registration sites; affected unique paths: `/v1/admin/capability-approvals`, `/v1/admin/plugins/catalog`, `/v1/admin/plugins/catalog/:pluginId`, `/v1/admin/knowledge-sources`, `/v1/admin/knowledge-sources/:sourceId`, `/v1/admin/release-candidates`, `/v1/admin/agents`, `/v1/admin/agents/:agentId/versions`, `/v1/admin/agents/:agentId/rollback`, `/v1/admin/test-lab/runs`, `/v1/admin/test-lab/suites`, `/v1/admin/test-lab/evaluate`.
- Mechanism: those routes call `requirePlatformScope(...)` (resolves once) and then `resolveOperatorIdentity(...)` again within the same request, through the same replay-protected resolver. The second resolution of the same `jti` throws "Trusted operator token replay detected"; the unwrapped second call surfaces as `internal_error` (500) instead of the expected 401.
- Repro (evidence in this directory):
  - `NODE_ENV=test npx tsx /tmp/opencode/critic-wave3/probe-identity.ts` -> `doubleResolveRevokeTrusted: 500 internal_error`; the **same route in simulation mode** (control) proceeds to business logic: `400 invalid_action`, proving the 500 is the resolver replay, not route logic.
  - `NODE_ENV=test npx tsx /tmp/opencode/critic-wave3/probe-factory-double.ts` -> same 500 through `createConfiguredOperatorIdentityResolver` (the exact production env-keyring mechanism).
- Why the lane tests missed it: their HTTP tests use resolver fakes without replay protection and single-resolution routes; no test drives a double-resolving admin route with `createTrustedOperatorIdentityResolver`.
- Impact: fail-closed (no privilege bypass, no data leak — confirmed 500, not 200), but the trusted mode this lane composes is **unusable on the whole platform/admin surface**. Once D04 lands and trusted mode is enabled, every such request 500s. Root cause partly pre-existing (route shape and replay cache existed at round 2; the builder disclosed it as "flagged"), but this lane owns `server.ts` and is the one wiring the replay-protected resolver into the composition, so the acceptance "Injetar resolver na composição" is not met for the control-plane routes.
- Minimal fix list:
  1. Make the effective resolver idempotent per request — e.g. `WeakMap<object, OperatorIdentity>` keyed on the `headers` object, or have `requirePlatformScope` return `{ tenantId, identity }` and delete the redundant `resolveOperatorIdentity` second calls (12 paths / 23 sites).
  2. Add one discriminating test: trusted mode + `createTrustedOperatorIdentityResolver` (replay-protected), call a double-resolving admin route with a valid token, assert non-500 business outcome; assert a token reused in a **later** request still yields 401 (replay semantics preserved).
  3. Keep the replay rejection mapped to 401 where a resolver error can reach a route catch.

### 4.3 Other observations (not blocking)

- WAVE3-02 (P3): replay cache is fixed at 4096 unexpired JTIs with no env override; a legitimate burst above that bound fails closed with "replay cache is full" (401). Acceptable in controlled mode; consider configuration and a metric.
- WAVE3-03 (P3, same root as WAVE3-01): replay on the unwrapped second call maps to 500, not 401.
- The worker-side and identity-side limitations declared by the builders (no real IdP, synchronous port, D04 pending, no physical durability) were re-confirmed as declared, not measured here.

## 5. M1 regression duty (PROD-06, AAA-22) on these bytes

`apps/api/src/server.ts` changed in this wave (identity hunks only); the previous round-3 M1 seal does not transfer, so both invariants were re-executed independently.

- **PROD-06 — journey audit actor/correlation trusted; body cannot override**: PASS.
  `NODE_ENV=test npx tsx /tmp/opencode/critic-wave3/probe-regression.ts` (PostgreSQL schema `critic_wave3_http`, `requireAuthenticatedMutations: true`): POST `/v1/journeys/owner-drafts` with body `actorId: spoofed.actor`, `actorType: Admin`, `correlationId: corr_…bad`, `tenantId: other`, `auditContext: {Admin, spoofed}` -> HTTP 200; stored `audit_events` row `actor_type=Operator`, `actor_id=operator.wave3.critic`, `correlation_id` equals response `meta.correlationId`, tenant equals the trusted tenant. Body correlation/tenant/actor ignored.
- **AAA-22 — readiness**: PASS.
  - Throwing singleton db client: `/ready` 503 on 3/3 repeats, body `ready=false`, `database` check `failed`, no connection string leaked, probe query attempted; `/live` 200.
  - Failing pool over 5 repeats: 5/5 `/ready` 503, `connect/release/destroy` = 5/5/5 (balanced, no accumulation); `/live` 200.
  - Also green in the focused run: `readiness.test.ts` and `journeys-api-postgres.test.ts`.

## 6. Integrity checks

- No test removed or weakened: worker test deltas are `+116/-0` and `+32/-0` lines; new files are additions; no `.only`/`.todo`; the only `describe.skip` is the DB-conditional pattern already used by sibling suites.
- No unconditional skip; all DB suites ran 0-skipped with `TEST_DATABASE_URL`.
- No threshold/script change: `package.json`/`package-lock.json` byte-identical to round 2; vitest/eslint/tsconfig configs unchanged.
- No real secret, endpoint, credential or external effect: only synthetic fixed test secrets/DB role passwords and `127.0.0.1` fixtures; keyring errors are sanitized (probe: invalid JSON error does not contain the secret).
- Repo untouched by the critic: fingerprint before == after; the only neutralization was in `/tmp/opencode/critic-wave3/repo-copy` and was restored byte-identically.

## 7. Limits (NOT_VERIFIED)

- No real IdP, protocol, audience mapping, remote introspection or asynchronous port; D04 remains pending — the key ring is a local HMAC mechanism for controlled composition.
- No production deployment, TLS, real secrets, Docker/image run, or traffic; production remains NO-GO.
- UI simulation flow verified via unit/HTTP tests only; no browser/jsdom-in-browser execution in this review.
- No durable approval flow, no AAA-21/D01 composition (sweeps stay disabled), no physical crash/fsync/failover, no RPO/RTO measurement.
- Double-resolution finding measured with in-process HTTP injection (`app.inject`), not against a real listener; mechanism is resolver-instance-bound and order-deterministic, so the result should hold over a real socket, but that variant was not executed.
- The 12 affected paths are derived by static call-site analysis plus two dynamic repros; the remaining 10 paths were not each exercised dynamically.

## 8. Final verdict

**REWORK** — minimal fix list in §4.2 (WAVE3-01). No P0; one P1 that blocks a truthful "trusted composition" acceptance; two P3 notes. Lane AAA-19 is PASS at its scope, M1 invariant regression (PROD-06, AAA-22) holds on these bytes, and the fingerprint is unchanged before/after.
