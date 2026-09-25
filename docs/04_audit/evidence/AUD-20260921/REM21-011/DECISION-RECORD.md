# REM21-011 — DECISION RECORD

## Decisão

Adotar `CompositeTelemetry` como composição local bounded e um
`CompositeObservationExporter` com sinks independentes. A telemetria será
observável e redigida, mas não será requisito de sucesso para readiness,
policy, approval, audit ou safety.

## Alternativas rejeitadas

- fazer o backend externo ser obrigatório: aumentaria o blast radius e
  contrariaria a regra de degradação segura;
- adicionar labels de tenant, sessão, correlation ou URL: produziria
  cardinalidade e risco de exposição;
- declarar SLO produtivo a partir do collector process-local: confundiria
  prova de homologação com disponibilidade real.

## Consequência

O proof fechará a lacuna local de composição, alertas e SLOs; exporters,
retenção, dashboards e paging reais continuam pendentes de ambiente externo,
owners e signoff. `FINAL_CERT_DEFERRED` e `NO_GO` permanecem.
