# Python public SDK source contracts

Delivery: **IMPLEMENTED**, T1, pending the fresh critic and parent integration
reserved to Lead. Task `DX100-G01:PYTHON-PUBLIC-SDK-CONTRACTS` follows the frozen
[parent contract](../contract.json) and [child contract](../python-contract.json).
This package grants no approval, native parity, G01 closure, release or authority
from SPEC0235/0236. Functional receipts remain zero; receipt remains null.

The [inventory](inventory.json) authenticates 37 Python/support/documentation
sources against Git blobs at `8d9f6466ff0294785d56f55b1fe363d132fe4133` and
the read-only `/tmp/cvg-rea-codex-20261017/upstream` tree. Twenty-eight Python
census sources plus twelve TS census sources retain the parent's 40 identities;
nine additional tracked bootstrap/packaging/documentation files have explicit
scope dispositions. TS identities are authenticated only; Lead owns TS analysis.
No source text acts as instructions.

The reader covers 27 Python modules, 1,542 declarations (including support and
nested callbacks), 4,438 class field declarations, 37 root exports, all 63
historical member candidates, 1,543 call candidates, 25 lexical RPC callsites
(four dynamic, including forwarding/callback syntax), 216 lifecycle entries and
85 notification declarations. These counts are syntax inventories. Imported
stdlib/third-party names and build/codegen helpers remain support metadata.

The reported generated-model count of 1,075 is preserved as an OPEN discrepancy.
The pinned `generated/v2_all.py` AST has 1,056 classes, one top-level assignment
and four methods: 1,057 top-level declarations / 1,061 including methods, matching
the accepted earlier generated-definition records. No historical record is
removed to reconcile the reported count.

## Reading and joins

[schema.json](schema.json) is a closed-root JSON Schema 2020-12 description. Its
source span definition requires Git blob identity, SHA-256, byte and line bounds.
The stdlib reader checks complete nested artifacts by deterministic regeneration;
it does not depend on an external JSON Schema validator.

Inventory root keys:

```text
schema_version task status pin parent_contract_sha256 contract_sha256
catalog_sha256 baseline_sha256 sources authenticated_ts_census_not_analyzed
previous_packages modules definitions imports root_exports baseline_public_api
call_edges rpc rpc_method_parameters notification_registry packaging lifecycle
owner_joins open_gaps census_discrepancy version_boundary limitations counts
functional_receipts receipt full_g01_closure full_codex_parity_claim
```

| Join                                                | Meaning                                                                                                                       |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `sources[].path` + `git_blob`                       | Authenticated source file; SHA-256 is the whole-file hash.                                                                    |
| `source.path`, `git_blob`, `byte_start`, `byte_end` | Half-open UTF-8 byte span; `source.sha256` hashes the slice. Lines are one-based inclusive. This tuple is the source join ID. |
| `definitions[].id`                                  | Qualified module/class/member declaration name. Repeated or guarded declarations remain explicitly OPEN.                      |
| `root_exports[].chain/targets`                      | Import chain from public name to declaration; external/dynamic/cyclic targets retain OPEN dispositions.                       |
| `PYROOT:<export>`                                   | Lossless accepted baseline record plus real definition and member joins.                                                      |
| `type_references[].targets`                         | Outgoing alias/annotation/base reference edges. Follow transitively; cycles and ambiguous string literals remain explicit.    |
| `call_edges[].from/to_candidates`                   | Lexical receiver/constructor/annotation candidates, never proof of dispatch. Empty targets are OPEN.                          |
| `rpc[].from`                                        | Caller declaration, exact call arguments, literal/dynamic method, response model and forwarding/deferred-lambda syntax.       |
| `PYNOTIFY:<quoted method>`                          | Notification method/model declaration; model joins target generated definitions.                                              |
| `PYFLOW:<definition>`                               | Lifecycle/body reference with lexical tags and full control/call/assignment facts in the definition.                          |
| `PYPACK:<path>`                                     | Packaging/bootstrap/codegen/documentation source or parsed TOML declaration.                                                  |
| `PYOWNER:<historical behavior ID>`                  | Retained D01/A01/Z02 owner/requirement record and overlapping source candidates; method semantic ownership stays OPEN.        |

`definitions` distinguish positional-only, positional-or-keyword, keyword-only,
variadic parameters, syntactic defaults, annotations, returns, async, decorators,
class bases, fields, `Field`/`field` keyword declarations and `model_config`.
Constructors synthesized by Pydantic/dataclasses, C3 MRO, Enum/RootModel behavior,
decorators, factories, union normalization and inherited runtime members are never
evaluated. `required_syntax` describes the presence of an assignment, not runtime
requiredness. Class base joins retain explicit MRO OPEN status.

The low-level client, async facade, router, run/login/goal subscriptions, request
UUID/waiter registration/discard/pop, message parsing, response/error fanout,
server requests, approval callbacks, transport close and cancel/interrupt bodies
are present as source declarations and controls. Await, exception, finally,
context manager and callback facts do not establish execution order or outcomes.

Packaging is separate from API qualification. TOML build backends, hatch hook,
runtime bootstrap, runtime requirements, release/generator helpers, package
metadata paths and platform selector branches are retained without invocation.
Source CLI dependency `0.153.4` and user-reported installed companion `0.163.0`
neither authenticate an executable built from this Git pin. All six accepted gap
IDs remain OPEN, with additive Python source progress; `GAP-TS-LANGUAGE` belongs
to Lead's TS lane. The 487+22 normative catalog and ten earlier packets (460
files plus ten manifests) are checked as immutable inputs.

## Reproduce

From this directory, using Python 3.11+ (stdlib `tomllib`):

```sh
python3 reader.py --check
python3 reader.py --self-test
python3 reader.py --links
```

`--check` has no write path: it authenticates contracts, recon inputs, catalog,
prior package files and source blobs, derives the inventory twice in memory,
checks every source span, compares the inventory/schema/verification, checks the
strict manifest and scoped links, and compares lane snapshots before/after.
No target import, SDK/decorator/default/Pydantic execution, `exec`, `eval`, hatch,
build, codegen, network, installation or old audit helper is used.

`--self-test` runs only this reader's semantic and tamper controls. In-memory source
mutations change derived signatures, defaults, aliases, async, lifecycle calls,
RPC literal/dynamic/forwarded selectors, decorators, errors, correlation,
notification registry, field factories, return types, members and unknown syntax.
Known-bad artifacts and strict manifests must be rejected. This is reader evidence,
not functional SDK receipts.

`--write` replaces only `inventory.json`, `schema.json`, `verification.json` in
this lane. `--seal` is an explicit write mode for `manifest.json`; it requires
all deliverables, matching derived artifacts and valid links. Run scoped Node22
Prettier with `--ignore-path /dev/null` and own links before sealing. The exact
file allowlist rejects extras, missing files, directories, symlinks, duplicate or
traversing manifest paths, unexpected keys, modes, sizes and digest changes.
The manifest excludes only itself; its SHA-256 is reported to Lead externally.

See [handoff](handoff.md), [verification](verification.json),
[preserved failures](failures.json) and [strict manifest](manifest.json).
