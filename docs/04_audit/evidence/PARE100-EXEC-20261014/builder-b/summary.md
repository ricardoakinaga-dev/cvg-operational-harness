# Builder B — bounded implementation handoff

Status: **IMPLEMENTED**, T2 test-support, infrastructure input only; **CONTROL_CONFORMANCE_FAIL / I1_PENDING**. No self-approval and no claim of full-goal completion. SPEC 0210 / PDSH-032 infrastructure / P100-004 base. Workdir: `/tmp/cvg-pare100-exec-20261014-6az3hlay/worktree`. Node 22.23.2. All edits are in the claimed lane plus this evidence folder. Lead retains ledgers, plan, package/CI integration, critical review and broader gates.

Twenty frozen input/expected pairs exercise public createOperationalHarness and createSdk twice each. Main replay: **42 tests PASS** (20 deterministic replays, 20 corruption tests with six mutations each, two corpus/path/schema tests). Exact JSON retains public response/result, counts/usage, toolResult, session envelopes/payloads/order, model requests, actual tool bodies, real effect journal, reference policy decisions, real approval records/events, audit, telemetry and ordered boundary timeline. Real memory stores/governance are used; external model/tool bodies are scripted. Output normalizers: none. Clock/IDs are explicitly injected. SDK protocol shape is preserved without inventing steps.

Observed safety: policy denied, pending/rejected approval, zero model budget, pre-cancellation and failed call logging execute no synthetic tool body/journal reservation. Model failure/cancellation/deadline retain request but no model/result and zero billed usage. Token/cost exhaustion retains actual usage exactly once. Successful synthetic body is journal CONFIRMED even when tool/result logging fails; result remains INSUFFICIENT_EVIDENCE. Tool throw/lost journal confirmation remains UNCERTAIN. Lost markStarted leaves RESERVED and no body. Full outcomes are in frozen fixtures and [candidate-review.json](candidate-review.json).

Dedicated CLI negative controls: output, event and effect mutation, missing input, missing expected, empty corpus, malformed schema, hostile filename and symlinked recording directory all exited 1. Before/after byte hashes proved these invocations did not rewrite the corpus. Explicit single-case recording exited 0, existing-candidate rejection exited 1, hostile/missing record-case arguments exited 1. Record writes only a fresh candidate under snapshots/core/recordings, never expected JSON. The candidate was archived as [explicit-record-candidate.json](explicit-record-candidate.json). [CLI commands and exits](cli-commands.json); [complete command ledger](command-ledger.json). A subsequent replay with inherited hostile record env also passed; the runner clears that env.

Two actual runtime composition defects remain open, with executable probes kept outside the golden replay selection:

1. Public `pause` option is not forwarded into SinglePassGovernedRuntime by createOperationalHarness. A paused synthetic tenant still executes one body and returns COMPLETED (expected no effect/HUMAN_TAKEOVER). See [pause actual](pause-probe-actual.json).
2. Public `effects` option is also not forwarded. With the tenant unpaused, the body runs and the real journal confirms, while the injected InMemoryEffectLedger has zero entries (expected started/finished). See [effects actual](effects-probe-actual.json).

Source-bound reproduction is in tests/replay/public-controls.probe.ts; final conformance command exits 1 with both assertions failing. These violations were **not** frozen as acceptable pause fixtures and production was not changed. Known passing infrastructure is distinct from failing control conformance. Lead must record/assign the defects under an appropriate production claim/SPEC and rerun probes. PDSH-032 is not approved by this handoff.

Commands (all executed in the workdir with the Node22 PATH):

```sh
node scripts/snapshot-replay.mjs
node node_modules/typescript/bin/tsc -p tests/replay/tsconfig.json
node node_modules/eslint/bin/eslint.js tests/replay scripts/snapshot-replay.mjs vitest.snapshot.config.mts
node node_modules/prettier/bin/prettier.cjs --check tests/replay snapshots/core vitest.snapshot.config.mts scripts/snapshot-replay.mjs
node node_modules/vitest/vitest.mjs run --config tests/replay/vitest.probe.config.mts
node scripts/snapshot-replay.mjs --record --case simple-response
```

Final raw logs and SHA-256:

