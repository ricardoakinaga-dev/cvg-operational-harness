# SPEC0214 — conferência do autor, sem aceite independente

Esta conferência verifica coerência documental; não é crítica fresh-context nem prova de runtime. Os22 critérios da seção8 são planos NOT_RUN.

| Desafio ao desenho                                       | Resposta ou limite registrado                                                                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Um wrapper pode chamar o pipeline antigo por dentro?     | Proibido: façade/planner/evaluator não chamam provider/gateway.execute/handler. Factory e dispatch reais são o alvo dos probes A01/A21.                                            |
| A resposta intermediária termina cedo?                   | CompletionEvaluator retorna INCOMPLETE na primeira RESPOND e só COMPLETE na final. O runtime não entrega o resultado intermediário ao caller. A02 detecta modelo pulado/duplicado. |
| Planning continua anterior à guarda?                     | Não: metadados são preparados sem planTools; planning só após resultado seguro do modelo. Output hostil deve manter counters0.                                                     |
| Uma janela de50 observações causa repetição?             | Planner usa stepNumber confiável e plano selado, com trajetória integral capturada separadamente para projeção. A15 exige mais de50 observações.                                   |
| Aprovação é consumida duas vezes?                        | Não se chama gateway.execute pelo kernel. request não consome; begin chama verifyAndConsume atômico uma vez. Corrida e replay permanecem critérios públicos.                       |
| Adapter legado equivale ao DurableApprovalEngineAdapter? | Não: autoridades têm contratos diferentes; ausência de fingerprint/settlement persistidos é OPEN-03. Nenhuma conversão por cast é autorizada.                                      |
| Fingerprint prova código e restart?                      | Não: hash de descriptors é separado de checksum do prompt e inputHash, e não atesta handler. OPEN-03/04 limitam claims.                                                            |
| Public ABI nova foi presumida?                           | Não: usa somente factory/ports existentes; módulos novos são privados; metadados e wiring ainda não existentes permanecem OPEN.                                                    |
| Metadados de tool desconhecida são inferidos?            | Não: ausência bloqueia; OPEN-01 exige decisão de compatibilidade. Fonte do read sintético conhecido foi inspecionada.                                                              |
| Sucesso do handler basta para trace succeeded?           | Não: fechamento pós-pipeline, log, approval e journal precisam concordar. Raw result é fato distinto; failed/unknown não autoriza retry.                                           |
| Cancelamento interrompe handler antigo fisicamente?      | Não é prometido: handler não recebe signal; pre-dispatch é protegido e outcome tardio permanece incerto. Efeitos reais continuam fora do escopo.                                   |
| Budget e erros são byte-compatible?                      | Não se afirma isso: fórmula/mapping concretos são PROPOSED e OPEN-05 exige decisão.                                                                                                |
| Declaração de todos os consumidores migrados?            | Não: somente caminho configurado/publicado desta fatia; produto/legacy/restart integral ficam nos cartões seguintes.                                                               |
| Evidência global foi herdada?                            | Não: nenhum teste funcional ou review independente desta candidata foi executado. Gates anteriores do Lead não certificam esta SPEC futura.                                        |

Resultado da conferência: proposta documental preparada para julgamento, com incompatibilidades e dependências visíveis. Nenhuma decisão OPEN foi fechada pelo autor.
