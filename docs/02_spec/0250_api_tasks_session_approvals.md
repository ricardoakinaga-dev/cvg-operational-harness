# SPEC0250 — Tarefas, approvals e sessão do console: transição atômica, listas limitadas, contexto de decisão e restauração por cookie

**PROPOSTA T3, revisão r2. BUILD condicionado ao APPROVE do crítico independente sem obrigatórios**, conforme a [decisão do usuário de 20/10/2026](../04_audit/evidence/AUD0621-REMEDIATION-20261020/user-decisions-20261020.json) para as SPECs 0248–0250. Migração de esquema ou premissa nova param a execução e voltam ao usuário. Tasks: `AUD0621-API-WEB-SPEC-0250-20261020` e `AUD0621-API-WEB-BUILD-0250-20261020`, frente `AUD0621-API-WEB-0250`, task-mãe `AUD0621-REMEDIATION-20261020`. Origem: achados F12, F15, F16, F22 e F23 do [relatório 0621](../04_audit/0621_critical_production_audit_2026-10-20.md), com as sondas `integration-probes.json#cookie-only-bootstrap`, `#task-concurrent-terminal`, `#task-audit-partial`, `#unbounded-task-list` e a [revisão API/web](../04_audit/evidence/AUD-CRITICAL-20261020/review-api.md) (I1-02 a I1-06). Autoridade de contrato: [SPEC0107](0107_contratos_de_api.md), [SPEC0114](0114_superficie_operacional_e_frontend.md) e [SPEC0144](0144_trusted_operator_session_production.md). Constituição: [D-12/T3](../07_agents/AGENTS.md). A r2 aplica os dois obrigatórios da [revisão r1](../04_audit/evidence/AUD0621-API-WEB-0250-20261020/spec-review-r1/review.md) (escopo do modo PostgreSQL de cliente único e tentativa única com token) e os opcionais listados em [r1-corrections](../04_audit/evidence/AUD0621-API-WEB-0250-20261020/spec-review-r1/corrections.md).

Base: `6c9fc6517f272e884a4adc5d7b8c71d1e1a552e9` (main remota). Links relativos a `docs/02_spec`. As âncoras de linha abaixo são dessa base. Nenhum dado real, provider, canal, IdP corporativo, deploy ou produção.

## 1. CURRENT — problema e evidência

### 1.1 F15 — transição de tarefa a partir de estado obsoleto (P2)

`PATCH /v1/tasks/:taskId/status` (`apps/api/src/server.ts:1769`) lê a tarefa (`tasks.findById`, 1780), valida a regra `assertTaskTransition` (4770) sobre essa leitura e grava depois com `tasks.updateStatus` (1785). No PostgreSQL, `updateTaskStatus` (`packages/persistence/src/postgres.ts:1010`) é `UPDATE tasks SET status = $2 WHERE tasks.id = $1` mais o filtro de tenant, sem status esperado e fora de transação. Duas requisições que leem `open` passam na validação, e a segunda grava por cima da primeira. A sonda do auditor (barreira no port, adapter memória) obteve `done` e `in_progress` com 200 e estado final `in_progress`: tarefa terminal reaberta. O audit das duas registra `fromStatus: open`, o que também é falso para a segunda.

### 1.2 F16 — mutação de tarefa sem trilha (P2)

O mesmo handler grava a tarefa e só então chama `audit.append` (1793), em operação separada. Falha do audit devolve 500 com a tarefa já alterada (sonda `task-audit-partial`: 500 e `done` persistido). No PostgreSQL são dois comandos em autocommit. O cliente não sabe se o comando teve efeito, e a trilha exigida falta.

### 1.3 F23 — listas sem limite (P2)

`GET /v1/tasks` (1756) e `GET /v1/approvals` (1940) ignoram a query e devolvem a coleção do tenant. As consultas `listTasks` (postgres.ts:949) e `listApprovals` (1201) não têm `LIMIT`; approvals incluem decisões terminais. A sonda `unbounded-task-list` pediu `limit=1&offset=100` e recebeu as duas tarefas existentes (com 101 tarefas, recebe as 101). A SPEC0107 exige listagens paginadas com limite máximo e approvals paginados, com filtros de status. A resposta atual de ambas as rotas é `data: Array<...>`, consumida pela web (`apps/web/src/api/client.ts:787,807`), por testes de API e pelo smoke de produção (`scripts/production-target-smoke.ts`, só status HTTP).

