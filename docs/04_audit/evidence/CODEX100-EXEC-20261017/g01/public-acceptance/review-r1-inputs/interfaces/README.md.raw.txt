# Interfaces — CODEX100 public acceptance

Terminal handoff: **IMPLEMENTED**, not approved. Owner `workerA` returns exclusive
ownership of `interfaces/**` to Lead after the sealed final check. No descendant
agents, runtime jobs, containers, locks, or other resources were created. This
README is the lane handoff; Lead owns integration, continuity and independent
review. No shared ledger or source package was edited.

This T1 package covers all 56 historical requirements CDX-08–CDX-14 with 112
synthetic documentary variants: one POSITIVE baseline and one specific edge per
requirement. These fixtures are proposals, not asserted executable or observed.
All 112 cases remain `NOT_RUN`, `receipt: null`; functional receipts are zero.
G01 closure, native implementation, G02/G03/G04, T3/T4 and release are not granted.

The [frozen contract](../contract.json) SHA-256 is
`3bac853ce307043e087ec76f14f4b2e057010c9a6b4d1b65d750f47b4818d07a`;
the [frozen validator](../validate.py) SHA-256 is
`a3638bd70a4a9a3c1cd428090a54b158358b6d77dc57943228569a2b2bd16377`.
The source pin is `8d9f6466ff0294785d56f55b1fe363d132fe4133`.
Owners, exact titles and record digests come from the read-only
[catalog](../../../../../../03_build/tracking/codex100_catalog_v1.json).
All five frozen inputs, 488 accepted payloads and 11 manifests were authenticated
before authoring; they remain read-only. Their preservation is not runtime proof.

[cases.json](cases.json) contains the requirements, fixtures, stimuli, projections,
known-bads, Git UTF-8 spans and named unknowns. [commands.json](commands.json)
records actual command results, including failed inspection/authentication
attempts and their corrections. [manifest.json](manifest.json) seals the other
three payloads using the frozen helper.

Every reference expectation uses `PROPOSED_ORACLE_PENDING_REFERENCE` and expects
`AUTHENTICATED_G02_REFERENCE` via `EXACT_PROJECTION_MATCH`. Each assertion names
its own projection and explicit observable slots: result/error fields, text,
ordered events, selected state, or isolated synthetic effects. The future capture
adapter must bind each slot to authenticated raw public output or synthetic state
snapshots; this mapping remains OPEN. Missing slots invalidate the capture.
Exact equality preserves list/event order, UTF-8 text, field presence, errors and
policy results. Only runtime IDs (bijective, preserving relationships/types) and
time measurements may be normalized. Fixture/request IDs are exact. There is no
sorting, null/absent coercion, error-code normalization or policy substitution.

Each known-bad changes a stated field, effect or event order and links the exact
assertion rejecting it. After a real capture exists the comparison harness must
materialize that change and observe inequality. A mutation that cannot be
materialized leaves its case OPEN. The helper's 11 structural negatives are
validation of this document, not execution of those 112 future functional controls.

All drivers are `PROPOSED_DRIVER_ACTION`. Exact selector/direction candidates are
copied from the authenticated [public matrix](../../pinned-variants/matrix.json)
into each requirement's `source_boundaries`; missing/wildcard seeds are explicit.
A `ServerNotification` is observed, and a `ServerRequest` is observed then resolved
by correlated client response. Neither is silently promoted to `ClientRequest`.
No private callback, nearest seed, wildcard or `prepare_thread_spawn` is claimed
as a callable public API.

TypeScript uses dotted headless JSONL; Python sync/async uses its distinct
app-server RPC API. The accepted
[SDK language contracts](../../sdk-language-contracts/integration.json) remain
mandatory context. Nine direct source-rule occurrences cover narrow TS
construction, aggregation, JSON parsing, input normalization, schema rejection,
and Python sync resume-option mapping; they do not prove full projections or
async/runtime equivalence. The other 112 source occurrences are explicitly
`CONTEXT_ONLY`. Every source span is authenticated against the pinned Git blob,
file SHA-256 and UTF-8 byte interval, with at most 4096 bytes per claim.

