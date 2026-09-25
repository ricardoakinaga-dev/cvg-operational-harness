# 0018 — Discovery: composição pública canônica do Harness (M05)

Data: 23/09/2026  
Task: `M05` / P1-S1  
Status: `DISCOVERY_COMPLETE / WAITING_HUMAN_APPROVAL_FOR_DISCOVERY_GATE`  
Escopo: inspeção estática do worktree; sem execução de runtime.

## Problema e resultado esperado

O M05 pede demonstrar a composição pública do Harness através de HTTP, PostgreSQL, worker e runtime, mapear seus ports e provar que um trace liga tenant/session/policy/approval/tool/journal/resposta. O repositório contém mais de uma entrada HTTP e mais de uma fila/runtime. A expressão “os dois caminhos legados” não está nomeada no backlog nem no handoff P1-S1. Antes de escrever PRD, é preciso decidir qual rota é canônica e qual par deve ter compatibilidade documentada.

Esta descoberta registra a topologia que o código atual sugere e separa evidência estática de comportamento ainda não verificado. Ela não seleciona silenciosamente uma interpretação de produto.

## Usuários e valor

- Mantenedores de API, worker, persistence e Harness: localizar a composição pública e as filas/runtime que hoje coexistem.
- Consumidores do Harness: entender ports, DTOs e limites de trace disponíveis.
- Revisores do M05: escolher a rota canônica e o par de compatibilidade antes de congelar PRD/SPEC.

## Escopo, método e limites

Foram inspecionados estaticamente `apps/api`, `apps/worker`, `packages/harness`, `packages/contracts`, `packages/persistence`, testes relevantes e documentação de arquitetura/runtime. Três leituras independentes mapearam API, worker e ports; os achados abaixo foram cruzados contra os arquivos citados. O worktree já estava fortemente alterado antes desta rodada. As conclusões valem para os bytes observados, não para um checkout limpo.

Não foram executados testes, builds, typecheck, lint, processo API/worker, banco, integração ou benchmark. Nenhum dado real, provider/canal externo, ação clínica/financeira/prontuário ou produção foi usado. Os testes citados adiante são somente fontes lidas.

## Topologias observadas

| Caminho                     | Entrada e persistência                                                                                                                                                 | Worker e runtime                                                                                                                                                                                                                             | Resposta observável                                                                                                                                                                                                     | Estado da evidência                                                  |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Execução pública do Harness | `POST /v1/executions` chama `operationalExecution.submit()`. Com PostgreSQL, `PostgresOperationalExecutionStore` grava execution, outbox e eventos na mesma transação. | `CVG_WORKER_RUNTIME=operational-harness` seleciona `OperationalExecutionWorker`, que reclama trabalho e chama o factory público `createOperationalHarness()`.                                                                                | POST retorna `202 queued`; o resultado final é persistido e consultado por `GET /v1/executions/:id`.                                                                                                                    | Código mostra o wiring; nenhum fluxo foi executado nesta descoberta. |
| Inbound durable / outbox    | `POST /v1/webhooks/channels/:channel/messages` resolve tenant e persiste conversa/mensagem/outbox `inbound.process` quando durable inbound está ligado.                | Worker PostgreSQL controlado usa `outbox_events`; por padrão chama `published-agent`, ou seleciona o handler `kernel` com `CVG_WORKER_RUNTIME=kernel`. O kernel usa composição `@cvg/agent-runtime`, separada do factory público do Harness. | Webhook confirma enqueue; o handler publica/completa no contrato inbound. O branch kernel lido retorna status/trace/approval, sem prova de persistência de mensagem de resposta equivalente ao caminho published-agent. | Caminho e diferença de composição estão no código; sem execução.     |
| Webhook inline              | Com `durableInbound=false`, a rota pode chamar o runtime `published-agent` dentro do processo API.                                                                     | Sem claim durável do worker para essa requisição. A configuração de produção exige durable inbound.                                                                                                                                          | Resposta pertence ao handler inline; não é a fila `operational_execution_outbox`.                                                                                                                                       | Branch estático lido; não é candidato automático a produção.         |

