# SPEC0229 independent review — round 1

**STATIC_REVIEW_ONLY · REVISE_STATIC · Integrated gates pending · No overall approval**

Task: `C100-Q01-QUALIFIER-001`. Candidate: `/tmp/cvg-claude100-exec-20261017/q01-candidate`.
Fresh critic; no implementation edits, descendants, commits, or external messages. The Q03 execution hold remains effective. This review does not approve Q01, M1, parity, production, or `PASS_CURRENT`.

All ten frozen implementation/SPEC/authority hashes match before and after inspection, and the review packet itself is unchanged. See [before pins](pins-before.json), [after pins](pins-after.json), and [structured verdict](verdict.json). Approved SPEC SHA-256: `bb42eb61cbd30c5720b00ef3145d9fdac4196b942eb3c42bff1d94acf4fe8243`; build-authority SHA-256: `4a10488aa3a48bfbd73fcbc1fd5da9ae7fd49b071d713b9e969cf34258ca0564`. The SPEC's historical draft heading is interpreted together with the separate frozen user approval for **local synthetic qualifier mechanism only**.

Read in full: approved SPEC, all eight pinned implementation/declaration/CLI files, build authority, repository constitution, and current CLAUDE100 claim. Existing foundation tests and the Q03 normalizer were inspected read-only. No qualifier/CLI/Q03 import or execution, integrated tests, parser probes, models, network, database, application processes, broader gates or installs were performed. Commands only read/check local artifacts and construct this review's evidence. Python constructed fabricated data recipes; it did not invoke candidate code.

Four P2 findings require correction. P2 means a reproducible contract/availability/evidence defect within the currently local synthetic boundary; no P0/P1 exposure is asserted. All actual-behavior statements below are **static control-flow conclusions**, not runtime observations. The examples identify reachable branches and later executable checks.

## S0229-R1-001 — P2: Repeated attestations amplify a bounded input into tens of GiB of receipt parsing

Location: `tests/claude100/qualification/qualify.mjs:166`; related `tests/claude100/qualification/qualify.mjs:176`, `tests/claude100/qualification/schemas.mjs:251`.

Frozen criteria: CQ02, CQ03. SPEC lines 15, 21, 62. Confidence: HIGH, static only.

**Reachable example.** Use the private `attestation-amplification/` synthetic fixture. Its 162,040-byte manifest repeats captureId `r` 40,000 times. The indexed receipt is valid JSON padded with whitespace to 1,048,576 bytes, with an updated raw digest. The recipe remains fabricated mechanism input. The eventual schema error is intentional; reaching it must not entail 40,000 parses. The source loop implies 41,943,040,000 bytes (39.0625 GiB) of parser input, not measured runtime or physical disk traffic.

**Expected.** Schedule at most the one/two relevant distinct capture receipts; reject an invalid attestation list without work proportional to repetitions times receipt size. Preserve final INVALID_INPUT and documented precedence.

**Actual, from source.** INTEGRITY loops over every unvalidated captureAttestations item and calls checkFile(..., true), reparsing the same receipt 40,000 times. The physical-file cache only deduplicates byte accounting; it does not cache parsing. Uniqueness/cardinality validation runs later at SCHEMAS. This constructs 41,943,040,000 receipt bytes of parser work from a 162,040-byte manifest and one 1 MiB receipt. This is a count derived from source, not a benchmark.

**Impact.** A locally supplied malformed manifest can stall qualification despite nominal file/aggregate caps.

**Proposed remedy.** Bound or deduplicate the preflight receipt schedule before IO/parsing (retaining ordered diagnostics), cache parsed immutable receipt snapshots, and enforce exact attestation cardinality/uniqueness at the schema stage.

**Closure check, pending permission to execute.** An isolated later regression with instrumented receipt reads/parse counts must show a constant small number of parses for a repeated-ID manifest; status INVALID_INPUT, no truncation, unsupported/integrity precedence preserved.

## S0229-R1-002 — P2: Canonical expansion makes valid raw JSON fail as an invalid input during output

