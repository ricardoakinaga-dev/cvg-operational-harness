# Revisão de código independente r2: BUILD da SPEC0251 (escopo por caso em tasks e approvals)

## Veredito: **APPROVE**

Não há obrigatórios. O M1 da r1 foi resolvido. A S2 PostgreSQL agora revoga o grant e exige `total` 0, itens vazios e `no-store` nas duas listas. Isso mata o mutante do predicado `a.status = 'ACTIVE'`.

Os opcionais O1, O2 e O3 também foram resolvidos. O O4 continua aberto, com o lead, e é condição para publicar. O5 e O6 ficam como registro.

As correções não introduzem regressão, quebra de contrato, buraco de autorização nem arquivo fora do §6. Ficaram cinco opcionais novos, de prova ou de registro (R2-O1 a R2-O5).

## Escopo e método

- **Commit revisado:** `0fd6307e0` (correções da r1), sobre `acbec9f49` (BUILD). Base: `24cdb463` (`24cdb463faa1010da5fd78b6d923950ac2741713`).
- **Leitura do código:** só pelos objetos git:
  - `git diff 24cdb463..0fd6307e0`;
  - `git diff acbec9f49..0fd6307e0`;
  - `git show 0fd6307e0:<path>`.

  Outros processos alteram a árvore de trabalho, por isso não li código de lá.
- **SPEC:** `docs/02_spec/0251_case_scope_tasks_approvals.md`, não versionada. O sha256 `ef409b124e505310083bffa060e11b248905973ea8b7480989f77e1eb0c2d50e` confere.
- **Insumos:**
  - `code-review-r1/review.md`, `review.json` e `corrections.md`;
  - `spec-approval.json` (`buildNotesFromR4Optionals`);
  - `adjusted-tests.json`, `first-red.json` e `mutants.json`.
- **O que não fiz:** não rodei teste, servidor, PostgreSQL nem npm. Não editei nada além destes dois arquivos.
- **Comportamento do Fastify:** a versão é 5.12.5. Conferi a leitura em `node_modules/fastify` (só leitura).

## Status da r1

| ID | Status | Evidência (commit `0fd6307e0`) |
| --- | --- | --- |
| M1 | **Resolvido** | `apps/api/src/__tests__/case-scope-tasks-approvals-postgres.test.ts:755-775`. Revoga o grant de `operator.a` em X e exige, em `/v1/tasks?limit=7` e `/v1/approvals?limit=7`: `pageInfo` `{limit:7, offset:0, total:0, hasNextPage:false}`, `ids` `[]`, `cache-control: no-store` e 200 (`readList`, `:284`). Detalhe abaixo. |
| O1 | **Resolvido**, com ressalvas opcionais (R2-O1, R2-O2, R2-O3) | `apps/api/src/server.ts:790-812`. O hook `onSend` vale só para os oito pares método + template da §4.3. Prova: `case-scope-tasks-approvals.test.ts:1382-1400`. |
| O2 | **Resolvido** nas seis mutações; sobra um resíduo nas duas listas (R2-O5) | `case-scope-tasks-approvals.test.ts:1331-1380` usa OperatorB e ApproverB, sem grant em X. |
| O3 | **Resolvido** | `apps/web/src/App.tsx:389` e `:413`: `setTaskMessage(null)` ao lado de `setApprovalMessage(null)` nos dois blocos de reset. |
| O4 | **Não resolvido no commit**, encaminhado ao lead (`corrections.md`) | `git cat-file -e 0fd6307e0:docs/02_spec/0251_case_scope_tasks_approvals.md` dá ausente. O mesmo vale para `spec-approval.json`. `docs/02_spec/0107_contratos_de_api.md:63,95` continua apontando para a SPEC0251. Segue opcional, mas é **pré-condição do PR**. |
| O5 | **Aceito como registro** | `first-red.json:100` registra o esquema legado 0000–0027 e o motivo (`0028_session_events` é opt-in). |
| O6 | **Aceito como registro** | `adjusted-tests.json`: `task-lifecycle` (`:13`), `operator-identity-rbac` (`:50`) e `journey-routes-coverage` (`:92-96`, grant pela porta). |

## Verificação das correções

### M1: revogação na S2 PostgreSQL

1. **O teste.**
   - Ao fim da S2, `putAssignment(w.seed, w.caseX, 'operator.a', {status:'REVOKED', expectedRevision:1}, Supervisor do tenant A)` exige 200 (`:757-764`).
   - Depois, para OperatorA, as duas listas exigem `total` 0, itens vazios e `no-store` (`:765-775`).
