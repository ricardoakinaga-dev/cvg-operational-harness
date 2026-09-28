# AUD-0587 — borda HMAC e replay do webhook no candidato isolado

- Data: 28/09/2026 UTC.
- Escopo: SHA limpo `7ef74e7f4fd2b1141e416b85c7337f119e1333ab`, Node 22.23.2, PostgreSQL 16.15 descartável próprio e dados sintéticos; sem provider/canal externo, push ou deploy. `apps/api/src/webhook-security.ts` tem os mesmos bytes no root atual e no candidato isolado.
- [Prova, hashes de fonte e limpeza](evidence/AUD0587-WEBHOOK-20260928/proof.json), [log 16/16](evidence/AUD0587-WEBHOOK-20260928/vitest-pg.log), [sonda HTTP](evidence/AUD0587-WEBHOOK-20260928/http-probe.json), [negativo de timestamp futuro em memória](evidence/AUD0587-WEBHOOK-20260928/future-replay.json), [repetição no PostgreSQL](evidence/AUD0587-WEBHOOK-20260928/future-replay-pg.json) e [negativo de takeover PostgreSQL](evidence/AUD0587-WEBHOOK-20260928/lease-takeover.json).
- Veredito: `HMAC_INPUT_BOUNDARY_PASS / TWO_REPLAY_P1_REPRODUCED / PRODUCTION_NO_GO`.
- [Críticas I1/I2](evidence/AUD0587-WEBHOOK-20260928/I2-review.md) aceitaram a auditoria local; [passos de reprodução](evidence/AUD0587-WEBHOOK-20260928/reproduction.md) preservados.

## O que os testes existentes provam

Executei `apps/api/src/__tests__/webhook-security.test.ts` com `TEST_DATABASE_URL` apontando para PostgreSQL 16.15 próprio em `127.0.0.1:55497`: **16/16 PASS, zero skip**. Apenas um dos 16 testes usa PostgreSQL real; os demais usam memória ou mocks. O conjunto cobre assinatura válida/replay imediato, corpo JSON bruto, troca de canal, timestamp vencido, headers ausentes, segredo anterior, falha do replay store, release após falha downstream, reserva/commit/release PostgreSQL, retomada de lease vencido e concorrência de oito reservas.

Uma sonda HTTP via Fastify `app.inject()` usou HMAC/replay e resolver de tenant em memória. Headers HMAC ausentes, assinatura alterada, timestamp vencido e canal trocado deram **401 antes de resolver tenant**. A requisição válida deu **200** e chamou o resolver uma vez. Replay imediato e payload adulterado deram **401** sem nova chamada. A fonte chama `webhookVerifier` antes de `resolveInboundTenant` e `receiveInboundMessage`; portanto, não encontrei bypass direto de HMAC nesse fluxo.

## Dois negativos fora da suíte

1. **P1 — replay com timestamp futuro.** Com relógio controlado, uma assinatura para `t+300 s` foi aceita em `t`. O store gravou expiração em `t+300 s`, calculada da primeira recepção. Em `t+301 s`, a mesma assinatura permaneceu válida pela janela simétrica do timestamp e foi aceita de novo após o registro expirar. [Reprodução](evidence/AUD0587-WEBHOOK-20260928/future-replay.json): `first_accepted=true`, `second_accepted=true`, assinatura inalterada. O negativo foi repetido com `PostgresWebhookReplayStore`: após a primeira aceitação, avancei o relógio do verificador em 301 s e envelheci a linha PostgreSQL até expirar; a mesma assinatura foi aceita de novo. Essa segunda sonda simula passagem do tempo sem esperar cinco minutos reais. A deduplicação posterior da mensagem pode limitar efeitos, mas não torna a barreira de replay correta.
2. **P1 — takeover durante processamento.** Em HTTP sintético com `PostgresWebhookReplayStore`, a primeira requisição ficou retida no resolver após reservar o evento. Envelheci a linha de lease em 31 s dentro do schema descartável; a segunda requisição **passou pelo verificador e entrou no resolver antes da primeira terminar**. A segunda respondeu 200, a primeira 500 porque seu commit perdeu o fencing, e a linha final ficou `committed`, geração 2. [Reprodução](evidence/AUD0587-WEBHOOK-20260928/lease-takeover.json). O teste comprova sobreposição de processamento e falha da primeira resposta; **não comprova efeito externo duplicado**. Como o commit do lease ocorre após recepção, outbox/runtime e auditoria no handler, o efeito precisa de prova de idempotência/fencing na mesma transação antes de declarar a rota segura sob demora acima de 30 s.

A revisão estática também apontou P2 condicional: HMAC cobre canal e corpo, mas não headers consultados por um resolver de tenant injetado. A configuração produtiva atual usa `INBOUND_TENANT_ID` fixo; uma futura integração que selecione tenant por header não assinado precisa ser proibida ou vinculada à assinatura.

## Limpeza, limites e próximo gate

O teste PostgreSQL criou e removeu schema sintético. Após os três runs próprios, a consulta retornou **zero schemas residuais**; contêiner e porta 55497 foram removidos. Worktree isolado permaneceu limpo.

A sonda HTTP inicial usa replay em memória; a suíte PostgreSQL e o negativo de takeover exercitam store PostgreSQL em escopos distintos. O conjunto não valida TLS, proxy/WAF, segredo em cofre, provider/canal real, staging corporativo, SHA root sob PR-L04 ou CI do mesmo digest. O modo `NODE_ENV=test` possui exceção deliberada sem verificador para fixtures; o boot produtivo deve continuar negando esse modo.

Registrar task/SPEC T3 para fechar ambos os P1 com negativos de relógio e concorrência, além do vínculo de tenant. Após aprovação humana, corrigir e reexecutar no SHA integrado, inclusive HTTP+PostgreSQL no mesmo entrypoint de staging HTTPS. O preflight de constraints segue na [SPEC 0158](../02_spec/0158_webhook_fencing_constraint_preflight.md). Produção `NO_GO` até cumprir também as 13 condições de [0354](../03_build/0354_production_executive_plan_2026-09-26.md).
