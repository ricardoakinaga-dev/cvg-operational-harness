# Revisão independente r2 — SPEC0251 (escopo por caso em tasks e approvals)

- Alvo: `docs/02_spec/0251_case_scope_tasks_approvals.md`, revisão r2, sha256 `3b88fab87e65058f6b794459e186d379ab837714144433cdbc0caf9fd781db13`.
- Base conferida: worktree detached `24cdb463faa1010da5fd78b6d923950ac2741713`.
- Insumos: decisões do usuário (`user-decisions-20261021.json`), revisão r1 (`spec-review-r1/review.md`, `review.json`), correções (`spec-review-r1/corrections.md`), SPEC0176, SPEC0250, SPEC0107 e o código citado.
- Método: leitura e `grep`. Não rodei servidor, PostgreSQL nem testes.

## Veredito: **REVISE**

A r2 resolve o M1 e o M3 da r1 e fica fiel às decisões do usuário, sem premissa nova e sem migração. Restam dois obrigatórios, ambos de texto:

1. A regra fechada de ajuste de testes (§6) não cobre duas classes de teste que o próprio inventário inclui. Na prática, o M2 da r1 ficou só parcialmente resolvido.
2. A I7 manda escrever um `catch` que apagaria o mapeamento de erro atual da rota de runtime approval.

Nenhum dos dois pede decisão nova do usuário.

## Status dos obrigatórios da r1

| ID  | Status         | Evidência                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | **RESOLVIDO**  | A §4.2 da SPEC (linha 74) agora segue o algoritmo de `readExecutionForCaller` (`apps/api/src/case-authorization/case-routes.ts:349-372`): no escopo `assigned`, vínculo + grant primeiro; em todos os escopos, existência pelo store do snapshot; no escopo `tenant`, `executionCase` não é consultado. Com isso, Supervisor decide execução sem vínculo e funciona no esquema legado: `executionCase` → `scoped` → `requireCaseTables` (`case-authority-postgres.ts:652-658,765-774`) não é chamado no escopo tenant. S4 e S6 ficam coerentes. Um detalhe: `readExecutionForCaller` lança `DomainError('not_found')`, não `CaseAuthorityError('case_not_found')`. O corpo público é o mesmo (opcional O12).                                            |
| M2  | **PARCIAL**    | Resolvido: inventário por regra, `apps/worker/**/__tests__` no conjunto de escrita, troca das sondas trusted por rota sem escopo de caso (`GET /v1/observability/audit-evidence` não consulta caso, `server.ts:2217-2226`) e skip-catalog. Não resolvido: o ajuste (a) cita só `provisionPrincipal`/`grantCase` e deixou de fora `registerExecutionLink`, que a r1 M2 pedia de forma explícita. Isso não basta para execuções criadas direto no store. A lista fechada também não cobre o esquema legado sem 0029. Detalhes no obrigatório 1 abaixo.                                                                                                                                                                             |
| M3  | **RESOLVIDO**  | I7, §4.3 e §6 especificam: o servidor injeta o helper e o mapeador em `registerSecretaryJourneyRoutes` (único chamador: `server.ts:1678`; `legacy-composition.ts` só reexporta), o `catch` da rota de jornada usa esse mapeador (hoje `api-routes.ts:359-363`) e a S7 cita a rota.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Os opcionais aceitos da r1 (1 a 15) estão refletidos, com três ressalvas:

- O 13 virou o obrigatório 2.
- No 14, a SPEC0107 não tem seção para a runtime approval (opcional O8).
- No 8, a S3/S5/S6 tem um problema de roles (opcional O1).

## OBRIGATÓRIOS

### 1. A regra fechada de ajuste de testes (§6) não cobre duas classes do próprio inventário

A §6 (linha 118) permite só três ajustes, "sem afrouxar asserção": (a) conceder o vínculo pela fixture existente (`provisionPrincipal`, `grantCase`), mantendo a role; (b) trocar 400 por 404; (c) trocar a rota de sonda. Duas classes de teste não se resolvem com nenhum deles.

**(i) Esquema legado sem 0029.** O caso é `apps/api/src/__tests__/postgres-persistence-mode.test.ts`, que está no inventário.

