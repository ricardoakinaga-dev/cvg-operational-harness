# PAR-M02 — DISCOVERY (D9, 29/10/2026)

Base `claude/aud0625-par-c02-df` @ `2aad7d0b7`, worktree `aud0625-parm02-d9`, branch `claude/aud0625-par-m02-d9`.

1. `gateway.ts` `#runCandidate`: `providerRequest` é um literal por tentativa; `input` vem de `renderGovernedInput`
   (congelado), mas `metadata` é `request.metadata` (objeto do chamador, copiado pelo zod uma vez por `generate`) e
   `promptBinding` é `rendered.binding` (um objeto por `generate`, compartilhado entre tentativas e candidatos).
2. `#assertPromptStillApproved(request, rendered.binding)` roda a cada tentativa com o mesmo `binding`; uma gravação do
   adaptador nele quebra a tentativa seguinte (envenenamento), e a de `metadata` chega ao fallback.
3. Os adaptadores reais (`openai-compatible`, `ollama`, `deterministic`) chamam `verifyPromptBinding` (SPEC 0267), que
   cobre `input`, não o resto da requisição.
4. `model.call.started` tem `projectedInputTokens` (SPEC 0285); nenhum campo identifica o pedido enviado.
5. Provas RED: `aud0625-par-m02-frozen-request.test.ts` (3 controles, 6 `it.fails`). Cada `it.fails` foi rodado como `it`
   e falha pelo motivo declarado (objeto não congelado; retry/fallback recebem valores reescritos ou são recusados pelo
   próprio gateway; campos `requestSha256`/`requestBytes`/`frozenRequest` ausentes).
6. Reaproveita: forma `literal-v1` de `prompt-binding.ts`; eventos por tentativa da C02.
