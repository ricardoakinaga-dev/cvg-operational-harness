# M07-S1 lead review — 2026-09-23

- Quality bar: `M07-S1-BUILD-v1` (SHA-256 `65563f3478e305afecc3d98dca16c139c04b680171d877ff7cf82240613ed74d`).
- Candidate: `a00127c13b165b81bd95d2671891e737f50bfb60c482816d0ef9c1b26fa4a797`; post-check integrity is unchanged.
- Review: lead-only; no independent approval is claimed. I1 is `UNAVAILABLE` after two reviewer requests were rejected because the agent service reached its thread limit.
- Lead verdict: `CONDITIONAL_PASS_AT_MOST` for scope and safety review. Overall BUILD gate: **FAIL** under the frozen decision rule because the required coverage gate failed its statement and branch thresholds.

## Criteria

| Criterion | Result | Evidence summary |
| --- | --- | --- |
| M07-S1-B1 | PASS | Candidate baseline comparison has zero drift and exactly the three approved M07 additions; no manifests or unrelated code were changed by this task. |
| M07-S1-B2 | PASS | Approved policy defaults are encoded; focused synthetic suite covers policy, owner/source roles, exceptions, and dependency categories. |
| M07-S1-B3 | PASS_WITH_FINDINGS | Complete inventory: 25 owners, 813/813 source files, 206 edges, 4 build scripts, 73 project references, zero coverage gaps and zero unresolved findings. Report keeps 22 pre-existing manifest findings visible. |
| M07-S1-B4 | PASS | Determinism, stale candidate, output path traversal/symlink and safe report behavior are covered by fixtures; inventory report matches frozen candidate. |
| M07-S1-B5 | PASS | Static lead inspection found no child_process, shell, network, service/database startup, workspace package execution, install, manifest mutation, or real operational data access in the checker. Only local filesystem reads and bounded evidence output are used. |
| M07-S1-B6 | FAIL | All six approved commands ran on this candidate. Focused tests (15), full tests (2,127 passed/146 skipped), typecheck and lint passed. Inventory returned VIOLATION for 22 existing manifest findings. Coverage returned exit 1: statements 89.34% < 90%, branches 84.33% < 85%; functions 91.46% and lines 90.22% passed. The gate acceptance requires all required checks to pass. |
| M07-S1-B7 | PASS | Frozen fingerprint a00127c13b165b81bd95d2671891e737f50bfb60c482816d0ef9c1b26fa4a797; baseline fingerprint 439e13cba5d32821fd57b5ba2c71160189667a8168bdb97c9eeb1df52211f404; zero input diff and zero baseline delta after checks. |
| M07-S1-B8 | UNAVAILABLE | Lead review is recorded. Fresh-context I1 was unavailable after two requests were rejected with agent thread limit reached. No independent approval is claimed; the lead-only review remains conditional at most. |
| M07-S1-B9 | PASS | Rollback boundary and task changes stayed limited to the approved M07 files and evidence. Existing dirty worktree edits and tests were preserved. Production remains NO_GO; G21-5/G21-6 remain closed. |

## Command outcomes

- Inventory: exit 1, complete (25 owners, 813 source files, 206 edges, no gaps/unresolved); 22 baseline manifest findings remain visible: 20 category mismatches and 2 missing direct declarations.
- Focused regression: 2 files, 15 tests passed.
- Full suite: 322 files (302 passed, 20 skipped); 2,273 tests (2,127 passed, 146 skipped).
- Typecheck and lint: passed.
- Coverage: failed at statements 89.34% (90% required) and branches 84.33% (85% required); functions 91.46% and lines 90.22% passed.

The 22 package-manifest findings are already present in the frozen source baseline and cannot be corrected under this gate. No coverage repair or M07-S2/M05 handoff is authorized by this result. Production remains `NO_GO`; G21-5 and G21-6 remain closed.