- O teste cria o esquema com `runInitialPostgresMigration` (:1915). Esse esquema não tem as tabelas 0029; o próprio teste já registra isso em :1961 e espera 503 na leitura escopada em :2105.
- Depois, o Approver decide uma approval (:1999-2007) e o Operator muda o status de uma task (:2021-2029). O teste espera `approved` e `in_progress` (:2097-2104).
- Pela I5 e pela S6 da SPEC, os dois passam a receber 503: `scopedAuthorityAvailable()` é falso (`case-routes.ts:141-146`).
- O ajuste (a) é impossível nesse esquema: grant e registro exigem as tabelas 0029 (`requireCaseTables`, `case-authority-postgres.ts:473-479`; `findCaseId` chama `GET /v1/cases`, `case-authorization-fixtures.ts:57-72`).
- Só o Operator tem `task:update` (`packages/shared/src/auth.ts:4-13`). Logo, nenhuma role consegue mudar status de task no esquema legado.
- Resultado: o BUILD teria que mudar asserção ou role fora da lista permitida, e o crítico de código teria motivo para rejeitar.

**(ii) Execução criada direto no store, sem linhagem.** Casos:

- `approval-decision-atomicity.test.ts`: `store.submit` em :64; Approver em `decisionHeaders`, :107-113.
- `approval-decision-atomicity-postgres.test.ts`: mesmo `waitingFixture`.
- `homolog-correlation-postgres.test.ts`: :90-146.
- `execution-spine.test.ts`: :466-475.

Nesses testes não existe linha em `case_execution_links`, então `executionCase` devolve `null` (`case-authority.ts:663-666`). Também não existe root, e `grantCase` exige exatamente um root (`case-authorization-fixtures.ts:70,112`). Sem `caseAuthority.registerExecutionLink` (`case-authority.ts:266-271`), o ajuste (a) não concede nada. A r1 M2 pedia esse passo de forma explícita.

**Correção (texto da §6):**

- Acrescentar um quarto ajuste: "(d) esquema legado sem 0029 (cliente único com `runInitialPostgresMigration`): a mutação por Operator/Approver passa a esperar 503 `configuration_error` (I5/S6). Quando o teste precisa provar efeito, a decisão de approval passa a ser feita por Supervisor, com a mesma asserção de efeito. Nesse esquema, a mudança de status de task fica coberta só como 503."
- Completar o ajuste (a): "Para execução criada direto no store, registrar a linhagem com `app.caseAuthority.registerExecutionLink(tenant, executionId, { kind: 'independent', conversationId, sessionId }, true)` e conceder com `grantCase({ kind: 'independent_execution', resourceId: executionId, role: 'Approver' })`."

### 2. A I7 prescreve um `catch` que apaga o mapeamento atual da rota de runtime approval

- **O que a SPEC diz.** A I7 (linha 39) manda, "nas rotas desta SPEC", usar `error instanceof CaseAuthorityError ? toSafeCaseError(error) : toSafeError(error)` seguido de `statusCodeForError`. A rota `POST /v1/executions/:executionId/approvals/:approvalId/decision` é uma das oito.
- **O que o código faz hoje.** O `catch` dessa rota tem uma cadeia própria (`server.ts:1396-1401`): `ApprovalError` passa por `operationalApprovalError` (`server.ts:5112-5129`, que devolve `not_found`, `forbidden` para self-approval/not_authorized, `validation_failed` ou `conflict`); `OperationalExecutionError` passa direto.
- **Por que quebra.** Nenhuma das duas classes estende `DomainError` (`packages/approval-engine/src/engine.ts:42`, `packages/harness/src/execution-spine.ts:241-253`), e `toSafeError` transforma em `internal_error` 500 todo erro que não seja `DomainError` (`packages/shared/src/errors.ts:45-53`). Aplicada ao pé da letra, a I7 transforma 403 (self-approval), 404 e 409 dessa rota em 500.
- **Cobertura atual.** Não achei teste de rota que proteja esses mapeamentos: os testes que chamam a rota verificam 202, 403 de permissão e 404 de `DomainError`.
- **Correção.**
  - Reescrever a I7: "acrescentar o ramo `CaseAuthorityError → toSafeCaseError` à frente do mapeamento já existente em cada rota". Na runtime approval, a ordem fica `CaseAuthorityError → ApprovalError (operationalApprovalError) → OperationalExecutionError → toSafeError`.
  - Na S7, acrescentar a guarda de regressão: um `ApprovalError` nessa rota mantém o status atual (por exemplo, self-approval → 403).

## OPCIONAIS

