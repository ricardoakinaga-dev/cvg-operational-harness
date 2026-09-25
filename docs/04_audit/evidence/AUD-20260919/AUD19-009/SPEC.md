# SPEC — AUD19-009 — Observabilidade e health compostos

- programa: `AUD-20260919-REMEDIATION`; onda: `W2`; dependência: `AUD19-008` ✅.
- aprovação técnica: prompt humano de 2026-09-19; escopo local/sintético,
  reversível, fail-closed. Sem exporter externo (homologação = JSON lines),
  sem OTel SDK (adapter existente inalterado).

## Desenho

1. **API health real**: `/live` estático (inalterado); `/ready` com probes
   reais + timeout (existente) + teste HTTP fim-a-fim: cliente PG quebrado →
   `/ready` 503 com `/live` 200 e `/health` 200; probe travada → 503 limitado.
2. **Worker health real**: `checkHomologHealth(pool, tenantId)` em
   `apps/worker/src/health.ts` (SELECT 1 + profundidade de fila
   `operational_execution_outbox` pendente, timeouts próprios); loop homolog
   registra `worker.homolog_unhealthy` sem derrubar (transitório) — documentado.
3. **Redaction**: trava por teste — entradas do `runtimeLogger` + snapshot de
   métricas nunca contêm token, segredos, corpos ou PII (templates/buckets).
4. **Correlação**: teste PG — `meta.correlationId` da resposta == evento de
   auditoria persistido (sem PII no evento).
5. **Alertas testáveis**: `evaluateHomologAlerts({metrics, probes})` puro em
   `apps/api/src/homolog-alerts.ts` (5xx, 429, probe failed, droppedRoutes) +
   testes; runbook `docs/runbooks/homolog-observability.md` com limiares e
   procedimentos (`/live` vs `/ready`, exporter JSON, DLQ, restore→015).

## Critérios de aceite (congelados)

1. Falha de DB/fila/exporter aparece corretamente (`/ready` 503, `/live` 200).
2. Traces preservam correlação sem PII (prova PG por SQL).
3. Cardinalidade limitada (teto de rotas/buckets travado em teste).
4. `typecheck`, `lint`, `format:check`, `git diff --check` PASS.

## Arquivos (congelados)

- editados: `apps/worker/src/health.ts`, `apps/worker/src/homolog-worker.ts`
  (log unhealthy);
- novos: `apps/api/src/homolog-alerts.ts`,
  `apps/api/src/__tests__/homolog-observability.test.ts`,
  `apps/worker/src/__tests__/homolog-health-postgres.test.ts`,
  `docs/runbooks/homolog-observability.md`.

## Evidência

- `docs/04_audit/evidence/AUD-20260919/AUD19-009/`
