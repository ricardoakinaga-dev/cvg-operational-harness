# Independent R1 — REVISE

Status **IMPLEMENTED**. Two mandatory **P1 / HIGH confidence** findings remain. This judges the conservative mechanism repair only; it grants no integration, B6, full-gate or production approval.

Candidate `1c2012d9514c0f30be1c27cdc7458a9484ab6c6f`, base `75dfef50d0b5bc5a8063829ea4c63af8b4ab8b54`. Approved [SPEC0236 snapshot](inputs/0236_b6_semantic_boundary_proof.source.txt), SHA-256 `cf07fd5dd87220cd3c41704a64d2bd294a8b972bfbf230e38fb6c3453fbffa49`. [Input manifest](input-manifest.json) SHA-256 `88efce2d553d5848ec2f018b297873fb6932d071338e68446d653d37443eeada`. [Frozen criteria](criteria.json). [Machine verdict](review.json).

## Mandatory findings, biggest gap first

**R1-01 — P1 / HIGH: absolute legacy main receives proof for another file.** A package `main` containing an absolute private-fixture path passes `runtimeLiteral`. The engine then concatenates it to the package key and normalizes it (`scripts/boundary-semantic-engine.mjs`, lines378–399). Native `tryPackage` instead uses `path.resolve(requestPath, pkg)` (pinned native lines501–511), which selects the absolute file. In S02 the native file contains a finite concatenated product import, while the substitute inside the package is harmless. Both kernel execution and recomputation return `PROVEN`, `validation.valid:true` and two proofs; the CLI marks the matching installed package `verified:true`. Its global result stays `INCOMPLETE/exit1` because a separate acquisition path reports `MODULE_OUTSIDE_REPOSITORY`. That global refusal does not validate the false semantic proof. Affected: **C1/C2, SP07/SP10/SP17**. [Observation](S02.json), [CLI report](S02.report.json), [graph](S02.graph.json), [kernel input/output](S02.kernel.json), [native command](raw-r3/004.command.json), [native selection](raw-r3/004.stdout.txt), [checker command](raw-r3/005.command.json).

Required repair: conservatively refuse absolute/unmodelled legacy main before constructing a package-relative path or publishing proofs; add native resolve-only CLI/kernel regression. This needs no positive0237 transfer.

**R1-02 — P1 / HIGH: CJS sibling-file precedence bypasses the owner guards.** With legacy `vendor/package.json` and sibling `node_modules/vendor.js`, native `require.resolve('vendor')` selects the sibling file. The engine's package search (lines337–397) selects `vendor/entry.js` instead. The sibling contains a finite concatenated product import. Native `_findPath` resolves exports first, then files/extensions, then the package directory (lines731–778). The standalone kernel nevertheless emits `PROVEN`, installed `PROVEN`, two proof IDs, zero unknowns and `validation.valid:true`. The physical CLI aborts with `ENOTDIR/exit2` before JSON, so this is a demonstrated **kernel false proof**, not a demonstrated global CLI PASS. Affected: **C1/C2, SP07/SP10/SP17**. [Observation](S01.json), [kernel input/output](S01.kernel.json), [native selection](raw-r3/001.stdout.txt), [CLI command](raw-r3/002.command.json), [CLI error](raw-r3/002.stderr.txt), [kernel command](raw-r3/003.command.json).

Required repair: reject unmodelled CJS file candidates at the applicable bare-module search locations before deriving a legacy package entry. Preserve exports-first behavior: S03 demonstrates that an exact export must still win over the sibling. Add controlled kernel/CLI regression.

Source anchors: [frozen engine](inputs/036-boundary-semantic-engine.mjs.source.txt), [pinned native CJS loader](inputs/031-node-internal-modules-cjs-loader.source.txt). Both findings concern the existing actual-runtime/consumable-proof contract, not a request for new supported resolution rules.

## Independent checks

Twenty distinct bounded scenarios completed in one accepted foreground collection, with47 recorded oracle/checker/kernel/compatibility calls. **18 met their focal expectation; S01/S02 failed the negative proof requirement.** The original URL-sensitive, nearest self-reference and exact extensionless-exports families now refuse proof (S04–S08). Ordinary legacy main, exact `.js` exports and closed ESM positives remain positive (S03/S09/S10/S16). Finite concatenated product loading remains `FAIL` (S17). JSON fallback, directory config, conditional/invalid exports, interop and unsupported flags remain UNKNOWN in the selected controls. S19's missing-owner variant refuses through a cycle; it does not demonstrate a global false proof.