Location: `tests/claude100/qualification/safe-io.mjs:274`; related `tests/claude100/qualification/qualify.mjs:423`, `tests/claude100/qualification/qualify.mjs:426`, `tests/claude100/qualification/qualify.mjs:445`.

Frozen criteria: CQ02, CQ04, CQ06, CQ07. SPEC lines 15, 66, 68, 70. Confidence: HIGH, static only.

**Reachable example.** Use `canonical-expansion.json`: an array of 200,000 copies of `1e20`. Raw size is 1,000,001 bytes; CVG-CANON-1 emits each scalar as `100000000000000000000`, giving 4,400,001 bytes. Use identical, fully bound synthetic sides and an empty normalization policy. Both arrays satisfy raw caps. The report normalized descriptors also have a per-item expectedArtifact cap: the remedy must respect that closed contract, rather than merely raise a limit silently.

**Expected.** The raw array is valid, within input limits, finite, depth 1, and has no normalization policy. Equal authenticated sides must be compared completely. Materialize a complete projection within the approved report contract; if output cannot be materialized, classify the output failure INFRA_FAILURE/1 rather than INVALID_INPUT/1.

**Actual, from source.** CVG-CANON-1 expands the 1,000,001-byte array to 4,400,001 bytes. output.write applies the raw MAX_FILE=4 MiB to this generated projection and throws inputError. The main catch preserves that INVALID_INPUT classification. Both equal inputs can therefore be rejected as malformed at COMPARISON solely because output grew.

**Impact.** Admissible numeric JSON produces the wrong terminal error and an unimplemented valid comparison boundary.

**Proposed remedy.** Separate raw-input and generated-output policy/error handling. Materialize the complete canonical stream in bounded parts if supported by the approved normalized-list contract; seek an explicit contract clarification before changing its per-item limit. Never classify comparator-generated output failure as malformed evidence.

**Closure check, pending permission to execute.** After the execution hold is lifted, cover the supplied numeric array on both authenticated sides, validate every output descriptor against the closed report schema, and inject a generated-output limit failure to assert INFRA_FAILURE. No input truncation or dropped values.

## S0229-R1-003 — P2: Authority can expire after its final check and before report emission

Location: `tests/claude100/qualification/qualify.mjs:440`; related `tests/claude100/qualification/qualify.mjs:363`, `tests/claude100/qualification/qualify.mjs:466`, `tests/claude100/qualification/qualify.mjs:479`.

Frozen criteria: CQ06, CQ07. SPEC lines 64, 70. Confidence: HIGH, static only.

**Reachable example.** Start with a completely bound matching synthetic run and an authority that is still future at both checks. Delay one awaited snapshot write/fsync after line 440 until its expiry passes; then let materialization and report output continue. Ordinary slow IO or process scheduling can create this interval; a controlled clock/output hook can make the later regression deterministic.

**Expected.** APPROVED must be unexpired at report emission. The emitted report must be BLOCKED_CVG_SPEC/1 if expiration occurs before emission.

**Actual, from source.** The last currentAuthority() check precedes all input snapshot writes and input-snapshots.json. Those awaited writes and fsyncs can take arbitrary wall time. report.json is then written with MATCH_REQUIRES_REVIEW/0 without another clock/authority check. Thus a receipt that expired during materialization can still authorize a newly emitted match report.

**Impact.** The persisted report can claim a current approved equivalence after its authorization window ended. Local synthetic scope limits current exposure; it still violates the frozen authority boundary.

**Proposed remedy.** Materialize non-final evidence first, then re-evaluate authority at the final report publication boundary and serialize the resulting terminal status. Make the emission/commit instant explicit and apply the rule to all terminal paths that depend on current authority.

**Closure check, pending permission to execute.** Use a controlled clock plus delayed output in the later executable phase: expiration during snapshot writes must yield BLOCKED_CVG_SPEC/1 in both the returned and persisted report; unexpired/null expiration controls retain their expected results.

## S0229-R1-004 — P2: Output or cleanup failure can leave a saved MATCH report while returning INFRA_FAILURE

