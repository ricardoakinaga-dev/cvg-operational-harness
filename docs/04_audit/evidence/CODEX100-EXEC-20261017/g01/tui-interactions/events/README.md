# AppEvent source evidence

Status: `IMPLEMENTED`, T1, worker direto sem descendentes. Entrega para integração
e crítica do Lead; `independent_approval: false`. Escrita exclusivamente nesta
pasta. O [contrato da lane](../events-contract.json) e o
[contrato pai](../contract.json) permanecem congelados.

Pin Git: `8d9f6466ff0294785d56f55b1fe363d132fe4133`. O leitor usa somente Python
stdlib e comandos Git de leitura no upstream fornecido. Não importa código do
alvo nem reutiliza helpers históricos. A extensão de lexer é local ao próprio
leitor; o helper CLI histórico não foi alterado ou executado por esta lane.

## Artefatos e reprodução

- [audit_events.py](audit_events.py): leitor, regeneração, negativos e verificador.
- [inventory.json](inventory.json): fonte, declarações, referências e candidatos.
- [verification.json](verification.json): determinismo, spans, negativos e limites.
- [commands.json](commands.json): comandos de verificação realmente executados,
  exits/stdout/stderr e primeira falha preservada.
- [HANDOFF.md](HANDOFF.md): interface de integração e pendências.

Na raiz do repositório:

```sh
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/tui-interactions/events/audit_events.py --check
```

`--check` não escreve, reconstrói duas vezes, exige equivalência integral do
inventário e da verificação e valida o manifesto estrito. `--build`, `--verify`
e `--seal` são mutadores apenas desta pasta e não devem ser usados para alterar
o pacote durante a revisão. `--links` verifica os links locais dos dois Markdown.

`manifest.json` lista exatamente os seis arquivos de payload desta pasta, com
SHA-256 e tamanho, e rejeita arquivos extras ou ausentes. O próprio manifesto é
o sétimo arquivo e seu SHA-256 é entregue externamente, evitando circularidade.
Os dois Markdown devem passar pelo Prettier local em Node 22 e pelo check de
links antes de selar. Seal e check posteriores ficam no transcript da entrega;
não se altera o ledger de comandos depois do seal.

## Esquema e joins

`schema_version` é `cvg.tui.events.v1`. Root keys: `task`, `status`, `pin`,
`contract_sha256`, `parent_contract_sha256`, `inputs`, `catalog_readonly`,
`functional_receipts`, `full_g01_closure`, `independent_approval`,
`native_full_goal`, `mandatory_open`, `counts`, `sources`, `enum`, `references`,
`imports`, `functions`, `attributes`, `consumers`, `type_mentions`,
`unresolved_qualified`, `limitations`.

`enum.variants[].variant_id` é `AppEvent::<nome>`, estável no pin. Cada linha
preserva ordinal, forma, campos, visibilidade, documentação, atributos, payload
e spans. `availability_conditions` contém somente `cfg`; `conditional_attributes`
retém `cfg_attr`, inclusive `allow(dead_code)`, sem tratá-lo como indisponibilidade.

Joins: `reference_ids`, `producer_candidate_ids`, `consumer_candidate_ids`,
`central_dispatch_consumer_ids`, `context.function_id`, `context.attribute_ids`
e `calls[].definition_candidate_ids`. IDs de referência/função/arm/import usam
tipo, path Git e byte inicial. `source_path` e `source.path` ligam ao census do
Lead; `join.source_symbol` liga comandos/views; `join.future_variant_family`
preserva uma família futura `NOT_RUN` por evento. Owner/requisito específico
permanece `OPEN_LEAD_JOIN`, sem inventar atribuição normativa.

Todo span é UTF-8 exato com `[start_byte,end_byte)`, linhas inclusivas, texto e
SHA-256. A tabela `sources` liga cada path ao blob Git SHA-1, SHA-256 e tamanho;
todos os bytes do worktree são comparados aos blobs do pin.

## Contadores observados

| Evidência                                        |  Quantidade |
| ------------------------------------------------ | ----------: |
| Paths Rust TUI/src lidos                         |       1.131 |
| Variantes / campos                               |   291 / 477 |
| Named / tuple / unit                             |   201/35/55 |
| Referências nomeadas                             |       2.279 |
| Consumer candidates / destructuring candidates   |   1.119/194 |
| Construction/call / unit value ou pattern        |     746/220 |
| Imports e globs retidos                          |         880 |
| Imports de enum / outros tipos / globs de módulo |  102/91/687 |
| Menções de tipo / qualified desconhecidos        |       561/0 |
| Registros de consumer / wildcards ou bindings    |   1.339/334 |
| Funções / atributos de contexto                  | 1.558/1.067 |
| Variantes com arm no dispatcher central          |         291 |
| Nomes de chamada direta / definições candidatas  |     187/204 |
| Variantes com cfg / com cfg_attr                 |         2/7 |

Não foram encontrados alias explícitos do enum, alias de variante, type alias
ou `AppEvent::*` nesta fronteira. Os probes sintéticos verificam essas formas;
os 687 globs de módulo permanecem ambíguos e retidos. Há 1.306 referências com
atributo que menciona `test`; isso não afirma exclusividade de teste, pois
`cfg(any(..., test))` e a herança de módulos precisam ser preservados.

## Limites de evidência

Declaração, referência lexical, consumerCandidate e callCandidate não provam
execução, reachability, disponibilidade efetiva ou produção. Todos os testes e
suportes permanecem no inventário; nome/path é apenas hint. Os corpos e
wildcards/noops não são transformados em produtores ou consumidores produtivos.

O dispatcher central retém guards e corpos completos, incluindo estado de
sessão, espera, erro, cancelamento, stream, aprovação, voz e sandbox. Chamadas
`self.method` são ligadas por nome a definições em todos os paths Rust; duplicatas
e definições de teste continuam candidatas. Resolução de receiver/tipo, chamadas
indiretas, métodos em outros receivers, macros, shadowing, reexports e cadeias de
alias arbitrárias continuam `OPEN`. Funções tipadas que encaminham eventos e
menções de tipo são evidência de código, sem prova de entrega no canal.

O lexer próprio cobre strings com backslash-newline, caracteres UTF-8/escapes
Unicode, raw byte/C strings, raw identifiers e comentários aninhados. A primeira
falha de caractere Unicode foi corrigida localmente e preservada no ledger.
O parser é lexical e delimitado, não um compilador Rust; herança modular/cfg,
effective grammar e runtime continuam pendentes.

O catálogo de 487 obrigações funcionais e 22 controles permanece somente leitura,
com zero recibos funcionais e sem alteração do numerador. A meta nativa integral,
os seis gaps SDK, cinco limites externos e G02/G03/G04 continuam obrigatórios e
abertos. Nenhum targetexec, import do alvo, compile/codegen, macro expansion,
terminal control, rede, instalação, app gate, recurso, lock, candidata, commit,
push, deploy ou autoaprovação foi realizado.
