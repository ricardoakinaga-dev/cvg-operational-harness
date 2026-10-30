# AUD0625-F12C-SPEC-D9 — fase 1 da SPEC 0282 (sem correção)

Base `claude/aud0625-wave2` @ `8f511551`. Nenhum arquivo de produção foi alterado. Sem push; produção `NO_GO`. A migration proposta é a 0031: a 07 confirmou por mensagem que a 0262 não usa a 0031 na cadeia principal.

- SPEC: `docs/02_spec/0282_channel_effect_retry_after_and_attempt_ceiling.md`, estado `PROPOSED_FOR_HUMAN_T3_REVIEW`.
- Teste: `packages/channel-gateway/src/__tests__/aud0625-f12c-retry.test.ts`, `describe.each` sobre o journal em memória e em arquivo, 3 `it.fails` e 3 controles por journal (12 casos: 6 passam, 6 falham como esperado).
- Falha pela razão do defeito ([red-on-base.txt](red-on-base.txt)): com os `it.fails` trocados por `it`, `expected 'ok' to be 'retry_later'` (Retry-After e teto de 5 minutos) e `expected 9 to be 5` (nove requisições de rede sem teto), nos dois journals. A cobertura PG fica para o BUILD (o teste do journal PG já existe).
