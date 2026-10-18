# C100-Q01-REF-ORIGIN-001 — independent recovery design review

**ACCEPT_RECOVERY_DESIGN. Zero blocking design findings.** The proposed physical partition plus actual owning-document resolution is a sufficient narrow design response to LRPOST-01. This is a reasoned design judgment, not executed proof or code approval.

Observed at 2026-10-18T03:35:57.909110+00:00. Candidate read only: `/tmp/cvg-claude100-exec-20261017/ref-port-candidate`, checkpoint `58f8fb6d7272a3f4b93fc52fb6ccbf3568e91da1`. No source changes, executable target imports, tests, native execution, resources or descendants in this review. Original BUILD235 remains FAILED/exhausted2of2; ledger recovery remains FAILED/exhaustedoneattempt. Neither budget/verdict is reset. **LRPOST-01 remains mandatory and unresolved against current58f bytes.**

## Authoritative bindings and authority judgment

[inputs-manifest.json](inputs-manifest.json), raw SHA-256 `2c25f376bd5cb090fff598ad2f8289124edcd8725788dfe6cfb29e4fa17697ad`, records exact source, contracts and authority paths/sizes/digests. It binds all28source/sevenprotected pins to58f. [static-observations.json](static-observations.json) binds directly inspected sealed witnesses and source text locations. Mutable continuity state/coordination are recorded separately, not substituted for frozen authority.

| Essential input | Full raw SHA-256 |
| --- | --- |
| ORIGIN plan | `1ef462d66080cdce3eb414fa83e008669f6d8706c838199412ec257c8aadd90a` |
| Exact approved SPEC235 | `aaa12b3ee55021e357fc9a17518316135eb4ca423b87215af754cd18dbb41f04` |
| Existing human authority | `74e8ec0ff1e0083ac679db8a20a5eb01776aaed349489c275b2ada81f7fb2fb7` |
| 58f source freeze | `aa87ab72d0381ed76526908ed8aaee697c795913011a7a861cb9a70ebe30f6fc` |
| Parent post-review REPORT | `41656abbe674c7697c9d56b05f3896b6604e3690d49e90cc5cc4cfef434a3a2a` |
| Parent post-review result | `b368c411ace63fb340f4a9709e7ead4d2e732a166e51c1838b3263934e2191b5` |
| Parent post-review manifest | `442e629953b56baea475d73a9adc2fd53cd707f2d1a97508bf6d59e53c8f14e3` |
| LRPOST-01 finding | `4dccb7de45c8aecdce012ae7ff0b488a9f94b24b7d2c03c473c0e6f529d503ca` |

Plan digest matches the recorded ORIGIN state. The human authority still names the exact SPEC SHA above and the explicit answer “Aprovar BUILD local da SPEC0235.” SPEC397–409/418–423 already requires rejecting contradictory bindings and preserving chronological primary/additional causes. Owning-file resolution enforces that existing obligation; it adds no public schema, capability, provider, identity/profile/toolchain, permission or material product/security decision. Existing T3 authority remains applicable. No new grant is inferred or required for this local invariant.

This is explicit diagnosis/replanning requested after stopping the failed ledger unit: a named ORIGIN task, different concrete HOW, accepted design prerequisite, exactly two candidate files and a separate finite attempt budget. The plan does not relabel either failed unit as passed or silently renew their budgets. The stale ledger `code_written:false` metadata has been corrected to true while status remains FAILED; historical review snapshots remain sealed rather than rewritten. Lead alone owns central docs/continuity changes. Review claim and closure are confined to the authorized output roots.

## Critique of physical partition and owning-document resolution

**The diagnosis is correct.** Current `report.mjs:53` merges both record arrays before identifying causes at106; at152 it compares a constructed control path without establishing actual document membership. The parent post-review's current-source witnesses preserve ledger bytes and global union yet move one/five HOST FAILURE events to observer.records. Their references no longer resolve in control.records while the current verifier accepts. Existing sealed raw files and replay results were read and hash-checked here; no replay was executed.

**Physical ownership before union closes the relocation route by design.** Require both `.records` values to be arrays; validate every record in the actual documents before combining them. In control, the allowed outer pairs are HOST/non-FRAME or client/FRAME. In observer, only observer/FRAME is allowed. This matches static producer text: `RunState.failure` records HOST/FAILURE; `capture` records role-specific FRAME; `persistReport` writes source!=observer to control and source=observer to observer. The inspected authentic specimen has HOST records and six client FRAMEs in control, and five observer FRAMEs in observer. The two rejected parent witnesses add respectively one/five HOST FAILUREs to observer. The proposed predicate excludes those placements without changing authentic data.

These are positive document-membership requirements, not a normalizer: reject a foreign/malformed record; never drop, relabel, move or reserialize it to make the partition fit. Use outer `record.source` and `record.type`, not `failure.data.source`: a genuine DOCKER/CLIENT/OBSERVER-origin failure is still a HOST/FAILURE record with its origin in closed data fields. Existing frame parsing/role/sequence bindings remain required. No requirement for new event-type enums or a producer change is introduced.

**Actual owning-document resolution is an essential second part.** Derive the complete authoritative cause sequence only from the physical control.records, ordered by protected global ordinal. For each non-null row, require the exact control artifact path/canonical ordinal and resolve to that specific HOST/FAILURE in that actual array with identical closed code/source/phase/order data. A correctly spelled `control-trace#24` does not suffice when24 exists only in observer. Naming observer instead must also reject. Keep existing unique artifact-role/path bindings and global ordinal uniqueness so a reference cannot ambiguously resolve. Do not fall back to the union, another artifact, numeric coercion of a noncanonical fragment or a first unrelated match.

