# Migration Report

## Migration

`packages/persistence/migrations/0019_iterative_execution_steps.sql`

Additive only:

1. `ALTER TABLE operational_executions ADD COLUMN IF NOT EXISTS resume jsonb`
   — durable resume binding written only by the authenticated
   `resolveApproval`/`provideUserInput` paths.
2. `operational_execution_steps` — one row per cognitive step, sequential by
   `step_number`, FK to the execution, CHECK on step type/status, bounded
   `observation_refs`.
3. `operational_execution_checkpoints` — one row per execution with the
   bounded state, budget usage, versions and digest.
4. RLS `ENABLE`/`FORCE` + tenant-isolation policies; `REVOKE ALL FROM PUBLIC`;
   indexes and table/column comments.

## Migration registration

- `runPostgresMigrations` default list includes `0019_iterative_execution_steps`.
- Worker preflight: `OPERATIONAL_HARNESS_REQUIRED_MIGRATIONS` includes
  `0019_iterative_execution_steps`; `OPERATIONAL_HARNESS_CRITICAL_TABLES`
  includes the two new tables so the least-privilege worker role receives
  exactly the needed grants.
- API migration availability list includes `0019_iterative_execution_steps`.

## Compatibility

- **Phase 2 data**: no Phase 2 table is rewritten or dropped. The new column is
  nullable; existing rows read as `resume = NULL`.
- **Runtime V1**: ignores the new column and tables. V1 in-memory and
  PostgreSQL adapters map `resume` transparently (`null` for V1 executions).
- **Old binaries during rollout**: a V1-only binary reading a Phase 2 database
  is unaffected because the migration is additive. A V1-only binary cannot
  process iterative executions, which are opt-in by `runtimeProfile`.

## Rollback strategy

- Application rollback: set the default profile back to `single_pass` and stop
  submitting `runtimeProfile: 'iterative'`. Existing paused iterative
  executions remain readable and terminal ones remain terminal; a paused
  execution can be cancelled or left waiting.
- Schema rollback (documented, not automatic): drop
  `operational_execution_checkpoints`, drop `operational_execution_steps`, drop
  the `resume` column. No Phase 2 object is affected. Rollback is destructive
  only to Phase 3 checkpoints, which are non-authoritative for Phase 2 data.
- No migration that mutates or deletes Phase 2 rows exists in this phase.

## Verification

- `packages/persistence/src/__tests__/postgres-migration-smoke.test.ts` runs
  the full migration chain on a disposable database.
- `apps/worker/src/__tests__/operational-harness-iterative-postgres.integration.test.ts`
  proves the new objects exist, are tenant-isolated and survive a fresh pool.
- `npm run test:postgres`: 26 files / 196 tests / 0 skips.
