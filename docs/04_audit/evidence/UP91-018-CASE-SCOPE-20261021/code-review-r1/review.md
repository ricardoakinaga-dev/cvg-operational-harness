# Revisão de código independente r1 — BUILD da SPEC0251 (escopo por caso em tasks e approvals)

## Veredito: **REVISE**

Há um obrigatório: falta uma prova (M1). O código de produção está fiel à SPEC. Não achei defeito de autorização, regressão nem buraco em outra rota. O único obrigatório é de prova: a S2 (PostgreSQL) não repete o passo de revogação que a S1 exige. Por isso o predicado `a.status = 'ACTIVE'` do SQL novo de lista fica sem teste que o mate.

## Escopo e método

- **Commit revisado:** `acbec9f49`. Base: `24cdb463` (`24cdb463faa1010da5fd78b6d923950ac2741713`).
- **Como li o código:** só pelos objetos git (`git diff 24cdb463..acbec9f49`, `git show acbec9f49:<path>`). Nada lido da árvore de trabalho, salvo os arquivos não versionados citados abaixo.
- **SPEC:** `docs/02_spec/0251_case_scope_tasks_approvals.md`, lida da árvore. O sha256 `ef409b124e505310083bffa060e11b248905973ea8b7480989f77e1eb0c2d50e` confere.
- **Insumos da task:**
  - `spec-approval.json` (`buildNotesFromR4Optionals`);
  - `spec-review-r4/review.md`;
  - `adjusted-tests.json`;
  - `first-red.json`;
  - logs e `postgres/s2-postgres-lists.json`, lidos só como contexto.
- **O que não fiz:** não rodei teste, servidor, PostgreSQL nem npm. Não editei nenhum arquivo além destes dois.

## Conformidade verificada (resumo)

1. **Invariantes.**
   - **I1.**
     - Memória: o filtro vem antes do `slice` e de `matching.length` (`packages/persistence/src/case-authority.ts:753-794`).
     - PostgreSQL: COUNT e LATERAL ficam numa instrução só, com `EXISTS` no `WHERE` dos dois (`case-authority-postgres.ts:1001-1095`; o predicado está em `:170-178`).
     - O tenant sai de `conversations.tenant_id` (`:243-261`).
   - **I2.** Nas seis rotas, o helper roda antes de qualquer escrita, audit ou log de sucesso. Linhas em `apps/api/src/server.ts`:
     - runtime approval: `:1229`;
     - jornada: `:1713` (via `legacy/packages/secretary-journeys/src/api-routes.ts:391`);
     - `POST /v1/tasks`: `:1733`;
     - PATCH: `:1825`;
     - `POST /v1/approvals`: `:1882`;
     - decisão: `:1943`.
   - **I3.** Os quatro casos (ausente, outro tenant, sem root, sem grant) saem do mesmo ponto: `CaseAuthorityError('case_not_found')` ou `notFound()` (`case-routes.ts:409-437`, lançamento em `:434`). O resultado é sempre 404 `not_found` "Resource not found". Supervisor e Admin também recebem 404 para recurso ausente ou de outro tenant.
   - **I4.** O snapshot fecha antes da escrita: `await` do helper, e a transação de escrita é separada.
   - **I5.** A política é a da SPEC0176, sem mudança (`resolveCaseReadScope`). Outage vira 503 por `guard` (`case-authority-postgres.ts:325-338`).
   - **I6.** Nenhuma migration, nenhuma mudança em `auth.ts` nem em DTO. Takeover, input e cancel não foram tocados.
   - **I7.** O ramo `mapCaseMutationError` vem à frente do mapeamento existente:
     - nas rotas comuns, `server.ts:785-789`;
     - na runtime approval, preserva a cadeia `ApprovalError`/`OperationalExecutionError` (`server.ts:1412-1427`);
     - na jornada, por injeção (`api-routes.ts:399-401`).

     As respostas do handler das oito rotas levam `no-store`. Ressalva no O1.
2. **§4.1.**
   - **Semântica de `taskCase`/`approvalRequestCase`:**
     - `null` fora do tenant;
     - `caseId: null` sem root;
     - `case_integrity` se o join devolver mais de uma linha (`case-authority-postgres.ts:973-994`);
     - ramo legado com `NULL::text` (`:152-166`).
   - **Escopo `tenant`:** equivale ao `listPage` atual, com a mesma ordem, a mesma validação (`assertStatusPageQuery`) e o mesmo `pageInfoFor`. Os mapeadores são idênticos a `mapTask`/`mapApproval` (`postgres.ts:1584-1630`).
   - **SQL:** todos os valores vão por placeholder. `table` vem de uma união fechada de literais e o placeholder do operador é gerado, sem concatenar entrada do usuário. O RLS não é o único filtro, e há teste sem RLS (`case-scope-tasks-approvals-postgres.test.ts:758-835`).
