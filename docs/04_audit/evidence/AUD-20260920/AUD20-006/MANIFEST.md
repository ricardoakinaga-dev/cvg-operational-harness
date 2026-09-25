# AUD20-006 - Evidence Manifest

- program: `AUD-20260920-REAUDIT`
- task: `AUD20-006`
- finding: `A20-F09`
- status: `VERIFIED_LOCAL / PASS_LOCAL`
- bar: `QAUD20-v1`
- candidate: `10a6f56ae591a718369d815b5d1b86fe19fe59284821ec857f18c11c3b26df3e`
- run: `run-10a6f56ae591-muamvuyi`
- environment: Node `v22.23.2`, synthetic disposable PostgreSQL 16 at
  `127.0.0.1:55432`; no external services or real data

## Implementation

- `packages/persistence/migrations/0021_approval_decision_audit_dedupe.sql`
- `packages/persistence/src/postgres.ts`
- `apps/api/src/tenant-preflight.ts`
- `apps/api/src/server.ts`
- `apps/api/src/__tests__/approval-decision-atomicity-postgres.test.ts`
- `apps/api/src/__tests__/postgres-persistence-mode.test.ts`
- `scripts/skip-catalog.json`

## Evidence

- `SPEC.md` records the selected design and acceptance contract.
- `verification-summary.json` records the PostgreSQL, negative-control and
  integrated-certification results.
- `postgres.log` and `postgres-test-report.json` bind the explicit disposable
  PostgreSQL run: 35 files, 251 tests, zero failures and zero skips.
- `sha256sums.txt` binds this task evidence to the final candidate manifest,
  verified Phase 10 result, skip inventory, reports, coverage, mutation guard
  and gate logs.

## Integrity rule

The candidate is dirty by design because this repository carries controlled
AUD19/AUD20 work. Evidence is excluded from candidate scope; any later product
or contract change requires a new candidate/run. External integrations, human
signoff and production remain outside this authorization.
