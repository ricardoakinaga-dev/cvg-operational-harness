REVISE — one mandatory P1 (R1-01), within the ten frozen criteria.

The new settlement hypothesis is material and retains all23 historical cases, the12 source positives,11 OPEN edges and the full487+22 goal. All nine frozen inputs match their sizes and SHA-256 before and after review. The15 executable-control inputs, eight source inputs and285 sealed historical entries also match. The full1,477,793,024-byte ELF matches SHA-256 5cce726469af232c080355eff2a49ded7b6fbe26eaf7a702e6e15ce3e89f2605 and the terminal release-387a2e8a4c records. These are identity checks, without executing verifiers, helpers or the ELF.

R1-01: a response received before its own request can settle that request. The new [driver](../driver.py) records messages_seen_before_write at lines74–77 but lines86–95 accept the result of drain and select its first matching historical frame without checking the lower bound. The sealed [Capture](../../keyless-cli-probe/driver.py) searches its entire message history at lines129–133. Its unchanged validate_frames at lines204–220 checks the final typed ID set and cardinality, without checking when each request was written.

Concrete counterexample, derived from source and represented only as data:

- Write initialize alone. The first stdout read contains the initialize response, all12 exact typed source-ID empty-list results, and the final barrier response.
- The peer remains open, consumes the subsequent13 stdin writes without returning further responses, and exits0 after EOF.
- Each later write records14 messages already seen. drain can return its matching cached frame after an otherwise empty select. Every response has the right type, value and result; final global validation sees exactly14 unique expected IDs.
- The driver can therefore record14 settlements and EOF success even though13 responses preceded their own requests. All response_frame_index values remain below messages_seen_before_next_write, and the final response is below the14-message EOF count. The missing constraint is the response's lower bound at its own write.

The evidence contains all14 hypothetical ledger rows and raw hypothetical NDJSON, clearly marked as a source-derived counterexample rather than runtime output. No target, helper or copied helper function was executed. No claim is made that the pinned ELF actually emits this sequence.

One grouped HOW repair is required in the new lane. Reject pre-existing replies as settlements, check newly observed response frames against sent/pending typed IDs before advancing, and require both request-own-write and next-write/EOF bounds in the independent reconstruction. At minimum, response_frame_index must not precede messages_seen_before_own_write; that lower bound must accompany the upper bound already described. Reject premature future source/control responses before the next send. Preserve the sealed Capture and final validate_frames unchanged. Add data controls for a premature source response, premature barrier and a valid response after its write with an interleaved notification. Freeze the repaired controls for R2; do not spend runtime to demonstrate this counterexample.

Criterion disposition:

- C01 PASS: material EOF hypothesis; prior budget and285 historical entries preserved.
- C02 PASS: exact23 case objects;12 positive and11 deferred edges; full goal retained.
- C03 FAIL: cached pre-write responses can count as settlements;0/empty string/i64/2p53 exact typing otherwise sound.
- C04 PASS for final typed cardinality and missing/error/unknown/late/duplicate rejection, subject to the C03 ordering failure.
- C05 FAIL: the ledger exposes the lower-bound violation, but the driver does not enforce it.
- C06 PASS: readonly base/nonmain reuse, prefix-only runner diff, unchanged guard, five-input gate,15-control/eight-source chain and387a identity checked.
- C07 PASS for the static containment design; fresh actual kernel/resource/namespace/cleanup proof remains required at launch.
- C08 PASS as data-only:18 recorded controls and no actual IO proof; the additional counterexample is also data-only.
- C09 PASS: new1runtime/0retries/2reviews/1rework budget retained; old budget remains exhausted.
- C10 PASS: fixtures only, no full-i64/edge/platform/SDK/CVG parity or receipts; SPEC0231 e3af1f7f421e45f430d57c25702cae2aeed6bc248f12e053c066040cc5aee4af remains human-pending without a repeated question.

The Lead's newly completed post-reader is outside the nine frozen R1 inputs and was not inspected or granted approval. Its described next-write upper bound alone does not reject this counterexample. Reported preparation headroom is not a substitute for fresh launch gates.

Remaining budget after R1: one grouped HOW rework, one last HOW review (R2), one unspent runtime attempt and zero retries. After R2 approval, the Lead must independently recompute runtime evidence. Previous lossless-wire budget remains0 runtime/0 reviews. No new target execution is accepted by this verdict.

Only review.json, report.md and evidence.json are written. Shared ledgers and coordination are left to the Lead's disjoint continuity lane under the existing delegated claim. The Markdown uses paragraphs and bullets without tables; evidence.json hashes the final report bytes.
