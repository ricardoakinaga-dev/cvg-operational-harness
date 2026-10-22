# Revisão independente r4 — SPEC0251 (escopo por caso em tasks e approvals)

- Alvo: `docs/02_spec/0251_case_scope_tasks_approvals.md`, revisão r4, sha256 `ef409b124e505310083bffa060e11b248905973ea8b7480989f77e1eb0c2d50e` (conferido).
- Base: worktree detached `24cdb463faa1010da5fd78b6d923950ac2741713`.
- Insumos: decisões do usuário (`user-decisions-20261021.json`), revisões r1–r3 (`review.md`, `review.json`, `corrections.md`), SPEC0176, SPEC0250, SPEC0107, e o código e os testes citados.
- Método: leitura e `grep`. Não rodei servidor, PostgreSQL nem testes.

## Veredito: **APPROVE**

Nenhum obrigatório.

- A r4 resolve R3-M1 e R3-M2 e reflete R3-O1–O8.
- Continua fiel às decisões do usuário: nenhuma premissa nova, nenhuma migração.
- O desenho de autorização confere com o código: helper e ordem nas rotas, 404 indistinguível, política trusted/legado/outage, filtro antes do COUNT, mapeamento de erro e revogação.
- Varri todos os testes que chamam as oito rotas. Nenhum quebra fora dos ajustes (a)–(d).

Os opcionais abaixo são texto ou detalhe de prova. O BUILD consegue resolvê-los sem decisão nova. O R4-O1 é o que mais vale a pena corrigir antes do BUILD.

## Status dos obrigatórios da r3

| ID    | Status        | Evidência |
| ----- | ------------- | --------- |
| R3-M1 | **RESOLVIDO** | A §6, ajuste (a) (linha 118), agora manda criar o root antes do grant quando a conversa ou a sessão foi semeada direto no banco. Cita `task-approval-postgres.test.ts:118-143` e oferece `app.caseAuthority.backfillCoreRoots` ou `ensureCoreConversationRootInTransaction` na semente. Os dois caminhos existem e funcionam no teste: `backfillCoreRoots` está na porta e nas duas implementações (`case-authority.ts:284,984-1020`, `case-authority-postgres.ts:1241-1281`). `ensureCoreConversationRootInTransaction` é exportado pelo pacote (`case-root-sql.ts:26-48`, reexportado em `case-authority-postgres.ts:423-428`). A role de runtime do teste tem INSERT em `case_roots` (`task-approval-postgres.test.ts:77-81`, `tenant-schema.ts:79`). A semente usa o pool administrativo dentro de `withTenantContext`. Faltou só a dica de `provision: false` (R4-O3). |
| R3-M2 | **RESOLVIDO** | A S3 (linha 130) restringe "Supervisor no tenant B" à decisão e à criação de approval, e registra que nas rotas de task o Supervisor recebe 403 antes (`auth.ts:4-46`: `task:update` é só do Operator). Para approval a prova funciona. Sem filtro de tenant, `approvalRequestCase` deixaria passar e `decideWithAudit(…, tenantA)` responderia 400 "Approval request not found" (`approval-repository.ts:63`), não 404. Na criação, `coreSessionCase` em memória filtra pelo tenant da conversa (`case-authority.ts:588-594,651-659`). Há o teste direto do snapshot, e o mutante da linha 137 aponta para ele. Em memória, o snapshot mata o mutante. Ressalva sobre o PostgreSQL no R4-O5. |

## Opcionais R3-O1–O8

| Opcional | Onde está na r4             | Ressalva |
| -------- | --------------------------- | -------- |
| R3-O1    | S5 (linha 132)              | — |
| R3-O2    | S6 (linha 133)              | A regra "migrações até 0028" vale para a S6 inteira, e isso cria uma linha que não se cumpre à letra na criação de approval pelo Supervisor (R4-O1). |
| R3-O3    | S4 (linha 131)              | S5 e S6 ainda dizem "200" para a decisão de runtime approval, que responde 202 em `APPROVED` (R4-O2). |
| R3-O4    | §6, conjunto do legado (linha 117) | — |
| R3-O5    | §4.1 (linha 55)             | Decidido que `postgres.ts` não muda. Não entrou a prova de paridade do DTO contra o `listPage` atual (R4-O7). |
| R3-O6    | §8 (linha 144)              | — |
| R3-O7    | §6, ajuste (a) (linha 118)  | — |
| R3-O8    | S7 (linha 134)              | — |

