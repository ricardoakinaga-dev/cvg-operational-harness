# All production extension tool contributors — source evidence

**IMPLEMENTED**, T1. This is the bounded source delivery for
`DX100-G01:EXTENSION-TOOL-CONTRIBUTORS` and its supplemental
`DX100-G01:EXPAND-ALL-PRODUCTION-CONTRIBUTORS`. Lead integration and independent
critique are pending; no self-approved DONE or full G01 closure is claimed.

Both frozen authorities are bound:

- [Base contract](../contributors-contract.json), SHA-256
  `5ee374a5f66e511427808b7d78fc5c764ce697578d05df63ee977f17dd89e41b`.
- [Expansion contract](../contributors-expansion-contract.json), SHA-256
  `6b8601c5cdecc6fd01ee379ba72d580f32f0b8f6f63ec15c914b69afd1f5baa8`.

Upstream is readonly at `/tmp/cvg-rea-codex-20261017/upstream`, commit
`8d9f6466ff0294785d56f55b1fe363d132fe4133`. Parent contracts, catalog and the
lead's pipeline remain outside this worker's write scope.

## Artifacts, archive and reproduction

- [inventory.json](inventory.json): census, all nine production families, tool
  chains, exact evidence and qualified runtime unknowns.
- [reader.py](reader.py) and [expansion.py](expansion.py): standard-library Python
  source reader/checker. Only owned Python and two reviewed lexer functions run.
- [verification.json](verification.json): exact counts, source checks and rejected
  controls; [manifest.json](manifest.json): exact artifact digests, excluding itself.
- [handoff.json](handoff.json): integration keys, all tool IDs, limits and ledger
  deltas; [claim.json](claim.json): lane ownership.
- [development-notes.json](development-notes.json): initial failures, corrections
  and source-review history; these are not independent review receipts.

Before expansion, all **eight** phase-1 files were copied byte for byte into
`historical/phase1/`. Their manifest remains
`181957ff2c799b68cab597677f57b6de0fd0e7a1bd632ba25f1f2cacad29dc7a`.
The original README bytes are retained as
[README.md.txt](historical/phase1/README.md.txt), SHA-256
`933e0e91c6edfa51d39265eb02dac7cb3e345c6404b4d81a6052af90b411d96f`.
No historical bytes were edited to repair relocated links. Original relative
paths, archive paths and every digest appear in `phase1_archive.mapping` in the
inventory/handoff. The archived reader and manifest are historical bytes,
not a portable runnable package. The current manifest and checker verify all
archived files at their mapped paths. All eleven original tools are retained
byte-semantically, and all **836** original evidence scopes retain their IDs and
exact contents.

