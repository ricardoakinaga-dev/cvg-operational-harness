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

## Versionamento

APIs externas devem iniciar em `/v1`. Mudancas incompatíveis exigem nova versao ou adaptador de compatibilidade.

SPEC0251 (21/10/2026): o código de "não encontrado" nas rotas de tasks e approvals não estava neste contrato; o 400 `invalid_action` de recurso ausente era da implementação. A troca para 404 `not_found` é correção de segurança exigida pela indistinguibilidade entre recurso ausente, de outro tenant e de caso não atribuído, com o único consumidor conhecido (a web) ajustado no mesmo rollout, sem versão nova.
