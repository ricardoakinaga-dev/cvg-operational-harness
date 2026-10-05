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

| Item                                        | Nota / 100 | Evidência e limitação que determina a nota                                                                                                                                                                                                                                 |
| ------------------------------------------- | ---------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HISO-001 — baseline e donos                 |        100 | Único cartão canônico DONE. Fonte completa R19 preservada em partes reconstruíveis, com hashes.                                                                                                                                                                            |
| HISO-002 — missão e ponteiros               |         60 | Ledgers, roadmap e handoff próprios atualizados por commits parciais; reconciliação integral do checkout compartilhado continua pendente.                                                                                                                                  |
| HISO-003 — contrato de extração             |         80 | SPECs aprovadas por hashes e contratos de consumo/regressão definidos; encerramento depende das etapas de extração/integração.                                                                                                                                             |
| HISO-004 — workspace privado do consumidor  |         80 | Produto e interfaces públicas exercitados em cópias físicas; rework ainda sem promoção ao checkout compartilhado.                                                                                                                                                          |
| HISO-005 — fronteira verificável            |         40 | Fila de manifestos runtime e consulta lexical corrigidas, com ACCEPT independente e negativos discriminantes. CLI R22: INCOMPLETE, 8.882 diagnósticos, zero violações/indisponibilidades lexicais. Propostas first-party sob I1; não equivale a PASS da closure instalada. |
| HISO-006 — descoberta/build/testes/coverage |         80 | 371 testes originais e cobertura 275+6 preservados; inventário 49 novos. R26 completa 16 gates PASS,5.735/413 zero skips, cobertura crítica/mutação PASS. Revisões finitas de metadados/CI aceitas; fechamento canônico e integração Root pendentes.                       |
| HISO-007 — artefatos separados              |         60 | API compilada sem imports privados do produto, 135 imports públicos conferidos e imagem sintética qualificada; pacote final integrado permanece pendente.                                                                                                                  |
| HISO-008 — docs e backlog do produto        |         60 | Backlog e requisitos próprios transferidos; documentação histórica do consumidor ainda requer reconciliação com a candidata final.                                                                                                                                         |
| HISO-009 — interfaces públicas governadas   |         80 | Gateway e bootstrap/ingresso têm revisões independentes aceitas; consumo compilado exercitado. Dependências da fronteira e integração final continuam abertas.                                                                                                             |
| HISO-010 — CI por variante                  |         80 | Certificação R26: 16 gates PASS/AAA_CONTROLLED/CONDITIONAL_GO, com parser e nove deltas aceitos em revisão independente. R25 FAIL documental preservado. Gates externos e produção não aceitos.                                                                            |
| HISO-011 — limites de transporte            |         80 | Controles locais e revisão do gateway aceitos; custo mínimo antes de I/O e identidade do modelo protegidos. Provider externo não executado.                                                                                                                                |
| HISO-012 — advisories/exposição             |         80 | Audit atual prod/dev sem vulnerabilidades; SBOM/licenças verificadas. Disposições dos 6.578 achados atuais aceitas e três pendências históricas revisadas; histórico cobre somente o HEAD congelado.                                                                       |
| HISO-013 — regressão do núcleo independente |         60 | Variante física R25 sem produto passou build e 5.100 testes/385 arquivos com PostgreSQL/V8, zero falhas/skips e 7.687 inputs intactos. Suítes sobrepostas não somadas; consolidação e aceite canônico pendentes.                                                           |
| HISO-014 — independência do harness         |         40 | Build e regressão neutros demonstrados; aceite integral bloqueado pelo gate da closure instalada e pela consolidação final. Piloto do produto não é dependência.                                                                                                           |

## Consumidor: notas por item

Os estados e critérios canônicos continuam no [backlog do produto](../../products/shift-assistant/docs/backlog.md).
Notas clínicas e conteúdo desconhecido mantêm NO_MODEL. O aceite do transporte
sintético não qualifica áudio humano, fidelidade clínica ou uso por plantonistas.

