IMPLEMENTED — Builder D2 bounded remediation, awaiting Lead integration and fresh independent criticism.

Approved SPEC0212 SHA-256: `559e7da51d49f9e4ba7c1405a95d9ef2d61256e901d3b26c36f20276d551db4b`, verified unchanged against the user approval. Worktree: `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree`. Existing D work was retained; [the incremental D2 patch](d2-only.patch) is relative to [the recovered source snapshot](recovery.json), not to HEAD. Ownership follows the Lead's D2 delegation in `docs/08_runtime/agent_coordination.md`; no shared ledger was edited. The selected-model capacity failure is preserved as user-reported recovery metadata, retry 1 of 2; no raw D2 provider failure artifact was found, so none was reconstructed.

F1: `dispatchTool` records the existing fixed kernel error `unknown_effect: effect_settlement_failed` verbatim in the existing `ExecutionStep.errorCode` string. This is failure data in its intended field, not an unrelated marker. On reentry the runtime reads the trusted `ExecutionStepStore`, matches tenant/execution/pending step/type/FAILED/exact error, and returns TOOL_FAILURE without dispatch, body, finished, checkpoint rewrite or step rewrite. A failed step read returns INSUFFICIENT_EVIDENCE and preserves the checkpoint. This also works when the final checkpoint save failed but the lossless failed step was recorded.

Authoritative scope: `TOOL_RESULT.payload` is bounded and UNTRUSTED; summary/provenance and a generic TOOL_FAILURE/unknown_effect do not prove this settlement failure. Those fields do not decide the fence. The fixture that forges the complete uncertainty payload/summary/provenance on an otherwise settled failure still resumes, while truncated real settlement failure observations cannot authorize replay. The preexisting unrelated thrown-effect restart test remains green. The field is already `errorCode?: string` in `packages/contracts/src/execution-v2.ts:91`, SQL `error_code text` in `packages/persistence/migrations/0019_iterative_execution_steps.sql:33`, and maps losslessly through `operational-step-postgres.ts`; no schema, enum, migration, checkpoint version, public state or public export changed. A matching reserved error string is treated conservatively as the recorded failure signature; it is not cryptographic proof of the port implementation's internal cause.

This evidence covers executions writing the exact cause under D2. A pre-D2 stored step containing only generic `unknown_effect` cannot be retrospectively classified as a ledger settlement failure using lossless data; it keeps existing behavior. No historic checkpoint is rewritten or classified from presentation. The trusted store must faithfully persist and return the governed step; this is not a claim of exactly-once execution across every crash window or storage fault. No new recovery/reconciliation protocol is introduced.

F2: after realpath/confinement checks, shell supplies a frozen copy of the handle whose workspaceRoot is the already verified granted directory's canonical spelling. The context handle stays unchanged; every other grant and the existing timeout minimum remain unchanged. Six public cases cover symlink, parent-segment and trailing-separator grant roots across single_pass/iterative through the actual default `runContained`/bwrap backend with fixed `/bin/true` only. The injected backend case additionally covers a configured child root and checks the canonical parent grant, flags, immutability and deadline. Existing incompatible/root-escape tests remain green. No user command was run.

F3: a new tool dispatch clears only `run.lastToolObservation`; only a success in that dispatch repopulates it. Historical observations remain in the checkpoint. The public iterative factory runs two distinct real synthetic tool bodies; first success remains in history, second finished throw/reject retains its failure observation/pending decision, returns TOOL_FAILURE without a stale SUCCEEDED toolResult, and reentry repeats neither body nor finished.

Changed source inventory (five files; full before/after hashes and unchanged D companions in [source-inventory.json](source-inventory.json)):

| Path | SHA-256 after D2 |
| --- | --- |
| `packages/harness/src/iterative-runtime.ts` | `1b31a582225fa905e931dd7d7ba053da6bea2e4c81686f9502884b8dd2cd81d3` |
| `packages/harness/src/iterative-dispatch.ts` | `d1f41658ade86c328b6adaa5634bdd1b9e578050fbbc24b17c83db1d36c67141` |
| `packages/sandbox/src/shell-tool.ts` | `aa0b45d2b7a3ac0ca49162db0266b496bb3888e722b80931439441006d063f98` |
| `packages/harness/src/__tests__/pare100-public-controls.test.ts` | `d2a94cea80e09e77f50a9fbd2c6dece7adf8fa08d10896049df64457a560547e` |
| `packages/sandbox/src/__tests__/pare100-shell-handle.test.ts` | `15c4cda68b857f09d6d782986357955aaecd0563a5d77e5dcab454ee9a87cb1c` |

