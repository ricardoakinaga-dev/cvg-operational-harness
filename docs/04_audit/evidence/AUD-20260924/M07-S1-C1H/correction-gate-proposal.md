# Proposed gate M07-S1-R1-C1H — traceable candidate replay

**State:** `PROPOSED / WAITING_HUMAN_APPROVAL`  
**Current M07-S1 state:** `FAIL / OPEN`  
**Production:** `NO_GO`

This is a new candidate run. It does not revise or overwrite the C1F result. C1F remains `FAIL / OPEN` because its setup-command provenance is partial and I1 was unavailable. C1H can provide a fresh candidate and complete execution record; it cannot invent historical timestamps for C1F.

C1G was approved but stopped at its second preflight step. Its packet-local recorder resolved `HERE.parents[5]`, which is the parent workspace directory, so Node could not resolve the repository-local TypeScript package. No C1G source patch, archive move, candidate, or later check ran. See the preserved [C1G result](../M07-S1-C1G/final-gate-result.md). C1H uses a fresh evidence directory and corrects the recorder root to `HERE.parents[4]`; it does not reuse or overwrite C1G command records.

## Purpose

Create a candidate-bound replay whose setup, snapshots, candidate freeze, inventory, test matrix, post-check, and log review each have individual timestamps, durations, exit codes, stdout/stderr hashes, and preserved raw streams. The code correction adds only the C1H evidence/npm path while preserving the C1F path and all current traversal and symlink controls.

The repository currently has a finished C1F Gauntlet run at `.gauntlet`. Before initializing C1H, the gate requires a read-only state check, an absent archive target, and a free writer lock. If those preconditions pass, the exact finished C1F directory is moved intact to `.gauntlet-archive/m07-s1-c1f-20260924-finished-fail/`; the C1H state manager then owns the fresh `.gauntlet` root.

## Proposed code scope

Only these three code/config/test paths may change, exactly as shown in [the patch preview](correction-preview.patch):

- `config/workspace-dependency-policy.json`
- `scripts/workspace-dependency-audit.mjs`
- `tests/workspace-dependency-audit.test.js`

The existing fixture `packages/conversation/src/__tests__/postgres-store.unit.test.ts` is a C1F candidate addition, but is outside this correction. C1H must snapshot it and prove its hash unchanged. The four expected candidate additions relative to the approved R1 baseline therefore remain the policy, scanner, scanner test, and conversation fixture; only the first three are editable in C1H.

Evidence outputs are confined to `docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/`. Gauntlet state outputs are confined to `.gauntlet/` and the single C1F archive target named above. The packet contains a source baseline for five exact input hashes and a hash list for 110 files under C1E/C1F; the run rechecks both before code and at post-check. No other file, historical candidate, evidence directory, manifest, lockfile, CI workflow, `.nvmrc`, Vitest configuration, product/runtime source, service, database, network endpoint, real data, sensitive action, or production environment is in scope.

## Packet-local execution tooling

The C1H packet also includes its own execution tooling. The only recorder change from the failed C1G helper is the repository-root index: `HERE.parents[5]` becomes `HERE.parents[4]`. The frozen C1H command plan substitutes the fresh C1H evidence paths and task/run IDs; each listed command is still run individually by this helper with the same offline npm setting and PostgreSQL variables removed. C1G's helper, plan, command records, and raw streams remain unchanged. The command records and source baseline must be rechecked by the new gate before source changes.

The evidence folder already contains this gate packet, exact patch preview, quality bar, command plan, command-capture helper, and an empty `command-records.json` scaffold. None of the helpers has been run. The frozen command plan requires a clean execution-output preflight before it writes the npm record, snapshots, candidate or logs.

## Preconditions and stop rules

1. A24-03-C1H must be present in `docs/03_build/0344_reaudit_m07_backlog.md`, and the approved decision must be recorded there and in `decision-record.md` before source changes.
2. Use a new shell with `/home/ricardo/.nvm/versions/node/v22.23.2/bin` first in `PATH`. Require Node `v22.23.2`, local TypeScript `6.0.3` resolved from the repository root by the corrected recorder, and npm `10.9.8`; do not install packages or change the default Node selection.
3. The exact current `.gauntlet/state.json` must be run `m07-s1-c1f-20260924-1`, status `FINISHED`; the C1F archive target must be absent, and `flock -n .gauntlet/.writer.lock true` must succeed. If any check fails, record it and stop before the archive move or source edits.
4. Candidate/report/rollback/coverage outputs must not exist in the C1H folder. The preflight also checks that the captured npm stdout is byte-identical to the candidate-bound `npm-version.txt`, A24-03-C1H is registered, the decision is recorded as `APPROVED`, and all five source hashes match `source-baseline.json`.
5. Snapshot each of the three editable paths and the immutable conversation fixture separately. Capture each `cp`, the aggregate `sha256sum`, and the preview check/apply as separate commands. Compare the fixture's pre/post hashes and compare all three edited paths to the exact patch.
6. Any source hash drift before applying the preview, failed prerequisite, unexpected output, or writer-lock conflict stops the dependent sequence. Preserve all evidence; do not overwrite or delete a failed attempt.