3. **§4.2/§4.3.** A ordem das oito rotas confere com a tabela da SPEC, incluindo:
   - validação 400 antes do helper;
   - sem identidade (`requireAuthenticatedMutations` false), nenhuma checagem nas três rotas de criação;
   - replay idempotente sem vínculo → 404;
   - runtime approval com o helper depois de parâmetros, schema e `readIdempotencyKey`;
   - `listPage` removido de `RuntimePersistence` (`server.ts:4726-4745`, `5005-5018`).
4. **§4.4.** O 404 recarrega a fila pelo mesmo caminho do 409 e mostra a mensagem. O painel de tarefas ganhou uma linha `role="status"` (`apps/web/src/App.tsx:81-85,897-912,932-955`; `apps/web/src/features/tasks/index.tsx:40`). Ressalva no O3.
5. **§4.5.** O adendo da SPEC0107 está completo: listas, quatro seções novas, as duas linhas de erro e o parágrafo de versionamento.
6. **§6.** Os 35 arquivos de `git diff --name-only` estão todos dentro do conjunto de escrita. Nada em migrations, lockfile, `postgres.ts`, `apps/worker` de produção nem `products/**`.
7. **Testes novos.**
   - Cobrem S1–S8 e matam os mutantes do §7, com uma exceção: a lacuna do M1 na S2.
   - R4-O1, O2, O3, O5 e O7 foram aplicados.
   - O R4-O8 (painel de tarefas) também foi aplicado.
8. **Ajustes de testes.** Os 22 arquivos cabem nas regras (a)–(d) e nenhuma asserção ficou mais fraca.
   - Em dois testes a leitura do audit limitado passou para antes do grant. A asserção continua um 404 estático e independe do conteúdo.
   - O `postgres-persistence-mode` aplica (d) corretamente.
   - O `journey-routes-coverage` concede o grant pela porta. Está justificado.
9. **Regressões e premissas.** Nenhum buraco de autorização em outras rotas e nenhum erro de tipo aparente. Nenhuma premissa nova.

## OBRIGATÓRIOS

### M1 — A S2 (PostgreSQL) não prova a revogação da matriz da S1; o predicado `ACTIVE` da lista PostgreSQL fica sem teste

- **O que a SPEC exige.** A S2 é "mesma matriz do S1" (SPEC linha 129). A S1 termina com "Depois de revogar o grant de OperatorA, a mesma chamada dá `total` 0" (linha 128).
- **O que o BUILD fez.**
  - A S1 em memória cumpre essa parte (`apps/api/src/__tests__/case-scope-tasks-approvals.test.ts:546-555`).
  - A S2 (`apps/api/src/__tests__/case-scope-tasks-approvals-postgres.test.ts:520-756`) não revoga nada.
  - O único teste PostgreSQL com revogação é a S5 (`:1011-1021`), que exercita só o PATCH. O PATCH passa por `hasActiveGrant`, não pelo SQL de lista.
  - Nenhum outro teste PostgreSQL lista tasks ou approvals com um grant `REVOKED`. Conferi `task-approval-postgres` e `case-assignment-authorization-postgres`.
- **Consequência.** Um mutante que tire `AND a.status = 'ACTIVE'` de `assignedSessionVisibility` (`packages/persistence/src/case-authority-postgres.ts:170-178`, linha 177) sobrevive a toda a suíte. Em PostgreSQL, que é o caminho de produção, esse defeito faria Operator e Approver continuarem vendo na lista os itens de um caso revogado, com descrição e resumo de caso alheio. É o mesmo vazamento que a SPEC fecha.
- **Correção sugerida.** No fim da S2:
  1. Revogar o grant de `operator.a` no caso X com `putAssignment(w.seed, w.caseX, 'operator.a', { status: 'REVOKED', expectedRevision: 1 }, as('supervisor.case-manager','Supervisor', tenantA))`.
  2. Afirmar `total` 0 e `data` vazio em `GET /v1/tasks?limit=7` e `GET /v1/approvals?limit=7` para OperatorA, com `cache-control: no-store`.
  3. Opcionalmente, fazer o mesmo para ApproverA.

  Depois, atualizar o sha256 do `SKIP-PG-040` em `scripts/skip-catalog.json`. A contagem de testes não muda.

## OPCIONAIS

