# 0300 — Build Engineer Master

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
