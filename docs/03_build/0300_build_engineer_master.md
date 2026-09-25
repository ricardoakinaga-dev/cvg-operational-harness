# 0300 — Build Engineer Master

> Ciclo corrente AUD51 (24/09/2026): [roadmap 0346](0346_aud29_roadmap.md) → [backlog A29](0347_aud29_backlog.md) → [handoff 0348](0348_next_stage_c1_decision.md) → [pedido C1L](../04_audit/evidence/AUD-20260924/M07-S1-C1L/approval-request.md) → [resultado C1J](../04_audit/evidence/AUD-20260924/M07-S1-C1J/final-gate-result.md). C1L SHA-256 `0a6dd3efa5bc3a45b8e42062680b338e58e3b4e45a924dd177d6a12b77601f6c` aguarda aprovação para matriz local limitada. M07-S1 continua `FAIL / OPEN`; S2/S3/S4 e M05 bloqueadas; produção `NO_GO`.

> Histórico AUD31 (24/09/2026): [auditoria 0570](../04_audit/0570_r1_delivery_repository_reaudit_2026-09-24.md) → [roadmap 0346](0346_aud29_roadmap.md) → [backlog 0347](0347_aud29_backlog.md) → [próxima etapa 0348](0348_next_stage_c1_decision.md). O gate C1 foi aprovado, mas o freeze parou em exit 64 porque o scanner rejeitou a pasta C1. A decisão seguinte era o gate C1E, agora histórico.

> Histórico AUD31: R1 permaneceu `FAIL / OPEN` no candidato `1038f996b0577e56ecd795f1f08b6e13bb3a752d454c80f3fc0601f51c045b5f`; B3 `PASS_WITH_FINDINGS`, B6 `FAIL`, B7 `PASS`, I1 `UNAVAILABLE`. C1 terminou freeze antes dos checks; os logs estão em [resultado C1](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/final-gate-result.md).

> Histórico de 23/09/2026: [0569](../04_audit/0569_m07_delivery_and_repository_reaudit_2026-09-23.md) confirma M07-S1 `FAIL/OPEN` e originou o [roadmap corretivo 0343](0343_reaudit_m07_roadmap.md), o [backlog 0344](0344_reaudit_m07_backlog.md) e o handoff histórico [0345/A24-04](0345_next_stage_m07_correction.md). O estado corrente está no ciclo AUD36 acima.

## Programa corrente — carteira de 50 melhorias — 23/09/2026

O [relatório 0567](../04_audit/0567_documentation_and_implementation_assessment_2026-09-22.md) e a [lista 0568](../04_audit/0568_50_melhorias_priorizadas_2026-09-23.md) estão salvos em docs. O novo ciclo documental usa o [plano executivo 0339](0339_50_improvements_executive_plan.md), o [roadmap 0340](0340_50_improvements_roadmap.md) e o [backlog 0341](0341_50_improvements_backlog.md), que cobrem todos os 50 IDs.

Estado comprovado: REM21-019 = CONDITIONAL_PASS / FINAL_CERT_DEFERRED para o candidato histórico; REM21-009 = OFFLINE_PREPARATION_COMPLETE / BLOCKED_BY_G21-5. M01 foi concluída documentalmente. M07 Discovery, PRD e SPEC estão aprovados para suas etapas. C1J executou a matriz local no candidate `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b`, mas segue `FAIL / OPEN` porque I1 e Final Critic ficaram indisponíveis. O packet C1L de reteste local aguarda decisão hash-bound; consulte o [pedido](../04_audit/evidence/AUD-20260924/M07-S1-C1L/approval-request.md). C1K parou porque os dois reviewers ficaram indisponíveis. M07 não está fechado e M05 permanece bloqueada. M05 Discovery continua aprovada com opção A e par `published-agent`/`kernel`. Nenhum dado real, ação sensível ou produção; G21-5/G21-6 fechados e produção `NO_GO`.

