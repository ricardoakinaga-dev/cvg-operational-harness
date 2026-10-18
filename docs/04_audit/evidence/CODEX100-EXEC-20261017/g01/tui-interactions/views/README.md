# Views — DX100-G01 TUI

Status: `IMPLEMENTED`, aguardando integração e crítico independente. Evidência
T1 de fonte, com zero recibos funcionais. Fonte readonly no pin
`8d9f6466ff0294785d56f55b1fe363d132fe4133`.

O [contrato da lane](../views-contract.json) deriva do
[contrato pai](../contract.json). A autorização de worker é o claim
`CODEX100-EXEC-20261017`, com escrita exclusiva nesta pasta. Não foram
alterados catálogo, ledgers, claims, helpers históricos, outras lanes ou alvo.
Nenhum descendente foi criado. As continuidades compartilhadas ficam com o Lead.

O [inventário](inventory.json) liga os oito requisitos U01 a famílias de fonte,
símbolos e entradas nomeadas. Preserva declarações de ações, bindings runtime,
defaults, campos de configuração, macros, candidatos de panes, composer,
mentions, paste, clipboard, seleção, terminal, renderização, histórico, live tail,
status, tema, export, recap, subagentes, side panes, acessibilidade e mídia.
Os contadores exatos estão em `counts`; cada família contém os caminhos e IDs de
símbolos selecionados. As seleções por prefixo são limites de descoberta. Nomes
com `test` são hints, nunca critérios de exclusão.

## Formato e joins

| Chave raiz                                                                   | Uso                                                                                                                           |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `requirements`                                                               | Os oito IDs normativos, owner e estados originais `NOT_RUN`.                                                                  |
| `entry_surface_bindings`                                                     | Requisito → método nomeado → símbolo e corpo exato, ou `OPEN`.                                                                |
| `source_families`                                                            | IDs `view-family:<family>`, arquivos e símbolos, variantes futuras `DX100-U01:views:<family>`.                                |
| `files`                                                                      | SHA-256, blob Git, CFG e imports lexicais, chamadas de macro e join `scope:<path>`.                                           |
| `symbols`                                                                    | Declarações/entradas e ancestrais lexicais com atributos; IDs determinísticos de identidade.                                  |
| `keymap_actions` / `runtime_actions`                                         | IDs `action:<context>.<action>` e `runtime-action:<context>.<action>`, com campos explícitos e spans.                         |
| `declared_default_bindings` / `default_field_expressions`                    | As entradas da macro de defaults e todas as expressões de campo do método de defaults, inclusive valores vazios e auxiliares. |
| `config_fields` / `keymap_policy_sources`                                    | Campos e funções de parsing, precedência e conflitos.                                                                         |
| `macros` / `action_joins`                                                    | Definições completas, pares lexicais e diferenças abertas.                                                                    |
| `crosslane_references`                                                       | `AppEvent:<name>` / `SlashCommand:<name>`, sem recensear nem auditar dispatch dessas lanes.                                   |
| `unknowns` / `limits`                                                        | Fragmentos e relações abertas; não esgotam as lacunas funcionais.                                                             |
| `mandatory_readonly_sdk_gaps` / `mandatory_readonly_external_runtime_limits` | Preservação dos seis gaps SDK e cinco limites externos anteriores, com identidade de inputs.                                  |
| `sources`                                                                    | IDs `span:<digest>` com path, blob, bytes UTF-8 semiabertos, linhas, texto exato e digests.                                   |

IDs de símbolo usam path, tipo, cabeçalho e ordinal de homônimo. IDs de span usam
path e offsets de byte; não são IDs semânticos resistentes à edição do alvo.
O pin congelado torna esses joins reproduzíveis. Entradas `impl` são candidatos
lexicais; o scanner também pode reter `impl Trait` em assinatura. Nenhuma delas
prova uma implementação compilada ou reachability.

## Diferenças preservadas

`global.open_warnings` é declarado `runtime_only`, e `agents.toggle_pin` também
não tem par no catálogo UI. `global.leader` está no catálogo UI e não no mesmo
inventário de ações runtime. Isso permanece como diferença de inventários e
`OPEN`, sem conclusão de indisponibilidade. A fonte especializada de leader e
chords permanece selecionada.

