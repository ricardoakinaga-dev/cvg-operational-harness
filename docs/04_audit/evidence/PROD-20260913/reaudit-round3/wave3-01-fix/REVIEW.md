# PROD-20260913 — reaudit round 3 — WAVE3-01 fix verification (wave3-01-fix)

- Verifier: fresh independent verifier (did not write the fix; no prior context on this delta)
- Candidate: working tree in `/home/ricardo/cvg-agent-secretary-v2`, HEAD `512bc11`, dirty tree preserved (no commit/reset/clean)
- Scope: WAVE3-01 P1 fix only — `createEffectiveOperatorIdentityResolver` memoization in `apps/api/src/server.ts` + the new discriminating test in `apps/api/src/__tests__/identity-trusted-resolver.test.ts`
- Owned paths: repo read-only for product/source/test/config; verifier wrote only under `docs/04_audit/evidence/PROD-20260913/reaudit-round3/wave3-01-fix/` and `/tmp/opencode/wave3-01-verify/`
- Environment: Node v22.23.2 (`/home/ricardo/.nvm/versions/node/v22.23.2/bin`), npm 10.9.8
- Verdict: **PASS** — fix verified, no P0/P1/P2 on the delta

## 1. Fingerprint (before vs after all runs)

Changed files by the fix (real bytes):

| File | sha256 |
| --- | --- |
| `apps/api/src/server.ts` | `514fec1be63f8602ce857bf3a8caf773ab1cc559c24148e64c99d8478303ddf0` |
| `apps/api/src/__tests__/identity-trusted-resolver.test.ts` | `39dbfd398ef73d47ec3ce0a0eeb795e2129683162eb0c23d28336d7bdf859f42` |

Aggregates:

| Set | Before | After | Delta |
| --- | --- | --- | --- |
| Narrow: `apps/**`, `packages/**` code files (`*.ts,tsx,js,mjs,cjs,json,sql`, excl. node_modules/dist) + `package.json` | `541ea122be742b0f4cb759170f22b7005909e8badb52cb33d4857ad4ca647f7d` | `541ea122be742b0f4cb759170f22b7005909e8badb52cb33d4857ad4ca647f7d` | **zero** |
| Broad: every file under `apps/**`, `packages/**` (excl. node_modules/dist/coverage) + `package.json`, `package-lock.json`, `tsconfig*.json`, `vitest.config.mts`, `vite.config.mts`, `eslint.config.js`, `playwright.config.ts`, `.prettierrc.json`, `.prettierignore` | `f0f5a4f8e659b27f48e0793e888e4656a2f29b7ca5abd2b57c0865749d60bd1a` | `f0f5a4f8e659b27f48e0793e888e4656a2f29b7ca5abd2b57c0865749d60bd1a` | **zero** |

Config hashes unchanged: `package.json` `a3592511…`, `package-lock.json` `a5ccf03b…`, `tsconfig.json` `3652e88c…`, `tsconfig.base.json` `f50a5d45…`, `tsconfig.typecheck.json` `d8decba9…`, `vitest.config.mts` `59b9aceb…`, `vite.config.mts` `43e3094c…`, `eslint.config.js` `af724c52…`, `playwright.config.ts` `62f6f699…`, `.prettierrc.json` `6f96ac03…`, `.prettierignore` `4e6d53b8…`. Raw lists: `fingerprint-before-narrow.txt`, `fingerprint-after-narrow.txt`, `fingerprint-before-broad.txt`, `fingerprint-after-broad.txt`.

No product/source/test/config byte changed by any run (including the PostgreSQL suite and worker smoke).

## 2. Resolver wrapper inspection (`apps/api/src/server.ts:3821-3857`)

```ts
function createEffectiveOperatorIdentityResolver(
  identityMode: IdentityMode,
  resolver: OperatorIdentityResolver | undefined
): OperatorIdentityResolver | undefined {
  if (!resolver) {
    if (identityMode === 'trusted') {
      return () => {
        throw new DomainError('unauthorized', 'A trusted operator identity resolver is required in production')
      }
    }
    return undefined
  }
  if (identityMode === 'simulation') return resolver
  const memo = new WeakMap<object, OperatorIdentity>()
  return (headers) => {
    const cached = memo.get(headers)
    if (cached) return cached
    const identity = resolver(headers)
    if (!identity.tenantId) {
      throw new DomainError('unauthorized', 'Trusted operator identity must be tenant-bound')
    }
    memo.set(headers, identity)
    return identity
  }
}
```

