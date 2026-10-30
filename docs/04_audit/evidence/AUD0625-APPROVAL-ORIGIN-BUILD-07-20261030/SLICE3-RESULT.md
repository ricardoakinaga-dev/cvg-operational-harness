# SPEC 0291 BUILD, fatia 3: o worker do kernel, `origin_mismatch` no outbox e o fechamento

Task `AUD0625-APPROVAL-ORIGIN-BUILD-07-20261030` (Claude Sonnet 5.5, sessão 07). Recibo [human-decisions-25](../USER-DECISIONS-20261028/human-decisions-25.json). Sobre a fatia 2 (`723bd9859`). Sem push. A fatia 3 não muda `kernel-composition.ts`: o worker herda a regra por montar o `GovernedTurnInput` com a `conversationId` e a `sessionId` do contexto da mensagem, e o teste prova que isso basta.

## Entregue

- **AP09, no nível do worker, contra PostgreSQL** (`apps/worker/src/__tests__/aud0625-approval-origin-worker.integration.test.ts`): API → outbox → `createPostgresKernelHandlers` → `GovernedAgentRuntime` (o caminho que o gate de produção exige). A conversa A pede a aprovação; o registro persiste com `origin` igual à conversa e à sessão da mensagem; depois de aprovada, uma mensagem de **outra conversa** com o mesmo `approvalId` termina `denied`/`origin_mismatch`, nenhuma ferramenta roda, o registro segue `APPROVED`, e a mesma aprovação executa uma vez a partir da conversa que pediu (`EXECUTED`). Mais um teste sem banco: **tripwire** que exige que todo escopo de efeito composto pelo worker do kernel seja `controlled_fake`.
- **AP10**: `origin_mismatch` entra em `outboxOutcomeReasons` (`packages/shared/src/audit-governance.ts`) e um teste prova que atravessa a sanitização do outbox como código conhecido, enquanto qualquer outro texto continua redigido. RED primeiro (falhava), depois o código.
- **AP07 (S04)**: no fork (id de sessão próprio, conversa batizada por ele) o `approvalId` do original dá `origin_mismatch`, a mesma ação pede aprovação nova e o original segue `APPROVED`. A regra compara ids; o teste usa ids de pai e de fork sem precisar do PostgreSQL de sessões.
- **AP06**: o controle do adaptador durável (`aud0625-approval-execution-binding.test.ts`, vindo na SPEC) e os oráculos AAA-09 seguem verdes; a rota de decisão e o executor operacional não foram tocados. **AP08**: `agent-runtime`, `approval-engine` e persistência verdes (ver as fatias 1 e 2).
- `SKIP-PG-AO-002` no skip-catalog (1 teste, conferido sem banco).

## Pré-requisito declarado

Nenhum efeito real entra no worker do kernel antes desta fatia estar integrada **e revista por sessão não autora**. O tripwire acima falha se algum escopo de `CONTROLLED_KERNEL_EFFECT_SCOPES` deixar de ser `controlled_fake`, e o nome do teste aponta para este pré-requisito.

## Verificação

| Gate | Resultado |
| --- | --- |
| AP09 em PostgreSQL 16.15 | verde (1 de 1, mais o tripwire) |
| RED antes | AP10 falhava; AP09 e AP07 nasceram sobre o código das fatias 1 e 2 e foram provados por mutação |
| mutação (`mutate-s3.py`, `mutations-s3.json`) | **6/6 mortos**: regra desligada no runtime, pedido que não grava a origem, `origin_mismatch` redigido no outbox, worker que perde a sessão da mensagem, worker que usa uma conversa constante, regra de execução durável cruzada desligada |
| typecheck, eslint, prettier | 0 / limpos |

## Total da SPEC 0291

Mutantes: 13 (fatia 1) + 10 (fatia 2) + 6 (fatia 3) = 29/29 mortos. Desvios para o DF registrar: I2-c refinado e métrica por tenant (fatia 1); nenhum novo aqui.

## Para a revisão não autora

Pontos de ataque sugeridos: (1) o refinamento do I2-c e a consequência para registros legados já executados; (2) o gatilho de imutabilidade e o CHECK da 0035 (inclui o papel de runtime mínimo da SPEC 0249); (3) o fio da `conversationId` no worker (vem do contexto da mensagem no banco); (4) a ordem do I2 antes do ramo de replay; (5) os efeitos nas listas de migração e no drill de roll-forward.
