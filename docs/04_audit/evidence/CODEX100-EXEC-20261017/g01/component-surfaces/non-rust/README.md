# Non-Rust public surfaces — DX100-G01

Status: **IMPLEMENTED, independent review pending**. This is T1 source evidence at
Git pin `8d9f6466ff0294785d56f55b1fe363d132fe4133`, under the
[frozen contract](../non-rust-contract.json). There are zero functional receipts;
G01, all 49 cards, 22 families, 487 functional obligations and 22 controls remain
open. The normative catalog and shared ledgers were read only.

[inventory.json](inventory.json) retains 101 source files with Git blob IDs and
SHA-256, and exact half-open UTF-8 byte spans with line ranges and SHA-256. Python
is parsed with stdlib AST; TOML with `tomllib`; no target import, execution,
compilation, application tests, network or installation occurred.

| Surface                 | Inventory                                                                        |
| ----------------------- | -------------------------------------------------------------------------------- |
| Manifests               | All 8 discovered by the complete pinned Git tree census                          |
| Python                  | 23 modules, 37 root `__all__` exports and 37 `types.__all__` exports             |
| Python declarations     | 1,421 definitions, 1,106 classes, 238 methods, 73 async functions/methods        |
| Models and attributes   | 1,056 generated classes, 4,431 class fields/assignments, 88 instance assignments |
| Python special behavior | 4 generated classmethods, 2 explicit properties, zero lazy attribute hooks       |
| RPC                     | 21 direct method bindings; source partial transitive graph retained              |
| TypeScript              | Original 34 public export records preserved verbatim and source-bound            |
| Utilities               | 20 packaging/release tools, 21 development tools, 14 development/test helpers    |
| Utility CLI parsing     | 87 argparse options and 3 subcommands, including expressions/defaults            |
| Platforms               | Six Python bootstrap assets plus the npm CLI, proxy and TS target selectors      |

Declaration counts include private support and generated code; they are not
counts of distinct root public APIs. `python.root_public_api` projects each root
export to its definition, public members and fields. `python.modules` distinguishes
root public exports, private support and importable generated namespaces. All
generated definitions, aliases, annotations, `Field` expressions, defaults and
classmethods are retained; inherited Pydantic methods remain an explicit open
contract. No module-level `__getattr__`/`__getattribute__` hook was found. The lazy
initialization and metadata property of `AsyncCodex` are separately retained.

The eight manifest paths are:

- `package.json`
- `codex-cli/package.json`
- `codex-rs/responses-api-proxy/npm/package.json`
- `sdk/typescript/package.json`
- `sdk/python/pyproject.toml`
- `sdk/python-runtime/pyproject.toml`
- `scripts/pyproject.toml`
- `scripts/codex_package/smoke_tests/pyproject.toml`

The proxy path includes `codex-rs/`; it is a JavaScript wrapper in this lane.
Root `private: true` identifies repository maintenance. Smoke-test
`tool.uv.package=false` identifies a development environment. Both retain their
actual tools and entrypoints. Absence of a `project.scripts` table is not treated
as absence of CLI utilities. The TS `dist` exports are bound to the checked-in
`src/index.ts` and build configuration; generated distribution files were not
built or assumed present.

Staging changes dependency metadata: the npm CLI builder creates six optional
dependency aliases pointing to platform versions of `@openai/codex`; platform
packages receive `os`/`cpu` and vendor payload metadata. The staged TS SDK removes
`prepare` and adds its `@openai/codex` runtime dependency. These are source
transformations, not absent dependencies inferred from checked-in manifests.
`packaging` retains the constants, target/variant dictionary keys and selected
function statements/signatures from staging and layout sources, including
`codex`/`codex-app-server` variants and GNU/musl release targets. Python staging
checks native CLI and code-mode host layout; presence checks do not authenticate
the payload.

| Capability ownership             | Mandatory language contracts proposed for later qualification                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `DX100-D01` / `CDX100-09-01..05` | Python sync/async high-level APIs, signatures, input conversion, streams, lifecycle, retries/errors; TS exec/JSONL and cancellation |
| `DX100-A01` / `CDX100-08-01..05` | Python stdio App Server transport, typed models, defaults/aliases, generic RPC, approvals and notification routing                  |
| Existing RPC owners              | Each direct RPC binding points to its existing catalog ID and owner, including session, goal, context, model and account owners     |
| `DX100-N01`                      | Python login/account handles, sync/async cancellation and completion                                                                |
| `DX100-Z02` / `CDX100-22-07..08` | Native runtime selection, wheels, npm wrappers, bootstrap, release tools, platforms and artifact provenance                         |

These mappings are proposed language variants, not qualification by shared name.
Python launches `app-server --listen stdio://`; TS launches
`exec --experimental-json`. Inventoried TS behavior cannot discharge Python
async/App Server obligations. Six explicit `open_contracts` preserve API, RPC,
generated-model, provenance, TS behavior and platform/package gaps for the Lead;
no normative catalog edits were made.

The SDK source project version (`0.0.0-dev`), runtime dependency (`0.153.4`),
selected-field minimum version (`0.151.0`) and Git pin are separate identities.
The bundled runtime helper checks metadata/binary file presence; that does not
authenticate executable bytes or protocol compatibility. The runtime wheel hook
rejects sdists and selects a platform tag. The bootstrap, normalization and schema
generation/staging code are inspected only. No binary or wheel was inspected or
qualified. Minimum-version/checkout-schema checks cover selected newer fields,
not blanket generated-model equivalence.

Reproduce with Python 3.11+ (stdlib `tomllib`), from the repository root:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/non-rust/reader.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/component-surfaces/non-rust/verify.py
```

Both commands are read-only. An optional `--source` accepts another local checkout
only if its HEAD and each inspected Git blob match the pin. `reader.py` without
`--check` regenerates only this lane's inventory/verification; `--seal` writes only
its own manifest. Format only this README with the required Node 22 Prettier
command before sealing.

[verification.json](verification.json) records eleven positive static checks and
26 in-memory negative controls. Missing exports/manifests, signatures/defaults,
entrypoints, model defaults, platform assets/conditions/targets, runtime pin,
source/span identity, RPC binding, async erasure, false provenance and false
qualification must be rejected. Controls run through the semantic/source identity
validator or the same canonical re-extraction comparison used by `--check`; they
do not mutate source or run target tests. [verify.py](verify.py) independently
checks artifact hashes, every source against the pinned Git tree, all span
occurrences, original TS records and protected catalog identity with a separate
byte/line algorithm. This is a self-check, not independent agent review.

The callgraph records source-bound candidates for named receivers and thread
offload references. Generic method strings, callbacks, dynamic dispatch and
inherited runtime semantics remain open. Static syntax/defaults are not evaluated
Pydantic contracts. All language behavior and full parent scope remain mandatory.
Next action: the Lead obtains an independent critic, integrates proposed variants
and preserves the six open contracts; this worker has no descendants or authority
to self-approve DONE.

See [handoff.json](handoff.json) and [manifest.json](manifest.json).
