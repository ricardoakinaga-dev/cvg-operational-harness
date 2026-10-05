Os links locais abaixo apontam para o arquivo compactado. Os caminhos originais e bytes exatos estão no [manifesto](c1-installed-frontier-review-r17-invalid-artifact-manifest.json); o relatório bruto e seus links relativos estão preservados dentro dele.

**I1 verdict: INVALID.** Finite C1 static mechanism critique of freeze `887ba759cdf1d35d847bebb0a7dda8c8ded77d88ae3a4ab4e0dabbaadc386294`. The advisory mechanism disposition is **REJECT**, but this run cannot provide a valid independent gate.

The runtime copy read/copied **262 unauthorized documentary files** from Source (2 dependency READMEs and 260 licenses/notices), instead of hashing them only. No narrative text was inspected. This still violates the explicit document boundary; zero prohibited reads/copies is **not** satisfied. Exact paths/hashes are in `prohibited-document-copies.json`. The original and corrected copy helpers are retained.

Source is unchanged: 19,337 files + 48 links = 19,385 frozen entries; inventory SHA-256 matches. Literal before/after metadata for Source root and all 1,972 directories and their files/links has zero differences, including atime/mtime/ctime, mode, ownership, inode and link count. Main, neutral, PG, security, Root state, coordination and ledgers remain with the Lead.

| Measurement | Current result |

| --- | --- |

| Supplied unique static cases | 793 / 793 pass, zero skip; repeated once for raw capture |

| Supplied case executions | 1,586 / 1,586 pass |

| New independent probes | 202: 109 expectations match, 93 fail; zero skip |

| New graph probes / reader probes | 200 / 2 |

| Native discriminator batch | 80: 36 match, 44 fail |

| API / CLI agreement | 200 / 200, including all failing graph probes |

| Guard selftests | 7 / 7 pass; Unix IPC allowed |

| Actual network / DNS / provider / PG calls | 0 / 0 / 0 / 0 |

| Original executable fixture reads / copies / executions | 0 / 0 / 0 |

| Unauthorized documentary copy reads | 262; INVALID process |

| Installed static CLI | INCOMPLETE in all three bounded captures; never acceptance |

**F1 · P1 · Local declaration removes the physical installed successor** (48 failed probe assertions).

The file/link branch connects only the declared local package, then skips installedPackage. A neutral local workspace therefore suppresses a simultaneously present installation under the declared alias key. For each of four fields and both file/link, physical product metadata, unknown implementation, and malformed package metadata all produce PASS/exit0. Node22 createRequire.resolve(next) selects the physical installed index.mjs in the native product/unknown controls.

Expected: Retain declared local and physical installed edges independently. Known product -> FAIL; unknown -> INCOMPLETE; malformed physical metadata -> recusal. Registry-provenance tolerance must not be forged by a local declaration.

Discriminators: `native-dependencies-file-absent`, `native-dependencies-file-same`, `native-dependencies-link-same`, `native-dependencies-registry-product`, `native-dependencies-alias-product`.

Frozen source: `scripts/check-product-boundary.mjs:234` SHA-256 `ac2f6ced72e966b1f8314ca7d57dde5d5225a73ac80276c443d34135b490ed4c`, `scripts/check-product-boundary.mjs:272` SHA-256 `ac2f6ced72e966b1f8314ca7d57dde5d5225a73ac80276c443d34135b490ed4c`.

Repair direction: Resolve the declared installation key for every dependency field/specifier family without replacing local or workspace edges. Census each independently bound physical actor; keep strict Core local validation and registry-only unresolved-local provenance.

**F2 · P1 · Effective source entry into JSONless installed actor skips nested metadata** (24 failed probe assertions).

localTarget finds actor contexts only by ancestor package.json. A direct source edge into a JSONless node_modules package falls back to Root, so governActor never owns that physical package directory. Across all four fields, a source-resolved neutral index.mjs with dist/package.json containing product metadata, malformed metadata, or a missing local reference produces PASS/exit0. The native resolver returns precisely node_modules/next/index.mjs.

Expected: Effective actor metadata must be governed independently of existence of its root JSON. Product -> FAIL, malformed -> recusal, unresolved local -> blocking (strict absent physical registry witness; do not fabricate a nonexistent root manifest hash).

Discriminators: `native-dependencies-source-jsonless-neutral`, `dependencies-effective-source-archive`, `dependencies-opaque-root-archive`, `supplied R17 JSON-less declared actor controls`.

Frozen source: `scripts/check-product-boundary.mjs:385` SHA-256 `ac2f6ced72e966b1f8314ca7d57dde5d5225a73ac80276c443d34135b490ed4c`, `scripts/check-product-boundary.mjs:414` SHA-256 `ac2f6ced72e966b1f8314ca7d57dde5d5225a73ac80276c443d34135b490ed4c`, `scripts/check-product-boundary.mjs:424` SHA-256 `ac2f6ced72e966b1f8314ca7d57dde5d5225a73ac80276c443d34135b490ed4c`.

Repair direction: Derive and bind a physical package boundary from resolved source provenance even without root JSON, census its nested actor manifests, and retain separate actor boundaries for nested installations. Do not expand a Root ancestor into a documentary archive census.

**F3 · P2 · First existing installation directory differs from native require lookup** (16 failed probe assertions).

