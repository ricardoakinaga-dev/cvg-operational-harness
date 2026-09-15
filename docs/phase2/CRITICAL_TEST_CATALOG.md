# AAA-21 critical test catalog

| Test/gate                                                                                     | Invariant                                                                                   | Current result                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `packages/harness/src/__tests__/execution-spine.test.ts`                                      | identity, transitions, bounded retry, cancellation, claim fencing, recovery, stop boundary  | PASS                                         |
| `packages/harness/src/__tests__/effect-journal.test.ts`                                       | confirmed replay and uncertain-effect fail-closed                                           | PASS                                         |
| `apps/api/src/__tests__/execution-spine.test.ts`                                              | HTTP 202, dedupe, conflict, tenant GET/result, cancel route                                 | PASS                                         |
| `apps/worker/src/__tests__/operational-harness-worker.test.ts`                                | neutral composition, production guard, concurrency/schema parsing                           | PASS                                         |
| `apps/worker/src/__tests__/postgres-role-preflight.test.ts`                                   | role/RLS/migration preflight and real operational worker path                               | PASS; 13 tests with PostgreSQL               |
| `apps/worker/src/__tests__/operational-harness-process-restart.integration.test.ts`           | real child fault after claim, lease recovery, competing worker, terminal/effect authority   | PASS; 1 test with PostgreSQL                 |
| `apps/worker/src/__tests__/operational-harness-synthetic-effect.test.ts`                      | HTTP→queue→public worker→journal→GET, replay, default effect-free guard                     | PASS; 2 tests                                |
| `apps/worker/src/__tests__/operational-harness-synthetic-effect-postgres.integration.test.ts` | live R4 journal confirmation, replay, RLS visibility, role path                             | PASS; 1 test with PostgreSQL                 |
| `packages/persistence/src/__tests__/operational-execution-postgres.test.ts`                   | SQL identity, claims, retry exhaustion, dead-letter, restart-equivalent pool, tenant/cancel | PASS; PostgreSQL                             |
| `tests/architecture/dependency-direction.test.ts`                                             | package boundary/dependency direction                                                       | PASS                                         |
| `tests/repository-structure.test.js`                                                          | target structure/dependency allowlist                                                       | PASS                                         |
| focused Phase 2 + structure command                                                           | current R4 implementation surface                                                           | PASS; 5 files / 31 tests                     |
| `npm run typecheck`                                                                           | compile all configured projects                                                             | PASS                                         |
| `npm run lint`                                                                                | lint                                                                                        | PASS                                         |
| `npm run build` / `npm run build:harness`                                                     | build                                                                                       | PASS                                         |
| `npm run test:evals -- --reporter=dot`                                                        | existing eval gate                                                                          | PASS; 8 tests                                |
| `npm run test:worker:startup`                                                                 | startup fail-closed and controlled worker smoke                                             | PASS                                         |
| `npm test -- --reporter=dot`                                                                  | monorepo regression                                                                         | PASS; 250 files / 1,727 passed / 110 skipped |
| `npm run test:e2e`                                                                            | browser/API and visual shell boundary                                                       | PASS; 6 tests                                |
| `npm run test:postgres -- --reporter=dot`                                                     | real database durability catalog plus R3/R4 process and effect proofs                       | PASS; 24 files / 190 tests / 0 skips         |
| `npm run format:check`                                                                        | repository-wide formatting                                                                  | BASELINE_FAIL; 430 brownfield files          |

The PostgreSQL evidence used an isolated disposable container and synthetic
tenants/roles only. D4/D5 are claimed only for the controlled process boundary;
R4's journaled tool is a no-I/O fixture and does not prove external exactly-once
effects. The web E2E pass is recorded for regression context; this backend
slice did not modify the web surface.