Confirmed by direct read:

- **Per headers object**: cache key is the `headers` object reference (`WeakMap<object, OperatorIdentity>`); `get`/`set` use the same reference the caller passed.
- **Trusted-only**: memoization is only reached when a resolver exists AND `identityMode !== 'simulation'`; the `simulation` branch returns the resolver untouched, and the no-resolver trusted branch stays fail-closed with `unauthorized`.
- **Tenant-less fail-closed preserved**: the `!identity.tenantId` check runs on the *uncached* path before any `memo.set`; a tenant-less identity can never enter the cache. The untrusted/no-resolver path still throws, and `requirePlatformScope` keeps its own trusted-tenant enforcement in non-test env (`server.ts:3778`).
- **All route call sites use the same object**: static scan of every `resolveOperatorIdentity(`/`requirePlatformScope(` call in `server.ts` (55 sites) shows each passes `request.headers`; the only use of `options.operatorIdentityResolver` in the file is the wrapper construction (`server.ts:277-280`). No route passes a copy/spread of headers, and no product code mutates `request.headers` (grep scan empty).
- **Composition wiring**: `apps/api/src/main.ts` builds the resolver via `createConfiguredOperatorIdentityResolver` and injects it into `buildServerFromEnv`; the wrapper is the only effective resolver the routes see.

## 3. Requested gates (all on the current bytes)

| # | Command | Exit | Result |
| --- | --- | --- | --- |
| 1 | `npm run typecheck` | 0 | `tsc -p tsconfig.typecheck.json --noEmit`, no errors |
| 2 | `npx prettier --check apps/api/src/server.ts apps/api/src/__tests__/identity-trusted-resolver.test.ts` | 0 | "All matched files use Prettier code style!" |
| 3 | `npx eslint apps/api/src/server.ts apps/api/src/__tests__/identity-trusted-resolver.test.ts` | 0 | clean |
| 4 | `npx vitest run --no-file-parallelism apps/api/src/__tests__/identity-trusted-resolver.test.ts` | 0 | **7/7 passed** (1 file) |
| 5 | `npx vitest run --no-file-parallelism apps/api/src/__tests__/identity-composition-wiring.test.ts apps/api/src/__tests__/identity-key-ring-rotation.test.ts packages/shared/src/__tests__/auth-identity-mode.test.ts` | 0 | 3 files / **19 tests passed** |

The discriminating test (`"...serves a double-resolving admin route with a replay-protected resolver and still rejects cross-request replay"`, test file lines 199-252) uses `createTrustedOperatorIdentityResolver` (replay-protected, real HMAC key ring) with a Supervisor token on `POST /v1/admin/capability-approvals/<id>/revoke`, asserts `400 invalid_action` on the first request and `401 unauthorized` on a **second request with a new headers object**. No `.only`/`.skip`/`.todo` anywhere in the file.

## 4. Independent reproduction (throwaway copy, `/tmp/opencode/wave3-01-verify/repo-copy`)

Copy made with `rsync` (node_modules symlinked); copy server hash equaled repo hash. Neutralization removed **only** the memoization statements (`new WeakMap`, `memo.get`, `cached` early return, `memo.set`) while keeping the tenant-bound check; byte-level diff recorded in `logs/memo-removal.diff` (copy hash became `a66c1478b42cb9a28807593a89888e46d3210876dfad7191f458725628695e20`). Restored by copying the repo file back; hashes matched again (`514fec1b…`).

| Build | Probe first request | Probe cross-request replay | Test file |
| --- | --- | --- | --- |
| Copy **with fix** (`logs/probe-fixed.out`) | `400 invalid_action` | `401 unauthorized` | 7/7 pass |
| Copy **memoization removed** (`logs/probe-neutralized.out`) | **`500 internal_error`** | `401 unauthorized` | **1 failed / 6 passed** — `expected 500 to be 400` at test line 232 (`logs/vitest-neutralized.out`) |
| Copy **restored** (`logs/probe-restored.out`) | `400 invalid_action` | `401 unauthorized` | 7/7 pass (`logs/vitest-restored.out`) |

This is a true RED/GREEN discrimination: the test fails on exactly the neutralized byte state and passes on the fixed bytes, and the probe shows the P1's 500 is caused by the missing memoization (not by route logic).

