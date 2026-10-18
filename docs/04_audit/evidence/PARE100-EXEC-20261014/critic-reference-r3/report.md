# Independent static review — critic-ref-r3

**Scoped verdict: FAIL.** Two source-backed library gaps remain: JSON extraction can serialize literal implementation code, and the exported live validator does not bind supplied source bytes back to the pinned tree. This is a static verdict on the frozen helper only, not executable verification, parity, release, or acceptance of the 36-card program.

## Scope and integrity

- Authorized writes and claim: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-ref-r3-result/**`; see `claim.json`.
- Direct artifacts: script (1432 lines), tests (760 lines), SPEC0209 (20 lines), all read as text. SPEC0209 lines 10–14 supply the metadata-only, pin/drift, UNKNOWN and freeze requirements.
- Allowed governance only: AGENTS constitution, coordination rules and ADR010. No worktree implementation/history or shared-ledger edits. The narrower user instruction controls this lane.
- Sentinel SHA-256 before **and after**: `a62b1d4857611c82e4eed0801b232656ef902699fbce0b5859e0f26071696f76` — MATCH. All six file hashes and the exact packet file set match before/after; no packet symlinks found. Evidence: `integrity-before.json`, `integrity-after.json`.
- The three packet evidence JSON files were **hash only**; no builder/Lead reports or claimed test results were consumed.

| Packet path | SHA-256 | Inspection |
| --- | --- | --- |
| `docs/02_spec/0209_pare100_reference_catalog.md` | `6183bb50a4e9711fe13b21a3f97601d3c94dab2de46eb4a10d5328fc58871b94` | Direct static content |
| `docs/04_audit/evidence/PARE100-EXEC-20261014/lead/reference-r3-focused.json` | `dcaab7aa687173b0662619648a00245c490bbbfacd9448a7e3eab5aa194a6000` | Hash only |
| `docs/04_audit/evidence/PARE100-EXEC-20261014/lead/reference-r3-freeze.json` | `791ac6c0113403f955785e33ae4e04273b679d87e81a3104c33f3e1477256fcd` | Hash only |
| `docs/04_audit/evidence/PARE100-EXEC-20261014/reference/r2/catalog-summary.json` | `5e64d8f89c8ffc54b1b5ba5d015d3f80dfaf2962c5df3051e20ace3a099335c1` | Hash only |
| `scripts/reference-contract-catalog.mjs` | `605ae13089a376bcb57976e3092e6e88a05d4a906a398f6f415d69032213ba53` | Direct static content |
| `tests/reference-contract-catalog.test.js` | `0c49aacaa145ccf30217973bb90458adfe778b05c8fa55a59c4d669f44385685` | Direct static content |

## Source-backed findings

### REF-R3-F01 — HIGH / P1 — JSON paths bypass literal-code redaction

**Locations:** `scripts/reference-contract-catalog.mjs:852–859`, `1110–1111`, `1036–1039`; contrast `467–486`. Tests `590–631` exercise only the TypeScript initializer protection.

A documented JSON fence goes straight from `JSON.parse` to `add('document-json', ..., data, ...)`. Selected JSON/schema files likewise go straight to `emit('json-schema-data', ..., JSON.parse(text))`. The emitter stores the entire shape, hashes it and generally marks it STATIC. Neither route applies the initializer-string hash/UNKNOWN projection.

A valid schema default, const or example can contain a guest program. For example, a string default holding a function implementation would survive these routes verbatim. That conclusion follows from the direct data flow; **no claim is made that the external reference actually contains such a value**. Static parsing prevents execution but does not satisfy the separate requirement against copying literal implementation code.

**Required repair:** use a schema-aware bounded data projection. Keep approved structural/type vocabulary; retain unclassified or code-bearing strings as UNKNOWN with reason, provenance, hash and byte length. Preserve entries and ownership. Apply the same policy review to other raw string channels such as document rows/graph labels and Python annotation/export literals; no additional occurrence is alleged here.

**Verification:** NOT_RUN. Add negative cases in a schema file and documented JSON fence; require absence of literal code bytes, preserved source/entry/owner and visible UNKNOWN.

### REF-R3-F02 — MEDIUM / P2 — Live validation trusts self-declared source hashes

**Locations:** `scripts/reference-contract-catalog.mjs:1237–1244`, `1262–1282`; pin-authenticating read closure at `181–205`.

`validateCatalog(catalog, {root})` checks supplied source SHA-256 values against live disk bytes. Its final `inspectReference` call checks HEAD/tree metadata and authenticates `package.json`, but never passes the supplied source list through the pin-authenticating `ref.read` closure. The recorded `git_blob` is not validated. The inventory guard rejects untracked candidate names; it does not compare a changed tracked file with its blob.

Consequently, with HEAD and package.json unchanged, a changed tracked candidate plus correspondingly recomputed self-declared source/entry/catalog hashes can pass the exported live validator while disagreeing with its claimed pin. This is a **standalone validator** gap. The ordinary collector correctly authenticates its selected bytes, and comparison with a trusted unchanged frozen catalog provides separate protection; those paths are not claimed bypassed.

**Required repair:** validate supplied sources using a single inspected reference context and its authenticated read closure. Compare authenticated SHA-256/blob metadata and constrain the source set to declared candidates or explicitly modeled extra sources. Self-computed digests remain integrity checks, not source authentication.

**Verification:** NOT_RUN. A changed tracked candidate with unchanged HEAD/package.json and recomputed self-declared digests must still be rejected against the pinned blob.

## Static assessments and bounded limitations

**Git status removal: supported by the inspected source.** Remaining Git calls are `rev-parse`, local config lookup and `ls-tree` (`94–125`, `138–176`, `1162`). There is no status, diff or index/worktree conversion call. Candidate bytes are hashed directly with the Git blob header (`183–200`); filesystem inventory runs before and after collection (`246–307`, `1159–1163`). The wrapper disables fsmonitor/hooks/replacement objects, strips inherited Git environment settings, sets no-lazy-fetch, and attempts to reject partial/promisor references. This removes the visible status/filter path. It is **not** runtime proof that every supported Git/config form cannot invoke a configured command or fetch.

The test source contains fsmonitor/hook (`633–650`), promisor (`652–662`), clean/process (`675–697`), and replacement-ref (`699–721`) cases. They were read, never run. The conversion cases deliberately mutate excluded `watched.txt`, so they do not prove excluded files are authenticated; selected-source drift has separate assertions (`330–347`).

**Own-output handling: statically supported for stable filesystem paths.** `1316–1368` reject reference output, ancestor aliases, symlink/nonregular files and existing hardlinks; writing uses a fresh exclusive O_NOFOLLOW inode, fsync and rename. CLI also rejects the owner-map output path (`1401–1405`). The hardlink regression is present at test lines `723–759`, NOT_RUN. Pathname TOCTOU/hostile parent replacement immunity was not established.

**UNKNOWN and freeze denominator: statically supported within the selected-source inventory.** Unknown fields propagate into extraction_status; all entries remain NOT_VERIFIED (`1019–1040`). TypeScript/document/Python/native/YAML sources receive explicit source-level UNKNOWN entries even when detailed extraction is incomplete (`1085–1143`). Identity/order and strict freeze checks retain selected entries and reject removal/drift (`1022–1025`, `1164–1213`, `1291–1313`). No full-reference requirement denominator was inspected or certified.

**REF-R3-N01 — INFO: generated distribution exclusion.** `217–244` excludes exactly `python/sdk-runtime/src/deepseek_harness_runtime/runtime/` and the comment retains P100-052 artifact closure. This is a syntactically bounded subtree rule, but it applies even to tracked files; generatedness/ignored status is not authenticated by that rule. The specific exclusion/owner is not emitted in the catalog limitations (`1203–1209`) or as an UNKNOWN closure entry. Prefer making this explicit in output. Actual generatedness, tracked/untracked contents, lost counts, and separate closure ownership are **NOT_RUN**. This note does not assert that real reference requirements were lost.

## Checks actually performed

1. Read the three direct packet artifacts and allowed governance as text.
2. Verified the supplied sentinel SHA-256, all six file hashes, exact packet file set and no packet symlinks before/after review.
3. Traced candidate selection, raw-byte/pin checks, Git calls, all extraction families, serialization, live validation, freeze comparison and output writing by source inspection.
4. Read test definitions and compared them with the source paths; no test result was inferred.
5. Wrote only this result directory. No collector import/execution, synthetic repository, external target/config/hook/filter, network/provider/data access, worktree source/history, descendant, commit or push.

## NOT_RUN follow-ups — not performed in this lane

- Existing focused tests and CLI negative tests, including conversions and output hardlinks.
- F01 JSON code-string regressions and F02 live-validator pin-binding regression.
- Compatibility of promisor refusal/no-lazy-fetch across supported Git versions and effective configuration forms.
- Approved separate-owner review of generated distribution provenance and explicit artifact closure.
- Any real-reference collection, 318-manifest/55-family completeness, semantic equivalence, full 36-card acceptance, integration, certification or release.

No executable PASS or global acceptance follows from this report. `verdict.json` records hashes, findings, performed checks, limitations and NOT_RUN schedules separately.
