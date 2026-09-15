# Commands and exit codes — AAA-07 / P1-2R legacy re-arm fix

All runs executed on the frozen workspace `/home/ricardo/cvg-agent-secretary-v2`,
branch `main`, HEAD `512bc11e80fbf7c7b8baf6263aacc811ff829309` (120 dirty
entries after this package), Node `v24.20.0`, npm `11.19.0`. Product sources are
the same files the round-2 reviewer judged (`911f0498…`) except for the two
files listed in `changed-hashes.txt` and the new test file.

Timestamps in this document are UTC `Z`, captured with
`date -u +%Y-%m-%dT%H:%M:%SZ`. The Vitest runner prints its start time in the
host's local zone (UTC-3, America/Sao_Paulo); the UTC equivalents are recorded
in the table for traceability. This package uses the `Z` form only.

## RED before the fix

| #   | Command                                                                                                                 | Exit  | Result                                                                                                                                                                                                     | Log                                   | UTC                  |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------- |
| 1   | `npx vitest run packages/agent-runtime/src/__tests__/runtime-legacy-rearm.test.ts --no-file-parallelism --maxWorkers=2` | **1** | 4 failed \| 3 passed (7): the reviewer scenario and the caller-key-absent variant returned `executed` where `denied` is required; lookup failure and persisted-`EXECUTING`-without-record also re-executed | `red-focused.log`, `red-focused.exit` | 2026-09-13T05:58:06Z |

The RED run used the unmodified recovery helpers. Failure excerpt
(`red-focused.log`):

```
FAIL ... denies a legacy active-lease retry with a changed caller key and never re-executes
AssertionError: expected 'executed' to be 'denied'
```

## GREEN after the fix

| #   | Command                                                                                                                                                                                                | Exit  | Result                                                                                                                                                                                              | Log                                             | UTC                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------- |
| 2   | `npx vitest run packages/agent-runtime packages/approval-engine --no-file-parallelism --maxWorkers=2`                                                                                                  | **0** | 20 files passed (20); 369 tests passed (369)                                                                                                                                                        | `green-focused.log`, `green-focused.exit`       | 2026-09-13T06:12:35Z |
| 3   | `npx vitest run packages/agent-runtime/src/__tests__/runtime-legacy-rearm.test.ts packages/agent-runtime/src/__tests__/runtime-sweep-operation-key.test.ts --no-file-parallelism --maxWorkers=2`       | **0** | 2 files passed (2); 15 tests passed (15) — 8 new P1-2R tests + 7 preserved P1-2 TTL/sweep tests                                                                                                     | `green-new-suites.log`, `green-new-suites.exit` | 2026-09-13T06:12:37Z |
| 4   | `npm test`                                                                                                                                                                                             | **0** | 230 files passed \| 4 skipped (234); **1585 passed \| 57 skipped (1642)**; zero failures; zero new skips. Baseline (round-2 review): 1577 passed \| 57 skipped; +8 = the new tests, no test removed | `full-test.log`, `full-test.exit`               | 2026-09-13T06:16:18Z |
| 5   | `npm run typecheck`                                                                                                                                                                                    | **0** | `tsc -p tsconfig.typecheck.json --noEmit` clean                                                                                                                                                     | `typecheck.log`, `typecheck.exit`               | 2026-09-13T06:12:48Z |
| 6   | `npm run lint`                                                                                                                                                                                         | **0** | `eslint .` clean                                                                                                                                                                                    | `lint.log`, `lint.exit`                         | 2026-09-13T06:12:53Z |
| 7   | `npx prettier --check packages/agent-runtime/src/runtime.ts packages/agent-runtime/src/__tests__/runtime-legacy-rearm.test.ts packages/agent-runtime/src/__tests__/runtime-execution-recovery.test.ts` | **0** | All matched files use Prettier code style                                                                                                                                                           | `format-check.log`, `format-check.exit`         | 2026-09-13T06:12:54Z |
| 8   | `git diff --check`                                                                                                                                                                                     | **0** | no whitespace errors                                                                                                                                                                                | `git-diff-check.log`, `git-diff-check.exit`     | 2026-09-13T06:12:54Z |

