# REM21-006 — BUILD / AUDIT

## Acceptance matrix

| Criterion                                                                 | Result     | Evidence                                                                                                |
| ------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| Startup config is fail-closed and production remains disabled             | PASS_LOCAL | `worker.ts`, `published-worker-runtime.test.ts`, production controlled-memory smoke                     |
| Durable PostgreSQL/RLS/grants/migrations preflight precedes homolog claim | PASS_LOCAL | `assertOperationalHarnessPostgresPreflight`, role/preflight tests, disposable PostgreSQL suite          |
| Synthetic memory profile has an explicit non-durable preflight boundary   | PASS_LOCAL | `assertOperationalHarnessProfilePreflight`, controlled-mode startup gate, composition tests             |
| Ready precedes first consumption                                          | PASS_LOCAL | homolog `worker.homolog_process_next`, controlled-memory process test, continuous entrypoint assertions |
| Health is independent of sweep                                            | PASS_LOCAL | `CVG_HOMOLOG_HEALTH_INTERVAL_MS`; health 25 ms with sweep 60 s                                          |
| Health failure pauses claims and recovery can restore readiness           | PASS_LOCAL | readiness state machine and health-gate tests                                                           |
| Shutdown is not-ready before drain and stopped after close                | PASS_LOCAL | shared idempotent cleanup, homolog/continuous SIGTERM process tests, readiness assertions               |
| Existing recovery/idempotency behavior remains green                      | PASS_LOCAL | operational restart and complete repository regression                                                  |

## Commands and results

All commands below used the repository's Node `v22.23.2` installation. The
PostgreSQL URL below points only to the local synthetic disposable container;
no real tenant, provider, channel, credential or production data was used.

- RED reproduction before BUILD: readiness test failed because
  `apps/worker/src/readiness.ts` did not exist — expected failure, exit `1`;
- focused lifecycle/profile suite: `3` files, `15/15` tests passed;
- focused worker/readiness/runtime suite: `4` files passed, `25` tests passed,
  `1` PostgreSQL-dependent test skipped without the database;
- disposable PostgreSQL homolog/worker suite with
  `TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5434/cvg_test`
  and `AUD19_PG_REQUIRED=1`: `9` files, `43/43` tests passed;
- real-process PostgreSQL outage fixture against `127.0.0.1:1`: exit `1`,
  `worker.homolog_failed`, no `worker.homolog_ready` and no ready status;
- controlled-memory process fixture: `worker.readiness=ready` precedes
  `worker.controlled_ready`, which precedes `worker.controlled_smoke_passed`;
- operational synthetic process smoke: ready precedes completion and ends
  `not_ready -> stopped`;
- controlled-memory production smoke: startup failed with
  `production_controlled_worker_forbidden`;
- complete repository regression after the runtime BUILD: `289` files passed,
  `20` skipped; `2,052` tests passed, `144` skipped. The subsequent change
  to the PostgreSQL fixture only added the required controlled-mode flag; its
  affected PostgreSQL suite was rerun at `43/43`;
- `tsc -p tsconfig.typecheck.json --noEmit`: PASS;
- focused ESLint: PASS;
- targeted Prettier check: PASS;
- `npm run docs:check-links`: `broken: []`; the existing `11`
  `nonPortableAbsolute` historical entries remain unchanged;
- `git diff --check`: PASS;
- no `process.exit(...)` call remains in the audited worker entrypoints;
- task-local SHA-256 manifest: generated after all evidence updates and
  verified with `sha256sum --check`.

## Independent review and limits

The fresh-context reports are retained in `INDEPENDENT-CRITIC-01.md`,
`INDEPENDENT-CRITIC-02.md` and `INDEPENDENT-CRITIC-03.md`. The first two
negative/partial snapshots are marked superseded by the later BUILD and
post-BUILD execution. The current reviewer still records the program-level
fact that `A21-F05` is not a production closure: production remains `NO_GO`
and no worker was qualified or enabled there. This task therefore reports a
local scoped remediation, not final closure of F05, release approval or I1.

No candidate freeze, external validation, credential, real data, deploy or
production approval is claimed. `REM21-011` retains the external exporter,
alerts and SLO qualification; `REM21-019` retains candidate-bound final
certification.
