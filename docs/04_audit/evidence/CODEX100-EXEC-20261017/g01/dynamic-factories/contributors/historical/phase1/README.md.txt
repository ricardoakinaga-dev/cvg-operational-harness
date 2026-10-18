# Extension tool contributors — bounded source evidence

`DX100-G01:EXTENSION-TOOL-CONTRIBUTORS`, T1, **IMPLEMENTED**. Independent
review and lead integration are pending. The frozen contract is
[contributors-contract.json](../contributors-contract.json), SHA-256
`5ee374a5f66e511427808b7d78fc5c764ce697578d05df63ee977f17dd89e41b`.
Upstream is the readonly local tree at
`/tmp/cvg-rea-codex-20261017/upstream`, commit
`8d9f6466ff0294785d56f55b1fe363d132fe4133`.

The inventory binds the registry builder's registration method and default,
the registry accessor, the `ToolContributor` trait and its default
`tools_for_step` fallback. It follows Skills and agent-message-board through
returned factories, executors, names, schema construction, input/output types,
errors, defaults, preferred exposure and direct handle boundaries.

## Artifacts and reproduction

- [inventory.json](inventory.json): source census, selected tool chains and gaps.
- [reader.py](reader.py): deterministic Python standard-library reader/checker.
- [verification.json](verification.json): source checks, counts and negative controls.
- [manifest.json](manifest.json): exact artifact SHA-256 digests, excluding itself.
- [handoff.json](handoff.json): integration keys, tool IDs, ledger deltas and limits.
- [claim.json](claim.json): lane ownership; [development notes](development-notes.json)
  preserve initial reader failures and their corrections.

From the repository root:

```sh
python3 -B docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/dynamic-factories/contributors/reader.py --check
```

`--check` only reads files and Git objects. It reconstructs the inventory twice,
checks canonical bytes, validates the handoff and manifest, and runs in-memory
negative controls. It does not execute target code. Git subprocesses are limited
to `rev-parse` and `ls-tree`; blob IDs are independently recomputed from the
worktree bytes with Git's `blob <length>\0` header. All 5,343 tracked Rust blobs
must match their objects at the pin. Each evidence entry has exact half-open
UTF-8 **byte** offsets, decoded text, span SHA-256, file SHA-256 and Git blob ID.
Offsets are not Python character positions. No generated Rust schema is executed.

The reader loads only the reviewed `mask_rust` and `balanced` function AST nodes
from `g01/entrypoints/tools/build_tool_graph.py`, bound to SHA-256
`4ca3f0f0f09fa632281f6f973ce0b141b390cb1302aaaa9d16e850fbb00aafe9`.
It does not execute that module's body. The mask is a bounded lexer, not a Rust
compiler. The checker trusts its reviewed implementation and Python/Git runtime;
its manifest supplies integrity, not independent approval.

Before a new authorized freeze, format only this README with the supplied
Node 22 command, then run `reader.py --freeze`. The normal verification command
is `--check`; it never refreshes evidence or a manifest after detecting drift.

## Census and integration contract

| Item                                                        |   Count |
| ----------------------------------------------------------- | ------: |
| Rust blobs scanned and Git-bound                            |   5,343 |
| `ToolContributor` implementations                           |      15 |
| Production-possible / test implementations                  |   9 / 6 |
| `.tool_contributor(...)` registration sites                 |      16 |
| Production-possible / test registration sites               |   9 / 7 |
| Masked contributor/accessor symbol occurrences              |      70 |
| Selected tool identities expanded                           |      11 |
| Other production contributor families explicitly unexpanded |       7 |
| Positive source checks / rejected negatives                 | 18 / 30 |

`census.implementations` and `census.registrations` separate integration-test
paths from the explicit `#[cfg(test)]` router module. `test_only` is the combined
test classification; `cfg_test_only` records explicit cfg/module evidence.
`classification=production_possible` records a source site, not an observed
installation. The source census includes generic and qualified impl heads,
registration call expressions and their enclosing factories. It does not expand
macros, resolve arbitrary import aliases, evaluate Cargo features, or discover
implementations in external crates. Every tracked Rust blob is checked, while
only files with relevant symbols are lexed for the contributor census.