### 1.4 F22 — decisão de approval sem resumo e caso (P2)

`ApprovalView` (`apps/web/src/api/client.ts:457`) tem `sessionId` e `summary`, mas `ApprovalsPanel` (`apps/web/src/features/approvals/index.tsx:1,60`) declara e mostra só ação proposta, risco e status, ao lado dos botões. Dois pedidos com a mesma ação e o mesmo risco, de casos diferentes, ficam indistinguíveis; os botões têm o mesmo nome acessível (`Aprovar <ação>`) e a linha não tem nome. A SPEC0114 manda a fila mostrar ação, resumo, risco, contexto e horário.

### 1.5 F12 — reload não restaura sessão por cookie (P1)

`createTrustedSessionBootstrap().load()` (`apps/web/src/auth/session.ts:59`) lança 401 local quando o provider não tem token, sem chamar a API. O provider padrão consome o token global de uso único. A API já restaura por cookie: `GET /v1/session` sem token e com cookie válido devolve a sessão existente (server.ts:745–780). Logo, recarregar o console com cookie válido exige token novo, contra o invariante 3 da SPEC0144. Os testes atuais injetam bootstrap substituto e o E2E confiável reinjeta o token por `addInitScript` a cada navegação.

A SPEC0144 (crítica I2) já registrou por que a troca isolada em `session.ts` não basta: o cliente chama `onUnauthorized` global antes de a carga tratar o 401 (`client.ts:672`), e o `App.tsx` mostraria a primeira visita sem cookie como "sessão expirou"; um 503 vira "autenticação necessária". A correção precisa mexer em `session.ts`, no cliente e no `App.tsx` juntos, com teste de 401 inicial, 503 com cookie e recuperação. Há ainda um risco no caminho com token: `getSession` é GET e passa pelo retry automático do cliente (até 2 novas tentativas em 429, 5xx e rede, `client.ts:606-638`). A API registra o `jti` ao resolver o token (`operator-identity.ts:172-179`) antes de gravar o store; se o store falha (503, cookie preservado, `server.ts:838-846`), a nova tentativa reenvia o mesmo token, recebe replay 401 e o `catch` limpa o cookie (`server.ts:859-865`). Uma falha transitória na troca vira logout do cookie anterior, contra a SPEC0144.

## 2. Invariantes

- **Escopo de I1 e I2.** Valem para a memória e para `postgres-pool`, a composição de produção (`env.ts:91` exige RLS em produção, e `buildServerFromEnv` escolhe `postgres-pool` com RLS, `server.ts:5422-5426`). O modo `postgres` de cliente único (`buildServerFromEnv` sem RLS e testes com `client`) compartilha uma conexão entre requisições: transações de requisições concorrentes não ficam isoladas. Isso já vale hoje para `decideApprovalWithAudit` e `transitionTakeover`; o resíduo está na §8.
- **I1 (F15).** A validação da transição de tarefa e a escrita usam o mesmo estado confirmado. Para quaisquer duas transições concorrentes da mesma tarefa, o resultado é o de alguma ordem serial: nenhuma tarefa sai de `done` ou `canceled`, e o `fromStatus` de cada evento é o status confirmado imediatamente antes daquela escrita.
- **I2 (F16).** Mudança de status de tarefa e seu evento de audit são confirmados juntos ou nenhum dos dois. Erro de audit devolve erro e deixa a tarefa como estava.
- **I3 (F23).** `GET /v1/tasks` e `GET /v1/approvals` nunca devolvem mais que 100 itens. Limite, deslocamento e filtro de status são validados; parâmetro inválido devolve 400 sem consulta.
- **I4 (compatibilidade).** O formato de `data` das duas listas continua `Array<...>`; os metadados de página são aditivos. `PATCH` de status e o corpo das demais rotas não mudam. Nenhum esquema, migration, índice, role ou grant muda.
- **I5 (F22).** Cada linha da fila de approvals mostra resumo e caso (sessão) e horário; os botões de decisão de cada linha têm descrição acessível que inclui o resumo e o caso. Nenhuma permissão nova: só dados já entregues pelo DTO autorizado.
- **I6 (F12).** Sem token novo, o console tenta a sessão pelo cookie (`GET /v1/session` sem `x-cvg-operator-token`) antes de pedir autenticação. 401 dessa carga mostra "Autenticação necessária" com a mensagem de sessão necessária, nunca "expirou"; 503, 429, 5xx, timeout e rede mostram indisponibilidade com nova tentativa, sem logout e sem nova tentativa automática que reenvie o token. O token de bootstrap continua de uso único e fora de storage do navegador.