CLI/config fixtures express semantic proposed inputs, not validated Clap/TOML
syntax, defaults, errors or feature-stage behavior. The accepted
[parser integration](../../cli-parser-semantics/integration.json) reports
305 historical + 4 Windows = 309 field rows and 313 prior preserved payloads.
The Lead corrected its prompt label: 313 refers to preserved payloads, not
fields. The original question is retained as resolved metadata in CDX100-10-01;
no new census or missing-field obligation is inferred. Deprecated aliases,
no-ops and removed flags still need G02 comparison.

Reference projections contain only reference behavior. Proposed CVG controls
remain in `cvg_expectation`, including separate grant/tenant assertions for the
hook bridge and child authority cases. Codex hook/policy/reviewer output never
grants CVG authority. Sensitive effects require an approved CVG decision or
handoff. The candidate must be native; forwarding to installed Codex is forbidden.
The oracle must use a real authenticated G02 reference; provider mocks may supply
only inputs/faults, never replace reference outputs. Listed TS trace seeds are
documentary candidate traces requiring a provider-input mapping, not injected
reference JSONL. Account, entitlement, remote services, packages and transports
remain synthetic proposals with approved future reference arrangements required.

Of 309 seed axes, 264 link to proposed comparison variants and 45 remain
explicitly named OPEN. All 112 variants additionally retain their public-binding
and authenticated-reference unknown: 157 named unknown objects overall including
the 45 axis unknowns. The original CLI count question is resolved separately.
Axis links indicate documentary comparison coverage only.