Stable root keys for the lead are `registry`, `shared_contracts`, `census`,
`tools`, `skills`, `board`, `other_production_contributors`, `source_attestation`
and `evidence`. References such as `E00001` resolve in `evidence`. Tool IDs below
are logical inventory IDs; the board's actual namespace remains supplied by the
host. `verification.json` carries exact final counts and the inventory digest.

| Logical `tools[].id`                 | Input           | Success output before JSON serialization |
| ------------------------------------ | --------------- | ---------------------------------------- |
| `skills.list`                        | `ListArgs`      | `ListResponse`                           |
| `skills.read`                        | `ReadArgs`      | `ReadResponse`                           |
| `agent-message-board.create_channel` | `CreateChannel` | `ChannelSummary`                         |
| `agent-message-board.get_channels`   | `GetChannels`   | `ChannelPage`                            |
| `agent-message-board.list_threads`   | `ListThreads`   | `Page<ThreadSummary>`                    |
| `agent-message-board.search_posts`   | `SearchPosts`   | `Page<PostPreview>`                      |
| `agent-message-board.read_thread`    | `ReadThread`    | `ThreadPage`                             |
| `agent-message-board.read_post`      | `ReadPost`      | `PostContent`                            |
| `agent-message-board.subscribe`      | `Subscription`  | `SubscriptionState`                      |
| `agent-message-board.unsubscribe`    | `Subscription`  | `SubscriptionState`                      |
| `agent-message-board.post`           | `Post`          | `PostMetadata`                           |

Skills schema evidence retains generic schemars construction, draft/settings,
serde attributes and type fields. `ListArgs` denies unknown fields; `ReadArgs`
has no such serde declaration. The board's literal `json!` field schemas are
read as data and assembled into the nine parameter objects. Schema-required
fields are checked against the Rust argument types. Its output schema is
`None`; concrete backend return types, custom page serialization and structured
permission-denied responses remain bound separately.

## Gates, exposure and boundaries

Skills requires thread state and either cloud availability or a per-step
executor query. Its regular `tools()` supplies no executor query; the step
method derives selected roots, discovery snapshots and plugins. The factory
returns `ListTool` and `ReadTool`. Both use the `skills` namespace and permit
parallel calls. Catalog/provider/resource validation and output/error branches
are retained in the exact executor and helper sources.

The board requires a caller-bound `Binding` established through its host
factory. Host automatic boards require the relevant features and allowed
storage configuration; an explicit local connection is an upstream exception
to that automatic-host gate. Initialization checks session/caller/tree identity.
No binding yields no tools. Startup resolves the optional namespace. Per-step
messages can change descriptions; bundled parameters cannot be overridden.
Five read tools permit parallel calls; four mutation tools do not.

All eleven selected executors inherit `ToolExposure::Direct` before host policy:
initial direct model surface, code-mode eligibility, no deferred discovery.
The shared source also binds all six exposure variants and independent flags.
A registered executor, model exposure, capability authorization and backend
side effects are separate facts. Host adapter and final exposure policy belong
to the lead's pipeline lane. No upstream exception or exposure flag grants CVG
authority.

The board handle parses bounded arguments, delegates through caller-bound backend
methods and returns bounded JSON. Permission denials become a structured error
with `success=false`; other errors become `RespondToModel`, truncated to 512
characters by its helper. Its source includes mutation budget preflight,
read-limit reduction, direct/code-mode request identity, backend membership
obligations and external-context output. Backend implementations and external
capability enforcement are not proved by this reader.

## Limits and next action

Seven additional production contributors are source-bound with their returned
factory expressions, but deliberately remain explicit expansion gaps:
`GoalExtension`, `ConversationHistoryTools`, `HistoryNotesExtension`,
`ImageGenerationExtension`, `MemoriesExtension`, `FileCopyExtension` and
`WebSearchExtension`. Their names, transitive schemas/types, gates and handles
need expansion before claiming a complete dynamic-contributor closure.

Arbitrary external `ToolContributor` implementations remain an open interface
obligation. This package does not claim a closed runtime tool catalog, native
implementation proof, full G01 closure, functional parity or any CVG capability
grant. Functional receipts are **zero**. No target import/build/execution,
application tests, network, installation, lockfile changes, model/provider call,
resources, candidate, database, Docker, descendants, commit, push or deployment
were used. Writes remain inside this lane; shared ledger deltas are in the
handoff. The lead integrates the package and assigns an independent critic.