## Frozen local command matrix

The exact argv, working directory, cleared PostgreSQL variables, offline npm setting, expected exit codes, step dependencies, and output paths are in [command-plan.json](command-plan.json). Run one named step at a time through [capture_command.py](capture_command.py). The helper refuses unknown or duplicate step IDs, does not use a shell, refuses log overwrites, and atomically records each result.

The authorized checks are:

1. Node, TypeScript, and npm preflight; C1F Gauntlet state/archive/lock preflight; exact archive and fresh C1H Gauntlet initialization.
2. Separate rollback copies and hash capture; preview `git apply --check`; apply only the three-file patch; compare all four candidate additions to their snapshots.
3. Freeze the 977-input candidate to `execution-candidate-manifest.json`, verify it, generate `workspace-dependency-report.json`, and compare candidate/report fingerprints and inventory semantics.
4. Focused tests, full `npm test`, `npm run typecheck`, `npm run lint`, coverage, candidate post-check, and log sanitization exactly as listed in the plan. Every npm command is offline; all listed PostgreSQL environment variables are removed. Coverage remains statements ≥90%, branches ≥85%, functions ≥90%, and lines ≥90%.
5. Re-hash all 110 C1E/C1F files listed in `historical-evidence.sha256`; record the final command-log integrity check, coverage and skip counts, candidate hashes, Gauntlet transitions, and evidence index. Do not rerun a failed command unless a separate gate authorizes it.

The focused command is:

```sh
npm test -- tests/workspace-dependency-audit.test.js tests/architecture/dependency-direction.test.ts packages/conversation/src/__tests__/postgres-store.unit.test.ts
```

The remaining exact npm argv is `npm test`, `npm run typecheck`, `npm run lint`, and `npm run test:coverage -- --coverage.reportsDirectory docs/04_audit/evidence/AUD-20260924/M07-S1-C1H/coverage`; the command plan records each as an argv array. The inventory's exit 1 is an expected domain result only if the report is complete, fingerprint-matched, has 11 findings (nine category mismatches and two missing direct declarations), and has zero gaps/unresolved. Any other nonzero exit or semantic difference fails the criterion.

## Reviews and verdict

An independent read-only critique of this gate packet was attempted before asking the user and the service refused the spawn with `agent thread limit reached`; no packet critic report exists. This is not a review of the eventual C1H candidate. After the candidate and evidence are frozen, request two distinct read-only fresh-context reviews of that same candidate: I1 and a separate Final Critic. Neither a lead review nor the other reviewer substitutes for either role. If either reviewer cannot be created or does not return a report, record `UNAVAILABLE` and keep M07-S1 `FAIL / OPEN`. C1F had the same I1 service refusal; C1H does not assume that capacity has recovered.

The [quality bar](quality-bar.json) freezes ten critical criteria, including complete command provenance, the local matrix, post-check integrity, I1, the separate Final Critic, and safety boundaries. Any failed or unresolved critical criterion yields Gauntlet `FAIL`, preserves the first failure, and keeps M07-S1 open. No M07-S2/S3/S4 or M05 handoff follows from a C1H local pass; those remain blocked until M07-S1 is accepted independently. G21-5/G21-6 remain closed and production stays `NO_GO`.

## Exact human decision required

Approval, if given, must identify the C1H packet hashes in `approval-request.md`. It authorizes only the three editable paths, the one-line repository-root correction in the C1H packet-local recorder, the C1H command plan/evidence outputs, exact C1F Gauntlet archive move, fresh C1H Gauntlet state, and exact local command matrix above. It does not approve M07-S1 acceptance, S2/S3/S4, M05 execution, production, external services, real data, database access, or sensitive actions. The previously recorded C1F and C1G approvals do not transfer to C1H.
