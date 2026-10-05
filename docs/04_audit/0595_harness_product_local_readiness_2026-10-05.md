# Auditoria do Operational Harness e do consumidor — 05/10/2026

Task: `HARNESS_ISO_GREEN_20261004`. Estado desta revisão: **IN_PROGRESS**.
Veredito global: **FAIL**. Produção: **NO_GO**. Escopo: engenharia local com
dados exclusivamente sintéticos. Zero chamadas OpenAI nesta execução.

Este relatório separa o harness do produto acoplado. Não reutiliza a antiga
nota combinada 61/100 nem soma suítes sobrepostas. As notas medem a maturidade
da evidência de cada cartão, e não a probabilidade de sucesso em produção.

Escala: 0 = sem material; 20 = requisito/contrato preparado; 40 = implementação
e controles parciais; 60 = validação local relevante; 80 = evidência local
com revisão independente no escopo correspondente; 100 = critério canônico
encerrado. Uma nota 80 não fecha dependências, autoriza promoção ou libera
produção. A ausência de um gate obrigatório prevalece sobre a nota.

## Harness: notas por item

Os critérios originais estão no [backlog do harness](../03_build/0370_harness_product_isolation_backlog.md).

| Item                                        | Nota / 100 | Evidência e limitação que determina a nota                                                                                                                                                                                                           |
| ------------------------------------------- | ---------: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HISO-001 — baseline e donos                 |        100 | Único cartão canônico DONE. Fonte completa R19 preservada em partes reconstruíveis, com hashes.                                                                                                                                                      |
| HISO-002 — missão e ponteiros               |         60 | Ledgers, roadmap e handoff próprios atualizados por commits parciais; reconciliação integral do checkout compartilhado continua pendente.                                                                                                            |
| HISO-003 — contrato de extração             |         80 | SPECs aprovadas por hashes e contratos de consumo/regressão definidos; encerramento depende das etapas de extração/integração.                                                                                                                       |
| HISO-004 — workspace privado do consumidor  |         80 | Produto e interfaces públicas exercitados em cópias físicas; rework ainda sem promoção ao checkout compartilhado.                                                                                                                                    |
| HISO-005 — fronteira verificável            |         40 | Crítico aceitou soundness da R18 e negativos discriminantes; R18 instalada registrou 2.958 diagnósticos; CLI R19 atual confirmou INCOMPLETE com 2.809. A correção da fila expôs estouro de pilha, ainda pendente. Não equivale a PASS de isolamento. |
| HISO-006 — descoberta/build/testes/coverage |         60 | Inventário preserva 371 testes originais e cobertura 281. Parser OSC aceito. R23 local16PASS; correção linear R24 aceita. Regressão da candidata integrada final continua pendente.                                                                  |
| HISO-007 — artefatos separados              |         60 | API compilada sem imports privados do produto, 135 imports públicos conferidos e imagem sintética qualificada; pacote final integrado permanece pendente.                                                                                            |
| HISO-008 — docs e backlog do produto        |         60 | Backlog e requisitos próprios transferidos; documentação histórica do consumidor ainda requer reconciliação com a candidata final.                                                                                                                   |
| HISO-009 — interfaces públicas governadas   |         80 | Gateway e bootstrap/ingresso têm revisões independentes aceitas; consumo compilado exercitado. Dependências da fronteira e integração final continuam abertas.                                                                                       |
| HISO-010 — CI por variante                  |         60 | R23 passou os 16 gates e emitiu certificado local condicional, sem liberar produção. R24 fecha achado posterior do parser; consolidação final pendente.                                                                                              |
| HISO-011 — limites de transporte            |         80 | Controles locais e revisão do gateway aceitos; custo mínimo antes de I/O e identidade do modelo protegidos. Provider externo não executado.                                                                                                          |
| HISO-012 — advisories/exposição             |         80 | Audit atual prod/dev sem vulnerabilidades; SBOM/licenças verificadas. Disposições dos 6.578 achados atuais aceitas e três pendências históricas revisadas; histórico cobre somente o HEAD congelado.                                                 |
| HISO-013 — regressão do núcleo independente |         60 | Variante física R19 sem produto passou 5.004 testes/382 arquivos com PostgreSQL/V8 e zero skips. Nova variante R24 preparada; execução PostgreSQL/V8 final pendente.                                                                                 |
| HISO-014 — independência do harness         |         40 | Build e regressão neutros demonstrados; aceite integral bloqueado pelo gate da closure instalada e pela consolidação final. Piloto do produto não é dependência.                                                                                     |

