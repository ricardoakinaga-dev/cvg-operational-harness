# Python lane handoff

Status: **IMPLEMENTED**. Fresh independent critic and parent integration remain
with Lead; no descendants were created. Parent contract SHA-256:
`182723fb6159aad4c13d769c106d250ab8d7dec0f7edaadc861553a3757ff2a7`.
Child contract SHA-256:
`d349bb9bbcbb8740db5ba61b029e974df80b808404efa522af4985bd15977740`.
Both were read and hash-bound before implementation; the parent and child files
were never edited. Applicable repository constitution, runtime/log/backlog,
coordination claim and ADR010 were read. The user's exclusive write boundary
keeps continuity updates here for Lead to integrate.

Files delivered directly under `python/`:

- [reader.py](reader.py): independent stdlib/Git AST reader, no imported old helper.
- [inventory.json](inventory.json): declarations, identities, joins, controls,
  candidate graph, RPC, registry, packaging, historical records and OPEN gaps.
- [schema.json](schema.json): closed-root v1 schema and source-span schema.
- [verification.json](verification.json): executed semantic mutations and tamper
  controls, recomputed by `--check`.
- [README.md](README.md): scope, root keys, joins and reproduction.
- [handoff.md](handoff.md): actual execution and remaining integration work.
- [failures.json](failures.json): failed attempts preserved, with corrections.
- [manifest.json](manifest.json): strict seven-file payload manifest; excludes itself.

## Actual execution

Working directory for reader commands below: repository root. Reader path is
`docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/sdk-language-contracts/python/reader.py`.

| Command                                            | Actual exit / observation                                                               |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `python3 <reader> --write` initial run             | 1, generated census mismatch; preserved in failures.                                    |
| `python3 <reader> --write` second run              | 0, 37 root exports / 63 historical candidates; deterministic double derivation.         |
| `python3 <reader> --write` with new span validator | 1, historical whole-line end convention; preserved and corrected.                       |
| `python3 <reader> --write` after span/end fix      | 0, 37 sources / 27 modules / 1,542 declarations / 25 RPC candidates / 85 notifications. |

Additional executed checks:

| Command                                                                        | Actual exit / observation                                                                     |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| `python3 <reader> --self-test`                                                 | 0; 34 controls, including semantic AST input mutations and artifact/manifest rejection cases. |
| Node22 Prettier `--ignore-path /dev/null --write '*.json' '*.md'` in `python/` | 0; only lane JSON/Markdown formatted.                                                         |
| `python3 <reader> --links`                                                     | 0; 16 scoped links resolve.                                                                   |

| Finalization command in `python/`                                 | Actual exit / observation                                                                                                                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Node22 Prettier `--ignore-path /dev/null --check '*.json' '*.md'` | 0; all matched files use Prettier code style before seal.                                                                                       |
| `python3 reader.py --seal`                                        | 0; strict seven-file payload manifest generated after formatting/links.                                                                         |
| `python3 reader.py --check`                                       | 0; deterministic double derivation, 34 controls, source spans, exact artifact/schema/verification, strict manifest and read-only lane snapshot. |
| `python3 --version`                                               | 0; Python 3.12.3.                                                                                                                               |

The seal/check above preceded this final handoff bookkeeping. Formatting, links,
seal and read-only check are repeated after recording these actual results;
their final observed exit codes and manifest SHA are returned to Lead with
delivery. The digest remains external to avoid a self-referential manifest
inside its own payload. JSON and Markdown formatting use the explicit executable
`/home/ricardo/.nvm/versions/node/v22.23.2/bin/node` and repository-local
`node_modules/prettier/bin/prettier.cjs`, with `--ignore-path /dev/null` restricted
to this lane. No application gates or target scripts were run.

After implementation, a separate builder self-review inspected the generated
artifact: all 37 exports resolved; historical 63 member joins resolved;
`CodexClient`, `AsyncCodexClient` and `MessageRouter` retain 61, 47 and 26 declared
members respectively; all 85 notification targets resolved. The 460 protected
payload files and ten prior manifests remain hash-identical. This is builder
self-review, not the fresh independent critic reserved to Lead.

## Remaining OPEN boundaries

All six historical SDK gaps stay OPEN. Dynamic dispatch/callback timing,
request/response races, cancellation, retry/backoff outcomes, transport cleanup,
approval handlers and actual wire validation require future controlled runtime
oracles. Type alias/union/MRO/default/decorator/Field metadata is declarative;
Pydantic and generated constructors are unevaluated. One unsupported declaration
syntax in release support is retained as OPEN, never silently dropped.

The reported 1,075 generated count is an explicit discrepancy against pinned AST
1,057 top-level / 1,061 including methods; the accepted prior inventory also has
1,061 generated definition records. Source dependency `0.153.4` and reported
installed companion `0.163.0` do not bind source to a native runtime. TS behavior,
platform/package artifacts, native reference preparation, first journey, parent
registry integration and semantic method ownership remain with Lead.

Next action: fresh critic inspects these frozen files and exact contract, then
Lead integrates additive source evidence using qualified declaration IDs and
`PYROOT`, `PYOWNER`, `PYFLOW`, `PYNOTIFY`, `PYPACK` joins described in the README.
No catalog mutation, G01/native parity claim, approval, resource, install, target
execution, commit, push, deploy or authority transfer0235/0236 occurred.
