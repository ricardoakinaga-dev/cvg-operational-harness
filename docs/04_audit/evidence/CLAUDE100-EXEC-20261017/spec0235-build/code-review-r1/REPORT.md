# SPEC0235 independent security/code review R1

**REJECT — not eligible for the first bounded native launch.** Six mandatory findings, ordered below. Final real positive controls and NP01–NP10 acceptance remain **NOT_RUN**. Human BUILD authority is preserved; it does not waive this code review.

Candidate `/tmp/cvg-claude100-exec-20261017/ref-port-candidate`, checkpoint `ccaa464c55b7abdaa93ad6849f1ecb23eb858f62`. Review completed `2026-10-18T02:13:42.069937+00:00`. Readonly sources and protected helpers remain exact (31/31 before/after; protected 7/7 also match base26d866c3). No source/ledger changes, delegated agents, Docker commands, network, native target, wrapper main or fullgate execution by this reviewer.

## Mandatory findings

### R1-01 — HIGH — Physical consumed inputs and profile can change while DRIFT and publication still PASS

Confidence HIGH; affected NP04, NP08. **Mandatory before launch.**

Expected: SPEC lines 229–259, 307–309, 322–325, 403–409: retain/verify exact consumed bytes before native execution and after cleanup; changed frozen profile is DRIFT_RUNTIME/INFRA_FAILURE.

Code:
- [tests/claude100/reference-port/inputs.mjs:79](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/inputs.mjs:79>): Only bundle-source copies and their originals become retained pins.
- [tests/claude100/reference-port/inputs.mjs:125](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/inputs.mjs:125>): Bundle inventory, separate stdin, mounted workspace settings/MCP, consumed inventory and empty directory are created without retained pins/inventory verification.
- [tests/claude100/reference-port/controller.mjs:691](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:691>): Profile is persisted but never pinned.
- [tests/claude100/reference-port/controller.mjs:503](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:503>): DRIFT checks original manifest plus context.pins and claims mounted snapshots match.
- [tests/claude100/reference-port/report.mjs:436](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:436>): Publication validator receives evidence.retained memory, not current artifact bytes.

Observed/reproducer: Before simulated START_NATIVE, overwrite each of mounted settings, mounted MCP, profile, consumed-inputs, bundle-inventory and separately retained stdin in six independent owned runs. Each returns PORT_OBSERVED/0, all checks PASS, no failures, and a published digest differing from physical bytes. Adding an unlisted file to the supposedly empty readonly volume directory also passes.

Impact: Current code can launch against changed mounted settings/MCP and publish a successful immutable-looking report whose retained artifacts disagree with disk. This is the ordinary drift model explicitly required by the SPEC; it does not assume malicious root or modifying candidate source.

Direct evidence: [adversarial-r1.json](adversarial-r1.json), [/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/drift_profile_json/review-observation.json](</tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/drift_profile_json/review-observation.json>), [/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/drift_workspace_settings_json/run/report.json](</tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/drift_workspace_settings_json/run/report.json>).

Safe correction: Retain descriptor/path/content identity for all physical consumed artifacts, profile and the empty bind inventory. Verify before START_NATIVE and after cleanup; recompute staged evidence from anchored physical bytes before publication. Preserve actual drift as INFRA_FAILURE and never emit a complete successful report.

### R1-02 — HIGH — Host SIGINT/SIGTERM use default termination instead of bounded cleanup

Confidence HIGH; affected NP07. **Mandatory before launch.**

Expected: SPEC lines 169–174, 373–381: controller cancellation attempts finite cleanup and preserves cause/owned identities; only SIGKILL/power loss lack this guarantee.

Code:
- [tests/claude100/reference-port/controller.mjs:58](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:58>): execute owns lifecycle but installs no SIGINT/SIGTERM handlers or cancellation mechanism.
- [tests/claude100/reference-port/controller.mjs:823](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:823>): cleanup is reached only by normal async control flow.
- [scripts/claude100-reference-port.mjs:45](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/scripts/claude100-reference-port.mjs:45>): CLI awaits runProbe without signal interception.

Observed/reproducer: Own Node22 subprocesses run the real controller with an entirely in-memory Engine, fake toolchain pins and fake marker. At START_PORT both signal listener counts are zero and two virtual resources exist. Self-delivered SIGINT/SIGTERM terminate with the respective signal; intents survive but no cleanup.json or report is written. Parent deadline is 2 seconds.

Impact: A routine host cancellation leaves actual owned containers/marker unreconciled until an external operator acts. Wrapper signal handlers do not substitute for host cancellation.

