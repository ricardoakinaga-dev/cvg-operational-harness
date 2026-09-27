# Roadmap de execução — AUD-0578

- Fonte: [AUD-0578](../04_audit/0578_program_comprehensive_audit_2026-09-26.md).
- Plano de produção: [0354](0354_production_executive_plan_2026-09-26.md); sequência e gates de fase: [0355](0355_production_roadmap_2026-09-26.md); tasks canônicas: [0356](0356_production_backlog_2026-09-26.md).
- Este roteiro organiza os nove achados da auditoria. [0359](0359_aud0578_execution_backlog.md) registra a relação entre achado, task, dependência e prova. Não substitui o aceite de 0356 nem concede gate de BUILD ou de produção.
- Baseline: `503ded798ccb64e35b9fc591817d23f5130daff4`; cinco documentos da rodada AUD-0578 estão no worktree sem commit. Preservar esse trabalho.
- Objetivo de saída: atender as 13 condições de GO de 0354 no mesmo candidato/digest/configuração, com decisão humana registrada. Produção permanece `NO_GO` até lá.

## Sequência

| Onda                            | Entrega e achados                                                                                                                         | Dependência de entrada                                           | Prova de saída                                                                                            |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| R0 — Baseline e rastreabilidade | Incorporar a AUD-0578, reconciliar estado e publicar backlog verificável (F06).                                                           | Nenhuma.                                                         | Links/formatação verdes; histórico anterior preservado.                                                   |
| R1 — CI e candidato             | Validar PR-010/011 no GitHub, eliminar escrita E2E em evidência histórica (F01/F05/F09), congelar candidato e reemitir certificado (F02). | R0; SPEC curta e testes da PR-009 antes de executar E2E.         | Verify e Security verdes no mesmo SHA; `certification:verify` exit 0; nenhum arquivo histórico regravado. |
| R2 — Qualidade local            | Relatórios separados de cobertura web/PostgreSQL, lint type-aware, README e ledgers navegáveis (F04/F06).                                 | R1 como baseline; PR-005/007/009.                                | Critérios PR-005/007/009 e gates T1/T2 satisfeitos.                                                       |
| R3 — Neutralidade do harness    | PR-L04, L06–L10, L12; PR-L11 somente após DL-05 (F08).                                                                                    | D-01 a D-04 e D-13 já decididas; SPEC e gates da fatia corrente. | Nenhum resíduo ativo fora de `legacy/`, fluxo neutro e E2E/certificação verdes.                           |
| R4 — Definição do produto       | F1 e decisões D-03 a D-11; PRD adendo e primeiro consumidor (F03/F07).                                                                    | Discovery e aprovações de produto próprias.                      | PRD e capacidades de produção aprovados; fornecedor, canal, IdP, região e DPO definidos.                  |
| R5 — Plataforma para staging    | F2–F6: identidade, privacidade, integrações sintéticas e infraestrutura (F03/F07).                                                        | R3/R4, SPECs T3/T4 e contratos externos necessários.             | Gates de fase G-F2 a G-F6 com evidência em staging; nenhum dado real sem gate.                            |
| R6 — Piloto e decisão           | F7, auditoria independente, piloto e go/no-go (F03/F07).                                                                                  | R5, candidato hash-bound e autorização humana específica.        | Treze condições de 0354 verificadas no mesmo digest; decisão humana D-14/D-15.                            |

## Caminho crítico e trabalho paralelo

`R0 → R1 → R3 + R4 → R5 → R6`. R2 pode avançar em paralelo após baseline R1, mas cobertura, E2E e certificado de release precisam ser reexecutados após qualquer mudança aplicável. O código de segurança/identidade, contratos públicos, policy, approval ou migrations é T3: SPEC revisada explicitamente pelo usuário antes do BUILD. Provider, canal, conhecimento, efeito externo real, dado real e release candidate são T4: pacote com SHA-256, candidato congelado, certificação completa e decisão humana. Nenhum passo do roadmap autoriza efeito real automático, consulta real, resposta RAG sem fonte aprovada ou produção irrestrita.

## Próximo incremento executável

1. **Verificado localmente:** [SPEC curta PR-009](../02_spec/0137_e2e_artifact_isolation.md), E2E 12/12 em `test-results/`, quatro hashes históricos preservados, gates T2 verdes. A PR-009 permanece aberta para JUnit/runId, jornadas e flake visual.
2. **Em curso:** [SPEC-PR003-002](../02_spec/0138_skip_catalog_rebind.md) reconciliou dois hashes do catálogo de skips; repetir `npm run certify` e `certification:verify` no candidato atualizado.
3. Validar PR-010/011 no remoto sobre o mesmo SHA. Falha remota não vira PASS local.

Decisões de 27/09/2026: D-03 = A, núcleo governado completo para o primeiro
piloto; D-04 = primeiro consumidor e contexto a definir no discovery PR-101.
O próximo limite humano material inclui a validação do discovery/PRD, a
identificação do piloto, D-05/D-06/D-08/D-09/D-10/D-11 e DL-05 em
[0357](0357_production_decision_packet_2026-09-26.md), além das revisões de
SPEC T3/T4. A documentação e as correções locais reversíveis podem avançar
sem inferir essas decisões.
