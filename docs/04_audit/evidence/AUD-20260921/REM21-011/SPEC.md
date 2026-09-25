# REM21-011 — SPEC aprovada para BUILD local

## Contrato

- contrato: `rem21-011-v1`;
- task: `REM21-011` / `A21-F12`;
- estado: `SPEC_APPROVED_CONTROLLED_BUILD`;
- runtime: Node `22.23.2`;
- escopo: local, sintético, descartável; produção `NO_GO`.

## Componentes congelados

- `packages/observability/src/operational.ts`: exporter composto, collector
  sintético, `CompositeTelemetry`, health e alertas/SLOs;
- `packages/observability/src/index.ts`: export público do contrato;
- `apps/api/src/server.ts`: injeção opcional de `Telemetry` e emissão de logs e
  métricas por composição, sem usar exporter para decidir readiness;
- `apps/api/src/main.ts`: composição local JSON apenas no entrypoint;
- `apps/worker/src/worker-observability.ts` e `apps/worker/src/main.ts`:
  adapter para o contrato composto, preservando JSON lines;
- `scripts/rem21-011-observability-proof.ts`: collector sintético e fault
  injection com report bound ao run/candidate;
- `scripts/rem21-011-observability-proof-contract.mjs`: contrato fail-closed;
- `tests/rem21-011-observability-proof.test.js`: RED/negative/contract tests;
- `docs/runbooks/homolog-observability.md`: thresholds, SLOs, retenção local e
  resposta a exporter degradado.

## Semântica fail-safe

`CompositeObservationExporter.emit()` redige e limita o evento antes de tentar
cada exporter. Exceções de sinks são capturadas por nome e contadas; o método
não propaga a falha. O estado degradado gera alerta, mas não entra na função de
readiness. O buffer local tem limite explícito e eviction FIFO.

## Dados permitidos

Labels são restritas à allowlist existente (`operation`, `channel`, `provider`,
`model`, `profile`, `status`, `decision`, `capability`, `agentProfile`, `risk`,
`outcome`). Correlation/tenant/session podem existir em span/log redigidos, mas
não em labels métricas. Fixtures usam IDs sintéticos fixos.

## Prova e report

O runner deve demonstrar:

1. collector primário recebe log/metric/span seguros;
2. exporter que lança falha não derruba `recordMetric`, `log` ou `end`;
3. health registra a falha e alertas a tornam acionável;
4. limites de buffer e cardinalidade permanecem bounded;
5. SLOs passam com amostra saudável e falham com fault injection;
6. readiness de uma aplicação sintética continua independente do exporter;
7. report `PASS`, `production=false`, `realData=false`, Node 22 e bindings
   exatos de run/candidate.

RPO/RTO, retenção produtiva e disponibilidade externa não serão medidos nem
reivindicados por este proof.
