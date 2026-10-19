# SPEC0235 final independent review R3

**REJECT — first bounded native launch is not eligible.** One mandatory evidence-integrity finding remains. Both exact R2 residual counterexamples are repaired, but the failure ledger is still not required to preserve the complete ordered trace cause set. **Two corrections consumed; zero remain. SCOPED_FAILED_QUALITY_BAR.**

Candidate `/tmp/cvg-claude100-exec-20261017/ref-port-candidate`, checkpoint `f3d6de87e206b04411fb1c576a1ccaaf6ffb5dca`. Original SPEC/human BUILD authority preserved. Review completed `2026-10-18T03:00:33.837802+00:00`. Final real positive controls and NP01–NP10 acceptance remain **NOT_RUN**.

## Mandatory finding, largest first

### R3-01 — MEDIUM — Failure ledger is not required to preserve the trace cause set, primary cause or chronology

Confidence HIGH; affected NP07/NP08. Mandatory under the frozen SPEC, even though the terminal status remains failure.

Immutable SPEC0235 lines418–423 requires an ordered failures.json preserving chronological primary and additional causes; lines397–409 requires rejecting contradictory evidence bindings. R3 review contract explicitly requires actual status/failure/record bindings.

Direct code:
- [tests/claude100/reference-port/report.mjs:104](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:104>): Terminal status is checked from the supplied ledger, but many distinct priority1 cause sets have the same INFRA_FAILURE outcome.
- [tests/claude100/reference-port/report.mjs:105](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:105>): For each supplied ledger entry, validates its referenced FAILURE record only. No reverse coverage requirement, unique-reference requirement or ordered/consecutive order requirement.
- [tests/claude100/reference-port/report.mjs:1038](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:1038>): Reached-proof validation runs for all statuses, but the one-way failure relation still permits contradictory failure ledgers.

Run the real frozen controller with a wholly simulated peer that emits forbidden auth then refuses cleanup. Its actual report is INFRA_FAILURE/exit1; original failures.json contains PRIVACY order0 followed by four CLEANUP causes, with unchanged matching HOST FAILURE events. Clone only the report/retained map and replace/re-hash the failures artifact three ways: remove PRIVACY, reverse the five causes, or duplicate PRIVACY. assertEvidenceBindings accepts all three mutated artifact sets unchanged. Original artifact set is also confirmed valid first.

| Mutation | Retained trace | Rehashed ledger | Validator result |
|---|---|---|---|
| Drop primary | PRIVACY order0 + four CLEANUP causes | Only the four CLEANUP causes | **ACCEPTED** |
| Reverse chronology | Original events/order unchanged | Four CLEANUP causes before PRIVACY | **ACCEPTED** |
| Duplicate primary | Single original PRIVACY event | PRIVACY twice, then four CLEANUP causes | **ACCEPTED** |

Direct evidence: [three-case JSON](failure-ledger-r3.json), [drop-primary report/proof](failure-ledger-drop_primary.json), [reversal](failure-ledger-reverse_order.json), [duplicate](failure-ledger-duplicate_primary.json), [original failures](</tmp/cvg-claude100-exec-20261017/ref-port-review-r3/artifacts/privacy_and_cleanup_failure/run/failures.json>), [untouched control trace](</tmp/cvg-claude100-exec-20261017/ref-port-review-r3/artifacts/privacy_and_cleanup_failure/run/control-trace.json>), [reproducer](</tmp/cvg-claude100-exec-20261017/ref-port-review-r3/failure-ledger-r3.mjs>).

Impact: The artifact verifier can accept a cause ledger that loses the primary privacy violation, invents a duplicate or reverses chronology while its retained trusted trace contradicts it. The process still reports failure; this is an audit/evidence-integrity contract defect, not a demonstrated native escape, automatic positive-status bypass or evidence that the controller normally omits its causes.

Safe correction for a future authorized recovery: Require an exact ordered correspondence between the complete retained HOST FAILURE record set and failures.json: each reachable cause represented once, correct artifactRef and fields, consecutive unique order in canonical chronology, primary cause first. Preserve the explicitly defined record-cap/null-reference case rather than requiring nonexistent future records. Add the three counterexamples as rejects. No correction was made by this reviewer.

## Two R2 residuals and six original regressions

**R2-01: EXACT_NEGATIVE_STATUS_PASS_COUNTEREXAMPLES_RESOLVED; ADDITIONAL_VERIFIER_FINDING_R3_01_REMAINS.** Rehashed privileged inspect and uid0/marker-present preflight are rejected in both PORT_OBSERVED and genuine privacy INFRA_FAILURE reports. Reached PASS proof validation now precedes terminal-status branches. Additional failure-ledger completeness/order property is defeated by R3-01.

