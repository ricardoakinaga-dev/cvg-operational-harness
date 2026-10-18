# PAR-Q04-FAULTS-001 — independent corrective review R2

**APPROVE_SCOPED_IMPLEMENTATION.** Both R1 MF05 blockers are resolved with current boundary evidence. No new blocking findings. This approves only the private T2 implementation (MF01–MF06 and bounded focal MF07). **Full general MF07 remains Lead pending; no overall parity, release, qualification, canonical integration, or production approval.** Correction1 of at most2; this reviewer made no implementation changes.

Candidate HEAD `cff0e7c3b1e5b9baa40e0c2c62d398109da0889d`, nine new source files frozen by the23-pin R2 packet. Copied SPEC0232 remains exactly `8f8ecd2934fd3dbfd7b82141efb6a97e2a653782eefe10ef8c177b01a408fe93`; the R1 full SPEC reading and frozen acceptance bar remain applicable. Source review covered the complete correction diff and new static cause child. No source/test/contract/runtime/security-schema edits, agents, commits, installs, PG, E2E, certify, SBOM/licenses, model or external network.

## Closed R1 findings

| Finding | Boundary evidence | Resolution |
| --- | --- | --- |
| Q04-R1-F01, persistence.js:141 and cleanup handling | Byte-identical original red reproducer now exits0; genuine native EEXIST/open, EBADF/write and EBADF/close preserved. Independent multi-FD probe exercises three real cleanup errors in each of primary-plus-cleanup and cleanup-only cases. | Confirmed resolved. Original error identities remain in causal chains; primary is the AggregateError causal root; every close cause remains in stable reverse-FD order. |
| Q04-R1-F02, index.js:71/94 and listen/close wrappers | Native writeHead RangeError retained through actual HTTP handling; additional native EADDRINUSE retained through actual listen rejection on an own occupied loopback port. A synthetic callback error is injected only after successful real native HTTP closure. Recursive live assertions verify original primary/cleanup identities and ordered aggregate members, with zero owned resources. | Confirmed resolved. Fixed state/public messages coexist with preserved actual Error.cause. The callback injection is explicitly synthetic, not an OS HTTP-close failure. |

The original `repro-mf05-causes.mjs` was copied byte-for-byte from sealed R1 and executed without assertion changes against the same candidate path. Only its separate common configuration helper's own output-root constant changed from R1 to R2. Original exit1 and original raw archive remain untouched. R2 exit0 proves closure of the unchanged failed checks rather than replacing the tests. `original-reproducer-copy.json` records exact hashes; `logs/original-reproducer.log` contains current native errors and complete causal output.

The new source `cause-probe.js` was reviewed and executed both through the exact test and directly. It delegates native filesystem/HTTP operations, uses only owned FDs and loopback, and joins actual closure. It does not call only a pure aggregation utility. Additional reviewer probes independently strengthen it: three FD close failures are retained in order in two distinct failure modes, and native listen failure is observed directly. Expected hostile `clientError` remains an input rejection; its raw packet is not retained or promoted to an internal primary error.

## Current execution

**614/614 existing tests across11files, zero skips/failures/pending, exit0.** This contains all602 tests from the exact10-file packet plus12existing `local-http-providers` tests. Both former hardcoded-path exclusions now run as exact source tests; there is no test-name filter, source rewrite, or skip. Temp roots use own TMPDIR and are cleaned by the tested portable child lifecycle. Full stdout and machine-readable results: `logs/focal.log`, `logs/focal-results.json`; runner/commands are frozen beside them. Focal lint and format also exit0. Project typecheck and other full general gates were not run by this reviewer.

All14 finite review invocations exited0. Execution uses absolute Node22.23.2 and explicit scrubbed HOME/TMPDIR/config/cache; no host credential values enter child configuration. Native fault injections and fixed fake sentinels are synthetic test inputs only.