All new evidence, tooling, snapshots, raw logs and state are confined to `docs/04_audit/evidence/PARE100-EXEC-20261014/builder-d2/**`. [The evidence inventory](evidence-files.json) lists their hashes. No narrow helper was necessary. Factory, kernel pipeline and contracts.ts match their recovered D hashes; the existing contracts/schema/store files above have no diff against HEAD.

Current focused verification, Node v22.23.2:

| Check | Actual result | Exit |
| --- | --- | --- |
| regression-r2 | 7 files, 216 passed, zero skipped; includes all 24 newly added D2 tests across the two edited test files | 0 |
| shell-unit-r1 | 16 passed, two preexisting default-runner host-smoke bodies excluded by testNamePattern | 0 |
| types-r2 | Five changed source/test entry files plus transitive imports; no emit | 0 |
| lint-r2 | Five changed source/test files; real empty stdout/stderr log | 0 |
| format-r2 | Five changed source/test files | 0 |
| node-version-r1 | v22.23.2 | 0 |

The actual default-backend identity cases execute `/bin/true` and require functioning bwrap on this host. They establish accepted canonical grant identity, not general native isolation or Landlock enforcement. The old shell unit file also performs its existing fixed bwrap availability probe during collection. No install, network/provider request, real data, clinical/financial effect, SDK/collector/PUBLIC_API/pin/manifest/lock/dependency/reference/root edit, descendant, model override, commit or push occurred. Broad unit/coverage/conformance/replay/PG/E2E/build/certify/SBOM/licenses and fresh independent criticism are NOT_RUN here and remain Lead-owned. The two omitted old host-smoke bodies are NOT_RUN, not counted as pass.

Preserved failures:

- [Independent FAIL](independent-fail-preserved.md) is copied byte-identically from the full required report; SHA-256: `c923f711ed33ca9050ac7fb91c6a1f18d10776bec6802f89260db84caa16a19a`.
- reproduce-r1: exit 1, eight F1 body-replay failures and seven F2 identity failures. The two initial F3 failures in this run were fixture errors (`ref.tool.id` instead of the real `ref.toolId`) and are not claimed as source reproduction.
- reproduce-f3-r2: exit 1, both sync/async cases expose the earlier SUCCEEDED result through the public factory after the second settlement fails; fixture corrected before production edits.
- focused-r1 and diagnose-f2-r2: preserved exit 1. The attempted spawn mock did not intercept the default module; bwrap attempted an intentionally nonexistent synthetic program and returned execvp/ENOENT, with no command body executed. The mock was removed and replaced with fixed `/bin/true` real-backend cases. No containment failure was reclassified as success.
- regression-r1: exit 1, generic unknown_effect fence incorrectly blocked the preexisting unrelated thrown-effect resume. The final fence uses the exact persisted existing error string, and that unchanged regression passes in regression-r2.
- types-r1: exit 2, explicit optional provenance test field was assigned undefined under exactOptionalPropertyTypes. The synthetic forged field now uses an explicit string; types-r2 passes. All earlier logs remain intact.

Commands below are exact argv rendered with shell quoting. Each was run by [run-check.py](run-check.py), which sets `PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:<inherited PATH>` and TMPDIR to this evidence directory's tmp, records actual cwd/argv/exits/timing/log hashes, and refuses to overwrite prior run labels. Full metadata is in [commands.json](commands.json). Raw output files are unmodified; valid empty logs are left empty, with metadata in sibling JSON, without editing the shared empty-artifact ledger.

- `reproduce-r1` — exit 1, [raw log](reproduce-r1.raw.log).

```bash
node node_modules/vitest/vitest.mjs run packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts --testNamePattern 'F1|F2|F3' --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

- `reproduce-f3-r2` — exit 1, [raw log](reproduce-f3-r2.raw.log).

```bash
node node_modules/vitest/vitest.mjs run packages/harness/src/__tests__/pare100-public-controls.test.ts --testNamePattern F3 --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

- `focused-r1` — exit 1, [raw log](focused-r1.raw.log).

```bash
node node_modules/vitest/vitest.mjs run packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts packages/harness/src/__tests__/pdsh-010-sandbox-seam.test.ts packages/harness/src/__tests__/pdsh-031-slice2d-kernel.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

- `diagnose-f2-r2` — exit 1, [raw log](diagnose-f2-r2.raw.log).

```bash
node node_modules/vitest/vitest.mjs run packages/harness/src/__tests__/pare100-public-controls.test.ts --testNamePattern 'F2.*symlink' --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

- `focused-r2` — exit 0, [raw log](focused-r2.raw.log).

