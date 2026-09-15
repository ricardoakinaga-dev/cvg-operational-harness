# 0301 — Roadmap

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
