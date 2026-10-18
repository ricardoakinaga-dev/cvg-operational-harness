# Independent review R1 — SPEC0234

**APPROVE_SCOPED_DIFF** for `b7032f8245fbfbec5570c585518172de9ab7f075` against `f11f762f6a176417a40d2d53bdb67c633d7e1cef`. Mandatory findings: **0**. Initial `cefc3914e26604da92d46a90a809da1b2f9d3367` is preserved and independently checked; its optional-cache gap is resolved in b703. This approves the scoped implementation only. Evidence is sufficient for the scoped review; global acceptance remains pending with Lead certification in progress. No B6/HISO-005 closure, production or integration approval.

SPEC SHA-256: `b33aff4d1d1e36d64dd97298bc73d1c058220776c349e6704478303ef8a9c76d`. Nine-path source set SHA-256 (lexically sorted compact JSON map plus LF): `5d496e70ed318f4b42667d0d7910ebcac32c74a1c9429dbe85351402d853de94`. All nine working files match final freeze; seven are byte-identical to the initial freeze. Root authority and ledgers were read; only review-r1 paths were written.

All fourteen frozen criteria were assessed. ID-01–13 have scoped executable/inspection evidence; ID-14 remains **PARTIAL_GLOBAL_PENDING**. The criterion-by-criterion matrix, confidence, severity, input hashes and exact command records are in [review.json](review.json).

- The 156 unchanged original regressions passed:142boundary and14consumer tests, zero failures/pending. Own Vite cache and temp paths were used; candidate sources were not rewritten.
- 62 independently designed bounded controls pass after two reviewer harness corrections:44filesystem/receipt/CLI,12recipe,3process and3semantic controls. Additional real/default/integrity and historical repro checks are recorded separately.
- Whole default report from f11 equals the final default and strict API report exactly, including graph and diagnostic order:471diagnostics,303installed, `INCOMPLETE`, `exceptionsApplied:false`. SHA of all three serialized reports: `ec23a93fcaf2633a28aa14c26c58a4e24daacef68e12a096f6eb238ffbd55448`.
- Actual mutations exercise MATCH-to-drift and drift-to-MATCH on both evaluated/reference trees. Finalization invalidates earlier result objects and subsequent comparisons; no stale MATCH survives. Other controls cover mid-read bytes, post-collection type/link/receipt changes, canonical receipt/digest strictness, source/config/toolchain validation, hardlink/alias refusal, hidden/unknown files, nested witnesses, FIFO and fixed caps.
- Identical computed forbidden loading remains MATCH plus `INCOMPLETE`. Identical literal product loading remains `FAIL`; drift and exception requests retain their original diagnostics and `verified:false`.
- Actual offline fixture npm succeeds with zero IP syscalls and one Node exec. Private cache tampering/missing required payload/config/source/publication/timeout failures produce no success receipt. A real own listener and sentinel positively validate the network observer. Process count/timeout/output controls kill only owned children, including an observed detached child; unrelated process remains alive.

The full reference R3 was consumed only after Lead's artifact review (`reference-artifact-review-r1.json`, reviewed00:05:29UTC; independent run started00:06:04UTC). Digest: `cd897a3831dbe0713eeb2e251f327dfb55d203149f4c739c76c437b27df43cdf`. Canonical receipt/actual lock and config,298private physical payload SRI hashes and actual strace were inspected independently. The recipe has zero IP syscalls, one Node exec, npm exit0, max2processes,7126ms npm time,60,111,958compressed bytes,1,942,809,600regular bytes,30,969entries, depth12. Its354lock keys reconcile as304present plus50explicit optional absences; `punycode` is reference-only and was not assigned an evaluated MATCH.

Own actual comparison: **303evaluated =302MATCH +1MISMATCH**; all `verified:false`,471diagnostic occurrences, `INCOMPLETE`. The difference in `esbuild/bin/esbuild` is retained: evaluated11,427,952bytes SHA`e1698a3d5c6c0798fee4fd3b5cc816651f460c63d390a7a26ea4beb0b1884100`; reference9,350bytes SHA`183d6ead2dbc3af51aec767d5395f86fe54fbbc2d2aa8e54feb4e31d76a62f7e`. No generated/lifecycle exclusion was applied. Full data: [real-summary.json](real-summary.json), raw compressed baseline/actual reports alongside it.

