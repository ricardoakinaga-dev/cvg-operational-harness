Os links locais abaixo apontam para o arquivo compactado. Os caminhos originais e bytes exatos estão no [manifesto](c1-metadata-graph-review-r15-reject-artifact-manifest.json); o relatório bruto e seus links relativos estão preservados dentro dele.

# Fresh C1 R15 — REJECT

The frozen checker still produces **13 false PASS results**: nine product-reaching dependency closures and four unresolved explicit workspace references. The supplied 614 static cases pass, but the independently constructed inert cases expose gaps in the metadata graph. No release, global, installed, CI or integration acceptance is granted.

Source freeze: `ac11dd1b40e1dbadb24f632fc6e73d025581ed99f4b16c1a71dd2c7dc53e33ac`; 19,385 entries (19,337 files, 48 links). Scope: all physical nonRoot actors entered by core, nearest package contexts, nested/dist manifests, four dependency fields, workspace/npmalias and canonical local file/link closures, cached census/cycles and diagnostic provenance. Authorities are the exact current five-document allowlist plus packet authority/freeze. Normative basis: SPEC0178 says manifest dependencies are graph edges and unresolved resolution cannot PASS; ADR010 criterion 2 rejects transitive harness→product dependencies. Historical material is opaque.

## Blocking findings

**P1 C1-R15-F01 — Installed registry/alias metadata successors disappear.** In `scripts/check-product-boundary.mjs:249–258`, `manifestEdges` maps non-file/link dependencies only through `workspaces.get(targetName)`. A missing match emits neither a physical installed-package edge nor a diagnostic. A core import of physical `node_modules/external-entry/index.mjs` reaches that actor's package.json; its dependency `external-next@1.0.0` is silently dropped even though the physical successor package declares `@inert/consumer`. API and actual CLI return PASS, `passed=true`, zero violations/diagnostics, exit 0. Eight nested/dist cases show the same omission for registry specs and npm aliases in all four fields.