| Criterion | R2 observed result |
| --- | --- |
| MF01 | Actual native OpenAICompatibleProvider and ModelGateway good/chunked execution, expected usage3/2, one attempt and real events; no fetchImpl on the positive path. |
| MF02 | Public provider/gateway errors remain native. Direct timeout is `timeout`; gateway timer remains `cancelled`. Rate-limit, disconnect and malformed JSON mappings preserved. |
| MF03 | All7 real HTTP record/replay scenarios checked against independently spelled bytes. Application UTF-8 C3/A1 write split, callback ordering, real termination and monotonic timings retained.13 rehashed mutations refused. SSE synthetic only. |
| MF04 | 52 negative actual guard calls (13fake names × factory/persistence × record/refresh), zero open/listen calls. Descriptor/unknown-field/URL/callback/cap tests plus exact-wire duplicate/hidden prompt/auth/header controls rerun without recording hostile content. |
| MF05 | Original red now green; true native FD/handler/listen causes retained; all multi-FD close causes ordered; real listener/socket/timer/handler closure and cancellation/lifetime cases pass. No extra native handles after the lifetime child. |
| MF06 | Exclusive0600 canonical persistence, sibling refresh and old-byte preservation, previous-byte/duplicate/whitespace controls, collisions, symlink/hardlink/FIFO/directory/traversal/writable-child rejection. Real directory-to-symlink swap writes only into the previously FD-anchored parked directory. Different-UID negative remains static-only. |
| MF07 | Independent scoped review approved,614 no-skip focal tests and focal lint/format green. Full repository/PG/E2E/certify and remaining general gates are exclusively Lead pending. |

With scheduled80ms per application write, record/replay total times in milliseconds were: ok-json89.8/82.1; rate-limit83.3/81.8; timeout91.5/90.0 (client abort, no response headers); disconnect83.7/81.6; invalid-json82.3/81.9 (normal HTTP end of invalid JSON); chunked-json161.9/161.7; synthetic-sse162.0/161.5. Complete read callback bytes/order/times are retained in `logs/record-observations.json`. Scheduled delays are not claimed as precise wall-clock intervals, and application write boundaries are not TCP packet/read boundaries.

## Integrity and limitations

All23 packet pins and42 expanded pin occurrences match before/after. The whole candidate baseline of38,104 tracked/frozen files and exact git status are unchanged. All35 approved Q01 comparator sources match in Q04; no Q01 candidate or resources were accessed. Q03's161 archived evidence files match; its historical16gates/38official-verifier hashes remain distinct from the archive file count. All93 regular R1 raw files listed by its manifest still match, as do the sealed R1 archive and original reproducer. R1 artifacts are readonly and were not rewritten.

No actual OS HTTP `Server.close` failure was induced. The HTTP cleanup failure is a clearly labeled synthetic callback after actual successful closure; real OS FD close failures and native handler/listen failures provide additional genuine error evidence. This is sufficient for the scoped cause-preservation contract, not a claim about every possible OS failure.

Different-UID rejection is source-inspected only. R1's own unprivileged chown attempt was denied; R2 did not retry it. Current owned UID/private mode and regular-file/no-follow/FD anchoring were checked dynamically. No hostile same-UID sandbox or crash-atomicity guarantee is claimed.

One legacy observer metadata limitation is preserved honestly: copied `probe-http-errors.mjs` checks only a shallow error identity level and reports false dual-case identity booleans once wrappers use nested `Error.cause`. Its complete causal JSON shows the retained errors. The unchanged original red reproducer and new `probe-http-causal-order.mjs` perform live recursive identity/order assertions and pass; the source's static cause child independently passes those checks. These shallow flags are not candidate failures, and were not edited to manufacture green metadata. The copied persistence observer's UID-denial note is inherited from R1, not a new R2 chown attempt. A copied record observer has a vacuous self-equality assertion; it contributes no evidence, while separate concrete resource assertions pass. No current execution/harness crash or mistarget occurred. Prior R1 harness failures remain sealed.

The Lead/user reports Q01 general certification completed16PASS/38official hashes; this review neither reran Q01 nor transfers that qualification to Q04. Full MF07 remains separate.

## Artifacts and next action

Raw root: `/tmp/cvg-claude100-exec-20261017/q04-review-r2`. `raw-artifacts.json` identifies the frozen SHA-256 archive and standalone content manifest. Contents include all scripts (original red unchanged, copied R1 observers and new causal-order/multi-FD/listen probes), current commands/results, all614test stdout/JSON, native error and timing reports, synthetic wire/record/persistence inputs, exact9source/SPEC snapshots, complete before/after source/pin hashes, R1 preservation proof and report/verdict snapshots. Raw data stays only in this new reviewer temp root; Lead can preserve its archive later. No old area was modified.

Next action: Lead freezes/checkpoints these approved9source bytes, then runs its own full MF07 general qualification under its separate resource claim. This report/verdict supply shared runtime/log/backlog continuity by handoff, without editing concurrent ledgers. No further corrective implementation is required by this review.