Location: `tests/claude100/qualification/qualify.mjs:479`; related `tests/claude100/qualification/qualify.mjs:481`, `tests/claude100/qualification/qualify.mjs:489`, `tests/claude100/qualification/safe-io.mjs:295`, `tests/claude100/qualification/safe-io.mjs:315`.

Frozen criteria: CQ06, CQ07. SPEC lines 68, 70, 97. Confidence: HIGH, static only.

**Reachable example.** Use a fully bound matching synthetic run. Inject an IO failure after report.json writeFile has completed, at its fsync/close; alternatively fail the retained output directory close after report output. Neither branch is an untrusted manifest capability: both are ordinary comparator output/cleanup failure cases required by the frozen error contract.

**Expected.** Persisted terminal evidence and the returned/CLI terminal result must agree; incomplete output is visibly a failure and cannot be consumed as a completed match report.

**Actual, from source.** The bytes serialized at line 479 already contain MATCH_REQUIRES_REVIEW/0. A later write sync/close failure reaches line 481, or cleanup reaches line 490, and mutates only the in-memory object to INFRA_FAILURE/1. There is no invalidation, failure completion marker, or persisted status correction. report.json can remain complete valid JSON claiming MATCH even though the CLI returns failure.

**Impact.** A reviewer consuming only the saved report can receive a different verdict from the command that produced it.

**Proposed remedy.** Define an exclusive report publication/completion protocol: stage the terminal report, finish required snapshot/output IO and cleanup, and expose a completed report only when those operations succeeded. Make failure artifacts unmistakably incomplete; verify persisted status and returned status agree for each supported failure path. Do not overwrite prior evidence.

**Closure check, pending permission to execute.** Later controlled fsync/close faults must show INFRA_FAILURE/1 and no completed saved MATCH report, including a failure after report bytes were written; retain the fault and partial artifacts as failure evidence.

## Static coverage and limits

The implementation contains the expected independent capture binding: selected receipt raw hashes are checked, the full manifest-consumed identity/execution/fixture/rule/artifact envelope is compared canonically, identity/artifact-set redundant digests are checked, and RAW_INPUT is tied to fixtureSha256. Authority comes from the separately supplied operator index, with exact scenario/rule binding and pinned SPEC/decision bytes; no fixture bool grants approval. These are static observations, not proof of authenticated real capture or overall correctness.

Closed manifest, side, identity, execution, rule/projection/assertion, receipt, capture-index and authority-index validators were inspected, including required null fields, duplicate/role/order restrictions, timestamps and outcome/exit consistency. Catalog membership/count/class/family checks were inspected; this review does not certify the program catalog's unchanged 134 obligations from a synthetic example. The parser implements strict UTF-8 byte decoding, duplicate-key rejection, finite numbers, string/depth caps and fail-closed hostile-key handling. IO checks regular files and path confinement, uses O_NOFOLLOW/O_NONBLOCK, hashes materialized bytes, deduplicates physical-file byte accounting and creates outputs exclusively. No additional concrete bypass is asserted from this static pass.

Error stages explicitly order integrity, supported wire, schemas, missing reference, captures, authority, execution and comparison, with later checks initially NOT_RUN. The findings above cover resource scheduling, generated-output classification and terminal evidence/authority gaps that remain despite that structure. CLI option parsing is strict over the seven required options and maps usage to exit 2. Its static code never promotes PASS_CURRENT or mutates the catalog.

Normalization forwards to the single Q03 implementation: only enumerated top-level envelope metadata can change; payload/protected fields and full array order are preserved by the inspected code. Q03 was not imported or executed. Its dependency digest is recorded separately in [supplementary inputs](supplementary-inputs.json), outside the frozen ten-pin packet; its current qualification and integrated topology/negative controls remain pending.