The two obligations complement each other: physical partition rejects a valid-looking event in the wrong file, including client/observer FRAME relocations; explicit resolution proves that the named control document actually contains the referenced cause. They address LRPOST-01 without relying solely on merged set equality. “Physical” here means membership in retained trace documents, not a new OS-process or cryptographic-origin attestation.

## Preservation of the existing invariants

**Chronology and full recorded coverage.** After physical validation, retain the merged stream solely for its existing total-order/monotonic checks and combined count. Global ordinals stay unique and consecutive across roles; duplicate ordinals remain invalid. Derive cause order using those original ordinals, not concatenation, per-role sequence or newly assigned local positions. Rounded equal offsetMs does not permit a different primary or source-based reorder. All control HOST FAILURE events must occur exactly once as the ledger's non-null prefix; orders stay0..n-1, even though their global ordinals have gaps. All four CLEANUP additions remain distinct causes; do not deduplicate matching code/source/phase tuples. Closed row/data shape, finite enums and terminal precedence remain unchanged.

**Cap/null suffix.** Keep the1024 cap on the combined, validated control+observer record count, including nonfailure records. It is not a cap on control alone or on failures alone. Null references are legal only at exactly1024 and only after every physically recorded cause is represented, with consecutive order/finite sanitized fields and the unchanged64-error producer ceiling. Null cannot replace primary/additional causes or interleave with subsequent references. A cap reached before any recorded failure can still yield an all-null failure suffix. The plan correctly retains the limitation that unseen tail content/count is not attested. The existing synthetic HOST/non-FRAME cap filler remains compatible with the positive partition; do not silently discard it or reinterpret it as runtime evidence.

**Valid partial/failed reports.** Empty record arrays for unreached roles remain valid; partition checks do not require READY, native execution, future frames or future durable intents. Preserve original input/config/intent-write/privacy/wrapper/cleanup/version/clean-absence reports and their actual FAIL/NOT_RUN statuses. Negative terminal status must still validate every reached PASS and all available ledger references; do not downgrade honest PASS checks to bypass it. Incoherent drift/post-STOP cases may leave partial files and exit1 without a published report. No new complete-report requirement or forced publication is justified. Producer/Error.cause, normal invocation and publication behavior remain unchanged.

## Acceptance and bounded budget critique

OR01 directly retains both exact current-source relocation witnesses with their unchanged ledger/union and rehashed trace artifacts, plus the genuine accepting simulated control. Rejection must demonstrate physical/document binding, not merely a stale hash. OR02 adds both directions of client/observer FRAME relocation, wrong owning artifact and duplicate global ordinal; this tests the broader physical-partition rule rather than special-casing failure24.

OR03 preserves the prior246tests and33case matrix:29malformed rejects and two valid cap tails must retain their expected outcomes, while the two former origin acceptances must now reject. It explicitly retains partial statuses, signals and cap/null cases; no required expectation is weakened. Historical246/246 evidence remains evidence of failed58f, not qualification of an unimplemented new source.

OR04 requires frozen-parent RED before the new guard, then GREEN/scoped lint+format, exactly `report.mjs` plus `controller.test.js`,33other pins unchanged, and a new source freeze. Source/driver digests naturally change; old receipts cannot transfer automatically. Any source edit after freeze invalidates the intended post-review input.

OR05 preserves a separate independent post-review of the composed code under the same authority and prior bounded findings. This design acceptance does not clear the code blocker, make a native launch eligible or execute gates. Later real probe/gates remain contingent on direct code review actually clearing all mandatory findings and the original operational prerequisites/resource claim. No real resource is started or resumed now.

**Budget:** after accepted design, at most one narrowly bounded implementation and one independent post-review; zero subsequent code correction rounds preauthorized. A mandatory post-review finding ends ORIGIN as scoped FAILED and requires an explicit stop/reassessment. BUILD235's2of2 and ledger'soneattempt remain exhausted. This is the explicitly requested replanning, not an automatic third correction or renewal of a prior loop.

## Procedures, evidence status and preservation

Only local text/JSON reading and Python stdlib full raw hashing/grouping were performed. No candidate module or test was imported/executed. Static reasoning about the proposed predicates is not a positive test result. Initial seal collection stopped on the different incomplete-cert manifest schema; the final collector hashes that tree as raw files and reads only actual review evidence arrays. No target ran and no historical proof was changed.

All35 candidate pins match58f, with33outside the proposed delta remaining immutable. Candidate HEAD was read through Git metadata files without invoking Git or a target CLI. Historical evidence checks: R1 680/680, R2 1259/1259, R3 1309/1309, ledger-design9/9 and ledger-post-review1363/1363 MATCH. All259root files in those review/incomplete-cert trees are before/after bound. [integrity-before.json](integrity-before.json) and [integrity-after.json](integrity-after.json) record preservation. The corrected continuity metadata is outside parent seals and grants no authority. Existing PG absence was read from its historical record; no liveness or resource observation was reissued.

**Positive controls executed: 0. Actual positive controls, candidate tests, native/reference containers, full gates, final NP01–NP10, M1 and catalog qualification: NOT_RUN. Functional catalog credit: NONE.** No code/resource/network/account/model actions or descendants occurred. No code/native/gate/parity/release approval is issued.

Blocking findings for this design: **none**. Current58f remains code-rejected with LRPOST-01 open. Lead's single next action under this accepted explicit replan is the one bounded two-file implementation with preserved RED/GREEN, a new freeze and one independent post-review; no correction or native/gate eligibility is assumed.