## Raw scenario trace (synthetic, controlled fakes, real child crash)

| #   | Command                                                                            | Exit  | Result                                                           | Log                      | UTC                  |
| --- | ---------------------------------------------------------------------------------- | ----- | ---------------------------------------------------------------- | ------------------------ | -------------------- |
| 9   | `npx tsx docs/04_audit/evidence/AAA/AAA-07/sweep-legacy-fix/probe-legacy-rearm.ts` | **0** | child crash status 99; 5/5 invariants `true`; one JSON raw trace | `probe-legacy-rearm.log` | 2026-09-13T06:12:12Z |

Probe trace summary (full JSON in `probe-legacy-rearm.log`):

- `legacy-active-changed-key`: `denied` / `operation_uncertain`, tool 0, journal A `EFFECT_STARTED` revision 2 (unchanged), journal B absent, approval `operationKey` still `null`.
- `legacy-active-absent-key`: `denied` / `operation_uncertain`, tool 0, same journal invariants.
- `persisted-active-changed-key`: `denied` / `operation_in_progress`, tool 0, journal A `EFFECT_STARTED`.
- `persisted-proven-absent`: `executed`, tool 1, journal A `CONFIRMED`, outbox idempotency key = persisted key A.
- `legacy-expired-changed-key`: `denied` / `operation_uncertain`, approval `UNCERTAIN`, tool 0.

## Reviewer's frozen probes re-run against the fixed tree

Both probe scripts were executed unmodified from the round-2 evidence package;
they import the current workspace sources and write only under `/tmp/opencode`.
The stale `/tmp/opencode/p1-review2-20260913T053543Z/p12-crash` scratch
directory was removed before the sweep probe run so the crash child starts from
an empty journal (the probe itself does not clean it).

| #   | Command                                                                                             | Exit  | Result                                                                                                                           | Log                                      | UTC                  |
| --- | --------------------------------------------------------------------------------------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | -------------------- |
| 10  | `npx tsx docs/04_audit/evidence/AAA/P1-independent-review-round2/probes/p12-legacy-active-repro.ts` | **0** | `legacy` and `legacy-absent-key` now `denied`/`operation_uncertain`, tool 0, journal A `EFFECT_STARTED`, `effectsLogGrew: false` | `reviewer-p12-legacy-active-probe.log`   | 2026-09-13T06:12:13Z |
| 11  | `npx tsx docs/04_audit/evidence/AAA/P1-independent-review-round2/probes/p12-sweep-operation-key.ts` | **0** | 9/9 scenarios `invariantHeld: true`; real crash child status 99; `effects.log` 7 -> 7 bytes; `failed: 0, falsified: false`       | `reviewer-p12-sweep-probe-after-fix.log` | 2026-09-13T06:12:14Z |

Probe #10 exited 1 in the round-2 review precisely because of the P1-2R
scenario; probe #11 reported `failed: 1` (the same scenario). Both now exit 0
with every invariant held.

## Diff of this fix against the reviewed candidate

| Artifact                             | Content                                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `runtime-p12r.diff`                  | `diff -u` of the frozen snapshot `runtime.ts` (`82b93844…`) vs the fixed file (`1fe73b1d…`)      |
| `tests-execution-recovery-p12r.diff` | `diff -u` of the frozen snapshot recovery test (`c8a640dc…`) vs the adjusted tests (`bb0f2db2…`) |

## Scope declaration

Synthetic data and controlled fakes only. No real appointment, no real
provider/channel call, no production action, no commit, push, deploy or
`npm install`. No file outside
`packages/agent-runtime/src/runtime.ts`,
`packages/agent-runtime/src/__tests__/runtime-execution-recovery.test.ts`,
`packages/agent-runtime/src/__tests__/runtime-legacy-rearm.test.ts` and this
evidence directory was written by this package.