**R2-02: RESOLVED_WITHIN_BOUNDED_TESTS.** Both direct bootstrap signals are preserved as SIGNAL with actual signal in the error chain, no remaining owned snapshot/FDs, and restored handlers. Four copied-controller signal cases preserve SIGNAL, cleanup and graph disposal; two byte-identical copied CLI/inert-controller import cancellation tests and original ownership-transfer unit test also pass.

| Original finding | R3 result |
|---|---|
| R1-01 | RESOLVED_IN_RETEST: Six consumed input/profile mutations refused before native and after port (12cases), plus two exact-empty-directory mutations refused. All exit1 with DRIFT_RUNTIME; physical drift leaves partial evidence when coherent publication is impossible. |
| R1-02 | ORIGINAL_COUNTEREXAMPLES_RESOLVED: Both direct bootstrap signals are preserved as SIGNAL with actual signal in the error chain, no remaining owned snapshot/FDs, and restored handlers. Four copied-controller signal cases preserve SIGNAL, cleanup and graph disposal; two byte-identical copied CLI/inert-controller import cancellation tests and original ownership-transfer unit test also pass. |
| R1-03 | ORIGINAL_INSPECT_PREFLIGHT_COUNTEREXAMPLES_RESOLVED; RELATED_EVIDENCE_INTEGRITY_GAP_REMAINS: Rehashed privileged inspect and uid0/marker-present preflight are rejected in both PORT_OBSERVED and genuine privacy INFRA_FAILURE reports. Reached PASS proof validation now precedes terminal-status branches. Additional failure-ledger completeness/order property is defeated by R3-01. |
| R1-04 | RESOLVED_IN_RETEST: Nonzero actual wrapper exit preserves failure and still removes both virtual identities; actual simulated native port exit1 stays distinct from wrapper exit. |
| R1-05 | RESOLVED_IN_RETEST: Terminal body without trusted REQUEST/RESPONSE is PROTOCOL/INFRA_FAILURE with retained partial evidence, not intact clean absence. |
| R1-06 | RESOLVED_REPRESENTATION_PRESERVED: Only builtin trusted bootstrap precedes pinning/copy; host controller/helper graph imports copied bytes through one fixed verified within-closure path. Fixed12builtin allowlist appears in profile and matches AST; graph disposal precedes publication. |

## Compatibility and source graph

**Q1: COMPATIBLE_FAIL_CLOSED_NOT_RUNTIME_PROVEN.** No ordinal4 invented. Simulated observer incomplete EOF/nonzero after a valid exchange is refused as INFRA_FAILURE and virtual resources are removed. Actual fifth HTTP attempt remains NOT_RUN; host does not infer an observed CAP code from EOF alone.

**Q2: COMPATIBLE_DEADLINE_INTERPRETATION_NOT_RUNTIME_PROVEN.** Unchanged fixed local Enginev1.51 attach handshake counts within24calls and <=2s call budget; observation stream is bounded by shared30s controller deadline. Real Engine/socket/image compatibility NOT_RUN.

**Q3: COMPATIBLE_TERMINALS_AND_BODY_JOIN_RETESTED.** Zero-length terminal representation unchanged; original fragmentation/duplicate/after-terminal/EOF tests pass. Complete orphan body without trusted control is rejected. Real cross-pipe scheduling NOT_RUN.

**Q4: COMPATIBLE_CONSERVATIVE_WINDOW_NOT_RUNTIME_PROVEN.** No global native/HTTP pipe order invented. Raw observer bytes after host STOP cause exit1/no positive report and virtual cleanup. R3 refuses incoherent raw evidence publication, leaving partialfiles; practical false negatives remain possible, actual scheduling NOT_RUN.

**profileTopKey:** R2 accepted interpretation preserved: top-level profile description says contém while Docker config and Reportv1 are closed; fixed builtinAllowlist fulfils an explicit existing requirement and grants no configurable capability.

**fixedImport:** R2 accepted interpretation preserved: one fixed verified dynamic import inside copied closure is allowed; outside-closure resolution and generic target-selected module imports remain forbidden.

**trustedBootstrap:** Independent AST confirms only builtin imports before fixed graph entry;20sources/271496bytes/12builtins/one within-closure dynamic import/zero unresolved edges. Original and copied graph pins are checked; actual copied controller run is explicitly simulated and snapshot disposal precedes final publication.

## Executed independent evidence and boundaries

