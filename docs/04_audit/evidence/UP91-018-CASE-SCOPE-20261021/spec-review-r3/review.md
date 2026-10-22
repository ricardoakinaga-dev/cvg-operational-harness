# Revisão independente r3 — SPEC0251 (escopo por caso em tasks e approvals)

- Alvo: `docs/02_spec/0251_case_scope_tasks_approvals.md`, revisão r3, sha256 `12099e543b4cd605bb0f69f0377349ae90b72e0ae8b664de772ac08e7d0388c5` (conferido).
- Base conferida: worktree detached `24cdb463faa1010da5fd78b6d923950ac2741713`.
- Insumos: decisões do usuário (`user-decisions-20261021.json`), revisões r1 e r2 (`review.md`, `review.json`, `corrections.md`), SPEC0176, SPEC0250, SPEC0107 e o código citado.
- Método: leitura e `grep`. Não rodei servidor, PostgreSQL nem testes.

## Veredito: **REVISE**

A r3 resolve os dois obrigatórios da r2 e reflete os opcionais O1–O14. Continua fiel às decisões do usuário, sem premissa nova e sem migração. O desenho de autorização está correto: helper, ordem nas rotas, 404 indistinguível, política trusted/legado/outage, filtro antes do COUNT e mapeamento de erro.

Restam dois obrigatórios, ambos nas regras de prova e de ajuste de testes. Cada um se corrige com uma frase. Nenhum pede decisão do usuário.

1. **R3-M1.** A regra fechada de ajuste (§6) não cobre sessões semeadas direto no banco sem root. É o caso de `task-approval-postgres`, que a própria SPEC usa como destino da prova de efeito (ajuste d).
2. **R3-M2.** A S3 pede "Supervisor numa task do tenant B → 404", o que é impossível: o Supervisor não tem `task:update` e recebe 403 antes do helper. Pelo mesmo motivo, o mutante "`taskCase` sem filtro de tenant" não morre por teste de rota.

## Status dos obrigatórios da r2

| ID    | Status        | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2-M1 | **RESOLVIDO** | As duas classes apontadas na r2 estão cobertas na §6 (linha 118). (i) Esquema legado sem 0029: o ajuste (d) troca para 503 e leva a prova de efeito ao Supervisor (decisão de approval) ou ao esquema com 0029 (status de task). Isso funciona em `postgres-persistence-mode.test.ts:1999-2029,2097-2104`: o Supervisor tem escopo `tenant`, e `coreSessionCase` e o novo `approvalRequestCase` têm ramo legado (`case-authority-postgres.ts:705-718`). (ii) Execução criada direto no store: o ajuste (a) agora registra o vínculo por `registerExecutionLink` (plano `core` ou `independent`, `case-authority-postgres.ts:1178-1197`, `392-419`) antes do `grantCase`, e diz como o teste de `apps/worker` obtém a fixture. A classe análoga para **conversa/sessão core semeada sem root** não foi levantada na r2 e continua sem regra (novo R3-M1). |
| R2-M2 | **RESOLVIDO** | A I7 (linha 39) acrescenta o ramo `CaseAuthorityError → toSafeCaseError` **à frente** do mapeamento existente, sem substituí-lo. Na runtime approval, a cadeia `ApprovalError → operationalApprovalError` / `OperationalExecutionError` continua igual (`server.ts:1396-1401`, `5112-5129`). A S7 (linha 134) ganha a guarda de regressão: 403 de self-approval (`approval-engine/src/engine.ts:249-253`), 409, e 400/409 do PATCH. O mutante "substituir a cadeia pelo mapeador genérico" está na lista (linha 137). Nas demais rotas, `DomainError` de `resolveCaseReadScope` (`case-routes.ts:109-112,124-127,142-145`) segue por `toSafeError` + `statusCodeForError` (`server.ts:4485-4497`) para 401/503. Nada sai 500.                                                                                                                                                                                                                          |

## Opcionais O1–O14 da r2

Todos estão refletidos:

| Opcional | Onde está na SPEC     |
| -------- | --------------------- |
| O1       | S5 e S6               |
| O2       | S3                    |
| O3       | I7                    |
| O4 e O5  | §4.3 e §6             |
| O6       | S3 e mutantes         |
| O7       | S7                    |
| O8       | §4.5                  |
| O9       | ajuste (c)            |
| O10      | inventário e ajuste (a) |
| O11      | §4.1                  |
| O12      | §4.2                  |
| O13      | §9                    |
| O14      | I2                    |

Ressalvas:

- **O6 introduziu um erro.** A r2 pedia "Supervisor de A decidindo uma approval do tenant B". A r3 estendeu para "numa approval **e numa task**", o que é impossível (R3-M2).
- **O2 ficou só na S3.** A S5 (PostgreSQL) também precisa de `requireAuthenticatedMutations: true` nas rotas de criação (opcional R3-O1).
- **O3.** O conjunto de escrita do legado não inclui o cabeçalho `no-store` no caminho de sucesso da jornada (opcional R3-O4).
- **O10.** `journeys-api-postgres` está no inventário, mas não quebra: as apps dele não ligam `requireAuthenticatedMutations`, então a identidade é ignorada e o helper não roda (`journeys-api-postgres.test.ts:163,304-318`). A entrada é inofensiva; o BUILD registra "sem ajuste".

## OBRIGATÓRIOS

### R3-M1. O ajuste (a) não cobre sessão core semeada sem root; `task-approval-postgres` fica sem caminho permitido

**O que a SPEC diz.** A §6 (linha 118) lista só os ajustes (a)–(d), "sem afrouxar asserção". O (a) concede o grant pela fixture (`provisionPrincipal`, `grantCase`) e só prevê criar vínculo para execução (`registerExecutionLink`). O (d) manda levar a prova de efeito do status de task "a uma asserção equivalente no esquema com 0029 (`task-approval-postgres` ou S5)".

**O que o código faz.**

- `task-approval-postgres.test.ts:118-143` (`seedSession`) insere `conversations` e `sessions` por SQL e não cria linha em `case_roots`. É o único teste da API que semeia sessão assim e faz mutação autenticada. `journeys-api-postgres` semeia igual, mas não autentica.
- Operator muda status nessas sessões em P2 (`:221-228`), P4 (`:280-298`) e P5 (`:378-384`). Approver decide approvals em P5 (`:369-376`). Os testes esperam 200.
- Depois da SPEC, `taskCase`/`approvalRequestCase` devolvem `caseId: null`, e `canReadCase` nega (`case-routes.ts:156`): 404.
- O ajuste (a) não resolve: `grantCase` → `findCaseId` exige exatamente um root (`case-authorization-fixtures.ts:57-71`, `expect(items).toHaveLength(1)`), e não há root.
- Nenhuma outra role salva esses testes. O status de task só pode ser mudado pelo Operator (`packages/shared/src/auth.ts:4-13`), e o (d) não se aplica, porque o esquema tem 0029.

**Consequência.**

- Seguindo a §6 à letra, o BUILD não consegue deixar verdes as provas da SPEC0250 (P2 de concorrência, P4 de rollback do audit, P5 de paginação/decisão).
- O destino que o próprio (d) aponta para o efeito de status de task fica quebrado.
- É a mesma classe do R2-M1(ii), só que para conversa core.

**Correção (texto da §6, ajuste a).** Acrescentar:

> "Quando a conversa/sessão foi semeada direto no banco, sem root (ex.: `seedSession` de `task-approval-postgres.test.ts`), criar antes o root pelo port existente, `app.caseAuthority.backfillCoreRoots(tenant, { afterConversationId: null, limit: 100 })` (`case-authority-postgres.ts:1241-1281`; memória em `case-authority.ts`), ou na própria semente por `ensureCoreConversationRootInTransaction` (`case-root-sql.ts:26-48`), e só então `grantCase` (com `provision: false` a partir do segundo grant do mesmo operador)."

Nos testes em memória isso não é necessário, porque a conversa nasce com root (`conversation-repository.ts:203-204`).

### R3-M2. S3 exige "Supervisor numa task do tenant B → 404", o que é impossível, e o mutante de tenant em `taskCase` não morre por rota

**O que a SPEC diz.**

- A S3 (linha 130) termina com: "Supervisor do tenant A numa approval e numa task do tenant B → 404 e recurso inalterado".
- Os mutantes (linha 137) dizem que "`taskCase`/`approvalRequestCase` sem filtro de tenant" morre na "S3, Supervisor no tenant B".

**O que o código faz.**

- Todas as rotas que chegam a `taskCase` exigem `task:update`: PATCH (`server.ts:1760`), `POST /v1/tasks` (`:1690-1691`) e jornada (`api-routes.ts:339-340`).
- Essa permissão é só do Operator (`auth.ts:4-46`). Supervisor e Admin não a têm.
- Pela ordem da §4.3 (linha 84; I3), a permissão vem antes do helper. Logo, Supervisor em PATCH de qualquer task recebe **403**, não 404.
- No escopo `assigned`, um `taskCase` sem filtro de tenant ainda nega, porque `hasActiveGrant` é filtrado pelo tenant do snapshot (`case-authority.ts:609-614,667-668`; `case-authority-postgres.ts:775-784`). O mutante é equivalente em toda prova de rota.
- Para approval a prova funciona: o Supervisor tem `approval:decide`. Sem o filtro, o `decideWithAudit(…, tenantA)` responderia 400 "Approval request not found" (`approval-repository.ts:63`), não 404, e o teste mata o mutante.