O caminho `POST /v1/executions` não passa por `apps/worker/src/kernel-composition.ts` nem pela tabela `outbox_events`. A fila operacional e a fila inbound são contratos e autoridades de processamento distintos. Portanto, o handoff “HTTP → PostgreSQL → worker → kernel” precisa definir se “kernel” significa o runtime público do `createOperationalHarness`, o worker opt-in `kernel`, ou uma composição futura entre eles.

### Sequência pública candidata, ainda sem decisão de produto

```text
POST /v1/executions
  → tenant-scoped parse/submit
  → PostgresOperationalExecutionStore
      operational_executions + operational_execution_outbox + state events
  → worker selector operational-harness
  → OperationalExecutionWorker claim/lease
  → public createOperationalHarness(ports)
  → persist execution result + buffered audit events
  → GET /v1/executions/:id
```

Fontes: `apps/api/src/server.ts:374–381, 884–945`; `packages/persistence/src/operational-execution-postgres.ts:311–429`; `apps/worker/src/main.ts:46–117`; `packages/harness/src/execution-spine.ts:1242–1463`; `packages/harness/src/createOperationalHarness.ts:28–63`.

### Inbound/outbox candidato legado

```text
POST /v1/webhooks/channels/:channel/messages
  → receiveInboundMessage / tenant-scoped conversation + outbox
  → outbox_events: inbound.process
  → postgres-controlled worker
      → default published-agent
      → opt-in kernel (`CVG_WORKER_RUNTIME=kernel`)
```

O código também tem uma opção de ingress inline versus durable/outbox. A auditoria `docs/harness-audit/CURRENT_AGENT_RUNTIME.md:5–35` chama `published-agent` e `kernel` de rollout híbrido de dois runtimes, mas a tarefa M05 não vincula explicitamente essa definição ao seu termo “dois caminhos legados”.

## Ports e contratos públicos

| Fronteira                 | Contrato observado                                                                                                                                                                | Observação                                                                                                                                                                                                                                                                             |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Factory público           | `createOperationalHarness` em `@cvg/harness`; recebe model, policy, approval, audit, telemetry, orchestrator e registry de tool/capability; capability mode exige effect journal. | A implementação suporta perfil single-pass e opcional iterative; a documentação `PUBLIC_API.md:37–42` descreve uma superfície mais estreita. Fonte: `packages/harness/src/createOperationalHarness.ts:28–63, 73–121, 193–216`.                                                         |
| Submissão/execução        | `ExecutionSubmission`, `OperationalExecutionStore`, `ExecutionView/Record`, `ExecutionEvent`, `RuntimeInput` e `RuntimeResult`.                                                   | O parser valida tenant, correlação, trace, session e conversation; remove `executionId` e `resume` fornecidos pelo cliente. Fontes: `packages/harness/src/execution-spine.ts:58–141, 474–579`; `packages/contracts/src/contracts.ts:169–213`.                                          |
| Persistência de execution | `PostgresOperationalExecutionStore` implementa o store público e grava execução, outbox, transições e resultado.                                                                  | Fila operacional distinta do inbound `outbox_events`. Fonte: `packages/persistence/src/operational-execution-postgres.ts:286–429, 719–738, 1324–1352`.                                                                                                                                 |
| Approval/journal/steps    | `PostgresApprovalAuthority`, `DurableApprovalEngineAdapter`, `PostgresOperationalEffectJournal` e `PostgresExecutionStepStore`.                                                   | São adapters duráveis; contratos e joins exatos precisam ser escolhidos no SPEC. Fontes: `packages/persistence/src/runtime-approval-store.ts:385–415`, `operational-approval-adapter.ts:21–88`, `operational-execution-postgres.ts:1355–1385`, `operational-step-postgres.ts:167–182`. |
| Worker sintético          | `createOperationalHarnessWorker` seleciona adapters PostgreSQL com `DATABASE_URL`; usa fixtures determinísticas/controladas por padrão e rejeita `NODE_ENV=production`.           | A fixture default tem policy `ALLOW`, audit/telemetry no-op e nenhuma tool, salvo configuração sintética explícita. Fonte: `apps/worker/src/operational-harness-worker.ts:198–301, 359–390`.                                                                                           |
| Worker inbound/kernel     | `DurableOutboxAdapter`, evento `inbound.process`, `published-agent` default e handler `kernel` opt-in.                                                                            | O kernel usa `createGovernedRuntimeComposition`/`@cvg/agent-runtime` e composition própria. Fontes: `apps/worker/src/postgres-controlled.ts:227–282, 284–415`; `apps/worker/src/kernel-composition.ts:49–88, 254–383, 461–531`.                                                        |

