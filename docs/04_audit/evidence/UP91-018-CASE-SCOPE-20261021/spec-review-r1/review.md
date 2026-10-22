# Revisão independente r1 — SPEC0251 (escopo por caso em tasks e approvals)

- Alvo: `docs/02_spec/0251_case_scope_tasks_approvals.md`, sha256 `96bdb2884f953695abe8584eb503ef5a84958d0c48b07fdd7c4b4cfce60892c8`
- Base conferida: worktree detached `24cdb463faa1010da5fd78b6d923950ac2741713`
- Decisões usadas: `docs/04_audit/evidence/UP91-018-CASE-SCOPE-20261021/user-decisions-20261021.json`
- Método: leitura do código citado e busca (`grep`) em todas as suítes. Não rodei servidor, PostgreSQL nem testes.

## Veredito: **REVISE**

A SPEC fecha o resíduo P1 (listas e PATCH) e não traz premissa de produto nova. Mas tem três obrigatórios: o desenho do alvo `execution` contradiz o código e as próprias provas, o inventário de testes quebrados está incompleto e inclui arquivo fora do conjunto de escrita, e a rota legada de jornada fica com mapeamento de erro 500. Os três se corrigem sem migração e sem decisão nova do usuário.

## OBRIGATÓRIOS

### M1. O alvo `execution` do helper contradiz `executionCase` e as provas S4 e S6

- **Evidência.** A §4.2 (linha 69) diz que o helper "lança `case_not_found` quando o alvo é `null` (todas as roles)" e que "execução sem vínculo tem caseId `null`". No código, `executionCase` devolve `null` quando não há linha em `case_execution_links`, e isso vale tanto para execução sem vínculo quanto para execução inexistente: não há checagem de existência (`packages/persistence/src/case-authority-postgres.ts:765-774`; memória em `packages/persistence/src/case-authority.ts:663-666`). `case_execution_links.case_id` é `NOT NULL` (`packages/persistence/migrations/0029_case_assignment_authorization.sql:107-110`), então `{caseId: null}` nunca acontece. Além disso, `executionCase` passa por `scoped` → `requireCaseTables` (`case-authority-postgres.ts:652-658`), que lança `case_authority_unavailable` (503) no esquema legado sem 0029.
- **Consequência.** Com a regra da §4.2:
  - Supervisor recebe 404 ao decidir runtime approval de execução existente sem vínculo. A S4 espera "Supervisor 200", e a decisão do usuário diz "Supervisor e Admin seguem no tenant todo".
  - No cliente legado, Supervisor recebe 503 nessa rota. A S6 espera "Supervisor 200".
- **Correção.** Para `kind: 'execution'`, especificar o algoritmo de `readExecutionForCaller` (`apps/api/src/case-authorization/case-routes.ts:349-370`):
  - escopo `assigned`: `executionCase` + `canReadCase` (`null` nega);
  - existência para todas as roles: `executionReader(deps, snapshot).get(tenantId, executionId)`, com `null` → 404;
  - escopo `tenant`: não chama `executionCase`.
  O caminho mais simples é chamar `readExecutionForCaller` antes do fluxo atual da rota. Trocar o texto "execução sem vínculo tem caseId null" por "sem linha de vínculo (`null`), negada no escopo `assigned`".

### M2. Inventário de testes quebrados incompleto, com arquivo fora do conjunto de escrita

