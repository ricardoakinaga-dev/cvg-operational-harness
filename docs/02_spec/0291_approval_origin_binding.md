# SPEC0291 — Vínculo de origem das aprovações do runtime governado

R0, 30/10/2026. Task `AUD0625-APPROVAL-SESSION-SPEC-07-20261030` (Claude Sonnet 5.5, sessão 07), achado 3 do PAR-S04 ([0287](0287_par_s04_session_fork_and_resume.md)), pedido do DF. Estado `PROPOSED_FOR_HUMAN_T3_REVIEW`. T3: muda o contrato persistido de aprovações (campo novo no registro e, no PostgreSQL, coluna nova) e a regra que decide se uma ação aprovada executa. **Sem BUILD até revisão humana explícita deste documento.** Sem ação clínica, sem dado real, sem rede; não libera produção nem release.

Evidência: [DISCOVERY](../04_audit/evidence/AUD0625-APPROVAL-SESSION-SPEC-07-20261030/DISCOVERY.md) e os testes `packages/agent-runtime/src/__tests__/aud0625-approval-session-binding-red.test.ts` e `packages/persistence/src/__tests__/aud0625-approval-execution-binding.test.ts`.

## 1. Problema (escopo medido)

1. No `GovernedAgentRuntime`, uma aprovação `APPROVED` executa a partir de **qualquer conversa/sessão** do tenant que apresente o `approvalId` com a proposta idêntica; o registro não guarda de que conversa veio o pedido (testes: executa em outra conversa e com outro operador).
2. No **caminho durável** (API + worker + kernel) isso **já está fechado** pelo vínculo `executionRef` + `operationKey`; esta SPEC não o altera e o trava com teste de controle.
3. O fork e a retomada do S04 não agravam (nada de aprovação os atravessa). A SPEC fecha a lacuna de **biblioteca** para que ela não dependa de o host usar o caminho durável.

Gravidade proposta: P2, defesa em profundidade. Não há exploração conhecida em produção.

## 2. Invariantes

I1. **Origem registrada no pedido.** O registro de aprovação do runtime governado guarda `origin: { conversationId, sessionId? }` copiados do turno que pediu. Imutável: nenhum `update` do armazenamento a altera.

I2. **Execução só na origem.** Um turno de execução com `approvalId` é negado com `origin_mismatch` quando `input.conversationId` difere de `origin.conversationId`, ou quando o registro tem `origin.sessionId` e `input.sessionId` difere. A negação ocorre **antes** de qualquer reserva: a aprovação continua `APPROVED`, não consumida, e a ferramenta não roda.

I3. **Compatibilidade explícita.** Registro sem `origin` (anterior à SPEC) executa como hoje e grava um evento de auditoria `runtime.origin_unbound`. O prazo de 15 min das aprovações limita a janela.

I4. **A proposta não muda.** `origin` fica fora do `proposalHash` (a versão do esquema da proposta, `aaa-proposal-v1`, não muda); é um vínculo de execução, não de conteúdo.

I5. **Fork e retomada continuam sem herança.** Um fork tem outro `sessionId` e, no caminho de biblioteca, outra `conversationId`; nenhuma aprovação do original lhe vale (efeito de I2), além do que a FP07 do S04 já prova.

I6. **Caminho durável intocado.** `DurableApprovalEngineAdapter`, a rota `/v1/executions/:id/approvals/:id/decision` e o worker não mudam; o teste de controle do adaptador passa a fazer parte do oráculo.

I7. **Nada concede autoridade.** `origin` é metadado de vínculo: não autoriza aprovar, executar, retomar nem delegar.

## 3. Mudança proposta

