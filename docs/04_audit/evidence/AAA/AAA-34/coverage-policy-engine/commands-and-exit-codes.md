# AAA-34 — commands and exit codes (`packages/policy-engine`)

Observed in `/home/ricardo/cvg-agent-secretary-v2` on 2026-09-13 UTC. Environment: Linux `7.0.0-31-generic` x86_64, Node `v24.20.0`, npm `11.19.0`, base `HEAD 512bc11e80fbf7c7b8baf6263aacc811ff829309` with concurrent-lane changes preserved.

| # | Purpose | Command | Exit | Raw log |
| - | ------- | ------- | ---- | ------- |
| 1 | Before coverage | `npx vitest run packages/policy-engine --coverage.enabled --coverage.include='packages/policy-engine/src/**' --coverage.reportsDirectory=docs/04_audit/evidence/AAA/AAA-34/coverage-policy-engine/before --coverage.reporter=json-summary --coverage.reporter=json --coverage.reporter=text --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 --coverage.thresholds.functions=0 --coverage.thresholds.lines=0 --no-file-parallelism` | 0 | `before-coverage-command.log`, `.exit` |
| 2 | Focused tests (after) | `npx vitest run packages/policy-engine --no-file-parallelism --maxWorkers=2` | 0 | `focused-tests.log`, `.exit` |
| 3 | After coverage | same as #1 with `--coverage.reportsDirectory=.../after` | 0 | `after-coverage-command.log`, `.exit` |
| 4 | Typecheck | `npm run typecheck` | 0 | `typecheck.log`, `.exit` |
| 5 | Lint | `npm run lint` | 0 | `lint.log`, `.exit` |
| 6 | Full suite | `npm test` | 0 | `full-test.log`, `.exit` |
| 7 | Exact focused command from the task (default reporters) | `npx vitest run packages/policy-engine --coverage.enabled --coverage.include='packages/policy-engine/src/**' --no-file-parallelism` | 0 | `focused-coverage-exact.log`, `.exit` |

## Results

- #1 before: 3 files / 35 tests PASS; package branches `124/139 = 89.2%` (engine `88.99%`, grants `50%`).
- #2 focused after: 5 files / 54 tests PASS (`+2 files`, `+19 tests`).
- #3 after: 5 files / 54 tests PASS; package branches `136/139 = 97.84%` (engine `98.16%`, grants `83.33%`); statements `98.77%`, functions `100%`, lines `99.34%`.
- #4 typecheck: zero errors.
- #5 lint: zero errors (global `eslint .`, docs ignored by config).
- #6 full suite: `Test Files 227 passed | 4 skipped (231)`; `Tests 1563 passed | 57 skipped (1620)`; zero failures. Baseline in the assignment (1544 pass / 57 skip) was captured before this lane added its 19 tests; the delta is exactly +19 passed tests, skips unchanged.
- #7 exact task command independently reproduces `Branches 97,84% (136/139)`, `Statements 98,77%`, `Functions 100%`, `Lines 99,34%`.

## Reproduce

```bash
npx vitest run packages/policy-engine --coverage.enabled \
  --coverage.include='packages/policy-engine/src/**' \
  --coverage.reporter=json-summary --coverage.reporter=text \
  --coverage.thresholds.statements=0 --coverage.thresholds.branches=0 \
  --coverage.thresholds.functions=0 --coverage.thresholds.lines=0 \
  --no-file-parallelism
npm run typecheck
npm run lint
npm test
```
