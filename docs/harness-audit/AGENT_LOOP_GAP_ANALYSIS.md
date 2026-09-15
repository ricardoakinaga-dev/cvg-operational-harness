# Gap analysis do Agent Loop

## Conclusão

**ABSENT como loop cognitivo; PARTIAL como execução governada.** Não há retorno de observação de tool/retrieval ao modelo, avaliação de suficiência ou replanning.

| Capacidade                            | Estado                 | Evidência                                                                                                           |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------------------------- |
| múltiplas model calls cognitivas      | ABSENT                 | uma chamada em `packages/platform/src/test-lab.ts:329-344` e uma em `packages/agent-runtime/src/runtime.ts:712-793` |
| múltiplas tool calls                  | PARTIAL                | default executa conjunto pré-planejado; kernel executa no máximo uma, sem nova decisão                              |
| observe→act→observe                   | ABSENT                 | tool result termina em resposta/outbox; `runtime.ts:901-1013`                                                       |
| planning                              | IMPLICIT/PARTIAL       | `actionForMessage()` lexical; `WorkflowPlan` é input de uma porta sem implementação                                 |
| replanning/reflection/self-evaluation | ABSENT                 | nenhum branch executável pós-observação                                                                             |
| answer verification                   | PARTIAL                | filtro lexical em `packages/platform/src/output-policy.ts:147-199`, sem verificador factual                         |
| retry semântico                       | ABSENT                 | retry do gateway é técnico                                                                                          |
| retry técnico                         | IMPLEMENTED            | `packages/model-gateway/src/gateway.ts:280-424`; consumer/outbox                                                    |
| evidence sufficiency                  | ABSENT                 | não existe modelo geral de evidência                                                                                |
| knowledge sufficiency                 | PARTIAL                | uma consulta; ausência vira handoff                                                                                 |
| ambiguity/clarification               | PARTIAL                | confiança lexical e template; sem slots/estado de diálogo                                                           |
| continuation criteria                 | ABSENT                 | todo turno retorna terminalmente                                                                                    |
| max steps/model/tools                 | IMPLEMENTED no kernel  | `packages/agent-runtime/src/contracts.ts:13-20`, `runtime.ts:515-550`                                               |
| timeout/cancel/cost                   | IMPLEMENTED no kernel  | `runtime.ts:488-530`, `:752-757`                                                                                    |
| token budget total                    | ABSENT                 | há `maxTokens` por chamada, não orçamento de contexto/turno                                                         |
| recursion/loop detection              | ABSENT                 | nenhum loop existe                                                                                                  |
| circuit breaker                       | IMPLEMENTED no gateway | `packages/model-gateway/src/circuit-breaker.ts:38-156`                                                              |
| approval pause/resume                 | IMPLEMENTED/PARTIAL    | proposta `runtime.ts:808-885`; retomada é novo turno dirigido pelo caller                                           |

## Maior gap

Os nomes e budgets antecipam um loop futuro, mas não há estado persistente de iteração, observação tipada, critério `enough?`, replanejamento ou stop por repetição. A primeira evolução segura deve introduzir contratos de `Decision`, `Observation`, `EvidenceSet`, `Checkpoint` e `StopReason` antes de permitir mais chamadas.
