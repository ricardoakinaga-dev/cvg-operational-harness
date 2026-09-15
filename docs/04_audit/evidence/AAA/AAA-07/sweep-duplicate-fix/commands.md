# P1-2 remediation — commands and exit codes

Program `AAA-20260912`, task `AAA-07`, finding `P1-2` (independent P1 review,
`docs/04_audit/evidence/AAA/P1-independent-review/REVIEW.md`, residual risk
recorded in `docs/04_audit/evidence/AAA/AAA-07/sweep-callsite/limitations.md`).

Scope: `packages/agent-runtime/`, `packages/approval-engine/` and this evidence
directory only. Synthetic data, controlled fakes; no commit/push/deploy/install.

| # | Command | Exit | Result | Artifact |
| - | ------- | ---- | ------ | -------- |
| 1 | `npx vitest run packages/agent-runtime/src/__tests__/runtime-sweep-operation-key.test.ts` (before fix, RED) | `1` | 6 failed \| 0 passed (6): legacy caller-key retry re-executed (`executed` instead of `denied`) and the persisted-key API did not exist (strict schema `invalid_request`) | `red-focused.log` / `red-focused.exit` |
| 2 | `npx vitest run packages/agent-runtime packages/approval-engine --no-file-parallelism --maxWorkers=2` (after fix, GREEN) | `0` | 19 files passed (19); 361 tests passed (361) | `green-focused.log` / `green-focused.exit` |
| 3 | `npx vitest run packages/agent-runtime/src/__tests__/runtime-sweep-operation-key.test.ts packages/approval-engine/src/__tests__/approval-operation-key.test.ts --no-file-parallelism --maxWorkers=2` | `0` | 2 files passed (2); 14 tests passed (14) | `green-new-suites.log` / `green-new-suites.exit` |
| 4 | `npm run typecheck` | `0` | `tsc -p tsconfig.typecheck.json --noEmit` clean | `typecheck.log` / `typecheck.exit` |
| 5 | `npm run lint` | `0` | `eslint .` clean | `lint.log` / `lint.exit` |
| 6 | `npx prettier --check <6 changed files>` | `0` | all changed files formatted | `format-check.log` / `format-check.exit` |
| 7 | `npm test` | `0` | 229 files passed \| 4 skipped (233); 1577 tests passed \| 57 skipped (1634); zero failures | `full-test.log` / `full-test.exit` |
| 8 | `git diff --check` | `0` | no whitespace errors | `git-diff-check.log` / `git-diff-check.exit` |

## Baseline reconciliation (discrepancy disclosed)

The assignment stated a full-suite baseline of 1544 passed / 57 skipped. The
measured working tree does not reproduce that number: this task added 14 tests
(7 runtime + 7 approval-engine) and the final full suite reports 1577 passed /
57 skipped, so the current tree already carried **1563** passing tests before
this fix. The delta versus the stated baseline (19 tests) is attributable to
concurrent AAA lanes present in the dirty working tree (the P1 review already
recorded 86 dirty entries and active parallel lanes). Zero failures in every
run; no pre-existing test was deleted or skipped.

## Existing tests adjusted (required by the corrected contract)

Both adjustments correct assertions that encoded the P1-2 inference; they are
not relaxations:

1. `packages/agent-runtime/src/__tests__/runtime-journal.test.ts` —
   "releases an expired reservation without effect evidence to APPROVED" became
   "keeps an expired legacy reservation without a persisted operationKey
   UNCERTAIN" (same setup, expectation flipped to the contract-required
   fail-closed outcome).
2. `packages/agent-runtime/src/__tests__/runtime-journal.test.ts` — the exported
   sweep-helper case now seeds a `RESERVED` journal record for the released
   reservation so the release assertion still exercises a proven-absence
   release; the `EFFECT_STARTED` case is unchanged.
