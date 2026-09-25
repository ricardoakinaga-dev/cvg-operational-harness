# M07-S1-R1-C1G — stopped at TypeScript preflight — 24/09/2026

## Decision and scope

The user approved the exact M07-S1 gate in response to the question limiting execution to the three paths and local commands in the C1G packet. The decision is recorded in [decision-record.md](decision-record.md), bound to approval request SHA-256 `5700d97d2931dc08c622cdee470c5d869a9980f1a4c1bdb40b64afb7d3e6645f`. The packet and its companion input hashes were verified before that record. No approval is inferred for other tasks, candidate acceptance, later stages, external activity, or production.

## Result

- C1G: `STOPPED_PRECHECK_FAILURE`; M07-S1 remains `FAIL / OPEN`.
- `node-version-preflight`: expected exit 0; captured `v22.23.2` at `2026-09-24T07:28:41.550Z`–`07:28:41.554Z`.
- `typescript-version-preflight`: unexpected exit 1 at `2026-09-24T07:28:48.895Z`–`07:28:48.916Z`; stderr says `Cannot find module 'typescript'` and gives require stack `/home/ricardo/Área de trabalho/[eval]`. The command and raw streams are preserved in [command-records.json](command-records.json), [typescript stderr](typescript-version-preflight.stderr.log), and [typescript stdout](typescript-version-preflight.stdout.log).
- The frozen recorder defines `REPO = HERE.parents[5]` at line 19 of [capture_command.py](capture_command.py). From this packet directory `HERE.parents[5]` is the parent workspace directory; the repository root is `HERE.parents[4]`. The helper therefore launched the second command one directory above the repository. Read-only inspection found the repository-local TypeScript package at version `6.0.3`, but the failed command resolved modules from the wrong directory.
- The helper recorded its second step as `UNEXPECTED_EXIT`; no later command-plan step ran. Its command ledger remains `RUNNING` because the final verifier is intentionally unavailable before its dependencies. No manual edit was made to the command ledger.

## Effects and preservation

- The dependent sequence stopped immediately. `c1g-preconditions` and source-baseline preflight did not run; the C1F `.gauntlet/` was not archived, C1G Gauntlet state was not initialized, rollback snapshots were not created, and the patch was not applied.
- Candidate freeze, inventory, focused/full tests, typecheck, lint, coverage, post-check, sanitization, historical-evidence check, I1, and Final Critic were not run. No candidate or quality-bar verdict was produced.
- No C1G edit was made to the three approved code paths or to the immutable conversation fixture. The pre-existing worktree changes and C1E/C1F evidence remain preserved.
- The registered decision and backlog were updated before the first command as the gate required. Captured output from both attempted commands remains untouched.

## Required next step

Do not rerun either command or continue this C1G command plan. The recorder's frozen repository-root calculation is wrong, so a retry requires a separate, hash-bound gate with a corrected recorder and a fresh evidence directory. Until that gate is reviewed and approved, no C1G/C1H source edit or command is authorized. M07-S2/S3/S4 and M05 remain blocked; G21-5/G21-6 remain closed; production remains `NO_GO`.
