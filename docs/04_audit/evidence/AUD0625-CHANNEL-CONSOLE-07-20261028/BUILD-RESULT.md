# AUD0625-CHANNEL-BUILD-07-20261028 — resultado

Estado da SPEC 0268: **IMPLEMENTED_LOCAL** (BUILD T3 local e sintético, autorizado em `USER-DECISIONS-20261028/human-decisions-2.json`). O arquivo da SPEC não foi alterado, porque o recibo está vinculado ao sha256 `1c3f2397…9992`; este registro substitui a nota de estado na SPEC.

Mudança: `statusEffectOptions()` em `adapters/bounded-body.ts`; `evolution.ts`, `chatwoot.ts` e o ramo de corpo grande de `oversizedResponseError` passam 5xx como `retryable:false, effectUnknown:true` (o gateway grava UNCERTAIN e lança `effect_uncertain`); 429 continua `retryable:true`.

Testes: os 8 `it.fails` viraram `it`; a caracterização "503 gera 2 tentativas" foi invertida (1 tentativa, UNCERTAIN). Dois testes que fixavam `retryable:true` para 503 foram atualizados para `retryable:false, effectUnknown:true`: `channel-gateway.test.ts` (Evolution 503) e `aud0621-0248-channel-bounds.test.ts` (503 com corpo grande). Justificativa: o contrato antigo permitia reenvio cego após 5xx; a SPEC 0268 o proíbe. Os controles (conexão caída, 200, 400, 429) não mudaram. Runbook: `docs/runbooks/staging-incident-response.md` (linha de entrega incerta) cita 5xx.

Gates (Node v22.23.2): typecheck exit 0; lint exit 0; vitest packages/channel-gateway 16 arquivos, 185 testes, 0 expected fail; `npm test` completo: 496 arquivos passaram, 28 pulados; 7116 testes passaram, 248 pulados (`build-npm-test.txt`). Não rodados: test:postgres, E2E, Docker.
