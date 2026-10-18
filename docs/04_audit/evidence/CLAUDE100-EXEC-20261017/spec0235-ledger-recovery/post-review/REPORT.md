# C100-Q01-REF-LEDGER-001 — independent post-build review

**REJECT. One mandatory MEDIUM finding remains: LRPOST-01. The composed code is not eligible for the first bounded native run.**

Observed at 2026-10-18T03:28:45.843195+00:00; checkpoint `58f8fb6d7272a3f4b93fc52fb6ccbf3568e91da1`, candidate `/tmp/cvg-claude100-exec-20261017/ref-port-candidate`. One independent post-review, no descendants, no implementation writes or correction rounds. Original C100-Q01-REF-PORT-001 remains **SCOPED_FAILED_QUALITY_BAR / exhausted2of2**, never reset or approved. This recovery consumed its one implementation attempt and reaches scoped FAILED under its frozen stop rule. Lead owns continuity documents.

## Mandatory finding — LRPOST-01

**HOST FAILURE events can be moved outside their referenced control trace while the failure ledger is still accepted.** Confidence HIGH; affects LR02/LR05 and NP07/NP08. Exact finding, source locations, observations and replay paths: [finding-LRPOST-01.json](finding-LRPOST-01.json).

At `report.mjs:53`, control and observer records are merged. The new guard takes its authoritative causes from that merged union at106, then at152 constructs `control-trace-path#ordinal` and compares its spelling to the ledger. It never resolves that reference against the actual control-trace record array or enforces the source/trace partition. A correct ordered union is insufficient to establish the claimed artifact provenance.

Direct current-source counterexample, reproduced after the historical-specimen probes:

1. Execute the frozen current controller with only an in-memory Engine/native peer that emits forbidden auth and refuses cleanup. The authentic report is INFRA_FAILURE/1 with PRIVACY followed by four CLEANUP causes. Confirm the original artifact set is accepted.
2. Move the primary HOST/type FAILURE record at global ordinal24 from control.records to observer.records. Preserve every event byte value and the complete global union chronology. Keep failures.json bytes unchanged.
3. Recompute only control-trace and observer-trace artifact bytes/digests/sizes in a cloned report/retained map. Every supplied artifact hash matches.
4. `assertEvidenceBindings` **accepts**, although `run/control-trace.json#24` no longer resolves in its named artifact. Moving all five events at24,30,31,33,34 is also **accepted**, with all five ledger references unresolved in control-trace.

| Current-source witness | Verifier | Unresolved ledger refs | failures bytes / union |
| --- | --- | --- | --- |
| Primary event relocated | ACCEPTED | 1 | unchanged / unchanged |
| All five events relocated | ACCEPTED | 5 | unchanged / unchanged |

The specimen's driver digest is `a12d7d45ae6bd50eeb877d93c5b29ba51f66414e6ba2fcc82788cfc42190b22e`, generated from current source. The two observations were additionally replayed from complete raw retained-byte bindings: every artifact digest/size matched and both were accepted again. [Current-source observation log](current-source-counterexample.log), [raw replay log](replay-counterexample.log), [reproducer](/tmp/cvg-claude100-exec-20261017/ref-port-ledger-post-review/current-source-counterexample.mjs). Each witness directory contains `raw-bindings-and-replay.json` naming the exact raw overrides and original files; `raw-control-trace.json`/`raw-observer-trace.json` are the actual mutated inputs. Pretty JSON siblings are documentary views, not the hashed retained bytes.

This violates SPEC397–409's contradictory-binding rejection and plan step3/LR02's exact control-trace reference requirement. It is a narrow artifact-ownership/wrong-reference counterexample to the same required ledger invariant. The pre-existing merged lookup weakness remains; this report does not claim the patch newly introduced it. Normal production of the ledger is not shown to be wrong. Status stays INFRA_FAILURE/1; no native escape or false positive terminal status is demonstrated. Nevertheless, terminal failure does not exempt the required audit binding, just as in R3-01.