Opt-in adds five explicit nested edges (5176to5181) and changes diagnostic traversal order. The full diagnostic object multiset, including duplicate occurrences, and `installedLockDrift` remain identical. This satisfies the frozen occurrence/object contract; it does not claim opt-in array-order identity.

Historical finding `R1-HIST-01` (medium, high confidence; ID-05/10/13): frozen cefc opened missing foreign optional payloads unconditionally and failed ENOENT before npm. Own historical control reproduces it. Final b703 records missing optional keys, preserves required-payload refusal and produces the complete real reference. This is resolved, not an open mandatory finding. Original failure R2 and both source freezes remain untouched.

Two failed reviewer controls are preserved: recipe-control expected the later wrapper code `INPUT_MUTATED` but actual source verification correctly refused earlier as `SOURCE_COMMIT_MISMATCH`; the narrow recheck passes. The first full-reference assertion incorrectly required diagnostic array ordering; saved raw outputs were rechecked against the unchanged occurrence/object contract and pass. No source/test expectation in the candidate was changed.

Current fullcert on b703 is Lead-owned, session74676/PID1650702, **IN_PROGRESS**. Certification files are actively rewritten; no prior gate run is substituted. Lead reports a fresh compiled consumer198imports/72runtimeexports/zero net PASS; the critic did not independently repeat that compiled variant. ID-14 still requires the complete current gate results, final source/artifact checks, consumer evidence, normal/strict actual reconciliation and cleanup. These pending obligations are separate from the zero-finding scoped implementation verdict.

| Frozen final path | SHA-256 |
| --- | --- |
| `docs/08_runtime/0803_runbook_gates_locais.md` | `787e651cef9b2c6ed48f8568933097de9ae6249963a2c311eea5e4cedc8564d2` |
| `scripts/boundary-installed-identity.mjs` | `3d282e4f9a54ecd5668fdfb4d9d0e80c9f699b65b4495bfeaf368233b040d5cf` |
| `scripts/boundary-manifests.mjs` | `40cd1375d45e3059e797e0fc41795b71a07dbc529e257ef77572958dc40880e5` |
| `scripts/boundary-reference-process.mjs` | `e5c5cd31404ba865227ae747b0d8e8491138916951a6a1a5287f896837f22ab8` |
| `scripts/build-installed-reference.mjs` | `d2633c9d4710b9776430bf9063ae204180e44d8a71fd1f84a64939829f637075` |
| `scripts/check-product-boundary.mjs` | `6784ac6f671454c815fee042c507c5b863fe3693a588d221af171c0d10940acd` |
| `tests/b6-0234-boundary-integration.test.js` | `fae928a8a0282519d444021c46c9ab7e3567d1255195cecd219b068200471c2b` |
| `tests/b6-0234-installed-identity.test.js` | `ce4feeafbdc2b36a392e34106dafd3b4aadfb2614ea6a4dd59db9ce58b24bddb` |
| `tests/b6-0234-reference-recipe.test.js` | `82aa69be8c2f45498d0353fced08d1cd0a2c431046f29458df9035ed143ca55d` |

Commands, exit codes, timestamps, raw-log hashes, input/source hashes and review harness hashes are in [review.json](review.json); [final-integrity.json](final-integrity.json) records the final guard. Fixtures and failed logs are intentionally retained. All owned control processes ended; no Lead resource was touched. Existing evidence and shared ledgers remain read-only; Lead owns their outcome updates.

Limits: trusted operator and pinned local Node/npm/Git/tar/strace TCB; no hostile-operator proof, package authenticity, semantic safety or kernel sandbox claim. Full-reference construction was Lead's, followed by independent primary-artifact checks and actual comparison. Synthetic recipe sources/cache were privately copied from an existing completed synthetic fixture, retaining existing Git objects to honor the no-commit constraint. No delegation, installs, global gates, PG/Docker/E2E, commit/push, real data/provider or source writes by this critic.