| Criterion | Independent status in this phase |
| --- | --- |
| CQ01 | Static partial; no independent executable catalog acceptance |
| CQ02 | Static findings 001/002; parser and IO controls inspected |
| CQ03 | Static finding 001; trust binding inspected |
| CQ04 | Static finding 002; full comparison paths inspected |
| CQ05 | Static partial; Q03/integrated normalization gates pending |
| CQ06 | Static findings 002/003/004; status/precedence/CLI inspected |
| CQ07 | Static findings 002/003/004; hashes/copies/exclusive output inspected |
| CQ08 | NOT_RUN; current integrated candidate gates pending |

Existing builder JSON logs report foundation r4 297 passed tests and parser final 237 passed tests, no failed/pending tests. Those logs were read only, not rerun, and do not establish current integrated acceptance. No runtime claims in this review depend on them.

Private recipes and count/size arithmetic: `/tmp/cvg-claude100-exec-20261017/qualifier-review-r1/static-recipes.json`. No crafted case was run. Cases 003/004 are explicit scheduling/fault recipes for the later executable phase, not reproduced faults.

## Handoff

Review state: **REVISE_STATIC / STATIC_REVIEW_ONLY**, four open P2 findings, no overall approval. Source pins and packet unchanged at the closing check. Only this review evidence directory and the authorized private temporary directory were written; shared coordination, runtime state, execution log, backlog, lead tests and source stayed readonly under the explicit task boundary. This report is the review handoff for the lead's eventual ledger update.

Next action: lead diagnoses and remedies the four findings, freezes revised implementation hashes, and returns within the maximum of two corrective rounds. Execution remains prohibited until the lead explicitly lifts the current Q03 hold. A same-source/new-tests executable phase must first reverify these implementation pins and freeze its additional test, dependency and gate inputs. The critic remains available for that later phase; no background polling or execution has started.

## R1 closeout — correction round 1 handoff

The lead acknowledged all four findings and accepted them for correction round 1. **Source-read phase COMPLETE.** The final ten-pin check in `pins-after.json` and the report were completed before this handoff; the packet and all ten pins matched. No source was reread or mutated for this addendum. The lead may now unfreeze implementation for corrections; those corrected bytes will require a fresh R2 packet. Tests remain disjoint. The execution hold persists.

The proposed bounded/deduplicated receipt schedule and complete projection chunks of at most 4 MiB address the respective static causes without a SPEC/schema change, subject to R2 inspection. Chunk ordering and filenames must let a reviewer reconstruct each complete side without dropped, overlapping or reordered bytes; a generated-output failure must remain INFRA_FAILURE.

The staged-report/exclusive-hardlink approach can provide an unambiguous completion marker, with these concerns to settle before R2:

- **Authority at publication:** checking the clock before an awaited `link()` still leaves a scheduling/IO interval in which authority can expire before the hardlink actually appears. A prebuilt MATCH report must not be linked after that expiry. Freeze the precise authorization/publication linearization rule and demonstrate the delayed-publication case; do not silently reinterpret the approved requirement as validity only when the report was staged. Preparing both terminal report variants can avoid another fallible report write after the final status choice, but does not by itself remove the asynchronous publication interval. R1-003 stays open until the actual boundary satisfies the frozen expiry requirement.
- **No terminal failure after completion:** all required file writes, fsyncs and cleanup that can change the returned status must precede successful publication. Once `report.json` is exclusively linked, no later cleanup/error branch may return INFRA_FAILURE while leaving a completed MATCH report. If directory fsync after linking is considered required for completion, hardlink creation alone is not yet the sole completion boundary; account for that explicitly. Do not claim crash durability that was not required or demonstrated.
- **Confined exclusive publication:** use only comparator-generated staged names in the new confined output, the exact synced/closed inode, and no-replace link semantics. Existing report/evidence must remain untouched; a failed publication leaves only clearly incomplete staging artifacts. Path/parent confinement must remain intact when moving from fd-anchored writes to hardlink publication.

These are implementation/review conditions under the approved contract, not approval of corrected code or a new SPEC/schema. No further source inspection, execution, probes or gates were performed in this closeout. Next review: fresh exact R2 hashes and static inspection, with executable work still awaiting an explicit lift of the Q03 hold.
