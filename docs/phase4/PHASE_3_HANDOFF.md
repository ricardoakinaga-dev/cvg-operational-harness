# Phase 3 Handoff — AAA-41 Entry Gate

- Date: 2026-09-15
- Task: `CVG-PHASE4-CAPABILITY-BOUNDARY` / `AAA-41`
- Gate: `PHASE3_HANDOFF=VERIFIED`
- Authority: explicit user request; local controlled/synthetic scope only.
- Production: `NO_GO` retained.

## Decision

`PHASE3_HANDOFF=VERIFIED`. Phase 4 implementation may proceed on top of the
existing Runtime V2 and durable execution spine. This is an entry-gate result;
it does not upgrade the historical Phase 3 certification, which remains
`CONDITIONAL_PASS` / C5.

## Current candidate

The recorded Phase 3 candidate sentinel remains historical. The entry gate was
re-run against the current dirty worktree after two non-semantic formatter
repairs and a verification-script correction:

| Field             | Previous Phase 3 record                                            | Current entry snapshot                                             |
| ----------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| HEAD              | `512bc11e80fbf7c7b8baf6263aacc811ff829309`                         | `512bc11e80fbf7c7b8baf6263aacc811ff829309`                         |
| Worktree          | dirty, preserved                                                   | dirty, preserved                                                   |
| Functional digest | `ba6a6274fa9f06b47b7d48357bfceb33e299760f29b45f8ad874b22c05088853` | `3e257b67a7cb70b77a4c4c3814d4cb7708a2f7bddb2709a3e6c48766cdd2ed8f` |
| Functional files  | 799                                                                | 799                                                                |
| Migration digest  | `686841b226aacb7493c2b3c87a5124d9c5dadedc8300296d31dae62b7d591f8a` | `686841b226aacb7493c2b3c87a5124d9c5dadedc8300296d31dae62b7d591f8a` |
| Migration files   | 20                                                                 | 20                                                                 |

The digest delta is attributed to `packages/harness/src/iterative-runtime.ts`,
`packages/harness/src/completion.ts` formatter-only changes, and the
`--ignore-unknown` correction in `scripts/phase3-verify.mjs` for the SQL
migration. No Phase 4 implementation is included in this snapshot.

## Revalidated gates

All commands used only synthetic fixtures and a disposable local PostgreSQL
15 container named `cvg-phase4-postgres-20260915` bound to
`127.0.0.1:55435`. No external provider, channel, RAG source, real data,
deployment, or external effect was touched.

| Command                                                                  | Exit | Observed result                                                 |
| ------------------------------------------------------------------------ | ---: | --------------------------------------------------------------- |
| `node scripts/phase3-candidate-digest.mjs`                               |    0 | Current digest above; dirty worktree explicitly included        |
| `TEST_DATABASE_URL=<disposable> npm run verify:phase2`                   |    0 | Format, typecheck, lint, build, focused, demo, PostgreSQL pass  |
| `TEST_DATABASE_URL=<disposable> npm run verify:phase3`                   |    0 | Format, typecheck, lint, build, focused, demo, PostgreSQL pass  |
| `npm test -- --reporter=dot`                                             |    0 | 256 files passed, 12 skipped; 1,785 passed, 111 skipped         |
| `TEST_DATABASE_URL=<disposable> npm run test:postgres -- --reporter=dot` |    0 | 26 files, 196 tests, 0 skips                                    |
| `npm run test:e2e`                                                       |    0 | 6/6 passed                                                      |
| `npm run test:evals -- --reporter=dot`                                   |    0 | 2 files, 10/10 passed                                           |
| `npm run test:worker:startup`                                            |    0 | Fail-closed and controlled smoke passed                         |
| `npm run demo:phase3`                                                    |    0 | 5-step iterative synthetic loop, 2 tools, zero external effects |

The first full-suite attempt was terminated by the tool's 120-second ceiling
before a summary; it was preserved as a timeout event and rerun with a
300-second ceiling, where it passed in 240.20 seconds. The timeout is not
silently treated as a pass.

## Retained limitations

- Phase 3 remains `CONDITIONAL_PASS`, not a production qualification.
- Actual mid-loop PostgreSQL process-kill equivalence is not a live kill proof.
- External-provider exactly-once semantics remain unproven; fixtures are synthetic.
- Checkpoint digests are integrity hashes, not keyed authenticity.
- Phase 2's prior fresh critic returned no report.
- Local Node is 24.20.0 while the repository target is Node 22.
- Global brownfield formatting debt remains outside the focused gate.
- Production, real data, real channels, RAG, providers, and sensitive actions remain `NO_GO`.

## Evidence

- Revalidation command record: `docs/phase4/evidence/PHASE3_HANDOFF_REVALIDATION.md`
- Historical Phase 3 result: `docs/phase3/PHASE_3_RESULT.json`
- Historical Phase 3 sentinel: `docs/phase3/evidence/PHASE3_FINAL_SENTINEL.json`
