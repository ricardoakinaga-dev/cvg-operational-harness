# 0301 — Roadmap

> Ciclo corrente AUD51: [0346 roadmap](0346_aud29_roadmap.md) → [0347 backlog](0347_aud29_backlog.md) → [0348 próxima etapa](0348_next_stage_c1_decision.md) → [pedido C1L](../04_audit/evidence/AUD-20260924/M07-S1-C1L/approval-request.md) → [resultado C1J](../04_audit/evidence/AUD-20260924/M07-S1-C1J/final-gate-result.md). C1L aguarda aprovação pelo SHA-256 `0a6dd3efa5bc3a45b8e42062680b338e58e3b4e45a924dd177d6a12b77601f6c` para reteste local limitado. C1K ficou `STOPPED_UNAVAILABLE`; M07-S1 e M05 continuam bloqueados.

> Histórico C1/C1E: o fixture C1 foi corrigido, o scanner rejeitou a pasta de saída, e C1E depois executou sua matriz. Os resultados estão em [C1](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1/final-gate-result.md) e [C1E](../04_audit/evidence/AUD-20260923/M07-S1-R1-C1E/final-gate-result.md); ambos são históricos.

> Histórico anterior à reauditoria R1: [0569](../04_audit/0569_m07_delivery_and_repository_reaudit_2026-09-23.md) → [0343 roadmap corretivo](0343_reaudit_m07_roadmap.md) → [0344 backlog delta](0344_reaudit_m07_backlog.md) → [0345/A24-04 histórico](0345_next_stage_m07_correction.md). O ciclo corrente está no topo; a carteira de 50 IDs em 0340 permanece base consultiva.

## Roadmap corrente — carteira de 50 melhorias — 23/09/2026

O [roadmap 0340](0340_50_improvements_roadmap.md) define P0–P7 e S0–S13 para os 50 IDs do [backlog 0341](0341_50_improvements_backlog.md), sob o [plano executivo 0339](0339_50_improvements_executive_plan.md). P0-S0 / M01 foi concluída documentalmente. M07 Discovery, PRD e SPEC estão aprovados. C1J é o candidate S1 mais recente e permanece `FAIL / OPEN` porque seus dois reviews independentes não foram criados; o pedido C1L aguarda aprovação e ainda não executou código ou checks. S2/S3/S4 e M05 seguem bloqueadas até S1 aceita. M05 Discovery foi aprovada com opção A (`/v1/executions`, par `published-agent`/`kernel`), mas não está pronta para handoff. L09 depende da composição pública. P6/P7 dependem de G21-5 e de decisões humanas separadas; produção `NO_GO`.

As seções abaixo são registros de roteiros anteriores e não substituem o estado mestre atual.

## Roadmap corrente proposto — 2026-09-21

O roteiro atual está em
[`0336_comprehensive_remediation_roadmap.md`](0336_comprehensive_remediation_roadmap.md),
com plano em
[`0335_comprehensive_remediation_executive_plan.md`](0335_comprehensive_remediation_executive_plan.md),
backlog em
[`0337_comprehensive_remediation_backlog.md`](0337_comprehensive_remediation_backlog.md)
e prompt executor em
[`0338_codex_full_remediation_prompt.md`](0338_codex_full_remediation_prompt.md).
W0 documental está concluída; W2 está `IN_PROGRESS` em `REM21-005`, com
`SPEC_READY / BUILD_LOCAL_AUTHORIZED`, após verificação local de `REM21-006`
e `REM21-004`; W1/W3–W6 seguem sequenciais e
limitadas ao escopo local/sintético/descartável; W7 permanece
`BLOCKED_BY_G21-5`. Produção continua `NO_GO`.

## Roadmap vigente proposto — 2026-09-20

O roadmap corrente é
[`0332_audit20_roadmap.md`](0332_audit20_roadmap.md), com plano executivo em
[`0331_audit20_executive_plan.md`](0331_audit20_executive_plan.md) e backlog em
[`0333_audit20_backlog.md`](0333_audit20_backlog.md). Somente W0 documental foi
concluída; `AUD20-001`–`AUD20-006` têm verificação local, `AUD20-007` é a
próxima task de W2, e W3–W5 aguardam os gates técnicos.
W6, integrações externas e piloto exigem `G20-5` separado. Este índice não
concede produção.

## Roadmap vigente de remediação — 2026-09-19

O encadeamento atual proposto está em
[0329_audit_20260919_roadmap.md](0329_audit_20260919_roadmap.md), com contrato
executivo em
[0328_audit_20260919_executive_plan.md](0328_audit_20260919_executive_plan.md).
As ondas W0–W4 foram encerradas em `AUD19-016` com resultado histórico
`CONDITIONAL_GO / AAA_CONTROLLED`. A auditoria `0565` é a decisão corrente
para a nova barra e retornou `REJECT`. Este índice não concede produção.

