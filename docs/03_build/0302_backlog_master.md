# 0302 — Backlog Master

> Ciclo corrente AUD51: [0346](0346_aud29_roadmap.md), [0347](0347_aud29_backlog.md), [0348](0348_next_stage_c1_decision.md), [pedido C1L](../04_audit/evidence/AUD-20260924/M07-S1-C1L/approval-request.md), [resultado C1J](../04_audit/evidence/AUD-20260924/M07-S1-C1J/final-gate-result.md). Candidate C1J `e884796fd90192409230b0991524168186a9f65c824156a943102dcfacc98e1b`; C1L aguarda aprovação para matriz local limitada. M07-S1 `FAIL / OPEN`; produção `NO_GO`.

> Estado C1F em 24/09/2026: candidate `89e4d30ce8b2fd1d102a200bc729249a99ebc47499e4d04a79cd7f6633890f1a`, inventory completo com 11 findings e matriz local verde. O gate ficou `FAIL / OPEN` por C1F-05 parcial e I1 indisponível; Final Critic separado também não foi obtido. C1G é uma proposta nova, ainda sem aprovação ou candidate. M05 espera M07 aceita; produção `NO_GO`.

> Histórico anterior à aprovação R1: [0344 correções A24-01–A24-12](0344_reaudit_m07_backlog.md), derivado da [reauditoria 0569](../04_audit/0569_m07_delivery_and_repository_reaudit_2026-09-23.md), em complemento aos 50 IDs de 0341. A24-04 foi concluída documentalmente; o estado e a próxima ação correntes constam no parágrafo superior e nos ledgers mestres. M07-S1 histórico `FAIL/OPEN`, M05 dependente, I1 indisponível, G21-5/G21-6 fechados e produção `NO_GO`.

## Backlog corrente de planejamento — 50 melhorias — 23/09/2026

O [backlog 0341](0341_50_improvements_backlog.md) detalha os 50 IDs H01–H20, M01–M20 e L01–L10, com localização, execução, dependências e aceite. A fonte de status operacional continua em [30_backlog_master](../30_backlog_master.md), [99_runtime_state](../99_runtime_state.md) e nas evidências das tasks. M01 / AUD22-DOC-001 = COMPLETED_DOCUMENTAL. M07 Discovery, PRD e SPEC estão aprovados. C1J é o candidate S1 mais recente e segue `FAIL / OPEN` por indisponibilidade de I1 e Final Critic. C1K foi consumido e as duas reviews ficaram indisponíveis; C1L aguarda decisão própria para testes locais limitados. S2/S3/S4 e M05 permanecem bloqueadas até S1 aceita. M05 Discovery foi aprovada com opção A e par legado `published-agent`/`kernel`; L09 depende da composição pública. G21-5/G21-6 fechados e produção `NO_GO`.

As seções abaixo preservam o histórico dos programas anteriores; seus snapshots não são status corrente da carteira de 50 melhorias.

## Programa `AUD21-COMPREHENSIVE-REMEDIATION`

Backlog corrente proposto em
[`0337_comprehensive_remediation_backlog.md`](0337_comprehensive_remediation_backlog.md),
derivado da
[auditoria `0566`](../04_audit/0566_comprehensive_repository_audit_2026-09-21.md).
As 20 tasks `REM21` cobrem os 26 achados: `REM21-004` e `REM21-006` estão
`VERIFIED_LOCAL / FINAL_CERT_DEFERRED` e `REM21-005` está
`SPEC_READY / BUILD_LOCAL_AUTHORIZED`; as
demais tasks internas seguem a ordem e o escopo local/sintético/
descartável, `REM21-019` depende de fechamento e freeze, e `REM21-009/020`
permanecem `BLOCKED_BY_G21-5`. O backlog AUD20 continua histórico e suas
evidências não são reescritas. Estado global: `IN_PROGRESS / REM21-005`,
produção `NO_GO`.

## Programa `AUD-20260920-REAUDIT`

Backlog vigente proposto em
[`0333_audit20_backlog.md`](0333_audit20_backlog.md), derivado da
[auditoria `0565`](../04_audit/0565_code_reaudit_2026-09-20.md). Há 20 tasks
`AUD20-001`–`AUD20-020`: `AUD20-001`–`AUD20-006` estão verificadas no escopo
local, `AUD20-007` é a próxima task e `AUD20-008`–`018` foram autorizadas por
`G20-1` para BUILD sequencial; `AUD20-019/020` continuam `BLOCKED_BY_G20-5`.
Estado global: `READY_FOR_NEXT_STEP / G20-1_AUTHORIZED`, produção `NO_GO`.

## Programa `AUD-20260919-REMEDIATION`

Backlog proposto em
[0330_audit_20260919_backlog.md](0330_audit_20260919_backlog.md), derivado da
[auditoria 0564](../04_audit/0564_full_construction_audit_2026-09-19.md).
As 16 tasks (`AUD19-001` a `AUD19-016`) estão encerradas no escopo controlado;
o resultado histórico foi `CONDITIONAL_GO / AAA_CONTROLLED`. A nova auditoria
não apaga esse histórico, mas o supersede como decisão corrente sob a barra
QAUD20. Nenhuma task deste índice autoriza código, dado real, integração
externa, efeito sensível ou produção.

## Complemento pós-auditoria de 13/09/2026

