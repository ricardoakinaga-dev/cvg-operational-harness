Verdict: **FAIL — scoped SPEC0212 controls review**. The shipped focused tests are green, but static inspection identifies three correctness/compatibility defects in the requested surface. These findings do not rely on builder reports or the old PUBLIC_API note.

Packet: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-control-packet`.
Approved SPEC0212 SHA-256: `559e7da51d49f9e4ba7c1405a95d9ef2d61256e901d3b26c36f20276d551db4b`, matching the explicit user approval record in the packet. No descendants were created.

Sentinel before and after: **PASS**, 1,070/1,070 files; zero missing, extra or changed files. Sentinel SHA-256 remained `05c3aa721f91d59736c61d78dbed5a8e46d0b7e41f71a7a0f226881d4cf35125`. Scratch source also remains byte-identical to the packet, excluding the copied node_modules tree. See [before](sentinel-before.json), [after](sentinel-after.json), [scratch check](scratch-source-check.json), and [setup](setup.json).

**F1 — P1: the iterative no-replay fence disappears when the observation payload is truncated.**

Review target: [iterative-runtime.ts:657](../critic-control-packet/packages/harness/src/iterative-runtime.ts#L657). Supporting source: the same file at 109, 131–150, 222–230, 385–386, 726–733, 784–787, 854–856, 1373–1382 and 1546–1565; [iterative-dispatch.ts:423](../critic-control-packet/packages/harness/src/iterative-dispatch.ts#L423), 595–635; [execution-v2.ts:60](../critic-control-packet/packages/contracts/src/execution-v2.ts#L60).

The new fence requires `checkpoint.state.stopReason === 'TOOL_FAILURE'` and an object payload whose `.error` is exactly `unknown_effect: effect_settlement_failed`. The existing constructor accepts `maxObservationPayloadChars` and applies it to all observations. With a valid small setting such as 64, the fixed uncertainty payload (72 serialized characters) becomes a truncated **string**, so the fence cannot see `.error`. TOOL_FAILURE is excluded from TERMINAL_STOPS. The failed dispatch preserves pendingDecision/pendingStepNumber; the next execute reuses that decision. The supplied step transition table explicitly permits FAILED → RUNNING.

Concrete trigger: instantiate the reviewed IterativeGovernedRuntime with maxObservationPayloadChars=64; use an allowed non-idempotent compatibility tool without approval/effectJournal, sufficient remaining budget, and an effects.finished port that throws/rejects after the body. Save the resulting checkpoint successfully, then execute the same execution again. The source path permits the body and ledger lifecycle to run again instead of preserving the unresolved settlement. The factory currently uses the 4,000-character default, so this finding concerns the existing iterative constructor option, not the factory default.

Required behavior: preserve the unresolved checkpoint and prevent dispatch regardless of observation presentation bounds. Keep the fence based on lossless governed evidence within the approved existing contracts; do not make the safety decision depend on a truncated payload.

Evidence status: **static source proof; targeted behavioral reproduction NOT_RUN** because only shipped tests were authorized. The supplied replay test uses the default bound and does not cover this case. SPEC0212 §6 and the requested iterative checkpoint preservation remain unsatisfied for this existing accepted constructor configuration.

**F2 — P2: valid grants using an absolute symlink root fail with the default shell backend.**

Review target: [shell-tool.ts:192](../critic-control-packet/packages/sandbox/src/shell-tool.ts#L192), 200–208, 254–261, 296–300 and 158–165. Supporting source: [pipeline.ts:419](../critic-control-packet/packages/harness/src/kernel/pipeline.ts#L419), 441–451; [run.ts:60](../critic-control-packet/packages/sandbox/src/run.ts#L60), 61–66.

The kernel accepts an absolute grant root without requiring canonical spelling. The shell resolves the gate root and configured root with realpath, correctly accepts them as the same directory, and gives the runner a canonical cwd. However, it forwards the handle with its original root spelling. runContained compares that canonical cwd against the original workspaceRoot using string prefix equality, then returns spawn_failed on a mismatch.

Concrete trigger: an approved PROCESS gate grants workspaceRoot=/tmp/synthetic-link where that link resolves to /tmp/synthetic-root; createShellTool is configured for the same directory. The shell accepts the realpath relationship and sends cwd=/tmp/synthetic-root plus handle.workspaceRoot=/tmp/synthetic-link. The default backend returns “cwd fora do workspace” before spawning. An injected runner succeeds for the same accepted grant. Noncanonical absolute roots containing “..” or trailing separators can cause the same mismatch.

This affects shell calls through both public profiles. It is a compatibility/fail-closed rejection defect, not a demonstrated escape. Reconcile the canonical directory identity at the shell/backend boundary while preserving the granted authority.

Evidence status: **static source proof; targeted default-backend reproduction NOT_RUN**. New handle tests and the factory shell test use injected runners. The two shipped default-runner host-smoke bodies were excluded from execution. SPEC0212 §5/CTL-W03 require coherent grant consumption by real and injected backends.

**F3 — P2: after an earlier successful tool, a later settlement failure exposes stale SUCCEEDED toolResult through the public iterative factory.**

Review target: [iterative-runtime.ts:1589](../critic-control-packet/packages/harness/src/iterative-runtime.ts#L1589), 1591–1603. Supporting source: [iterative-dispatch.ts:595](../critic-control-packet/packages/harness/src/iterative-dispatch.ts#L595), 606–635, 689–690; [completion.ts:188](../critic-control-packet/packages/harness/src/completion.ts#L188), 188–196; [pipeline.ts:558](../critic-control-packet/packages/harness/src/kernel/pipeline.ts#L558), 560–568.

The success branch sets run.lastToolObservation. The later threw/failed branch records the uncertainty observation but never replaces or clears that field. finalize constructs its public toolResult from the previous successful observation and emits status=SUCCEEDED with that previous output.

Concrete trigger: through createOperationalHarness(profile=iterative), execute two different allowed tool decisions in one execution. Let the first lifecycle settle successfully, and let the second body run before its effects.finished throws/rejects. The default completion evaluator continues after CALL_TOOL, so this needs no special completion policy. The returned stopReason is correctly TOOL_FAILURE and the response contains unknown_effect, but toolResult still reports the first tool's SUCCEEDED status/output instead of the unresolved current effect. The failure observation/checkpoint must remain; the public result should not attach a stale successful result to the failed current tool dispatch.

Evidence status: **static source proof; targeted multi-tool reproduction NOT_RUN**. Supplied public-control fixtures execute only one tool before the response/failure and therefore cannot expose the stale field. This is a remaining SPEC0212 §6/CTL-W02 public behavior defect. No claim is made that the overall stopReason becomes COMPLETED.

The inspected implementation otherwise wires the same pause/effects objects into both runtimes and sandbox into the iterative kernel. For tested calls, started throws/rejections produce zero body and no finished, successful started precedes body, finished precedes publication/post-execute, settlement exceptions become the fixed threw uncertainty outcome, and the shared matrix passes original succeeded/failed/threw/deadline/cancelled outcomes to finished while preserving duration. Kernel handle copies are frozen, validate modes/boolean flags/deadline/root shape, and ignore forged model JSON; NONE tools receive no invented handle. Shell rejects missing/incompatible context grants before runner and clamps timeout to the minimum tested limits.

Execution used Node **v22.23.2**, the exact required PATH, packet source copied into the authorized scratch directory, and a copied existing node_modules tree. Workspace dependency symlinks resolve inside scratch. No dependency installation, provider/network request, DB, clinical effect, repository source/history change or new test was performed.

| Shipped file | Result |
| --- | --- |
| pare100-public-controls.test.ts | 70 PASS |
| pare100-shell-handle.test.ts | 11 PASS |
| pdsh-010-sandbox-seam.test.ts | 7 PASS |
| pdsh-031-slice2d-kernel.test.ts | 14 PASS |
| pdsh-013-shell-tool.test.ts, selected synthetic unit groups | 16 PASS; 2 host-smoke bodies NOT_RUN |

Total: **118 PASS, 2 NOT_RUN/skipped**. Both Vitest invocations exited 0. Raw logs are unmodified: [controls/kernel](focused-controls-kernel.raw.log), [shell unit](focused-shell-unit.raw.log), [Node version](node-version.raw.log). [commands.json](commands.json) records exact argv, cwd, exits and timings.

Exact test commands, cwd `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-control-scratch`:

```bash
PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH node --version
# exit 0; v22.23.2
PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH node node_modules/vitest/vitest.mjs run packages/harness/src/__tests__/pare100-public-controls.test.ts packages/sandbox/src/__tests__/pare100-shell-handle.test.ts packages/harness/src/__tests__/pdsh-010-sandbox-seam.test.ts packages/harness/src/__tests__/pdsh-031-slice2d-kernel.test.ts --no-file-parallelism --maxWorkers=1 --reporter=verbose
# exit 0; 102 passed
PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:$PATH node node_modules/vitest/vitest.mjs run packages/sandbox/src/__tests__/pdsh-013-shell-tool.test.ts --testNamePattern 'PDSH-013 shell (tool boot|input validation|execution mapping|descriptor)' --no-file-parallelism --maxWorkers=1 --reporter=verbose
# exit 0; 16 passed, 2 skipped
```

The existing shell test performs its fixed bubblewrap availability probe during collection (capabilities.ts:51–54: `bwrap --ro-bind / / --unshare-net /bin/true`); excluding the host-smoke bodies does not suppress that collection probe. It does not demonstrate native isolation of the new grant cases.

**NOT_RUN:** new/ad hoc reproductions for F1–F3; two shell default-runner host-smoke bodies; public-controls.probe.ts and snapshot/replay suites; typecheck, lint, build/source-compile, coverage, full unit/conformance suites, PostgreSQL, DB tests, E2E, certify, SBOM/licenses, provider/network and clinical/financial/real-data paths. Broader SPEC0212 CTL-W04 qualification is **NOT_ASSESSED**, not PASS.

PUBLIC_API documentation follow-up for Lead: its line 247 still states that pause/log/effects are ignored by the factory. The packet code contradicts that historical note, and the independent public tests substantiate actual wiring. A current additive/corrective note is still needed for forwarding of pause/effects/log, iterative sandbox, optional ToolExecutionContext.sandboxHandle, mandatory ShellRunRequest.handle, direct-shell rejection, and settlement-failure behavior. The old note was not used as implementation proof or as the basis for F1–F3.

[Source evidence](source-evidence.raw.log) contains exact numbered excerpts and hashes; [source-hashes.json](source-hashes.json) binds them to the frozen packet. [source-evidence.command.txt](source-evidence.command.txt) records the exact successful evidence/sentinel extraction command, exit 0, with [raw output](source-evidence-checks.raw.log). An earlier extraction attempt exited 1 because its requested SPEC line range exceeded EOF; it was corrected without source/test changes or additional test runs, and its raw traceback is retained in [extraction-attempt.raw.log](extraction-attempt.raw.log).

The packet omits the five operational/coordination documents referenced by AGENTS.md. Per this narrower immutable reviewer instruction, worktree versions, worktree code/history and builder reports were not read, and repository claims/runtime/log/backlog were not modified. All review artifacts are confined to critic-control-result; scratch contains only the authorized copied source/dependencies and test caches.

This **FAIL** is only the SPEC0212 controls source review. It approves neither SDK edits/SPEC0211, the full 36-card bar, parity, native/Landlock containment, readiness, release nor production.