## Complemento pós-auditoria de 13/09/2026

Consultar [plano para produção](../PLANO_EXECUTIVO_PRODUCAO.md), [roadmap](../ROADMAP_PRODUCAO.md) e [backlog consolidado](../BACKLOG_PRODUCAO.md). Os 42 IDs AAA mantêm seus contratos/status; 14 IDs PROD acrescentam correções e pré-requisitos de saída. Não concluir pela evidência histórica de outro candidato. Este índice não concede gate de BUILD ou produção.

## Evolução AAA pós-auditoria — 2026-09-12

Para as seis fases propostas de remediação e qualificação multiagente, consultar [0325_aaa_roadmap.md](0325_aaa_roadmap.md) e [0324_aaa_executive_plan.md](0324_aaa_executive_plan.md). O roteiro original abaixo permanece histórico; a nova execução depende de contratos, gates e autoridade próprios.

## Planejamento de remediação pós-auditoria — 2026-09-05

Para evolução proposta a partir da auditoria 0539, consultar [0312_roadmap_pos_auditoria.md](0312_roadmap_pos_auditoria.md) e [plano executivo](0311_plano_executivo_pos_auditoria.md). Os itens abaixo preservam o planejamento original; não representam automaticamente pendências atuais nem aprovação das tasks REM.

Este roadmap e somente a visao macro. A execucao deterministica esta em `0306_phase_sprint_plan.json` e `0308_task_catalog.json`.

## Phase 0 — Fundacao

- Objetivo: estruturar repositorio, shared, contratos base e configuracao.
- Entregaveis: `apps`, `packages`, tipos compartilhados, schemas, erros, envelope, setup de testes, lint, typecheck, baseline de secrets e CI local.
- Riscos: overengineering antes do fluxo minimo.
- Dependencias: SPEC condicionalmente aprovada e aprovacao humana da Phase 0.
- Criterios de sucesso: projeto instala, testa, typechecka, possui estrutura base pronta e nao habilita fluxo sensivel.

## Phase 1 — Dominio

- Objetivo: implementar dominio operacional da agente.
- Entregaveis: conversations, messages, sessions, agent_runs, tool_calls, audit base.
- Riscos: perda de rastreabilidade.
- Dependencias: Phase 0.
- Criterios de sucesso: mensagem recebida cria timeline auditavel.

## Phase 2 — Fluxos

- Objetivo: implementar workflows iniciais e policies.
- Entregaveis: identificacao tutor/pet, triagem, handoff, task, duvida institucional, approval request.
- Riscos: automacao passar do nivel permitido.
- Dependencias: dominio, policy e tools locais.
- Criterios de sucesso: workflow executa com safety e handoff.

## Phase 3 — API

- Objetivo: expor comandos e queries operacionais.
- Entregaveis: webhooks, sessions, conversations, approvals, tasks e audit endpoints.
- Riscos: API carregar regra de workflow.
- Dependencias: agent-core e contracts.
- Criterios de sucesso: API controla acesso e chama casos de uso.

## Phase 4 — Integracoes

- Objetivo: conectar adapters iniciais.
- Entregaveis: adapter de canal, mocks externos, integration events, retries.
- Riscos: dependencia externa bloquear MVP.
- Dependencias: API, worker e audit.
- Criterios de sucesso: adapter substituivel e falhas registradas.

## Phase 5 — Frontend

- Objetivo: painel minimo operacional.
- Entregaveis: conversas, timeline, approvals, tasks e auditoria de sessao.
- Riscos: UI permitir acao sensivel indevida.
- Dependencias: API de painel e permissoes.
- Criterios de sucesso: operador aprova, rejeita, assume e investiga.

## Phase 6 — Hardening

- Objetivo: qualidade, observabilidade, seguranca e testes de falha.
- Entregaveis: logs, metricas, tracing, retries, idempotencia e auditoria de seguranca.
- Riscos: gaps estruturais descobertos tarde.
- Dependencias: fluxo MVP completo.
- Criterios de sucesso: auditoria de runtime controlado sem gaps criticos abertos.

## Phase 7 — Rollout

- Objetivo: operacao controlada assistida por humanos.
- Entregaveis: piloto, relatorio, ajustes, remediation plan.
- Riscos: regras humanas incompletas.
- Dependencias: hardening e aprovacao de negocio.
- Criterios de sucesso: atendimento real operando com safety, approvals e auditoria.
