# C1_PARAMETER_FRESH_STATIC_REVIEW_R3

**REJECT — valid independent review, static scope only.** Four source defects violate lexical identity, declaration ownership or initial-transfer invariants. All 132 supplied inert tests pass; that coverage does not exercise these defects. No native/adversarial or production verdict is granted.

Frozen Source: `/home/ricardo/.cache/cvg-harness-green-20261004/c1-parameter-review-r3/source`. Inventory SHA-256: `ec844a455df6960de4a72916bf0f2da304002d168517bffbf0c1a31d5e4f0434`. The task read was the explicitly authorized `c1-parameter-environment-r3-t2.md` inside this packet. No builder verdict, Root, skills, ledgers/history, prior reports or other packets were consulted.

## Findings

### R3-STATIC-01 (P1, blocking): Destructured body var cells remain merged with parameter cells; initialTransfers becomes a self edge

Source: `scripts/boundary-lexical.mjs` lines 73, 82, 90, 160, 164.

Neutral inert proof (parsed, never executed):

```ts
function f([token = 'parameter'], value = () => token) {
  var [token] = ['body']
  return token
}
```

Expected: Parameter/default closure and body var/return have distinct keys and separate declarations. A one-way initial parameter value copy targets the body cell.

Observed: mjs and mts: all references use cell1; declarations contain both parameter and body BindingElements; transfer target=cell1, parameter=cell1, selfEdge=true. Object and computed object body destructuring reproduce the same defect.

Cause: Collected body.declarations stores the enclosing VariableDeclaration, but TypeScript symbol.declarations contains a BindingElement. Exact includes() fails the belongs test, so the environment override is skipped and the merged binder symbol survives.

Impact: Identity correctness and directed initial-copy precision fail. The neutral symbolic mapping adds body-write-label to the parameter and initializer closure too. Both capability fixed points consume these same identity keys, so their separation premise fails. No native escape or real capability execution is asserted.

Correction required: Classify binding declaration ownership through the containing runtime declaration/environment, and require a distinct target/source transfer key for parameter-expression body vars, preserving actual nested/block shadow declarations.

Exact AST nodes, declarations, positions and cell mappings: `neutral-probes.json#array-binding-default`, `confirm-neutral.json#body-array-binding`, `confirm-neutral.json#body-object-binding`, `confirm-neutral.json#computed-body-binding`. The `#id` suffix identifies a JSON entry, not a URI fragment.

### R3-STATIC-02 (P1, blocking): Catch bindings are collected as body var declarations and can capture references outside the catch scope

Source: `scripts/boundary-lexical.mjs` lines 73, 74, 85, 90, 165.

Neutral inert proof (parsed, never executed):

```ts
function f(token = 'parameter') {
  try {
  } catch (token) {
    read(token)
  }
  return token
}
```

Expected: Catch parameter/use remain a separate lexical identity. Return outside catch resolves to the function parameter. No body-var initial transfer is created when there is no body var.

Observed: mjs and mts: parameter=cell1, catch binding/use=cell2, outside return=cell2. An invented cell1 -> cell2 initial transfer targets the catch binding. With an actual body var, body var and catch key merge instead.

Cause: CatchClause.variableDeclaration satisfies isVariableDeclaration and its parent has no BlockScoped declaration-list flag. The body collector accepts it as a var, and identity assigns body.key to every otherwise matching body reference.

Impact: Both lexical lookup and capability-transfer targets include a cell that is not a body var. Catch scope isolation fails; the outside return has incorrect declarations.

Correction required: Collect only real var declarations under their declaration list, exclude catch lexical declarations, and preserve the TypeScript catch identity separately.

Exact AST nodes, declarations, positions and cell mappings: `neutral-probes.json#catch-shadow`, `confirm-neutral.json#catch-cell`, `confirm-neutral.json#catch-only`. The `#id` suffix identifies a JSON entry, not a URI fragment.

### R3-STATIC-03 (P2, blocking): Simple-parameter body function declaration and its body reference use different identities

Source: `scripts/boundary-lexical.mjs` lines 45, 53, 99, 200.

Neutral inert proof (parsed, never executed):

```ts
function f(token) {
  function token() {}
  return token
}
```

Expected: The function declaration initializes/overwrites the shared simple-parameter runtime binding; a body reference must represent that effective body function value and its declaration. Simple parameter/var sharing must continue to work.

Observed: mjs and mts: parameter=cell1 (Parameter declaration), function declaration=cell2 (FunctionDeclaration), return=cell1. BodyVsReturn=false; no transfer. The original binder body-reference-to-parameter behavior remains when expressions=false.

Cause: Environment correction is gated on parameter expressions; the simple parameter case falls back to the raw checker symbols without repairing body-function precedence.

