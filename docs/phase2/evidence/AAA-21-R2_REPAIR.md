# AAA-21-R2 repair evidence

Captured on 2026-09-14 in `America/Sao_Paulo` for the controlled synthetic
candidate in `/home/ricardo/Área de trabalho/cvg-operational-harness`.

## Scope implemented

- bounded execution attempts with deterministic retry exhaustion and durable
  dead-letter pairing;
- tenant/auth-scoped cancellation for safe pre-effect states, with active
  execution fail-closed behavior and idempotent repeated cancellation;
- neutral worker concurrency parsing, stop boundaries, graceful drain, lease
  fencing, and idempotent resource close;
- application and additive PostgreSQL invariants for result, failure,
  approval, lease, and timestamp shapes;
- exact row-count guards on execution/queue mutations;
- operational PostgreSQL role/RLS/migration preflight before the first claim;
- focused and full regression coverage, including a live least-privilege role
  that submits and executes through the operational worker composition.

## Candidate-bound verification

| Gate | Result |
| --- | --- |
| Focused Phase 2 + structure run | PASS; 8 files / 45 tests |
| `npm run typecheck` | PASS; exit 0 |
| `npm run lint` | PASS; exit 0 |
| `npm run build:harness` | PASS; exit 0 |
| `npm run build` | PASS; exit 0; Vite transformed 163 modules |
| `npm run test:evals -- --reporter=dot` | PASS; 1 file / 8 tests |
| `npm run test:worker:startup` | PASS; startup guard and controlled-memory smoke |
| `npm test -- --reporter=dot` | PASS; 249 files / 1,720 passed / 108 skipped |
| `npm run test:e2e` | PASS; 6 files / 6 tests |
| `npm run test:postgres -- --reporter=dot` with an isolated PostgreSQL 15 container | PASS; 22 files / 188 tests / 0 skips |
| live operational role preflight/worker proof | PASS; 13 tests, including a minimal non-superuser role |
| `npm run format:check` | BASELINE_FAIL; 430 pre-existing brownfield files report formatting drift |

The PostgreSQL run used the disposable container
`cvg-phase2-r2-postgres` on loopback port `55439`, with a unique schema per
test suite and synthetic credentials/data only. The container was stopped after
the run. No existing staging container or production database was used.

## Remaining qualification boundaries

- the implementation is controlled-only and production remains `NO_GO`;
- D3 real-PostgreSQL evidence is present; D4 process restart and D5
  fault-injected durable concurrency are not claimed;
- the global formatting debt is outside the R2 file set and was not mass-fixed;
- no real patient, clinical, financial, appointment, provider, channel, RAG,
  or external-effect path was introduced;
- the web surface was inspected as a design boundary but no UI change was
  required or authorized for this backend/persistence slice.