Nenhum opcional introduziu erro de autorização. A ressalva do R3-O2 é de prova, não de contrato.

## Conferência da r4 inteira

### Fidelidade às decisões

A SPEC cobre exatamente o que o usuário decidiu:

- listas por caso;
- criar task pelas duas rotas;
- PATCH de status;
- criar approval;
- decidir approval nas duas tabelas;
- Supervisor e Admin no tenant;
- takeover, input e cancelamento sem mudança (§1, linhas 11-17).

O grant continua `read_case` e funciona só como pré-condição. A r4 só mexe em regras de prova e de ajuste de teste.

### Fatos e âncoras

Todos conferem com ±2 linhas:

- `server.ts`:
  - `749-752`, `1091-1094`, `1163-1417`, `1170-1199`, `1204-1217`, `1378`, `1396-1401`;
  - `1668-1672`, `1678`, `1687`, `1736`, `1755`, `1802`, `1856`, `1908`.
- `case-routes.ts:101-158,349-372`; os `notFound()` estão em `363,369`.
- `case-authority.ts:214`.
- `case-authority-postgres.ts:175-189,482-517,634-646,705-718,812-820`.
- `postgres.ts:1066-1133,1396-1466,1584-1630`.
- `api-routes.ts:336-364`.
- `App.tsx:156,862-940,1124`.
- `0029:66`.

`CreateInternalTaskSchema.sessionId` é `min(1).max(160)` (`application.ts:57`). A validação da jornada espelha corretamente.

### Buracos de autorização

Nenhum. Fora das oito rotas, nenhuma rota lê ou muta `tasks` ou `approval_requests` para Operator/Approver:

- não há `GET` por id;
- `tasks.findById` e `approvals.findById` não são usados por rota;
- as rotas da jornada não leem tasks (`api-routes.ts:50-336`).

A permissão de role continua antes do helper. Por isso nenhuma role ganha mutação por ter grant.

### Revogação (I4)

Coerente com o código. O snapshot lê principal e grant em `READ ONLY REPEATABLE READ` com tenant local (`case-authority-postgres.ts:494-512`). A escrita vem depois. A janela já está aceita e registrada.

### 404 indistinguível

Os quatro casos saem do mesmo helper:

- ausente;
- outro tenant;
- sem root;
- sem grant.

Todos saem com o mesmo `CaseAuthorityError('case_not_found')` ou `notFound()`. Os dois viram `not_found` "Resource not found":

- pelo `toSafeCaseError` (`case-routes.ts:203-208`);
- ou pelo `toSafeError` + `statusCodeForError` (`errors.ts:45-48`, `server.ts:4485-4497`).

O evento de log é o mesmo por rota. Na runtime approval, o 404 do helper vem antes do "Execution/Approval not found" da rota (`server.ts:1218-1239`).

### Política trusted/legado/outage

Correta em três pontos:

- `resolveCaseReadScope` dá 503 em trusted sem `authorityVersion`, 401 para principal não corrente e 503 sem as tabelas 0029 para Operator/Approver (`case-routes.ts:101-148`);
- `readSnapshot` converte falha não tipada em `case_authority_unavailable`, que vira 503, e preserva `DomainError` (`case-authority-postgres.ts:175-189,634-646`);
- o ramo novo da I7 vem antes da cadeia atual da runtime approval (`server.ts:1396-1401`).

### Paginação antes do COUNT

O `EXISTS` entra no `WHERE` do COUNT e da página, numa instrução só (§4.1), no molde de `listTaskPage` (`postgres.ts:1103-1124`). O predicado é o mesmo de `listConversations` (`case-authority-postgres.ts:812-820`).

### Migração

Não precisa. `case_roots` é único por `(tenant_id, core_conversation_id)` (`0029:65-66`). `case_assignments` tem PK `(tenant_id, case_id, operator_id)` e índice por operador (`0029:90,103-104`).

### Consumidores

