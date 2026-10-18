# PAR-Q04-FAULTS-001 — independent review R1

**REVISE — two blocking MF05 findings.** This is a scoped private implementation review, not overall parity, qualification, integration, or release approval. Correction rounds used: 0 of at most 2.

Candidate HEAD `cff0e7c3b1e5b9baa40e0c2c62d398109da0889d`; eight new source files frozen. Copied SPEC0232 read in full and SHA-256 verified: `8f8ecd2934fd3dbfd7b82141efb6a97e2a653782eefe10ef8c177b01a408fe93`. The frozen MF01–MF07 bar was retained. No app, public contract, security schema, source, tests, candidate history, or other session resources were edited. All execution used absolute Node22.23.2, explicit scrubbed children, native loopback HTTP, and reviewer-owned temporary paths. No descendants or commits.

## Blocking findings

### Q04-R1-F01 — actual filesystem primary and cleanup errors are discarded (P2, MF05)

**Confirmed at runtime.** `tests/support/model-fault-server/persistence.js:141` discards the primary exception; lines148–149 discard the close exception. Lines153–156 consequently aggregate replacement messages rather than the actual failures.

Expected: preserve the real primary cause and any cleanup cause together, in primary/cleanup order, including a diagnosable causal chain. Actual: a native exclusive-create collision (`EEXIST`, syscall `open`) becomes a generic cause-free rejection. More decisively, invalidating only a newly-created owned output FD produces real native `EBADF/write` and `EBADF/close`; the returned AggregateError contains only `synthetic persistence rejected` and `synthetic persistence cleanup failed`. Neither has a code, syscall, or cause, and neither native error is retained anywhere in its causal graph.

Reproduction: run the repeatable script `scripts/repro-mf05-causes.mjs` in the raw root below using the documented scrubbed environment. It creates a new own temporary root per run, obtains a recording through real HTTP, delegates real native file opens, closes only its newly-created FD with `closeSync`, and transparently observes/rethrows real `FileHandle.writeFile` and `FileHandle.close` errors. **Exit1 is the failed candidate criterion**, with both actual native errors in the raw log; it is not a harness crash. The reviewer did not replace these errors with fabricated Error objects.

Evidence: `logs/repro-mf05-causes.log`, `logs/persistence-observations.json`, `logs/persist-attempt2.log`. A zero-byte own partial output remains after injected write failure. No crash-atomicity requirement was invented from that observation.

Required correction: retain the actual errors as causes (with safe summaries if necessary), exercise the real persistence/FD boundary in regression tests, and demonstrate this reproducer passing without weakening checks. This stays within private T2 scope.

### Q04-R1-F02 — HTTP lifecycle loses errors before the aggregation utility receives them (P2, MF05)

**Confirmed at runtime, with an explicit cleanup-injection limit.** `tests/support/model-fault-server/index.js:91` ignores the handler exception and line72 creates a fresh cause-free message. The actual close callback at lines275–277 similarly creates a new generic error; server/response/listen wrappers also discard incoming causes.

Expected: the lifecycle retains the actual primary handler error and any cleanup error. Actual: the real native `ServerResponse.writeHead` method, invoked with status−1 through a child-only interposition, throws `RangeError`/`ERR_HTTP_INVALID_STATUS_CODE`. Real request handling catches it, destroys the connection, and `close()` returns only `synthetic fault server: handler failed` without code/cause. All real listener/socket/handler cleanup still completes. A second probe exercises the real close callback branch with an enumerated fake cleanup error after actual successful native closure: both AggregateError members are generic replacements, and neither incoming cause is preserved.

Reproduction: the HTTP half of `scripts/repro-mf05-causes.mjs` fails with exit1. `scripts/probe-http-errors.mjs` separately records primary-only and primary-plus-cleanup behavior. The native RangeError is actual Node behavior; **the cleanup callback error is synthetic, not a demonstrated OS Server.close failure**. Neither probe calls the pure `preservePrimaryError` utility directly. No fetch, timer, or Date mock is installed.

Evidence: `logs/http-error-observations.json`, `logs/http-errors.log`, `logs/repro-mf05-causes.log`. Source locations: index.js lines71–72,90–95,224–225,275–277,302. The existing pure utility test passes, but cannot prove that the lifecycle supplies real errors to that utility.

Required correction: carry incoming errors through the actual HTTP lifecycle and add a boundary regression. Do not alter provider/gateway public mappings or introduce a public configuration/callback surface to fix this private helper.

## What was independently observed

| Criterion | Scoped assessment | Evidence |
| --- | --- | --- |
| MF01 | Pass in executed scope | Existing actual OpenAICompatibleProvider + ModelGateway positive tests rerun for ok-json/chunked-json, with real usage3/2, expected events and attempts; no fetchImpl on the positive path. |
| MF02 | Pass in executed scope | Real provider/gateway failure tests rerun. Direct provider timeout is `timeout`; gateway timer produces existing `cancelled`. Rate limit, disconnect and malformed JSON retain current native mappings. No runtime source edits. |
| MF03 | Pass in executed scope | All seven modes independently recorded/replayed over HTTP against independently spelled expected bytes. Actual read-callback bytes/order/times and complete/aborted outcomes retained. Split UTF-8 application writes end/start C3/A1.13 independently rehashed tamper variants rejected. |
| MF04 | Pass in executed scope | 52 real factory/persistence record/refresh negative calls across13 enumerated fake credential names; zero listen/open calls. Descriptor/getter/unknown option/payload/URL/callback rejection before resources. Exact-wire duplicate prompts/stream keys/extra metadata/reordered JSON/auth duplicates/late headers refused without recording. |
| MF05 | **Fail** | Both findings above. Positive cap/cancel/lifetime cases pass; they do not compensate for lost actual causes. |
| MF06 | Pass for observed boundaries; foreign-UID branch static only | Exclusive0600 canonical output, side-by-side refresh/history preservation, collisions/canonical previous bytes/duplicates/symlinks/hardlinks/FIFO/directory/traversal/writable-child controls and real FD-anchored directory-swap test. Own positive UID/mode observed; different-UID negative unavailable. |
| MF07 | Focal execution pass; independent review REVISE; full general gates Lead pending | Five existing files:212 passed,2 excluded/skipped by name, exit0. The two unchanged static subprocess modes rerun separately with own directories, both exit0. No full/general gate or no-skip certification claim. |