- **Evidência (fora do conjunto de escrita).** A §6 exclui `apps/worker/**`. Mas `apps/worker/src/__tests__/operational-harness-iterative.test.ts:254-265` decide runtime approval como `Approver` sem grant, numa execução submetida pela API (que ganha root independente), e espera 202. Depois da SPEC a resposta é 404. Esse arquivo também está no `test:postgres` (`package.json:19`).
- **Evidência (fora da lista da §6).** Outros testes também quebram e não estão na lista:
  - `Approver` sem grant decidindo runtime approval: `apps/api/src/__tests__/approval-decision-atomicity.test.ts:107-113,164,220`, `approval-decision-atomicity-postgres.test.ts:157,392,441-442`, `execution-spine.test.ts:466-475,497-508`, `homolog-correlation-postgres.test.ts:141-146`.
  - `Operator` sem grant em `POST /v1/journeys/tasks`, esperando 200: `journey-routes-coverage.test.ts:367-376,397`.
  - Testes de identidade em modo trusted que usam `GET /v1/tasks` como rota protegida canônica e esperam 200. Com a SPEC, trusted sem `casePrincipalAuthority` responde 503: `identity-trusted-resolver.test.ts:129`, `identity-composition-wiring.test.ts:80,187`, `operator-session.test.ts:100`, `production-boundary.test.ts:67`.
  - Em `production-boundary`, `NODE_ENV=production` recusa principal sintético (`case-routes.ts:118-122`). Ali a fixture de grant não resolve.
- **Correção.**
  1. Refazer o levantamento com busca em `apps/**`, `legacy/**` e `tests/**`, incluindo `apps/worker`. Pôr os arquivos acima no conjunto de escrita; para `apps/worker/src/__tests__/operational-harness-iterative.test.ts`, o mínimo é uma exceção explícita "só esse teste".
  2. Fixar a política por classe, sem afrouxar asserção:
     - **(a) runtime approval em teste:** manter o `Approver` como ator e criar vínculo e grant por `caseAuthority.registerExecutionLink` e pela fixture;
     - **(b) testes de identidade trusted:** trocar a rota de sonda por uma que não dependa de caso (por exemplo `GET /v1/admin/agents` com Admin, ou `GET /v1/session`), com as mesmas asserções 401/200; ou, em `NODE_ENV=test`, configurar `casePrincipalAuthority` e provisionar o principal. Nunca trocar 200 por 503 num teste de identidade.
  3. Atualizar o `skip-catalog` dos arquivos PG tocados.

### M3. `POST /v1/journeys/tasks` responde 500 em negação e em outage, contra I3, I7 e S7

- **Evidência.** O `catch` da rota legada usa `toSafeError` de `@cvg/shared` (`legacy/packages/secretary-journeys/src/api-routes.ts:359-363`). Essa função transforma todo erro que não seja `DomainError` em `internal_error` 500 (`packages/shared/src/errors.ts:45-53`).
  - A §4.2 manda o helper lançar `CaseAuthorityError('case_not_found')`.
  - Falhas do snapshot também chegam como `CaseAuthorityError` (`case_integrity`, `case_authority_unavailable`).
  - A §6 limita a mudança no legado a "só a chamada do helper".
  - Resultado: sem grant dá 500 em vez de 404, outage dá 500 em vez de 503, e a resposta sai sem `cache-control: no-store`.
- **Correção.** Escolher uma de duas formas e ajustar o conjunto de escrita da §6 de acordo:
  - **(a)** o servidor injeta na rota uma função que já converte o erro com `toSafeCaseError` para `DomainError` (`not_found`/`unauthorized`/`configuration_error`, com mensagem estática);
  - **(b)** a rota legada recebe por injeção `toSafeCaseError` e o cabeçalho `no-store`.
  Em qualquer caso, a S7 precisa citar `POST /v1/journeys/tasks` explicitamente.

## OPCIONAIS