- **Web.** §4.4. `ApiRequestError` tem `status` (`client.ts:46-55`).
- **Smoke.** Não roda em gate (`grep` sem resultado em `package.json`, `scripts` e workflows).
- **`rem21-014`.** Coberto na §8.
- **Worker e `critical-flows`.** Cobertos pelo ajuste (a).
- **`products/**`.** Não chama as rotas.
- **`registerSecretaryJourneyRoutes`.** Tem um só chamador (`server.ts:1678`, via `legacy-composition.ts`).

### Testes existentes contra (a)–(d)

Varri todos os arquivos que citam as oito rotas: `apps/api` (inclusive os `*-boundary.test.ts` fora de `__tests__`), `apps/web`, `apps/worker`, `tests/` e `legacy/`.

**Nenhum quebra sem ajuste permitido:**

- **Boundary com Supervisor ou sem identidade.** Não mudam:
  - `approval-decision-note-field-boundary`;
  - `approval-request-field-boundary`;
  - `internal-task-field-boundary`;
  - `http-request-boundary`;
  - `approval-actions`;
  - `audit-evidence`.
- **`case-assignment-authorization`.** O Operator continua recebendo 403 na runtime approval (`:1110-1118`).
- **`production-bootstrap-postgres-own`.** Continua 503.
- **Leituras de lista.** Todas usam Supervisor:
  - `task-approval-pagination:78-83`;
  - `tenant-inbound-isolation:7-12`;
  - `postgres-persistence-mode:2225-2258`;
  - `task-approval-postgres:340-345`.
- **Leitura em simulação.** Só exige 200 (`identity-trusted-resolver:194-205`): Operator em simulação recebe 200 com lista vazia.
- **`execution-spine`.**
  - O Approver só lê `data.execution.state`, que existe tanto no ack quanto no DTO completo (`:466-480`).
  - O `crossTenant` já espera 404 (`:438-449`).
  - O ajuste (a) com `registerExecutionLink` cobre a execução criada direto no store (`:513-575`).

### Testabilidade

S1–S8 são cumpríveis. Os mutantes listados morrem, com duas ressalvas de redação:

- R4-O1: o "legado" da S6 na criação de approval;
- R4-O5: o mutante de tenant só no SQL do PostgreSQL.

## OBRIGATÓRIOS

Nenhum.

## OPCIONAIS