**Consequência.** O BUILD não consegue cumprir a linha da S3 nem matar o mutante listado do jeito que a SPEC descreve. Teria de desviar da SPEC sem regra para isso.

**Correção.**

- Na S3, trocar o trecho por: "Supervisor do tenant A decidindo uma approval do tenant B e criando approval numa sessão do tenant B → 404 e recurso inalterado".
- Acrescentar uma prova de snapshot, em memória e PostgreSQL: `readSnapshot(tenantA, s => s.taskCase(idDeTaskDoTenantB))` e `approvalRequestCase` → `null`.
- Na lista de mutantes, apontar o filtro de tenant de `taskCase` para essa prova de snapshot, com a justificativa: nenhuma role de escopo `tenant` tem `task:update`.

## OPCIONAIS

| ID    | Ponto |
| ----- | ----- |
| R3-O1 | **S5, modo autenticado.** A S5 roda em `postgres-pool` com `buildServer` padrão. Em `NODE_ENV=test` com simulação, as três rotas de criação ignoram a identidade (`server.ts:749-752,1690-1695,1805-1810`; `api-routes.ts:339-344`), e o negativo "OperatorB → 404" falharia pelo motivo errado. Repetir na S5 o `requireAuthenticatedMutations: true` da S3. |
| R3-O2 | **S6, qual "legado sem 0029".** `runInitialPostgresMigration` aplica só a `0000` (`postgres-migrations.ts:12-15,72-76`). Nesse esquema não há tabela de execução, então "Supervisor 200 inclusive na decisão de runtime approval" é impossível (o helper cairia em `guard` → 503). O caso de runtime approval precisa de esquema `0000`–`0028` por `runPostgresMigrations({ migrations })`, como em `case-assignment-authorization-postgres.test.ts:755-789`, com cliente `postgres` de conexão única. Dizer isso na S6. |
| R3-O3 | **Códigos e nomes na S4/S6.** A decisão `APPROVED` responde **202**, não 200 (`server.ts:1378`). Escrever "2xx (202 para APPROVED, 200 para REJECTED)". O estado da execução no código é `WAITING_APPROVAL` (`server.ts:1245`), não `APPROVAL_REQUIRED`. |
| R3-O4 | **`no-store` no sucesso da jornada.** A I7 exige `cache-control: no-store` em todas as respostas das oito rotas. O sucesso de `POST /v1/journeys/tasks` sai em `api-routes.ts:358`, mas a §6 limita o legado a validação, chamada do helper, `catch` e dependências. Permitir o `reply.header('cache-control','no-store')` no handler da jornada, ou dizer que o servidor o aplica por hook restrito às oito rotas. |
| R3-O5 | **SQL de lista no PostgreSQL.** `mapTask`/`mapApproval` são privados de `PostgresRuntimeRepository` (`postgres.ts:1584-1630`), e `postgres.ts` está fora do conjunto de escrita. Dizer se `listTasks`/`listApprovalRequests` duplicam a instrução e o mapeamento em `case-authority-postgres.ts` ou se uma mudança mínima em `postgres.ts` é permitida (predicado de visibilidade opcional em `listTaskPage`/`listApprovalPage`). Nos dois casos, a S2 compara o escopo `tenant` com o `listPage` atual (paridade). |
| R3-O6 | **`rem21-014`.** Esse E2E sobe a API real em `CVG_IDENTITY_MODE=trusted` sem autoridade de principal (`playwright.rem21-014.config.ts:44-55`). Fora do teste de roles (`rem21-014-qualification.spec.ts:351-375`), `/v1/tasks` e `/v1/approvals` não têm mock (`:151-161`, `:418-480`) e passam a 503, com os painéis em estado de falha (hoje já acontece com conversas). As asserções atuais não dependem desses painéis, mas o BUILD deve registrar esse efeito na evidência do E2E. |
| R3-O7 | **E2E `critical-flows`.** O Approver decide em `tests/e2e/critical-flows.test.ts:45-50`. O ajuste (a) vale ali pela mesma fixture, por import relativo, como no worker. Citar junto com o worker. |
| R3-O8 | **First red da S7.** Na base, nenhuma das rotas consulta a autoridade de caso, então um `CaseAuthorityError` injetado não chega a elas: o first red é "sem `no-store`/2xx", não "500". É só a coluna; a prova continua válida. |

## Respostas às perguntas do pedido

