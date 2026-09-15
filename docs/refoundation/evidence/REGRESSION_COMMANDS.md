# Regression command evidence — REF-20260913-PHASE-0-1

Observation date: 2026-09-13. Candidate: dirty worktree at HEAD
`512bc11e80fbf7c7b8baf6263aacc811ff829309` plus the controlled refoundation
files. Local runtime: Node `v24.20.0`, npm `11.19.0`; repository target is
Node 22. No network, database, provider, channel, real data, or production
effect was used.

## Commands

| Command                                                 | Exit | Result                                                                                     |
| ------------------------------------------------------- | ---: | ------------------------------------------------------------------------------------------ |
| `npx vitest run ... contracts/basic-agent/architecture` |    0 | 3 files, 13 tests passed                                                                   |
| `npm run test:evals`                                    |    0 | 1 file, 8 tests passed                                                                     |
| `npm run typecheck`                                     |    0 | pass                                                                                       |
| `npm run lint -- --quiet`                               |    0 | pass                                                                                       |
| `npm run build`                                         |    0 | typecheck plus Vite build, 163 modules                                                     |
| `npm run build:harness`                                 |    0 | isolated contracts → orchestrator → harness project build                                  |
| `npm ls @cvg/harness ... --depth=0`                     |    0 | all three workspace links resolved                                                         |
| `node -e "import('@cvg/harness')..."`                   |    0 | public factory/orchestrator/contracts loaded from built exports                            |
| targeted `prettier --check`                             |    0 | all new/refoundation files formatted                                                       |
| `npm test`                                              |    1 | 252 files: 238 passed, 5 failed, 9 skipped; 1,681 passed, 12 failed, 105 skipped; 8 errors |

## Full-test comparison

The frozen baseline was 249 files / 235 passed / 5 failed / 9 skipped and
1,668 passed / 12 failed / 105 skipped / 8 errors. The candidate adds three
test files and thirteen passing tests; the failure count and error count are
unchanged.

The same five failure areas remain: worker-controlled smoke, worker-startup
smoke, worker continuous startup, API identity composition wiring, and the
eight loopback HTTP-provider tests. The loopback cases report sandbox
`listen EPERM` and the entrypoint assertions remain environment/runtime
limitations already present in the freeze. No new failure area appeared.

## Interpretation

The refoundation slice passes its focused proof and all applicable static/build
checks. The full repository is not green and this evidence does not authorize
production, deployment, real data, or completion of AAA-21.