| ID    | Ponto | Evidência | Sugestão |
| ----- | ----- | --------- | -------- |
| R4-O1 | **S6, qual esquema legado por rota.** O "cliente legado com migrações até 0028 e sem 0029 → … Supervisor 200" não se cumpre, à letra, em `POST /v1/approvals`. Com o cliente `postgres`, `PostgresRuntimeRepository` roda sem `tenantIsolation` e grava `approval_requests`, `tasks` e `sessions` sem `tenant_id`. A partir de 0001, o CHECK `*_tenant_id_not_null` (NOT VALID, mas aplicado a linhas novas) rejeita, e a rota sai 500 por motivo anterior a esta SPEC. Listas, a decisão de `approval_requests` (UPDATE + audit com sonda de coluna) e a runtime approval funcionam em 0000–0028. Operator/Approver recebem 503 antes da escrita em qualquer dos dois esquemas. | `server.ts:4902`; `postgres.ts:252,924,1260`; `postgres-inbound.ts:277`; `0001_tenant_isolation.sql:699-712`; `postgres-audit.ts:120` | Dizer na S6: "criação pelo Supervisor no esquema 0000 (`runInitialPostgresMigration`); listas, decisão e runtime approval em 0000–0028 por `runPostgresMigrations({ migrations })`; sessões e approvals semeados por SQL com `tenant_id`". Como "até 0028" também admite o 0000, o BUILD pode fazer isso sem mudar o texto, mas a frase evita desvio. |
| R4-O2 | **Código da runtime approval na S5/S6.** As linhas dizem "200" para a decisão de runtime approval, mas `APPROVED` responde 202. | `server.ts:1378`; SPEC linhas 132-133 | Escrever "2xx (202 para APPROVED, 200 para REJECTED)", como a S4. |
| R4-O3 | **Detalhes do ajuste (a) em `task-approval-postgres`.** O texto proposto no R3-M1 trazia três detalhes que a r4 não incorporou. Sem eles, o BUILD descobre os problemas só ao rodar o teste. **(i)** P2 e P4 usam o mesmo `operator.aud0621.pg` no mesmo `tenant`. `grantCase` provisiona com `expectedRevision: 0`, então o segundo grant falha com `principal_conflict`. **(ii)** `seedSession` devolve só `sessionId`, e o grant é por `core_conversation`. **(iii)** `backfillCoreRoots` pega até 100 linhas por id. | `case-authorization-fixtures.ts:89-121`; `case-authority.ts:526-534`; `task-approval-postgres.test.ts:37-43,118-143,206-330`; `case-authority-postgres.ts:1241-1281` | Acrescentar ao (a): "a partir do segundo grant do mesmo operador no mesmo tenant, `provision: false`; a semente devolve também `conversationId`; preferir `ensureCoreConversationRootInTransaction` na semente". |
| R4-O4 | **Regra fechada da §6 sem a categoria de leitura.** As quatro situações cobrem mutação e sonda trusted. Não cobrem "lista lida por Operator/Approver esperando itens sem vínculo" nem "lista lida por Operator/Approver no legado esperando 200". Nenhum teste atual cai nessas classes (ver "Testes existentes" acima), mas um teste novo da UP91 cairia. | SPEC linha 118 | Acrescentar às quatro: "leitura de `GET /v1/tasks`/`GET /v1/approvals` por Operator/Approver sem vínculo ou no legado". Os ajustes (a) e (d) já servem. |
| R4-O5 | **Mutante de tenant só no SQL do PostgreSQL.** O teste direto do snapshot mata o mutante de memória. No PostgreSQL com role `NOSUPERUSER NOBYPASSRLS`, porém, o RLS esconde as linhas do tenant B, e um mutante que tire o filtro só do SQL fica equivalente. O filtro explícito importa no cliente legado e em conexão que ignora RLS. Além disso, a S3 é a linha "memória", e a metade PostgreSQL do teste de snapshot pertence à S5. | `0001_tenant_isolation.sql:859-860,878-931`; `case-authority-postgres.ts:497-500`; `task-approval-postgres.test.ts:73-96`; SPEC linhas 130, 137 | Rodar a metade PostgreSQL do teste do snapshot também numa conexão que ignora RLS ou no cliente legado, e citá-la na S5. Outra saída é registrar o mutante PG-only como equivalente sob RLS. |
| R4-O6 | **Alcance do `no-store` na I7.** "Todas as respostas das oito rotas" inclui respostas que não passam pelo handler. São elas: o 414/404 de alvo (`onRequest`), o 403 de origem do hook de segurança e o 400/413/415 do error handler do Fastify, nenhum com `no-store`. A S7 só prova as respostas do handler. | `server.ts:500-506,522-529`; SPEC linhas 39, 134 | Escrever "toda resposta produzida pelo handler (sucesso e `catch`)" ou prever um `onSend` por rota. As duas opções cabem no conjunto de escrita. |
| R4-O7 | **Paridade do DTO da lista.** O mapeamento novo em `case-authority-postgres.ts` duplica `mapTask`/`mapApproval`, que são privados. A I6 exige o mesmo DTO, mas nenhuma prova compara os dois. | `postgres.ts:1584-1630`; SPEC linhas 38, 55, 129 | Na S2, comparar os itens do escopo `tenant` com `PostgresRuntimeRepository.listTaskPage`/`listApprovalPage` na mesma base (resíduo do R3-O5). |
| R4-O8 | **Arquivo do painel de tarefas.** A §4.4 e a §6 dizem "o painel de tarefas" sem o caminho. | `apps/web/src/features/tasks/index.tsx:30-45`; `features/approvals/index.tsx:67` | Citar o arquivo e renderizar a mensagem só quando existir, como em approvals. |

## Premissa nova?

**Não.**

- **O que a r4 mexe.** Só regras de prova e de ajuste de teste: root na semente, restrição da linha do Supervisor e teste do snapshot. Nenhum efeito de produto.
- **O que segue das decisões.** Runtime approval como "decidir approval", 400→404, 503 em trusted até a UP91-025 e ausência de autoatribuição em execução independente. Já estavam na r3 e continuam consequência direta das decisões de 21/10 e da SPEC0176 ("mesma regra").
- **Migração.** Nenhuma.
- **Opcionais desta revisão.** Nenhum pede decisão do usuário.