Future remediation would have to resolve each non-null reference in its actual owning control trace and reject invalid source/trace partitioning, retaining total order, cap exception and partial reports. **No correction is authorized in this recovery, and none was made.** Stop/reassess rather than extending the loop.

## LR01–LR05 direct judgments

| Criterion | Judgment | Evidence and limits |
| --- | --- | --- |
| LR01 — exact R3 mutants | PASS scoped | Direct historical specimen baseline accepts; primary deletion, reversal and duplication now each reject with PROTOCOL. Added tests and current suite agree. |
| LR02 — coverage/shape/enums/order/refs | FAIL | Additional deletion, renumbered deletion/reversal, duplicates, malformed orders, missing/extra fields, unknown enums, wrong path/ordinal and leading-zero ref reject. LRPOST-01 still accepts unresolved owning-artifact refs. |
| LR03 — cap/null suffix | PASS scoped | Combined1024+valid null tail accepts, including multiple consecutive null tail causes;1023/1025, primary/additional null replacement, interleaving, unknown tail enums/fields and65ledger rows reject. No unrecorded tail content/count is attested. |
| LR04 — original regressions / bounded delta | PASS scoped | Independent246/246 tests in12files, zero failures/skips/todo; original228 plus18 additions. Eight additional simulated partial/failed reports bind correctly. Independent scoped lint/format exit0. Exactly two changed source files and33 immutable pins. |
| LR05 — preservation/composed code eligibility | FAIL | All exact inputs/source/seals checked; existing authority applies and previous six findings remain historically resolved within R3 bounds. New mandatory wrong-artifact counterexample prevents code eligibility. No real run or final NP acceptance follows. |

The patch implements reverse cause coverage, unique consecutive ledger order, exact row/data shapes, finite enums, total ordinal chronology and cap1024/null suffix restrictions before terminal-status derivation. It preserves repeated additional causes instead of deduplicating by code and does not sort by rounded offsets. Producer RunState/Error.cause/64-error ceiling are unchanged. Recorded failure ordinal gaps24→30→31→33→34 remain valid. These working properties do not compensate for LRPOST-01.

The direct matrix contains33 artifact-data cases:31 met expectations (29 rejected malformed representations and two accepted valid cap tails); the two trace-relocation cases defeated rejection. Baseline authenticity was checked first. [Matrix summary](direct-probes-v2.log) and its full JSON/private corpus are bound in the final manifest. The current-source witnesses confirm the same defect against newly produced artifacts, not only historical R3 data.

Eight separately generated current-controller simulated reports accepted with expected status: invalid input→INVALID_INPUT, config mismatch→BLOCKED_CONTAINMENT, failed intent write→INFRA_FAILURE, privacy→INFRA_FAILURE, nonzero wrapper→INFRA_FAILURE, privacy+cleanup→INFRA_FAILURE, version mismatch→INVALID_INPUT, clean absence→PORT_NOT_OBSERVED. [Partial controls](partial-controls-v2.log). Unreached checks remain NOT_RUN and recorded causes are preserved; no future evidence is demanded. Original signal/bootstrap/import cancellation and reached-proof regressions are included in the246test run. Sealed R3's conservative physical-drift/post-STOP incomplete-output conclusions are preserved, not upgraded to new real runtime proof.

## RED/GREEN, exact scope and authoritative bindings

Lead's frozen first RED binds parent report SHA `54210b102428b2a06d75dcc4c24682511ba3164afc17931c340b62f2a8b182d0`:46component tests,35PASS/11expectedFAIL before the guard. GREEN246/246 is preserved. This reviewer independently observed246/246/zero skips and scoped ESLint/Prettier exit0 on58f8fb6d; [suite log](focused-suite.log), [machine output](focused-suite.json), [commands](scoped-checks.json). These execution observations concern simulated/local tests only.

Git parent→checkpoint diff changes exactly `report.mjs` and `controller.test.js`; the original controller tests remain unchanged and additions are appended. [Full delta](delta.patch). All35 current pins match freeze, other33 match parent, and worktree status is unchanged before/after. Existing interrupted certification modifications were recorded at entry and preserved; they do not count as current gates or source drift.

