# AAA-17 — Limitations and left dependencies

## Limitations (declared, not hidden)

1. **API wiring is not part of this task.** `apps/api/src/server.ts` still sets
   `journeys: null` for PostgreSQL persistence (`createPersistence`). The routes fail
   closed with `Journey persistence is unavailable in this mode` until AAA-18 wires the
   adapter. AAA-17 delivers the repository and its evidence only.
2. **Repository contract is shared but not enforced at compile time across async.**
   `JourneyRepositoryPort` returns `MaybePromise<T>`; the in-memory class answers
   synchronously, the PostgreSQL class with promises. Parity is proven behaviorally by
   the shared suite, not by a single async signature.
3. **Candidate fixtures remain synthetic and code-owned.** Owner/patient search still
   derives from `syntheticOwners`/`syntheticPatients`; the database only persists draft
   state and candidate ids. No real tutor/patient registry exists in scope.
4. **Expiry is read-triggered, not scheduled.** Status flips to `expired` when a read
   (`find*`, `list*`, search, or appointment creation) runs after `expires_at`; there is
   no background sweeper. Linked patients are intentionally not expired (parity with the
   memory implementation; they are evidence of a link, not a confirmation).
5. **RLS fail-closed proof uses a dedicated NOSUPERUSER role.** The standard test
   connection (`ricardo`) is a superuser on the disposable fixture and bypasses RLS; the
   dedicated-role test covers the policy. Repository methods additionally filter by
   `tenant_id` explicitly, so isolation holds even for a privileged connection.
6. **PostgreSQL fixture only.** All evidence comes from the disposable
   `127.0.0.1:55432/cvg_aaa16_test` database. No operational database, no production
   durability/RPO/RTO claim, no fsync claim.
7. **No real confirmation/reschedule/cancel.** The schema enforces
   `confirmation_blocked = true` and a status enum without `confirmed`; this task does
   not implement any high-risk capability.
8. **Concurrent working tree.** Other lanes are editing `agent-runtime`, `apps/api`,
   `channel-gateway` and shared tracking in the same checkout. Full-suite numbers
   include their tests; this evidence only certifies AAA-17 files and their focused
   suites.

## Dependencies left for AAA-18 (API wiring)

- Wire `PostgresJourneyRepository` in `apps/api/src/server.ts#createPersistence` for
  `postgres-pool` mode (the pool is already available) and expose it through the same
  route handlers; make the handlers await the async repository (the routes already
  `await Promise.resolve(...)` for lists).
- Decide how `sqlite`/memory mode keeps working: the port returns `MaybePromise`, so
  handlers must await uniformly.
- Populate the `journey_owner_drafts`/`journey_patient_drafts` FKs with real
  conversation/session rows from the PostgreSQL runtime before draft creation (the
  adapter validates context and the composite FKs enforce it).
- Add a PostgreSQL-mode API integration test (route-level cross-tenant denial) once the
  adapter is wired; AAA-17 tests the repository boundary only.
- Startup/migration gate: AAA-16/operational startup must run migrations including
  `0014_journeys` before serving journeys in PostgreSQL mode.