Real-socket companion (closes the prior review's inject-only limit): `probe-real-socket.ts` started the app with `app.listen({port: 0})` and used `fetch` — first real TCP request `400 invalid_action`, second real TCP request with the same token `401 unauthorized` (`logs/probe-real-socket.out`).

## 5. Falsification attempts

1. **Same headers object reused across two logically different requests** — Fastify gives a fresh `request.headers` object per request. Probe scenario B instrumented `onRequest` and compared references: `sameObjectAcrossRequests: false`. Probe scenario C reused the *same literal client headers object* for two `inject` calls: first `400`, second `401`. Judgment: the memo cannot leak one request's identity into another request under the real server semantics; not a replay bypass.
2. **Unexpected mutation of headers between the two resolutions** — static scan found no `request.headers[...] =`, `delete request.headers` or `Object.assign(request.headers)` in `server.ts`; both resolution calls are synchronous within one handler, so no external actor can mutate the object between them. Even hypothetically, the cached identity is the same identity already used for the first authorization of the same request, so no privilege boundary is crossed. Judgment: not exploitable.
3. **Second identity request with a DIFFERENT headers object** — replay-rejected: scenario A `401`, scenario C `401`, concurrent scenario E statuses exactly `[400, 401]` (one request consumes the token; the concurrent other is rejected), real-socket second request `401`. Judgment: replay semantics preserved.
4. **Tenant-less identity** — trusted resolver returning an identity without `tenantId` yields `401 unauthorized` (probe scenario D; test at lines 127-146 still passes). Judgment: fail-closed preserved.
5. **Scope boundary (recorded, not a defect)** — `identityMode: 'simulation'` with an injected replay-protected resolver still returns 500 on the same route (`logs/probe-simulation-boundary.out`), because the memo is intentionally trusted-only. This combination is not produced by any composition path (`createConfiguredOperatorIdentityResolver` returns `undefined` outside trusted mode; production forbids simulation) and is outside the WAVE3-01 claim. Not counted as a finding.

## 6. Regression suites (new bytes)

| Command | Exit | Result |
| --- | --- | --- |
| `TEST_DATABASE_URL=postgres://cvg_prod@127.0.0.1:55481/wave3_verify_r3 npx vitest run --testTimeout=60000 --no-file-parallelism apps/api/src/__tests__/journeys-api-postgres.test.ts apps/api/src/__tests__/readiness.test.ts packages/persistence/src/__tests__/journeys-postgres.test.ts` | 0 | 3 files / **45 tests passed**, 0 skipped |
| `npm run test:worker:startup` | 0 | `worker.startup_smoke_passed` (`queue_adapter_missing`) + `worker.controlled_smoke_verified` (processed 1) |

Database: verifier-owned `wave3_verify_r3` created on `127.0.0.1:55481` (PostgreSQL 16.15, user `cvg_prod`, trust) via the repo's `pg` client; port 5432 never contacted.

## 7. Findings on the delta

- **P0/P1/P2: none.**
- Observations (non-blocking, not new to this delta): the memo depends on `request.headers` object identity, which Fastify provides per request (documented in the code comment); the replay cache cap ("replay cache is full" 401) and the generic 500 mapping for raw resolver errors are pre-existing behaviors noted by the prior review and untouched here; distributed/multi-instance replay is a pre-existing in-memory design limit, not part of WAVE3-01.

## 8. NOT_VERIFIED limits

- Of the ~23 double-resolution call sites, one route (`.../revoke`) was exercised dynamically; the rest are covered by static analysis plus the single shared wrapper — all pass `request.headers` and therefore hit the same memo path, but they were not each exercised at runtime.
- No real IdP/D04 integration, remote introspection or asynchronous identity port; only the local HMAC key-ring mechanism was verified.
- No production deployment, TLS, real secret, Docker image run or live traffic; production remains NO-GO.
- The pre-fix test-file bytes are untracked and not recoverable by git, so the "new test" was validated by neutralization (it fails exactly when the memoization is removed), not by byte-diff against the prior test.
- The simulation-mode boundary result above is recorded for completeness and is outside the fix's claimed scope.
- Multi-process/restart replay (replay cache is per resolver instance) and physical durability were not measured.

## 9. Final verdict

**PASS** — the WAVE3-01 P1 is fixed on the current bytes: trusted-mode double resolution is memoized per request (headers object) without weakening cross-request replay rejection (401 preserved, including over a real socket and under concurrent requests), tenant-less identities remain fail-closed, all requested gates are green (typecheck, prettier, eslint, 7/7 identity test, 19 adjacent identity tests, 45 regression tests, worker startup), and no product/source/test/config byte changed during verification. No P0/P1/P2 on the delta.
