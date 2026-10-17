STATIC_REVIEW_FAIL

Scope: independent static library review of the six files in /tmp/cvg-pare100-exec-20261014-6az3hlay/critic-ref-r2-packet, against the supplied sentinel and SPEC0209. No descendants, network, other source trees, repository configuration, source changes, module imports, collector execution, or tests. The only write is this report. The verdict concerns the catalog tooling's declared static invariants and grants no broader acceptance.

Blocking finding F01 — HIGH: repository-configured Git filters remain an execution path.

Evidence: scripts/reference-contract-catalog.mjs:94–125 invokes Git with repository-local configuration still effective. It disables fsmonitor and hooks (100–102), global/system configuration (117–118), replacement objects and lazy fetch, but does not disable or reject external clean/process filters or filter attributes. inspectReference invokes git status on the worktree at 179–185, before candidate filtering at 188–190 and safeRead/blob authentication at 193–203. No filter configuration or .gitattributes guard is present in the supplied implementation/tests. tests/reference-contract-catalog.test.js:619–636 exercises fsmonitor/hook configuration only.

Static reasoning: Git worktree content revalidation can invoke an external clean/process filter selected through .gitattributes and local filter.<name>.clean/process configuration. A tracked filtered file requiring content comparison can therefore launch a reference-configured command during status, including on a file subsequently excluded by isCandidate. GIT_OPTIONAL_LOCKS=0 prevents optional locking/writes; it does not disable content-conversion filters. Later source-drift rejection cannot undo a command already launched. This leaves the static-data/no-reference-execution invariant in SPEC0209:10 unprotected.

This is a source-backed static inference about the permitted invocation path. No filter execution was reproduced or observed; the actual reference configuration was not accessed. Runtime confirmation: NOT_RUN.

Required correction: avoid worktree Git operations that may perform configurable content conversion, retaining direct allowlisted byte/blob authentication and a nonexecuting path inventory; alternatively fail closed on effective external filter configuration before any such operation. Add synthetic clean/process-filter cases that force worktree content revalidation and assert that no configured command runs. No correction was made in this review.

Other static findings and evidence:

1. Deterministic identities and ordering are explicit. ordered/serializeCatalog recursively sort object keys (script:19–32). Entry IDs hash kind/package/source/symbol, independently of line numbers and owner task (964–981); candidates and final entries are sorted (984, 1105), source records and owner-map arrays are normalized (1118–1132). Overloaded declarations are grouped and sorted (538–553, 704–709). Freeze comparison validates both catalogs and rejects reference/owner-map changes, removed requirements, changed entries, and other freeze changes (1232–1254). Tests:302–328 and 406–443 contain relevant assertions. Reproducibility and freeze behavior were inspected, not executed.

2. Source and owner identities remain present. Manifest pin/name/hash and package denominator checks appear at script:251–294; owner selection preserves explicit package overrides and utility/test-support closure (326–365). Each emitted entry receives source_sha256, owner_task, family, scope, and NOT_VERIFIED (964–981). Catalog:4–27 retains the webworker-runtime owner P100-045, matching capability-family-map.json:1304–1310 even though its family's default owner is P100-046 (27). Catalog:77–98 and 1995–2016 retain utility/test-support contracts as INFRASTRUCTURE_CLOSURE. Source/contract/identity hashes and duplicate/missing-source checks are implemented at script:1178–1216. Internal catalog validation was NOT_RUN.

3. UNKNOWN is conservative in the inspected emission paths. Absent declared types, dynamic initializers/references, computed names, native bodies, YAML/TOML, and unparseable generated declaration fragments receive explicit reasons (script:368–462, 539–548, 836–846, 1054–1085). hasUnknown propagates UNKNOWN to extraction_status; parity remains NOT_VERIFIED (33–36, 979–980). The supplied unparseable document fragment is retained with diagnostics, source hash and owner at catalog:482667–482684. Semantic completeness and generated-document freshness remain explicitly unverified.