Existing test files: model-fault-server, governed-test-kit, harness-runtimes conformance, consumers-sdk-session, and local-http-providers. The two named exclusions are the positive/negative `actual guarded subprocess` cases: they hardcode `/tmp/cvg-claude100-exec-20261017/q04-builder`, outside reviewer write authority. Their original static `record-probe.js` was run unmodified in finite children with reviewer HOME/TMPDIR/config/cache. This is explicit test selection, not a source/test modification. Neither 212 nor the separate child probes are presented as a complete no-skip unit gate.

Independent record/replay measurements with scheduled80ms per write (record/replay total milliseconds): ok-json91.2/82.5; rate-limit83.6/82.0; timeout90.4/90.0 with no response headers and client abort; disconnect83.6/81.7 with incomplete declared response; invalid-json82.3/81.7 with normal HTTP completion of invalid JSON; chunked-json162.5/161.1; synthetic-sse162.4/161.9. Complete raw callbacks, bytes and recordings are in `logs/record-observations.json`. Scheduled delay fields are not claimed as measured elapsed time. Application write boundaries are not claimed as TCP packet/read boundaries. SSE remains synthetic protocol evidence only.

Independent lifecycle probes: autonomous accepted timeout recording at approximately5s; closing a partially received body; closing during a pending chunk delay; identical repeated close Promise; actual listener refusal after close; zero tracked sockets/timers/handlers and zero extra native handles at child end. Existing tests also exercise partial headers, receiving limits exact/+1 including chunked bodies,32requests/+1, delay100/+1, and128-character ID/+1. Fixed recipes are much smaller than output caps; arbitrary configurable output was not introduced to manufacture exact-cap payloads.

Persistence probe changed the logical `nested` directory to a symlink just before output open. Actual output remained in the parked directory already anchored by FD; redirected `outside` stayed untouched. This is confirmed FD-path containment, not a sandbox against hostile same-UID processes. A synthetic different-UID fixture could not be created: unprivileged chown was denied. UID rejection remains source-inspected, not dynamically proven with a foreign-owned file.

## Evidence integrity and honest limitations

All40 pin occurrences (packet, raw builder archive, copied SPEC,8new sources,9qualified Q03 pins,5runtime recon pins and frozen input metadata, including duplicate entries) matched before and after. All35 approved Q01 source hashes match in the Q04 candidate; only the root approved packet was read, never the active Q01 candidate/process/PG/ports. Q03 remains historically qualified with16gates and38official-verifier artifact hashes. Independently hashing its archived manifest entries found161files, all unchanged; that archive count is distinct from the38official checks.

The full candidate baseline of38,103 tracked/frozen files and its exact git status are unchanged. No source/index/commit mutations. No install, model, remote network, PG, E2E, certify, SBOM, licenses, or broader gates were run. The Lead's active Q01 certification and disjoint docs were left alone.

The limitation of no real OS HTTP-server-close failure remains. The reviewer strengthened evidence with actual native FD-close EBADF and actual HTTP callback/error paths; synthetic callback injection is labeled as such. The source's pure AggregateError test is insufficient because the demonstrated boundary paths discard causes before aggregation.

Two reviewer harness mistakes are preserved: (1) first persistence probe hit EEXIST from its own pre-created fixture directory before reaching the candidate, corrected in a separately saved `probe-persist-r2.mjs`; (2) an initial supplemental metadata assertion confused38official-verifier hashes with161archive files, corrected without changing any artifact. Neither is a candidate finding. A vacuous self-equality assertion in `probe-record.mjs` is preserved and supplies no evidence; explicit state checks and the independent lifecycle probe supply actual closure evidence. No prior script/log was edited to hide an outcome.

## Raw artifacts and handoff

Raw root: `/tmp/cvg-claude100-exec-20261017/q04-review-r1`. `raw-artifacts.json` identifies the frozen archive, SHA-256, contents summary and the standalone content-hash manifest. Archive contents include probe scripts (including the failed first harness), unchanged-source snapshots, all command/result metadata, complete existing-test stdout, expected-red regression output, wire request/response bytes, timing/recording reports, guarded child fixtures, persistence controls and before/after integrity reports. Raw fake hostile sentinels are intentionally nonsecret. Raw logs stay only in the reviewer temporary root; Lead can preserve the archive in its own later evidence action.

Next action: Lead sends Q04-R1-F01/F02 to the private T2 builder, preserves R1 inputs/logs, freezes corrected files and boundary regressions, then requests corrective review within the remaining two-round limit. Full MF07 general gates remain Lead pending. Shared runtime/log/backlog were readonly under this delegation; this report and verdict supply the handoff rather than editing concurrent ledgers. No approval, parity credit, canonical integration or release was granted.
