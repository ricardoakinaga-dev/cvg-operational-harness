# 0268 — SPEC: canais — erro depois de o pedido sair fica UNCERTAIN (AUD0625 F12)

Status: `PROPOSED_FOR_HUMAN_T3_REVIEW`. Trilha T3: muda a semântica de efeito incerto do journal de canais. Delta sobre a SPEC 0201 (journal/lease do gateway de canais) e sobre as classificações de 0248 (limites do corpo/prazo). Sem implementação até a aprovação T3.

## Contexto e recon

- Achado: `docs/04_audit/0625_repository_score_audit_2026-10-28.md` §5 F12 (reproduzido sem rede: duas chamadas da mesma operação com 503 geram 2 tentativas HTTP; o controle 200 gera 1).
- `packages/channel-gateway/src/adapters/evolution.ts:268-273` e `chatwoot.ts:276-281` (`#mapResponse`): `!response.ok` lança `ChannelError('provider_rejected', …, retryable = status >= 500 || status === 429)` **sem** `effectUnknown`.
- `packages/channel-gateway/src/adapters/bounded-body.ts:36-52` (`oversizedResponseError`): mesma regra para corpo grande com status não-2xx.
- `packages/channel-gateway/src/gateway.ts:354-372` (`#handleSendFailure`): `effectUnknown` → `markUncertain` + `effect_uncertain` não retentável; senão `retryable` → `effects.release` (estado volta a PENDING, nova chamada reenvia); senão `fail`.
- Já correto: exceção de transporte/timeout depois da emissão (`evolution.ts:253-259`, `chatwoot.ts:264-267`) é `send_failed` com `effectUnknown: true`.
- O contrato do campo (`errors.ts:23-28`) diz: `effectUnknown` = "a tentativa pode ter chegado ao provider; retry cego proibido". Um 5xx recebido prova que o pedido chegou ao destino; a resposta não prova que o efeito não ocorreu (proxy/gateway 502/504, 500 depois de processar).
- Fora do gateway: `exam-egress.ts` tem o seu próprio tratamento de 503 (testes `pdsh-016-exam-egress.test.ts:265,452`); fica **fora de escopo** e deve ser avaliado em cartão próprio.

## Invariantes

1. Nenhum reenvio automático de operação cujo pedido já saiu e cujo efeito não é provadamente ausente.
2. Rejeição definitiva do destino (4xx exceto 429) continua `FAILED`, sem reenvio; 200 continua `CONFIRMED`; replay não reenvia.
3. Falha antes de o pedido sair (canal desabilitado, URL rejeitada, validação) continua liberando/falhando como hoje.
4. `UNCERTAIN` só sai por reconciliação humana/ator existente (`reconciliation_required`); nenhuma nova via de liberação.

## Mudança proposta

- Status 5xx (inclui o caso de corpo grande com status 5xx) → `ChannelError('provider_rejected', …, retryable=false, { effectUnknown: true })`. O gateway já converte em `effect_uncertain` e `markUncertain`.
- 429 permanece `retryable` sem `effectUnknown`: é recusa explícita do destino antes de processar o pedido, sem efeito (decisão do orquestrador em 28/10; a revisão T3 a confirma).
- Exceção documentada: um adapter só pode declarar 5xx "sem efeito" se a idempotência do destino estiver **comprovada** (campo opt-in `destinationIdempotent` na configuração do adapter, default false). Hoje nenhum adapter comprova; **não implementar o opt-in agora** (YAGNI) — registrar como decisão pendente.
- Atualizar os testes existentes que fixam `retryable: true` para 503 (`channel-gateway.test.ts:343-346`, `aud0621-0248-channel-bounds.test.ts:226-231`) para o novo contrato (`effectUnknown: true`, `retryable: false`).

## Critérios de pronto

- Testes de alvo em `packages/channel-gateway/src/__tests__/aud0625-f12-uncertain-after-send.test.ts` (hoje `it.fails`, para 500/502/503/504 × Evolution/Chatwoot) passam sem `it.fails`; o teste de caracterização "hoje 503 libera" é removido/invertido.
- Controles permanecem verdes: conexão caída → UNCERTAIN; 200 → CONFIRMED sem reenvio; 400 → FAILED sem reenvio; 429 → 2 tentativas.
- `npm run typecheck`, `npm run lint`, `npx vitest run packages/channel-gateway`.
- Runbook de reconciliação menciona 5xx como causa de UNCERTAIN.

## Riscos

- Mais operações ficam em UNCERTAIN durante instabilidade do provider: exigem reconciliação manual (custo operacional) em troca de não duplicar mensagem ao tutor. Monitorar `channel.outbound.uncertain` por código.
- Consumidores que dependiam de `retryable: true` para 5xx precisam tratar `effect_uncertain` (já é o caminho existente para exceções de transporte).
- Sem dado/canal real nesta SPEC; nenhuma mensagem real duplicada foi observada pela auditoria.

## Testes

Ver acima; testes do comportamento-alvo já escritos (`it.fails`) e evidência RED/GREEN em `docs/04_audit/evidence/AUD0625-CHANNEL-CONSOLE-07-20261028/`.
