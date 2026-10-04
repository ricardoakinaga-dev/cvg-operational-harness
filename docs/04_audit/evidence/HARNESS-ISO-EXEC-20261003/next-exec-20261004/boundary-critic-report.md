Verdict: **INVALID** for the strictly scoped review protocol. The candidate's technical acceptance criteria are **not met (REJECT)**. The initial test command used the default `/tmp` fixture directory rather than the sole authorized output tree, and process metadata was incidentally read outside the sealed-input scope. I cannot certify this as a completely compliant FINAL Critic execution. The completed, isolated measurements nevertheless provide reproducible candidate rejection evidence; they do not authorize another review, another correction cycle or release.

This is one bounded final review for NEXT-D1/C1. No descendants were created. Sources were not corrected. Canonical and sealed script/test hashes were checked before and after, against the supplied manifest and by independent SHA256 calculation. Test execution uses a source-bound isolated clone with dependencies symlinked read-only by convention; no package installation occurred. All decisive fixtures and raw test/oracle/CLI logs are private under this directory. These fixtures are fake npm layouts, not newly installed real packages.

The most material gap is loss of the Node22 `node:process` capability through a named default import inside a physical transitive dependency. Core imports `outer`, which reexports `bridge`; `bridge/index.mjs` contains:

```js
import {default as host} from 'node:process';
export default host.getBuiltinModule('module').createRequire(import.meta.url)("../../products/shift/src/marker.cjs");
```

The real Node22 oracle prints `SYNTHETIC_PRODUCT_EXECUTED` and exits 0. The checker returns `PASS`, `passed: true`, zero violations and zero diagnostics; CLI exit 0. Its counts for this fixture are 6 source files, 1 core file, 2 workspaces and 6 edges. The identical neutral acquisition prints `SYNTHETIC_NEUTRAL_EXECUTED` and passes. Declarations for the fake packages are neutral, so this specifically defeats physical runtime closure rather than relying on TypeScript pretending the runtime is the same as its declarations. API and CLI return the same wrong result.

Source inspection explains the behavior: `isProcess` recognizes seeded identifiers, global process properties and known process acquisition calls. The named-import seeding loop handles `getBuiltinModule` and `mainModule`, but misses `default as host`; namespace `p.default` also has no process propagation. Dynamic import of `node:process` is not tracked or conservatively refused, while dynamic import of `node:module` is refused. The builtin reference exemption then supplies no physical edge for the missed loader acquisition, and the product remains unreachable in the graph. This reasoning was checked against execution, not treated as a bypass by itself.

Exact read-only reproduction (all paths already exist; no writes required):

```bash
CRITIC_DIR='/home/ricardo/.cache/cvg-harness-next-exec-20261004/boundary-critic'
NODE22='/home/ricardo/.nvm/versions/node/v22.23.2/bin/node'
TMPDIR="$CRITIC_DIR/tmp" "$NODE22" "$CRITIC_DIR/probes/physical-process-named-default-product/packages/core/src/entry.mjs"
TMPDIR="$CRITIC_DIR/tmp" "$NODE22" "$CRITIC_DIR/clone/scripts/check-product-boundary.mjs" "$CRITIC_DIR/probes/physical-process-named-default-product"
```

`bash reproduce.sh` ran both commands successfully; its captured output is `logs/material-reproduction.stdout`. The frozen checker was not modified.

Material SHA256 values:

| Input/output | SHA256 |
| --- | --- |
| `clone/scripts/check-product-boundary.mjs` | `99c4edc50b5214b8cdeb664774e5f37b54d6025b5a8e640a65e0fab61f4cf07a` |
| `clone/tests/product-boundary.test.js` | `76e87a59eba7dd60b78a923c2a273a7533b47cb555b96f0fc9dd052f92b4d5a7` |
| `probes/physical-process-named-default-product/node_modules/bridge/index.mjs` | `9026c04a78928f6b6999670f6aad448957114461bb20085bef91490b14a6e3f5` |
| `logs/physical-process-named-default-product.oracle.stdout` | `5602b22f64c1d281ce1c8fe29e5c64a8718754aa309f92a0c6fa78a2d866e031` |
| `logs/physical-process-named-default-product.cli.stdout` | `5d78806a1b85f2b089c4e27a06b7d59c91dcaddb26189c2ff0f7a6036e00b6d7` |
| `logs/material-reproduction.stdout` | `4958acecce84c188f824459ffeee1e8f4d6d9b83f36801fa53b202336b489853` |

Criterion matrix:

| Criterion | Result | Evidence |
| --- | --- | --- |
| Physical runtime closure | FAIL | Direct and ordinary transitive CJS/ESM and symlink controls behave correctly; three executable product loads concealed in physical mock npm dependencies return PASS. Physical discovery is not sufficient when capability edges disappear. |
| Physical type closure | PASS (bounded) | Fresh type-only outer → inner → product declaration is rejected; neutral counterpart passes. Runtime/type split and missing runtime/types are also exercised. This does not rescue the runtime defect. |
| Unknown closure / target / anchor | FAIL | Recognized loaders refuse nonliteral targets and unknown anchors. Untracked named-default process acquisition returns PASS for environment-selected targets/anchors: two executable product loads and two neutral unknown-closure false PASS cases. |
| Node 22 capability propagation | FAIL | Named-default, namespace .default, nested/default/computed binding, and dynamic node:process namespace acquisition lose capability tracking. Global nested controls work; rest/default-initializer/computed-key, module-default access, main-module receivers and register are conservatively refused. |
| Historic14 | PASS | 14/14 refuse: 11 FAIL, 3 INCOMPLETE. |
| Mandatory accumulated11 | PASS | 11/11 refuse: 6 FAIL, 5 INCOMPLETE (knownR2FalsePass field). |
| All archived/valid controls and positives | PASS | 116/116 match expectations; 57 FAIL, 21 INCOMPLETE, 38 PASS. The four explicitly excluded sealed pilots were not executed or counted. |
| Original assertions / cases | PASS | Original source is byte-exact after removal of the sole 3964-byte insertion at offset 1890. Original suite executes 136/136 PASS; current suite 151/151 PASS; 0 original identities missing, 15 added. These are executed test cases, not a claim that there are only 136 individual expect calls. |
| API / CLI agreement | PASS | All 116 archived and 73 fresh fixture executions agree, including error/exit behavior; installed API and CLI results also agree. They agree on the false PASS results too. |
| Installed scan / HISO-005 global | INCOMPLETE | Node22 frozen-script scan: 2651 source files, 544 core files, 26 workspaces, 9648 edges, 0 violations, 496 diagnostics; CLI exit 1, empty stderr, API status INCOMPLETE. No HISO-005 global acceptance. |
| Hash / artifact sentinels | PASS (measured scope) | Canonical script/tests, all 914 original-manifest files, and complete 1039-file mock-fixture inventory match pre/post. 134 paths include mock node_modules. Clone sources and physical fixture files match the inventories. Real installed dependency tree is not supplied as a hashed inventory. |
| Operational sentinels | PASS | Synthetic markers and mock packages only; no real provider/data, package installation, lock mutation, global install, push, production, canonical/sealed edits, .gauntlet changes or descendant agents. |
| Review write/read scope | FAIL | Initial test invocation omitted TMPDIR and used /tmp through the unchanged fixture helper. A broad process listing exposed unrelated process arguments. Isolated reexecution replaces that run for evidence, but cannot retroactively satisfy WRITE-only / sealed-input-only constraints. |
| Independence I1 / fork_context:false | QUALIFIED | No subagents, context fork, descendants or prior critic/builder reports were opened. Requested fork_context:false is respected at the visible interaction level; launcher configuration is not independently observable. Incidental exposures are disclosed below. |

Fresh adversarial execution totals: 73 fixture executions; 66 valid executable or compiler oracles. Of these, 18 supported neutral positives pass and 36 controls requiring refusal are correctly refused. Twelve cases incorrectly pass: ten demonstrably execute the synthetic product and two execute a neutral module with an unknown target/anchor that must still be INCOMPLETE. No failed oracle is counted as a product load. The oracles execute before checker classification in each probe driver.

The ten product false PASS IDs are:

- `esm-process-namespace-default-product`
- `esm-process-named-default-product`
- `esm-process-nested-default-binding-product`
- `esm-process-computed-default-alias-product`
- `esm-process-dynamic-default-product`
- `physical-process-namespace-default-product`
- `physical-process-named-default-product`
- `physical-process-dynamic-default-product`
- `hidden-process-unknown-target-product`
- `hidden-process-unknown-anchor-product`

The two neutral unknown-closure false PASS IDs are `hidden-process-unknown-target-neutral` and `hidden-process-unknown-anchor-neutral`. Their targets/anchors come from synthetic environment values, not literal expressions understood by the checker. Matching product cases have valid Node22 oracles. Ordinary recognized `createRequire` unknown-target/unknown-anchor controls are refused, so the gap is specifically missed acquisition and propagation, not an API/CLI parsing discrepancy.