## 3. PROPOSED — contrato

### 3.1 Persistência: transição atômica de tarefa (F15, F16)

Novo comando, igual nos dois adapters, no modelo de `decideWithAudit` de approvals:

```ts
interface TaskStatusTransitionCommand {
  taskId: string
  status: TaskStatus
  actorType: AuditEventRecord['actorType'] // papel autenticado
  actorId: string // operatorId da identidade autenticada
  correlationId: string
}
// memória (síncrono)
TaskRepository.transitionStatusWithAudit(command, tenantId?): TaskRecord
// PostgreSQL
PostgresRuntimeRepository.transitionTaskStatusWithAudit(command, tenantId?): Promise<TaskRecord>
```

Regra de transição única, exportada do módulo da tarefa em memória e usada pelos dois adapters: `open → in_progress | done | canceled`; `in_progress → done | canceled`; `done` e `canceled` terminais; mesmo status é no-op aceito (comportamento atual preservado, inclusive o evento com `fromStatus = toStatus`). Violação: `DomainError('invalid_action', 'Task status transition is not allowed')` (400, igual ao caso sequencial atual). Tarefa ausente no tenant: `DomainError('invalid_action', 'Task not found')`.

Evento (mesmo conteúdo de hoje): `type: 'integration_event'`, `actorType`, `actorId`, `correlationId`, `policyVersion: 'api-runtime-v1'`, `payload: { sessionId, taskId, fromStatus, toStatus, effect: 'internal_task_state_only', tenantId }` (`tenantId` presente quando houver escopo, e também no registro).

- **Memória.** Método síncrono, sem `await`: lê a tarefa direto de `db.state` (não pelo `findById` público, que pode ser sobrescrito), valida, prepara o evento num `InMemoryDatabase` de estágio (mesmo padrão de `ApprovalRepository.decideWithAudit`) e só depois publica tarefa e eventos. Exceção no audit deixa estado intacto. O laço de eventos não intercala outra transição entre leitura e escrita.
- **PostgreSQL.** No mesmo cliente: `BEGIN`; `SELECT … FROM tasks INNER JOIN sessions … INNER JOIN conversations … WHERE tasks.id = $1 AND conversations.tenant_id = $2 FOR UPDATE OF tasks` (filtro de tenant só quando há escopo, como hoje); valida a regra sobre a linha travada; `UPDATE tasks SET status = $novo WHERE id = $1 AND status = $lido RETURNING …` (CAS na mesma transação); zero linhas devolve `DomainError('conflict', 'Task status changed concurrently')` (409; inalcançável com o lock em `postgres-pool`, mantido como defesa; alcançável no modo de cliente único, §8); `appendAudit` do evento no mesmo cliente; `COMMIT`. Qualquer erro faz `ROLLBACK` e propaga. Sem migration: as colunas existem e `FOR UPDATE` usa o privilégio `UPDATE` que o runtime já tem.
- Os métodos de classe `updateStatus`, `updateTaskStatus`, `list`, `listTasks` e `listApprovals` ficam, sem mudança de comportamento, para os chamadores existentes. A rota deixa de usá-los, e `updateStatus` sai de `RuntimePersistence.tasks` (§3.3), para não restar caminho de escrita sem CAS na composição da API.

### 3.2 Persistência: listas paginadas (F23)

```ts
interface TaskListQuery { limit: number; offset: number; statuses?: readonly TaskStatus[] }
interface ApprovalListQuery { limit: number; offset: number; statuses?: readonly ApprovalStatus[] }
interface TaskPage { items: TaskRecord[]; pageInfo: PageInfo }          // PageInfo de schema.ts
interface ApprovalPage { items: ApprovalRequestRecord[]; pageInfo: PageInfo }
TaskRepository.listPage(tenantId | undefined, query): TaskPage
ApprovalRepository.listPage(tenantId | undefined, query): ApprovalPage
PostgresRuntimeRepository.listTaskPage(query, tenantId?): Promise<TaskPage>
PostgresRuntimeRepository.listApprovalPage(query, tenantId?): Promise<ApprovalPage>
```

