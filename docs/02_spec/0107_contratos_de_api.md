# 0107 — Contratos de API

## Envelope padrao

```json
{
  "success": true,
  "data": {},
  "error": null,
  "meta": {
    "correlationId": "corr_..."
  }
}
```

## Requisitos transversais

- Toda request deve receber ou gerar `correlationId`.
- Comandos mutaveis devem aceitar `Idempotency-Key` ou chave natural documentada.
- Endpoints de painel exigem autenticacao e autorizacao por papel.
- Erros devem usar codigo estavel, mensagem segura e detalhes internos apenas em log server-side.
- Listagens devem ser paginadas com limite maximo definido.
- Payloads externos devem ser validados por schema antes de qualquer efeito colateral.

## Recursos principais

### `POST /v1/webhooks/channels/:channel/messages`

- Caso de uso: receber mensagem.
- Payload: externalMessageId, senderRef, body, receivedAt.
- Resposta: conversationId, sessionId, accepted.
- Erros: duplicate_message, invalid_channel.
- Idempotencia: `channel + externalMessageId`.
- Autorizacao: assinatura/verificacao do provedor de canal quando disponivel.

### `POST /v1/sessions/:sessionId/runs`

- Caso de uso: executar turno do agente.
- Payload: triggerMessageId, autonomyLevel.
- Resposta: agentRunId, nextState, proposedActions.
- Erros: session_not_found, workflow_failed.
- Autorizacao: System ou operador autorizado.
- Regra de seguranca: se policy estiver indisponivel, retornar falha fechada.

### `GET /v1/conversations`

- Caso de uso: painel listar conversas.
- Filtros: status, channel, contactId, updatedAfter.
- Resposta: lista paginada.
- Autorizacao: Operator, Supervisor ou Admin.

### `GET /v1/conversations/:conversationId/timeline`

- Caso de uso: investigar conversa.
- Resposta: mensagens, sessoes, runs, tool calls, approvals e handoffs.

### `GET /v1/approvals`

- Caso de uso: listar fila humana.
- Filtros: status, riskLevel, createdBefore.
- Resposta: approval requests paginados.
- Paginação (SPEC0250, 20/10/2026): `limit` 1–100 (padrão 25), `offset` 0–10000, `status` opcional como lista separada por vírgula de valores distintos do enum do recurso. `data` é array; `meta.pageInfo = { limit, offset, total, hasNextPage }`. Parâmetro inválido: 400 `invalid_pagination` (limite/deslocamento) ou `validation_failed` (status). `/v1/conversations` mantém `data: { items, pageInfo }`; unificar exige versão nova.
- Escopo por caso ([SPEC0251](0251_case_scope_tasks_approvals.md), 21/10/2026): Operator e Approver recebem só itens de casos atribuídos; Supervisor e Admin, o tenant ativo; `pageInfo.total` conta só os itens visíveis. Respostas com `cache-control: no-store`; 503 `configuration_error` quando a autoridade de caso não está disponível.

### `POST /v1/approvals`

- Caso de uso: criar approval request numa sessão.
- Payload: sessionId, proposedAction, summary, riskLevel.
- Autorização: `approval:view`; `audit_evidence_export_review` exige também `audit:view_full`.
- Escopo por caso (SPEC0251): Operator/Approver só na sessão de caso atribuído; Supervisor/Admin no tenant ativo.
- Erros: 404 `not_found` para recurso, sessão ou execução ausente, de outro tenant ou de caso não atribuído a Operator/Approver; 503 quando a autoridade de caso não está disponível. Respostas com `cache-control: no-store`.
- Sessão e principal ([SPEC0262](0262_case_mutation_session_revocation.md), 29/10/2026): o cookie operacional fica ligado à `case_principals.revision` com que foi emitido (campo interno, nunca no DTO nem em header). Em modo `trusted`, toda rota classificada como de operador (todas, exceto probes `/health`, `/live`, `/ready`, `/health/metrics`, o webhook, o bootstrap OIDC, `GET/HEAD /v1/session` e o logout) exige principal atual antes da validação e da matriz de roles: 401 `unauthorized` (limpa o cookie) quando a revisão, a role, o estado ativo ou a versão não conferem; 503 `configuration_error` quando o principal não pode ser lido ou a autoridade não está configurada. Task/aprovação/status/decisão/runtime/journey task rodam a política de caso na mesma unidade da escrita. A invalidação global é uma operação local (`scripts/revoke-operator-sessions.ts`), nunca uma rota HTTP.
- Criação atômica ([SPEC0257](0257_atomic_case_resource_creation.md), 28/10/2026): exige um único header `Idempotency-Key` (8–200 caracteres `[A-Za-z0-9._:-]`; ausente, duplicado, com vírgula/espaço ou fora do formato: 400 `validation_failed` antes de qualquer escrita). Aprovação, evento de criação e recibo são confirmados juntos (PostgreSQL: uma transação; falha antes do COMMIT deixa zero dos três). A mesma chave com o mesmo pedido devolve 200 com o mesmo `id` e o estado atual; a mesma chave com pedido, ator ou sessão diferentes devolve 409 `conflict`. Composição PostgreSQL sem pool transacional exclusiva devolve 503 `configuration_error` antes de escrever. Aprovações anteriores ao corte não têm chave e não são deduplicadas. O console guarda a chave da operação lógica em `sessionStorage` e a reutiliza em retry/recarga.

