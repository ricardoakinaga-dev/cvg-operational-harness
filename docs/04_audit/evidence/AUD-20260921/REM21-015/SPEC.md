# REM21-015 — SPEC

Data: 2026-09-22  
Status: `SPEC_APPROVED_CONTROLLED_BUILD`  
Contract: `rem21-015-v1`  
Runtime: Node `22.23.2`  
Scope: local, synthetic, disposable; no production or external service.

## Frozen file plan

### S15-API — trusted operator session hook

Create `apps/api/src/operator-session-hook.ts` with one installer function that
receives the Fastify app, session store, HTTPS cookie policy and the three
request-scoped maps. Move the existing `onRequest` session hook without
changing its order relative to HTTP security, response correlation, metrics or
token replay. `server.ts` calls the installer and keeps identity resolver
composition local.

Characterization: `operator-session.test.ts`,
`trusted-session-app.test.ts`/REM21-014 browser proof, and the API boundary
tests. Negative cases: expired session remains `401`; store error remains
`503`; session endpoints remain reachable for recovery/logout.

### S15-PG — migration lifecycle

Create `packages/persistence/src/postgres-migrations.ts` and move only the
migration lifecycle: path/version loading, `runInitialPostgresMigration`,
`runPostgresMigrations`, legacy baseline approval and exported legacy schema
catalogs. The module imports `PostgresQueryable` as a type. `postgres.ts`
reexports the existing names so package and relative imports remain stable.

No SQL, checksum algorithm, advisory lock, transaction boundary, schema-name
validation, migration order or baseline approval rule may change.

Characterization: migration smoke, checksum/legacy tests, tenant-isolation
tests and the PostgreSQL proof already recorded for REM21-010.

### S15-HARNESS — loop-detection policy

Create `packages/harness/src/loop-detection.ts` with the normalization,
`decisionSignature` and `detectDecisionCycle` implementation. Import and
reexport the public functions from `iterative-runtime.ts`; no consumer import
changes are required. The runtime remains the owner of thresholds, budgets,
checkpoint persistence and dispatch.

Characterization: `packages/harness/src/__tests__/iterative-runtime.test.ts`,
including A/B and A/B/C cycles, pure repeats and deterministic signatures.

### S15-WEB — Trace Viewer component

Create `apps/web/src/features/platform/TraceViewer.tsx` with props
`items: readonly PlatformTraceView[]` and `onSelect`. Move only the trace list
section, including its heading, empty state, redacted labels and accessible
buttons. `PlatformPanel` computes the tenant/agent-filtered list and owns the
selected trace. No fetch, mutation or state ownership moves.

Characterization: existing platform panel tests. Add a direct component test
for empty state, redacted tool labels and selection callback.

## Compatibility constraints

- no route, response, export, SQL, schema or UI label changes;
- no change to hook or effect ordering;
- no duplicate implementation during the transition;
- public names imported from `@cvg/persistence` and `@cvg/harness` remain
  available;
- no browser/session authority field is made editable;
- no test is skipped, weakened or reclassified.

## Verification matrix

| gate | command | expected |
| --- | --- | --- |
| focused API | `npm test -- apps/api/src/__tests__/operator-session.test.ts apps/api/src/__tests__/trusted-replay-distributed.test.ts apps/api/src/__tests__/rate-limit.test.ts` | pass, no new skip |
| focused persistence | `npm test -- packages/persistence/src/__tests__/postgres-migration-smoke.test.ts packages/persistence/src/__tests__/tenant-isolation.test.ts packages/persistence/src/__tests__/conversation-intelligence-migration.test.ts` | pass; disposable PG only when configured |
| focused harness | `npm test -- packages/harness/src/__tests__/iterative-runtime.test.ts` | pass |
| focused web | `npm test -- apps/web/src/features/platform/trace-viewer.test.tsx apps/web/src/features/platform/platform.test.tsx apps/web/src/__tests__/platform-panel.test.tsx` | pass |
| regression | `npm test` | existing suite remains green/skips governed |
| static | `npm run typecheck && npm run lint && npm run format:check && git diff --check` | pass |
| docs | `npm run docs:check-links` | no broken links |

All npm commands use the pinned Node 22 path. Evidence records exit code,
runtime, candidate/run if available, hashes and limitations. A full CI-bar
finalization is not authorized by this task; only local gates may be claimed.

## Rollback

Each slice is independently revertible by restoring the caller and removing its
new module/test. If a characterization test changes behavior, stop that slice,
retain the failing evidence and do not proceed to another slice. Do not reset or
clean the user worktree.

## Acceptance

The SPEC is satisfied only when all four slices have smaller owning hotspots,
the public contracts resolve, focused tests plus regression pass, and the
ownership map/reports document before/after metrics. This authorizes BUILD only
for the frozen file plan.