S16 compares the old75df and repaired public checker on the **same physical fixture**, once default and once P1: stdout, stderr and exit are byte-equivalent in both. All original21 CLI test bodies are byte-unchanged; all20 synthetic vendor inventories match their independent-reference copies. [Static/regression bindings](static-regression-bindings.json).

| ID | Controlled scenario | CLI / semantic | Expected outcome |
| --- | --- | --- | --- |
| S01 | CJS sibling vendor.js wins before legacy package directory | CLI exit2 / PROVEN | FAIL |
| S02 | absolute legacy main must not become package relative | INCOMPLETE / PROVEN | FAIL |
| S03 | CJS exports wins before sibling file | PASS / PROVEN | PASS |
| S04 | URL tab exports | INCOMPLETE / UNKNOWN | PASS |
| S05 | relative percent ESM edge | INCOMPLETE / UNKNOWN | PASS |
| S06 | nearest self-reference rejects outer body | INCOMPLETE / UNKNOWN | PASS |
| S07 | nearer manifestless owner directory | INCOMPLETE / UNKNOWN | PASS |
| S08 | exact extensionless exports rejected | INCOMPLETE / UNKNOWN | PASS |
| S09 | ordinary legacy extension fallback positive | PASS / PROVEN | PASS |
| S10 | exact .js CJS exports positive | PASS / PROVEN | PASS |
| S11 | unsupported JSON alternative before index | INCOMPLETE / UNKNOWN | PASS |
| S12 | directory package config before index | INCOMPLETE / UNKNOWN | PASS |
| S13 | require to ESM interop rejected | INCOMPLETE / UNKNOWN | PASS |
| S14 | conditional exports remain unsupported | INCOMPLETE / UNKNOWN | PASS |
| S15 | invalid exports node_modules segment | INCOMPLETE / UNKNOWN | PASS |
| S16 | closed ESM positive with default/P1 comparison | PASS / PROVEN | PASS |
| S17 | finite concatenated product still FAIL | FAIL / VIOLATION | PASS |
| S18 | import to CJS interop remains unsupported | INCOMPLETE / UNKNOWN | PASS |
| S19 | nearer sibling file without package directory shadows outer | INCOMPLETE / UNKNOWN | PASS |
| S20 | closed runtime flags refuse --conditions | INCOMPLETE / UNKNOWN | PASS |

[Full results](results.json), [scenario procedure](probes.mjs), [receipt helper and command recorder](fixture-helper.mjs), [launcher command](probe-launch-r3.command.json), [launcher exit0](probe-launch-r3.exit.json), [raw summary](probe-launch-r3.stdout.txt), [fixture hashes](fixture-manifest.json). Each `raw-r3/*.command.json` retains argv, cwd, sanitized environment, stdin where applicable, timestamps, exit/signal, and sibling stdout/stderr files. Controlled fixtures are retained under `fixtures/` and the review's private temporary tree.

## Binding, independence and limits

The pinned Node22 binary and all five saved native-source bodies match independent extraction from the current binary. [Native binding evidence](native-bindings.json). Resolution oracles use only `require.resolve`/`import.meta.resolve`; no synthetic target application is imported or executed to discover semantics. Kernel validation uses the trusted analyzer's compile-only mechanism.

All17 frozen source hashes agree before/after and match candidate HEAD. Exactly the authorized engine/test paths differ from base; the other15 remain unchanged. [Before](source-before.json), [after](source-after.json). Reviewer is a fresh Codex critic, separate from the implementation author, independenceI1; zero descendants. R1 consumes one of at most two reviews for this repair.

Producer38CLI/115engine/compiler results are inputs, not independently rerun suites. Prior16gates/38hash qualification is historical and is not current readiness. The20 scenarios are bounded, not exhaustive conformance; default/P1 comparison covers one fixture. Full suites, gates, consumer, compiled provenance, integration and production acceptance were not run or granted.

The initial collector crashed when S01 CLI returned no JSON; a second background launch was interrupted without an observed exit. Both attempts and raw outputs are retained separately and excluded from accepted measurements. [Collector attempts](collector-attempts.json). The completed foreground attempt preserves the same CLI error and adds the independent kernel measurement.

Only authorized review subtrees were written. Shared ledgers/coordination, `.agent`, candidate/root source, lock/manifests, old sealed evidence and peer resources stayed read-only. Concurrent lead outputs are outside this review's source fingerprint. Shared-ledger reconciliation belongs to the lead under the user's narrower write restriction.

Next action: repair R1-01/R1-02 conservatively under the same approved0236, retain these observations, freeze a new candidate and submit R2 within the remaining budget before current gates or promotion. State remains **IMPLEMENTED**, never self-approvedDONE.
