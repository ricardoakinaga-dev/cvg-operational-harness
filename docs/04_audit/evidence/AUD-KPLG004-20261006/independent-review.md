# Revisão independente — AUD-KPLG004

- Revisor: Planck, agente `01a110e3-1f9a-7982-9229-f6ece76d5ce5`; execução somente leitura, sem descendentes, arquivos editados ou infraestrutura própria.
- Candidato: `ee7b3f9`; comparação com `b62f726`; critério: SPEC 0181 I3–I12, checkpoint antes da reserva, recuperação e compatibilidade de aprovação.
- Evidência informada pelo crítico: sondas sintéticas carregadas em memória, Node 24.20.0; sem PostgreSQL ou crash novo de processo. O relato é evidência de revisão, não substitui logs de regressão ou aprovação humana.

O revisor confirmou P2 em `packages/harness/src/kernel/pipeline.ts:190`: com política ALLOW e guarda negando, o pai registra `turn/start → tool/call → tool/result:not_started → turn/end`; o candidato registra `turn/start → tool/call → turn/end`. Ambos negam a ferramenta sem corpo ou efeito. O retorno antecipado pula post-execute e o resultado. As negativas de política já careciam desse resultado no pai e não foram classificadas como regressão.

O revisor comparou três cenários de checkpoint. O checkpoint continuou precedendo `approval.execution.begin`; os bindings de tenant, agente/versão, recurso, ação, fingerprint, operationKey, policyVersion e executionRef permaneceram iguais. Resume antes da reserva executou uma vez nos dois candidatos quando havia orçamento. Com o último slot de ferramenta já consumido pelo checkpoint, ambos retornaram MAX_TOOL_CALLS sem corpo: dívida preexistente de recovery, sem atribuição à refatoração. As sondas desse relato ficaram em memória; o caso de orçamento requer artefato reproduzível próprio antes de fechamento.

Não repetiu as sondas do lead de pausa/cancelamento, pausa terminal, falha de append ou rewrite do modelo. Conferiu os quatro arquivos auditados iguais ao commit ao encerrar. Confiança alta no achado de negação de guarda; nenhum parecer de produção pronta.

## Verificação pelo lead

O lead executou a negação de guarda e o rewrite do modelo no pai e no candidato em Node 22.23.2, preservando fonte e logs. No pai, 2 PASS (6 casos excluídos por filtro); no candidato, ambas falham. Os artefatos `parent-comparison.log.gz`, `probes.log.gz` e `probes.test.ts.txt` neste diretório tornam as duas regressões reproduzíveis. O caso de orçamento preexistente foi mantido como observação, sem alegar execução Node 22 pelo lead.