4. String initializer metadata retains requirements without copying initializer bytes. script:418–428 emits UNKNOWN, SHA-256 of decoded node.text, and UTF-8 byte length; recursive arrays/objects/call arguments use the same transformation (439–459). The separate source SHA-256 retains sensitivity to raw source changes. Catalog:297065–297093 preserves WORKFLOW_GUEST_SOURCE as a 39,635-byte UNKNOWN value with value hash, stable entry ID, P100-035 owner, relative source and source hash. Tests:590–617 assert literal metadata and absence of literal/template/nested markers. Nonblocking test observation C01: this test does not directly assert retained GUEST_SOURCE/Options identities or template/nested value hashes and lengths. Add those assertions to protect retention as well as byte omission. NOT_RUN.

5. Output handling has explicit static safeguards. script:1257–1280 rejects reference-root output, aliased ancestors, symlinks including dangling links, nonfiles, and existing hardlinks. Owner-map overwrite is refused at 1345–1346. Writing uses a private temporary directory, exclusive O_NOFOLLOW creation with mode 0600, fsync/close, a final path check, rename and cleanup (1283–1309). Tests:549–588 and 674–710 include reproducible CLI/freeze/reference-output and hardlink assertions. Filesystem behavior, failure cleanup, concurrent path changes and crash durability were NOT_RUN; no security certification is inferred from inspection.

Supplied data observations:

catalog.json:1395848–1395938 declares 44,132 entries, 3,218 sources, 318 mapped manifests, 55 mapped families, 8 additional surfaces, 37,728 STATIC and 6,404 UNKNOWN entries. capability-family-map.json:3–8 agrees on pin/version and package/family counts; additional surfaces appear at 2933–2974. Full-file rg counts found 44,132 contract-ID fields, 44,132 source_sha256 fields, 44,132 owner_task fields and 44,133 NOT_VERIFIED parity fields (entries plus catalog). No other parity_status value was found. These are textual consistency observations, not exhaustive semantic acceptance or execution of validateCatalog. The declared catalog digest is 892793514a73c14bab583ae9ef709504e49ebb45671f237857b6833a202f26e4 (catalog:2).

Executable checks:

- Module import, AST extraction and unit tests: NOT_RUN.
- Collector/CLI against synthetic fixtures or the pinned reference: NOT_RUN.
- Byte-determinism reruns, validateCatalog and compareCatalogFreeze: NOT_RUN.
- Configured Git fsmonitor/hooks/filters, replacement-ref and promisor regressions: NOT_RUN.
- Output symlink/hardlink/atomic-write behavior: NOT_RUN.
- Lint, formatting, typecheck, build, full test suite, e2e, certify, SBOM and license checks: NOT_RUN.

Integrity evidence:

BEFORE and AFTER_REVIEW read-only SHA-256 checks read every packet file and compared exact file inventory and bytes with the sentinel: 6/6 match, no added/missing files. Sentinel SHA-256 at both checkpoints: d34faa671472e0eebb13757be8d1d14a35b52a9495b0a7f2b34d9dc1c1cc2e23. File hashes:

scripts/reference-contract-catalog.mjs: 78dbc25e3e3926dc39ed08395ad22872626423ad226a401c1bf52cf99f4bcfc6
tests/reference-contract-catalog.test.js: f49b0ced7428691bb131ed809ce4adc8f5361008eaaa2390c76e959d624736f3
docs/02_spec/0209_pare100_reference_catalog.md: 6183bb50a4e9711fe13b21a3f97601d3c94dab2de46eb4a10d5328fc58871b94
docs/04_audit/evidence/PARE100-20261014/capability-family-map.json: 59b5e312e22ab744615b5b0f85b617ea7a18a5083c99cab65f99e9a410520dcf
docs/04_audit/evidence/PARE100-EXEC-20261014/reference/r2/catalog.json: e35437360cc898f0fffa719bfa941eabd1149bb4f03d02caf65401c95e98dfa0
package.json: 9f93c979c3154fab0196e7029d0efd1c152fbaa4f75e1127da75dba5139b8041

The generic python executable was unavailable; permitted read-only hashing used python3. No reviewed code was run.

Scoped verdict: STATIC_REVIEW_FAIL because F01 leaves a declared collection invariant unprotected. Full behavioral acceptance, all 36 tasks, functional equivalence, security certification and release are NOT_APPROVED and outside this review.