Direct evidence: [signal-r1.json](signal-r1.json), [/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/host_SIGINT/signal-checkpoint.json](</tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/host_SIGINT/signal-checkpoint.json>), [/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/host_SIGTERM/signal-checkpoint.json](</tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/host_SIGTERM/signal-checkpoint.json>).

Safe correction: Install scoped host cancellation handlers before side effects, record SIGNAL, stop future starts and route cancellation through one finite cleanup path. Remove handlers in finalization; preserve original cancellation and any cleanup failure. Test both signals with an owned simulated subprocess.

### R1-03 — HIGH — Evidence validator accepts rehashed contradictory containment proofs

Confidence HIGH; affected NP02, NP03, NP08. **Mandatory before launch.**

Expected: SPEC lines 397–409 require real proof for every PASS and a validator rejecting omitted/contradictory bindings, not just digest consistency.

Code:
- [tests/claude100/reference-port/report.mjs:32](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:32>): assertEvidenceBindings checks byte hashes and selected relationships but does not revalidate inspect/preflight security facts.
- [tests/claude100/reference-port/report.mjs:158](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:158>): Trace validation covers frame shape and native hashes, not equivalence of preflight/inspect/profile PASS evidence.
- [tests/claude100/reference-port/schema.mjs:318](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/schema.mjs:318>): Checks require a valid existing artifact reference, not a proof appropriate to that check.

Observed/reproducer: Clone the baseline report and retained bytes in memory. Change a retained inspect HostConfig.Privileged to true; separately change preflight uid to 0, hostMarkerAbsent to false and pidNamespace to the synthetic host inode. Update each artifact bytes/hash. assertEvidenceBindings accepts both reports with PORT_OBSERVED and all containment checks PASS.

Impact: A hash-consistent artifact set can contradict its own containment claims and still be accepted by the shipped evidence validator. This is not a claim that an arbitrary attacker can rewrite host evidence; it is a demonstrated SPEC-required verifier failure.

Direct evidence: [adversarial-r1.json](adversarial-r1.json).

Safe correction: Recompute every required check from its appropriate retained proofs, cardinalities and trace relationships; rerun closed profile/inspect/namespace/preflight equivalence validation and reject any contradiction. Do not weaken the qualified helpers.

### R1-04 — MEDIUM — Nonzero wrapper status aborts removal of an otherwise proven owned container

Confidence HIGH; affected NP07. **Mandatory before launch.**

Expected: SPEC lines 373–381 require stop/remove/final absence confirmation for each known owned identity, preserving execution and cleanup errors separately.

Code:
- [tests/claude100/reference-port/controller.mjs:469](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:469>): An exited wrapper with nonzero ExitCode throws IO before reaching rm/final inspect.
- [tests/claude100/reference-port/controller.mjs:491](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:491>): Catch leaves the identity UNRESOLVED, although no remove was attempted and daemon is available.

Observed/reproducer: After the simulated client STOP/CLOSED, set its actual inspect State.ExitCode to 1. Controller returns INFRA_FAILURE and preserves the failure, but never sends rm for the client and leaves one virtual container; observer removal succeeds.

Impact: An abnormal wrapper exit deliberately produces an avoidable resource leak. Failure status and a handoff are honest but do not discharge the required cleanup attempt.

Direct evidence: [adversarial-r1.json](adversarial-r1.json), [/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/wrapper_nonzero_on_cleanup/run/cleanup.json](</tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/wrapper_nonzero_on_cleanup/run/cleanup.json>).

Safe correction: Record the nonzero wrapper observation as an execution failure and continue identity-checked removal/final inspect. Keep execution and cleanup failures separate; only actual inability to reconcile/remove justifies UNRESOLVED.

### R1-05 — MEDIUM — Complete body framing without its trusted REQUEST/RESPONSE is classified as clean absence

Confidence HIGH; affected NP03, NP06, NP08. **Mandatory before launch.**

Expected: SPEC lines 291–299, 339–343, 391–409: missing protected control/body relationships are protocol failure; clean absence requires otherwise intact controls.

Code:
- [tests/claude100/reference-port/controller.mjs:793](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:793>): Wait checks only requests already present in the map; it is vacuously satisfied for orphan body frames.
- [tests/claude100/reference-port/capture.mjs:154](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/capture.mjs:154>): EOF validates binary framing/terminals but not required matching protected control events.
- [tests/claude100/reference-port/report.mjs:327](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/report.mjs:327>): Orphan terminal bodies become partialBodies while the run can retain intact PHASES/PRIVACY_CAPS.

Observed/reproducer: Keep the complete eligible synthetic body and its terminal but suppress its REQUEST and RESPONSE controls, leaving seq contiguous and EOF/CLOSED otherwise valid. Real controller publishes PORT_NOT_OBSERVED with PHASES=PASS and PRIVACY_CAPS=PASS instead of INFRA_FAILURE.