- Os adapters revalidam a query (defesa em profundidade): `limit` inteiro 1–100, `offset` inteiro 0–10000, status do enum sem repetição; senão `DomainError('invalid_pagination', …)`.
- Ordem estável e igual à atual: `created_at ASC`, desempate `id ASC` no PostgreSQL; ordem de inserção na memória.
- `pageInfo = { limit, offset, total, hasNextPage: offset + items.length < total }`, onde `total` conta os itens do tenant que passam no filtro.
- PostgreSQL: uma instrução, para `total` e página saírem do mesmo snapshot e `total` existir mesmo com página vazia: `SELECT counted.total, page.* FROM (SELECT COUNT(*)::integer AS total … filtro) counted LEFT JOIN LATERAL (SELECT … filtro ORDER BY created_at, id LIMIT $l OFFSET $o) page ON true ORDER BY page.created_at, page.id`; a ordem externa garante a ordem pelo SQL, não pelo plano. Filtro de status por `= ANY($n::text[])`. Escopo de tenant pelo mesmo join de hoje.

### 3.3 Composição em `server.ts`

`RuntimePersistence.tasks` ganha `listPage` e `transitionStatusWithAudit` e perde `updateStatus`; `RuntimePersistence.approvals` ganha `listPage`. Memória: os métodos do `TaskRepository`/`ApprovalRepository`. Modo `postgres` (cliente fixo, não produtivo, sem isolamento por requisição): os métodos do `PostgresRuntimeRepository`. Modo `postgres-pool`: `withTenantContext(pool, tenant, client => new PostgresRuntimeRepository(client, { tenantIsolation: true }).<método>(…))`, exatamente o que `TenantScopedPostgresRuntimeRepository.run` faz, com tenant obrigatório (`DomainError('invalid_action', 'Tenant scope is required')` se ausente). Motivo: `tenant-scoped-postgres.ts` está fora do conjunto de escrita desta frente; mover os três métodos para essa classe é refatoração posterior sem mudança de comportamento.

### 3.4 HTTP

- `PATCH /v1/tasks/:taskId/status`: corpo e resposta iguais. O handler valida o corpo e a identidade como hoje e chama só `tasks.transitionStatusWithAudit` com `actorType = identity.role`, `actorId = identity.operatorId` e o `correlationId` da requisição. Códigos: 200; 400 `validation_failed` (status ausente/inválido); 400 `invalid_action` (não encontrada ou transição proibida, inclusive perdedor de corrida); 409 `conflict` (CAS); 500 `internal_error` (falha de audit, sem mudança persistida). Log `task.status_changed` só após commit.
- `GET /v1/tasks` e `GET /v1/approvals`: query `limit` (padrão 25, 1–100), `offset` (padrão 0, 0–10000) e `status` opcional, uma lista separada por vírgula de valores do enum do recurso (tasks: `open,in_progress,done,canceled`; approvals: `pending,approved,rejected,expired,assumed`), sem repetição. Limite e deslocamento reutilizam `parsePagination` (erro 400 `invalid_pagination`, mensagem atual). Status vazio, desconhecido, repetido ou parâmetro repetido (`?status=a&status=b`) dá 400 `validation_failed`. Outros parâmetros continuam ignorados, como em `/v1/conversations`. Autorização e tenant iguais aos atuais.
- Resposta: `data` continua `Array<TaskRecord>` / `Array<ApprovalRequestRecord>`, limitado pela página; `meta` passa a ser `{ correlationId, pageInfo }`. Cliente que ignora `meta` recebe no máximo 25 itens sem parâmetro, conforme a SPEC0107. Nenhuma outra rota muda.
- Adendo proposto à SPEC0107 (promoção pelo lead): em `GET /v1/tasks` e `GET /v1/approvals`, `limit` 1–100 (padrão 25), `offset` 0–10000, `status` em lista por vírgula, `data` em array e `meta.pageInfo = { limit, offset, total, hasNextPage }`. `/v1/conversations` mantém `data: { items, pageInfo }`; unificar as duas formas exige versão nova, fora deste escopo.

