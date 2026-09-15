# P2-1 remediation — commands and exit codes

Scope: `packages/agent-runtime/` + this evidence directory only.
Synthetic data, controlled fakes, no commit/push/deploy/install.

| # | Command                                                                                                          | Exit | Result                                                          | Artifact                    |
| - | ---------------------------------------------------------------------------------------------------------------- | ---- | --------------------------------------------------------------- | --------------------------- |
| 1 | `npx vitest run packages/agent-runtime/src/__tests__/runtime-journal.test.ts` (before fix)                        | `1`  | 4 failed \| 12 passed (16)                                       | `red-focused.log` / `.exit` |
| 2 | `npx vitest run packages/agent-runtime/src/__tests__/runtime-journal.test.ts` (after fix)                         | `0`  | 16 passed (16)                                                   | `green-focused.log` / `.exit` |
| 3 | `npx vitest run packages/agent-runtime/src/__tests__/runtime-journal.test.ts` (after hardening cases added)       | `0`  | 18 passed (18)                                                   | `green-focused-verbose.log` / `.exit` |
| 4 | `npm run typecheck`                                                                                              | `0`  | PASS                                                             | `typecheck.log` / `.exit`   |
| 5 | `npx prettier --check packages/agent-runtime/src/runtime.ts packages/agent-runtime/src/__tests__/runtime-journal.test.ts` | `0` | PASS (changed files only)                                        | `format-check.log` / `.exit` |
| 6 | `npm run lint`                                                                                                   | `0`  | PASS                                                             | `lint.log` / `.exit`        |
| 7 | `npm test`                                                                                                       | `0`  | 196 files passed \| 4 skipped (200); 1160 tests passed \| 57 skipped (1217) | `full-test.log` / `.exit`   |
| 8 | `git diff --check`                                                                                               | `0`  | no whitespace errors                                             | `git-diff-check.log` / `.exit` |

Baseline before this task: 1154 passed / 57 skipped. After: 1160 passed / 57
skipped (+6 new focused tests, zero failures).

RED scenario (log 1) is the pre-fix run of the four behavioral tests:
released-to-APPROVED (2 cases), EFFECT_STARTED-uncertainty-to-UNCERTAIN and
`approval_sweep_failed`. Cases 5–6 (journal lookup failure, exported helper)
were added as hardening after the first GREEN run and are covered by log 3.
