# SPEC0209 independent static critic — R9

**Verdict: FAIL (bounded static review).** Two implementation-text escape paths and one initial ownership gap remain. This verdict concerns only the frozen metadata catalog helper, its shipped synthetic tests, and SPEC0209. It is not executable QA, full PARE100/36-task acceptance, or release acceptance. Functional parity remains **NOT_VERIFIED**.

## Scope and method

The user-supplied constraints were the frozen review bar: no implementation copied through values or identity channels; exact pin/live-blob authentication; avoidance of reference-configured execution; reference-safe output I/O; explicit UNKNOWN and honest ownership/denominator accounting. HIGH/P1 means a required no-copy boundary is defeated by a directly traced input; MEDIUM/P2 means an incomplete initial ownership mapping can be represented misleadingly. Severity describes this tooling contract, not an observed production incident.

I directly read all 1,602 helper lines, all 958 test lines, and all 20 SPEC lines with numbered output. I traced extraction to entry construction, canonical serialization, validation, freeze comparison, and CLI output. I searched the three artifacts for projection, identity, subprocess, ownership, and filesystem-write paths. I did not import or execute the helper, execute its embedded Python, run tests, construct fixtures, invoke Git, inspect Git configuration/hooks/filters, access the reference repository, use the network/DB/providers, or start descendants for QA. Shell/Python served only reading, inventory, hashing, and writing my own review files. No builder report, history, live source, status ledger, or coordination commentary was used as evidence. Constitution `docs/07_agents/AGENTS.md` and engineering-framework skill guidance were procedural context only. The explicit user restriction to this result directory overrides repository-ledger/coordination mutations for this round.

## Findings

### R9-F1 — HIGH / P1 — Additional-surface package names bypass the provenance-name guard

**Primary location: `scripts/reference-contract-catalog.mjs:403`.** Related: lines 395–409, 432–437, 1162–1170, 1422–1433. Contract: SPEC lines 10 and 12.

Root manifest names are checked with `packageIdentifier` at line 216; mapped `packages/*/*/package.json` names are checked at line 356. The separately enumerated apps/native/python/vendor manifests instead have `.name` read directly at line 403. `owners.find()` selects that unvalidated value as `ownership.package` at lines 432–437. `emitFor` only projects **symbol** text; it copies `ownership.package` into both identity input and the visible entry `package` field. `validateCatalog` verifies the hash of that identity but never validates or projects the package string. `serializeCatalog` (41–42) performs ordering and JSON encoding, not redaction.

A source-backed counterexample schedule is an otherwise valid pinned synthetic `apps/cli/package.json` whose name is `function guest(){return 1;/* ADDITIONAL_NAME_MARKER */}` and whose surface remains mapped to `apps/cli`. Its manifest shape's `name` would become opaque, yet the same bytes flow through the ownership package field into manifest/source/interface entries and the final JSON. Pin authentication does not prevent this: it authenticates the bytes that need safe projection. This trace predicts a successful catalog containing the marker; it was **NOT_RUN**.

The shipped root/package rejection test at `tests/reference-contract-catalog.test.js:816` covers the root and `packages/core/example` only (through line 828). It does not cover the additional-manifest branch. All its assertions are unexecuted in this review.

**Closure:** validate every package provenance name before using it, including additional manifests; either reject invalid package identity or use a stable digest with explicit UNKNOWN provenance and preserved ownership/counts. Extend the negative schedule across apps/native/python/vendor and inspect the full serialized catalog, not just `shape`.

### R9-F2 — HIGH / P1 — Unrecognized fence info strings are serialized verbatim

**Primary location: `scripts/reference-contract-catalog.mjs:1126`.** Related: lines 1051–1056, 1064–1067, 1121–1129, 1148–1160, 1176, 41–42, 1586. Contract: SPEC line 10.

The parser captures the complete text after opening backticks as `fence`. For an unrecognized info string, it stores that text as `language: fence` and later embeds it unprojected in an UNKNOWN shape as `language: data.language`. Hashing the composite symbol does not sanitize this separate shape field. The canonical serializer retains the original language string, and neither UNKNOWN classification nor a valid catalog digest removes it.

A source-backed negative schedule is a committed allowlisted catalog document with a fence info string `function guest(){return 1;/* FENCE_LITERAL_MARKER */}`, an arbitrary body, and a normal closing fence. The closing-fence branch falls through to `document-unparsed`; its final `shape.language` retains the complete guest program. The program is not executed, but its implementation bytes are copied into the catalog. This trace was **NOT_RUN**.

The literal/identity tests at `tests/reference-contract-catalog.test.js:717` and `:747` exercise cells, graph labels, annotations, headings, and first cells, not the unrecognized fence info string. Their presence is not runtime evidence.

