# Exec-server Rust type inventory (T1)

Task `DX100-G01:EXEC-WIRE-TYPES`, implemented for Lead inspection/integration,
then independent critique. Authority and acceptance are the exact parent
[types contract](../types-contract.json). This is source evidence, not CVG
runtime implementation, accepted-JSON Schema, executable protocol proof,
qualification, release approval or completion of G01/parity.

All lane writes are confined to this directory. The delegated claim already
exists in the repository coordination document; [claim.json](claim.json)
records this worker's scope. Shared state/log/backlog remain Lead-owned.
No target processes/tests, dependencies, network, descendants, candidates,
lockfiles or application files were used or changed.

## Deliverables and use

- [inventory.json](inventory.json): deterministic machine-readable source inventory.
- [generate.py](generate.py): Python standard-library source reader/generator.
- [verify.py](verify.py): reproducibility, independent public census, source-span,
  ownership/reference, anchor and adversarial controls.
- [verification.json](verification.json): executed checks and explicit limits.
- [manifest.json](manifest.json): parent-contract digest, source digest list,
  every lane artifact's size/SHA-256; manifest excludes itself.
- [handoff.json](handoff.json): bounded completion and ledger delta for Lead.

From the repository root (Python 3, no installs):

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-server/types/generate.py --check
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/exec-server/types/verify.py
```

Both commands are read-only. `generate.py` without `--check` rewrites only
`inventory.json`; `verify.py --record` rewrites only `verification.json` and
`manifest.json`. Run recording after an authorized lane edit, followed by the
read-only verification. `--upstream PATH` can select another local copy of the
same pin. Use `-B` to suppress Python bytecode writes; verifier also suppresses
bytecode before importing the generator. No temporary files are needed.

## Inventory record schema

Format identifier: `exec-server-rust-source-inventory/v1`. This section documents
the evidence record schema; no target JSON Schema is generated or inferred.

| Collection | Meaning |
| --- | --- |
| `sources` | Relative upstream path, full-file SHA-256, byte length, selection role. Ten local `src/*.rs` inputs include three dedicated test files bound but excluded as public API. |
| `types` | Public local struct/enum/type declarations; two private RPC codec support types; 26 explicitly selected imported definitions. Includes module, visibility, scope, role, attributes, serde directives/derives, Rust default derivation, fields/variants/alias target, support references. |
| `fields` | Rust name/type/visibility, enclosing owner ID, attributes/serde directives, source evidence, lexical default metadata, named serde helper bindings, explicit type references. Includes private named/tuple fields and enum payloads. |
| `variants` | Enum owner, variant ID/name/shape, attributes/serde directives, source evidence and payload fields. `#[default]` is separate from serde defaults. |
| `imports` | Lexical `use` source records, including public re-exports. Qualified paths and unresolved transitive names are retained. No Rust compiler resolution is claimed. |
| `support` | Full impl bodies for selected owners, local helper/constant/macro bodies, base64 codec module/functions, private bounded RPC visitor impls, imported permission-profile codec functions. Some impls reference their owner only as input/output; this is evidence association, not exclusively the implementation receiver. |
| `wire_domain_pairs` | Thirteen explicit local wire/domain pairs, stable type IDs, conversion impl/macro evidence. This is not a method direction/dispatch table. |
| `codec_contracts` | Eight source-based codec classes/constraints with type/support evidence references. |
| `unresolved_references` | Every selected field/alias reference that is neither bound to a selected definition nor a recognized standard primitive/container. Unknowns are per owner, not silently erased. |

IDs are `rust:<crate>::<module>::<Type>`, independent of line numbers, iteration
order and hashes. Examples for Lead flow links:

```text
rust:codex_exec_server_protocol::protocol::WireExecParams
rust:codex_exec_server_protocol::protocol::ExecParams
rust:codex_exec_server_protocol::protocol::ExecOutputDeltaNotification
rust:codex_exec_server_protocol::rpc::JSONRPCResponse
rust:codex_file_system::WireFileSystemSandboxContext
```

Field suffixes are `::field:<RustNameOrTupleIndex>`; variant suffixes are
`::variant:<VariantName>` with payload field suffixes. Raw identifiers retain
their Rust spelling (`r#set`, `r#type`). Support IDs are source-path/byte-span
locators, not stable cross-revision API IDs. Source spans are UTF-8 byte offsets
`[start_byte,end_byte_exclusive)`, 1-based inclusive line numbers, exact text
and its SHA-256, plus the full file's SHA-256. All references are upstream paths,
never presumed paths in this repository.

## Wire, defaults and codecs

`WireExecParams` uses `WireFileSystemSandboxContext`; its conversion to
`ExecParams` resolves a missing sandbox policy cwd using process cwd. Ten
filesystem pairs use the preserved `impl_wire_filesystem_request!` source
macro and callback resolver, not that process fallback. The two capability
root pairs resolve each root through their own preserved conversion bodies.
The imported domain context requires `cwd: PathUri`, while the wire context
uses `cwd: Option<PathUri>` plus optional `policy_context`. Mapping a domain
derive to the inbound accepted contract would lose this distinction.

Serde directives are retained verbatim and split into machine-readable
fragments, without evaluating them. `serde_derives` lists derives only;
`JSONRPCMessage`, `PathUri` and `ThreadId` require their custom impl evidence.
`ByteChunk` is transparent with a field codec: its wire value is a STANDARD
base64 string, not an array of integer bytes or the shape of `Arc<Vec<u8>>`.
`ProcessId` is a transparent arbitrary String at this type boundary.
`RequestId` is an untagged String/i64 enum. `ThreadId` uses UUID parsing and
string serialization; its deserializer does not impose UUIDv7.

`PathUri` deserializes through `parse`, which constrains and canonicalizes file
URIs. Its broad string schema does not convey those restrictions. Domain
permission profiles use `exec_permission_profile_serde`, projecting through
`ExecPermissionProfile`; the helper is bound from its separate source file.
Underlying URL/UUID/base64 crate grammars are not executed or expanded here.

`JSONRPCMessage` custom input first bounds JSON value nodes to `256 * 1024`,
then requires an object and dispatches by method/id/result presence. The
private bounded seed/visitor and serde_json private wrapper branches are
preserved. This is different from simply deriving untagged input alternatives.
The envelope structs omit a `jsonrpc` member; the retained version constant
does not create a wire field. Duplicate keys in ordinary visitor maps are
rejected; special raw/number wrapper paths remain visible in source.

`deserialization_default` is lexical metadata, not a requiredness verdict:
explicit `default`, named helper, implicit standard Option omission, or no
explicit default. `EnvironmentInfo.executor_version` binds the exact
`unknown_executor_version()` body (`"0.0.0".to_string()`). A derived Rust
`Default` is separate from field `#[serde(default)]`; enum default markers
for `FsOpenMode`, `HttpRedirectPolicy`, and imported enums are preserved.
Omission on input, serializing null, and `skip_serializing_if` are distinct.
No accepted-nullability/unknown-field/coercion rules are guessed from names.

## Verification and bounds

The recording run executes twelve named checks/groups; read-only verification
adds the thirteenth manifest check. It regenerates twice; independently counts
all 109 public local declarations with a separate line census; checks every
evidence span/hash against real source bytes; checks IDs/owners/helper bindings;
and anchors wire/domain differences, private fields, alias imports, prelude
versus RPC `Result`, serde renames/defaults and codec classes.

Five source mutations run only in memory: type deletion, private wire field
deletion, serde rename mutation, default helper body mutation, codec attribute
mutation. Each must visibly alter extracted content, not just source hashes.
Four additional artifact mutations (type/field/serde/default body) must differ
from fresh complete generation. Manifest verification binds the current file
set and bytes; recording does not validate an old manifest or claim external
approval. `verification.json` is self-verification; Lead and the independent
critic are still required by the handoff.

The inventory binds pin `8d9f6466ff0294785d56f55b1fe363d132fe4133` and SHA-256
source bytes. Verifier checks Git HEAD metadata directly and hashes the actual
read files; it does not attest that those bytes equal Git objects in that
commit. Lead can independently compare the bound source digest list with its
pinned baseline. The parser is deliberately lexical and bounded to this pin:
no macro expansion, cfg evaluation, target codegen, compiler semantic analysis,
handler execution or application testing. Source macros and cfg attributes
remain evidence rather than expanded behavior. Exact regeneration and census
are complementary to manual source inspection, not compiler equivalence.

This is **not full transitive closure**. Twenty unresolved references remain
across fourteen symbols: `CapabilityRootLocation`, `FileSystemAccessMode`,
`FileSystemSandboxEntryMissingPathBehavior`, `FileSystemSpecialPath`,
`NetworkDomainPermissions`, `NetworkMode`, `NetworkSandboxPolicy`,
`NetworkUnixSocketPermissions`, `PermissionProfile`, `SandboxOverride`, `Url`,
`Uuid`, `WindowsSandboxProxySettingsMode`, and `serde_json::Value`. Each keeps
owner and import information. Bodies can mention further types that are not
enumerated as a closed call/type graph. Handler constraints, method directions,
registry and event flows belong to Lead's disjoint lane.
