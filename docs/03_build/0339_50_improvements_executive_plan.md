# Plano executivo — 50 melhorias — 23/09/2026

> Estado corrente AUD52 (24/09/2026): C1L parou no candidate freeze por drift de `docs/02_spec/0190_spec_validation.md`; o resultado é `FAIL / OPEN`, sem candidate ou testes de produto. O preview foi aplicado nos três paths autorizados, mas segue sem validação de testes. Consulte o [resultado C1L](../04_audit/evidence/AUD-20260924/M07-S1-C1L/final-gate-result.md) e o [backlog corrente](0344_reaudit_m07_backlog.md). M07-S1 continua aberta; M05 e os slices dependentes permanecem bloqueados; G21-5/G21-6 fechados e produção `NO_GO`.

> Replanejamento de recuperação M07: [reauditoria 0569](../04_audit/0569_m07_delivery_and_repository_reaudit_2026-09-23.md), [roadmap 0343](0343_reaudit_m07_roadmap.md) e [backlog 0344](0344_reaudit_m07_backlog.md). O plano dos 50 IDs segue vigente, condicionado à correção auditada de M07 antes de M05.

## Objetivo e fonte

Transformar as 50 propostas da [lista priorizada](../04_audit/0568_50_melhorias_priorizadas_2026-09-23.md) em entregas auditáveis, preservando o programa AUD21 e seus gates. O [relatório de avaliação](../04_audit/0567_documentation_and_implementation_assessment_2026-09-22.md) é a baseline de risco; o [backlog detalhado](0341_50_improvements_backlog.md) contém uma ficha para cada ID; o [roadmap](0340_50_improvements_roadmap.md) ordena fases, sprints e transições.

O programa entrega capacidade local e documental primeiro; só qualifica dependências externas quando G21-5 for explicitamente aberto. Um score, teste local ou parecer do agente não libera uso com dados reais nem produção. G21-6 exige decisão técnica independente e decisão humana separada.

## Estado de entrada

- REM21-019: candidato local com 35 gates registrados como PASS, decisão CONDITIONAL_PASS / FINAL_CERT_DEFERRED, I1_CONDITIONAL_PASS ainda sem aceitação limpa.
- REM21-009: preparação offline concluída, pacote de decisão pendente; G21-5 fechado.
- Achados A21-F05 e A21-F06 bloqueados externamente; A21-F20 aberto por I1 não aceito.
- Produção, piloto, dispatch, dados reais e ações sensíveis permanecem NO_GO.
- A árvore de trabalho contém alterações anteriores; cada alteração candidate-scoped exige novo manifesto e nova qualificação. Não se promove o certificado histórico por inferência.
- A reconciliação M01 altera índices incluídos no manifesto anterior. O candidato REM21-019 permanece evidência histórica; esses novos bytes exigem novo freeze e recertificação antes de qualquer promoção.

## Resultado esperado

1. Cinquenta IDs com contrato, dependências, evidência e decisão de AUDIT; nenhum ID encerrado apenas por documento ou teste não executado.
2. API, persistência e runtime com fronteiras menores e comportamento preservado; composição pública do Harness demonstrada por dois consumidores.
3. Atendimento, RAG, approval, observabilidade, UI e operação qualificados em escopo proporcional ao risco, com fontes e autoridades explícitas.
4. Pacote externo revisável, incluindo owners, privacidade, identidade, provider, canal, worker, egress, restore, alertas e piloto assistido.
5. Release somente se os gates pertinentes e os signoffs aprovarem; se faltarem, entregar estado BLOCKED com a próxima dependência clara.

## Autoridade e fases

| Fase | Nome                             | Escopo                     | Gate de entrada                                                      | Saída                                                                 |
| ---- | -------------------------------- | -------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| P0   | Verdade documental               | M01 e registros mestres    | Task AUD22-DOC-001 já registrada                                     | Índices coerentes; próxima task definida                              |
| P1   | Baseline e arquitetura           | M02–M09, M20, L09          | Discovery/PRD/SPEC por slice, revisão humana e gate local específico | Composição, contratos e refactors locais com regressão                |
| P2   | Produto e experiência sintéticos | M10–M12, M16–M18, L05–L08  | SPEC do slice e dados sintéticos                                     | Fluxos/evidência/UI coerentes sem ação real                           |
| P3   | Resiliência e operação local     | M13–M15, L01–L04, L10      | Contratos anteriores estáveis                                        | Falhas, carga e documentação demonstradas                             |
| P4   | Freeze e revisão local           | H02, H01                   | P1–P3 auditadas e candidato congelado                                | Manifesto reproduzível e I1 aceito ou bloqueio honesto                |
| P5   | Decisões externas                | H04, H11, H13, H03         | Pacote REM21-009 e autoridades identificadas                         | G21-5 aprovado com escopo ou mantido fechado                          |
| P6   | Qualificação externa controlada  | H05–H10, H12, H14–H18, M19 | G21-5 explícito; ambiente e dados aprovados                          | Evidência externa, limites e rollback qualificados                    |
| P7   | Piloto e release                 | H19, H20                   | P6 aceita, I1 aceito e decisão humana                                | Piloto assistido e G21-6; produção continua NO_GO até decisão própria |