**Closure:** treat an info string as untrusted content. Preserve only a bounded recognized language tag; retain opaque info text via digest/length and UNKNOWN. Keep distinct fences/requirements identifiable with stable provenance, and assert marker absence from the complete serialization.

### R9-F3 — MEDIUM / P2 — Missing additional-surface ownership silently becomes catalog ownership

**Primary location: `scripts/reference-contract-catalog.mjs:442`.** Related: lines 379–389, 427–446, 1173–1177, 1338. Contract: SPEC lines 10, 18, and 20.

Package-manifest mapping is checked against an exact expected set at lines 366–373. Additional-surface handling validates only the entries supplied in the array; an empty or incomplete array is accepted. When a candidate under apps/python/native/vendor lacks a matching surface, `owners.find()` falls back to the root package, task `P100-003`, family `catalog`, and scope `CATALOG_DATA`. It records no ownership-specific UNKNOWN or reason. A fully typed interface there can still have `extraction_status: STATIC` because classification only examines shape.

A negative schedule is the shipped synthetic owner map with the `apps/cli` surface entry omitted while retaining its pinned files. Collection still inventories those files, but assigns fallback catalog ownership and reports a smaller `summary.additional_surfaces`. This is a misleading initial mapping, not evidence that source files disappear. The shipped missing-ownership test at `tests/reference-contract-catalog.test.js:349` checks `package_owners`, not missing additional-surface entries. Schedule **NOT_RUN**.

**Important bound:** after an initial freeze exists, the comparator's owner-map digest check (1465–1468) would reject this map change. This finding does not claim a bypass of that established-freeze guard or an actual reduction of the external acceptance denominator.

**Closure:** require explicit mapped coverage for additional contract candidates, or emit an ownership UNKNOWN with source/reason and keep the unresolved surface denominator visible. Reserve the catalog fallback for intentional catalog/root data, rather than silently applying it to unmapped implementation surfaces. Lead remains owner of semantic coverage.

## Direct reassessment of the named previous gaps

These are current-source assessments, not assumptions about earlier rounds, and not test PASS claims.

| Named gap | Current trace and bounded assessment | Shipped schedule (all NOT_RUN) |
| --- | --- | --- |
| Raw JSON defaults/keys | `projectJsonContract`, helper 872–921, hashes unclassified string values and whole objects with unsafe property names. Schema/document JSON and manifest shapes call it at 976, 1209, 1251. The explicitly code-like default/const/example/key cases are guarded in this source. Allowed structural vocabulary remains literal; no universal semantic classification is claimed. | tests 638–683 cover default/const/examples. No dedicated unsafe JSON-key case is shipped. |
| Document first-cell/heading symbols | Heading/first-cell composites reach `emitFor` (1148–1160), which stores a digest and identity projection for non-vocabulary symbols; cells themselves are projected at 1114–1117. The cited body-with-punctuation identity case is guarded. Fence info strings remain the separate R9-F2 escape. | tests 747–797 include heading and first cell. |
| TS literal keys/member/export/module names | `nodeName` (501–509) uses digest/length UNKNOWN for unclassified string-literal names. `staticData`, member/export handlers, module prefixes, and `emitFor` carry that representation without the literal body. The named opaque-literal routes are guarded. | tests 747–797 cover object key/member/export; 799–814 cover distinct opaque module names. |
| Python bytes annotation | Embedded `typ` checks bytes constants before `ast.unparse` (835); `opaque` hashes raw bytes (827–829). This closes the specified bytes-annotation route by source inspection. | tests 747–797 include `b` annotation. |
| Multiple opaque module names | Module prefixes use the serialized digest-bearing name (664–675); record keys include that prefix (657–660). Different opaque names therefore retain different requirements for the named case; 799–814 assert two values, two exports, and unique IDs. | tests 799–814. |

The new opaque symbols expose a stable digest, reason, and length, and source hashes remain attached. Freeze comparison rejects removed/replaced IDs and entry changes (1472–1478); it does not silently bless identity migration. No older freeze, migration mapping, or external requirement matrix was in this three-file packet. Compatibility/migration of a preexisting freeze and preservation of the full external requirement denominator therefore remain **NOT_VERIFIED**. A new digest scheme is not authority to discard old requirements.

## Other reviewed boundaries

