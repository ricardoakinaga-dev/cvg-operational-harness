# AAA-21 migration safety

- Migration `0016_operational_execution_spine.sql` adds four new tables,
  indexes, RLS policies, comments, and public privilege revocations.
- Existing tables are not altered or dropped.
- Composite tenant keys and foreign keys prevent cross-tenant references at
  the schema boundary.
- Request/result protection-version columns are present for future controlled
  payload protection policy; this round uses synthetic payloads only.
- The migration is registered in the default migration list in
  `packages/persistence/src/postgres.ts`.
- Forward migration, RLS policies, tenant probes, and least-privilege role
  preflight were exercised against an isolated disposable PostgreSQL 15
  database in the R3/R4 catalog. The R4 effect proof also used a unique schema
  and queried the journal through the administrative evidence connection while
  the worker used the restricted operational role.
- Rollback, lock timing, and production privilege rehearsal remain
  `NOT_PROVEN`; no production or tenant database was touched.

Before any production migration, run it against a disposable database, verify
the current migration ledger, inspect grants/policies as the application role,
and obtain a separate operational approval. Do not apply this migration to a
real tenant database as part of this controlled task.
