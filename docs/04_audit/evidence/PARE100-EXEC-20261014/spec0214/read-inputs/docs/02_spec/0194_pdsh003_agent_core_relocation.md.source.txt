# 0194 — SPEC: PDSH-003 — Reubicar `@cvg/agent-core` como comandos/perfis sobre o kernel (ou justificar)

- Task: `PARE-DSH-20261011`, cartão `PDSH-003` (plano [0375](../03_build/0375_plano_pareamento_motor_dsh.md), Onda 1).
- Trilha T2 (reubicar comandos / justificar manutenção). Autorização de BUILD registrada na [coordenação](../08_runtime/agent_coordination.md).
- Invariantes: ADR-011 (um spine de governança, `kernel/pipeline.ts`), ADR-010 (`boundary:products`), fail-closed, produção `NO_GO`, sem dado real, lockfile intacto, `products/**` intocado, `apps/**` só ajuste mínimo de import.

## Objetivo

O critério de pronto do plano 0375 (L175-176) para PDSH-003 é:

> `agent-core` sem pipeline próprio; comandos do worker passam pelo kernel.

Este documento investiga se `@cvg/agent-core` tem um "pipeline próprio" e decide o que fazer.

## Investigação (BUILD T3, 11/10/2026)

`@cvg/agent-core` é um pacote pequeno (~600 linhas de fonte, sem contar testes) de **comandos/queries de aplicação e fábricas**, não um runtime de turno. Não contém loop, orçamento, scheduler, dispatch de ferramenta nem gate de política próprios. Módulos:

| Módulo                                                       | Papel                                                                              | Dependência de runtime                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `commands/receive-inbound-message.ts`                        | aceita mensagem inbound, dedup por `externalMessageId`, publica intenção no outbox | nenhum (repositório + outbox injetados)              |
| `commands/create-internal-task.ts`                           | cria tarefa interna                                                                | nenhum (repositório injetado)                        |
| `commands/create-handoff-summary.ts`                         | monta resumo de handoff                                                            | nenhum                                               |
| `commands/execute-published-agent.ts`                        | resolve versão publicada no `ControlPlaneStore` e delega a execução                | delega a `executeConfiguredAgent` de `@cvg/platform` |
| `commands/published-worker-job.ts`                           | valida payload de job do worker                                                    | nenhum                                               |
| `commands/run-agent-turn.ts`                                 | "turno" síncrono: `evaluatePolicy` + `createDomainId`                              | nenhum (política legada, sem modelo/ferramenta/loop) |
| `commands/request-human-approval.ts` / `resolve-approval.ts` | cria/decide approval via `ApprovalService`                                         | nenhum                                               |
| `queries/get-conversation-timeline.ts`                       | lê timeline                                                                        | nenhum                                               |
| `agent-run/agent-run-service.ts`                             | fábrica de registro de run                                                         | nenhum                                               |
| `session/session-manager.ts`                                 | predicado de sessão aberta                                                         | nenhum                                               |
| `audit/audit-hook.ts`                                        | delega `repository.append`                                                         | nenhum                                               |
| `approval-reconciliation.ts`                                 | convergência idempotente de decisão pendente (AUD19-003)                           | nenhum (portas injetadas)                            |

Consumidores reais de `@cvg/agent-core`: `apps/api/src/server.ts` (`createInternalTask`, `createInboundIdempotencyKey`, `executePublishedAgent`, `getConversationTimeline`, `receiveInboundMessage`, `requestHumanApproval`) e `apps/worker` (`executePublishedAgent`, `parsePublishedAgentJob`, `getConversationTimeline`, `reconcileApprovalDecision`). Nenhum deles chama `runAgentTurn`.

O caminho de execução de turno do worker/`postgres-controlled` é:

```
processAgentTurnJob / postgres-controlled
  └─ executePublishedAgent (agent-core)          # resolve versão publicada
       └─ executeConfiguredAgent (platform/test-lab)  # pipeline CONTROLLED_RUNTIME
```

`executeConfiguredAgent` (em `packages/platform/src/test-lab.ts`) é o que hoje executa o turno publicado: normaliza, classifica intenção, avalia `evaluatePlatformPolicy`, resolve conhecimento aprovado, compõe resposta, chama `modelProvider.complete`, reescreve/politica saída e computa handoff. **Esse caminho não passa pelo `kernel/pipeline.ts` do `@cvg/harness`.**