2. **A revisão 1 está certa.** O grant inicial insere com `revision` 1 (`packages/persistence/src/case-authority-postgres.ts:1394-1398`). A revogação é um `UPDATE ... SET status = $4, revision = revision + 1` (`:1376-1383`): a linha `REVOKED` continua na tabela.
3. **O mutante morre.** Sem `AND a.status = 'ACTIVE'` (`:177`), o `EXISTS` de `assignedSessionVisibility` (`:170-178`) casaria a linha revogada e o `total` voltaria a 30. A asserção de `total` 0 falha, então o mutante (M13 no `corrections.md`) morre na S2, pela leitura estática.
4. **Nada mascara o efeito.** OperatorA só tem grant em X (`:442-447`). O predicado é o mesmo SQL para tasks e approvals e para qualquer operador (`statusPageWhere`, `:243-260`), então não precisa repetir com ApproverA.
5. **Governança.** O `sourceSha256` do `SKIP-PG-040` (`scripts/skip-catalog.json:434-437`, `11fb7a53…8b7c`) é igual ao sha256 do arquivo em `0fd6307e0`. A contagem continua em 5 testes. Também conferi o sha dos outros quatro arquivos PG tocados pelo BUILD: todos batem.

### O1: `no-store` nas respostas anteriores ao handler

1. **Restrito às oito rotas.** O `Set` (`server.ts:793-802`) tem exatamente os oito pares da §4.3. Os templates conferem com os registros:
   - `server.ts:1195` (decisão de runtime approval);
   - `:1743` (`POST /v1/tasks`);
   - `:1802` (`GET /v1/tasks`);
   - `:1836` (PATCH);
   - `:1889` (`POST /v1/approvals`);
   - `:1952` (decisão);
   - `:2010` (`GET /v1/approvals`);
   - `legacy/packages/secretary-journeys/src/api-routes.ts:358` (jornada). Essa rota é registrada direto na instância raiz (`server.ts:1726`), sem encapsulamento, e herda o hook.
2. **Cobre as respostas do framework antes do handler.** O roteamento do Fastify acontece antes do `onRequest`. Por isso `request.routeOptions.url` já está definido nestes casos:
   - erros do `setErrorHandler`: 400, 413 e 415 (`:502-508`);
   - recusas em `onRequest`:
     - 414 de alvo (`:523-530`) quando o caminho casa uma das oito rotas;
     - 403 de origem e 426 de `installHttpSecurityHooks` (`apps/api/src/http-security.ts:231-268`);
     - 429 (`server.ts:590+`) e 401 de token (`:638+`), que já tinham `no-store`.

   Num erro do roteador (`setNotFoundHandler`, `:509-521`) o `routeOptions.url` é `undefined` e nada muda. Está correto, porque nenhuma das oito rotas casou.
3. **Nada muda fora delas.**
   - Nenhum outro par casa a chave.
   - O único outro `onSend` (`http-security.ts:271-283`) não mexe em `cache-control`.
   - Nenhum teste afirma ausência de `cache-control` (grep em `apps`, `packages`, `legacy` e `tests`).
   - Nas oito rotas, o hook só repete o cabeçalho que o handler já põe. Status, corpo e mapeamento ficam iguais.
4. **Prova.**
   - `case-scope-tasks-approvals.test.ts:1382-1400` cobre 400 de JSON inválido em `POST /v1/tasks` e 415 de `application/xml` em `POST /v1/approvals`, ambos com `no-store`.
   - O `setErrorHandler` (`server.ts:502-508`) não põe o cabeçalho, então o mutante "hook sem cabeçalho" (M12) morre aqui.
   - Ressalvas: só duas das oito chaves têm prova (R2-O1); o HEAD derivado das duas listas fica fora (R2-O2); o `corrections.md` erra ao dizer que o 414 de alvo "não casa rota nenhuma" (R2-O3).

### O2: validação 400 antes do helper

O mundo do teste usa `requireAuthenticatedMutations: true` (`case-scope-tasks-approvals.test.ts:212`). OperatorB só tem grant em Y e ApproverB não tem grant (`:218-234`).

Se o helper rodasse antes da validação, estas chamadas responderiam 404, e o teste exige 400:

- PATCH com status inválido na task de X (`:1344`);
- `POST /v1/tasks` com `{}` (`:1345`) e `POST /v1/approvals` com `{}` (`:1346`): `sessionId` ausente, então `coreSessionCase` devolve nulo;
- decisão com `decision: 'bogus'` na approval de X (`:1347-1349`);
- decisão de runtime sem `idempotency-key` numa execução vinculada a X (`:1350-1355`; vínculo em `:1247-1267`);
- jornada com `sessionId` vazio, com 161 caracteres ou com corpo que não é objeto (`:1359-1380`).

