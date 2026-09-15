# Phase 3 Handoff Revalidation Evidence

- Observed: 2026-09-15
- Scope: local controlled/synthetic only
- Database: disposable `postgres:15-alpine`, `cvg-phase4-postgres-20260915`,
  `127.0.0.1:55435`
- Entry candidate digest: `3e257b67a7cb70b77a4c4c3814d4cb7708a2f7bddb2709a3e6c48766cdd2ed8f`
- Migration digest: `686841b226aacb7493c2b3c87a5124d9c5dadedc8300296d31dae62b7d591f8a`
- External effects: `false`
- Production: `NO_GO`

## Commands

| Command                                                                  | Exit | Result                                         |
| ------------------------------------------------------------------------ | ---: | ---------------------------------------------- |
| `node scripts/phase3-candidate-digest.mjs`                               |    0 | 799 functional files; dirty worktree preserved |
| `TEST_DATABASE_URL=<disposable> npm run verify:phase2`                   |    0 | Canonical Phase 2 gate passed                  |
| `TEST_DATABASE_URL=<disposable> npm run verify:phase3`                   |    0 | Canonical Phase 3 gate passed                  |
| `npm test -- --reporter=dot`                                             |    0 | 256 files / 1,785 passed / 111 skipped         |
| `TEST_DATABASE_URL=<disposable> npm run test:postgres -- --reporter=dot` |    0 | 26 files / 196 tests / 0 skips                 |
| `npm run test:e2e`                                                       |    0 | 6/6 passed                                     |
| `npm run test:evals -- --reporter=dot`                                   |    0 | 10/10 passed                                   |
| `npm run test:worker:startup`                                            |    0 | Both smoke paths passed                        |

## Decision

`PHASE3_HANDOFF=VERIFIED`. The previous 120-second full-suite timeout is
retained as an earlier failed attempt; the bounded 300-second rerun supplied
the entry pass evidence. This document is intentionally bound to the
pre-Phase-4 entry snapshot and is not evidence for the current Phase 4
candidate.
