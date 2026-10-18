APPROVE_BOUNDED_SETTLED_SOURCE_ID_HOW — R2, the second and last HOW review. R1-01 is closed; no mandatory findings remain under the same ten criteria.

The repair now excludes replies received before their own requests. The new [driver](../driver.py) checks the response prefix before each write and after drain (lines110,129), rejecting future/unwritten IDs, duplicate responses, server requests and ambiguous envelopes. It validates the exact typed response and records a settlement only after requiring both response_frame_index >= messages_seen_before_own_write and response_frame_byte_start >= stdout_bytes_seen_before_own_write (lines67–84,130–140). The byte bound also rejects a partial response frame already received before the write. The pinned Capture and final validate_frames remain unchanged.

The frozen [post-reader](../verify-observations.py) reconstructs exact request NDJSON, flush/delivery ledgers, typed14-response order and raw frame offsets. Lines161–188 check the own-write message/byte lower bounds, next-write/EOF message upper bounds and only-already-written IDs in each observed response prefix. All14 settlements must precede EOF. The source-positive result must be the exact empty-list fixture result.

The original R1 cached14-response trace would now fail both the prefix and own-write message bound:13 replies have unwritten IDs at initialization and13 frame indices precede their own write prefix. Independent data arithmetic also confirms that a partial prewrite frame can pass the message bound but fails the new byte bound, while a valid response with an interleaved notification satisfies both bounds. These conclusions come from source/data inspection; no driver, Capture, post-reader, verifier or ELF was imported or executed.

Integrity and scope checks:

- All15 R2 frozen inputs match size/SHA-256 before and after review.
- All nine original R1 inputs match the archive map and original R1 freeze; the extra pre-rework post-reader copy also matches. R1 review/evidence/report remain intact.
- All285 sealed previous-unit entries,15 executable-control identities and eight source identities match. The full1,477,793,024-byte ELF matches SHA-256 5cce726469af232c080355eff2a49ded7b6fbe26eaf7a702e6e15ce3e89f2605 and the same terminal387a build identity.
- All23 case objects are exact;12 source positives remain mandatory and11 edges remain OPEN_NOT_EXECUTED. Runner, guard and readonly base Capture retain their R1 identities; the parent-runner difference remains only the attempt prefix.
- The26 recorded pure-data controls retain the original18 exactly and add eight ordering cases. Their recorded0Popen/noBase/noELF results are data evidence; the critic did not rerun these helpers and grants no actual IO credit.

All ten criteria pass for the bounded HOW. C05, C07 and C08 remain explicitly static/design/data assessments: actual IO and fresh kernel/resource/namespace/cleanup evidence can only come from the authorized future attempt. The unchanged runner retains the five-input gate and executable/source chain, actual cgroup checks, offline readonly namespaces, clear environment, collector outside target writable mounts, resource/deadline/output/storage bounds, reserves and first-cause preservation.

The approval is limited to the current frozen HOW. Gate status remains NOT_APPROVED_DO_NOT_EXECUTE until the Lead records hash-bound acceptance and rechecks fresh launch resources. The Lead must independently recompute the actual runtime using the frozen post-reader. No runtime has been performed or approved as successful by this review.

Budget after R2: two reviews used, zero reviews left; one grouped rework used, zero left; runtime0of1, one unspent attempt, zero retries. The old unit remains0 runtime/0 reviews. No third review or automatic budget reset is granted.

This is not native CVG BUILD, a parity receipt, normalization authority or a full-i64 grammar claim. The487+22 goal,49cards,22families and CQ01–14 remain open. SPEC0231 e3af1f7f421e45f430d57c25702cae2aeed6bc248f12e053c066040cc5aee4af remains human-pending without a repeated question. The log-source-recon/SQLite appendix is outside the freeze, was not evaluated here and inherits neither approval nor absence proof.

Only review-r2/review.json, report.md and evidence.json are written. Shared continuity remains with the Lead. This report uses finalized plain paragraphs and bullets before its hash is stored in evidence.json.
