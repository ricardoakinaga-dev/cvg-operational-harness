# Test builder — IMPLEMENTED, behavior NOT_RUN

The Lead may run `tests/b6-0240-exact-metadata.test.js` against unchanged84d8 before source implementation. This lane did not execute the new suite, legacy baseline, targets, or any gates and does not approve acceptance. Direct execution lane, no descendants.

Only the candidate test and this evidence subtree were written. Runtime parent is explicitly `/mnt/ia/cvg-hiso005-build0240-runtime-20261018/test-builder`; subprocess TMPDIR uses that same parent. All private fixture cleanup is limited to roots created by this test. Source, old tests, ledgers, old evidence/runtime, stage and commits were untouched by this lane.

73 bounded generated test cases. Positives measure semantic status and K5 closure rather than putting a source-version assertion before behavior. The new pure export is accessed through the resolver namespace only inside tests, so missing export does not abort first-red collection. Native targets are never imported/evaluated: Node resolver-only oracle uses constant code, structured argv, explicit cwd, minimal environment and a load hook that throws. The analyzer subprocess invokes only the approved engine API.

## Static checks only

Pinned Node22.23.2 version and binary SHA match the current candidate preflight. `node --check` exit0. Own-file Prettier initial check exit1 (formatting), then own-file write exit0 and final check exit0. All raw stdout/stderr and exact check argv/cwd/exit codes are in `checks.json`. No repository formatter was run.

A static correction before final freeze distinguishes an absent ESM target's logical node_modules URL from its canonical URL when present; this matches the approved readonly selector witness. Initial unformatted artifact receipt is preserved as historical, superseded by `freeze.json`.

## Traceability (all behavior NOT_RUN)

- **MS01**: 6 paired import/require closed-JS positives for imports/pattern/both; exact nonroot pair and empty imports/embedded-star witness. K5 entry closure + dependency proof checks; native target agreement.
- **MS02**: Selected unsupported exports, invalid maps and key grammar, active # body edge, custom conditions; UNKNOWN and zero proofs with physical available alternatives.
- **MS03**: Global mixed keys, selected numeric/mixed conditions, early/late default, nested NOT_MATCHED/BLOCKED, malformed/multistar patterns, nonroot null blocks matching pattern and main/index fallback.
- **MS04**: Eligible imports paired with opaque reflection and actual # edge; browser/native/declaration/TSX/interop/dist without receipt remain UNKNOWN.
- **MS05**: Import/require leaf/chain product alias with both metadata; native canonical product target; VIOLATION before/after semantic maxNodes=0 and workspace maxWorkspaces=0. No product-body input acquisition. Prior violation survives oversized-manifest unknown.
- **MS06**: Constant-code structured-argv Node22 native resolve-only oracle with load hook denying target loads, explicit cwd and minimal env. ESM missing logical URL distinguished from CJS MODULE_NOT_FOUND and helper availability. Hostile marker absent after oracle/analyzer.
- **MS07**: Whole manifest hash input, inactive imports/pattern value mutation invalidates saved resolution and semantic output; preacquisition FD cap; one hard 16MiB oversized-manifest witness, prior violations preserved.
- **MS08**: New profile/kernel on proof; old kernel and old snapshot profile rejection; same physical premises with tampered eligible/inactive/ignored patterns/selected key/valid-looking branch must be rejected.

## Limits of this lane

These tests cover the exact metadata delta, not the complete MS01–12 acceptance program. Real Vitest observation, full legacy negative multiset, builtin/self-reference regression corpus, real FD/error/timeout coverage, CLI normal/strict graph parity, worker composition qualification, full gates, consumer, lineage/measurement and promotion remain the Lead's existing responsibilities. No PASS for those obligations is inferred. No real application data, PG, Docker, install, network, source modifications or target execution.

Next action: Lead records first-red under unchanged84d8, implements helper/engine, then runs integration/qualification and fresh critic. Runtime state/log/backlog remain readonly under the explicit lane ownership; this report is the lane's continuation handoff.