### 3.5 Web — sessão (F12)

- `createTrustedSessionBootstrap(provider).load()`: lê o provider; com token não vazio chama `apiClient.getSession(token)`; sem token chama `apiClient.getSession(null)` (cookie). Não lança 401 local.
- `apiClient.getSession(token)` faz **uma única tentativa** (sem o retry de GET), porque o token é de uso único no servidor. Só `getSession(null)`, que não carrega token, usa o retry normal de GET.
- `apiClient.getSession` não dispara o callback global `onUnauthorized`; o 401 vai só para quem chamou. As demais rotas mantêm o callback (expiração durante uso continua "sessão expirou").
- `WebSessionStatus` ganha `'unavailable'`. No `App.tsx`, a falha da carga é classificada: `ApiRequestError` 401 → `authentication_required` com "Uma sessão confiável é necessária para continuar."; `ApiRequestError` 429, ≥500 ou status 0 (`timeout`, `network_unavailable`) → `unavailable`, rótulo "Sessão indisponível", mensagem "Sessão operacional indisponível. Tente novamente." e botão "Tentar novamente"; qualquer outro erro mantém o comportamento atual ("Não foi possível autenticar a sessão operacional."). Nenhum desses caminhos chama logout; o cookie não é tocado pela web (é `HttpOnly`). O foco vai ao botão de ação também em `unavailable`.

### 3.6 Web — listas e fila (F22, F23)

- Cliente: `listApprovalPage(identity, { statuses, limit, offset })` e `listTaskPage(identity, { statuses, limit, offset })` montam `?status=<a,b>&limit=<n>&offset=<n>` (vírgula literal, valores do enum) e devolvem `{ items, pageInfo }` lendo `meta.pageInfo`; se ausente ou malformado, `pageInfo` é derivado da página (`total = offset + items.length`, `hasNextPage = false`). `listApprovals` e `listTasks` continuam existindo, sem mudança.
- `App.tsx`: a fila de approvals pede `status=pending`, `limit=25`; o painel de tarefas pede `status=open,in_progress`, `limit=25` (pendências, conforme SPEC0114 "acompanhar pendências"). Cada painel guarda seu `offset`; controles com nome por painel ("Página anterior de aprovações"/"Próxima página de aprovações", "… de tarefas") aparecem quando há página anterior ou seguinte, com texto "X–Y de Z". Após decisão, transição ou conflito, recarrega a página atual; se ela vier vazia com `offset > 0`, volta ao `offset` 0. O contador do painel de approvals passa a ser `pageInfo.total` (pendentes no tenant).
- `ApprovalsPanel`: tipo da linha ganha `sessionId?`, `summary?` e `createdAt?` opcionais (o DTO da API sempre os envia; fixtures antigos seguem válidos). Cada linha mostra a ação (como hoje), "Resumo: <summary>" redigido por `redactSensitiveText`, "Caso: <sessionId>", horário quando houver, e risco/status (texto atual `risco / status` preservado). Ausência mostra "Resumo não informado" / "Caso não informado". A linha (`article`) recebe nome acessível por `aria-labelledby` (ação, caso e resumo), anunciado na entrada. Os botões mantêm o nome acessível atual (testes e E2E existentes dependem dele) e ganham `aria-describedby` apontando para resumo e caso da própria linha. Nome de botão duplicado entre linhas continua, mitigado pelo nome da linha e pela descrição; incluir o caso no nome do botão fica como evolução. Quando a conversa do caso está carregada (`openSessionId === sessionId`), a linha tem o botão "Abrir caso <sessionId>", que seleciona essa conversa pelo mesmo caminho do painel de conversas (leitura sujeita à autorização atual do servidor).

## 4. Fora de escopo

- Autorização por caso atribuído (Operator/Approver) nas listas de tarefas e approvals: a SPEC0176 não cobre essas listas; fica como linha nova sob UP91-018 (texto em `ledger-delta.md`). Esta SPEC não amplia nem restringe quem lê.
- `POST /v1/tasks` e `POST /v1/approvals` também criam e depois auditam em dois passos (mesma classe do F16 na criação). Fora do escopo do achado; linha de backlog proposta em `ledger-delta.md` (`createTask` já aceita `onCreated` para a versão atômica).
- Filtros `priority`, `source`, `riskLevel` e `createdBefore` da SPEC0107, ordenação configurável, cursor e índice novo. Paginação por deslocamento até 10000 é o mesmo teto de `/v1/conversations`.
- `expectedStatus` vindo do cliente no `PATCH` (o servidor serializa; o cliente não precisa enviá-lo).
- OIDC/IdP corporativo, store de sessão, rotas de sessão da API (inalteradas), CORS e topologia de produção da SPEC0150.

