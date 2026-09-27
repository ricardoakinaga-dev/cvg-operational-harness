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

R2 documental PR-005 concluiu rotação byte a byte dos três ledgers e README em `docs/08_runtime/archive/`, com hashes originais, links e formatação conferidos; os ledgers vigentes têm menos de 300 linhas. PR-007 possui [SPEC 0145](../02_spec/0145_web_postgres_coverage_and_typed_lint.md), dois relatórios e gates CI locais verdes; sua certificação/Verify no candidato integrado ainda está pendente.

O Verify R1 `36298961234` passou os gates até a certificação; a leitura do
resumo textual unitário devolveu `null` apesar dos 16 comandos internos
verdes. [SPEC 0147](../02_spec/0147_certification_vitest_json_metrics.md)
leva as métricas ao JSON bruto. [SPEC 0146](../02_spec/0146_pinned_ssrf_lookup_node22.md)
mantém em revisão T3 o defeito de lookup SSRF descoberto com Node 22.

1. **Verificado localmente:** [SPECs PR-009](../02_spec/0148_e2e_junit_json_run_binding.md), E2E 12/12 em Node 22, quatro hashes históricos preservados e JSON/JUnit com o mesmo runId. Certificação e Verify do candidato integrado ainda pendentes; jornadas de aprovação e estabilidade visual seguem abertas.
2. **Verificado localmente no candidato anterior:** [SPEC-PR003-002](../02_spec/0138_skip_catalog_rebind.md) reconciliou dois hashes do catálogo de skips; `certify` 16/16 PASS e `certification:verify` exit 0 no candidato `b41f1e2e…`. O candidato com a fonte da [SPEC 0139](../02_spec/0139_visual_font_fallback.md) precisa de nova emissão.
3. **CI remoto:** Security passou no SHA `81bb91f`; Verify passou E2E e browser-proof, mas o catálogo bloqueou um hash de teste desatualizado. [SPEC 0144](../02_spec/0144_homolog_skip_catalog_rebind.md) delimita o rebind. Repetir Verify e Security no mesmo SHA novo antes de fechar PR-010/011.
4. **F1:** [discovery PR-101](../00_discovery/0019_platform_first_consumer_pilot.md) aberto, sem candidatos a produto definidos; seu gate segue `NOT_VALIDATED`.

Decisões de 27/09/2026: D-03 = A, núcleo governado completo para o primeiro
piloto; D-04 = primeiro consumidor e contexto a definir no discovery PR-101.
O próximo limite humano material inclui a validação do discovery/PRD, a
identificação do piloto, D-05/D-06/D-08/D-09/D-10/D-11 e DL-05 em
[0357](0357_production_decision_packet_2026-09-26.md), além das revisões de
SPEC T3/T4. A documentação e as correções locais reversíveis podem avançar
sem inferir essas decisões.