| Item                                       | Nota / 100 | Evidência e limitação que determina a nota                                                                                                                                                                                                            |
| ------------------------------------------ | ---------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PISO-001 — confirmação humana              |         80 | Fluxo determinístico, replay e correções exercitados na candidata; fonte ainda sem promoção condicionada final.                                                                                                                                       |
| PISO-002 — fidelidade e identidade         |         60 | Regressões locais de IDs/homônimos e memória preservadas; corpus esperado sem revisão humana e sem prova de fidelidade clínica.                                                                                                                       |
| PISO-003 — processamento/envio durável     |         80 | Reinício oficial, provas brutas causais e replays aceitos no escopo sintético. Confirmação do simulador não demonstra entrega por canal real.                                                                                                         |
| PISO-004 — recuperação de journal          |         80 | Append/replay, prefixo válido, duplicação e falhas exercitados; revisão operacional independente aceita. Encerramento canônico/integração ainda pendentes.                                                                                            |
| PISO-005 — serialização de lembretes       |         60 | Regressões operacionais e saturação passam na R19 sem reduzir o limite original. A melhoria TTL tem aceite semântico, sem promessa de custo linear global.                                                                                            |
| PISO-006 — pausa/saúde/falha de transporte |         60 | Controles de processos e recebimentos simulados exercitados; transporte/canal real não qualificado.                                                                                                                                                   |
| PISO-007 — hardening do consumidor         |         60 | Consumidor compilado atual aceito em 62 asserções runtime/129 inputs exatos; UID 10001/rootfs readonly/capdrop/nnprivs/rede none/limites de recursos, restart/replay e negativos. Artefato derivado; Dockerfile completo e nft host não qualificados. |
| PISO-008 — backup/restore/alerta           |         60 | Provas locais e procedimentos sintéticos disponíveis; receptor sintético não é recebimento por responsável real. Consolidar vínculo ao artefato final.                                                                                                |
| PISO-009 — guia e homologação              |         20 | Vinte JSONs e dez WAVs com hashes conferidos. Whisper e revisão humana NOT_RUN; casos de mídia 17/18 são placeholders.                                                                                                                                |
| PISO-010 — piloto específico               |         20 | Contrato e decisão futura registrados; piloto não executado nem autorizado nesta rodada. Não simular aceite humano.                                                                                                                                   |

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

| Ordem | Frente / prioridade             | Próxima entrega verificável                                          | Gate de saída                                                                                  |
| ----- | ------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1     | CI / P1                         | R26 concluída; integrar evidência e manter o incidente R25           | Parser/hash metadata aceitos; sem skips inesperados ou certificado falso                       |
| 2     | Harness neutro / P1             | Consolidar build e 5.100 testes/385 arquivos da variante física R25  | Produto/env/alias ausentes; denominador próprio; asserções e pisos mantidos                    |
| 3     | Fronteira / P1                  | I1 first-party concluída; provar os desconhecidos remanescentes      | Desconhecido nunca recebe PASS; positivos públicos e negativos diretos/transitivos preservados |
| 4     | Integração / P1                 | Consolidar deltas próprios e promover apenas os caminhos autorizados | R2-D3 e seus testes/revisões satisfeitos; mudanças alheias preservadas; commit local sem push  |
| 5     | Operação local / P1             | Disponibilizar programa qualificado e comandos reproduzíveis         | Smoke, restart e limpeza em processos/volumes próprios; nenhuma chave na evidência             |
| 6     | Provider sintético / P1         | Congelar pacote T4 com hashes, fixtures e teto de custo              | Decisão específica sobre o pacote concreto; entradas desconhecidas NO_MODEL                    |
| 7     | Homologação do produto / P2     | Transcrições locais e revisão humana dos resultados esperados        | Não substituir fala humana por eSpeak como prova de qualidade clínica                          |
| 8     | Piloto/produção / gate separado | Pacote técnico/administrativo completo do candidato                  | Aceites efetivos do responsável; BUILD local não concede implantação                           |

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

## Atualização de evidência: variante neutra R24

A variante física sem produto passou no build público e na suíte de 5.030 testes em 383 arquivos com PostgreSQL e cobertura, sem falhas, skips ou TODOs. A captura confirmou os 7.685 inputs intactos. O resultado não é somado aos 5.662 testes da variante com produto, pois as suítes se sobrepõem. As notas e os estados canônicos permanecem: a fronteira instalada ainda requer correção e revisão. [Prova, preparação e hashes](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-neutral-r24-local-pass.json).

## Atualização de evidência: sandbox local

A versão imutável R19 está disponível na console sintética local 3501. O reinício preservou três arquivos anteriores e recuperou duas notas. Nove grupos browser passaram; crítico novo aceitou o escopo local, conferindo todos os 8.476 arquivos de fonte, corpus e sete pedidos negativos sem efeitos. Conversas visíveis ficam em memória; notas/eventos são duráveis. Os serviços permanecem simulados, sem chamadas OpenAI e com delivery NOT_QUALIFIED. As notas e estados canônicos não mudam por esse resultado. [Prova do reinício/browser](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/local-sandbox-r19-restart-browser.json) e [revisão independente](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/local-sandbox-r19-fresh-review.json).