## 5. Conjunto de escrita (candidata)

`apps/api/src/server.ts` (só rotas de tasks/approvals e suas entradas em `RuntimePersistence`/`createPersistence`, remoção de `assertTaskTransition`); `packages/persistence/src/postgres.ts` (só métodos de tasks/approvals); `packages/persistence/src/repositories/task-repository.ts`; `packages/persistence/src/repositories/approval-repository.ts`; `apps/web/**`; `tests/e2e/rem21-014-qualification.spec.ts`; testes novos em `apps/api/src/__tests__/` e `packages/persistence/src/__tests__/`; `package.json`, só para acrescentar o teste PostgreSQL novo ao script `test:postgres`. Nada em `postgres-outbox.ts`, `operational-execution-postgres.ts`, `effect-journal-postgres.ts`, `tenant-scoped-postgres.ts`, `apps/worker/**`, `packages/harness|orchestrator|model-gateway|channel-gateway/**`, `products/**`, lockfile ou migrations.

Mudança em teste existente só onde ele codifica o comportamento corrigido: mocks de URL exata `/v1/approvals` e `/v1/tasks` dos testes web e das rotas `**/v1/approvals` e `**/v1/tasks` do E2E confiável passam a casar o caminho com a query nova (F23). Asserções não mudam.

## 6. Provas

Cada teste novo falha na base (first red) e passa no BUILD; os controles negativos são mutantes que o teste mata.

| ID  | Achado | Teste                                                                                                                                                                                                                                                                                                                                                                                                                                             | First red na base                                  |
| --- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| P1  | F15    | Rota, memória: sonda do auditor adaptada (barreira no `findById` do port, `done` e `in_progress` concorrentes). Depois do BUILD a barreira fica inerte (a rota não lê em separado), então a asserção independe da ordem: estado final `done`, eventos formam cadeia serial a partir de `open` (cada `fromStatus` igual ao `toStatus` anterior) e, se houve 400, foi `invalid_action`.                                                             | dois 200, final `in_progress`                      |
| P2  | F15    | Rota, PostgreSQL `postgres-pool` com role `NOSUPERUSER NOBYPASSRLS` e os grants do `migrate-job`: terceira conexão trava a linha (`FOR UPDATE`); `done` e `canceled` concorrentes ficam em espera de lock; libera. Espera exatamente um 200, o outro 400 `invalid_action` ou 409 `conflict`, final igual ao vencedor, um evento.                                                                                                                  | dois 200, dois eventos `fromStatus: open`          |
| P3  | F16    | Rota, memória: `AuditRepository.prototype.append` falha uma vez; `PATCH done` dá 500 e a tarefa segue `open`, sem evento.                                                                                                                                                                                                                                                                                                                         | 500 com tarefa `done`                              |
| P4  | F16    | Rota, PostgreSQL (mesma role): trigger sintético `BEFORE INSERT ON audit_events` que falha para `effect = internal_task_state_only`; `PATCH done` dá 500, tarefa `open`, nenhum evento; removido o trigger, o mesmo `PATCH` dá 200 com um evento.                                                                                                                                                                                                 | 500 com tarefa `done`                              |
| P5  | F23    | Rota, memória e PostgreSQL (mesma role): 101 tarefas e 101 approvals (51 decididos), mais uma tarefa de outro tenant que não entra em `total`; `PATCH` na tarefa do outro tenant dá 400. `limit=1&offset=100` devolve 1 item e `pageInfo {1,100,101,false}`; sem query, 25 itens e `hasNextPage`; `status=pending` só pendentes com `total` deles; `limit=101`, `offset=-1`, `status=x`, `status=open,open`, `?status=a&status=b` dão 400.        | 101 itens com `limit=1&offset=100`; sem `pageInfo` |
| P6  | F15/16 | Unidade, memória: `transitionStatusWithAudit` devolve valor síncrono (não `Promise`), rejeita saída de terminal, preserva estado quando o audit lança, e evento igual ao contrato.                                                                                                                                                                                                                                                                | método ausente                                     |
| P7  | F22    | Componente: dois approvals com mesma ação, risco e status e casos/resumos distintos; os dois resumos e casos visíveis; a descrição acessível de cada "Aprovar" contém o seu resumo e caso; clicar o segundo envia o id do segundo; "Abrir caso" seleciona a conversa.                                                                                                                                                                             | resumo e caso ausentes                             |
| P8  | F12    | App com o bootstrap real e provider `() => null`: `fetch` de `/v1/session` sem header de token devolve sessão → "Sessão confiável"; 401 → "Autenticação necessária" + "Uma sessão confiável é necessária…", nunca "expirou"; 503 em todas as tentativas do retry → "Sessão indisponível" e "Tentar novamente" recupera com 200. Com token: 503 → "Sessão indisponível" com exatamente uma requisição `/v1/session` com `x-cvg-operator-token`.    | zero chamadas a `/v1/session`; 401 local           |
| P9  | F12    | E2E confiável (`rem21-014`, três navegadores): sessão criada uma vez com token; nova página do mesmo contexto, sem init script, e `reload` restauram a identidade; nenhuma requisição da página nova nem do reload carrega `x-cvg-operator-token`; o token não está em `window`, `localStorage` nem `sessionStorage`; contexto sem cookie mostra autenticação necessária sem "expirou". First red só se rodado localmente; senão fica com o lead. | "Autenticação necessária" após reload              |