1. **§1, runtime approval.** Explicitar por que a decisão de runtime approval entra na decisão do usuário (argumento na seção "Premissa nova?"). Dizer que `assumed` (handoff_only, `packages/persistence/src/attendance-approval.ts:65-76`) e `rejected` também exigem vínculo. Registrar que o Approver sem vínculo perde a rejeição como freio, mas mantém `POST /v1/executions/:id/cancel`, porque tem `conversation:update` (`packages/shared/src/auth.ts:15-22`, `server.ts:1091-1094`). Takeover ele não tem: falta `conversation:assume`.
2. **§2, precisão.** Principal ausente só gera 401 em trusted. Em simulação, principal ausente segue em frente (`case-routes.ts:107-139`). Além disso, `readSnapshot` não fica em `case-routes.ts:101-158`.
3. **I3.** Deixar explícito que "sessão sem root" dá 404 só para Operator/Approver. Supervisor/Admin seguem.
4. **Ordem nas rotas.**
   - Runtime approval: dizer se `OperationalApprovalDecisionSchema.parse` e `readIdempotencyKey` (`server.ts:1216-1217`) ficam antes do helper (a I3 pede validação antes da consulta).
   - Jornada: dizer qual validador se aplica a `body.sessionId` (por exemplo string de 1 a 160, como em `CreateInternalTaskSchema`) e pôr o helper depois das checagens `!tenantId` e `!journeys` (`api-routes.ts:343-351`).
5. **"Não encontrada" depois da autorização.** O `Task not found` e o `Approval request not found` do port (400 `invalid_action`) continuam alcançáveis depois do helper. Declarar como inalcançável (não há `DELETE` dessas tabelas) ou mapear para 404.
6. **Caminho de lista sem escopo.** Tirar `listPage` de `RuntimePersistence.tasks` e `.approvals`, como a SPEC0250 fez com `updateStatus`, para não sobrar caminho de lista sem escopo na composição.
7. **§4.4, web.** O painel de tarefas não tem espaço de mensagem: só existe `approvalMessage` (`apps/web/src/App.tsx:156,1124`). Mostrar a mensagem em tarefas é mudança visual, então "nenhuma outra mudança visual" precisa de ajuste.
8. **Provas a acrescentar.**
   - Positivos por rota na S3: `POST /v1/tasks` e `POST /v1/journeys/tasks` por OperatorA, `POST /v1/approvals` por ApproverA. Sem eles, o mutante "nega sempre" sobrevive na memória.
   - Admin e ApproverA na S1.
   - `cache-control: no-store` nas respostas 200 das listas.
   - Mesmo `event`/`errorCode` de log para ausente e para sem grant.
   - Replay idempotente de `POST /v1/tasks` por OperatorB que não devolve a task existente.
   - Na S3, comparar o corpo ignorando `meta.correlationId`.
9. **Timing.** Ausente e root ausente fazem uma consulta a menos que "sem grant" (`hasActiveGrant`). Paridade com a SPEC0176, aceitável. Opcionalmente, `taskCase` e `approvalRequestCase` podem devolver `granted` na mesma instrução para o escopo `assigned`.
10. **Paginação no modo cliente único.** No modo `postgres` de cliente único, `read()` não abre transação (`case-authority-postgres.ts:486-489`), então "duas instruções no mesmo REPEATABLE READ" não vale ali. Preferir uma instrução só (COUNT + LATERAL), como a SPEC0250.
11. **I4 e §9.** Dizer que a escrita roda numa transação separada, depois de o snapshot fechar. Por isso o efeito pode ser confirmado depois do COMMIT da revogação, uma janela maior que a das leituras (nelas o conteúdo sai do próprio snapshot). Isso basta para "mesma regra". Checar o grant dentro da transação de escrita fica como evolução.
12. **Imutabilidade.** Ela vem do código (nenhum `UPDATE` em `session_id` ou `conversation_id`), não de trigger. As FKs tenant-compostas da 0001 são `NOT VALID` (`0001_tenant_isolation.sql:770-787`). O root pode nascer depois (de `null` para X), o que é monotônico e seguro, porque `null` nega. Ajustar o texto.
13. **I7.** Especificar o padrão `error instanceof CaseAuthorityError ? toSafeCaseError(error) : toSafeError(error)` seguido de `statusCodeForError` (`server.ts:1616-1619`). Passar tudo por `toSafeCaseError` perderia 413/414/415, que o `DOMAIN_STATUS` dela não tem (`case-routes.ts:166-175`).
14. **SPEC0107.**
    - Ela não tem seções para PATCH de status nem para `POST /v1/approvals`: o adendo precisa criá-las.
    - O adendo também precisa citar a runtime approval e `/v1/journeys/tasks`.
    - Registrar a mudança 400→404 frente à regra de "Versionamento" da SPEC0107, como a SPEC0250 fez.
