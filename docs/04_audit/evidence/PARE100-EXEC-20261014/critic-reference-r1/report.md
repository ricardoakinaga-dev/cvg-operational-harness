# I1 independent code critique — SPEC0209

**Verdict: FAIL — bounded static catalog acceptance.** Four reproducible P1 defects violate frozen requirements. This verdict is about `scripts/reference-contract-catalog.mjs`, `tests/reference-contract-catalog.test.js`, and packet catalog data. It is not a functional parity, whole-program completion, finalized semantic behavior matrix, or release verdict.

## Boundary and source integrity

Reviewed frozen packet: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-f0-packet`.
Sentinel: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-f0-packet.sentinel.json`.
Before and after: **1,101/1,101 files match**, zero missing/extra/changed files, zero symlinks. Sentinel SHA-256 is unchanged: `62c10ba46fff5f2844d81fe805ed34e9f7b2de27a651df04571290f303402f64`.

No descendants, network, providers, private sessions, or worktree code/history/evidence were used. The sole worktree operation was the expressly permitted copy of existing `node_modules`. Tests ran on the packet copy in `critic-reference-scratch/packet` with Node **v22.23.2**. All mutations and synthetic repositories stayed within authorized scratch/result directories; the original packet and actual reference were not changed. Actual reference access was read-only, limited to catalog-listed tracked contract source paths, verifying content hashes and statically parsing text. No reference module or embedded implementation was imported or executed. Synthetic execution probes used independently authored disposable scripts only.

The repository governance documents named in the outer AGENTS instructions (`docs/07_agents/AGENTS.md`, runtime state, execution log, backlog, coordination) are absent from this frozen packet. The narrower explicit independent-review restriction was preserved: no worktree consultation, claims, ledger updates, or source changes. Frozen SPEC0209 supplied the acceptance criteria. No prior critic verdict or builder rationale formed the basis of acceptance.

## Findings

### I1-REF-001 — P1 / high — Implementation is copied when encoded as literal string data

**Source:** `scripts/reference-contract-catalog.mjs:375–376` (`staticData`), used for exported values at line 611. **Actual artifact:** `docs/04_audit/evidence/PARE100-EXEC-20261014/reference/catalog.json:286307`.

The extractor copies every string/no-substitution template literal verbatim. The `WORKFLOW_GUEST_SOURCE` entry from `packages/workflow/workflow-ptc/src/guest-source.ts:4` therefore contains **39,615 characters** of executable guest implementation. Inert AST inspection found **79 functions with bodies**, 144 blocks, and zero parse errors. Source SHA-256 `0f5b1149dcf90b8180cf8685e9a12f25d0298c9bf0a4fc861b08c174350692ea` matches the read-only reference; payload SHA-256 is `63b97b3eac99073bd58cb0cc76f3e22187b616c61b3d293e13b85ff2adfc279e`. Entry ID: `contract:3b8787a7f8a8fa0d65c305800682e6ed6664e1c0f30e536663e47232a8073779`.

Independent negative input `export const WORKER_SOURCE = "function run(value) { return value + 1; /* IMPLEMENTATION_STRING_MARKER */ }";` reproduces the copy. The entry's `UNKNOWN`/`NOT_VERIFIED` status does not satisfy the separate prohibition on copying implementation. Supplied body-marker tests exercise AST blocks/arrows but omit code transported as a literal string.

**Impact:** The submitted frozen catalog already vendors executable DeepSeek implementation, violating SPEC0209's contract-data-only/bodies-exclusion requirement.

**Recommendation:** Restrict copied literals to explicitly recognized contract data; preserve executable payload requirements as `UNKNOWN` with owner, source hash and optional payload hash, without copying bytes. Add an executable-string negative fixture and regenerate the raw catalog and indexes while retaining the requirement denominator.

**Reproduce:** run the exact `raw-catalog-audit.command.json` command. Evidence: `raw-catalog-audit.stdout.log` and `raw-catalog-audit.json`; exit **1**.

### I1-REF-002 — P1 / high — Git status executes repository-configured commands

**Source:** `scripts/reference-contract-catalog.mjs:95–104`, called by `inspectReference` at line 137.

The Git environment disables global/system configuration but leaves local `core.fsmonitor` active. A disposable synthetic reference with `core.fsmonitor=./contract-monitor.sh` executed its tracked shell script during collection. It wrote `REFERENCE_COMMAND_EXECUTED` to `fsmonitor-executed.txt`; collection still returned a catalog with `NOT_VERIFIED`. There is no claim that the actual pinned reference has this configuration.

**Impact:** A reference-configured command can run during supposedly static/read-only collection before a pin/hash/catalog failure could protect the caller. A command can be a plugin launcher, provider invocation, installer, or any other executable.

**Recommendation:** Explicitly disable fsmonitor for every Git invocation (for example `-c core.fsmonitor=false`) and isolate other repository-configured execution mechanisms. Keep a negative fixture proving no command marker is produced.

**Reproduce:** run the exact `execution-boundary-probe.command.json` command. Evidence: `execution-boundary-probe.stdout.log` and `.json`; exit **1**. The only hook executed was independently authored in scratch.

### I1-REF-003 — P1 / high — External output hardlink changes the reference

**Source:** `scripts/reference-contract-catalog.mjs:1248` (only symlinks are rejected) and line 1262 (`writeFileSync` with `flag: 'w'`).

The independent fixture creates an external `.json` output hardlinked to a tracked package manifest inside its synthetic reference. Canonical output-path and symlink checks pass because the output path is outside the root and is a regular file. CLI returns **0**, then the manifest's shared inode contains catalog JSON instead of its original manifest.