Consultar [plano para produção](../PLANO_EXECUTIVO_PRODUCAO.md), [roadmap](../ROADMAP_PRODUCAO.md) e [backlog consolidado](../BACKLOG_PRODUCAO.md). Os 42 IDs AAA mantêm seus contratos/status; 14 IDs PROD acrescentam correções e pré-requisitos de saída. Não concluir pela evidência histórica de outro candidato. Este índice não concede gate de BUILD ou produção.

## Programa AAA — 2026-09-12

Backlog da auditoria `AUD-20260912-001`: [0326_aaa_backlog.md](0326_aaa_backlog.md), derivado de [tracking/aaa_program_backlog.json](tracking/aaa_program_backlog.json). O JSON é a fonte de status/dependências das 42 tasks propostas; cobre 20 dimensões e 15 achados, sem substituir silenciosamente o backlog REM/Phase 10 nem conceder autorização de BUILD.

## Planejamento de remediação pós-auditoria — 2026-09-05

Para evolução proposta a partir da auditoria 0539, consultar [0313_backlog_pos_auditoria.md](0313_backlog_pos_auditoria.md) e [plano executivo](0311_plano_executivo_pos_auditoria.md). Os itens abaixo preservam o planejamento original; não representam automaticamente pendências atuais nem aprovação das tasks REM.

## P0 — Critico

### P0-01 — Setup monorepo

- Descricao: criar estrutura `apps` e `packages`.
- Modulo: repository.
- Dependencia: nenhuma.
- Phase sugerida: Phase 0.
- Risco: baixo.
- Impacto: alto.

### P0-02 — Shared contracts

- Descricao: criar tipos, schemas, envelope, erros e ids.
- Modulo: `packages/shared`.
- Dependencia: setup.
- Phase sugerida: Phase 0.
- Risco: medio.
- Impacto: alto.

### P0-03 — Conversation/session core

- Descricao: persistir conversas, mensagens e sessoes.
- Modulo: `packages/agent-core`.
- Dependencia: shared.
- Phase sugerida: Phase 1.
- Risco: medio.
- Impacto: alto.

### P0-04 — Audit logger

- Descricao: registrar agent runs, tool calls, safety e integration events.
- Modulo: `packages/agent-core`.
- Dependencia: dominio.
- Phase sugerida: Phase 1.
- Risco: alto.
- Impacto: alto.

### P0-05 — Policy engine

- Descricao: bloquear diagnostico, prescricao e acoes sensiveis.
- Modulo: `packages/policy`.
- Dependencia: shared.
- Phase sugerida: Phase 2.
- Risco: alto.
- Impacto: alto.

### P0-06 — Quality gates automatizaveis

- Descricao: criar scripts de test, typecheck, lint, coverage e CI local.
- Modulo: repository.
- Dependencia: setup monorepo.
- Phase sugerida: Phase 0.
- Risco: alto.
- Impacto: alto.

### P0-07 — Security/config baseline

- Descricao: validar env, impedir secrets no repositorio e falhar fechado quando configuracao critica estiver ausente.
- Modulo: `packages/shared`.
- Dependencia: shared contracts.
- Phase sugerida: Phase 0.
- Risco: alto.
- Impacto: alto.

## P1 — Alta prioridade

### P1-01 — Tool registry

- Descricao: registrar e executar tools por contrato.
- Modulo: `packages/tools`.
- Dependencia: shared, policy.
- Phase sugerida: Phase 2.
- Risco: medio.
- Impacto: alto.

### P1-02 — Workflows iniciais

- Descricao: implementar identificacao, triagem, agendamento draft, handoff e duvida institucional.
- Modulo: `packages/workflows`.
- Dependencia: agent-core, tools, policy.
- Phase sugerida: Phase 2.
- Risco: alto.
- Impacto: alto.

### P1-03 — Approval queue

- Descricao: criar request, resolver decisao e auditar.
- Modulo: `packages/policy`, `apps/api`.
- Dependencia: policy, audit.
- Phase sugerida: Phase 2-3.
- Risco: alto.
- Impacto: alto.

### P1-04 — Panel minimo

- Descricao: conversas, timeline, approvals e tasks.
- Modulo: `apps/web`.
- Dependencia: API.
- Phase sugerida: Phase 5.
- Risco: medio.
- Impacto: alto.

## P2 — Medio

### P2-01 — Adapter WhatsApp

- Descricao: receber e enviar mensagens por adapter substituivel.
- Modulo: `packages/adapters`.
- Dependencia: API, audit.
- Phase sugerida: Phase 4.
- Risco: medio.
- Impacto: medio.

### P2-02 — RAG institucional inicial

- Descricao: responder duvidas autorizadas com fonte.
- Modulo: `packages/rag`.
- Dependencia: base institucional validada.
- Phase sugerida: Phase 4-6.
- Risco: medio.
- Impacto: medio.

### P2-03 — Observabilidade

- Descricao: logs estruturados, metricas e correlation id.
- Modulo: todos.
- Dependencia: runtime.
- Phase sugerida: Phase 6.
- Risco: medio.
- Impacto: alto.

## P3 — Baixo

### P3-01 — Billing Agent

- Descricao: agente financeiro futuro.
- Modulo: futuro.
- Dependencia: regras financeiras.
- Phase sugerida: pos-MVP.
- Risco: alto.
- Impacto: medio.

### P3-02 — Quality Supervisor Agent

- Descricao: supervisor de qualidade dos atendimentos.
- Modulo: futuro.
- Dependencia: auditoria robusta.
- Phase sugerida: pos-MVP.
- Risco: medio.
- Impacto: medio.
