Os links locais abaixo apontam para o arquivo compactado. Os caminhos originais e bytes exatos estão no [manifesto](c1-workspace-local-review-r11-reject-artifact-manifest.json); o relatório bruto e seus links relativos estão preservados dentro dele.

**REJECT — scoped independent checker/source review.**

Bound to frozen inventory `81eb9dcaca58eec1b28ddc3cb42a1a8d4fd354f615f9c870ca4f000ec4222ecc` (19,383 entries). Two high-severity closure failures allow false `PASS`. Two additional compatibility failures affect local-reference identity and JavaScript syntax validation. No Source implementation was edited.

Supplied static cases: **476/476 passed**, zero skipped/pending or failed. Independent evidence: **87 metadata/checker cases + 21 syntax discriminants + 8 explicit lexical identity assertions = 116 unique assertions**. There are **41 expectation mismatches: 39 false PASS and 2 incorrect INCOMPLETE classifications**. The eight lexical identity assertions passed. Harness exit 0 records completion and does not erase those mismatches. Repeated successful static runs do not inflate the 476-case denominator.

**F1 — P1 (high): Relative source imports omit the owning workspace and its declared dependency closure.**

Frozen source locations: `source/scripts/check-product-boundary.mjs:316`, `source/scripts/check-product-boundary.mjs:392`, `source/scripts/check-product-boundary.mjs:1425`.

localTarget attaches the manifest node only when the owner is a product. A relative core import into a declared legacy/tools/scripts/examples/config workspace therefore reaches a single file, while the manifest dependency edges and workspace source frontier remain unreachable. Diagnostics from that frontier are then deleted. Eight product-dependency witnesses produce PASS; the matching declared-dependency controls produce FAIL. An unknown in another file of the reached workspace is also discarded.

Expected: Core -> relative workspace source -> workspace package dependencies -> product must FAIL; reachable workspace-frontier unknowns must remain INCOMPLETE.