| ID | Ponto | Evidência (commit `acbec9f49`) | Correção sugerida |
| --- | --- | --- | --- |
| O1 | **Alcance do `no-store` (I7).** A I7 diz "Todas as respostas das oito rotas, de sucesso ou erro". O BUILD cobre as respostas do handler. A própria S7 se chama "every handler response". Ficam sem `no-store` as respostas que não passam pelo handler: o 400/413/415 do `setErrorHandler` (JSON inválido, corpo grande, media type), o 414/404 de alvo no `onRequest` e o 403 de origem do hook de segurança. É o R4-O6, deixado opcional na r4 e fora das `buildNotesFromR4Optionals`. São envelopes genéricos, sem dado, então não há exposição. | `apps/api/src/server.ts:502-508` e `:523-530`; SPEC linha 39; `case-scope-tasks-approvals.test.ts:1232` | Escolher uma das duas saídas: (a) um `onSend` restrito aos oito templates (`request.routeOptions.url`) que garanta `cache-control: no-store`; ou (b) registrar no fechamento que a I7 vale para "toda resposta produzida pelo handler" e ajustar o texto na promoção da SPEC. |
| O2 | **Ordem "validação 400 antes do helper" sem prova discriminante.** O bloco "Validation stays 400 before any case lookup" usa OperatorA e ApproverA, que têm grant, e a autoridade está saudável. Um mutante que ponha o helper antes da validação do corpo no PATCH, na decisão ou em `POST /v1/approvals` continua respondendo 400 e sobrevive. Não é mutante listado no §7, mas a I3 (última frase) afirma essa ordem e o comentário do teste diz que a prova. | `case-scope-tasks-approvals.test.ts:1331-1357`; SPEC linha 35 | Repetir as chamadas inválidas com OperatorB e ApproverB (sem grant, sobre recurso de X) ou com o app de outage. Esperar 400 em vez de 404 ou 503. |
| O3 | **`taskMessage` não é limpo na troca de identidade ou escopo.** `approvalMessage` é zerado nos dois blocos de reset, mas `taskMessage` não. Depois de trocar de operador, a mensagem "Este item não está mais disponível para você." de outro operador pode continuar no painel até a próxima transição. | `apps/web/src/App.tsx:168`, `:388-389`, `:411-412`, `:932`, `:954` | Acrescentar `setTaskMessage(null)` junto de `setApprovalMessage(null)` nos dois blocos. |
| O4 | **Commit não autocontido para links.** O adendo da SPEC0107 aponta para `0251_case_scope_tasks_approvals.md`, que não está no commit: a SPEC e a evidência da task estão não versionadas na árvore. O `docs:check-links` passou porque o arquivo existe em disco. | `docs/02_spec/0107_contratos_de_api.md:63,95`; `git cat-file -e acbec9f49:docs/02_spec/0251_case_scope_tasks_approvals.md` → ausente | Versionar a SPEC e `docs/04_audit/evidence/UP91-018-CASE-SCOPE-20261021/` no mesmo PR, antes de publicar. |
| O5 | **Desvio de texto na S6 (só registro).** A SPEC diz "migrações até 0028". O BUILD usa 0000–0027, porque `0028_session_events` é opt-in, exige schema dedicado e recusa o schema de runtime. A justificativa está correta e já foi registrada em `first-red.json`. O contrato não muda. | `case-scope-tasks-approvals-postgres.test.ts:298-329`; `packages/persistence/migrations/0028_session_events.sql:1-9`; `packages/persistence/src/postgres-migrations.ts:49` | Citar o desvio na evidência de fechamento. |
| O6 | **Ajustes fora da letra de (a), sem afrouxar asserção (só registro).** (i) Em `task-lifecycle` e `operator-identity-rbac`, a leitura do audit limitado do operador sem vínculo passou para antes do grant e da mutação. A asserção é um 404 estático, independente do conteúdo, e a mutação e o audit completo continuam provados. (ii) `journey-routes-coverage` concede o grant por `app.caseAuthority.putAssignment`, e não por `grantCase`, porque o app só confia em `operator.journeys`. A regra (a) cita o acesso direto à porta só para o worker e o E2E. Os dois estão documentados em `adjusted-tests.json`. | `task-lifecycle.test.ts:64-81`; `operator-identity-rbac.test.ts:166-188,335-356`; `journey-routes-coverage.test.ts:306-330` | Nenhuma mudança. Mencionar no fechamento que esses três ajustes usam a variante "reordenar" e "porta direta" da regra (a). |

## Premissa nova?

**Não.**

- O BUILD aplica só as decisões do usuário de 21/10, a SPEC r4 e as notas de BUILD do R4.
- Não há migração nem mudança de permissão de role.
- O M1 e os opcionais são de prova, UX ou registro. Nenhum pede decisão do usuário.
- O O1 só pede escolher entre um hook `onSend` e uma precisão de texto, as duas dentro do conjunto de escrita.
