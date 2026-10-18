# CLI scalar source inventory — worker handoff

Status: **IMPLEMENTED**, static evidence only. Independent critic and Lead join
remain pending. The frozen [scalar contract](../scalars-contract.json) and
[parent contract](../contract.json) govern this lane. No functional receipt,
Clap grammar qualification, CVG policy authority, approval or G01 closure follows.

The [inventory](inventory.json) preserves all 305 historical field objects and
references all 105 existing parent container IDs without rebuilding the command
graph. It adds 18 scalar/support definitions, 34 variants and 46 exact impls.
The 14 explicit parser fields remain `LEAD_EXPLICIT`; their implicit candidates
are empty. The four extra Windows fields retain a Lead-owned parent disposition.

## Stable join contract

Root schema is `cvg.cli-scalar-source-inventory.v1`. Root keys are `schema`,
`task`, `status`, `pin`, `contract_sha256`, `fields`, `scalar_types`,
`parent_container_ids`, `manual_windows`, `functional_receipts`,
`full_g01_closure`, `limitations`, `counts`.

- `fields[].id` is the exact historical ID; join the Lead's rules on this key.
  `owner`, `rust_type`, `binding`, `historical` and `recon` preserve original
  ownership and complete historical metadata, including aliases/defaults/cfg.
- `fields[].wrappers` records lexical `Option`/`Vec`/`Box`/tuple wrappers.
  `leaf_bindings[]` contains `kind`, stable `id` when bound, exact declaration
  and `resolution_sources` when available. The supported kinds are
  `REPOSITORY`, `PARENT_CONTAINER`, `STANDARD`, `EXTERNAL`, `OPEN`.
- `REPOSITORY` IDs reference `scalar_types[].id`; `PARENT_CONTAINER` IDs
  reference `parent_container_ids[]`. Standard IDs are qualified standard paths;
  external IDs preserve the dependency path actually imported. An `OPEN` record
  has a name/reason without a guessed ID.
- `fields[].disposition` distinguishes `LEAD_EXPLICIT`, `PARENT_CONTAINER`,
  `NON_ARG_DATA`, `SCALAR_SOURCE`, `STANDARD_OPEN`, `EXTERNAL_OPEN`, `OPEN`.
  `parser_owner`, `explicit_value_parser`, `implicit_parser_applicability` and
  `implicit_candidates` keep explicit parser authority separate from scalar
  evidence. A `From` conversion is source evidence, never proof Clap selects it.
- `scalar_types[].id` uses `path.rs::Type`; `variants[].id` adds `::Variant`;
  `fields[].id` inside definitions adds `.field` or `.index`. Support/error
  definitions share this namespace. `attributes`, `source`, `variants`, `fields`,
  `impls`, `scope_imports`, `parser_import_bindings`, `parser_mechanisms` and
  `local_support_functions` retain the source evidence. `impls[].source_text`
  contains the complete impl, including errors, ranges and conversion arms;
  `header_bindings` and `associated_types` bind its referenced types.
- `manual_windows` references the hash-bound prior schema inventory and its
  `windows_setup` key, preserving four field summaries for the Lead. These four
  do not change the denominator of 305 historical IDs.

Every source anchor uses UTF-8 byte offsets `[start_byte, end_byte)`, one-based
lines, SHA-256 of those bytes and a checked excerpt (first 12/last 6 lines for
spans over 18 lines). The [manifest](manifest.json) lists complete source SHA-256,
Git blob OIDs and byte counts. Resolution follows local definitions, concrete
imports, module declarations, reexports and Cargo package identities. The two
curated glob steps for the Cyber conversion are verified exact reexport routes;
there is no global type-name search.

ValueEnum attributes retain names, aliases, hide/skip, cfg and default markers
losslessly. Name projections exist only for ValueEnum source derives and remain
unqualified lexical projections. `ThreadSource` grammar comes from its exact
`FromStr` source, including the feature fallback. Profile validation and its
error display, Linux PID namespace parsing, request concurrency clamping and
conversion destinations remain explicit source, with external boundaries open.

## Reproduce offline

From repository root:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/cli-parser-semantics/scalars/reader.py --check
```

The [reader](reader.py) uses Python standard library and the hash-pinned reviewed
audit lexer documented in [baseline](baseline.json). It never imports upstream
code. It checks contracts and four historical input digests, two deterministic
generations, pinned Git blobs, UTF-8 anchors, all field IDs, explicit ownership,
strict manifest identity and 28 in-memory negative controls. Source negatives
test actual variant removal/rename, value alias/name/default/cfg changes,
profile validation/error changes, import rerouting, field removal/type changes
and a CLI default change; their semantic comparison excludes source hashes and
positions. Artifact negatives cover omissions, alias/default/cfg/name/import,
ownership/false qualification; manifest negatives cover omissions/extras,
hashes, status and extra keys.

Without `--check`, the reader regenerates only `inventory.json`,
`verification.json`, `manifest.json` in this lane. Format Markdown with the
existing Node 22 Prettier, then run the own-lane doc-link checker before final
generation. After freezing, use `--check` for read-only verification.

The strict manifest includes every regular lane file except itself, rejects
directories/symlinks, and compares all metadata/artifact/source rows exactly.
Artifact and source rows use `path`, `sha256`, `bytes` (source rows also include
`git_blob_oid`). Its own SHA-256 must be supplied out of band by the Lead/final
handoff message; storing that self hash inside a sealed artifact would be circular.

## Evidence and limits

[Verification](verification.json), [commands](commands.json),
[self-review](self-review.json), [claim](claim.json) and
[machine handoff](handoff.json) record the scoped result and continuity delta.
The Lead owns integration, shared ledgers, rules and independent critique.

All standard-library and external dependency grammars remain `OPEN`, including
URL, socket/path, UUID, `clap_complete::Shell` and Tokio semaphore boundaries.
There are zero unresolved historical leaf routes; this does not close external
or runtime semantics. `reqwest::Url` would remain its own external boundary if
encountered, never be matched to `url::Url` by name. Transitive callees, derive
expansion, cfg evaluation, env/cwd/platform behavior and effective Clap grammar
remain unqualified. No target execution/import/compile, network/download/install,
application gates, model/provider/accounts, resource acquisition, lockfile change,
descendants, commit, push or deploy occurred.