O kernel governado do `@cvg/harness` (perfis `single_pass` / `iterativo`, e a composição `createOperationalHarnessWorker` / `kernel-composition.ts` do worker) é o spine único de orçamento/gate/ferramenta/saída. O `CONTROLLED_RUNTIME` do platform é um pipeline de turno paralelo e mais antigo, orientado a teste/dry-run e a publicação de agentes, que **não é governado pelo mesmo kernel**.

## Decisão

**`@cvg/agent-core` não tem pipeline próprio de governança — é comandos.** O cartão pede "reubicar como comandos/perfis sobre o kernel, **ou justificar manutenção por SPEC**". A reubicação completa (fazer `executePublishedAgent` passar pelo `GovernedAgentRuntime`) arrastaria `packages/platform` (fora do claim de escrita do PDSH-003, que cobre `packages/agent-core/**`) e redefiniria o `CONTROLLED_RUNTIME` — escopo de uma SPEC própria (PDSH-003b, abaixo), não de um remendo.

Portanto esta fatia **justifica a manutenção de `@cvg/agent-core` como camada de comandos**, com os seguintes motivos e amarrações:

1. `agent-core` não decide política, orçamento nem executa efeito: é uma camada de comando/query que valida, deduplica, resolve versão e delega. Não há segunda cópia do spine (o teste arquitetural `runtime-kernel-spine-architecture.test.ts` do PDSH-001 cobre `packages/harness` e `packages/agent-runtime`).
2. O único "turno" próprio (`run-agent-turn.ts`, 17 linhas) é uma fachada síncrona de `evaluatePolicy` legado usada só pelo próprio teste de `agent-core`; não é caminho de produção. Marcado como **deprecated interno** (ver abaixo) e candidato a remoção em PDSH-003b.
3. O caminho de produção do worker que passa por `agent-core` (`executePublishedAgent`) delega ao `CONTROLLED_RUNTIME` do platform, que é o pipeline publicado/test-lab — não é o kernel governado. Unificar os dois é PDSH-003b.

### Amarração (o que esta fatia entrega de concreto)

- **Decomissionar `run-agent-turn.ts` como superfície de produção.** O módulo passa a exportar `runAgentTurn` apenas como `@deprecated` (JSDoc `@deprecated use the governed kernel via @cvg/harness`) e o teste `receive-inbound-message.test.ts` deixa de tratá-lo como caminho de política real (mantém o assert de regressão do enum legado, agora rotulado). Nenhum consumidor de produção existe, então a remoção é segura.
- **Marcar `execute-published-agent.ts` como perfil delegado, não kernel.** Adiciona-se documentação no topo do módulo apontando que a execução delega ao `CONTROLLED_RUNTIME` do platform e que a unificação com o kernel governado é PDSH-003b (SPEC dedicada), preservando o contrato público (`PublishedAgentExecutionResult`).
- **SPEC 0195 (PDSH-003b) registrada no backlog 0375** como cartão futuro: migrar o `CONTROLLED_RUNTIME` (ou o `executePublishedAgent`) para o `GovernedAgentRuntime` / `kernel/pipeline.ts`, ou justificar por que o dry-run publicado permanece um perfil distinto. **Não faz parte desta fatia.**

## Critérios de pronto (do plano 0375, L175-176) — leitura desta fatia

- [x] `agent-core` sem pipeline próprio de governança (investigado; não tinha; confirmado).
- [x] Comandos do worker: os que passam por `agent-core` delegam a um pipeline externo (`CONTROLLED_RUNTIME` do platform); a unificação com o kernel é PDSH-003b (SPEC registrada).
- [x] Justificativa de manutenção registrada nesta SPEC e no backlog.

## Verificação

- `npx tsc -p tsconfig.typecheck.json --noEmit` limpo.
- `npx vitest run packages/agent-core packages/agent-runtime packages/harness tests/conformance tests/architecture` 100% PASS.
- `npx prettier --check` nos arquivos tocados.
- `npm run lint` limpo.
- `npm run docs:check-links`.

## Fora de escopo

- Migrar `CONTROLLED_RUNTIME` / `executePublishedAgent` para o kernel governado (PDSH-003b / SPEC 0195).
- Alterar `packages/platform` (fora do claim do PDSH-003).
- Alterar `apps/api` e `apps/worker` além de doc/deprecation (nenhum import quebra).
