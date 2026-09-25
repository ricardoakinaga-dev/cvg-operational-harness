# REM21-011 — DISCOVERY

## Identidade

- task: `REM21-011`;
- achado: `A21-F12`;
- origem: parte de `AUD20-013` e auditoria consolidada
  `0566_comprehensive_repository_audit_2026-09-21.md`;
- autorização: `G21-1`, somente local, sintética e descartável;
- dependências verificadas: `REM21-006` e `REM21-010` concluídas localmente;
- produção: `NO_GO`.

## Baseline observado

O repositório já possui bons blocos locais, mas não uma composição operacional
com uma política explícita de falha:

- `packages/observability` tem `InMemoryTelemetry`, redaction de logs/atributos,
  allowlist de atributos de métricas, spans bounded e um adapter OTel;
- `apps/api/src/request-metrics.ts` limita rotas, métodos e buckets de status,
  mas a exposição HTTP é controlada por ambiente e a métrica é process-local;
- `apps/api/src/homolog-alerts.ts` avalia probes, cardinalidade e orçamento de
  erros, porém não conhece a saúde dos exporters nem os SLOs conceituais;
- `apps/worker/src/worker-observability.ts` escreve JSON lines e redige campos,
  mas o caminho principal ainda não é um exporter composto compartilhado;
- `apps/api/src/server.ts` recebe `runtimeLogger`, porém o entrypoint deixa
  `Fastify({ logger: false })` e não injeta o pacote de observabilidade;
- readiness tem probes bounded e fail-closed para dependências, mas não deve
  depender da disponibilidade de um backend de observabilidade;
- os runbooks documentam thresholds de homologação, sem retenção, SLO
  avaliável, exporter degradado ou fault injection.

## Risco e fronteira

O risco é perder sinal acionável quando um exporter falha, ou transformar
observabilidade em dependência de segurança/readiness. O desenho deve manter um
buffer local bounded, tentar todos os exporters independentemente, redigir
antes do envio e expor degradação como sinal operacional separado. Nenhum
payload, token, identidade, dado clínico ou dado real entra no proof.

## Decisão de discovery

Implementar um contrato pequeno no pacote compartilhado:

1. `CompositeObservationExporter` com collector sintético, health por exporter,
   contagem de falhas e captura fail-safe;
2. `CompositeTelemetry` sobre o `InMemoryTelemetry` existente, preservando
   bounded buffers e os contratos atuais;
3. catálogo/evaluador de SLI/SLO e alertas puros, incluindo degradação do
   exporter, sem alterar o resultado de readiness;
4. composição explícita no API e nos adapters de worker, mantendo a saída JSON
   sintética e sem depender de provider externo;
5. runner e testes de fault injection que provem redaction, cardinalidade,
   alertas, SLOs, collector saudável e exporter quebrado.

## Fora do escopo

Prometheus/OTel Collector real, armazenamento distribuído, retenção produtiva,
dashboards externos, paging real, IdP, providers, canais, RPO/RTO ou qualquer
ação sensível. Esses itens continuam dependentes de `G21-5`, validação externa,
signoff e decisão humana.
