# AAA-17 — Commands and exit codes

All commands run at `/home/ricardo/cvg-agent-secretary-v2` on 2026-09-12.
`TEST_DATABASE_URL=postgres://ricardo@127.0.0.1:55432/cvg_aaa16_test` (disposable AAA-16
fixture; port 5432/operational DB never used). Node v24.20.0 local (target Node 22).

| # | Command | Exit | Observed result | Log |
|---|---------|------|-----------------|-----|
| 1 | `TEST_DATABASE_URL=… npx vitest run …/journeys-postgres.test.ts` (before implementation) | 1 | RED: import `../journeys-postgres.ts` unresolved, 0 tests collected | `RED-focused.log` |
| 2 | `TEST_DATABASE_URL=… npx vitest run …/journeys-postgres.test.ts --testTimeout=60000` (after implementation) | 0 | 1 file passed, **17/17 tests passed**, 0 skipped | `GREEN-focused.log` |
| 3 | `TEST_DATABASE_URL=… npm run test:postgres` | 0 | **14 files passed, 122/122 tests passed, 0 skipped** | `GREEN-postgres.log` |
| 4 | `npm test` (no `TEST_DATABASE_URL`) | 0 | 194 files passed \| 4 skipped (198); **1132 passed \| 56 skipped (1188)** | `GREEN-full-suite.log` |
| 5 | `npm run typecheck` | 0 | no errors | `typecheck.log` |
| 6 | `npm run lint` | 0 | no errors | `lint-global.log` |
| 7 | `npx eslint <5 AAA-17 files>` | 0 | no errors | `lint-scoped.log` |
| 8 | `npx prettier --check <AAA-17 code files, package.json>` | 0 | all files formatted | (see `COMMANDS` note) |
| 9 | `git diff --check` | 0 | no whitespace errors | — |
| 10 | Checksum verification script (`npx tsx`, fresh schema) | 0 | `schema_migrations.0014_journeys.checksum = 99759a17…5af6c` (equals file sha256) | `checksum-verification.log` |

## Repository state note

The working tree contains concurrent edits by other lanes (`packages/agent-runtime`,
`apps/api`, `packages/channel-gateway`, etc.). One transient global-lint failure in
`packages/agent-runtime/src/runtime.ts` (`evidenceRef` unused) was fixed by that lane
before the final run captured here; it is not an AAA-17 file. AAA-17 touches only:
`packages/persistence/migrations/0014_journeys.sql`,
`packages/persistence/src/journeys-postgres.ts`,
`packages/persistence/src/journeys.ts`,
`packages/persistence/src/index.ts`,
`packages/persistence/src/postgres.ts` (append `'0014_journeys'` to the explicit list),
`package.json` (append one test path to `test:postgres`).

## Full-suite delta

- Task statement baseline: 1113 pass / 46 skip.
- Observed: 1132 pass / 56 skip, zero failures.
- AAA-17 contributes 7 passing tests and 10 conditional skips when `TEST_DATABASE_URL`
  is unset (6 shared memory contract tests + 1 static migration test pass; 6 PostgreSQL
  parity + 4 PostgreSQL-only tests skip). The remaining +12 passing tests come from
  concurrent lane edits present in the shared working tree.
