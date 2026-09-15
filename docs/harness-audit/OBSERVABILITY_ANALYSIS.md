# Observability analysis

## Capabilities

- hash-chained audit ledger: `packages/observability/src/audit-ledger.ts:7-27`, `:61-143`;
- bounded telemetry/spans/metrics/logs: `telemetry.ts:60-288`;
- adapter OpenTelemetry: `otel.ts:23-111`;
- trace context: `trace-context.ts:4-73`;
- runtime root/child spans + chain verification: `packages/agent-runtime/src/runtime.ts:371-470`;
- model events com attempts/tokens/cost/latency: `packages/model-gateway/src/gateway.ts:301-414`;
- worker JSON logs redigidos: `apps/worker/src/worker-observability.ts:23-76`.

## Reconstrução de execução

Uma execução do kernel pode ser reconstruída dentro do processo. Não há prova de uma trilha durável e joinável através de API→worker→model→tool→outbox→response após restart. A composição PostgreSQL instancia `InMemoryTelemetry` e `HashChainedAuditLedger` (`apps/worker/src/kernel-composition.ts:306-322`); nenhum uso de `OpenTelemetryTelemetry` foi encontrado no composition root.

Logs e metrics cobrem retries/lag/leases, mas request metrics também são process-local. O ledger não é um sink durável e não prova imutabilidade externa.

Scores: Audit **6/10**, Observability **5/10**. Pré-requisito de extração: `AuditSink` obrigatório e durável, trace propagation interprocesso, redaction, causal link e teste que reconstrói uma jornada completa.