installedPackage returns the first existing directory in resolve.paths even when Node require resolution cannot load a package there and continues to a hoisted package. With an empty nearer package and a hoisted package with main=index.mjs and known consumer dependency, createRequire.resolve(next) selects the hoisted entry, but API/CLI inspect only the empty nearer metadata and return INCOMPLETE with no product violation. Both direct and npm-alias declarations reproduce this across four fields.

Expected: Retain known product reachability for the actual canonical runtime successor, alongside any conservatively governed nearer physical actor. INCOMPLETE currently remains blocking; this is not a false-green finding.

Discriminators: `native-dependencies-registry-nearest-shadow`, `native-dependencies-alias-nearest-shadow`.

Frozen source: `scripts/boundary-manifests.mjs:257` SHA-256 `c909d87f7c724c93f6bae44d0ac5c88abb80fc4dd274b81e8c4ffdf687e66abb`.

Repair direction: Bind runtime successors using trusted native resolution in the declaring context, with explicit import/require conditions. Preserve metadata-only actors and uncertainty rather than treating a directory lookup list as proof of the require target.

**F4 · P2 · Core local dependency canonicalizes an internal symlink before strict recusal** (4 failed probe assertions).

Strict localPackage applies realpath to an existing target and reads the canonical package, hiding a symlink in the original local dependency path. Across four fields, Core file:../../auxiliary/link to a valid in-root nonworkspace target returns INCOMPLETE/exit1 instead of recusal/exit2. A target with its own missing local dependency does recuse.

Expected: Core malformed/missing/symlink/outRoot local references preserve recusal. The observed non-PASS does not grant acceptance.

Discriminators: `dependencies-local-symlink-missing`, `supplied R17 strict local-missing, dangling-symlink and outRoot controls`.

Frozen source: `scripts/boundary-manifests.mjs:172` SHA-256 `c909d87f7c724c93f6bae44d0ac5c88abb80fc4dd274b81e8c4ffdf687e66abb`, `scripts/boundary-manifests.mjs:180` SHA-256 `c909d87f7c724c93f6bae44d0ac5c88abb80fc4dd274b81e8c4ffdf687e66abb`.

Repair direction: Validate every lexical target ancestor and the requested manifest before canonicalizing, using the strict checks already applied to installed local edges.

**F5 · P2 · A local metadata cycle caches a complete node above an incomplete successor** (1 failed probe assertions).

A visiting cycle returns the shape before its unresolved descendants are known. Its caller commits complete, and later read returns that state without propagating incomplete through the strongly connected component. Registered A locally reaches B; B points back to A; A has a physically bound missing local package. A is incomplete, B remains complete after repeated read, while the exact unresolved A row is preserved.

Expected: B closure state is incomplete as it reaches incomplete A. Global diagnostics still contain the blocker; no aggregate PASS is asserted.

Discriminators: `cache-strengthening-required-options`, `supplied valid local-cycle and repeated incomplete-read controls`.

Frozen source: `scripts/boundary-manifests.mjs:104` SHA-256 `c909d87f7c724c93f6bae44d0ac5c88abb80fc4dd274b81e8c4ffdf687e66abb`, `scripts/boundary-manifests.mjs:121` SHA-256 `c909d87f7c724c93f6bae44d0ac5c88abb80fc4dd274b81e8c4ffdf687e66abb`.

Repair direction: Propagate incomplete states over cycles to a fixed point or label visiting-derived closures as provisional until the SCC settles. Keep shape validation caching separate and retain all unresolved rows.

There are two P1 soundness failures and three P2 completeness/contract/cache failures; no P0 finding is asserted within this finite scope. F3/F4 already remain non-PASS, and F5 retains its unresolved diagnostic globally. They do not establish a false green aggregate gate. F1/F2 do produce false PASS/exit0.

The first exploratory batch lacked installation main entries, so its bare-key native resolutions failed. The separate native batch adds explicit inert main entries and confirms the effective physical targets. Both batches are retained. The supplied suite was repeated only to capture every raw audit return/throw: 651 calls, including 130 recusal throws. Direct AST/lexical cases retain the complete Vitest case results and inert fixtures. The initial zero-case setup failure is preserved separately.

The seccomp filter denies every non-Unix socket/socketpair and io_uring path, inherited by Node resolver/check machinery and Vitest workers. Kernel network traces, including an actual blocked getaddrinfo selftest, show no successful Internet call or DNS forwarding. PG/provider category socket selftests do not call application clients. All fixture source stays inert.

The bounded installed copy has 1,492 active code/metadata bindings. Its status remains INCOMPLETE; root documentary archives, env and original executable fixture suites were not copied. The first measured clone snapshot records symlink atime changes caused by its inventory reader; that result is preserved. The stable capture records complete runtime root/file/directory metadata before/after without changes. Source itself never changed.

Raw results: `supplied-tests.json`, `supplied-captured-tests.json`, `supplied-raw-calls.ndjson`, `independent-tests.json`, `native-tests.json`, all per-probe API/CLI captures, native resolver paths, fixtures and syscall traces. Exact case IDs are in `probe-case-index.json`; current code/source bindings, finite `artifact-index.json`, and `report-seal.json` support raw replay. No whole-dependency runtime archive was made. `python3 output/replay.py` recreates the trusted test runs inside a new output child and excludes documentary copies.

The Lead must retain all other gate states and obtain a fresh compliant I1 review. This report provides reproducible advisory mechanism findings, not installed implementation proof, global acceptance or release authority.
