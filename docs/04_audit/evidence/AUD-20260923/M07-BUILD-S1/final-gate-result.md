# M07-S1 BUILD result — 2026-09-23

- Human gate: approved exactly as recorded in [human-decision-20260923.md](human-decision-20260923.md).
- Frozen candidate: `a00127c13b165b81bd95d2671891e737f50bfb60c482816d0ef9c1b26fa4a797`; baseline delta 0; all six approved commands point to this candidate.
- Result: **FAIL — M07-S1 is not closed.** The repository coverage gate missed the statement and branch thresholds. The inventory completed without coverage gaps and reported 22 existing manifest findings; those manifests were outside the approved code scope and were not changed.
- Checks: focused suite 15/15 pass; full suite 2,127 passed / 146 skipped; typecheck pass; lint pass; coverage fail (statements 89.34% / 90%, branches 84.33% / 85%, functions 91.46% / 90%, lines 90.22% / 90%).
- Inventory: 25 owners, 813 source files, 206 edges; 54 test edges correctly share declared production runtime dependencies; 20 remaining dependency-category findings and 2 missing direct declarations. Coverage complete; unresolved findings 0.
- Review: lead-only, conditional at most; I1 unavailable due to agent thread limit. No independent approval is claimed.
- Scope: only the three approved M07 files were added/changed relative to the source baseline. No package manifest, runtime service, database, external integration, real data, or production action was used. Existing worktree edits were preserved.
- Guardrails: G21-5/G21-6 remain closed; production remains `NO_GO`. M07-S2, M05 handoff readiness, and any broader correction remain gated.

Detailed records: [candidate manifest](execution-candidate-manifest.json), [inventory report](workspace-dependency-report.json), [command records](command-records.json), [coverage summary](coverage-summary.json), [post-check integrity](post-check-integrity.json), [lead review](lead-review.md), [I1 availability](independent-review-status.json), and [superseded attempts](execution-command-attempts.json).
