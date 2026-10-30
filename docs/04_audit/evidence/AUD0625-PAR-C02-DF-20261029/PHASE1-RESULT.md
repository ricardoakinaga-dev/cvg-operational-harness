# PAR-C02, fase 1 — resultado

Task `AUD0625-PAR-C02-SPEC-DF-20261029`, Claude DF (Opus), 29/10/2026. Só SPEC e testes RED. Sem BUILD e sem recibo T3 ainda. Produção `NO_GO`.

- SPEC: [0285](../../../02_spec/0285_model_gateway_attempt_usage_and_request_pressure.md), `PROPOSED_FOR_HUMAN_T3_REVIEW`.
- Base: `claude/aud0625-par-m01-d9` @ `248655dbad74` (M01 aprovado pelo DF).
- Teste: `packages/model-gateway/src/__tests__/aud0625-par-c02-pressure.test.ts`, com 3 controles que passam e 4 alvos `it.fails`.
- O motivo de cada alvo foi conferido rodando os `it.fails` como `it` (tabela da SPEC §9).
- Repro da lacuna principal: com a tentativa 1 cortada depois de um delta e a tentativa 2 concluída, o log foi `model.call.started:1 → model.retry.scheduled:2 → model.call.started:2 → model.call.completed:2`, sem `model.call.failed:1`, enquanto o medidor tinha `unreportedRequests = 1`.