| Requirement                                                                   | Owner       | Baseline / edge       | Linked axes / OPEN |
| ----------------------------------------------------------------------------- | ----------- | --------------------- | ------------------ |
| `CDX100-08-01` Inicialização/negociação e schemas                             | `DX100-A01` | `:baseline` / `:edge` | 4 / 1              |
| `CDX100-08-02` IDs/erros/tipos e aliases legados                              | `DX100-A01` | `:baseline` / `:edge` | 4 / 2              |
| `CDX100-08-03` Requests cliente→servidor                                      | `DX100-A01` | `:baseline` / `:edge` | 3 / 2              |
| `CDX100-08-04` Pedidos servidor→cliente e resolução                           | `DX100-A01` | `:baseline` / `:edge` | 4 / 2              |
| `CDX100-08-05` Notificações e correlação causal                               | `DX100-A01` | `:baseline` / `:edge` | 4 / 1              |
| `CDX100-08-06` Stdio/UDS/WebSocket e compressão                               | `DX100-A03` | `:baseline` / `:edge` | 2 / 4              |
| `CDX100-08-07` Backpressure/shutdown/reconnect                                | `DX100-A03` | `:baseline` / `:edge` | 4 / 2              |
| `CDX100-08-08` Auth de conexão e revogação                                    | `DX100-A03` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-09-01` Codex/Thread API compatível de alto nível                      | `DX100-D01` | `:baseline` / `:edge` | 3 / 2              |
| `CDX100-09-02` Start/resume/run/runStreamed                                   | `DX100-D01` | `:baseline` / `:edge` | 5 / 1              |
| `CDX100-09-03` Tipos de itens/eventos/usage                                   | `DX100-D01` | `:baseline` / `:edge` | 3 / 3              |
| `CDX100-09-04` Prompt de texto/imagem e schema                                | `DX100-D01` | `:baseline` / `:edge` | 4 / 2              |
| `CDX100-09-05` Signal/cancelamento/erros                                      | `DX100-D01` | `:baseline` / `:edge` | 4 / 2              |
| `CDX100-09-06` exec/resume/fork/review headless                               | `DX100-D02` | `:baseline` / `:edge` | 4 / 2              |
| `CDX100-09-07` JSONL/arquivo final/stdin/exits                                | `DX100-D02` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-09-08` Modo efêmero e config/rules explícitas                         | `DX100-D02` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-10-01` CLI subcomandos/aliases/flags                                  | `DX100-H02` | `:baseline` / `:edge` | 5 / 1              |
| `CDX100-10-02` Config em camadas e perfis                                     | `DX100-H01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-10-03` Requirements e política gerenciada                             | `DX100-H01` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-10-04` 103chaves e variantes aninhadas                                | `DX100-H01` | `:baseline` / `:edge` | 3 / 3              |
| `CDX100-10-05` Strict config/default/reload                                   | `DX100-H01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-10-06` Features estáveis/experimentais/development/deprecated/removed | `DX100-H01` | `:baseline` / `:edge` | 4 / 2              |
| `CDX100-10-07` Doctor/model/prompt/debug e completion                         | `DX100-H02` | `:baseline` / `:edge` | 4 / 2              |
| `CDX100-10-08` Instalação/update/status de versão                             | `DX100-H02` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-11-01` SKILL.md/manifests e aliases                                   | `DX100-E01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-11-02` Carregamento progressivo/catálogos                             | `DX100-E01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-11-03` Instalar/ler/listar/reconcile/desinstalar                      | `DX100-E01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-11-04` Marketplaces locais/remotos/upgrade                            | `DX100-E01` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-11-05` Compartilhar/listar/checkout/revogar                           | `DX100-E01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-11-06` Dependências e pedidos de instalação                           | `DX100-E01` | `:baseline` / `:edge` | 4 / 1              |
| `CDX100-11-07` Contributors e world state                                     | `DX100-E02` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-11-08` Schema dinâmico/tool discovery/gerações                        | `DX100-E02` | `:baseline` / `:edge` | 4 / 1              |
| `CDX100-12-01` Descobrir/listar/configurar hooks                              | `DX100-F01` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-12-02` Eventos e scopes do pin                                        | `DX100-F01` | `:baseline` / `:edge` | 7 / 0              |
| `CDX100-12-03` Handlers e protocolos de saída                                 | `DX100-F01` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-12-04` Trust/fingerprint e mudança de conteúdo                        | `DX100-F01` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-12-05` Async hooks e limite de concorrência                           | `DX100-F01` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-12-06` Timeout/cancelamento/cleanup                                   | `DX100-F01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-12-07` Integração com turno/model/tool/session                        | `DX100-F01` | `:baseline` / `:edge` | 4 / 0              |
| `CDX100-12-08` Ponte de hook Codex sob controle                               | `DX100-F01` | `:baseline` / `:edge` | 2 / 2              |
| `CDX100-13-01` MCP stdio/HTTP e transportes do pin                            | `DX100-P01` | `:baseline` / `:edge` | 5 / 1              |
| `CDX100-13-02` OAuth/login/reload/status                                      | `DX100-P01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-13-03` Tools/resources/prompts                                        | `DX100-P01` | `:baseline` / `:edge` | 4 / 2              |
| `CDX100-13-04` Progress/cancelamento/erros                                    | `DX100-P01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-13-05` Elicitação e pedidos de tool/input                             | `DX100-P01` | `:baseline` / `:edge` | 4 / 1              |
| `CDX100-13-06` App read/list/installed e sugestões                            | `DX100-P02` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-13-07` Widgets/resourceUri e display mode                             | `DX100-P02` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-13-08` Servidor MCP e descoberta adiada                               | `DX100-P01` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-14-01` Spawn/role/profile/model especializado                         | `DX100-O01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-14-02` Fork full-history e contexto separado                          | `DX100-O01` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-14-03` Send/steer/mailbox/board                                       | `DX100-O01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-14-04` Wait/status/finalização                                        | `DX100-O01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-14-05` Resume/close e descendentes                                    | `DX100-O01` | `:baseline` / `:edge` | 6 / 0              |
| `CDX100-14-06` Budgets e profundidade agregados                               | `DX100-O01` | `:baseline` / `:edge` | 5 / 0              |
| `CDX100-14-07` Notificação pai/filho                                          | `DX100-O01` | `:baseline` / `:edge` | 4 / 0              |
| `CDX100-14-08` Interseção de grants/tenant/identidade                         | `DX100-O01` | `:baseline` / `:edge` | 2 / 3              |

Named axis unknowns retain owner, required evidence and gate in `cases.json`:

| Requirement    | OPEN axis                           | Owner       |
| -------------- | ----------------------------------- | ----------- |
| `CDX100-08-01` | schema version                      | `DX100-A01` |
| `CDX100-08-02` | legacy aliases                      | `DX100-A01` |
| `CDX100-08-02` | null result                         | `DX100-A01` |
| `CDX100-08-03` | params defaults                     | `DX100-A01` |
| `CDX100-08-03` | all source method families retained | `DX100-A01` |
| `CDX100-08-04` | timeout                             | `DX100-A01` |
| `CDX100-08-04` | revocation                          | `DX100-A01` |
| `CDX100-08-05` | raw events                          | `DX100-A01` |
| `CDX100-08-06` | UDS                                 | `DX100-A03` |
| `CDX100-08-06` | WebSocket                           | `DX100-A03` |
| `CDX100-08-06` | compression                         | `DX100-A03` |
| `CDX100-08-06` | socket auth                         | `DX100-A03` |
| `CDX100-08-07` | shutdown                            | `DX100-A03` |
| `CDX100-08-07` | queue loss                          | `DX100-A03` |
| `CDX100-09-01` | public types                        | `DX100-D01` |
| `CDX100-09-01` | language-specific errors            | `DX100-D01` |
| `CDX100-09-02` | process lifecycle                   | `DX100-D01` |
| `CDX100-09-03` | item union                          | `DX100-D01` |
| `CDX100-09-03` | event union                         | `DX100-D01` |
| `CDX100-09-03` | unknown event                       | `DX100-D01` |
| `CDX100-09-04` | attachment ownership                | `DX100-D01` |
| `CDX100-09-04` | invalid prompt                      | `DX100-D01` |
| `CDX100-09-05` | transport error                     | `DX100-D01` |
| `CDX100-09-05` | retry rules                         | `DX100-D01` |
| `CDX100-09-06` | fork                                | `DX100-D02` |
| `CDX100-09-06` | review                              | `DX100-D02` |
| `CDX100-10-01` | effective parser grammar            | `DX100-H02` |
| `CDX100-10-04` | all103keys                          | `DX100-H01` |
| `CDX100-10-04` | defaults                            | `DX100-H01` |
| `CDX100-10-04` | unions                              | `DX100-H01` |
| `CDX100-10-06` | development                         | `DX100-H01` |
| `CDX100-10-06` | feature dependency                  | `DX100-H01` |
| `CDX100-10-07` | models diagnostics                  | `DX100-H02` |
| `CDX100-10-07` | prompt input                        | `DX100-H02` |
| `CDX100-11-06` | approval                            | `DX100-E01` |
| `CDX100-11-08` | callback                            | `DX100-E02` |
| `CDX100-12-08` | CVG authority intersection          | `DX100-F01` |
| `CDX100-12-08` | no grant escalation                 | `DX100-F01` |
| `CDX100-13-01` | hosted auth                         | `DX100-P01` |
| `CDX100-13-03` | prompts                             | `DX100-P01` |
| `CDX100-13-03` | external runtime unknown            | `DX100-P01` |
| `CDX100-13-05` | authority boundary                  | `DX100-P01` |
| `CDX100-14-08` | grant intersection                  | `DX100-O01` |
| `CDX100-14-08` | tenant identity                     | `DX100-O01` |
| `CDX100-14-08` | source authority                    | `DX100-O01` |

Six SDK gaps remain OPEN with their accepted owners: `GAP-PY-API` and
`GAP-TS-LANGUAGE` (`DX100-D01`); `GAP-PY-RPC` and `GAP-GENERATED`
(`DX100-A01`); `GAP-PROVENANCE` and `GAP-PLATFORM-PACKAGING` (`DX100-Z02`).
The five external limits and 291 TUI private-event/effect correlations also
remain OPEN under the previous packages. This lane does not replace them.

Run the frozen helper with `--lane interfaces --check`, `--self-test`, then
`--seal` and final `--check`. Format only this README with local Node 22 Prettier
and `--ignore-path /dev/null`; check links only under this lane. No target imports,
execution, compilation, macros, cfg/decorator/default evaluation, typechecking,
network, download, installation, application gates, providers, accounts, terminal
control, PG, Docker, lock changes, candidates, commit, push or deploy occurred.

Next action belongs to Lead: authenticate the four-file manifest, integrate this
lane with the other lanes, and submit the concrete package to the reserved fresh
critic. Keep all OPEN boundaries and the full 487+22 denominator and 49 cards.

## Lead correction before independent review

The initial builder count question is resolved: the Lead prompt mislabeled
313 preserved payloads as fields. Accepted source data has 305 historical plus
four Windows fields, totaling 309. The removed pending metadata item is retained
as resolved history in CDX100-10-01/source_boundaries/count_reconciliation.
Effective parser grammar stays OPEN. Original builder bytes are archived in
`../interfaces-builder-delivery/`; this correction grants no runtime credit.