| ID  | Ponto                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O1  | **S6 e S5: roles por rota.** "503 para Operator e Supervisor nas oito rotas" contradiz a ordem da §4.3 (permissão antes do helper) e a SPEC0176 §7 (role sem permissão dá 403). O Supervisor não tem `task:update` (PATCH, `POST /v1/tasks`, jornada) e o Operator não tem `approval:decide` (as duas decisões) (`auth.ts:4-31`). Escrever "para cada rota, com a role que tem a permissão; as outras seguem 403 antes". Na S5, trocar "por OperatorB/ApproverB" por "OperatorB nas rotas de task, ApproverB nas de approval".                                                                                                                                                           |
| O2  | **S3 e S5: modo autenticado.** As provas de criação precisam de `buildServer({ requireAuthenticatedMutations: true })`. Sem isso, em `NODE_ENV=test` com simulação, `POST /v1/tasks`, `/v1/journeys/tasks` e `/v1/approvals` ignoram a identidade (`server.ts:749-752,1690-1695,1805-1810`; `api-routes.ts:339-344`), e os negativos falham pelo motivo errado.                                                                                                                                                                                                                                                                                                                  |
| O3  | **`no-store`.** O `catch` não distingue "401/404/503 de autorização de caso" de um 401 de `requireIdentity`. Além disso, o mapeador injetado na jornada não define cabeçalho. É mais simples aplicar `cache-control: no-store` a toda resposta, de sucesso ou erro, das oito rotas.                                                                                                                                                                                                                                                                                                                                                                                       |
| O4  | **Jornada: dependências opcionais.** Os dois campos novos e opcionais de `SecretaryJourneyRouteDependencies` deixam indefinido o caso em que eles faltam, e um BUILD pode simplesmente pular a checagem (fail-open). Tornar os campos obrigatórios (há um só chamador) ou fixar: identidade presente e helper ausente → 503.                                                                                                                                                                                                                                                                                                                                                   |
| O5  | **Jornada: corpo não-objeto.** `request.body` nulo ou não-objeto (`api-routes.ts:352`) deve dar 400 `validation_failed` antes do helper. Hoje, acessar `.sessionId` lançaria `TypeError`, que vira 500.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| O6  | **S3: outro tenant para Supervisor.** A I3 promete 404 também para recurso de outro tenant quando o ator é Supervisor, mas a S3 só testa "id inexistente". Acrescentar Supervisor de A decidindo uma approval do tenant B → 404 e approval inalterada. Isso mata o mutante "`taskCase`/`approvalRequestCase` sem filtro de tenant" na memória, onde não há RLS.                                                                                                                                                                                                                                                                                                                 |
| O7  | **S7: 413/415.** Os códigos 413 e 415 nascem no error handler do Fastify, antes do handler da rota (`server.ts:500-505`, `http-request-boundary.ts:39-47`), então esse item não exercita o `catch`. Trocar por "um `DomainError` existente mantém o status" (400 `invalid_action` de transição, 409 de CAS) e ajustar a justificativa da I7.                                                                                                                                                                                                                                                                                                                                    |
| O8  | **§4.5.** A SPEC0107 não tem seção para `POST /v1/executions/:executionId/approvals/:approvalId/decision` (`0107_contratos_de_api.md:57-93`). Criar a seção ou levar a linha de erro para a SPEC dona da rota.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| O9  | **Sondas trusted vazias.** Em `operator-session.test.ts:186-196`, o teste espera 503 `configuration_error` em `GET /v1/tasks` quando falta o session store. Depois da SPEC ele passa por outro motivo (falta de `casePrincipalAuthority`) e deixa de detectar regressão do session store. Estender o ajuste (c) também às sondas que esperam 503 nessas rotas.                                                                                                                                                                                                                                                                                                                  |
| O10 | **Inventário.** Acrescentar `journeys-api-postgres.test.ts:304-318` (Operator cria task de jornada em `postgres-pool` e espera 200). A regra já o cobre; é só para a lista inicial ficar completa. Dizer também como o teste de `apps/worker` obtém a fixture: import relativo do teste da API ou uso direto de `app.caseAuthority`.                                                                                                                                                                                                                                                                                                                                         |
| O11 | **§4.1, consistência.** `RuntimePersistence.tasks.list` e `approvals.list` (`server.ts:4632,4653-4655`) continuam como listas sem escopo e sem rota. Pelo mesmo motivo de tirar `listPage`, removê-las também ou dizer por que ficam.                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| O12 | **§4.2, execução.** Dizer que o 404 pode vir de `DomainError('not_found', CASE_NOT_FOUND_MESSAGE)` ou de `CaseAuthorityError('case_not_found')`, com o mesmo corpo e o mesmo `errorCode`. Assim o BUILD pode reutilizar `readExecutionForCaller` direto (`case-routes.ts:363,369`).                                                                                                                                                                                                                                                                                                                                                                                            |
| O13 | **§9, execução independente.** Quem submete uma execução independente não recebe grant automático no root `independent_execution`. Para um Approver decidir uma runtime approval dessa execução, um Supervisor precisa atribuir o caso antes. É consequência direta da decisão do usuário; vale registrar como risco operacional.                                                                                                                                                                                                                                                                                                                                             |
| O14 | **I2 e limite de taxa.** Na runtime approval, o limite de taxa consome orçamento antes do helper (`server.ts:1170-1199`). Dizer na I2 que esse consumo não conta como "efeito".                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Respostas às perguntas do pedido