- **228/228 original focused tests in12files PASS**, zero failures/skips/todo, unchanged source tests under privateTMPDIR/cache and authorized own random marker children. This includes two copied CLI/inert-controller import-cancellation cases and two synthetic bootstrap signal cases. [JSON](focused-suite-r3.json), [log](focused-suite-r3.log).
- **23 independent non-signal controller scenarios** preserved: actual frozen controller plus only fake Engine/native/preflight/HTTP messages. The immutable source graph was also copied/executed under explicit simulated dependencies. [Index with every result](scenario-index.json).
- **Six independent actual-signal Node subprocesses PASS**: SIGINT/SIGTERM in builtin-only bootstrap before controller import and in copied-controller configure/port stages. No leftover bootstrap snapshot/owned FDs; controller SIGNAL preserved and zero virtual resources after cleanup. Entry handler ownership transfers synchronously after controller handlers exist. [Signal proof](signal-r3.json), [script](</tmp/cvg-claude100-exec-20261017/ref-port-review-r3/signal-parent.mjs>).
- **Four exact previous inspect/preflight mutants rejected** for both PORT_OBSERVED and genuine privacyINFRA_FAILURE. [Proof](continued-proof-r3.json).
- **Three new cause-ledger mutants accepted**, proving R3-01. Harness exit0 is observation completion, not candidate acceptance. [Proof](failure-ledger-r3.json).
- Initial copied R2 regression runner stopped after21scenarios: its late-after-STOP assertion required a published INFRA report, but current validation refused incoherent raw proof and returned exit1/partial evidence with zero virtual resources. The failed assertion/source/log are preserved. A separate continuation checked actual refusal/cleanup and the remaining four proof mutants; no source test or implementation was changed. [First failure](adversarial-r3.log), [continuation](continued-proof-r3.json).
- Independent AST inventory confirms20runtime sources/271496bytes,12fixedbuiltins,one fixed verified within-closure dynamic import,zero unresolved imports; profile allowlist exact. [Closure](closure-independent-r3.json).
- **35/35source/protected pins unchanged** before/after; seven protected paths also match base26d866c3. Current Node/DockerCLI/Claude raw bytes match immutable expected hashes; Node alone executed. [Before](source-before.json), [after](source-after.json), [pins](current-pins.json).
- R1 **680/680** and R2 **1259/1259** sealed review artifacts remain byteexact. Historical source input pins are not rewritten to the corrected candidate. [Seal proof](prior-seals.json).
- No code changes, delegated agents, shared ledgers, Docker/Engine/HTTP/network, selected native/Claude, original valid probeCLI/main, actual observer/client main, fullgates/PG/E2E/SBOM/licenses or external account/model actions. Lead remains sole writer for shared docs/resource controls.

## Commands and reproducibility

All scenario scripts create exclusive outputs. Preserve this attempt; rerun only in a fresh reviewer-owned subtree.

```sh
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r3/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-candidate/node_modules/vitest/vitest.mjs run --config /tmp/cvg-claude100-exec-20261017/ref-port-review-r3/vitest.config.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r3/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r3/failure-ledger-r3.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r3/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r3/continued-proof-r3.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r3/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r3/signal-parent.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r3/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r3/closure-r3.mjs
```

## Manifest binding and stop verdict

- Approved SPEC: `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04`.
- FreezeR3: `292d3a2fa40fd196715482c4679172180bab4cd564422822511278a3d39f273f`.
- ReviewcontractR3: `459d7ca7cf339f2a8e442f5cc721afa64512aa04083e8cd4a01d6b0e75bd51b1`.
- Correctioncontract2of2: `2ac0442cf5f4a7f6b6237603bb078b3bcc9d9bcd2bc792c83ca77b2897d194e3`.
- [Input manifest](inputs-manifest.json): `bd8abba2a8b4f56356397043acb089bd03f3efc0b6f8ae5bde1280efa50df56c`, exact28source/7protected plus original authority/contracts/Lead and prior sealed review evidence.
- [Final evidence manifest](manifest.json) binds REPORT.md/result.json, every owned reviewer script/log/result and all retained scenario files to raw bytes. It excludes only itself to avoid a circular digest. Manifest SHA256 is returned in the handoff.
- [Machine verdict](result.json) includes exactcounts, mandatory finding, all residual/regression judgments, NP01–NP10 finalNOT_RUN, and exhausted correction budget.

Lead records SCOPED_FAILED_QUALITY_BAR and keeps native/fullgate launch ineligible. Preserve R1/R2/R3 and exhausted2of2 budget; prepare explicit bounded evidence-based recovery for failure-ledger bijection/chronology before any new implementation attempt, re-freeze, review or native launch. No automatic third correction or scope reset.

Review complete with REJECT. No real positive control, final NP acceptance, M1,117+17functional catalog credit or release is granted.
