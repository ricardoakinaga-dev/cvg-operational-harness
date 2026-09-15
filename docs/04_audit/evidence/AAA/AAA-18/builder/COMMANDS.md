# AAA-18 — Commands and exit codes (builder lane)

All commands ran at `/home/ricardo/cvg-agent-secretary-v2` on 2026-09-13 (UTC).

`TEST_DATABASE_URL=postgres://ricardo@127.0.0.1:55432/cvg_aaa16_test` — disposable
AAA-16 fixture cluster. The operational database on port 5432 was never contacted.
The host clock is UTC-3; UTC timestamps below are derived from each captured run
start time (`date -u` check: `2026-09-13T06:54:38Z`).

| # | UTC start | Command | Exit | Observed result | Log |
|---|-----------|---------|:----:|-----------------|-----|
| 1 | 06:54:41Z | RED: `TEST_DATABASE_URL=… npx vitest run apps/api/src/__tests__/journeys-api-postgres.test.ts --no-file-parallelism --testTimeout=60000` (before wiring) | 1 | 6 failed / 1 passed: postgres journey routes returned `invalid_action`, startup accepted an unusable pool, repository never reached HTTP (RED collected 7 tests; the 8th startup-migration test was authored after this capture and its GREEN is in runs #2/#8) | `RED-focused.log` |
| 2 | 07:02:52Z | `TEST_DATABASE_URL=… npx vitest run apps/api/src/__tests__/journeys-api-postgres.test.ts --no-file-parallelism --testTimeout=60000` | 0 | 1 file, **8 passed**, 0 failed, 0 skipped | `GREEN-focused.log` |
| 3 | 07:02:54Z | `TEST_DATABASE_URL=… npx vitest run apps/api/src/__tests__/journeys-api-postgres.test.ts apps/api/src/__tests__/journeys-api.test.ts apps/api/src/__tests__/journey-routes-coverage.test.ts apps/api/src/__tests__/postgres-persistence-mode.test.ts --no-file-parallelism --testTimeout=60000` | 0 | 4 files, **38 passed**, 0 failed, 0 skipped | `GREEN-focused-api.log` |
| 4 | 07:03:0xZ | `npm run typecheck` | 0 | no errors | `typecheck.log` |
| 5 | 07:03:1xZ | `npm run lint` | 0 | no errors (global) | `lint-global.log` |
| 5b | 07:03:1xZ | `npx eslint apps/api/src/server.ts apps/api/src/__tests__/journeys-api-postgres.test.ts apps/api/src/__tests__/journey-routes-coverage.test.ts` | 0 | no errors (scoped) | `lint-scoped.log` |
| 6 | 07:03:21Z | `TEST_DATABASE_URL=… npm run test:postgres` | 0 | 14 files, **123 passed**, 0 failed, 0 skipped | `GREEN-postgres.log` |
| 7 | 07:03:41Z | `npm test` (without `TEST_DATABASE_URL`) | 0 | 230 files passed / 5 skipped; **1585 passed / 65 skipped**; 0 failures | `GREEN-full-suite.log` |
| 8 | 07:07:30Z | `TEST_DATABASE_URL=… npm test` | 0 | 235 files, **1650 passed**, 0 failed, **0 skipped** | `GREEN-full-suite-with-url.log` |
| 9 | — | `git diff --check` | 0 | no whitespace errors | — |

## Baseline delta

The task baseline was 1585 pass / 57 skip. The new suite contributes exactly 8
conditional tests:

- without `TEST_DATABASE_URL`: 8 new skips (65 = 57 + 8), pass count unchanged;
- with `TEST_DATABASE_URL`: all 8 run and pass (run #2 and the 0-skip run #8).

No pre-existing test changed its pass/skip status.

## Restart-read proof

`journeys-api-postgres.test.ts` › *reads created journey state back after a server
restart* closes the first app and its pool, then constructs a second `Pool` and a
second `buildServer` over the same schema and reads state back over HTTP (owner
draft `draft`, patient draft `linked`, appointment draft `awaiting_approval` with
`confirmationBlocked: true`), plus a direct DB row count of 1 for the appointment
draft. It is one of the 8 passing tests in run #2/#8.

## Startup migration proof

`journeys-api-postgres.test.ts` › *applies migration 0014 during postgres startup
before serving journeys* boots `buildServerFromEnv` with `POSTGRES_AUTO_MIGRATE=true`
against a fresh schema, verifies the `0014_journeys` checksum row in
`schema_migrations`, and then creates and lists an owner draft over HTTP through the
same app. `runPostgresMigrations` is now the only auto-migrate path, so postgres
startup applies the checksum-guarded set including `0014_journeys`.

## Factory mode switch (summary)

`apps/api/src/server.ts#createPersistence`:

- memory: `new JourneyRepository(db)` (unchanged local/test default);
- `postgres-pool`: `new PostgresJourneyRepository(pool)` (tenant-scoped RLS path);
- `postgres` (legacy direct client): `new PostgresJourneyRepository(singleConnectionPool(client))`;
- an injected `journeyRepository` overrides both; `null` exposes the explicit
  fail-closed unavailable state used by the route-level test;
- if the configured postgres adapter cannot carry tenant-scoped operations
  (no `pool.connect` / no `client.query`), startup throws
  `PostgreSQL journey persistence requires …` instead of casting a missing adapter.