## Campos e continuidade do trace

| Campo/etapa          | Presença estática observada                                                                             | Limite não provado nesta etapa                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tenant               | Submission e RuntimeInput têm tenant; parser exige igualdade e stores são tenant-scoped.                | Não foi executada uma requisição para demonstrar enforcement em runtime.                                                                           |
| Session/conversation | RuntimeInput contém ambos; eventos inbound também carregam IDs de conversa/session.                     | Policy request, approval request, audit event e effect-journal não carregam um único `sessionId` transversal.                                      |
| Correlation/trace    | RuntimeInput, tool context e AuditEvent incluem correlation/trace; execução preserva input e resultado. | A correlation criada pelo envelope HTTP não é visivelmente ligada à correlation/trace do RuntimeInput; o join entre filas/runtime não foi provado. |
| Policy               | Runtime chama policy antes de approval/tool.                                                            | Eventos de auditoria registram resultado de policy, mas não demonstram vínculo universal com execução, versão de policy e todos os demais campos.  |
| Approval             | Resultado pode conter `approvalId`; composition PostgreSQL usa autoridade durável no fluxo operacional. | O contrato de approval não tem session/trace e nenhum teste PostgreSQL lido cobre approval + resume desse caminho.                                 |
| Tool                 | Harness recebe tool/capability registry; tool context tem tenant/agent/correlation/trace/opKey.         | Fixture default do worker não registra tool; fixture de efeito precisa ser explicitamente habilitada.                                              |
| Journal              | Wrapper reserva por tenant + operation key/proposal hash e registra estados do efeito.                  | O record não é um join por session/trace/executionId; correlação com audit e result não foi verificada.                                            |
| Resultado            | API expõe estado/result por GET; o worker persiste resultado e eventos de audit.                        | POST é acknowledgment assíncrono. O webhook durable responde enqueue, não o resultado final do kernel.                                             |

Referências de contrato e execução: `packages/contracts/src/contracts.ts:169–213, 272–313, 410–425`; `packages/harness/src/runtime.ts:568–612, 674–813, 902–910, 1131–1144`; `packages/harness/src/effect-journal.ts:285–395`; `packages/harness/src/execution-spine.ts:1282–1463`.

## Paths legados: evidência e ambiguidade

O candidato mais bem nomeado para o par de runtimes é `published-agent` (default) e `kernel` (opt-in) na fila inbound PostgreSQL: `apps/worker/src/kernel-composition.ts:49–88` e `apps/worker/src/postgres-controlled.ts:227–282`. A documentação `docs/harness-audit/CURRENT_AGENT_RUNTIME.md:5–35` chama isso de rollout híbrido. Ambos divergem do worker `operational-harness` em selector, fila, composition, approval/journal e resposta.

Há uma segunda interpretação plausível: ingress webhook inline (`durableInbound=false`) versus inbound durável via outbox. Esse é um eixo de ingress, não o par de runtime `published-agent`/`kernel`. O backlog 0341 e o pacote 0342 não decidem qual par exige paridade nem definem se paridade significa mesma saída, mesma trilha, mesmos approvals ou apenas compatibilidade operacional.

**Decisão de escopo pendente:** o reviewer humano deve nomear as duas paths do M05 e o limite de paridade. Esta descoberta recomenda `published-agent` versus `kernel` como hipótese inicial por estar nomeado no audit de runtime, sem adotá-lo como decisão.

## Evidência de testes existentes — fontes lidas, não executadas

