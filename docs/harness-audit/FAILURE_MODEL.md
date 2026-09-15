# Failure model

| Falha pedida                     | Estado atual           | Tratamento/evidência                                                                      |
| -------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------- |
| MODEL_FAILURE/TIMEOUT/RATE_LIMIT | IMPLEMENTED no gateway | taxonomy em `model-gateway/src/errors.ts`; retry/fallback/circuit em `gateway.ts:280-424` |
| INVALID_STRUCTURED_OUTPUT        | IMPLEMENTED            | parser fail-closed no gateway; denial no kernel                                           |
| TOOL_FAILURE                     | IMPLEMENTED            | terminal/uncertain conforme effect state                                                  |
| TOOL_TIMEOUT                     | ABSENT uniforme        | cancel signal existe; manifest/tool executor não impõe deadline comum                     |
| POLICY_DENIAL                    | IMPLEMENTED            | antes de model/tool                                                                       |
| APPROVAL_PENDING/DENIED          | IMPLEMENTED/PARTIAL    | lifecycle existe; outcome público sobrecarrega reasons                                    |
| RAG_EMPTY                        | IMPLEMENTED narrow     | `approved_source_missing -> handoff`                                                      |
| RAG_LOW_CONFIDENCE               | ABSENT                 | sem confidence/scoring                                                                    |
| STATE_CONFLICT                   | PARTIAL/STRONG         | pins, CAS revisions/generation e tenant locks                                             |
| DATABASE_FAILURE                 | PARTIAL                | rollback/retry/worker failure; operação real não ensaiada aqui                            |
| OUTBOX_FAILURE                   | IMPLEMENTED com gap    | direct effect pode ser reportado como denied sem certainty                                |
| CHANNEL_FAILURE                  | PARTIAL                | adapter/outbox retry; produção não composta                                               |
| LOOP_EXHAUSTION                  | MISNAMED/PARTIAL       | stage budgets, sem loop cognitivo                                                         |
| COST_EXHAUSTION                  | IMPLEMENTED            | runtime/gateway budgets                                                                   |
| HUMAN_TAKEOVER                   | IMPLEMENTED            | suppress/terminal denial                                                                  |

Falhas pós-effect devem preservar `effect certainty`, `outboxPending`, `repair owner` e replay key. A taxonomia futura precisa distinguir `RETRYABLE`, `PAUSED`, `TERMINAL_FAILURE`, `UNCERTAIN_EFFECT` e `COMPLETED_WITH_DELIVERY_PENDING`; `denied + reason:string` não é suficiente para API pública do Harness.
