# AUD20-008 - Evidence Manifest

- program: `AUD-20260920-REAUDIT`
- task: `AUD20-008`
- finding: `A20-F10`
- status: `PASS_LOCAL / I1_PENDING`
- bar: `QAUD20-v1`
- candidate: `579d2100c172b5157ed42d1cf983988d3401a8c930353b52e50c589578ea55af`
- run: `run-579d2100c172-mub8591x`
- environment: Node `v22.23.2`, synthetic disposable PostgreSQL 16 at
  `127.0.0.1:55432`; no external services or real data

## Implementation

- `apps/api/src/webhook-security.ts`
- `apps/api/src/tenant-preflight.ts`
- `packages/persistence/migrations/0025_webhook_replay_fencing.sql`
- `packages/persistence/src/postgres.ts`
- `apps/api/src/__tests__/webhook-security.test.ts`
- `apps/api/src/__tests__/postgres-persistence-mode.test.ts`
- `packages/persistence/src/__tests__/postgres-migration-smoke.test.ts`
- `scripts/skip-catalog.json`

## Evidence

- `DISCOVERY.md` records the reproduced stale-holder problem and authority map.
- `SPEC.md` records the reservation contract, memory/PostgreSQL design and
  acceptance criteria.
- `verification-summary.json` records the focused controls and integrated
  certification result.
- `postgres.log` and `postgres-test-report.json` bind the explicit disposable
  PostgreSQL run: 35 files, 253 tests, zero failures and zero skips.
- `sha256sums.txt` binds this task evidence to the current candidate manifest,
  verified Phase 10 result, skip inventory, reports, coverage, mutation guard
  and gate logs.

## Integrity rule

The candidate is dirty by design because this repository carries controlled
AUD19/AUD20 work. Evidence is excluded from candidate scope; any later product
or contract change requires a new candidate/run. External integrations, human
signoff and production remain outside this authorization. Independent I1 review
and the final mutation sentinel are still pending.
