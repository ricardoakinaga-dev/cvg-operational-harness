# Phase 2 revalidation evidence (refresh R5)

Machine-readable counterpart: `PHASE2_REVALIDATION.json`.

## Commands executed against the current candidate

```sh
npx vitest run --no-file-parallelism --maxWorkers=2 \
  apps/worker/src/__tests__/operational-harness-worker.test.ts \
  apps/worker/src/__tests__/operational-harness-synthetic-effect.test.ts \
  packages/harness/src/__tests__/effect-journal.test.ts \
  packages/harness/src/__tests__/execution-spine.test.ts \
  apps/api/src/__tests__/execution-spine.test.ts
# 5 files / 31 tests passed

TEST_DATABASE_URL=postgres://phase3:***@127.0.0.1:55434/cvg_phase3 npm run verify:phase2
# format selection, typecheck, lint, build:harness, build, focused, demo:phase2, test:postgres -> exit 0

TEST_DATABASE_URL=... npm run test:postgres -- --reporter=dot
# 24 files / 190 tests / 0 skips

npm test -- --reporter=dot
# 250 files / 1,727 passed / 110 skipped

npm run test:e2e      # 6/6
npm run test:evals -- --reporter=dot   # 8 tests
npm run test:worker:startup            # fail-closed + controlled smoke
```

## Disposable database

`docker run -d --name cvg-phase3-pg -p 127.0.0.1:55434:5432 postgres:15-alpine`
with synthetic credentials; stopped after the phase. No staging or production
database was touched.

## Drift analysis

No file under `apps/*/src`, `packages/*/src`, `packages/persistence/migrations`,
`scripts`, or `tests` changed after the R4 artifact fingerprint capture
(04:15 local / 07:15Z). The drift in the repository-level artifact digest is
attributed to publication-ledger rewrites and generated build output. Fresh
digests are recorded, and no R4 bytes are reused as current evidence.

## Verdict

Functional drift: `NONE`. `PHASE2_HANDOFF = VERIFIED` with the retained
limitations listed in `docs/phase3/PHASE_2_HANDOFF.md`. Production stays
`NO_GO`.