| Log | Exit | SHA-256 |
| --- | --- | --- |
| [replay-final-after-review.log](replay-final-after-review.log) | 0 | `d7678945627528b18294d757fab5d268e36638efc80759b9375219377d6fa550` |
| [typecheck-focused-final.log](typecheck-focused-final.log) | 0 | `43fee75f1b0a98240db830278db8677864a6732d20728df93feceeb4dfa639ff` |
| [lint-focused-final.log](lint-focused-final.log) | 0 | `02d573701f55d41e90960e3c6c9883846d79966b48e2a056ab81c96a48236fb1` |
| [format-check-final.log](format-check-final.log) | 0 | `17aa973d3f004560237d9a95171210b0671deff23d61628eecf7322ff5938f20` |
| [public-controls-probe-final.log](public-controls-probe-final.log) | 1 (two observed control conformance failures) | `9478301c396b4908ea1706686b42cd9f90a28582cd4934b269d0a8b5fc8d515a` |
| [production-unchanged.log](production-unchanged.log) | 0 | `6644f9a92b124223b8156d3c055c2d42435ecab9d1b70d39a2ab9ea9825c9d9f` |

Earlier failures are retained: SDK recording initially used the harness result schema (incorrectly requiring steps), then was corrected to the existing public SDK protocol; initial typecheck identified that and readonly mutation-test typing. Corrected recordings and focused checks passed without changing runtime or lowering any gate. Zero-byte command output logs contain an explicit command/exit envelope and empty-output note. Other log output bytes are retained unmodified.

Self-review (builder only): verified alias/threshold inheritance with bounded test include; default CLI clears record env; corpus is mandatory/closed and schemas/files/symlinks are checked before execute; candidates exclusively create; complete comparisons do not remove mutable fields; negative CLI checks preserve fixture bytes; fake timers are restored; no descendant, real provider/network, clinical/financial effects, real data, commit/push/deploy or original-root writes. Both public composition defects are confirmed and intentionally unresolved in this lane. No independent review was performed; I1 belongs to the Lead.

Limitations/integration: this covers single-pass and session SDK CVG replay, not an oracle/reference-engine differential, iterative/full-product parity or all 36 cards/eight phases. Cvg-only infra does not close P100-004. Lead owns root package script/CI wiring (recommended command: `node scripts/snapshot-replay.mjs`), ledger/backlog updates, I1, and broad unit/coverage/PG/E2E/certification. No package config, root Vitest aliases/thresholds, lockfile, runtime, policy, contracts, SDK, shared ledger/coordination/plan or .gauntlet was edited by this builder. Production-source hashes match the captured baseline.

Exact implementation file list (51 new files; no tracked source deletions):

```text
scripts/snapshot-replay.mjs
snapshots/core/README.md
snapshots/core/approval-pending.expected.json
snapshots/core/approval-pending.input.json
snapshots/core/approval-refused.expected.json
snapshots/core/approval-refused.input.json
snapshots/core/authorized-tool.expected.json
snapshots/core/authorized-tool.input.json
snapshots/core/cancel-before.expected.json
snapshots/core/cancel-before.input.json
snapshots/core/cancel-model.expected.json
snapshots/core/cancel-model.input.json
snapshots/core/cost-budget.expected.json
snapshots/core/cost-budget.input.json
snapshots/core/deadline-model.expected.json
snapshots/core/deadline-model.input.json
snapshots/core/journal-confirm-failure.expected.json
snapshots/core/journal-confirm-failure.input.json
snapshots/core/journal-start-failure.expected.json
snapshots/core/journal-start-failure.input.json
snapshots/core/log-call-failure.expected.json
snapshots/core/log-call-failure.input.json
snapshots/core/log-result-failure.expected.json
snapshots/core/log-result-failure.input.json
snapshots/core/model-budget-zero.expected.json
snapshots/core/model-budget-zero.input.json
snapshots/core/model-failure.expected.json
snapshots/core/model-failure.input.json
snapshots/core/policy-denied.expected.json
snapshots/core/policy-denied.input.json
snapshots/core/sdk-model-failure.expected.json
snapshots/core/sdk-model-failure.input.json
snapshots/core/sdk-response.expected.json
snapshots/core/sdk-response.input.json
snapshots/core/simple-response.expected.json
snapshots/core/simple-response.input.json
snapshots/core/token-budget.expected.json
snapshots/core/token-budget.input.json
snapshots/core/tool-failure.expected.json
snapshots/core/tool-failure.input.json
snapshots/core/tool-throw.expected.json
snapshots/core/tool-throw.input.json
tests/replay/behavior-contract.ts
tests/replay/execute-fixture.ts
tests/replay/fixture-schema.d.mts
tests/replay/fixture-schema.mjs
tests/replay/public-controls.probe.ts
tests/replay/snapshot-replay.test.ts
tests/replay/tsconfig.json
tests/replay/vitest.probe.config.mts
vitest.snapshot.config.mts
```

All implementation and evidence files are enumerated in [changed-files.txt](changed-files.txt); byte hashes are in [SHA256SUMS](SHA256SUMS). Next action: Lead reviews/integrates this bounded input and assigns the control-composition repairs. No runtime self-approval or full-card completion is granted.