1. **Fidelidade às decisões.** Cobre exatamente o que foi decidido: as listas; a mudança de status (PATCH); a criação de task pelas duas rotas; a criação de approval; a decisão nas duas tabelas (`approved`, `rejected` e `assumed`); Supervisor/Admin no tenant; takeover, input e cancelamento sem mudança. Não acrescenta nada além (ver a seção "Premissa nova?").

2. **Correção técnica.**
   - **Âncoras.** Todas conferem com ±2 linhas: `server.ts` (1687, 1736, 1755, 1802, 1856, 1908, 1163-1417, 1204-1217, 1668-1672, 749-752), `postgres.ts:1066-1133` e `1396-1466`, `case-routes.ts:101-158,349-370`, `case-authority-postgres.ts:482-517,634-646,705-718,812-820`, `0001_tenant_isolation.sql:770-787`, `tenant-preflight.ts:124-125`, `0029:66,71`, `case-root-sql.ts:26`, `App.tsx:156,862-906,908-940,1124`, `api-routes.ts:336,343-351,359-363`, `production-target-smoke.ts:212-216`.
   - **Imutabilidade da ligação.** Confirmada: nenhum `UPDATE` em `tasks.session_id`, `approval_requests.session_id` ou `sessions.conversation_id`, e nenhum `DELETE` nessas tabelas nem em `case_roots`.
   - **Buracos em outras rotas.** Nenhuma outra rota lê ou muta tasks/approvals de caso alheio para Operator/Approver:
     - não há `GET` por id;
     - a timeline não projeta tasks nem approvals;
     - os eventos de task e approval não são vinculados à sessão, então não aparecem no leitor `/v1/audit/sessions` (`case-assignment-authorization.test.ts:1126-1170`);
     - `audit-evidence` é só para Supervisor/Admin;
     - as rotas de jornada não tocam `approval_requests`;
     - `products/**` não registra rotas;
     - não há SSE nem websocket.
   - **Idempotência.** O replay de criação não vaza entre casos: a chave inclui `session_id` (`task-repository.ts:151-157`; `postgres.ts:907`).
   - **Revogação (I4).** Coerente com a SPEC0176 §3.5 e §8.
   - **Indistinguibilidade do 404.** OK, com a diferença de uma consulta já aceita. O ponto aberto é a falta de teste de "outro tenant" para Supervisor (O6).
   - **Política trusted/legado/outage.** Correta nas oito rotas. O defeito é só de redação na S6 (O1).
   - **Paginação.** O `EXISTS` entra em COUNT e página numa instrução só.
   - **Migração.** Não precisa.
   - **Consumidores.** A web está tratada na §4.4. `rem21-014` faz mock de `/v1/tasks` e `/v1/approvals`. O smoke tem `SMOKE_PROTECTED_PATH` configurável e não roda em gate. O que não fecha é o conjunto de testes: obrigatório 1.

3. **Testabilidade.**
   - Os mutantes listados morrem.
   - Faltam: a guarda do mapeamento de `ApprovalError` (obrigatório 2), o teste de outro tenant para Supervisor (O6) e o ajuste de roles e de modo autenticado nas provas (O1, O2).

4. **Clareza.** Os pontos que deixam o BUILD escolher errado são os dois obrigatórios. O resto está nos opcionais.

## Premissa nova?

**Não.**

- **Runtime approval.** A SPEC0176 §1 lista "decidir approval" entre as permissões independentes do vínculo, junto com assumir, retomar e cancelar. O usuário manteve como exceção só takeover, input e cancelamento. Logo, a runtime approval entra em "decidir approval só no caso atribuído".
- **Troca de 400 por 404.** É consequência de "404 como se o recurso não existisse".
- **503 em trusted para Supervisor/Admin até a UP91-025.** É a política de principal da SPEC0176, que vale para todo leitor de caso ("no modelo da SPEC0176"). A sequência foi decidida pelo usuário: a UP91-025 começa depois que a SPEC0251 entrar na main. A produção está NO_GO.
- **Esquema legado sem nenhuma role capaz de mudar status de task.** Afeta só o cliente de teste.
- **Execução independente sem grant automático.** É consequência direta da decisão.
- **Os dois obrigatórios.** São correções de texto da SPEC; nenhum pede decisão de produto.
- **Migração.** Nenhuma: tabelas, índices e grants existentes bastam.
