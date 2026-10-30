# PAR-C01 — DISCOVERY (D9, 29/10/2026)

Base `claude/aud0625-par-m02-d9` @ `cf33015eb`; branch `claude/aud0625-par-c01-d9`; worktree `aud0625-parc01-d9`.

1. `packages/harness/src/compaction.ts`: `compactConversation` (heurística v1, 4 chars/token, últimas 4 mensagens,
   excertos de 60 caracteres, resumo ≤ 512) e `createCompactionControl` (`model/before-call`, reescreve
   `call.request.messages`, chama `onCompacted` antes de `next()`); `createSessionCompactionRecorder` grava
   `context/compacted` (PDSH-021). Usado só por `pdsh-025-compaction.test.ts`.
2. Perdas provadas (RED): instruções `system` governadas, fato de paciente, aprovação pendente, obrigação aberta e efeito
   incerto somem do que vai ao modelo; histórico `user` vira mensagem `system`; nada cabendo, ainda envia; turno
   cancelado deixa evento gravado (o `onCompacted` roda antes da checagem de cancelamento do pipeline).
3. `ModelCallPurpose` = ORCHESTRATION | RESPONSE | EVALUATION | REPAIR: não há COMPACTION.
4. C02 (`gateway.ts`): recusa de janela é `ModelGatewayError('invalid_request', 'Request does not fit the context window of
   profile …')`; estimadores diferentes (harness 4 chars; gateway `projectInputTokens`).
5. Sem fonte estruturada de "obrigação": o estado do iterative tem `pendingApprovalId` e `pendingQuestion`; efeitos vivem
   no journal (RESERVED/EFFECT_STARTED/UNCERTAIN, 0225 f0–f5, resultados fora do contexto por referência).
6. Provas RED: `aud0625-par-c01-model-compaction.test.ts` (2 controles, 10 `it.fails`; cada `it.fails` rodado como `it`
   falha pelo motivo declarado).