## Atualização de evidência: checker de fronteira

A revisão R21 recusou o reparo anterior por uma consulta a uma chave sem binding lexical. A correção R22 passou em 1.255 testes sem skips, tipos e lint, e recebeu ACCEPT da revisão nova R23 com controles próprios. A CLI instalada preservou os 48 links e retornou INCOMPLETE/8.882 diagnósticos/zero violações/zero indisponibilidades lexicais; inputs intactos. Esse aceite fecha a correção lexical, não a fronteira instalada. As notas e estados canônicos permanecem. [Rejeição e prova](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/c1-binding-stack-fresh-review-r21-rejected.json) e [correção/regressões](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/c1-nonbinding-label-r22-builder.json).

## Candidato integrado R25 em execução

Formatação, tipos, lint, build e 5.735 testes unitários/413 arquivos passaram sem skips. A cobertura e os demais gates nativos ainda rodam. A variante física R25 sem produto está em teste separado com PostgreSQL/V8; nenhum total é somado. O scan estrito dos nove deltas CI/checker não encontrou segredos; sua revisão independente está em andamento. [Aceite lexical](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/c1-nonbinding-label-fresh-review-r23.json), [fronteira instalada ainda incompleta](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/c1-nonbinding-label-r22-installed.json) e [scan dos nove deltas](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-r25-nine-path-security-delta.json).

## Fechamento R25 e repetição R26

A variante sem produto passou em **5.100 testes/385 arquivos**, com PostgreSQL e cobertura, zero falhas/skips e 7.687 inputs intactos. A execução integrada R25 passou em 5.735 testes unitários e nos mesmos 5.735 testes com cobertura; o agregado nativo terminou **15 PASS/1 FAIL** porque o gate de mutação recusou um hash após alteração documental indevida. O documento foi recuperado, o erro e os resultados foram arquivados, e a cadeia completa R26 está em execução. Nenhum resultado FAIL foi convertido em PASS.

A análise de fronteira first-party cobre 222 observações: 140 propostas positivas I0 e 82 desconhecidas, sob nova revisão independente. As 54 declarações de dependência receberam bindings físicos CJS/ESM; isso não aceita a closure transitiva. As notas e os estados canônicos permanecem. [Variante neutra R25](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-neutral-r25-local-pass.json), [execução nativa recusada](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-r25-native-certify-document-drift-fail.json), [erro documental e recuperação](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-r25-document-claim-drift.json), [I0 finito](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/firstparty-frontier-disposition-i0-r26.json) e [bindings de dependências](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/firstparty-dependency-resolution-r28.json).

## Revisão de segurança dos nove deltas

O crítico novo aceitou os nove deltas CI/checker com 96 probes independentes, nove controles da baseline e oito injeções de falha. Scans estritos independentes, com configuração explícita e controle positivo, tiveram zero achados. Os metadados completos do scan original não foram preservados; a evidência independente o substitui somente nessa fatia. Não concede aceite de CodeQL, histórico completo, incidente de provenance ou release. [Revisão e artefatos](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/security-nine-delta-fresh-review-r26.json).

## Resultado local consolidado R26

**16/16 gates locais PASS; 5.735 testes/413 arquivos sem skips.** Certificado AAA_CONTROLLED/CONDITIONAL_GO. Variante sem produto: **5.100/385 PASS**, com PostgreSQL/cobertura; totais sobrepostos não somados. Revisão do consumidor compilado: **62 asserções runtime PASS**, incluindo restart/replay, configurações negativas e armazenamento indisponível, com 129 inputs e bundle reproduzidos. O relatório de captura mantém o drift do XML Playwright gerado; os1.816 inputs efetivos do candidato estão exatos.

A revisão first-party aceitou140 papéis finitos e manteve82 desconhecidos. Decimal tem apenas propostas por linha revisadas: nenhum dos1.072 diagnósticos foi aceito/suprimido sem tokenidentity. A closure instalada continua INCOMPLETE/8.882 diagnósticos. GlobalFAIL e produçãoNO_GO permanecem; não há novo DONE ou promoção Root.

[Certificação R26](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/final-r26-native-certify-local-pass.json), [consumidor compilado/I1](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/product-compiled-fresh-review-r32.json), [papéis first-party/I1](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/firstparty-frontier-fresh-review-r27.json), [propostas Decimal por linha](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/decimal-frontier-fresh-review-r33.json) e [decisão OpenAI T4 concreta](evidence/HARNESS-ISO-EXEC-20261003/green-20261004/synthetic-openai-t4-decision-r34.md). A preparação do pacote não leu a chave nem chamou provider.