As definições `resolve_local`, `resolve_with_global`, `default_binding`,
`default_bindings`, `runtime_group_mut`, `configured_binding_slot`,
`define_runtime_action_bindings`, `required_feature` e `define_keymap_actions`
ficam inteiras. Ações condicionais, `FastMode`, defaults vazios, F-keys, Vim,
leader, contexto/local/global, unbind explícito e conflitos não são convertidos
em uma gramática efetiva por expansão de macros. `from_config`, parsing e
validação ficam vinculados aos corpos originais. O gate Android no popup de
export, CFG de clipboard/terminal e imports auxiliares permanecem nos spans.

`BottomPaneView` e seus implementadores são candidatos de declaração, incluindo
fixtures de teste. Métodos de input, paste, lifecycle e render ficam ligados ao
contexto lexical. Herança de módulo/CFG recebe join para `scope`; ausência de
atributo local não é classificação de produção. Seleção de símbolos por nome é
declarada e contabiliza funções não selecionadas por arquivo. Âncoras explícitas
de requisito prevalecem sobre o seletor por nome; a omissão inicial de três
âncoras existentes é preservada em [pre-repair-findings.json](pre-repair-findings.json).

## Verificação offline

O [leitor próprio](reader.py) usa apenas stdlib e Git plumbing. Não importa outro
helper de auditoria nem o alvo. Verifica pin, pré-imagens dos inputs do contrato
pai, catálogo 487+22 integralmente `NOT_RUN`, blobs Git das fontes selecionadas,
decodificação UTF-8 estrita, spans, reconstrução idêntica duas vezes e controles
negativos. Os resultados estão em [verification.json](verification.json) e os
comandos efetivamente observados em [commands.json](commands.json).

Os negativos de fonte modificam bytes somente em memória e comparam campos
semânticos extraídos de ação, feature, binding, default, CFG e campo de config.
Não basta mudar um hash. Os negativos de artefato cobrem omissões, owner,
binding, default, CFG, falsa qualificação e preservação dos limites. O check final
rejeita omissão, adição, digest e tamanho falsos no manifest estrito.

O scanner próprio trata comentários aninhados, literais Unicode, raw strings
byte/C, lifetimes, raw identifiers e string continuada com backslash-newline.
O caso reportado pelo Lead no helper CLI histórico é preservado como limite
histórico; esse helper não foi executado nem modificado nesta lane. Há fixtures
locais explícitas desses lexemas. A
[observação da primeira execução](initial-run-observation.json) registra o run
obsoleto interrompido para replay com captura de exit; nenhum PASS foi inferido
dele. A primeira falha observada foi o link ao manifest ainda ausente, preservada
em [first-failure.json](first-failure.json); a ordem de preparação foi corrigida.
Um arquivo `UNSEALED_LINK_TARGET_ONLY` pode anteceder o selo para resolver esse
link local, sem conceder verificação. Falhas reais posteriores, se observadas,
permanecem no log de comandos.

```bash
python3 docs/04_audit/evidence/CODEX100-EXEC-20261017/g01/tui-interactions/views/reader.py --check
```

O [manifest estrito](manifest.json) inclui todos os arquivos próprios, exceto ele
mesmo, e vincula o SHA do contrato da lane e do pai. Seu SHA é informado fora do
pacote para evitar hash circular. Markdown e links próprios são verificados com
Node 22/Prettier local e leitor de links antes do selo definitivo.

Continuam obrigatórios o objetivo Native integral, as 487 obrigações e 22
controles, os seis gaps SDK, os cinco limites externos e G02/G03/G04. Macros,
CFG efetiva, terminal/plataformas, provider, efeitos de mídia e clipboard,
interação acessível, cancelamento e resultados úteis continuam `OPEN`/`NOT_RUN`.
Este recorte não concede fechamento de G01, paridade, release ou aprovação.

O [handoff](handoff.md) descreve o próximo join do Lead.
