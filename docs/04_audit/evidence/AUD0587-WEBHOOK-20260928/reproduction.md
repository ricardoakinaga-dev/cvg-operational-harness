# Reprodução dos negativos de webhook

Ambiente: Node 22.23.2, fonte limpa `7ef74e7`, PostgreSQL 16.15 descartável em porta própria. Os JSONs `http-probe.json`, `future-replay.json`, `future-replay-pg.json` e `lease-takeover.json` preservam resultados resumidos, não capturas integrais de tráfego. Segredos, IDs, telefone e tenant dos probes são **sintéticos**.

## Timestamp futuro

1. Use `HmacWebhookVerifier`, `createWebhookSignature` e `InMemoryWebhookReplayStore` de `apps/api/src/webhook-security.ts`. Injete o mesmo relógio mutável em verificador e store.
2. Fixe `now = 1_800_000_000_000` ms, `timestampSeconds = floor(now / 1000) + 300`, `eventId = aud0587-future`, canal `whatsapp`, corpo e `rawBody` constantes. Gere a assinatura uma única vez com segredo sintético.
3. `await verifier.verify(input)` retorna `true`. Avance `now` em `301_000` ms sem mudar input/header/assinatura. A segunda chamada também retorna `true`, embora a diferença para o timestamp assinado seja apenas um segundo. Os campos exatos estão em `future-replay.json`.
4. Variante PostgreSQL: crie schema/table sintéticos de `webhook_replay_events` e use `PostgresWebhookReplayStore`. Após a primeira aceitação, marque **somente a linha própria** com `expires_at = CURRENT_TIMESTAMP - INTERVAL '1 second'` para simular a passagem do tempo; avance o relógio injetado em 301 s e repita a mesma chamada. `future-replay-pg.json` registra duas aceitações e uma linha final `committed`. Remova schema e contêiner.

## Takeover de lease durante a rota

1. Crie `webhook_replay_events` em schema PostgreSQL sintético com `event_key` PK, `status`, `expires_at`, `created_at`, `lease_generation` e `lease_token`. Configure `PostgresWebhookReplayStore` no `HmacWebhookVerifier.verifyWithLease` injetado no `buildServer({ durableInbound: true, ... })`.
2. Em `inboundTenantResolver`, faça a **primeira** chamada esperar em uma Promise controlada; registre a entrada no resolver. Envie POST assinado a `/v1/webhooks/channels/whatsapp/messages` com body sintético constante e `eventId = aud0587-lease-event`.
3. Depois que a primeira chamada entrar no resolver, execute apenas na linha própria `UPDATE webhook_replay_events SET created_at = CURRENT_TIMESTAMP - INTERVAL '31 seconds' WHERE event_key = 'webhook:whatsapp:aud0587-lease-event'`.
4. Envie o **mesmo** POST assinado. Antes de liberar a primeira Promise, o segundo pedido entra no resolver e responde 200. Libere a primeira: ela responde 500 pelo commit de lease antigo; linha final `committed`, geração 2. `lease-takeover.json` registra esses fatos. O probe não instrumenta efeitos externos; não conclua que houve duplicação de efeito.
5. Feche Fastify/pool, remova schema e contêiner. A porta própria deve ficar fechada. Não rode contra banco compartilhado ou dados reais.

O teste de 16/16 em `vitest-pg.log` usa `TEST_DATABASE_URL` com esse PostgreSQL descartável; somente o teste de recuperação de lease acessa PostgreSQL real nessa suíte. A sonda HTTP de sete casos usa replay em memória; o takeover acima usa HTTP com PostgreSQL.
