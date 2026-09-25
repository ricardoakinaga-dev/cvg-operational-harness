# AUD20-005 - Evidence Manifest

- program: `AUD-20260920-REAUDIT`
- task: `AUD20-005`
- finding: `A20-F04`
- status: `VERIFIED_LOCAL / PASS_LOCAL`
- bar: `QAUD20-v1`
- candidate: `a7b8b86b111a3d4fdc0f1042af7a2b92ca8540a9204f7dd2da9113eb59111a80`
- run: `run-a7b8b86b111a-muagav9h`
- environment: Node `v22.23.2`, synthetic disposable PostgreSQL 16 at
  `127.0.0.1:55432`; no external services or real data

## Implementation

- `packages/persistence/migrations/0023_rate_limit_buckets.sql`
- `apps/api/src/tenant-preflight.ts`
- `apps/api/src/server.ts`
- `apps/api/src/__tests__/postgres-persistence-mode.test.ts`
- `scripts/skip-catalog.json`

## Evidence

- `SPEC.md` records the selected design and acceptance contract.
- `verification-summary.json` records the focused, PostgreSQL, negative-control
  and integrated-certification results.
- `postgres.log` and `postgres-test-report.json` bind the explicit disposable
  PostgreSQL run: 35 files, 238 tests, zero failures and zero skips.
- `sha256sums.txt` binds this task evidence to the candidate manifest, verified
  Phase 10 result, skip inventory, coverage, mutation guard and gate logs.

## Integrity rule

The candidate is dirty by design because this repository carries controlled
AUD19/AUD20 work. Evidence is excluded from candidate scope; any later product
or contract change requires a new candidate/run. External integrations,
human signoff and production remain outside this authorization.