As duas listas (`:1334-1343`) não discriminam (R2-O5).

### O3: limpeza de `taskMessage`

`App.tsx:389` (sem identidade, bloco `:372-393`) e `:413` (troca de identidade ou escopo, bloco `:396-416`). Não há teste dedicado, o que é aceitável para um opcional de UX. O caminho de 404 continua igual (`:926-966`, mensagem em `:956`).

## Regressões, contrato e conjunto de escrita

- **Arquivos.**
  - `git diff --name-only 24cdb463..0fd6307e0` lista os mesmos 35 arquivos da r1.
  - A rodada de correções tocou cinco, todos dentro do §6:
    - `server.ts`: o hook só age nas rotas da §4.3, o que cabe em "só as rotas do §4.3";
    - `App.tsx` (§4.4);
    - os dois arquivos de teste novos;
    - `scripts/skip-catalog.json` (governança).
  - Nada em migrations, lockfile, `postgres.ts`, código de produção de `apps/worker/**` ou `products/**`.
- **Autorização.** `case-routes.ts`, `case-authority.ts`, `case-authority-postgres.ts` e `api-routes.ts` não mudaram desde `acbec9f49`. As rotas também não mudaram, fora o hook. Não há buraco novo.
- **Contrato.** Nenhum status, corpo ou DTO mudou. O hook só acrescenta `cache-control: no-store`, o que a I7 já exigia.
- **Tipos.** Em Fastify 5, `request.routeOptions.url` é `string | undefined`. O template string compila, e o hook `async` devolve o `payload`, como deve.

## Varredura do estado final (I1–I7, §4.1–§4.5)

As conclusões da r1 continuam válidas, porque o código de produção que mudou se resume ao hook e a duas linhas da web. Conferi de novo, por amostragem:

- **I1/§4.1.**
  - Memória: `packages/persistence/src/case-authority.ts:753-794`.
  - PostgreSQL: uma instrução COUNT + LATERAL, com o `EXISTS` no `WHERE` das duas partes (`case-authority-postgres.ts:1001-1095`). O tenant sai de `conversations.tenant_id` (`:243-260`).
  - O predicado `ACTIVE` agora tem prova nas duas implementações.
- **I2, I3 e I4/§4.2.**
  - O helper está em `case-routes.ts:409-437`: alvo nulo ou `canReadCase` falso dão o mesmo `case_not_found` (`:434`); execução passa por `readExecutionForCaller`.
  - Chamadas nas rotas:
    - PATCH: `server.ts:1848`;
    - `POST /v1/tasks`: `:1756`;
    - `POST /v1/approvals`: `:1905`, depois de `requestHumanApproval` e de `audit:view_full`;
    - decisão: `:1966`;
    - runtime: `:1252`, depois de parâmetros, schema e `readIdempotencyKey`;
    - jornada: `api-routes.ts:391`, depois da validação em `:377-390`.
  - Nas seis rotas o helper roda antes de escrita, audit ou log de sucesso.
- **I5.** `resolveCaseReadScope` não mudou (`case-routes.ts:103-150`).
- **I6.** Nenhuma migration, DTO ou permissão mudou.
- **I7.**
  - Ramo de caso à frente do mapeamento: `server.ts:784-789` (`toSafeRouteError`), `:1435-1449` (cadeia da runtime approval preservada) e `api-routes.ts:400`.
  - `no-store` agora vale para o handler e para as respostas do framework nas oito rotas (`server.ts:790-812`). A exceção é o HEAD, coberto no R2-O2.
- **§4.3.** A ordem confere com a tabela. Sem identidade, as três rotas de criação ficam sem checagem (`server.ts:1746-1760`, `:1892-1909`; `api-routes.ts:391`).
- **§4.4.** Ver O3. Painel de tarefas com `role="status"` (`apps/web/src/features/tasks/index.tsx:40`).
- **§4.5.** O adendo da SPEC0107 não mudou desde a r1.

## OBRIGATÓRIOS

Nenhum.

## OPCIONAIS