## Consumidor: notas por item

Os estados e critérios canônicos continuam no [backlog do produto](../../products/shift-assistant/docs/backlog.md).
Notas clínicas e conteúdo desconhecido mantêm NO_MODEL. O aceite do transporte
sintético não qualifica áudio humano, fidelidade clínica ou uso por plantonistas.

| Item                                       | Nota / 100 | Evidência e limitação que determina a nota                                                                                                                                          |
| ------------------------------------------ | ---------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PISO-001 — confirmação humana              |         80 | Fluxo determinístico, replay e correções exercitados na candidata; fonte ainda sem promoção condicionada final.                                                                     |
| PISO-002 — fidelidade e identidade         |         60 | Regressões locais de IDs/homônimos e memória preservadas; corpus esperado sem revisão humana e sem prova de fidelidade clínica.                                                     |
| PISO-003 — processamento/envio durável     |         80 | Reinício oficial, provas brutas causais e replays aceitos no escopo sintético. Confirmação do simulador não demonstra entrega por canal real.                                       |
| PISO-004 — recuperação de journal          |         80 | Append/replay, prefixo válido, duplicação e falhas exercitados; revisão operacional independente aceita. Encerramento canônico/integração ainda pendentes.                          |
| PISO-005 — serialização de lembretes       |         60 | Regressões operacionais e saturação passam na R19 sem reduzir o limite original. A melhoria TTL tem aceite semântico, sem promessa de custo linear global.                          |
| PISO-006 — pausa/saúde/falha de transporte |         60 | Controles de processos e recebimentos simulados exercitados; transporte/canal real não qualificado.                                                                                 |
| PISO-007 — hardening do consumidor         |         40 | Preparação de artefato e controles locais disponíveis; não atribuir ao consumidor a qualificação da imagem da API do harness. Falta fechamento completo da imagem/rede específicas. |
| PISO-008 — backup/restore/alerta           |         60 | Provas locais e procedimentos sintéticos disponíveis; receptor sintético não é recebimento por responsável real. Consolidar vínculo ao artefato final.                              |
| PISO-009 — guia e homologação              |         20 | Vinte JSONs e dez WAVs com hashes conferidos. Whisper e revisão humana NOT_RUN; casos de mídia 17/18 são placeholders.                                                              |
| PISO-010 — piloto específico               |         20 | Contrato e decisão futura registrados; piloto não executado nem autorizado nesta rodada. Não simular aceite humano.                                                                 |

## Resultados executados e seu alcance

- R19: **5.639 testes / 410 arquivos**, PostgreSQL/V8, zero skips. Variante
  física sem produto: **5.004 / 382**, também zero skips. Os números se sobrepõem.
- E2E R19: **12 Chromium** e **15 em três browsers**, sem skips/retries. Estes
  números também se sobrepõem. Browser usa ambiente sintético; a configuração
  de produção local da API foi examinada separadamente.
- API R19: **22 grupos funcionais** sobre processo compilado, com roles
  PostgreSQL separadas, reinício e HEALTHCHECK. Prova TCP em dois processos
  confirmou budget compartilhado e falha fechada quando a permissão é revogada.
- R21: **5.654 testes / 411 arquivos**, zero skips, e todos os **16 comandos**
  nativos com exit 0. O certificado terminou **NO_GO** por quatro hashes stale
  no catálogo; não declarar essa certificação PASS.
