# CVG Operational Harness — Phase 2 baseline (historical pre-implementation snapshot)

> The results below are intentionally preserved as the R2 comparison baseline.
> They are not the current candidate status; see `FINAL_RETEST.md` for the
> final post-repair gates.

## Candidate

- HEAD: 512bc11e80fbf7c7b8baf6263aacc811ff829309
- Node: v24.20.0
- npm: 11.19.0
- OS: Ubuntu 24.04 kernel 7.0.0-31-generic
- Target runtime documented by the repository: Node 22; the local run is Node 24.
- Worktree was already dirty; see PRE_FLIGHT.md.

## Required baseline gates

| Command | Result | Evidence |
| --- | --- | --- |
| npm run typecheck | PASS, exit 0 | TypeScript completed without diagnostics. |
| npm run lint | PASS, exit 0 | ESLint completed without diagnostics. |
| npm run build | PASS, exit 0 | Vite transformed 163 modules and produced the web build. |
| npm run test:evals | PASS, 1 file / 8 tests | Agent eval suite completed. |
| npm test | FAIL, exit 1 | 252 files: 238 pass, 5 fail, 9 skip; 1,681 pass, 12 fail, 105 skip, 8 errors. |
| npm run test:postgres | NOT RUN / ENVIRONMENT_BLOCKED | No TEST_DATABASE_URL; Docker server socket inaccessible. |

The full regression failure envelope is preserved. It is not silently converted
to a green gate and is classified below.

## Full regression failure envelope

The five failing files and twelve failing tests are:

1. tests/worker-controlled-smoke.test.js — controlled worker smoke.
2. tests/worker-startup-smoke.test.js — worker startup smoke.
3. apps/api/src/__tests__/identity-composition-wiring.test.ts — production
   identity resolver subprocess assertion.
4. apps/worker/src/__tests__/continuous-worker.test.ts — real entrypoint
   startup assertion.
5. packages/model-gateway/src/__tests__/local-http-providers.test.ts —
   eight loopback-provider tests.

The run also reported eight unhandled loopback listen EPERM errors. No Phase 2
source change existed when this baseline was captured, so these results are the
comparison point for new-regression analysis.

## Baseline interpretation

- The first three worker/identity areas match the known Phase 0/1 regression
  envelope and remain open until independently reclassified.
- The loopback provider failures are environment-dependent in this sandbox:
  local TCP binding is denied, causing the eight timeouts and unhandled errors.
- PostgreSQL durability is not certified by this baseline. A real PostgreSQL
  run requires a local test server or an explicitly available TEST_DATABASE_URL.
