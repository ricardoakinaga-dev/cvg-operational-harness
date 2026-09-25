# AUD20-007 - Evidence Manifest

- program: `AUD-20260920-REAUDIT`
- task: `AUD20-007`
- finding: `A20-F08`
- status: `VERIFIED_LOCAL / PASS_LOCAL`
- bar: `QAUD20-v1`
- candidate: `0be9f9dcabd103bbf7ce7cf47f2e2b12d3502ac24f11f41b93b08eadb98b100b`
- run: `run-0be9f9dcabd1-muaqyxky`
- environment: Node `v22.23.2`, synthetic disposable PostgreSQL 16 at
  `127.0.0.1:55432`; no external services or real data

## Implementation

- `packages/persistence/migrations/0024_approval_decision_causality.sql`
- `packages/approval-engine/src/contracts.ts`
- `packages/approval-engine/src/engine.ts`
- `packages/persistence/src/runtime-approval-store.ts`
- `apps/api/src/server.ts`
- `apps/worker/src/homolog-worker.ts`
- `packages/agent-core/src/approval-reconciliation.ts`
- `scripts/skip-catalog.json`

## Evidence

- `SPEC.md` records the discovery, invariants, selected design and acceptance contract.
- `verification-summary.json` records the PostgreSQL, recovery, negative-control and
  integrated-certification results.
- `postgres.log` and `postgres-test-report.json` bind the explicit disposable
  PostgreSQL run: 35 files, 252 tests, zero failures and zero skips.
- `sha256sums.txt` binds this task evidence to the final candidate manifest,
  verified Phase 10 result, skip inventory, reports, coverage, mutation guard
  and gate logs.

## Integrity rule

The candidate is dirty by design because this repository carries controlled
AUD19/AUD20 work. Evidence is excluded from candidate scope; any later product
or contract change requires a new candidate/run. External integrations, human
signoff and production remain outside this authorization.
