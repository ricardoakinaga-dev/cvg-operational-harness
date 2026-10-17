# SPEC0209 — independent STATIC review (r11)

**Bounded verdict: FAIL.** The four specifically requested repair paths are present in the frozen source, but two remaining serialization paths violate the no-implementation-body-copy bar. Both findings below are static deductions with **NOT_RUN** counterexamples. No executable result or reproduced exploit is claimed.

## Scope and integrity

Reviewed the complete contents of exactly these frozen files, using their packet-relative line numbers throughout:

- `scripts/reference-contract-catalog.mjs` — 1,617 lines; SHA-256 `1b47102810f193fa8aec0ff9f171da31f4e311ba826a11e9ec852165e90e6fa8`.
- `tests/reference-contract-catalog.test.js` — 992 lines; SHA-256 `a25f6e5e0abcc00a325c6ce6fcc9cd4d4260bec6be0a9f309a529ff240451d8a`.
- `docs/02_spec/0209_pare100_reference_catalog.md` — 20 lines; SHA-256 `6183bb50a4e9711fe13b21a3f97601d3c94dab2de46eb4a10d5328fc58871b94`.

The sentinel SHA-256 is `63efee78a7fb4d92e45993331d33675abc2f771c343c21dc50c5f1e6d5f026f7`. Before review and after the complete reads, its hash, the exact three-file set, and every listed file hash matched. Final integrity was also checked after writing these artifacts; the result is recorded in `verdict.json`.

Only shell reads and independent Python standard-library read/hash/report operations were used. The initial `python` command was unavailable; the same integrity/claim operation then succeeded with `python3`. No packet code was imported or executed. No builder report, review history, embedded progress rationale, live worktree, external reference, synthetic repository, Git command/config/hook/filter, network, database, provider, collector, supplied Python AST helper, build, or test was accessed/executed. Writes are limited to this review's `claim.json`, `report.md`, and `verdict.json` under the authorized result directory. No repository change or implementation was made.

## Findings

### R11-01 — HIGH — textual vocabulary guards still admit complete guest programs

**Requirement:** SPEC lines 10–12 require contract-only output with no copied implementation and explicit UNKNOWN for unclassified data. Hashing one representation does not permit copying the same guest bytes in another field.

**Source:** script lines 19–20 (`identityVocabulary`), 465–512 (`printed`), 514–522 (`nodeName`), 845–850 (Python annotation projection), 893–909 (`projectJsonContract`), 1163–1194 (entry construction), and 30–43 (final recursive ordering/JSON serialization).

The accepted alphabet includes slash-delimited text. The string `throw/GUEST_BODY_MARKER/` is a complete JavaScript throw statement with a regular-expression operand (semicolon insertion at EOF). It satisfies the positive character predicates used for declared-type strings, literal names, Python string annotations, and JSON `name`/`required` values. These predicates therefore do not authenticate text as contract vocabulary. The final serializer performs no further projection.

**NOT_RUN counterexample A (source text only):**

```ts
export const WORKER_SOURCE: "throw/GUEST_BODY_MARKER/" = "throw/GUEST_BODY_MARKER/";
```

Static trace: `extractTypeScriptContracts` lines 768–785 calls `printed(declaration.type)`. The literal contains only characters accepted at line 491, and its literal-type AST contains none of the forbidden executable AST nodes at lines 474–480. Lines 509–512 therefore print its guest bytes into `shape.declarations[0].type`. Separately, `staticData` lines 538–548 correctly hashes the initializer, so the entry can be UNKNOWN while its type still copies the complete guest program. `emitFor` and `serializeCatalog` preserve that copied type text.

**NOT_RUN counterexample B (document JSON or schema data only):**

```json
{"name":"throw/GUEST_BODY_MARKER/"}
```

Static trace: document JSON goes through line 989, and schema JSON through line 1266. Lines 905–909 return the string verbatim for field `name`; the output then contains the guest bytes. The same field-sensitive allowance also applies inside nested objects because object recursion replaces the field with each child key at lines 927–931. A byte-safe default/const wrapper cannot be assumed to sanitize a nested `name`.

**Test evidence/limit:** tests lines 595–683, 717–797 and 816–855 cover bodies containing function syntax, spaces, braces, quotes, or comments. Those payloads fail the relevant positive alphabets. They do not establish safety for the accepted slash-only guest program above. These tests were read, not run.

**Required disposition:** project unclassified literal text to digest/length/UNKNOWN across all representations, or introduce an explicit semantically constrained vocabulary policy that cannot silently classify guest source as vocabulary. Preserve each requirement and source provenance. Add focused regression coverage for these alternate representations; this reviewer has made no implementation change.

### R11-02 — HIGH — raw source-path metadata bypasses the guest-text projection

**Requirement:** SPEC lines 10–12 and the bounded review bar cover implementation copying through identity/metadata as well as values. Relative-path safety and content authentication do not classify filename text.

**Source:** script lines 71–83 (path checks), 185–209 (tree path and source metadata), 237–250 (candidate acceptance), 1184–1186 (raw `entry.source`), 1331 (raw reference root), 1344–1346 (raw `sources`), and 30–43 (serialization).

`relativePath` rejects absolute/traversing/sensitive paths, backslashes and NULs, but permits spaces, braces, parentheses and semicolons. Candidate selection checks location and suffix, not the text embedded in a filename. Both the source-record path and each entry's source are copied directly into generated JSON. The digest projection at lines 1163–1175 protects only `symbol`.