As seções a seguir preservam o contexto e os estados históricos de programas anteriores. Para status corrente, usar os ledgers mestres e as evidências das tasks.

## Programa proposto após a auditoria abrangente de 21/09/2026

O programa corrente `AUD21-COMPREHENSIVE-REMEDIATION` está descrito no
[plano executivo 0335](0335_comprehensive_remediation_executive_plan.md),
[roadmap 0336](0336_comprehensive_remediation_roadmap.md),
[backlog 0337](0337_comprehensive_remediation_backlog.md) e
[prompt Codex 0338](0338_codex_full_remediation_prompt.md), derivados da
[auditoria 0566](../04_audit/0566_comprehensive_repository_audit_2026-09-21.md).
Status: `IN_PROGRESS / REM21-005 SPEC_READY`; `REM21-005` está
`BUILD_LOCAL_AUTHORIZED` após Discovery/PRD/SPEC; `REM21-006` está
`VERIFIED_LOCAL / FINAL_CERT_DEFERRED`; produção `NO_GO`. `G21-1` foi concedido
somente para a execução local, sintética e descartável do prompt `0338`. O
programa preserva AUD20 como histórico, registra `AUD20-008` como
`PASS_LOCAL / I1_PENDING` e reconcilia agora o control plane. Este índice não
autoriza integração externa, ações sensíveis ou produção.

## Programa proposto após a reauditoria de 20/09/2026

O programa `AUD-20260920-REAUDIT` está registrado no
[plano executivo 0331](0331_audit20_executive_plan.md),
[roadmap 0332](0332_audit20_roadmap.md) e
[backlog 0333](0333_audit20_backlog.md), derivados da
[auditoria 0565](../04_audit/0565_code_reaudit_2026-09-20.md). Status:
`READY_FOR_NEXT_STEP / G20-1_AUTHORIZED`, engine `EVOLUTION / BUILD`, produção
`NO_GO`. `AUD20-001`–`AUD20-006` estão verificadas localmente; `AUD20-007` é
a próxima task e `AUD20-008`–`018` estão autorizadas por dependência
sequencial. O candidato `d7f5…` e seu
certificado `CONDITIONAL_GO / AAA_CONTROLLED` permanecem como histórico de
`AUD19-016`; a barra QAUD20 retornou `REJECT`.

## Programa de remediação da auditoria de 19/09/2026

O programa `AUD-20260919-REMEDIATION` está registrado em
[plano executivo 0328](0328_audit_20260919_executive_plan.md),
[roadmap 0329](0329_audit_20260919_roadmap.md) e
[backlog 0330](0330_audit_20260919_backlog.md), derivados da
[auditoria 0564](../04_audit/0564_full_construction_audit_2026-09-19.md).
Status histórico: `COMPLETED_CONTROLLED` em `AUD19-016`; tasks `001`–`016`
encerradas conforme o backlog `0330`. O resultado foi supersedido para decisão
corrente pela auditoria `0565`, sem apagar sua evidência. Nenhuma task
autorizou integração real, produção ou ação sensível.

## Complemento pós-auditoria de 13/09/2026

Consultar [plano para produção](../PLANO_EXECUTIVO_PRODUCAO.md), [roadmap](../ROADMAP_PRODUCAO.md) e [backlog consolidado](../BACKLOG_PRODUCAO.md). Os 42 IDs AAA mantêm seus contratos/status; 14 IDs PROD acrescentam correções e pré-requisitos de saída. Não concluir pela evidência histórica de outro candidato. Este índice não concede gate de BUILD ou produção.

## Programa AAA pós-auditoria — 2026-09-12

Planejamento vigente da remediação `AUD-20260912-001`: [plano executivo 0324](0324_aaa_executive_plan.md), [roadmap 0325](0325_aaa_roadmap.md), [backlog 0326](0326_aaa_backlog.md). O [JSON canônico](tracking/aaa_program_backlog.json) registra 42 tasks propostas; nenhum gate BUILD é concedido por este índice. Preservar gates históricos e ler a SPEC aprovada da task antes de código.