P1–P3 podem ser ordenadas em fatias menores pelo backlog. P5 pode preparar documentos em paralelo à engenharia local, mas suas decisões não alteram o gate antes de registro humano. P6 e P7 não iniciam por prazo, pontuação ou ausência de falha em fixture.

## Método de execução por task

Cada task segue DISCOVERY → PRD → SPEC → BUILD → AUDIT. O backlog fornece WHAT, localização inicial, abordagem, dependências e critério de pronto; a SPEC da task congela os contratos finais antes de código. Para trabalho documental puro, BUILD significa editar os documentos delimitados e AUDIT significa verificar coerência, links e proveniência. Para código, o agente preserva o candidato anterior, registra a mudança e executa os gates proporcionais, incluindo npm test, typecheck, lint e coverage quando configurada; gates críticos do CI bar voltam a ser obrigatórios antes de novo freeze.

Uma task só muda para COMPLETED quando a evidência é atual para seu run/candidate e o parecer de AUDIT declara o escopo. Estado local VERIFIED_LOCAL nunca significa qualificação externa. Não converter mocks, testes sintéticos ou runbooks em evidência de provider, canal, IdP, privacidade, RPO/RTO ou operador real.

G21-1 autorizou o escopo local das tasks REM21-001–019 e não concede automaticamente BUILD dos novos IDs H/M/L. O pedido atual autoriza este planejamento e as correções documentais pertinentes. Para cada novo slice com código, registrar Discovery/PRD/SPEC, obter o gate de BUILD e a revisão humana aplicáveis, e então executar somente o escopo aprovado. Nenhum gate de integração ou produção pode ser deduzido desse pedido.

## Controle documental contínuo

Em toda rodada, atualizar primeiro o artefato da task e sua evidência; depois o backlog; depois registrar a execução em docs/20_master_execution_log.md; por último atualizar docs/99_runtime_state.md com status, last_completed_action e uma next_action executável. Atualizar docs/03_build/0300_build_engineer_master.md, 0301_roadmap.md, 0302_backlog_master.md e docs/99_operational_index.md quando a navegação corrente mudar. Manter as entradas históricas; corrigir resumos derivados no topo sem reescrever resultados anteriores.

Cada handoff informa ID, fase, gate, arquivos alterados, comandos realmente executados, resultados, limites, riscos, dependência seguinte e o único próximo passo. Para mudança candidate-scoped, congelar novo manifesto e preservar hash/identidade de cada evidência; não reutilizar aprovação I1 de candidato anterior.

## Critérios de parada e escalonamento

- Falta de owner, decisão de negócio, privacidade, credencial, ambiente ou G21-5: BLOCKED ou WAITING_HUMAN_APPROVAL, sem executar a dependência externa.
- Divergência PRD/SPEC, potencial ato clínico/financeiro/prontuário ou confirmação/cancelamento/reagendamento real: handoff e decisão humana; sem automatizar a ação.
- Gate de código vermelho, evidência stale ou candidate drift: manter task aberta, registrar causa e reparar dentro do escopo aprovado.
- I1 condicional ou ausente: A21-F20 permanece aberto; não declarar certificação final.
- Produção: NO_GO até decisão específica de autoridade após G21-6; o plano não é essa decisão.

## Contexto de entrada do plano (AUD28; histórico)

P0-S0 / AUD22-DOC-001 / M01 foi concluída documentalmente. Em P1-S1, M07 Discovery/PRD/SPEC foram aprovados e o gate local M07-S1 foi executado; seu resultado é `FAIL` no candidato `a00127c13b165b81bd95d2671891e737f50bfb60c482816d0ef9c1b26fa4a797`, por thresholds de coverage abaixo da meta e 22 achados existentes de manifests. O [pacote da próxima etapa](0342_next_stage_p1_s1.md), [roadmap](0340_50_improvements_roadmap.md) e [backlog](0341_50_improvements_backlog.md) registram a dependência corretiva; M05 permanece após M07. O freeze H02 deve incorporar as mudanças documentais de M01 e o estado corrente da task.