### `POST /v1/approvals/:approvalRequestId/decision`

- Caso de uso: aprovar, rejeitar ou assumir.
- Payload: decision, note.
- Resposta: status e decidedAt.
- Erros: approval_not_pending, operator_not_allowed; 404 `not_found` para recurso, sessão ou execução ausente, de outro tenant ou de caso não atribuído a Operator/Approver; 503 quando a autoridade de caso não está disponível (SPEC0251, decisões `approved`, `rejected` e `assumed`; Supervisor decide no tenant ativo).
- Idempotencia: `approvalRequestId + operatorId + decisionNonce`.
- Regra de concorrencia: somente uma decisao final pode vencer.

### `POST /v1/executions/:executionId/approvals/:approvalId/decision`

- Caso de uso: decidir a approval de runtime de uma execução em `WAITING_APPROVAL`.
- Payload: decision (`approved` ou `rejected`), note; cabeçalho `Idempotency-Key`.
- Resposta: 202 para `APPROVED`, 200 para `REJECTED`, com a execução projetada para quem chama.
- Escopo por caso (SPEC0251): Approver só em execução vinculada a caso atribuído; Supervisor no tenant ativo.
- Erros: 404 `not_found` para recurso, sessão ou execução ausente, de outro tenant ou de caso não atribuído a Operator/Approver; 503 quando a autoridade de caso não está disponível; 403 de self-approval e 409 de conflito inalterados. Respostas com `cache-control: no-store`.

### `GET /v1/tasks`

- Caso de uso: listar tarefas internas.
- Filtros: status, priority, source.
- Paginação (SPEC0250, 20/10/2026): `limit` 1–100 (padrão 25), `offset` 0–10000, `status` opcional como lista separada por vírgula de valores distintos do enum do recurso. `data` é array; `meta.pageInfo = { limit, offset, total, hasNextPage }`. Parâmetro inválido: 400 `invalid_pagination` (limite/deslocamento) ou `validation_failed` (status). `/v1/conversations` mantém `data: { items, pageInfo }`; unificar exige versão nova.
- Escopo por caso ([SPEC0251](0251_case_scope_tasks_approvals.md), 21/10/2026): Operator e Approver recebem só itens de casos atribuídos; Supervisor e Admin, o tenant ativo; `pageInfo.total` conta só os itens visíveis. Respostas com `cache-control: no-store`; 503 `configuration_error` quando a autoridade de caso não está disponível.

### `POST /v1/tasks`

- Caso de uso: criar tarefa interna.
- Payload: sessionId, title, description, priority.
- Idempotencia: `sessionId + source + idempotencyKey`.
- Erros: 404 `not_found` para recurso, sessão ou execução ausente, de outro tenant ou de caso não atribuído a Operator/Approver; 503 quando a autoridade de caso não está disponível (SPEC0251; um replay idempotente de quem não tem o caso também é 404, sem devolver a tarefa). Respostas com `cache-control: no-store`.
- Criação atômica ([SPEC0257](0257_atomic_case_resource_creation.md), 28/10/2026): a chave do corpo (`idempotencyKey`, 8–200 caracteres) é também a chave do recibo de `/v1/tasks`. Tarefa, evento de criação (`integration_event`, ator autenticado) e recibo são confirmados juntos; replay do mesmo pedido devolve 200 com o mesmo `id`; a mesma chave com ator, sessão, source ou conteúdo diferentes devolve 409 `conflict`; tarefa legada com a mesma chave sem recibo devolve 409 e permanece consultável. Sem pool transacional exclusiva (cliente PostgreSQL compartilhado): 503 `configuration_error` antes de escrever.