- `apps/worker/src/__tests__/operational-harness-synthetic-effect-postgres.integration.test.ts` contém cenário sintético que monta API/store/worker PostgreSQL e verifica duplicate/replay, status, journal, isolamento de tenant, um efeito sintético e resposta final. O arquivo foi apenas lido; não foi executado.
- `apps/api/src/__tests__/execution-spine.test.ts` contém handoff API/worker em memória e cenário de approval/resume. Isso não é evidência PostgreSQL executada nesta rodada.
- `apps/worker/src/__tests__/kernel-composition-postgres.integration.test.ts` descreve caminho inbound/outbox→kernel antigo; também não foi executado.
- Os casos estáticos existentes não estabelecem, juntos, um trace persistido ligando tenant, session, policy/version, approval, tool, journal e resposta.

Uma SPEC futura deve decidir se completa esses cenários existentes ou cria uma prova composta com fixture descartável de PostgreSQL. Essa decisão e a execução dependem da aprovação do PRD/SPEC e do gate local de M05.

## Desvios e riscos para o PRD

| Achado                                                                                                        | Evidência                                                                                        | Consequência                                                                                                |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| O handoff usa “kernel”, mas o caminho público do Harness chama `createOperationalHarness`.                    | `0342` M05; factory em `createOperationalHarness.ts`; worker `operational-harness` em `main.ts`. | Definir “kernel” no PRD; não afirmar que a rota pública atual termina no `kernel-composition.ts`.           |
| Há duas filas independentes (`operational_execution_outbox` e `outbox_events`) e uma opção inline de inbound. | Store PostgreSQL e routes/workers citados acima.                                                 | Escolher uma rota canônica e congelar os pontos de compatibilidade.                                         |
| Os campos existem em contratos diferentes sem join visível em todos os passos.                                | Tabela de trace acima.                                                                           | Definir identidade de trace e campos obrigatórios; medir/provar antes de alegar rastreabilidade end-to-end. |
| O worker `operational-harness` rejeita `NODE_ENV=production`.                                                 | `apps/worker/src/operational-harness-worker.ts:198–215`.                                         | M05 só pode afirmar prova controlada local/sintética; produção segue `NO_GO`.                               |
| Teste PostgreSQL sintético existente não cobre todos os campos M05 solicitados.                               | Test source citado acima.                                                                        | Planejar lacunas após decisão de escopo; não interpretar a existência do teste como prova.                  |
| A documentação pública parece defasada da factory.                                                            | `docs/architecture/PUBLIC_API.md:37–42` versus factory `:58–121`.                                | L09 permanece depois de M05; não ampliar esta task para editar docs de API sem gate.                        |

## Verificação sintética candidata para fase futura

Depois do PRD/SPEC aprovados e do gate local de M05, a prova controlada pode usar PostgreSQL descartável e IDs sintéticos para submeter em `/v1/executions`, checar outbox/claim/lease, policy, approval pendente e decisão sintética explícita, uma execução de tool fake, journal e resultado consultado por GET. A instrumentação deve afirmar os joins entre tenant/session/correlation/trace/policy-version/approval/tool/opKey/journal/result que o PRD escolher.

O par de compatibilidade deve ser executado como fixtures separadas, se essa for a decisão humana. Casos negativos candidatos incluem tenant mismatch, idempotência conflitante, policy deny sem dispatch, approval/resume único, envelope kernel inválido, takeover e recovery após lease. Tudo local, efêmero e sintético; sem canal/provider externo, agenda real, dado real ou efeito sensível. Nada desta verificação foi executado agora.

## Gate solicitado

O pacote está pronto para revisão de Discovery, não para PRD automático. O pedido em [`evidence/AUD-20260923/M05/discovery-gate-request.md`](../04_audit/evidence/AUD-20260923/M05/discovery-gate-request.md) pede confirmar suficiência do Discovery e decidir explicitamente a rota canônica e a interpretação de “dois caminhos legados”. O PRD depende dessa decisão e da validação humana pendente de M07; SPEC e BUILD continuam gates separados. G21-5/G21-6 permanecem fechados e produção `NO_GO`.
