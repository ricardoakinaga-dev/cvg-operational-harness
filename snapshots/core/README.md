# Frozen keyless recorded turns — PDSH-032

SPEC: [0210](../../docs/02_spec/0210_pare100_snapshot_replay.md).
Acceptance sources: [ADR-011](../../docs/architecture/adrs/ADR-011-kernel-de-plugins-com-controles-obrigatorios.md), [SPEC 0181](../../docs/02_spec/0181_kernel_plugin_contract.md), public session/SDK conformance tests.

Run with Node 22 from the repository root:

```sh
node scripts/snapshot-replay.mjs
node node_modules/typescript/bin/tsc -p tests/replay/tsconfig.json
node node_modules/eslint/bin/eslint.js tests/replay scripts/snapshot-replay.mjs vitest.snapshot.config.mts
```

There are twenty mandatory input/expected pairs. Each executes twice with a fresh public `createOperationalHarness` or `createSdk`, real in-memory session/approval/effect stores and kernel governance. The test host adapts the real reference PolicyEngine and ApprovalEngine; only model/tool bodies are scripted. Fixtures cannot select an executable command, module, provider, socket or data path. No credential or real data is needed.

The complete JSON transcript is compared: public result, counters/usage, session event envelope and payload, source model requests, tool body invocations, final journal, policy decisions, approval request/record/events, audit, telemetry and ordered boundary timeline. Host AbortSignals are captured as presence/initial-aborted flags; the model request log retains the contract's signal-free body. No response, counter, error, event or effect is normalized. Clock starts at `2026-10-14T12:00:00.000Z`; the deadline fixture advances exactly 1000 ms. Event and effect attempt IDs are explicitly injected. **Output normalizers: none.** SDK results retain their actual protocol shape (no fabricated `steps`).

Policy/approval blocks log `tool/call` and a `not_started` result, with zero tool counter, body or journal reservation. Model cancellation/deadline has a request and no result event. Usage is charged exactly once for successful model responses including token/cost exhaustion. A lost tool/result record returns INSUFFICIENT_EVIDENCE while preserving the confirmed synthetic effect. Executor throw or lost journal confirmation preserves UNCERTAIN; lost markStarted preserves RESERVED with zero executor bodies. A model failure remains MODEL_FAILURE. These distinctions are frozen, never rewritten into success.

The runner rejects incomplete/empty corpus, unknown paths/names, symlinks, prototype keys, malformed JSON/schema and oversized files before execution. Tests corrupt output, cost, events, approval identity, bodies and journal independently. `--fixtures-dir <dir>` is a read-only corpus override for adversarial checks; it must still contain every closed-list case.

Explicit recording creates a review candidate only:

```sh
node scripts/snapshot-replay.mjs --record --case simple-response
```

This validates all input schemas, runs independent acceptance checks and two deterministic executions, then exclusively creates `snapshots/core/recordings/simple-response.candidate.json`. It fails if that candidate exists and **never updates any `.expected.json`**. Review and promote a candidate manually under the appropriate claim/review; an observed contract violation must stay a failing probe instead of becoming a golden expectation. Replay ignores no unexpected fixture file. Vitest snapshot-update flags do not change these JSON expectations.

Pause and injected effect-ledger conformance are reproducible separately:

```sh
node node_modules/vitest/vitest.mjs run --config tests/replay/vitest.probe.config.mts
```

At the initial replay baseline these probes exposed missing `pause`/`effects` forwarding. The approved [SPEC0212](../../docs/02_spec/0212_pare100_public_control_wiring.md) repair now forwards both ports through the factory; current source reliability and its additional failure/replay cases are reviewed separately in [integrated R3](../../docs/04_audit/evidence/PARE100-EXEC-20261014/critic-integrated-r3/verdict.json). No defective pause behavior was promoted into a golden fixture. Keep these explicit probes as a separate control check; the twenty replay cases still exercise the real journal/store paths and do not alone prove complete control conformance.

This infrastructure is a CVG replay input for the Lead. It does not supply the reference-engine oracle, close differential P100-004, approve PDSH-032, or complete the full 36-card program. Root manifest/CI integration and independent I1 review remain with the Lead.
