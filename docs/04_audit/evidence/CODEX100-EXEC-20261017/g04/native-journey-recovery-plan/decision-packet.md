# Decisão T3 — primeira jornada Codex nativa

**READY_FOR_HUMAN_T3_REVIEW.** R3: APPROVE_TECHNICAL_SPEC_DESIGN,12checks/zero obrigatórios; [parecer](review-r3/report.md) e [aceite técnico delimitado](recovery-acceptance.json). Este arquivo não é aprovação humana ou de BUILD.

Decisão futura sobre a [SPEC0239](../../../../../02_spec/0239_codex_native_journey.md), SHA-256 `ccdf3a754c460e138307148f9eec79e0dce4a9b7ac5c9d10334716e5b5c0dd87`, e os oito anexos abaixo. A revisão do contrato novo é separada das aprovações0221/0225/0231 já resolvidas. Não se solicita repetir essas decisões.

## Mudança concreta

- Nova superfície NativeJourneyRuntime e subpath SDK Codex, com facadecliente e executor separados sobre o mesmo motor governado: sessão, fila, claim/lease, loop iterativo, policy/approval, journal, checkpoint, orçamento e entrega persistida.
- Ponte nativa de modelo e stream incremental real com preparação/contagem/reserva dos bytes efetivamente enviados; compatibilidade do generate legado preservada. Inputs/model/contexto e outputs têm limites e erros explícitos.
- Eventos públicos tipados, NativeFrame/cursor/digest e erro governado fechados, storage e replay do mesmo timestamp/bytes; cancelamento e ACK seguem commit conhecido, com UNKNOWN preservado.
- Adapter app-server da seleção pinada, IDs lossless, histórico e ferramentas governadas. A seleção é a primeira jornadaCQ01–14; demais capacidades do objetivo integral continuam obrigatórias e pendentes.
- Qualificação separa literalidade e propostas governadasEQ01–06. QR05 preserva stdout integral e compara frame opaco derivado em RAW_STATE, condicionado a procedência recomputada independentemente; igualdade de bytes não é prova da seleção.

## Limites da decisão

Aprovar o contrato novo permitirá preparar BUILD **local contido com dados e providers sintéticos**, somente após a qualificação das dependências e o preflight correspondente. Não atesta que a implementação já existe: [entrada observada](build-entry-r3.json) permanece falsa. A ordem0029→0030→0031 e os contratos/candidatas/exports dos owners precisam ser elegíveis para reuso; nenhum WIP ou certificado é transferido silenciosamente.

A aprovação do contrato ou de uma equivalência governada não concede paridade literal nem dispensa requisito/variante. Os seis perfis abaixo continuam rastreados como governados; capturas, fontes, adversários e aceites no mesmo candidato ainda são necessários. Todos509registros/14CQ/30NJ/19EA permanecemNOT_RUN, sem recibos funcionais. Qualquer capacidade sensível real ou release requer seu gateT4 aplicável; esta decisão é para o novo contrato técnico e futuro BUILD sintético.

## Perfis governados propostos

| Perfil | Diferença e obrigação preservada                                                                                                                                                   |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EQ01   | Identidade/ambiente CVG verdadeiros; conservar campos, unidades, segurança e brutos, sem fingir branding Codex                                                                     |
| EQ02   | Approval institucional nativo; WRITE retida/negada tem corpo0 e somente autoridade nativa libera intenção exata                                                                    |
| EQ03   | Ferramentas do registry nativo projetadas no lifecycle dynamicToolCall; corpo/input/output/ordem reais, variante de execução no cliente continua aberta                            |
| EQ04   | Settlement UNKNOWN explícito com resumo wire governado; preservar journal, orçamento e causa, sem alegar ausência de efeito                                                        |
| EQ05   | Bijeções de recursos e relações de frescor/root/tempo entre runs independentes; preservar dataflow/causalidade/unidades e RPCids literais quando exigidos                          |
| EQ06   | Segmentação de deltas/layout de chamadas de modelo podem diferir; guardar todos chunks/chamadas/uso/custo/reservas e provar concatenação e primeirodelta antes de liberar provider |

A decisão futura aprova o contrato e os critérios de avaliação destes perfis como classe governada separada. Não aceita antecipadamente captura ou equivalência de uma função e não dispensa a obrigação literal ainda pendente.

## Anexos vinculados ao SHA da SPEC

Paths relativos a [full-native-spec](../full-native-spec/normative-annexes.json). Qualquer alteração destes bytes muda o SHA da SPEC antes de considerar uma aprovação vigente.

| Anexo                              | SHA-256                                                            |
| ---------------------------------- | ------------------------------------------------------------------ |
| `contracts/model-bridge.md`        | `2ea0ee6d21bd82f6a9d9fb5ad413ee667a5aabb112239382bf935496bb6e47cc` |
| `contracts/native-data.md`         | `dd0c78d5dafd9c36471d70a00cb43c04ba6f7163ad7f08ef1605459dbada30db` |
| `contracts/qualification-rules.md` | `28349fb042e64be40cd1072dd4d8d0e6dc991716752d4f9a1acf27f9363cb831` |
| `concurrency-schedules.json`       | `3dde07e827ddaaa61a40ec0c121524598758f97deb18a7090698fb822b39a200` |
| `test-plan.json`                   | `e050930c520b498ca9bab584a6a6b32fb69e1ae501b4a950c03bcfaffa17e573` |
| `governance-proposals.json`        | `0238aeec2de58ff9bff5991e785a3bc4d0e4ed8dc66210e29bbb8610c0c05446` |
| `rules-matrix.json`                | `d6334e8d8916641ffe4459860ff0c503637e0a3ae8b400da4437d976a019f59a` |
| `wire-scout/wire-contract.json`    | `c498542b99a81c3849cfadd39d06677b706ac6341a9efc0c31ef88be7b11efd3` |

## Dependências e verificação

O [parecerR2](../full-native-spec/review-r2/report.md) permanece FAILED histórico. A [disposição de recuperação](attempt-disposition.json) documenta por que o Lead aplicou uma única tentativa adicional após seis observações novas, sem esconder os contadores anteriores. A R3 julga somente o desenho atual; não certifica runtime ou BUILD. [Parecer finalR3](review-r3/report.md) e [checagens de fechamento](closure-verification.json) autenticam o desenho e o pacote documental, sem prova runtime. Nenhuma decisão humana será registrada antes de resposta explícita do usuário para este SHA.
