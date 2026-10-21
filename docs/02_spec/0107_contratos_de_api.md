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

### `POST /v1/approvals/:approvalRequestId/decision`

- Caso de uso: aprovar, rejeitar ou assumir.
- Payload: decision, note.
- Resposta: status e decidedAt.
- Erros: approval_not_pending, operator_not_allowed.
- Idempotencia: `approvalRequestId + operatorId + decisionNonce`.
- Regra de concorrencia: somente uma decisao final pode vencer.

### `GET /v1/tasks`

- Caso de uso: listar tarefas internas.
- Filtros: status, priority, source.
- Paginação (SPEC0250, 20/10/2026): `limit` 1–100 (padrão 25), `offset` 0–10000, `status` opcional como lista separada por vírgula de valores distintos do enum do recurso. `data` é array; `meta.pageInfo = { limit, offset, total, hasNextPage }`. Parâmetro inválido: 400 `invalid_pagination` (limite/deslocamento) ou `validation_failed` (status). `/v1/conversations` mantém `data: { items, pageInfo }`; unificar exige versão nova.

### `POST /v1/tasks`

- Caso de uso: criar tarefa interna.
- Payload: sessionId, title, description, priority.
- Idempotencia: `sessionId + source + idempotencyKey`.

### `GET /v1/audit/sessions/:sessionId`

- Caso de uso: auditoria por sessao.
- Resposta: trilha consolidada.
- Autorizacao: Supervisor ou Admin; Operator apenas quando associado ao caso.

## Versionamento

APIs externas devem iniciar em `/v1`. Mudancas incompatíveis exigem nova versao ou adaptador de compatibilidade.