1. **Fidelidade às decisões.** Cobre exatamente o decidido:
   - listas por caso;
   - criar task pelas duas rotas;
   - PATCH de status;
   - criar approval;
   - decidir approval nas duas tabelas (`approved`, `rejected`, `assumed` e runtime);
   - Supervisor/Admin no tenant;
   - takeover, input e cancelamento sem mudança.

   O grant continua `read_case` e não concede permissão de role (§1, linha 17).

2. **Correção técnica.**
   - **Âncoras.** Conferem com ±2: `server.ts` (749-752, 1091-1094, 1163-1417, 1170-1199, 1204-1217, 1396-1401, 1668-1672, 1678, 1687, 1736, 1755, 1802, 1856, 1908, 5112-5129), `postgres.ts:1066-1133,1396-1466`, `case-routes.ts:101-158,349-372`, `case-authority-postgres.ts:482-517,634-646,705-718,812-820`, `case-authority.ts:214`, `0001_tenant_isolation.sql:770-787`, `tenant-preflight.ts:124-125`, `0029:66,71`, `case-root-sql.ts:26-48`, `api-routes.ts:336,343-351,359-363`, `App.tsx:156,862-906,908-940,1124`, `production-target-smoke.ts:212-216`.
   - **Buracos em outra rota.** Nenhum. A lista completa de rotas (`server.ts`, `case-routes.ts`, `api-routes.ts`) não tem outra leitura ou mutação de `tasks`/`approval_requests` para Operator/Approver. Os únicos escritores fora das rotas são `createInternalTask` (`agent-core`) e `createJourneyTask` (legado), ambos atrás do helper. Não há `GET` por id. `audit-evidence` é só Supervisor/Admin. As rotas `/v1/admin/capability-approvals` são de plataforma. A idempotência de criação inclui `session_id` (`0000_initial.sql:98`).
   - **Revogação (I4).** Coerente: o snapshot lê principal e grant antes da escrita. A janela maior já está aceita e registrada. Não há `DELETE`/`TRUNCATE` em `tasks`, `approval_requests`, `sessions` nem `case_roots`, e a ligação não troca.
   - **Indistinguibilidade do 404.** Ausente, outro tenant, sem root e sem grant saem todos do helper, no mesmo ponto, com `not_found` e "Resource not found" e o mesmo evento de log por rota. Na runtime approval, o 404 do helper vem antes das mensagens "Execution/Approval not found" da rota. A diferença de uma consulta já foi aceita.
   - **Política trusted/legado/outage.** Correta: 503 em trusted sem autoridade para todas as roles, 503 para Operator/Approver sem 0029 e outage → `guard` → 503 (`case-authority-postgres.ts:175-189`). A ressalva de feitura da S6 está no R3-O2.
   - **Paginação.** O `EXISTS` entra no `WHERE` do COUNT e da página numa instrução só, e `total` não conta item invisível.
   - **Migração.** Não precisa: `case_roots` tem índice único por `(tenant_id, core_conversation_id)` (`0029:65-66`).
   - **Consumidores.**
     - A web está tratada (§4.4).
     - O smoke só sinaliza NO_GO.
     - O `rem21-014` está no R3-O6.
     - Fora do `task-approval-postgres` (R3-M1), não achei teste que exija ajuste fora de (a)–(d). Nenhum teste fixa as mensagens "Task/Approval/Execution not found", e a web não testa 404.

3. **Testabilidade.**
   - S1–S8 cobrem o contrato.
   - Os mutantes listados morrem, menos o de tenant em `taskCase` (R3-M2).
   - O mutante "consultar `executionCase` no escopo tenant" morre na S6 só se o esquema legado tiver as tabelas de execução (R3-O2).
   - O mutante "trocar o mapeador por `toSafeError`" exige injetar um `CaseAuthorityError` real (outage), o que a S6/S7 já fazem.

4. **Clareza.** Os dois obrigatórios são os pontos que obrigam o BUILD a desviar do texto. O resto está nos opcionais.

## Premissa nova?

**Não.**

- **Runtime approval.** Continua dentro de "decidir approval". As exceções do usuário são fechadas (takeover, input e cancelamento), e o freio por cancelamento continua disponível (`auth.ts:15-22`, `server.ts:1091-1094`).
- **400→404.** É consequência de "404 como se o recurso não existisse".
- **503 em trusted também para Supervisor/Admin até a UP91-025.** É a política de principal da SPEC0176 ("mesma regra"). A sequência foi decidida pelo usuário, e a produção está NO_GO.
- **Execução independente sem grant automático.** Vem da SPEC0176 §5 ("Não existe autoatribuição ao criador").
- **Ajuste (d), legado sem papel para mudar status de task.** Afeta só o cliente de teste.
- **Os obrigatórios R3-M1 e R3-M2.** São regras de prova e de ajuste de teste, sem efeito de produto.
- **Migração.** Nenhuma: tabelas, índices e grants existentes bastam.
