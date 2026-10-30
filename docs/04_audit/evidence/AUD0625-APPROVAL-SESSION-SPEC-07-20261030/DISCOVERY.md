# DISCOVERY — aprovação não amarrada à sessão (achado 3 do PAR-S04)

Task `AUD0625-APPROVAL-SESSION-SPEC-07-20261030` (Claude Sonnet 5.5, sessão 07), 30/10/2026, sobre `claude/aud0625-par-s04-07` @ `12aebda8c`. Só leitura de código e testes de evidência; nenhum código de produção alterado. Pedido do DF após a aprovação do BUILD do PAR-S04. Origem do achado: [MAP-NOTES do S04](../AUD0625-PAR-S04-SPEC-07-20261029/MAP-NOTES.md) e [SLICE3-RESULT](../AUD0625-PAR-S04-BUILD-07-20261029/SLICE3-RESULT.md).

## Pergunta

O achado dizia: "uma aprovação `APPROVED`, de uso único, não consumida e no prazo vale para a mesma ação e payload sob outro `sessionId` do mesmo tenant". Isso é verdade? Em que caminho? O fork ou a retomada do S04 agravam?

## Resposta curta

**Verdadeiro no runtime governado de biblioteca (`GovernedAgentRuntime`), falso no caminho durável de produção (API + worker + kernel), e o fork/resume do S04 não agravam em nenhum dos dois.** O escopo é mais estreito do que o achado sugeria.

## Evidência no código

| Fato | Onde | Consequência |
| --- | --- | --- |
| `ApprovalRecord` e `ApprovalRequestSchema` **não têm** campo de sessão nem de conversa; `engine.ts` não contém a palavra `session`. | `packages/approval-engine/src/{engine,contracts,store}.ts` | Nenhuma validação do motor pode comparar origem. |
| `request()` sempre cria um registro novo; não deduplica. | `engine.ts:~148-225` | O reuso nasce em quem **apresenta** um `approvalId` existente, não em quem pede. |
| `#validateBinding` (reserva pelo motor) compara ação, recurso, payload/hash, `proposalHash`, agente, versão, política e capacidade. | `engine.ts:1033-1120` | Nada de origem. |
| `GovernedAgentRuntime.#runExecutionTurn`, com `input.approvalId`, confere tenant, política, ação, recurso, agente/versão/capacidade/classificação, `proposalHash`/payload. **Nunca** compara `input.conversationId`/`input.sessionId` com a origem do pedido, nem `input.operatorId` com `record.operatorId` (este só alimenta o recálculo do hash). | `agent-runtime/src/runtime.ts:1087-1180` | Uma aprovação concedida executa a partir de qualquer conversa e de qualquer operador do tenant que apresente o `approvalId` com a mesma proposta. |
| No caminho durável (kernel), `DurableApprovalEngineAdapter` liga a aprovação a `(tenant, operationKey, executionRef)`; outro `executionRef` recebe `REJECTED`. | `persistence/src/operational-approval-adapter.ts:150-175`, `beginExecution` :185-195 | O fork cria execução nova, logo `operationKey` e `executionRef` novos: pedido novo. |
| Em produção a decisão passa por `POST /v1/executions/:executionId/approvals/:approvalId/decision`, que exige `execution.approvalId === approvalId` e `approval.executionRef === execution.id` (e agente e `correlationId`). O worker só executa com o `approvalId` do envelope da execução. | `apps/api/src/server.ts:1434-1560`, `apps/worker/src/kernel-composition.ts:735` | Em produção o `approvalId` não é escolhido por quem chama uma sessão. |
| Nenhum evento de sessão carrega `approvalId` (`turn/end` só leva `stopReason`). | `contracts/src/session-event-schemas.v1.json` | O fork e a retomada não têm como aprender o id; só por canal externo. |

## Testes de evidência (rodam no runtime e no motor reais)

`packages/agent-runtime/src/__tests__/aud0625-approval-session-binding-red.test.ts` (7: 4 controles verdes + 3 `it.fails`):

- o registro de aprovação não tem nenhum campo de sessão/conversa;
- aprovação pedida na conversa A **executa** quando apresentada da conversa B (`outcome: 'executed'`, ferramenta chamada 1 vez);
- aprovação pedida pelo operador `op_1` **executa** apresentada por `op_9`;
- os vínculos já fechados seguem valendo (recurso diferente → `resource_mismatch`);
- RED: a conversa B deve ser negada com `origin_mismatch` e a aprovação continuar `APPROVED`; a conversa A deve continuar executando e o registro deve carregar a origem; o operador diferente deve ser negado (condicionado à decisão D-C da SPEC).

`packages/persistence/src/__tests__/aud0625-approval-execution-binding.test.ts` (1, verde, controle): no adaptador durável uma aprovação concedida é respondida `APPROVED` à própria execução e `DENIED` ("no longer matches") a outra execução com o mesmo `operationKey`.

## O que isso muda para o S04

- O fork do S04 **não herda nem religa** nenhuma aprovação (provado na FP07 do S04) e, no caminho durável, uma execução nova pede de novo. O S04 não precisa de mudança.
- O risco real é de **superfície de biblioteca**: um host que componha `GovernedAgentRuntime` diretamente (sem a API e o worker duráveis) e aceite um `approvalId` de quem fala com a sessão. Nesse host, qualquer conversa ou operador do tenant que conheça o id executa a proposta aprovada, uma vez.
- Gravidade proposta: **P2** (defesa em profundidade, sem exploração no caminho de produção hoje). Requer o `approvalId` (não é adivinhável: `appr_` + id de domínio) e a proposta idêntica; uso único e prazo de 15 min limitam a janela.

## Lacunas e o que não foi verificado

- Não li a camada de aprovação de plataforma (`packages/platform` além do adaptador) nem a UI de aprovações.
- Não provei a autorização da decisão (quem pode aprovar), só o vínculo de execução.
- A execução `resolveApproval` do spine iterativo liga por `pendingApprovalId` (S04 MAP-NOTES); não exercitei de ponta a ponta nesta rodada.
