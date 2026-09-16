# RA-M1-04/05/08 — persistence builder response

Local reversible BUILD under PROD-02/06 REWORK and docs/02_spec/prod20260913_m1_reaudit_contract.md. No approval or production claim. Shared prior dirty work retained; only seven persistence files changed by this lane; no server.ts, index.ts, migrations, shared docs or package.json edits. Leader owns documentation and independent acceptance.

## Changes

- PostgresJourneyRepository.createJourneyTask supplies a creation-only callback to PostgresRuntimeRepository.createTask. Callback runs on same transaction client, resolves tenant/session conversation, and appends integration_event with policyVersion journey-r3, payload journey=journey_task_created/resourceId/conversationId/sessionId, and normalized trusted actor/correlation. Audit rejection rolls task back.
- createTask uses targeted ON CONFLICT (session_id, source, idempotency_key) DO NOTHING RETURNING id. The losing insert then reads the winner in a valid transaction. Only inserted rows call onCreated. Unexpected database errors still propagate. This optional callback requires caller-owned transaction for atomicity; the journey caller supplies it. Existing no-callback callers preserve their contract.
- In-memory journey task creation snapshots task/audit arrays, appends identical event only for actual new task, and restores both arrays on audit failure. Sequential replay retains original event and attribution.
- Transaction helper now shares explicit cleanup verification on success and rollback: exactly one row and tenant_id exactly null required. Missing row/property, dirty value, reset/query failure destroys client. First cleanup failure remains latched even if rollback cleanup later recovers. Original operation error preserved. Callback plus audit/state still commit atomically.
- Existing generic task-query mock updated to return PostgreSQL ON CONFLICT result semantics; success INSERT fixture supplies RETURNING id.

## Files

packages/persistence/src/journeys.ts
packages/persistence/src/journeys-postgres.ts
packages/persistence/src/postgres.ts
packages/persistence/src/tenant-scoped-postgres.ts
packages/persistence/src/**tests**/journeys-postgres.test.ts
packages/persistence/src/**tests**/journey-task-atomicity.test.ts
packages/persistence/src/**tests**/postgres-migration-smoke.test.ts

Final hashes: /tmp/m1-persistence-final.sha256. Existing unrelated persistence index.ts dirty work untouched.

## Evidence / commands

All Node commands PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH. All real DB tests TEST_DATABASE_URL=postgres://m1audit@127.0.0.1:55584/m1builder. Created only exclusive disposable database m1builder; never used m1suite/m1critic. Test schemas isolated and removed by tests. DB remains disposable for inspection.

1. RED: node_modules/.bin/vitest run --no-file-parallelism packages/persistence/src/**tests**/journey-task-atomicity.test.ts packages/persistence/src/**tests**/journeys-postgres.test.ts — exit 1, 7 failed/23 passed. /tmp/m1-persistence-red.log. Captures real 25P02 concurrent insert (barrier on two clients), task surviving rejecting audit trigger, missing trusted event in memory+Postgres parity, missing/dirty cleanup and missing rollback verification. Initial unrecorded setup race key was too short; corrected to valid race-task before authoritative RED execution.
2. Initial GREEN same command — exit 0, 2 files/30 passed. /tmp/m1-persistence-green.log.
3. Broader final regression: node_modules/.bin/vitest run --no-file-parallelism packages/persistence apps/api/src/**tests**/journeys-api-postgres.test.ts — exit 0, 31 files/212 tests, no skips. /tmp/m1-persistence-regression.log. Includes real PG migrations/tenant isolation/task creation paths and HTTP journey suite. Earlier broad run found two obsolete mock behaviors, corrected as described.
4. Final focused after last lint-only mock adjustment: node_modules/.bin/vitest run packages/persistence/src/**tests**/journey-task-atomicity.test.ts — /tmp/m1-persistence-final-focused.log (8 cases: cleanup failure/missing/dirty, cleanup success/rollback verified, recovered-cleanup destroy, memory rollback, real PG rollback+retry+single audit, real PG concurrent replay+single audit).
5. npm run typecheck — exit 0 /tmp/m1-persistence-typecheck.log. Leader corrected contextual parameter annotation in server adapter after Postgres createTask optional callback changed union contextual typing; no server edit by this lane.
6. eslint on seven files — exit 0 /tmp/m1-persistence-lint.log; prettier --check seven files — exit 0 /tmp/m1-persistence-format.log; git diff --check -- packages/persistence — exit 0.
7. Original critic fault-model probe: node --import tsx /tmp/m1-cleanup-probe.ts — exit 0 /tmp/m1-persistence-cleanup-probe.log. destroy=true, verificationQueries=1 (previously false/0). This is a synthetic dirty/no-op-reset model, not evidence of ordinary PostgreSQL reset failure.

## Limits / handoff

No complete root suite/coverage from this lane; leader runs frozen integrated gates. No real IdP/provider/clinical/financial action; no production, durability/RPO-RTO claim. HTTP task-specific negative is covered through repository real-DB rejecting trigger; fresh independent reviewer should repeat original HTTP task probe against final candidate. No shared status marked VERIFIED by builder. Leader advised adding new test filename to enumerated test:postgres script so future canonical PG runs retain new regressions.