**NOT_RUN counterexample (hypothetical pinned source path; no file/repository was created):**

```text
apps/cli/src/function guest(){return 7;}.ts
```

Give that committed file a harmless typed export and an explicit `apps/cli` additional-surface owner. Static trace: the path matches `isCandidate`; `relativePath` permits it; normal pin authentication can succeed for its harmless file bytes; `owners.find` resolves the additional owner; entries and the source record then contain `function guest(){return 7;}` verbatim in provenance metadata. Even the unconditional source-surface entry at lines 1240–1246 is enough to expose the filename. Authentication of those bytes does not remove the copied guest program from the path. A root-directory name can similarly reach `reference.root` without text projection, but the source-path example alone establishes this finding.

**Test evidence/limit:** tests lines 372–404 cover escaping and symlinks; lines 747–797 cover symbol/literal identities. None asserts projection or rejection of guest text in a safe relative filename. No hostile filename or target collection was exercised here.

**Required disposition:** reject unclassified provenance path text before output, or represent it with a stable digest plus explicit UNKNOWN while retaining a traceable provenance identity. Maintain the accepted requirement set through any explicit identity migration; dropping the file is not an acceptable repair.

## Requested repair audit

| Prior concrete concern | Frozen-source observation | Test inspection | Static assessment |
| --- | --- | --- | --- |
| Additional apps/native/python/vendor manifest `.name` bypass | Additional manifests are read and `packageIdentifier`-validated at script 395–405 before their names can populate ownership at 434–439. | Tests 831–840 enumerate all four prefixes. | The cited function-body name bypass is repaired in this packet. |
| Unrecognized fence info copied in `.language` | Raw info remains internal at 1064–1070, but output projects language at 1134–1142; unsafe symbol text is separately digest-projected at 1163–1175. | Tests 841–855 inspect the language digest and absent body marker. | The cited unrecognized-fence-info leak is repaired in this packet. |
| Missing additional-surface owner silently falls back to catalog | Script 444–445 fails `OWNER_MAP_MISSING` before catalog fallback. TS/Python/native/config/manifest sources emit entries that invoke ownership. | Tests 856–863 remove the apps owner and expect rejection. | The cited fallback is repaired in this packet. |
| Package-root implementation fallback needs visible UNKNOWN | Script 450–459 returns `UNRESOLVED_OWNERSHIP` plus a resolution reason; 1161–1162 embeds it in shape; 1192 derives UNKNOWN. | No direct fallback-specific regression assertion found in the complete test file. | Visible UNKNOWN is implemented; P100-003 remains triage ownership, not functional ownership. Executable verification is NOT_RUN. |

## Other bounded checks

- **Pin authentication:** script 175–212 compares HEAD to the full pin, obtains the committed tree, and independently computes each candidate's Git blob digest from filesystem bytes before recording SHA-256. Script 1314–1318 re-reads sources and checks HEAD again. Source and root symlinks are refused by 88–102 and 146–152. This is source inspection, not validation against the real pinned tree.
- **Configured target execution avoidance:** the inspected Git call list contains metadata/tree/config queries rather than status/diff or worktree conversion; 109–133 disables replacements, fsmonitor, hooks, recursive submodules, global/system config and lazy fetch. Script 155–173 additionally refuses detected partial/promisor storage. Python at 1301–1308 is isolated and the supplied parser uses AST rather than importing reference modules. Tests 865–894 and 907–953 cover several relevant hazards. None was executed; no claim is made about all Git versions/configuration combinations or actual command safety at runtime.
- **Own output guards:** 1501–1553 checks canonical ancestors, reference containment, symlinks/nonfiles and hardlinks; output uses an exclusive new temporary inode and rename. CLI 1586–1590 rejects sensitive paths and owner-map overwrite. Tests 554–593 and 955–990 inspect intended behavior. Static review found no additional concrete ordinary-path output defect; concurrent hostile filesystem races were not tested or certified.
- **UNKNOWN and denominator:** TS/document/Python/native/config surface entries are retained (1240–1299); artifact closure is explicitly UNKNOWN (1367–1374); parity remains NOT_VERIFIED (1193, 1343). Source candidates and owner-map counts are checked (366–378, 1409–1432). Freeze rejects missing IDs, changed entries and changed digests (1476–1493); tests 406–443 inspect those failures. No repair recommendation permits reducing the accepted denominator.
- **Identity migration:** opaque symbols retain digest/length UNKNOWN provenance (1163–1175). Freeze does not silently accept old-ID removal. No prior catalog, global matrix, migration mapping or historical accepted denominator was provided/consulted; requirement-preserving migration is not certified by this review.

## Actual checks and limits

**Performed:** exact sentinel hash checks; exact packet file-set checks; all three file hashes; complete line-numbered reads of all three files; static data-flow traces from AST/JSON/document/metadata extraction through entry construction, digesting, ordering and final JSON serialization; static inspection of all test assertions.

**NOT_RUN:** collector, supplied Python helper, tests, synthetic repository or payload creation, Git/config/hook/filter experiments, real reference collection, executable QA, build/certification, network/DB/provider operations, and every counterexample in this report. The FAIL rests on explicit source data flows, not observed runtime output.

This verdict covers only helper SPEC0209 in the frozen packet. It cannot approve executable QA, completion of all 36 cards, the global parity matrix, product gates, or any release. The specific repairs credited above do not override the two remaining findings.