[inputs-manifest.json](inputs-manifest.json) SHA `6d2d5ccb2f99c7addb101b61f75c52b4e417cfbe1d482713eb7129ad9e8f9c45` binds frozen source/contracts/Lead evidence. [direct-inputs-manifest.json](direct-inputs-manifest.json) binds historical specimen bytes, simulation helper and local tool entrypoints; it makes no full dependency attestation. [integrity-before.json](integrity-before.json) and [integrity-after.json](integrity-after.json) bind35pins,26frozen inputs and231root proof files. Historical R1 680/680, R2 1259/1259, R3 1309/1309 and design9/9 proof files remain byteexact before/after. Parent source pins are historical and were not rewritten.

| Essential input | Full raw SHA-256 |
| --- | --- |
| Approved SPEC | `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04` |
| Human authority | `74e8ec0ff1e0083ac679db8a20a5eb01776aaed349489c275b2ada81f7fb2fb7` |
| Accepted plan | `c4189d33691327bb74d64fcf6accb3a65638f81ab7c957ada2bedb6118f63b7c` |
| Design REPORT | `376d2114b420c466c7bce0aa13aa886182ee1493bf4b809d8e5cb4888f1e416d` |
| Design result | `c3b436128c67afc8ae4fabb7f2e53bd2a39b437a43311190a23c2df8835d538f` |
| Design manifest | `640b3a8237b788a4f4310742d862fde003f4faa979aa9326bed9a9c16e4d4293` |
| Post-review contract | `0c84aee31290d24152221aacacb93b5e6b113bdc86419298010a7aaa5042f6e7` |
| Recovery freeze | `aa87ab72d0381ed76526908ed8aaee697c795913011a7a861cb9a70ebe30f6fc` |
| Parent R3 freeze | `292d3a2fa40fd196715482c4679172180bab4cd564422822511278a3d39f273f` |
| Parent R3 result | `aa1d8f364d6f202c3a87a8c8c79ae1989b9b157a860e3eef8646fddd21a32876` |
| Parent R3 manifest | `26d9cd8a6881dd3b6a16fcc3f7eb5e2bf8131aad193bbad9b8ea42d3a58834c5` |

The mutable state still has `code_written:false` despite its freeze/checkpoint and implementation-attempt count; this is a continuity-field inconsistency, not authoritative evidence that no implementation occurred. It is recorded separately for Lead. State/coordination are not frozen authority inputs. No actor/resource liveness was independently inferred from these documents. Original PG absence and stop-wrapper failure were read from the preserved closure record, not reexecuted.

Two reviewer measurement failures are retained honestly: the initial direct-matrix serializer attempted `.filter` on a deliberately non-array ledger; a separate fresh corpus fixed only that recorder. The initial partial-report harness created0755 evidence roots, correctly refused before initialization; fresh0700 roots measured the intended cases. Scripts, failed logs and initial outputs remain sealed. No candidate source or test was corrected and no failed observation was deleted. [Procedure status](procedure-status.json) distinguishes procedure completion from compliance; an observation runner's exit0 is not candidate PASS.

## Composed eligibility and stop

The exact original human SPEC authority remains applicable and unchanged. R3 closed the other six original counterexamples within its preserved test bounds, and the two-file delta now rejects the three original ledger mutants. But the exact reference invariant is still defeated by LRPOST-01 on current source. Therefore **boundedLaunchEligible=false; no first contained native execution is eligible from this code review**. This judgment grants no new authority and does not reset the original failed unit.

**Actual native/reference-container positive controls, final NP01–NP10, full gates, M1 and catalog qualification: NOT_RUN. Functional catalog credit: NONE.** No Docker, HTTP/network, original valid CLI, selected native, observer/client mains, account/model, installation, lock mutation, PG/full gates, descendants, push/deploy or resource control occurred. The original usage-invalid CLI test and copied inert-controller entry tests stayed within the expressly permitted suite.

One implementation and this one post-review are consumed; zero code corrections remain preauthorized. Lead's next action is to record scoped recovery failure and explicitly reassess the mandatory invariant defect while preserving all seals. No further implementation, native/gate launch or integration follows automatically.