15. **Esquema legado sem 0029.** `taskCase` e `listTasks` não podem usar `tasks.tenant_id` nem `sessions.tenant_id`. Devem filtrar o tenant pelo join em `conversations.tenant_id`, como faz `coreSessionCase` no modo legado (`case-authority-postgres.ts:705-718`).

## Respostas às perguntas do pedido

1. **Fidelidade às decisões.** Cobre tudo o que foi decidido: listas, PATCH, criação pelas duas rotas, criação de approval, decisão nas duas tabelas, Supervisor/Admin no tenant, takeover/input/cancel sem mudança. Nada além como premissa de produto (seção abaixo).
2. **Correção técnica.**
   - As âncoras arquivo:linha conferem, com desvios de ±2 linhas (por exemplo o smoke em `:212-216`).
   - Não achei outra rota que leia ou mute tasks/approvals de caso alheio para Operator/Approver. Conferi `server.ts`, `routes/`, as rotas legadas e `case-routes`. A timeline não devolve approvals; auditoria completa é só de Supervisor/Admin; capability approvals são de plataforma.
   - Revogação (I4): coerente com a SPEC0176 (opcional 11).
   - TOCTOU: não há troca de caso (opcional 12).
   - 404: mesmo corpo, mesmo ponto e mesmo log, com diferença de uma consulta (opcional 9).
   - Política trusted/legado/outage: correta para task, approval e sessão; errada para execução (M1); 500 na rota de jornada (M3).
   - Paginação: filtra antes do COUNT.
   - Migração: não precisa.
   - Consumidores: quebram consumidores não listados (M2).
3. **Testabilidade.** Os mutantes listados morrem. Falta cobertura para os casos do M1 (vão falhar no BUILD do jeito que estão), para o mapeamento da rota de jornada (M3) e para os positivos por rota (opcional 8).
4. **Clareza.** Ambiguidades listadas nos opcionais 3, 4, 5, 7, 10 e 13.

## Premissa nova?

**Não.**

- **Runtime approval** (`POST /v1/executions/:executionId/approvals/:approvalId/decision`) está dentro de "decidir approval só no caso atribuído", por três motivos:
  - O texto da decisão é genérico e enumera as exceções de forma fechada: takeover de sessão e input/cancelamento de execução. A runtime approval é uma rota de execução e não está entre as exceções.
  - O registro diz que a decisão muda a premissa da SPEC0176 §7. A única mutação de approval que a §7 trata é justamente a resolução de runtime approval, que hoje devolve o ack `{id,state}` a quem pode mutar sem ler.
  - O "freio sem vínculo" que motivou as exceções continua disponível: o cancelamento da execução, que Approver e Operator têm por `conversation:update`, e o Supervisor no tenant todo.
- **400→404 para recurso ausente**, inclusive para Supervisor/Admin, é consequência técnica de "404 como se o recurso não existisse" (indistinguibilidade), não premissa de produto.
- **503 em trusted também para Supervisor/Admin**, até a UP91-025, é a política de principal da SPEC0176 ("mesma regra"), já aplicada aos leitores e já registrada no §9. Não há ambiente operacional afetado: produção está NO_GO e a UP91-025 é a frente seguinte.
- **Migração:** nenhuma. As tabelas, índices e grants existentes bastam.
- A correção do M2 exige decidir o conjunto de escrita (incluir um teste de `apps/worker`). Isso é escopo de BUILD, não premissa de produto.