- R22: controles novos antes **16 PASS / 7 FAIL**, depois **258 PASS**; tipos
  e lint PASS. Crítico independente: **214 casos próprios e 26 testes PASS**,
  ACCEPT limitado à normalização/parser e ao delta de quatro caminhos.
- R23: **5.662 testes / 411 arquivos**, zero skips, e **16 gates nativos PASS**.
  Certificado local `AAA_CONTROLLED / CONDITIONAL_GO`, com gates externos
  pendentes. A revisão separada recusou o regex OSC por custo quadrático;
  isso mantém o veredito global FAIL. R24 substitui o regex por varredura
  linear: **261 controles focados PASS**, tipos/lint PASS, e ACCEPT independente
  em 6.451 checks funcionais, 16 do caller e 128 parses de recurso.
- Segurança: revisão corrente aceitou **6.578 disposições individuais**. O
  scanner histórico congelado contém **6.688 observações**: 6.685 classificadas
  no exame anterior e três aceitas pelo novo crítico. Não afirmar que o scan
  histórico inclui os commits posteriores ao HEAD `849455b`.

## Roadmap e backlog de fechamento

O [roadmap 0369](../03_build/0369_harness_product_isolation_roadmap.md) e o
[backlog 0370](../03_build/0370_harness_product_isolation_backlog.md) continuam
canônicos. Esta ordem complementa os 24 cartões, sem substituí-los.

| Ordem | Frente / prioridade             | Próxima entrega verificável                                            | Gate de saída                                                                                  |
| ----- | ------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1     | CI / P1                         | Certificação R23, revisão do catálogo e arquivo de todos os resultados | Parser/hash metadata aceitos; sem skips inesperados ou certificado falso                       |
| 2     | Harness neutro / P1             | Build público e suíte PostgreSQL/V8 da variante física R23             | Produto/env/alias ausentes; denominador próprio; asserções e pisos mantidos                    |
| 3     | Fronteira / P1                  | Resolver ou adjudicar individualmente a closure instalada              | Desconhecido nunca recebe PASS; positivos públicos e negativos diretos/transitivos preservados |
| 4     | Integração / P1                 | Consolidar deltas próprios e promover apenas os caminhos autorizados   | R2-D3 e seus testes/revisões satisfeitos; mudanças alheias preservadas; commit local sem push  |
| 5     | Operação local / P1             | Disponibilizar programa qualificado e comandos reproduzíveis           | Smoke, restart e limpeza em processos/volumes próprios; nenhuma chave na evidência             |
| 6     | Provider sintético / P1         | Congelar pacote T4 com hashes, fixtures e teto de custo                | Decisão específica sobre o pacote concreto; entradas desconhecidas NO_MODEL                    |
| 7     | Homologação do produto / P2     | Transcrições locais e revisão humana dos resultados esperados          | Não substituir fala humana por eSpeak como prova de qualidade clínica                          |
| 8     | Piloto/produção / gate separado | Pacote técnico/administrativo completo do candidato                    | Aceites efetivos do responsável; BUILD local não concede implantação                           |

## Evidências

- [Checkpoint 50](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/checkpoint-50-local-cert-and-linear-parser.json).
- [Fonte R19 reconstruível](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-r19-frozen-source-manifest.json).
- [R21: comandos verdes, catálogo recusado](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-r21-native-certify-skip-hash-fail.json).
- [Aceite OSC R22](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/ci-native-summary-fresh-review-r22.json).
- [Certificado local R23](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-r23-native-certify-local-pass.json).
- [Achado de disponibilidade CI](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/security-ci-delta-r23-rejected.json).
- [Correção linear aceita R24](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/ci-osc-linear-fresh-review-r24.json).
- [Segurança atual](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-security-fresh-review-r20.json).
- [Três observações históricas](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/history-three-fresh-review-r21.json).
- [Handoff contínuo](../08_runtime/handoffs/harness_isolation_green_20261004.md).

Os aceites são restritos ao escopo de cada revisão. Rejeições, execuções com
falha e erros de preparação anteriores permanecem arquivados. Nenhum cartão
adicional é marcado DONE por esta tabela; não há liberação de produção.