| ID | Ponto | Evidência (commit `0fd6307e0`) | Correção sugerida |
| --- | --- | --- | --- |
| R2-O1 | **Seis das oito chaves do hook não têm prova.** A S7 cobre só `POST /v1/tasks` (400) e `POST /v1/approvals` (415). Um erro de digitação em qualquer das outras seis chaves do `Set` sobreviveria à suíte. O M12 só remove o cabeçalho e não testa a pertinência. Hoje as oito chaves estão corretas (conferi uma a uma). O título do teste ainda diz "every handler response". | `server.ts:793-802`; `case-scope-tasks-approvals.test.ts:1232`, `:1382-1400` | Laço sobre as oito rotas com uma recusa anterior ao handler válida para qualquer método, por exemplo `origin: https://nao-permitida.example`, que dá 403 por `http-security.ts:265`. Exigir `cache-control: no-store` em todas. Ajustar o título do teste. |
| R2-O2 | **HEAD derivado das listas fica fora do hook.** O Fastify 5 expõe `HEAD` para toda rota `GET` (`exposeHeadRoutes` é `true` por padrão; `buildServer` não o desliga, `server.ts:482-490`). `HEAD /v1/tasks` e `HEAD /v1/approvals` usam o mesmo handler, que já põe `no-store`. Mas as respostas anteriores ao handler em HEAD (403 de origem, 426, 414) não casam a chave `HEAD …` e saem sem o cabeçalho. Não há corpo, então não há exposição. | `server.ts:803-808` (chave `${request.method} …`); `node_modules/fastify/lib/config-validator.js:69-70` | Acrescentar `'HEAD /v1/tasks'` e `'HEAD /v1/approvals'` ao `Set`. Ou registrar no fechamento que a I7 vale para os métodos declarados na §4.3. |
| R2-O3 | **Imprecisão no `corrections.md`.** O registro diz "Os 414/404 de alvo não casam rota nenhuma e ficam fora". O 414 de alvo vem do `onRequest` (`server.ts:523-530`), que roda depois do roteamento. Com o caminho de uma das oito rotas e uma query acima de 8 KiB, a rota casa e o hook põe `no-store`. Só um erro do roteador fica fora: o `setNotFoundHandler` (`:509-521`), por exemplo para parâmetro acima de `maxParamLength` 100. | `server.ts:509-530`; `apps/api/src/http-target-boundary.ts` (limite de 8 KiB do alvo) | Corrigir o texto: "414 com caminho de uma das oito rotas leva `no-store` pelo hook; só erro do roteador (404/414 sem rota casada) fica fora, porque não é resposta das oito rotas". |
| R2-O4 | **Evidência da rodada de correções ainda não gravada.** Quando li, `mutants.json` ainda tinha `reviewedCommit: acbec9f49` e 20 mutantes, sem os M12 e M13 que o `corrections.md` anuncia. Lint, typecheck, prettier, `test:postgres` e skip-governance são de 00:25 a 00:31, antes de `0fd6307e0` (00:46). A cobertura estava rodando. Pela leitura estática, M12 e M13 morrem (ver M1 e O1). | `docs/04_audit/evidence/UP91-018-CASE-SCOPE-20261021/mutants.json`; `logs/` | Antes do fechamento, acrescentar M12 e M13 a `mutants.json` (`reviewedCommit` `0fd6307e0`) e reexecutar, em `0fd6307e0`, os gates do §8 afetados: S2 e S7 focais, `test:postgres`, lint, typecheck e skip-governance. |
| R2-O5 | **A ordem "parse → snapshot" nas listas segue sem prova discriminante.** Nas duas GET do bloco de validação, OperatorB e ApproverB têm principal provisionado. Um snapshot antes do `parseStatusPageQuery` continuaria respondendo 400, porque lista não dá 404. O comentário do teste diz que "a lookup before validation would answer 404", o que só vale para as mutações. O teste de outage (`:1125-1230`) não tem query inválida. Impacto baixo: a inversão só mudaria 400 para 503 durante outage. | `case-scope-tasks-approvals.test.ts:1331-1343`, `:1125-1230`; `server.ts:1809-1826`, `:2016-2032` | No app de outage, chamar `GET /v1/tasks?limit=0` e `GET /v1/approvals?status=bogus` e esperar 400, não 503. Ou restringir o comentário às mutações. |

## Premissa nova?

**Não.**

- As correções aplicam o M1 e os opcionais O1–O3 da r1 dentro do conjunto de escrita do §6.
- O hook `onSend` é a saída (a) que a própria r1 propôs para a I7. Não muda nada fora das oito rotas.
- Nenhuma migração, permissão de role, DTO ou decisão do usuário foi tocada.
- O O4 (versionar a SPEC e a evidência) é tarefa do lead antes do PR, não premissa.