Impact: Declaration/reference identity and body function precedence remain incorrect for an explicitly in-scope lexical case. The positive simple-var probe does pass.

Correction required: Model simple-parameter shared binding and function initialization precedence consistently, including the body declaration/reference identities, without treating a body function as a parameter-value copy.

Exact AST nodes, declarations, positions and cell mappings: `neutral-probes.json#simple-function`, `confirm-neutral.json#simple-function-precedence`. The `#id` suffix identifies a JSON entry, not a URI fragment.

### R3-STATIC-04 (P2, blocking): Computed names inside erased parameter types create a fictitious parameter-expression environment

Source: `scripts/boundary-lexical.mjs` lines 47, 48, 50, 52, 53, 92.

Neutral inert proof (parsed, never executed):

```ts
function f(token: { ['label']: string }) {
  var token
  return token
}
```

Expected: The type annotation is erased. The runtime parameter list is simple; parameter and body var share one key, with no separate initial transfer.

Observed: mts: parameter=cell1, body var/return=cell2; a cell1 -> cell2 transfer is created. Nested Array<{["label"]:string}> type reproduces the defect.

Cause: parameterExpressions recursively scans type syntax and marks every ComputedPropertyName as an expression, without respecting runtime/value erasure.

Impact: Value/type erasure and simple-parameter sharing fail even for neutral scalar input. Six neutral analyzer controls still pass, so this is specifically a lexical/transfer invariant failure.

Correction required: Detect ContainsExpression in emitted parameter binding syntax and initializers, excluding all erased type/declaration syntax.

Exact AST nodes, declarations, positions and cell mappings: `neutral-probes.json#erased-type-computed`, `neutral-probes.json#erased-type-array`, `confirm-neutral.json#erased-computed-type`. The `#id` suffix identifies a JSON entry, not a URI fragment.

## Both capability fixed points

AST inspection confirms the directed transfer loops occur inside `while (changed)`:

```js
// scripts/check-product-boundary.mjs:774
for (const [body, parameter] of lexical.initialTransfers)
  bind(identity(body), parameter)

// scripts/boundary-code-execution.mjs:353
for (const [body, parameter] of lexical.initialTransfers)
  record(identity(body), classify(parameter))
```

Those loops are present and directed correctly for distinct keys. They cannot repair a self edge or incorrectly owned declaration returned by the shared lexical helper. The neutral symbolic proof seeds a parameter label and then a separate body label: destructuring causes both labels to appear in the parameter/default closure cell, proving identity contamination without evaluating source text. This is a mapping proof, not a claim about native behavior or a demonstrated capability escape.

## Verification and exact evidence

- Supplied suite: **132/132 passed**, one test file, exit 0. Includes 61 neutral controls, 61 unknown controls requiring `INCOMPLETE`/`passed=false` and a reason, and 10 identity/environment checks. Unmodified test SHA-256: `cc500112e5c39584976504d4ecb21783c2eda1c396ba6ede79a7d30d4a1cf7d2`.
- Independent first probes: **27/32 passed**, five failed checks across four defect families; exit 1 intentionally records failed review assertions. Six own neutral analyzer controls pass. Exact input text, mappings and checks: [neutral-probes.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `neutral-probes.json`); console output: [neutral-probes.log](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `neutral-probes.log`).
- Expanded confirmations: **13 parse-only cases, zero parse diagnostics**, including `.mjs`/`.mts` body array/object/computed destructuring, catch with/without body var, simple function precedence and an erased computed type. [confirm-neutral.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `confirm-neutral.json`) and [confirm-neutral-expanded.log](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `confirm-neutral-expanded.log`) contain exact outputs. They are observational confirmations, not an all-green acceptance test.
- Positive invariants verified in the first probes include simple-var/rest/destructuring-without-expression sharing; direct default parameter/body-var separation and one-way copying; body function precedence with expression parameters and var/function declaration ordering; nested closures/defaults/body environments; block function/let shadows; computed parameter binding; outer initializer resolution; scalar own metadata and neutral reexports. Failed variants are reported above.
- Supplied test outputs: [supplied-tests.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `supplied-tests.json`), [supplied-tests.log](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `supplied-tests.log`). No original native code-execution suite was copied or run.

Runtime used the approved readonly executable `/home/ricardo/.nvm/versions/node/v22.23.2/bin/node` (v22.23.2). Dependencies and the four scanner modules/test were physically copied to `output/runtime`; all vendor symlinks were omitted. Runtime inode and link checks found zero shared Source inodes and zero runtime links. All 17,351 copied regular files retained frozen hashes after execution. `env -i` set HOME, TMPDIR and caches entirely inside output. Source/node_modules was never executed or used for cache.