```bash
node node_modules/vitest/vitest.mjs run packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts packages/harness/src/__tests__/pdsh-010-sandbox-seam.test.ts packages/harness/src/__tests__/pdsh-031-slice2d-kernel.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

- `format-write-r1` — exit 0, [raw log](format-write-r1.raw.log).

```bash
node node_modules/prettier/bin/prettier.cjs --write packages/harness/src/iterative-runtime.ts packages/harness/src/iterative-dispatch.ts packages/sandbox/src/shell-tool.ts packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts
```

- `format-r1` — exit 0, [raw log](format-r1.raw.log).

```bash
node node_modules/prettier/bin/prettier.cjs --check packages/harness/src/iterative-runtime.ts packages/harness/src/iterative-dispatch.ts packages/sandbox/src/shell-tool.ts packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts
```

- `lint-r1` — exit 0, [raw log](lint-r1.raw.log).

```bash
node node_modules/eslint/bin/eslint.js packages/harness/src/iterative-runtime.ts packages/harness/src/iterative-dispatch.ts packages/sandbox/src/shell-tool.ts packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts
```

- `types-r1` — exit 2, [raw log](types-r1.raw.log).

```bash
node node_modules/typescript/bin/tsc -p docs/04_audit/evidence/PARE100-EXEC-20261014/builder-d2/tsconfig.focused.json --noEmit
```

- `regression-r1` — exit 1, [raw log](regression-r1.raw.log).

```bash
node node_modules/vitest/vitest.mjs run packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts packages/harness/src/__tests__/iterative-runtime.test.ts packages/harness/src/__tests__/pdsh-031-slice2d-dispatch.test.ts packages/harness/src/__tests__/pdsh-031-slice2d-iterative.test.ts packages/harness/src/__tests__/pdsh-010-sandbox-seam.test.ts packages/harness/src/__tests__/pdsh-031-slice2d-kernel.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

- `format-write-r2` — exit 0, [raw log](format-write-r2.raw.log).

```bash
node node_modules/prettier/bin/prettier.cjs --write packages/harness/src/iterative-runtime.ts packages/harness/src/iterative-dispatch.ts packages/harness/src/__tests__/pare100-public-controls.test.ts
```

- `format-write-r3` — exit 0, [raw log](format-write-r3.raw.log).

```bash
node node_modules/prettier/bin/prettier.cjs --write packages/harness/src/__tests__/pare100-public-controls.test.ts
```

- `types-r2` — exit 0, [raw log](types-r2.raw.log).

```bash
node node_modules/typescript/bin/tsc -p docs/04_audit/evidence/PARE100-EXEC-20261014/builder-d2/tsconfig.focused.json --noEmit
```

- `format-r2` — exit 0, [raw log](format-r2.raw.log).

```bash
node node_modules/prettier/bin/prettier.cjs --check packages/harness/src/iterative-runtime.ts packages/harness/src/iterative-dispatch.ts packages/sandbox/src/shell-tool.ts packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts
```

- `lint-r2` — exit 0, [raw log](lint-r2.raw.log).

```bash
node node_modules/eslint/bin/eslint.js packages/harness/src/iterative-runtime.ts packages/harness/src/iterative-dispatch.ts packages/sandbox/src/shell-tool.ts packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts
```

- `regression-r2` — exit 0, [raw log](regression-r2.raw.log).

```bash
node node_modules/vitest/vitest.mjs run packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts packages/harness/src/__tests__/iterative-runtime.test.ts packages/harness/src/__tests__/pdsh-031-slice2d-dispatch.test.ts packages/harness/src/__tests__/pdsh-031-slice2d-iterative.test.ts packages/harness/src/__tests__/pdsh-010-sandbox-seam.test.ts packages/harness/src/__tests__/pdsh-031-slice2d-kernel.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

- `node-version-r1` — exit 0, [raw log](node-version-r1.raw.log).

```bash
node --version
```

- `shell-unit-r1` — exit 0, [raw log](shell-unit-r1.raw.log).

```bash
node node_modules/vitest/vitest.mjs run packages/sandbox/src/__tests__/pdsh-013-shell-tool.test.ts --testNamePattern 'PDSH-013 shell (tool boot|input validation|execution mapping|descriptor)' --no-file-parallelism --maxWorkers=1 --reporter=verbose
```

Lead handoff: integrate only the five D2 source/test paths and this evidence after comparing hashes. Update shared runtime/log/backlog under Lead ownership; retain the original independent FAIL and all preserved failures. Freeze the integrated candidate, assign fresh independent F1–F3 review, then run Lead-owned broad gates/certification. No parity, completion of the program, audit acceptance, readiness or release verdict is issued by this builder.

Evidence formatting note: evidence-format-r1 exited 0 with empty output because the repository ignore rules omit evidence files; it is not counted as a formatting verification. The actual five source/test files were checked by format-r2, whose raw output confirms all matched files.