- `ApprovalRecord` e `ApprovalRequestSchema` (`packages/approval-engine`): campo opcional aditivo `origin`, validado (`conversationId` 1-200 caracteres, `sessionId` opcional).
- `GovernedAgentRuntime`: no pedido (`runTurn` sem `approvalId`) preenche `origin` de `input.conversationId`/`input.sessionId`; no turno de execução (`#runExecutionTurn`) aplica I2 logo depois dos vínculos existentes e antes da reserva.
- Armazenamentos: memória (`InMemoryApprovalStore`) e PostgreSQL (`runtime-approval-store.ts`): colunas anuláveis `origin_conversation_id` e `origin_session_id`, migração aditiva no próximo número livre à época da integração, no molde da `0017_runtime_approval_execution_binding.sql`. Sem backfill: o legado fica `NULL` (I3).
- Códigos novos: `origin_mismatch` (negação) e o evento de auditoria `runtime.origin_unbound`.

## 4. Provas

| ID   | Prova                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| AP01 | RED→verde: aprovação pedida na conversa A, apresentada da B, é `denied`/`origin_mismatch`, a ferramenta não roda e o registro segue `APPROVED`. |
| AP02 | RED→verde: a mesma aprovação executa na conversa A (e na sessão A quando registrada); o registro carrega `origin`.                              |
| AP03 | Sessão: com `origin.sessionId`, outra sessão da mesma conversa é negada; sem `sessionId` registrado, só a conversa conta.                       |
| AP04 | Legado: registro sem `origin` executa e emite `runtime.origin_unbound`.                                                                         |
| AP05 | PG: `origin` persiste, volta no `get`/`list`, é imutável por `update` e a migração é aditiva sobre linhas existentes (`NULL`).                  |
| AP06 | Controle: o vínculo `executionRef` do adaptador durável segue negando outra execução; a rota de decisão não muda (testes existentes verdes).    |
| AP07 | Integração com o S04: o turno equivalente no fork pede nova aprovação e o `approvalId` do original, apresentado no fork, é `origin_mismatch`.   |
| AP08 | Oráculos AAA-09 (`runtime-binding`, `runtime-replay-binding`, `runtime-journal`) e os testes do motor inalterados e verdes.                     |

Mutações no BUILD: pular I2, comparar só `conversationId`, comparar depois da reserva, tratar `origin` ausente como "qualquer", fazer `update` aceitar novo `origin`, incluir `origin` no `proposalHash`.

## 5. Fatiamento proposto do BUILD (após T3)

1. Esquema, motor e armazenamento em memória; `GovernedAgentRuntime` (I1-I4); AP01-AP04 e AP08.
2. PostgreSQL: migração e armazenamento; AP05.
3. Integração: AP06-AP07 e o registro do fechamento no cartão do S04.

## 6. Fora de escopo

Quem pode aprovar (autorização da decisão, autoaprovação), a UI de aprovações, o spine iterativo (`pendingApprovalId`, já ligado à execução), vínculo por operador (D-C), expiração e política de uso único, qualquer mudança no caminho durável, release.

## 7. Decisões pedidas ao humano (T3)

| ID   | Pergunta                                                                           | Recomendação                                                                                             |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| AO-A | A origem é a conversa, a sessão, ou as duas?                                       | Conversa sempre; sessão também quando o pedido a trouxe.                                                 |
| AO-B | Aprovação sem origem (anterior à SPEC): executa com auditoria ou é negada?         | Executa e audita (`runtime.origin_unbound`); a janela é de 15 min.                                       |
| AO-C | O operador que executa deve ser o que pediu?                                       | Não: pedir e executar podem ser papéis distintos; o `it.fails` do operador vira controle verde no BUILD. |
| AO-D | A coluna de origem vai ao PostgreSQL já, ou fica só a memória nesta onda?          | PostgreSQL já (fatia 2); sem ele o vínculo não sobrevive a reinício.                                     |
| AO-E | O código de negação é novo (`origin_mismatch`) ou reaproveita `proposal_mismatch`? | Novo: o operador precisa distinguir "outra conversa" de "proposta alterada".                             |

Aprovar esta SPEC não libera produção, release, ação real nem muda o caminho durável.