- Minimal retained fixture: [installed source transitive](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [core import](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [entry metadata](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [successor metadata](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz).
- Native evidence: [API result](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [CLI stdout](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [CLI stderr](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz).
- Required correction: preserve canonical installed dependency identities and recursive metadata edges from reached nonRoot actors; unresolved frontiers remain blocking. Entry modules must never be evaluated, and vendor/reflection exemptions are not a remedy.

**P1 C1-R15-F02 — Missing explicit workspace target is accepted.** The same absent negative branch at lines 256–258 discards `@inert/missing:workspace:*` from the reached `auxiliary/actor/dist/package.json`. Four field variants return PASS/exit 0 with no diagnostic. Required status is INCOMPLETE with the declaring manifest as diagnostic provenance.

- Retained fixture: [missing workspace manifest](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz).
- Native evidence: [API result](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [CLI stdout](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [CLI stderr](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz).
- Required correction: refuse unmatched explicit workspace references on reached metadata. Preserve the documentary Root-ancestry limit; do not census archives merely because Root is an ancestor.

Reproduce from this packet's `output` directory, with the same inherited no-network seccomp filter:

```sh
python3 no-network.py repro-f01 /home/ricardo/.nvm/versions/node/v22.23.2/bin/node runtime/scripts/check-product-boundary.mjs cases/installed-source-dependency-transitive
python3 no-network.py repro-f02 /home/ricardo/.nvm/versions/node/v22.23.2/bin/node runtime/scripts/check-product-boundary.mjs cases/dependencies-unknown-workspace
```

Both currently return exit 0. These fixtures contain inert constant labels, JSON and import text; the checker parses and resolves them without importing or evaluating them.

## Native controls and provenance

| Evidence                                                        | Observed result                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Supplied static suite, unchanged bytes, physical trusted Vitest | **614/614 pass**, zero failed/pending                                           |
| Independent inert probes                                        | **84 cases**, 71 expected results, 13 false PASS                                |
| Actual native CLI exactcases                                    | **25 cases**, 25/25 agreement with API; 16 exit 0, 8 exit 1, 1 exit 2           |
| Readonly installed native audit                                 | **INCOMPLETE**, exit 1; **1,610 blocking diagnostics**, zero product violations |
| Frozen Source hashes and literal lstat metadata                 | **No differences**, including 1,972 directories                                 |

Positive controls preserve neutral actors, valid dist metadata, unrelated product diagnostics and documentary Root ancestry. Native negative controls retain product witness trails for direct workspace/npmalias, local transitive and already-censused manifests; local cycles retain INCOMPLETE and `UNVERIFIED_LOCAL_DEPENDENCY`; nonliteral modules and invalid JS grammar retain reachable diagnostics; missing local package metadata exits 2. Reached reflection stays blocking. Product sources and unrelated diagnostics do not taint the core merely by discovery. [Exact API cases](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [native CLI command/status/raw index](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [full Vitest names/results](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz).

The installed audit recorded 3082 source files, 592 core files, 26 workspaces and 15151 edges. Its blocking counts are: UNVERIFIED_DYNAMIC_CODE_EXECUTION=1382, UNVERIFIED_MODULE_LOADER_ESCAPE=141, UNVERIFIED_MODULE_LOADER_PROPERTY=54, UNRESOLVED_MODULE_REFERENCE=2, UNVERIFIED_PROCESS_CAPABILITY_PROPERTY=23, UNVERIFIED_MODULE_LOADER_BINDING=1, NON_LITERAL_MODULE_REFERENCE=3, UNVERIFIED_MODULE_LOADER_BASE=1, UNVERIFIED_MODULE_LOADER_PRIMITIVE=3. [Native installed result](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [execution/selftest](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz). These unknowns are unresolved and remain blocking; no vendor, reflection, test or global exception was applied. The original253 suites are opaque/hash-only and NOT_RUN; the 614-case suite is not a substitute for their execution.

## Invariance, I/O and access compliance

[Pre inventory](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [post inventory](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz) and [zero-diff summary](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz) capture content SHA-256, symlink target, mode, size, mtime_ns, ctime_ns, dev, ino and nlink for every literal Source entry. Dependencies and existing dist are covered. The physical runtime contains independent file copies: [exact copy hashes](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz); all 22 runtime symlinks remain inside output ([link census](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz)). No Source aliases were created.

Seccomp was installed and selftested before each suite/probe/audit/CLI batch, inherited by trusted runner and resolver children. All 16 nonUnix socket creation calls were the synthetic selftests and failed EPERM; **zero connect calls** occurred. AF_UNIX socketpair use is trusted runner/resolver IPC. No DNS, network destination, provider or PG attempt was made. New fixtures were exclusively inert text/AST/JSON. Native Node22 `--check` and trusted built-in resolver infrastructure did not evaluate fixtures.

Four full syscall traces establish **zero Source write opens**, **zero forbidden narrative content reads**, and **zero persistent write opens outside output**. There are four infrastructure `/dev/null` opens. Directory opens under documentary and vendor docs trees were metadata enumeration only, not narrative content reads. [Full I/O classification](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [raw traces and hashes](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz).

[Access action ledger](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz) and [output-only claim](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz) record the boundary. Only the five current allowlisted documents were opened as narrative. All other docs/README/.agent/reports/handoffs/build/coord/99/20/30/history and the original executable suites were hash-only. `docs/03_build/hiso-ci-scopes-local.md` was never opened for narrative reading. No skills, shared Root, other packet, private env, secret, descendant/subagent, source promotion, push or release action was used. The user's explicit packet authority supersedes local ledger/coordination update instructions; Lead owns integration. Fresh independent qualification is retained.

[Machine verdict and exact scope sources](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz), [artifact index](c1-metadata-graph-review-r15-reject-raw-evidence.tar.gz). **REJECT** pending correction of both P1 findings and a new authorized independent review.