From the repository root:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/dynamic-factories/contributors/reader.py --check
```

`--check` reads sources/Git objects, regenerates twice, checks canonical output
bytes and the manifest/handoff/archive, and runs in-memory controls. It does not
refresh missing or drifting evidence. Git subprocesses are limited to
`rev-parse` and `ls-tree`; the reader recomputes Git blob IDs using the exact
`blob <length>\0` prefix and worktree bytes. It never imports, compiles or
executes upstream code. Generated schemars output is not evaluated.

The reader loads only the `mask_rust` and `balanced` function AST nodes from
`g01/entrypoints/tools/build_tool_graph.py`, SHA-256
`4ca3f0f0f09fa632281f6f973ce0b141b390cb1302aaaa9d16e850fbb00aafe9`.
It does not execute that module's body. The lexer is not a Rust compiler. The
checker trusts its reviewed implementation and local Python/Git runtime;
integrity hashes do not supply independent approval.

For any new authorized freeze, format this README with the supplied Node 22
Prettier command **before** running `reader.py --freeze`. Normal verification is
`--check`.

## Census and tool identities

| Item                                                    |      Count |
| ------------------------------------------------------- | ---------: |
| Git-bound Rust blobs scanned                            |      5,343 |
| Contributor implementations: production-possible / test |      9 / 6 |
| Registration sites: production-possible / test          |      9 / 7 |
| Contributor/accessor symbol occurrences                 |         70 |
| Expanded production families                            |          9 |
| Expanded tool identities: original / added              |    11 / 21 |
| Exact UTF-8 byte scopes / referenced source files       | 1,146 / 76 |
| Additional Git-bound description assets                 |          2 |
| Model-only / code-mode-eligible preferred exposure      |    11 / 21 |
| Parallel / serial preferred calls                       |    21 / 11 |
| Positive source checks / rejected controls              |    25 / 63 |
| Known returned executor families left unexpanded        |          0 |

The census scans all tracked Rust blobs, masks literals/comments, and recognizes
generic and qualified `ToolContributor` impls and dot-call registration sites.
It separates integration-test paths from explicit cfg-gated modules.
`test_only` combines those classifications; `cfg_test_only` records explicit
cfg/module evidence. `production_possible` identifies a source site, not an
observed installation. Macro expansion, arbitrary import alias resolution,
Cargo feature evaluation and external crate implementations are outside this
lexical census.

| Family                        | Logical tool IDs                                                                                                                                  | Count |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----: |
| Skills                        | `skills.list`, `skills.read`                                                                                                                      |     2 |
| Agent message board           | `agent-message-board.{create_channel,get_channels,list_threads,search_posts,read_thread,read_post,subscribe,unsubscribe,post}`                    |     9 |
| Goal                          | `goal.{get_goal,create_goal,update_goal}`                                                                                                         |     3 |
| Guardian conversation history | `guardian.user_message.{search_messages,read_messages}`                                                                                           |     2 |
| History/Notes                 | `history.{list_windows,list_items,read_item,search_contents}`, `notes.{list_files_by_prefix,read_file,search_contents,append_to_file,write_file}` |     9 |
| Memories                      | `memories.{add_ad_hoc_note,list,read,search}`                                                                                                     |     4 |
| File copy                     | `file-copy.multi_env_copy_file`                                                                                                                   |     1 |
| Image generation              | `image_gen.imagegen`                                                                                                                              |     1 |
| Web search                    | `web.run`                                                                                                                                         |     1 |

These are inventory IDs. Goal/file-copy use plain upstream names. The board's
namespace is supplied by the host at startup. `tools[].namespace` and `name`
preserve that distinction. The original eleven `tools[]` entries remain first.

Stable integration keys are `registry`, `shared_contracts`, `census`, `tools`,
`expanded_families`, `skills`, `board`, `other_production_contributors`,
`source_attestation`, `auxiliary_source_attestation`, `phase1_archive` and
`evidence`. The nine `expanded_families` records link contributor, registration,
factory, tool IDs and remaining qualified unknowns. The legacy seven-record
`other_production_contributors` index now has `status=SOURCE_EXPANDED` and tool
links. `E00001`-style references resolve in `evidence`, with half-open UTF-8
**byte** offsets, raw text, span/file SHA-256 and Git blob ID.

## Contracts and sensitive boundaries

All families bind specs, argument/output structures or schema construction,
serde/schemars attributes, errors/defaults, factory gates and direct handles.
Names and schema match arms come from source; exposure overrides and parallel
flags are checked against their implementations. Source spans retain details
beyond the structured projections.

- **Skills and board:** original chains and shared types/defaults are retained.
  Skills requires thread state plus cloud or selected executor availability.
  The board requires a caller-bound binding and matching tree identity; host
  automatic feature/storage gates have an explicit local-connection exception.
  Description overrides cannot replace bundled parameters. Backend permission
  denials remain structured `success=false` outputs. Read tools and mutations
  have distinct budgets/parallel flags.
- **Goal:** three kind-dispatched executors share typed camelCase output.
  `tools_visible` controls construction; `tools_available` controls direct
  execution. Create trims/validates objective and positive/max token budget;
  update handles Complete/Blocked/Paused and accounting. Some user-intent and
  repeated-block instructions are descriptions, not additional runtime checks.
- **Guardian history:** both known executors are expanded. Their schemas are
  built from current hosted Apps MCP tool metadata, so concrete external schema
  properties remain unknown. The converter's strict/defer defaults are bound.
  Each handle reacquires the parent binding, checks features/host ownership/app
  policy, rejects approval-required calls, and applies the lower output budget.
  The review cap defaults to 4,000 tokens. No second Apps connection is created.
- **History/Notes:** all nine enum actions link their namespace/name, endpoint,
  literal parameter schema and direct handle. Local arguments are a JSON Value;
  the backend requires an object and injects authoritative session/agent context.
  Remote outputs/defaults remain service obligations. The source binds 35-second
  timeout, encrypted-argument/truncation headers, image attachment separation
  and encrypted output handling. Both this family and Guardian are
  `DirectModelOnly`; their eleven tools exclude nested code mode. Instruction
  strings inside target descriptions are evidence, not authority for this task.
- **Memories:** four returned executors bind generic backend request/response
  types, generated input/output schema construction, complete filename regex
  attributes and error variants. Invalid inputs map to RespondToModel; I/O maps
  to Fatal. List/read/search defaults and caps are retained. Ad-hoc note creation
  is a backend write boundary; user-intent prose does not grant capability.
- **File copy:** all four required strings and deny-unknown-fields are bound.
  Direct calls require different, selected environments and absolute paths;
  endpoint `fs()` carries the host's sandbox policy/current grants. I/O errors
  expose only their kind. Interrupted or failed copies may leave partial output.
- **Image generation:** one executor binds generate/edit modes, typed arguments,
  schema/settings, max-five reference rules, transparent default false, image
  output/events, usage-limit errors, saving and attachment upload. Provider/API,
  codecs and returned pixels are not observed. The upstream `LOCAL_FS` save-root
  branch uses sandbox None; that source fact is not CVG authority.
- **Web search:** `web.run` binds the complete eleven-member `SearchCommands`
  contract, nested wire types, schema generation **without compaction**,
  provider/mode gates, defaults, plaintext external-context output and direct
  parse/provider/auth/search errors. Blank arguments produce default commands.
  Remote command semantics/results are not locally proved. Hosted-versus-native
  selection remains in the lead's pipeline.

Registration, factory availability, model exposure, capability authorization
and effects remain separate. Preferred exposure is upstream metadata before
host policy, never a CVG grant. Arbitrary external contributors remain an open
interface obligation even though all nine known production families are
expanded. Runtime MCP schemas, provider/service values, state databases,
filesystem grants and execution behavior are explicitly qualified unknowns.

## Evidence limits and next action

Checks exercise this source reader, its byte/Git bindings and negative controls;
they do not execute upstream tools. New controls remove each added family/tool,
change names and errors, falsify schema/contract/archive qualifications, and
probe required direct-handle source gates/errors in memory. Determinism uses
two reader instances, not an independent reviewer.

Functional receipts remain **zero**. `runtime_catalog_closed=false`,
`full_g01_closure=false`, `cvg_grant=false` and independent review pending remain
explicit. No runtime/application checks, network/install/lock changes,
model/provider calls, resources/candidates, databases/Docker, descendants,
commit/push/deploy or catalog writes occurred. All writes are in this lane.
The lead integrates the package and assigns an independent critic; at most two
actual reworks follow that review. Shared ledger deltas are in the handoff.