Native witnesses: `relative-legacy-dependencies`: expected FAIL, observed PASS, checker CLI exit 0; `bare-legacy-dependencies`: expected FAIL, observed FAIL, checker CLI exit 1; `relative-legacy-devDependencies`: expected FAIL, observed PASS, checker CLI exit 0; `relative-legacy-optionalDependencies`: expected FAIL, observed PASS, checker CLI exit 0. All observations and full stdout/stderr are preserved in [independent-probes.json](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [independent-probes.log](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz).

Connect each resolved workspace owner consistently to the reachable graph, retaining its metadata dependencies and owned frontier diagnostics.

**F2 — P1 (high): Metadata actor scope does not extend to reached source package contexts and local-reference actors.**

Frozen source locations: `source/scripts/check-product-boundary.mjs:302`, `source/scripts/boundary-manifests.mjs:87`, `source/scripts/boundary-manifests.mjs:123`.

Resolved source files outside the fixed actor roots are added to the source graph without reading their physical package contexts. Recursive local references read the target package.json but do not census the newly referenced actor. Consequently malformed contexts, invalid npm aliases and missing nested local dependencies pass on relative imports; nested dist/package.json in a contained locally referenced actor also passes. Twelve new witnesses returned PASS with empty diagnostics and CLI exit 0. Synthetic docs/archive is newly authored mock data; no frozen documentary narrative was inspected.

Expected: A package context becomes governed metadata when core source references enter it. A contained file/link package reference extends physical actor metadata census, including nested dist. Invalid shape, aliases, or missing recursive references must block.

Native witnesses: `reached-context-local-array`: expected ERROR, observed PASS, checker CLI exit 0; `reached-context-local-invalid-dependency`: expected ERROR, observed PASS, checker CLI exit 0; `reached-context-local-invalid-alias`: expected ERROR, observed PASS, checker CLI exit 0; `reached-context-auxiliary-array`: expected ERROR, observed PASS, checker CLI exit 0. All observations and full stdout/stderr are preserved in [independent-extension.json](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [independent-extension.log](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz).

Validate the physical ancestor package contexts of effective resolved source and extend contained actor census at recursive local edges, with cycle handling. Keep unreferenced documentary metadata outside the active scope.

**F3 — P2 (medium): Local reference validation and graph resolution disagree on percent encoding.**

Frozen source locations: `source/scripts/check-product-boundary.mjs:408`, `source/scripts/boundary-manifests.mjs:106`.

The manifest reader decodes local file URLs with fileURLToPath. The dependency graph separately interprets the same suffix as a raw filesystem string with path.resolve. file:../../auxiliary/%62ridge is validated as the existing declared auxiliary/bridge workspace, then loses that identity in the graph and reports UNVERIFIED_LOCAL_DEPENDENCY. A neutral workspace is incorrectly INCOMPLETE; a product edge is misclassified INCOMPLETE rather than FAIL. This remains blocking, so it is a compatibility/diagnostic correctness issue, not a false-green escape.

Expected: Both stages must use the same canonical physical local package identity. The neutral control must PASS; the product control must FAIL.

Native witnesses: `file-product`: expected FAIL, observed FAIL, checker CLI exit 1; `link-product`: expected FAIL, observed FAIL, checker CLI exit 1; `url-percent`: expected FAIL, observed INCOMPLETE, checker CLI exit 1; `url-absolute`: expected FAIL, observed FAIL, checker CLI exit 1. All observations and full stdout/stderr are preserved in [independent-probes.json](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [independent-extension.json](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz).

Use the validated localPackage result for graph resolution instead of a second raw-path parser.

**F4 — P2 (medium): JavaScript-only syntax errors are invisible to the parseDiagnostics gate.**

Frozen source locations: `source/scripts/check-product-boundary.mjs:530`, `source/scripts/boundary-lexical.mjs:309`.

TypeScript createSourceFile.parseDiagnostics accepts TypeScript-only constructs when parsing JavaScript. The checker never asks for JavaScript syntactic diagnostics and may erase those constructs as type-only. Eighteen inert label files across .js/.mjs/.cjs returned PASS and native checker exit 0, although Node 22 --check exited 1 and the installed TypeScript compiler reported TS8006/8009/8010/8016/8037. Neutral label controls passed both parsers. This demonstrates invalid input acceptance; no fixture was executed and no executable isolation bypass is claimed.

Expected: Unsupported/invalid JavaScript source syntax must produce a blocking SOURCE_PARSE_ERROR or another honest INCOMPLETE diagnostic.

Native witnesses: `typed-label-mjs`: expected INCOMPLETE, observed PASS, checker CLI exit 0; `satisfies-label-mjs`: expected INCOMPLETE, observed PASS, checker CLI exit 0; `neutral-label-mjs`: expected PASS, observed PASS, checker CLI exit 0; `interface-label-js`: expected INCOMPLETE, observed PASS, checker CLI exit 0. All observations and full stdout/stderr are preserved in [independent-syntax.json](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [independent-syntax.log](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz).

Validate each source file using syntactic diagnostics appropriate to its declared language before relying on type erasure or lexical identity.

Controls retained global active-actor manifest validation, nested dist metadata rejection in standard active roots, invalid recursive local-child rejection, declared-workspace discovery, npm semver/tag aliases, contained cycles, reached unknown/parse diagnostics, and unreferenced documentary metadata exclusion. The new findings concern additional entry routes and language grammar; no existing bar or assertion was weakened.

Before/after sealed verification passed with zero discrepancies. Source, dependencies, dist and metadata (all recorded file/directory modes and mtimes) have identical hashes. See [integrity comparison](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [before](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [after](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz) and [runtime input proof](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz). All 48 original runtime links resolve within the physical copy. Reviewed checker/helper/static-test/manifest/lockfile/semver bytes match the seal. Direct declared, lock-root declared, installed and locked semver are **7.7.4**; no install or resolution change occurred.

Final native runs and resolver children inherited the kernel network-denial policy. Separate TCP/UDP IPv4/IPv6 probes returned EPERM before networking; the JS guard blocked network/DNS APIs and proved pg ESM identity `C1_R11_PHYSICAL_PG_MOCK` before any potential producer import. No DB producer was imported. No fixture evaluator/process/worker/vm payload, exported seed, original executing test suite, provider, database, real data, secret, deployment or push was exercised. Vitest ordinary runner threads and fixed trusted CLI resolver/syntax children were infrastructure only. Work stayed under this packet/output; shared Root and opaque Source histories/ledgers/coordination/skills were not read as judgments.

Commands, exit observations and finite full logs are preserved in [commands](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [logs](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), the three independent JSON result files, [static Vitest JSON](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [lexical assertions](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [guard proof](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), [native network proof](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz), and [artifact hashes](c1-workspace-local-review-r11-reject-raw-evidence.tar.gz). Original boundary suites were hash-only. Initial verifier-schema and DNS-getter instrumentation failures are preserved and explained in report.json; neither reflects a Source mutation or relaxed assertion.

This verdict applies only to the frozen checker/source scope. The user-reported installed 1610 was not independently measured, accepted or excepted. Every reachable unknown remains blocking. No global acceptance or release is granted, and this finite corpus cannot exclude other bugs.