Impact: Missing-control evidence is mislabeled as an intact run with no eligible exchange. It does not produce PORT_OBSERVED in this reproducer but violates required incomplete/error observability.

Direct evidence: [adversarial-r1.json](adversarial-r1.json), [/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/orphan_body_without_events/run/observer-trace.json](</tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/orphan_body_without_events/run/observer-trace.json>).

Safe correction: Before intact classification, require a bijection between eligible body ordinal/terminal and protected REQUEST/RESPONSE records, with all required fields/digests/phase/window checked. Preserve orphan bytes as partial failure.

### R1-06 — MEDIUM — Host consumes original source imports; reviewed builtin allowlist is absent from profile

Confidence HIGH; affected NP04, NP08. **Mandatory before launch.**

Expected: SPEC lines 224–231 requires consuming only the private source/input snapshot and including a fixed Node builtin allowlist in the profile.

Code:
- [scripts/claude100-reference-port.mjs:2](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/scripts/claude100-reference-port.mjs:2>): Host controller is imported from original checkout before snapshot creation.
- [tests/claude100/reference-port/controller.mjs:1](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:1>): Its host helper closure is statically imported from original files.
- [tests/claude100/reference-port/inputs.mjs:83](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/inputs.mjs:83>): Later snapshot copies the closure but host continues using the original module graph.
- [tests/claude100/reference-port/controller.mjs:642](</tmp/cvg-claude100-exec-20261017/ref-port-candidate/tests/claude100/reference-port/controller.mjs:642>): Resolved profile has no builtin allowlist.

Observed/reproducer: Independent Acorn AST inventory agrees with the Lead: 19 source paths, 214909 bytes, 12 builtins, zero unresolved literal imports/dynamic imports. However inspect the CLI import and profile key list: container wrappers use the copy, host does not; profile omits the reviewed allowlist.

Impact: Literal closure completeness is positive evidence but cannot stand in for the approved consumed-source/profile contract. The current result binds copied bytes rather than the entire module graph actually used by the host.

Direct evidence: [closure-independent-r1.json](closure-independent-r1.json), [/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/baseline/run/inputs/profile.json](</tmp/cvg-claude100-exec-20261017/ref-port-review-r1/artifacts/baseline/run/inputs/profile.json>).

Safe correction: Use a minimal trusted bootstrap to freeze and verify the closure before executing the snapshotted host controller; persist the fixed reviewed builtin allowlist in the approved profile representation. Resolve any schema ambiguity explicitly rather than silently claiming compliance.

## Four required compatibility judgments

### Q1: Fifth HTTP attempt cannot use ordinal4

**COMPATIBLE_FAIL_CLOSED_STAGING**. The closed domain remains 0–3. The observer fails CAP privately and exits nonzero without inventing an ordinal/frame. A protected premature EOF is sufficient to reject the run as incomplete INFRA_FAILURE; it is not sufficient to assert that CAP specifically was observed on the host. Synthetic observer_cap_eof confirms a prior valid exchange does not rescue the result. Actual fifth request cap/exit/cleanup positive control remains NOT_RUN. R1-04 requires avoiding leaks on nonzero cleanup observations.

### Q2: Local Enginev1.51 HTTP101 attach handshake ≤2s versus observation ≤30s

**COMPATIBLE_TRANSPORT_INTERPRETATION_NOT_RUNTIME_QUALIFIED**. It is coherent to apply the per-call deadline to establishing a counted attach stream, then bound observation by the shared controller deadline. DockerTransport.budget counts attach within 24 calls; handshake has <=2s timer; observation ends at the same global deadline. This does not extend a Docker CLI command to 30s. Fixed local socket/config and preflight API-range refusal are present. No network lookup was performed and no Engine compatibility/101 lifetime was exercised; current image/API availability and final positive controls are NOT_RUN. This judgment follows the approved observation design and inspected source, not a claim that official reference pages were fetched.

### Q3: Zero-length binary terminal per phase/channel/body; interleaving and EOF

**WIRE_REPRESENTATION_COMPATIBLE_IMPLEMENTATION_INCOMPLETE**. Length zero is already admitted by the length domain, so it can unambiguously designate one terminal without adding a wire type/schema. Decoder checks duplicates, data after terminal, malformed/partial EOF; native classification joins actual END and both channel terminals. Byte-fragmentation/terminal safe tests passed. However the observer body/control join is not total: terminal body without REQUEST/RESPONSE is accepted as clean PORT_NOT_OBSERVED (R1-05). Thus the proposed representation is compatible, but strict missing-event/EOF safety is not satisfied by this candidate.

