# Decisão do modelo de orquestração

Escala relativa: `HIGH` é favorável em predictability, natural conversation, security, debuggability, testability, extensibility e operational reliability; em cost, latency e hallucination risk, `LOW` é favorável. As notas são uma decisão arquitetural, não benchmark executado.

| Dimensão                | A. Deterministic Workflow                                    | B. State Machine                                    | C. LLM-driven Orchestrator            | D. Hybrid Orchestrator                                                   |
| ----------------------- | ------------------------------------------------------------ | --------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------ |
| Predictability          | HIGH: transições codificadas                                 | HIGH: estados/transições explícitos                 | LOW: próximo passo probabilístico     | HIGH no enforcement; MEDIUM na proposta cognitiva                        |
| Natural conversation    | LOW: árvore tende a mecanizar linguagem                      | MEDIUM-LOW: estado ajuda continuidade, não fluência | HIGH: geração e decisão flexíveis     | HIGH: LLM conversa; kernel limita consequências                          |
| Security                | HIGH se capabilities forem fechadas                          | HIGH com guards e estados terminais                 | LOW como autoridade direta de effects | HIGH: policy/approval determinísticos entre proposta e effect            |
| Debuggability           | HIGH: branch reproduzível                                    | HIGH: snapshot e transição inspecionáveis           | LOW: decisão depende de prompt/modelo | MEDIUM-HIGH se propostas e decisões forem journaled                      |
| Cost                    | LOW                                                          | LOW                                                 | HIGH por chamadas/iterações           | MEDIUM, limitado por budgets e rotas determinísticas                     |
| Latency                 | LOW e estável                                                | LOW-MEDIUM por persistência                         | HIGH/variável                         | MEDIUM e bounded por deadline/steps                                      |
| Testability             | HIGH por fixtures                                            | HIGH por transition tables                          | LOW-MEDIUM; exige evals estatísticos  | HIGH no kernel; MEDIUM na cognição com evals                             |
| Extensibility           | LOW-MEDIUM; branch cresce por caso                           | MEDIUM; novos estados exigem migração               | HIGH, mas contrato frouxo             | HIGH com intents/actions tipados e plugins governados                    |
| Risk of hallucination   | LOW para decisões codificadas; linguagem ainda pode inventar | LOW para transição; fatos dependem da resposta      | HIGH sem evidence/authority firewall  | MEDIUM na proposta, LOW para fatos/effects quando fail-closed            |
| Operational reliability | HIGH para fluxos conhecidos                                  | HIGH com checkpoint/CAS/recovery                    | LOW-MEDIUM sob provider drift/failure | HIGH se state machine durável, fallback e enforcement forem obrigatórios |

## Leitura no contexto do repositório

- O estado atual já prova workflows determinísticos e governance forte, mas não um orchestrator executável: `packages/platform/src/test-lab.ts`, `packages/agent-runtime/src/runtime.ts` e `packages/agent-runtime/src/composition.ts`.
- Approval pause/resume e CAS favorecem uma state machine durável para efeitos: `packages/approval-engine/src/engine.ts` e `packages/persistence/src/runtime-approval-store.ts`.
- O gateway possui routing, retry e circuit breaker que podem servir à cognição probabilística, mas o caminho default o contorna: `packages/model-gateway/src/gateway.ts` e `packages/agent-core/src/commands/execute-published-agent.ts`.
- Não há benchmark comparativo de custo/latência destas quatro opções. Confiança na recomendação: **MEDIUM**, baseada nos trust boundaries e no runtime observado; valores quantitativos permanecem `NOT_RUN`.

## Decisão

**D. Hybrid Orchestrator: deterministic governance + probabilistic cognition.**

A LLM pode propor `respond`, `retrieve`, `call_tool`, `ask_user`, `request_approval`, `handoff`, `retry`, `verify`, `replan` ou `stop`. O kernel valida schema, capability, policy, evidence, approval, budgets e effect state; nenhuma saída de LLM executa diretamente. Uma state machine durável controla checkpoint, pause/resume/approval, enquanto workflows determinísticos permanecem disponíveis para tarefas críticas repetíveis.

Rejeitam-se A e B isoladamente porque não resolvem conversa natural/planning; rejeita-se C isoladamente porque viola a separação entre linguagem flexível, fatos grounded e ações autorizadas. Esta decisão não autoriza implementação. Pré-requisitos: contracts neutros, canonical runtime path, tool registry unificado, evidence model, checkpoint store e evals do runtime real.