Mutantes mínimos: retirar `FOR UPDATE` e o CAS juntos (P2 vermelho; cada um sozinho deve manter P2 verde, o que é registrado como defesa redundante); publicar a tarefa antes do audit na memória (P3/P6 vermelhos); `COMMIT` antes do audit no PostgreSQL (P4 vermelho); remover `LIMIT` (P5 vermelho); remover `aria-describedby`/resumo (P7 vermelho); restaurar o 401 local em `load()`, o `onUnauthorized` em `getSession` ou o retry com token (P8 vermelho).

## 7. Gates de pronto

- Node 22; `npx prettier --check` nos arquivos tocados; `npm run -s lint`; `npm run -s typecheck`.
- Testes focais P1–P8; suítes `apps/api`, `apps/web` e `packages/persistence`; `test:postgres` relevante (o arquivo novo, `postgres-persistence-mode`, `approval-decision-atomicity-postgres`, `attendance-approval-postgres`, `tenant-isolation`) com PostgreSQL descartável próprio.
- P9 escrito e, se houver Chromium local, executado só nesse spec com servidor próprio nas portas da frente; certificação integrada (`test:e2e`, `certify`) fica com o lead.
- Crítico de código independente (não fork), até duas rodadas.
- Não autoriza deploy, produção, dado real, IdP corporativo nem release.

## 8. Riscos e compatibilidade

- Cliente externo que esperava a coleção inteira passa a receber no máximo 25 itens sem parâmetro. É o comportamento exigido pela SPEC0107; não há consumidor externo conhecido (o smoke de produção só lê status HTTP), e `meta.pageInfo` informa o restante.
- O painel de tarefas deixa de mostrar tarefas terminais (filtro de pendências). Histórico continua na auditoria da sessão e na API com `status=done,canceled`.
- Composição direta com `withTenantContext` em `server.ts` duplica o padrão da classe tenant-scoped; registrada como refatoração posterior (§3.3).
- O perdedor de corrida recebe 400 `invalid_action`, como a mesma transição em sequência; 409 só no CAS, que o lock torna inalcançável em `postgres-pool`.
- **Resíduo do modo `postgres` de cliente único (não produtivo).** Requisições concorrentes compartilham uma conexão: um `BEGIN` concorrente é absorvido pela transação aberta, um `ROLLBACK` de uma requisição pode desfazer escrita de outra e o 409 do CAS é alcançável. É preexistente para `decideApprovalWithAudit` e `transitionTakeover` e passa a valer também para a transição de tarefa. Produção não usa esse modo (`env.ts:91`). Linha de backlog proposta em `ledger-delta.md`: compor o modo sem RLS com pool e conexão por operação, ou retirá-lo.