### Q4: Conservatively exclude observer events/bytes received after host STOP; no invented cross-pipe order

**COMPATIBLE_CONSERVATIVE_WINDOW_POLICY**. Both native START/port and HTTP proof must exist within authorized host START_PORT→STOP; their arrival order need not match across pipes. Observer REQUEST/RESPONSE and raw handlers reject outside that window. Excluding late arrivals may turn an otherwise valid exchange into INFRA_FAILURE (false negative), but cannot manufacture a positive exchange. Synthetic observer_raw_after_stop confirms rejection plus cleanup of both virtual identities. Real pipe scheduling is NOT_RUN. Missing orphan joins and host cancellation/cleanup findings remain independent and must be fixed.

## Executed evidence and limits

- Node22.23.2, own TMPDIR/cache/output: seven safe original unit files, **166/166 passed**, no failures/skips/todo; invalid-CLI subprocess only. [Unit JSON](safe-unit-r1.json), [log](safe-unit-r1.log).
- Fourteen independent finite adversarial cases plus two own Node signal subprocesses completed. A zero harness exit means the counterexample was reproduced; it is not candidate compliance. Fake Engine/native/preflight/HTTP messages only; fake marker is a path string and creates no external file. All physical mutations target newly created reviewer-owned evidence, never frozen candidate files.
- Original inputs/controller test files were read but not executed because they create host markers outside the assigned reviewer roots. Their Lead evidence remains 180/180; this does not negate the independent counterexamples.
- Independent Acorn inventory: 19 runtime SOURCE_PATHS, 214909 bytes, 12 Node builtins, zero dynamic/unresolved imports; agrees with Lead counts. Literal closure completeness is confirmed. Required host snapshot consumption/profile builtin allowlist are not implemented.
- Current Node, Docker CLI and Claude file digests match all three immutable expected pins. Node alone was executed; Docker image ID/API range/ELF/container isolation/real native HTTP remain NOT_RUN. [Current pins](current-pins.json).
- Input/schema closure, fixed native argv/env, inert module imports, raw/control channel separation, byte caps and failure priority have positive static/unit evidence. Runtime evidence must still establish actual ownership, isolation, lineage, HTTP, cancellation and cleanup.
- Lead reports format/typecheck/lint/build passed and unit underway on the same checkpoint. Those live jobs and resources are disjoint and were neither controlled nor credited as completed fullgates here.

## Manifest binding

- Approved original SPEC SHA-256: `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04`.
- Freeze SHA-256: `48e64f8ec82018db1912cc49619e8fe317fd1fcfcdd3ce98a089d358e6bf27b5`.
- Review contract SHA-256: `0f5bf7863c674d421817e59c6791e192fd035e03360ae9287535c89c2693f223`.
- Original build ABI SHA-256: `b234504c7670cbd33272bd2d49326b6c1f3c386b4da708a374f960b89ed4b659`; additive R2: `a98e401af498740690e9c7b694dc1f2f5f386424b062c9c2c3b283a9af9c11cb`. Neither replaces the SPEC.
- [Input manifest](inputs-manifest.json), SHA-256 `aad53cd0d5ff60ddac3df2a3d5bf0fd7f841e3471440bc1c30613d5965ee51df`, lists the exact 24 source/7 protected pins and all consumed contracts/Lead evidence.
- [Final evidence manifest](manifest.json) binds REPORT.md, result.json, all reviewer scripts/logs/results, and the actual retained scenario files, including deliberately mutated bytes. The manifest excludes itself to avoid a circular digest. Its SHA-256 is returned in the handoff.
- [Before](source-before.json), [after](source-after.json), [machine verdict](result.json), [closure](closure-independent-r1.json), [adversarial cases](adversarial-r1.json), [signal cases](signal-r1.json).

## Reproduction and next action

Executed commands (each script uses exclusive new outputs; preserve this attempt and use a new reviewer-owned subtree for another run):

```sh
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-candidate/node_modules/vitest/vitest.mjs run --config /tmp/cvg-claude100-exec-20261017/ref-port-review-r1/vitest.config.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r1/adversarial.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r1/signal-parent.mjs
TMPDIR=/tmp/cvg-claude100-exec-20261017/ref-port-review-r1/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /tmp/cvg-claude100-exec-20261017/ref-port-review-r1/closure-check.mjs
```

Lead preserves/stops only its owned certification attempt, corrects mandatory findings in an authorized correction round, refreezes/reviews current source and evidence, then reissues appropriate gates before any bounded native launch.

Review is complete; implementation correction, current fullgates and actual positive controls remain open. No catalog117+17/M1 or release credit is granted. Lead owns shared documentation/gate reconciliation.