## Objetivo da construcao

Construir a Esmeralda V2 como plataforma de agente hospitalar modular, auditavel e semi-autonoma, iniciando pelo MVP entre autonomia nivel 1 e nivel 2.

## Escopo da execucao

Derivado da SPEC:

- Monorepo com `apps` e `packages`.
- Agent Runtime.
- Session Manager.
- State Manager.
- LangGraph Workflows.
- Tool Registry.
- Policy Engine.
- Memory Engine inicial.
- Human Approval Layer.
- Audit Logger.
- Task Queue.
- API, worker e web minimo.

## Modulos envolvidos

- `apps/api`
- `apps/worker`
- `apps/web`
- `packages/shared`
- `packages/agent-core`
- `packages/workflows`
- `packages/tools`
- `packages/adapters`
- `packages/memory`
- `packages/policy`
- `packages/rag`

## Riscos tecnicos

- Acoplamento de canal ao runtime.
- Falta de idempotencia em mensagens, tools e tasks.
- Policy engine insuficiente para bloquear acoes sensiveis.
- Auditoria parcial.
- Workflows grandes demais ou com regra clinica indevida.
- Painel minimo virar fonte de regra de negocio.

## Dependencias criticas

- SPEC aprovada para planejamento em `docs/02_spec/0190_spec_validation.md`.
- Definicao humana final das regras de agenda e autonomia.
- Contratos de tools antes dos workflows.
- Persistencia e auditoria antes de integracoes externas.

## Estrategia de execucao

Executar em fases sequenciais:

```txt
Fundacao -> Dominio -> Fluxos -> API/Integracoes -> Frontend -> Hardening -> Rollout
```

Cada phase deve ser quebrada em sprints. Cada task deve conter o que, onde, como, dependencia e criterio de pronto.

## Artefatos deterministas obrigatorios

- `0303_build_execution_contract.md`: contrato de execucao, bloqueios, TDD e Definition of Done.
- `0304_traceability_matrix.md` e `.json`: rastreabilidade PRD/SPEC para phases, sprints, tasks e testes.
- `0305_repository_target_structure.md` e `.json`: arvore alvo exata do repositorio.
- `0306_phase_sprint_plan.md` e `.json`: phases, sprints e entregaveis fechados.
- `0307_technical_tracking_schema.md`: schema de acompanhamento tecnico.
- `0308_task_catalog.json`: catalogo atomico de tasks com arquivos, testes e comandos.
- `phase_0/task_*.md`: tasks executaveis da primeira phase.

O executor deve tratar os JSONs como fonte operacional. Os Markdown explicam o racional; os JSONs controlam execucao e verificacao.

## Estrategia de validacao

- Testes unitarios para regras, schemas e policies.
- Testes de integracao para commands, repositories e tools.
- Testes de fluxo para workflows principais.
- Auditoria de sprint ao final de cada entrega.
- Registro no execution log.

## Estrategia de rollback

- Migracoes pequenas e reversiveis quando possivel.
- Feature flags ou configuracoes para ativar workflows.
- Adapters externos isolados para desligamento sem derrubar runtime.
- Falhar fechado em policy, approvals e acoes sensiveis.

## Gate pre-build

```txt
STATUS: WAITING_HUMAN_APPROVAL_FOR_PHASE_0_EXECUTION
CONDICAO: sprint 0 esta detalhada, mas execucao de codigo exige confirmacao humana explicita do escopo e nao libera fluxos sensiveis
```

## Guardrails obrigatorios para qualquer sprint

- Comecar por teste ou criterio executavel quando houver codigo.
- Manter `npm test`, typecheck e lint verdes antes de fechar sprint.
- Nao implementar agenda funcional, RAG com dado real, financeiro, prontuario ou automacao clinica sem decisao humana registrada.
- Falhar fechado para policy, auth, audit e actions sensiveis.
- Registrar mudancas em `docs/20_master_execution_log.md` e atualizar `docs/99_runtime_state.md`.