Observed reference SHA-256 changes from `2974f0e22db4927cfe733b8c09f6a84d3bc263c5c2167aaffcfe0b6851933f8b` to `d381b7e4634bc18ff84c0617809c0434bb302e97c805f5fe8b31ec06d6d156f2`, with `nlink=2`. The fixture manifest and output paths are recorded in the probe log. Only disposable synthetic reference data was changed.

**Impact:** CLI violates the explicit no-reference-mutation criterion and reports successful collection after corrupting its source. Supplied CLI/symlink tests omit inode aliases.

**Recommendation:** Use an exclusive newly created temporary output followed by atomic directory-entry replacement outside the reference, with appropriate path checks; alternatively reject multiply linked existing files. Add a hardlink regression asserting both the command result and unchanged reference bytes.

**Reproduce:** run the exact `independent-probes.command.json` command. Evidence: `independent-probes.stdout.log` and `.json`; exit **1**. The nested CLI exit **0** is the failure evidence.

### I1-REF-004 — P1 / high — Replacement refs bypass initial commit-pin authentication

**Source:** `scripts/reference-contract-catalog.mjs:95–104`; pin check at line 122 and tree enumeration at line 128.

Git replacement objects are not disabled. A synthetic reference was pinned, then a different tree with `export interface Replaced { injected: true }` was installed using `git replace ORIGINAL_COMMIT REPLACEMENT_COMMIT`. HEAD still reports the original expected SHA; `git status` is clean because Git honors the replacement. Manifest hashes and owner map remain unchanged. Collection accepts the changed source, catalogs `Replaced`, and records the original expected pin.

Observed source hashes differ: original `ea6fb87d0c7032be256217b9932e3e5a4d684ef43177e37b01c74e5bf8c94cd2`, replacement `b13c25a52e05d1ebbe15cb00a2822e6e027da21dac2e3cc14323ce1e57c915fb`.

**Impact:** A first catalog can claim authentication to a commit while being extracted from replacement content. **An authentic pre-existing freeze still rejects the changed entries**; this finding does not claim that the old frozen digest can be bypassed.

**Recommendation:** Use `GIT_NO_REPLACE_OBJECTS=1` or Git `--no-replace-objects` for every invocation and add a replacement-ref negative probe preserving HEAD/version/manifest owner hashes.

**Reproduce:** run the exact `pin-replacement-probe.command.json` command. Evidence: `pin-replacement-probe.stdout.log` and `.json`; exit **1**.

## Positive evidence and denominator

- Supplied test suite: **14/14 passed**, exit 0. Focused ESLint and separate Node syntax checks pass. Passing supplied tests does not resolve the four independently demonstrated omissions.
- Raw catalog digest/entry integrity validation succeeds: **44,132 entries / 3,218 sources**.
- Independent mapping comparison matches all **318 original manifests**, all **55 distinct families**, and all **eight additional surfaces**. No original-manifest owner mismatch was found. Explicit package overrides are preserved.
- **6,297 UNKNOWN entries** remain present in the catalog and unknown index. **All 44,132 entries remain NOT_VERIFIED; parity PASS count is zero.** The other 37,835 extraction-STATIC entries do not become parity PASS.
- Utility/test-support closure retains **1,353 entries across 99 sources** as `INFRASTRUCTURE_CLOSURE`.
- All **3,218 catalog-listed reference contract source files** (22,276,520 bytes) match their recorded SHA-256 and Git blob hashes on read. This checks these source bytes; it is not independent proof of live Git HEAD or absence of other sources.
- Independent known-bad probes reject tracked content drift, new untracked source, a symlink alias, duplicate IDs, missing source records, rehashed requirement removal, and an attempted parity-PASS upgrade. Known-good live freeze and declaration/line reorder checks succeed. Direct AST/Python bodies are excluded in those probes. The executable-string case separately fails.

## Unassessed criteria and scope limits

The finalized semantic behavior matrix, semantic/journey completeness of P100-003, dynamic/inferred API and export-star resolution, generated-data freshness, all runtime tool/schema variants, Python runtime/decorator semantics, YAML/TOML interpolation/schema semantics, and native ABI behavior remain unassessed. No provider behavior, session contents, real data, product clinical actions, full CI, coverage, PostgreSQL, E2E, performance certification, whole-goal functional parity or production release was assessed. These criteria remain in their original denominator; no catalog entry or positive check discharges them.

The actual reference's live HEAD, replacement refs, local Git configuration and untracked/private state were not independently inspected, because this critic was permitted to read only tracked contract source there. Pin/live-freeze/command-boundary adversarial checks used synthetic repositories. Exhaustive concurrent filesystem race resistance and completeness of files not represented by the frozen packet are not established.

## Exact report and log paths

Report: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-reference-result/report.md`.
Findings: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-reference-result/findings.json`.
All command arguments/cwd/exits: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-reference-result/commands.json`.
Combined full raw stdout/stderr and command metadata: `/tmp/cvg-pare100-exec-20261014-6az3hlay/critic-reference-result/raw-commands.log`.
Sentinel evidence: `sentinel-before.json`, `sentinel-after.json`, `sentinel-after.stdout.log` in the same result directory.
Each check also has its exact `*.command.json`, `*.stdout.log`, and `*.stderr.log`. Independent probe code is retained in scratch; byte-identical snapshots and hashes are in the result directory (`probe-provenance.json`).

Recorded exits: shipped-tests 0; node-check-script 0; node-check-tests 0; focused-lint 0; focused-static-checks 0; source-inspection 0; sentinel-after 0; independent-probes 1; raw-catalog-audit 1; execution-boundary-probe 1; pin-replacement-probe 1. The four exit-1 probes encode unmet negative-case expectations, rather than tool startup failures.
