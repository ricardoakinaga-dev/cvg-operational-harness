# Análise de orquestração

## Estado

**Orchestrator explícito: ABSENT. Orquestração implícita: CONFIRMED, determinística e distribuída.**

`WorkflowCoordinatorPort.planStep()` define uma porta e `resolveWorkflowCoordinator()` escolhe `governed-kernel` ou uma frontier injetada (`packages/agent-runtime/src/composition.ts:31-123`). Não há implementação concreta da porta; o default retorna `coordinator: null`, LangGraph não é dependência e o handler do kernel não chama `planStep`.

Hoje “qual é o próximo passo?” é decidido por vários pontos:

- intent/action lexical: `packages/platform/src/test-lab.ts:236-264`, `:584-623`;
- policy/handoff/output: `:254-317`, `:353-434`;
- tool planning via bindings: `packages/platform/src/plugin-gateway.ts :: PluginRegistry.listPlannedTools()`;
- workflows Secretary em if/else: `packages/workflows/src/**`;
- dispatch de eventos: `apps/worker/src/jobs/process-outbox-event.ts`;
- kernel recebe capability/action já escolhidas no envelope: `apps/worker/src/kernel-composition.ts:133-187`.

## Tipo atual

Predominantemente `hard-coded workflow + if/else + policy`, com pequenas máquinas de estado para takeover, approval, publicação e outbox. Não é LLM-driven nem híbrido cognitivo/governado, pois falta a camada cognitiva que propõe próximos passos e recebe observações.

## Risco de extração

Extrair apenas a porta daria aparência de Orchestrator sem comportamento. O boundary útil inicial é o kernel de governança; a orquestração futura deve ser nova implementação atrás da porta, nunca embutida no domínio Secretary ou autorizada a executar effects diretamente.