- **Pin/live source authentication — implemented guards observed statically.** Constants at 11–12 match SPEC line 4. `inspectReference` checks an absolute canonical top-level root, exact HEAD, object format, and manifest version (139–235). It builds a tree from the expected commit and computes the Git blob hash from live bytes (180–204), alongside SHA-256. Collection re-reads sources and checks HEAD at 1299–1303. Root-enabled validation independently authenticates catalog sources and checks complete candidate coverage (1385–1417). Catalog-only validation intentionally does not authenticate live bytes; the distinction is visible in test 685–715. No actual reference root/pin/blob or concurrent mutation was exercised.
- **Configured Git execution avoidance — implemented guards observed statically.** Wrapper 105–137 disables replacement objects, fsmonitor, hooks, untracked cache, recursion, global/system config, optional locks, prompting, and lazy fetch. Local promisor/partial configuration is rejected at 153–174. Command sites use rev-parse, config lookup, and ls-tree rather than status/diff/index content conversion. No reference module/generator/plugin is imported. Python runs helper-owned isolated stdlib AST code at 1286–1297, not reference imports. Tests 831–860, 873–919 describe fsmonitor/hooks, promisor, filters, and replacement refs, but **none ran**. Git/Python/PATH/runtime trust and version-specific behavior were not independently verified.
- **Output I/O — implemented guards observed statically.** Output ancestry is canonicalized; reference descendants, symlink/nonfile targets, and hardlinks are refused (1486–1509). Owner-map path collision is refused (1574–1575). Writes use a fresh sibling temporary directory, exclusive nofollow inode, fsync, repeated path checks, and rename (1512–1538). Input/output and hardlink tests are at 554–593 and 921–957. This is static inspection, not filesystem-race or crash-durability proof. The CLI intentionally permits reusing an identical freeze output after comparison (test 584).
- **UNKNOWN/parity/denominator — mostly explicit with R9-F3 exception.** Dynamic extraction, per-source surfaces, native/YAML/TOML, document freshness, and generated distribution artifact closure remain UNKNOWN with source/owner context (1225–1283, 1343–1359). Every collected entry and catalog retain NOT_VERIFIED, validated at 1367–1444. Utility/test-support are kept as infrastructure closure (423–425). Freeze checks duplicate IDs, missing sources, owner-map/reference drift, removed IDs, entry drift, and full digest drift (1367–1483). This establishes catalog bookkeeping intent, not the SPEC's real 318-manifest/55-family coverage or functional/journey completeness. Those remain outside this packet and unverified.

## Performed checks and evidence status

| Procedure | Status | Observation |
| --- | --- | --- |
| Sentinel read and SHA-256; complete packet file-set equality and every file SHA-256 before inspection | PERFORMED | Exact three-file set matched sentinel; no symlinks. |
| Complete numbered direct reading of helper/tests/SPEC; focused textual searches and manual end-to-end source tracing | PERFORMED | Findings R9-F1/F2/F3; named prior gaps assessed above. |
| Shipped test inventory | PERFORMED, STATIC ONLY | 27 textual test declarations; one clean/process loop would instantiate two cases, hence 28 scheduled cases by inspection. No test result inferred. |
| Helper/CLI/embedded Python execution; shipped tests; synthetic negative schedules; live collection/freeze | NOT_RUN | Explicitly excluded. No fixtures or collector created. |
| Sentinel and packet re-verification after report preparation | PERFORMED | See immutable-input verification below and machine-readable verdict. |

## Immutable-input verification

Sentinel SHA-256 before and after: `55573c3a5763171d64fd7586bea809d371a6c5972f3b1168b5ff3ef083990f26`.

| Frozen relative file | SHA-256 (before = after) |
| --- | --- |
| `docs/02_spec/0209_pare100_reference_catalog.md` | `6183bb50a4e9711fe13b21a3f97601d3c94dab2de46eb4a10d5328fc58871b94` |
| `scripts/reference-contract-catalog.mjs` | `85634ae169c984a274e845d18982ef21f10f8b6b35eba980251bc05c46865bd7` |
| `tests/reference-contract-catalog.test.js` | `97e28fc535aaeb1a6c98bbb03ebef268f74dc4537f5dcd0fa157f1c22afb17a0` |

The exact set and digests match the sentinel, and sentinel bytes match their initial SHA-256. Final verification also rejects symlinks and non-regular/non-directory packet entries. Only my `claim.json`, `report.md`, and `verdict.json` in the authorized result directory were written. No runtime state, execution log, backlog, coordination file, packet file, or worktree file was changed by this reviewer.

## Limits and next action

This is an independent static critic with direct frozen-artifact evidence, not a dynamic reproduction or a security proof. No real source catalog, owner map, historic freeze, migration ledger, executable QA output, or external task matrix was available/consulted. Findings describe concrete source paths with high static confidence; their schedules and every shipped test are NOT_RUN. Functional parity remains NOT_VERIFIED, and no release/production acceptance is granted.

Next action: close R9-F1/R9-F2, make additional ownership explicit for R9-F3, preserve stable provenance/denominators, and obtain a separately authorized synthetic serialization check plus fresh independent review. This critic does not implement fixes or broaden execution authority.