Other fresh controls cover direct ESM/CJS product imports, multiple aliases, global/nested/string/computed bindings, default initializers, rest bindings, computed variable keys, getter binding, receiver-correct `mainModule.require` and bound calls, `import.meta.resolve`, Node22 `module.register` with a synthetic loader hook, ordinary physical npm transitive runtime/type closure, runtime/declaration split, missing runtime, missing type closure, type-only transitive declarations and physical npm symlinks. Supported neutral counterparts pass; unsupported capability cases are conservatively refused where detection occurs. Type-only product evidence comes from a real TypeScript Program resolving the product declaration with zero diagnostics, not from claiming executable JS ran in a declaration file.

Four fresh pilot oracles fail and are excluded from product-load counts: two unbound `mainModule.require` cases fail resolution because the receiver is lost, and two CJS `require('node:process').default` cases fail because that default is undefined. These are deliberately distinguished from real ESM default export acquisition. Three additional intentionally missing-runtime/type cases fail their runtime/compiler oracle as expected and are evidence only for correct INCOMPLETE handling. Separately, the four invalid pilots identified in sealed controls.json were excluded outright. No pilot was promoted to successful execution.

The installed scan ran this exact frozen script against the canonical candidate, without executing any candidate provider:

```bash
TMPDIR=/home/ricardo/.cache/cvg-harness-next-exec-20261004/boundary-critic/tmp /home/ricardo/.nvm/versions/node/v22.23.2/bin/node /home/ricardo/.cache/cvg-harness-next-exec-20261004/boundary-critic-inputs/scripts/check-product-boundary.mjs /home/ricardo/.cache/cvg-harness-next-exec-20261004/boundary-candidate
```

The diagnostic distribution is:

| Reason | Count |
| --- | --- |
| UNVERIFIED_MODULE_LOADER_ESCAPE | 342 |
| UNVERIFIED_MODULE_LOADER_PROPERTY | 107 |
| UNVERIFIED_PROCESS_CAPABILITY_PROPERTY | 18 |
| UNVERIFIED_MODULE_LOADER_BINDING | 9 |
| UNRESOLVED_MODULE_REFERENCE | 8 |
| UNVERIFIED_MODULE_LOADER_PRIMITIVE | 8 |
| NON_LITERAL_MODULE_REFERENCE | 3 |
| UNVERIFIED_MODULE_LOADER_BASE | 1 |

Original-manifest integrity covers 914 files, but omitted nested mock node_modules. At the user's explicit integrity-only steering, the supplementary `physical-fixture-inputs-manifest.json` was read and independently compared against a full walk of controls/**, without excluding node_modules. It contains 1039 file/symlink records, including 134 mock node_modules paths; every entry matches, with no missing/extra entries. The original and supplementary inventories, canonical source hashes and sealed bytes are unchanged pre/post. This correction did not change candidate/source/fixture bytes or supply a fix. The supplementary metadata's scope/correction assertions were incidentally visible and were not treated as proof; the actual files were measured. Fingerprint evidence is in hash-before/after.json, physical-hash-before/after.json, clone-verification.json and integrity-summary.json. The installed real dependency tree is outside the supplied cryptographic inventory; I do not claim exhaustive pre/post hashes for it.

Independence I1: no prior critic report, Builder report/rationale, root ledgers, coordination document, previous run directory, .gauntlet/history or canonical docs history was opened. No skill file was loaded outside the sealed allowlist. No context-fork or agent descendant tool was invoked (`fork_context:false` at the visible interaction level); the parent launcher's flag cannot be independently verified here. The authorized inputs themselves disclose historical metadata: the checker's R2 gate comment, manifest preservation/scope claims, controls' origin/history/known-false-PASS labels, and historical references embedded in approved SPEC0180. They were not used as inherited reasoning. The later supplementary inventory metadata was explicitly authorized. The broad process-list exposure contained unrelated executable arguments, not opened reports; it was not used in the assessment. This is still a review-scope deviation, disclosed rather than erased.

The initial Vitest execution, retained as logs/candidate-tests.json plus stdout/stderr, used the unchanged fixture helper's default os.tmpdir() and therefore wrote fixtures outside the authorized directory. Tests have afterEach cleanup, but residue outside the authorized tree was not independently inspected. The isolated rerun and original-suite run set TMPDIR inside this tree and use private cacheDir with native config loading, avoiding writes through the real-dependency symlink. Only the isolated rerun supplies current-suite acceptance evidence. This correction was a validation-procedure correction within the single review, not a source correction or a new critic cycle. It cannot make the first command retroactively compliant; hence the overall INVALID verdict even though technical rejection evidence is clear.

Raw execution logs and structured results remain private: logs/, controls-results.json, probe-results.json, extra-probe-results.json and unknown-probe-results.json. Test body preservation and test identity evidence are in original-preservation.json, original-tests.diff and test-identity-comparison.json. run-controls.mjs and the probe drivers define exactly what was executed. No incremental suspected finding was sent for another fix. This final review is frozen once; no correction/release/production approval follows.
