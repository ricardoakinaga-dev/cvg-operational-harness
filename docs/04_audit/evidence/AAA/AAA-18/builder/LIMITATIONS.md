# AAA-18 — Limitations and residual risks (builder lane)

1. **Legacy direct-client adapter is single-connection.** For `persistence.kind =
'postgres'`, `singleConnectionPool` hands the checked-out client to
   `PostgresJourneyRepository`. It is safe for the controlled sequential usage this
   mode exists for, but it is not a concurrent production adapter: a pool is required
   for parallel tenant-scoped operations. Production requires
   `POSTGRES_RLS_ENFORCEMENT=true` and therefore uses `kind: 'postgres-pool'`.

2. **`release(error)` cannot destroy a shared legacy connection.** `withTenantContext`
   signals cleanup failure through `client.release(error)`; a real pool destroys the
   connection, while the direct-client adapter cannot. The tenant context is reset in
   the `finally` path before release, so no tenant context is intentionally leaked;
   the residual case is a failed search_path reset on a shared test client.

3. **Startup auto-migration now always uses the checksum-guarded runner.** Non-RLS
   postgres startup previously applied only `0000_initial`. It now runs
   `runPostgresMigrations`, so `0014_journeys` (and every other migration) is applied
   at startup with checksum verification. A database manually marked `0000_initial`
   without a checksum (created by the old initial-only runner) now fails closed with
   `PostgreSQL migration checksum missing: 0000_initial` instead of silently skipping
   tenant isolation. Such a database needs an explicit roll-forward/backfill decision;
   no legacy database was modified by this task.

4. **RLS proof is inherited from AAA-17.** The HTTP suite runs on the disposable
   fixture with a BYPASSRLS superuser (as all existing AAA-16 integration suites do),
   so it proves route-level isolation through explicit `tenant_id` predicates and
   `withTenantContext`. The RLS policy enforcement itself is proven separately by
   `packages/persistence/src/__tests__/journeys-postgres.test.ts` with a dedicated
   NOSUPERUSER role.

5. **Read-triggered expiry.** Journeys remain draft-only and expiry still happens on
   read; no background sweeper was added. No real confirmation, reschedule or cancel
   exists; the confirm route is absent (404) and `confirmation_blocked` stays true.

6. **New suite placement.** `package.json` was off-limits, so the new
   `journeys-api-postgres.test.ts` could not be appended to the fixed `test:postgres`
   list. It is executed by the focused gates, `npm test`, and the full suite with
   `TEST_DATABASE_URL` (0 skips); `npm run test:postgres` continues to cover the 14
   listed files (123 tests, 0 skips).

7. **Fixture-only evidence.** All results come from the disposable
   127.0.0.1:55432/cvg_aaa16_test cluster. No production durability, RPO/RTO, fsync or
   operational claim is made. No commit, push, deploy or `npm install` was performed.

8. **Concurrent working tree.** Other lanes have uncommitted edits in the same
   checkout (agent-runtime, channel-gateway, shared tracking, etc.). The full-suite
   numbers include their tests; this evidence certifies the AAA-18 diff only.
