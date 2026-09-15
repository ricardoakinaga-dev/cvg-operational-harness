# Rastreabilidade dos requisitos da auditoria

Esta matriz torna explícito onde cada seção do master prompt é respondida. `COVERED` significa que o relatório indicado responde ao pedido com evidência ou registra honestamente `UNKNOWN`/`NOT_RUN`; não significa prontidão de produção. A precedência usada em toda a auditoria é **code > tests > configuration > documentation > assumptions**.

| Seção | Requisito verificável                                                                         | Artefato canônico                                                      | Cobertura |
| ----- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------- |
| 1     | Medir quanto do Harness existe, onde, acoplamento e faltas                                    | `EXECUTIVE_REPORT.md`, `HARNESS_SCORECARD.md`                          | COVERED   |
| 2     | Aplicar taxonomia Product/LLM/Skill/Tool/MCP/SDK/Adapter/Gateway/Runtime/Orchestrator/Harness | `COMPONENT_CLASSIFICATION_MATRIX.md`, `TARGET_HARNESS_ARCHITECTURE.md` | COVERED   |
| 3     | Evitar tratar o Harness como Secretary sem UI ou mera coleção de packages                     | `TARGET_HARNESS_ARCHITECTURE.md`, `EXTRACTION_BOUNDARY.md`             | COVERED   |
| 4     | Inventário completo e campos por componente                                                   | `REPOSITORY_INVENTORY.md`                                              | COVERED   |
| 5     | Classificação H1–H9 e responsabilidades mistas                                                | `COMPONENT_CLASSIFICATION_MATRIX.md`                                   | COVERED   |
| 6     | Seguir o runtime executável real, classificá-lo e diagramá-lo                                 | `CURRENT_AGENT_RUNTIME.md`                                             | COVERED   |
| 7     | Classificar cada capacidade do agent loop e seus limites                                      | `AGENT_LOOP_GAP_ANALYSIS.md`                                           | COVERED   |
| 8     | Determinar se há orchestrator e onde a próxima ação é decidida                                | `ORCHESTRATION_ANALYSIS.md`                                            | COVERED   |
| 9     | Reconstruir context assembly, prioridades, provenance, budgets e proteções                    | `CONTEXT_ENGINEERING_ANALYSIS.md`                                      | COVERED   |
| 10    | Separar liberdade conversacional, fatos e autoridade operacional                              | `CONVERSATIONAL_ARCHITECTURE.md`                                       | COVERED   |
| 11    | Classificar fatos A–E, fontes, provenance, freshness e risco de invenção                      | `FACTUAL_GROUNDING_ANALYSIS.md`                                        | COVERED   |
| 12    | Auditar ingestion, retrieval, ranking, isolamento e iteração RAG                              | `KNOWLEDGE_RUNTIME_ANALYSIS.md`                                        | COVERED   |
| 13    | Auditar providers, adapters, routing, resiliência e genericidade do Model Gateway             | `MODEL_GATEWAY_ANALYSIS.md`                                            | COVERED   |
| 14    | Inventariar individualmente tools/capabilities e campos de contrato/governança                | `TOOL_CAPABILITY_ARCHITECTURE.md`                                      | COVERED   |
| 15    | Avaliar unificação futura de native/plugin/MCP sem implementar MCP                            | `MCP_READINESS.md`                                                     | COVERED   |
| 16    | Distinguir Skill de prompt/workflow/tool/plugin e avaliar registry/manifest/loader/versioning | `SKILL_RUNTIME_READINESS.md`                                           | COVERED   |
| 17    | Separar tipos de memória/estado e avaliar lifecycle, isolamento, consistência e recovery      | `MEMORY_STATE_ARCHITECTURE.md`                                         | COVERED   |
| 18    | Reconstruir intent→policy→approval→authorization→audit e separar genericidade                 | `GOVERNANCE_EXTRACTION_ANALYSIS.md`                                    | COVERED   |
| 19    | Mapear observabilidade e capacidade de reconstruir a execução                                 | `OBSERVABILITY_ANALYSIS.md`                                            | COVERED   |
| 20    | Avaliar persistência/durabilidade perante crashes, falhas e duplicatas                        | `DURABILITY_ANALYSIS.md`                                               | COVERED   |
| 21    | Auditar composition roots, especialmente `server.ts`, e leakage                               | `COMPOSITION_ROOT_ANALYSIS.md`                                         | COVERED   |
| 22    | Grafos atual/alvo, ciclos, inversões, severidade e recomendação                               | `DEPENDENCY_DIRECTION_ANALYSIS.md`                                     | COVERED   |
| 23    | Decisão e campos completos de extração por componente, sem mover código                       | `EXTRACTION_BOUNDARY.md`                                               | COVERED   |
| 24    | Arquitetura alvo evidence-based e respostas às 14 perguntas de boundary/runtime               | `TARGET_HARNESS_ARCHITECTURE.md`                                       | COVERED   |
| 25    | Gap do Runtime V2 para loop iterativo governado e limites explícitos                          | `RUNTIME_V2_GAP_ANALYSIS.md`                                           | COVERED   |
| 26    | Comparar quatro modelos em dez dimensões e decidir sem modismo                                | `ORCHESTRATION_MODEL_DECISION.md`                                      | COVERED   |
| 27    | Arquitetura futura de conversa natural com grounding e authorization                          | `NATURAL_CONVERSATION_TARGET.md`                                       | COVERED   |
| 28    | Arquitetura do Secretary como primeiro cliente e dependência na direção correta               | `SECRETARY_POST_EXTRACTION_ARCHITECTURE.md`                            | COVERED   |
| 29    | Provar reuso conceitual com CVG Corp e identificar vazamentos Secretary                       | `MULTI_PRODUCT_REUSE_ANALYSIS.md`                                      | COVERED   |
| 30    | Registrar todos os riscos enumerados, impacto, probabilidade, mitigação e verificação         | `EXTRACTION_RISK_REGISTER.md`                                          | COVERED   |
| 31    | Mapear cobertura atual e testes obrigatórios pré/pó-extração                                  | `EXTRACTION_TEST_READINESS.md`                                         | COVERED   |
| 32    | Avaliar evals atuais e propor behavioral/safety/tool/grounding/orchestration evals            | `AGENT_EVALS_ANALYSIS.md`                                              | COVERED   |
| 33    | Registrar baseline real ou `NOT_RUN`, hotspots e budgets conceituais                          | `RUNTIME_PERFORMANCE_BASELINE.md`                                      | COVERED   |
| 34    | Definir trust boundaries, secrets, tenant/RBAC/tool/model/plugin/MCP/prompt/log boundaries    | `HARNESS_SECURITY_BOUNDARY.md`                                         | COVERED   |
| 35    | Separar control plane de execution plane e estado/configuração correspondentes                | `CONTROL_PLANE_ANALYSIS.md`                                            | COVERED   |
| 36    | Versionar runtime, skills, tools, policies, prompts, models, knowledge e evals                | `VERSIONING_REPRODUCIBILITY.md`                                        | COVERED   |
| 37    | Definir failure model por estágio e efeitos observáveis                                       | `FAILURE_MODEL.md`                                                     | COVERED   |
| 38    | Definir stop reasons, budgets, circuit breakers e proteção contra loops                       | `STOP_CONDITION_ANALYSIS.md`                                           | COVERED   |
| 39    | Pontuar 26 dimensões com evidência, confiança, força, gap e ação                              | `HARNESS_SCORECARD.md`                                                 | COVERED   |
| 40    | Dar três notas globais independentes                                                          | `HARNESS_SCORECARD.md`, `AUDIT_RESULT.json`                            | COVERED   |
| 41    | Responder dez perguntas de decisão e emitir GO/NO-GO qualificado                              | `EXECUTIVE_REPORT.md`, `AUDIT_RESULT.json`                             | COVERED   |
| 42    | Roadmap em fases com nove campos obrigatórios por fase                                        | `EXTRACTION_ROADMAP.md`                                                | COVERED   |
| 43    | Definir MUST_HAVE/SHOULD_HAVE/LATER do MVH                                                    | `MINIMUM_VIABLE_HARNESS.md`                                            | COVERED   |
| 44    | Relatório executivo com estrutura pedida e menos de 3.000 palavras                            | `EXECUTIVE_REPORT.md`                                                  | COVERED   |
| 45    | Resultado machine-readable válido com todos os campos pedidos                                 | `AUDIT_RESULT.json`                                                    | COVERED   |
| 46    | Vincular conclusões materiais a arquivo/símbolo/fluxo/teste/config e marcar incerteza         | Todos os relatórios; validação em `VALIDATION_REPORT.md`               | COVERED   |
| 47    | Não implementar extração/refactor/produção ou usar dados reais                                | `AUDIT_SCOPE_AND_METHOD.md`, `VALIDATION_REPORT.md`                    | COVERED   |
| 48    | Limitar mudanças a docs de auditoria e scripts read-only opcionais                            | `VALIDATION_REPORT.md`                                                 | COVERED   |
| 49    | Satisfazer completude, consistência, honestidade e acionabilidade                             | `QUALITY_BAR.md`, `VALIDATION_REPORT.md`                               | COVERED   |
| 50    | Entregar síntese terminal pedida                                                              | Resposta final do Lead; espelho em `EXECUTIVE_REPORT.md`               | COVERED   |
| 51    | Responder o que sobra sem Secretary, maturidade e caminho seguro                              | `EXECUTIVE_REPORT.md`                                                  | COVERED   |

## Limite desta matriz

A matriz é um índice, não evidência substituta. Cada conclusão deve ser julgada no artefato canônico indicado e nos seus anchors de código/teste/configuração. Quando uma capability não foi exercitada nesta rodada, o relatório correspondente usa `UNKNOWN` ou `NOT_RUN` e impede inferência de prontidão operacional.