The scanner's existing fixed trusted Node `--eval` helper resolves filenames only; it never imports or evaluates fixture contents. The allowed supplied tests and own neutral reexport scans can invoke that resolver. Independent identity confirmations only inspect AST/checker mappings and symbolic neutral labels. No generated fixture was imported, invoked or evaluated.

Full executable command strings and exit codes are in [commands.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `commands.json`). In particular, the supplied suite ran from `/home/ricardo/.cache/cvg-harness-green-20261004/c1-parameter-review-r3/output/runtime`:

```sh
env -i PATH=/home/ricardo/.nvm/versions/node/v22.23.2/bin:/usr/bin:/bin HOME=/home/ricardo/.cache/cvg-harness-green-20261004/c1-parameter-review-r3/output/home TMPDIR=/home/ricardo/.cache/cvg-harness-green-20261004/c1-parameter-review-r3/output/tmp XDG_CACHE_HOME=/home/ricardo/.cache/cvg-harness-green-20261004/c1-parameter-review-r3/output/cache npm_config_cache=/home/ricardo/.cache/cvg-harness-green-20261004/c1-parameter-review-r3/output/cache/npm /home/ricardo/.nvm/versions/node/v22.23.2/bin/node node_modules/vitest/vitest.mjs run --config vitest.review.config.mjs --reporter=verbose --reporter=json --outputFile=../supplied-tests.json > ../supplied-tests.log 2>&1
```

The initial before snapshot command is preserved verbatim in [integrity-before-command.txt](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `integrity-before-command.txt`). Final integrity command:

```sh
python3 /home/ricardo/.cache/cvg-harness-green-20261004/c1-parameter-review-r3/output/integrity.py > /home/ricardo/.cache/cvg-harness-green-20261004/c1-parameter-review-r3/output/integrity-after.log
```

## Source integrity and cleanup

**Complete before/after integrity: unchanged.**

```json
{
  "snapshotEntriesBefore": 21352,
  "snapshotEntriesAfter": 21352,
  "regularFiles": 19334,
  "links": 48,
  "directories": 1970,
  "frozenEntries": 19382,
  "inventorySha256": "ec844a455df6960de4a72916bf0f2da304002d168517bffbf0c1a31d5e4f0434",
  "beforeSnapshotSha256": "6383086c94ce142169a8d5abeb0347fe502d91bc0284b67b02c7d1e7e34ffd44",
  "afterSnapshotSha256": "6383086c94ce142169a8d5abeb0347fe502d91bc0284b67b02c7d1e7e34ffd44",
  "fullMetadataDifferences": 0,
  "frozenContentDifferences": 0,
  "outputSharedSourceInodes": [],
  "outputSymlinks": [],
  "valid": true
}
```

Comparison includes device/inode, mode, link count, size, file and directory nanosecond mtimes/ctimes, regular-file SHA-256 and symlink targets. It covers the Source root and all descendants, including original tests, schemas, roots, vendor, dist, bar and hashes. No symlink traversal. The inventory count includes 19,334 regular files and 48 links. Exact evidence: [integrity-before.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `integrity-before.json`), [integrity-after.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `integrity-after.json`), [integrity-summary.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `integrity-summary.json`), [integrity-differences.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `integrity-differences.json`), [integrity-after.log](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `integrity-after.log`), [runtime-isolation.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `runtime-isolation.json`), [runtime-execution-integrity.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `runtime-execution-integrity.json`).

Two local comparator bookkeeping corrections are documented in `report.json`: the first inventory comparison used `symlink` rather than the frozen `link` label; the first runtime comparison included the reviewer's own synthetic package.json. Corrected comparisons are exact; neither correction changed Source or hid a source-content mismatch. Initial diagnostic artifacts remain available.

Cleanup removed only this review's copied dependencies, HOME, tmp and caches; [cleanup.json](c1-parameter-review-r3-reject-raw-evidence.tar.gz) (arquivo interno `cleanup.json`) lists exact paths. Copied scanner/test text, neutral proof scripts/fixtures and evidence are retained. No Root/source file, original test, schema, lockfile, vendor, bar or repository ledger was changed. No provider/env inspection, PG, Docker, network, subagent, commit, push, deploy or production action occurred.

## Remaining uncertainty

61 supplied unknown controls remain `INCOMPLETE`, not PASS. The whole installed repository scanner was not run: broader installed/frontier assurance remains **INCOMPLETE**. The 132 green inert cases and six neutral controls grant no native/adversarial/integrated/release claim. Correct the four defects and obtain a new independent static review; integrated gates remain separately required.

Cópia de leitura: links internos apontam ao arquivo de evidências; originais byte a byte e hashes individuais estão no manifesto.