### `PATCH /v1/tasks/:taskId/status`

- Caso de uso: mudar o status de uma tarefa interna (Operator, `task:update`).
- Payload: status.
- Escopo por caso (SPEC0251): só em tarefa de caso atribuído.
- Erros: 404 `not_found` para recurso, sessão ou execução ausente, de outro tenant ou de caso não atribuído a Operator/Approver; 503 quando a autoridade de caso não está disponível; transição proibida 400 `invalid_action`; conflito 409. Respostas com `cache-control: no-store`.

### `POST /v1/journeys/tasks`

- Caso de uso: criar tarefa da jornada controlada (Operator, `task:update`).
- Payload: sessionId (1 a 160 caracteres), title, description, priority, idempotencyKey; `sessionId` inválido é 400 `validation_failed`.
- Escopo por caso (SPEC0251): só na sessão de caso atribuído.
- Erros: 404 `not_found` para recurso, sessão ou execução ausente, de outro tenant ou de caso não atribuído a Operator/Approver; 503 quando a autoridade de caso não está disponível. Respostas com `cache-control: no-store`.

### `GET /v1/audit/sessions/:sessionId`

- Caso de uso: auditoria por sessao.
- Resposta: trilha consolidada.
- Autorizacao: Supervisor ou Admin; Operator apenas quando associado ao caso.

### Login OIDC de operador (adendo da SPEC0254, fatia A)

Só existe quando o login OIDC está composto, o que nesta versão só acontece com `NODE_ENV=test` e IdP sintético ([SPEC0254](0254_oidc_login_case_principals.md) §4.11). Fora desse modo, as rotas abaixo não existem (404) e o modo HMAC não muda.

#### `POST /v1/auth/oidc/start`

- Caso de uso: iniciar o login (Authorization Code + PKCE) a partir do console.
- Público, com `Origin` único e igual à origem do console (senão 403 `forbidden`, antes do corpo, sem state nem cookie).
- Payload: ausente ou `{}`; outro corpo é 400 `validation_failed`.
- Resposta: 200 `{ authorizationUrl }` e o cookie pendente (`SameSite=Lax`, 5 min). A `authorizationUrl` leva `state`, `nonce` e `code_challenge` por protocolo; é a única resposta que os contém.
- Erros: 429 `rate_limited` (10 por minuto por IP, com `Retry-After`); 503 `configuration_error` com store de sessão, de state ou limitador indisponível. Respostas com `cache-control: no-store`.

#### `GET /v1/auth/oidc/callback`

- Caso de uso: retorno da navegação do IdP.
- Sucesso: 303 para `<origem do console>/`, com o cookie operacional (`HttpOnly; SameSite=Strict`, validade ≤ 15 min e ≤ `exp` do ID token) e a limpeza do cookie pendente.
- Erros: 401 `unauthorized` "Operator login failed", com o mesmo corpo para toda recusa (o motivo vai só ao log); 429 `rate_limited` (30 por minuto por IP); 503 `configuration_error` com IdP, JWKS, produtor de principal ou store indisponível. Falhas respondem JSON e não redirecionam. Respostas com `cache-control: no-store`.

#### Regras do modo OIDC nas rotas existentes

- `GET /v1/session` só restaura a sessão pelo cookie; sem cookie, 401 "Operator session is missing or expired". Nunca cria sessão.
- Mutação (`POST`, `PUT`, `PATCH`, `DELETE`) com o cookie operacional exige `Origin` único e igual à origem do console; senão 403 `forbidden`, antes de qualquer efeito. Webhook sem cookie não muda.
- O cabeçalho `x-cvg-operator-token` é recusado com 401 `unauthorized`, sem `Set-Cookie`, fora das probes.
- DTOs existentes não mudam.

## Versionamento

APIs externas devem iniciar em `/v1`. Mudancas incompatíveis exigem nova versao ou adaptador de compatibilidade.

SPEC0251 (21/10/2026): o código de "não encontrado" nas rotas de tasks e approvals não estava neste contrato; o 400 `invalid_action` de recurso ausente era da implementação. A troca para 404 `not_found` é correção de segurança exigida pela indistinguibilidade entre recurso ausente, de outro tenant e de caso não atribuído, com o único consumidor conhecido (a web) ajustado no mesmo rollout, sem versão nova.
