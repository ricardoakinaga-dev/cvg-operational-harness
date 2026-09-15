# AAA-21 final retest snapshot

Captured on 2026-09-14 in `America/Sao_Paulo`, after the AAA-21-R4 repair, the
controlled synthetic-effect vertical proof, and the R3 process-restart proof.
The final fresh-critic window is recorded separately in
`evidence/INDEPENDENT_CRITIC.md`.

| Command                                                                         | Exit | Result                                                                 |
| ------------------------------------------------------------------------------- | ---: | ---------------------------------------------------------------------- |
| `npm run typecheck`                                                             |    0 | PASS                                                                   |
| `npm run lint`                                                                  |    0 | PASS                                                                   |
| `npm run build:harness`                                                         |    0 | PASS                                                                   |
| `npm run build`                                                                 |    0 | PASS; Vite transformed 163 modules                                     |
| `npm run test:evals -- --reporter=dot`                                          |    0 | PASS; 1 file / 8 tests                                                 |
| focused Phase 2 + structure run with isolated PostgreSQL                        |    0 | PASS; 5 files / 31 tests                                               |
| `npm run test:worker:startup`                                                   |    0 | PASS; startup guard and controlled-memory smoke                        |
| `npm test -- --reporter=dot`                                                    |    0 | PASS; 250 files / 1,727 passed / 110 skipped; 1,837 total              |
| `npm run test:e2e`                                                              |    0 | PASS; 6 tests                                                          |
| `npm run test:postgres -- --reporter=dot` with isolated PostgreSQL 15           |    0 | PASS; 24 files / 190 tests / 0 skips                                   |
| `npm run demo:phase2`                                                           |    0 | PASS; `SUCCEEDED`, attempt 1, journal `CONFIRMED`, no external effects |
| `TEST_DATABASE_URL=<synthetic disposable PostgreSQL URL> npm run verify:phase2` |    0 | PASS; static/build/focused/demo gates plus 24-file PostgreSQL catalog  |
| `npm run format:check`                                                          |    1 | BASELINE_FAIL; 430 files report pre-existing formatting drift          |

## PostgreSQL setup

The database proof used a disposable `postgres:15-alpine` container named
`cvg-phase2-r4-postgres`, bound only to `127.0.0.1:55434`. Each relevant suite
created a unique schema and used synthetic tenants, roles, credentials, and
payloads. The container was stopped after verification; no staging or
production database was touched.

The live role proof passed `13/13` tests. The R4 vertical role proof added one
PostgreSQL integration test: it verified a non-superuser,
non-`BYPASSRLS` role with no broad privileges, the neutral critical-table
policy/migration preflight, and an actual submit/claim/execute/read event flow
through `createOperationalHarnessWorker`, with one `CONFIRMED` journal row,
one synthetic executor observation, idempotent replay, and cross-tenant journal
visibility denied.

## Regression interpretation

The full monorepo suite is green for this candidate. The repository remains a
dirty brownfield worktree with historical/generated files outside the R4
change set; global Prettier reports those files but the R4 source/test/docs
selection passes targeted formatting. E2E is currently `6/6` and no web file
changed in R4.

The PostgreSQL result is real disposable-database evidence, not a skipped
guard. The R3 process test also launched the operational entrypoint as real
children, interrupted one after claim, and verified stale-lease recovery by a
distinct child. R4 adds a public synthetic-effect journal path but performs no
external I/O. D4/D5 remain controlled claims; external provider exactly-once
behavior remains outside the evidence.

## Independent audit window

The R4 final critic window and its before/after fingerprint are recorded in
`evidence/INDEPENDENT_CRITIC.md` and `evidence/FINAL_SENTINEL.json`. The fresh
critic returned no report within the bounded window; the matching sentinel
proves non-mutation, not approval. The controlled verdict therefore remains
`CONDITIONAL_PASS` under the frozen bar and is not a fresh-critic `PASS`.
