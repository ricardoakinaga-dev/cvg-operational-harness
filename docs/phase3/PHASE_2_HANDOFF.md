# Phase 2 Handoff — Evidence Refresh R5

- Date: 2026-09-14
- Task: `CVG-PHASE3-RUNTIME-V2` / gate `PHASE2_HANDOFF`
- Authority: explicit user request; local controlled/synthetic scope only.
- Production: `NO_GO` retained.
- Result: **`PHASE2_HANDOFF = VERIFIED`**

## Why this refresh exists

The Phase 2 R4 evidence was marked `STALE` by the Gauntlet publication state
(`.gauntlet/progress.md`: "Evidence freshness: STALE / Prior evidence is stale
after explicit rebaseline"). Phase 3 must not start cognitive implementation on
a stale certification, so the Phase 2 gates were re-executed against the
current candidate and fresh evidence was produced. Old documentation was not
accepted as proof of the new candidate.

## Candidate identity

| Field | R4 (previous) | Current (refresh) |
| --- | --- | --- |
| HEAD | `512bc11e80fbf7c7b8baf6263aacc811ff829309` | `512bc11e80fbf7c7b8baf6263aacc811ff829309` |
| worktree | dirty (preserved) | dirty (preserved) |
| artifact fingerprint | `440591a55593aff958689f74eb44cd2cfa8d2861b84323e0735e58de8b347080` | `882d1e91dc0754962d3d017816cd7660a37db15acef9f5bd38ab7f82a59037de` |
| functional digest | not recorded | `4c491ca91b0f19e245fbfb40be64d681142355c565cd7527da511627ea934d0f` (847 files) |
| migration digest | `b49d5320f9d02ad3686e87e930b45f1bfd51a8d862051325acec1a2528db4dd0` | `4b262018a0e648a02b2db0fa2413ad33f230eb806724801b7d74c8f4a7f15bb4` (19 files) |

Machine-readable snapshot: `docs/phase3/CANDIDATE_IDENTITY.json` plus
`docs/phase3/evidence/PHASE2_REVALIDATION.json`.

The functional digest is computed by `scripts/phase3-candidate-digest.mjs`:
SHA-256 over sorted `path\0sha256` records of a declared scope (application
and package sources, tests, scripts, operational docs, root configuration).
Generated output (`node_modules`, `dist`, `coverage`, `test-results`) and
Gauntlet state are excluded.

## Artifact drift attribution

`find` against the R4 capture time shows no change under
`apps/*/src`, `packages/*/src`, `packages/persistence/migrations`, `scripts`,
or `tests` after the R4 fingerprint. The artifact digest delta is fully
attributed to:

1. post-R4 publication ledgers rewritten at/after the R4 fingerprint
   (`docs/phase2/*`, `docs/99_runtime_state.md`,
   `docs/20_master_execution_log.md`, `docs/30_backlog_master.md`);
2. generated build output outside the tracked source scope
   (`apps/web/dist`, `node_modules/.vite`, `test-results`);
3. Gauntlet publication state, excluded from artifact scope but present on
   disk.

No Phase 2 behaviour source changed. The refresh replaces the stale digest
binding instead of reusing R4 bytes.

## Re-executed gates (current candidate)

| Gate | Command | Result | R4 baseline | Match |
| --- | --- | --- | --- | --- |
| focused Phase 2 | `npx vitest run <5 focused files>` | 5 files / 31 tests / 0 skips | 5 / 31 / 0 | yes |
| canonical verify | `TEST_DATABASE_URL=<disposable> npm run verify:phase2` | format selection, typecheck, lint, build:harness, build, focused, `demo:phase2`, `test:postgres` PASS | PASS | yes |
| PostgreSQL catalog | `npm run test:postgres -- --reporter=dot` | 24 files / 190 tests / 0 skips | 24 / 190 / 0 | yes |
| full regression | `npm test -- --reporter=dot` | 250 files / 1,727 passed / 110 skipped | 250 / 1,727 / 110 | yes |
| E2E | `npm run test:e2e` | 6/6 passed | 6/6 | yes |
| evals | `npm run test:evals -- --reporter=dot` | 8 tests passed | 8 tests | yes |
| worker startup | `npm run test:worker:startup` | fail-closed + controlled smoke PASS | PASS | yes |

Environment: local Node `v24.20.0` (target `>=22 <23`, retained limitation),
disposable `postgres:15-alpine` container `cvg-phase3-pg` on
`127.0.0.1:55434`. No external provider, channel, RAG source, real data,
deploy, or external effect was touched (`externalEffects: false`).

## Functional drift confirmation

`functionalDrift: NONE`. Every Phase 2 gate reproduced its R4 pass envelope
exactly. The Phase 2 verdict remained `CONDITIONAL_PASS` because the R4 fresh
critic returned no report; this refresh does not upgrade or restate that
verdict. It certifies only that the current candidate satisfies the frozen
Phase 2 bar on re-execution.

## Refreshed sentinel

`docs/phase3/evidence/PHASE2_FINAL_SENTINEL.json` binds the refreshed
evidence to the current candidate digest. The R4 ledger
(`docs/phase2/evidence/FINAL_SENTINEL.json`) is retained as history and
marked superseded; it is not used as proof of the current candidate.

## Retained limitations

- R4 fresh-critic non-report; Phase 2 verdict stays `CONDITIONAL_PASS`.
- External-provider exactly-once not exercised (deterministic synthetic tool
  surface only).
- Global Prettier drift remains in brownfield files; the Phase 2 formatted
  selection passes.
- Local Node 24 vs repository target Node 22.
- D5 remains controlled/disposable PostgreSQL evidence only.
- Production `NO_GO`; real data, providers, channels, RAG, sensitive actions,
  and external effects are not authorized.

## Gate decision

`PHASE2_HANDOFF = VERIFIED` — Phase 3 implementation may proceed on top of the
existing durable execution spine. The Phase 2 spine is not to be rewritten
without proven need.
