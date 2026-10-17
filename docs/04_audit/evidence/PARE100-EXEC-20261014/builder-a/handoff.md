# Builder A — P100-002 / AUD0611-G03

Status: IMPLEMENTED. Bounded implementation input; no card/program completion or audit acceptance claimed.

Only four implementation files changed in the authorized worktree:
- `scripts/run-core-coverage.mjs`
- `scripts/coverage-thresholds.mjs`
- `tests/coverage-thresholds.test.js`
- `packages/agent-runtime/src/__tests__/pdsh-031-slice3e1.test.ts`

Validation: Node v22.23.2; final focused run 3 files / 91 tests PASS (81 new gate/runner tests, 7 original runtime tests, 3 existing coverage-gate tests), exit 0. Focused ESLint and Prettier exit 0. Installed Vitest 4.1.11 / coverage-v8 4.1.11 / Istanbul coverage 3.2.2 and reports 3.2.0 inspected locally. Installed Vitest parseCLI accepted the protected argument vector without executing tests or coverage. Exact helper-only removal verified; Vitest config and lockfile hashes unchanged.

Initial focused run: exit 1, 77 passed / 14 failed. Fixture copy path was transformed in jsdom and malformed-option parametrization supplied the wrong input shape. Both corrected; the failed raw log remains preserved. No thresholds, tests, assertions or acceptance criteria reduced.

Observed behavior: exact aggregate boundaries accepted; each below-floor metric outside the core rejected. Missing/malformed/count-inconsistent/NaN/Infinity/impossible percentages/empty summaries rejected. Current-report runner rejects missing, malformed, stale, future and symlink reports despite good historical artifacts; every invocation has a distinct coverage/core-*/reports directory and preserves unrelated output. Child stdout/stderr retained; exit 23 and SIGTERM preserved even when a good report exists. Protected coverage/config/root/output/watch/error-suppression options cannot be overridden; normal filters, -t, workers, pool, timeouts, standard reporters and other documented safe options are forwarded as argument tokens with shell disabled.

The pure checker validates installed json-summary percentages against safe integer counts, sums file counts into total and compares actual counts to immutable S90/B85/F90/L90 thresholds. The real runner forces CVG_COVERAGE_PER_FILE=1 and the existing Vitest config, preserving its four core 100% globs. It uses the same Node executable, reads only its fresh successful child report and never falls back to history or deletes another run.

Integration requirements: Lead wires test:coverage:per-file to `node scripts/run-core-coverage.mjs`, uses that runner in the appropriate CI gate, and executes actual full coverage plus the remaining typecheck/unit/PG/E2E/candidate audit gates. CLI example for Lead-owned real execution: `node scripts/run-core-coverage.mjs --maxWorkers=2 --reporter=dot`. CVG_TEST_SCOPE remains the existing config contract and can be set by Lead. Reports are retained at the path printed by the runner; Lead must archive the report from that exact run. Compare baseline hashes before any root integration.

Limits: no real coverage execution in this lane; synthetic child fixtures demonstrate orchestration only, never actual core coverage or aggregate coverage results. Strict report timestamps assume the current filesystem provides normal millisecond mtime behavior; a coarse/stale timestamp fails closed. No package/lock/Vitest config/shared ledger/coordination/.gauntlet/other lane edits, descendants, network provider, real data, commit, push or deploy. Original root was not edited. Broad gates and independent acceptance remain with Lead.

Evidence: all files in this directory are lane-owned. commands.json records exact verification commands/exits. SHA256SUMS covers implementation files and every evidence artifact except itself. implementation-manifest.json lists exact code paths/hashes. Empty successful lint raw logs are losslessly gzip-compressed (decompress to the original zero bytes); exit files retain the observed status.
