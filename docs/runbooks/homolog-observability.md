# Runbook — observabilidade da homologação (AUD19-009)

Escopo: ambiente local/sintético/descartável. Produção: `NO_GO`.

## Sinais

| Sinal        | Onde                                  | Saudável                                                      |
| ------------ | ------------------------------------- | ------------------------------------------------------------- |
| Liveness     | `GET /live` → 200                     | sempre 200 com processo no ar; nuncaBillingado por rate limit |
| Readiness    | `GET /ready` → 200/503                | 200 só com probes verdes; 503 com detalhe por probe           |
| Métricas     | `GET /health/metrics`                 | `droppedRouteCount: 0`, `5xx` ~0                              |
| Worker       | `worker.homolog_sweep` no stdout JSON | a cada `CVG_HOMOLOG_SWEEP_INTERVAL_MS`                        |
| Readiness    | `worker.readiness`                    | `ready` só após preflight + health; `not_ready` no shutdown   |
| Claim        | `worker.homolog_process_next`         | somente depois de `worker.readiness=ready`                    |
| Worker saúde | `worker.homolog_unhealthy`            | ausente; se presente, ver DB/fila                             |

## Limiares de alerta (`evaluateHomologAlerts`)

- `probe_failed:*` (critical): qualquer probe `failed` → verificar a
  dependência nomeada (`database`, fila) no corpo do `/ready`.
- `server_error_budget` (critical): `5xx` > 1% com ≥20 requests.
- `client_error_budget` (warning): `4xx` > 20% com ≥20 requests.
- `metrics_cardinality_shedding` (warning): `droppedRouteCount` > 0.

## Exporter composto e SLOs (`REM21-011`)

O caminho local usa `CompositeTelemetry` com buffer bounded e sinks
independentes. Cada evento é redigido antes do fan-out; labels métricas ficam
restritas à allowlist do pacote de observabilidade. A falha de um sink não
lança exceção para API, worker, policy, approval, audit ou readiness. Ela gera
`observability_exporter_degraded` (warning) e deve ser tratada como incidente
de telemetria, não como prova de que o serviço está pronto.

SLOs conceituais avaliados no collector sintético:

- persistência de mensagem p95 ≤ 2s;
- acknowledgement p95 ≤ 10s;
- ações sensíveis fail-closed = 100%;
- duplicidade de ação = 0;
- cobertura de timeline investigável = 100% dos casos aplicáveis.

`slo_breached:<id>` é crítico e exige inspeção antes de ampliar a operação.
Esses números são critérios locais de homologação; não representam retenção,
disponibilidade ou SLO de produção.

### Fault injection do exporter

1. Executar `npm run test:observability:proof` com Node 22. O proof usa somente
   collector sintético, IDs fictícios e um sink que lança deliberadamente.
2. Confirmar no report `certification/rem21-011-observability-proof.json` que
   `exporterFault.status=PASS`, `noThrow=true`, `alerted=true` e
   `readinessIsolation.changedByExporterFailure=false`.
3. Se houver `observability_exporter_degraded`, preservar o buffer local e
   investigar o sink; não reiniciar API/worker em loop e não transformar o
   alerta em bypass de policy/approval.

### Retenção e limites locais

O buffer process-local é bounded e sofre eviction FIFO; não é armazenamento
durável nem mecanismo de retenção. Collector externo, retenção, dashboards,
paging e SLO produtivo permanecem fora do escopo local e exigem gate externo,
owner e signoff.

## Procedimentos

### `/ready` 503 com `/live` 200

1. Ler `checks[]` do corpo: `database`, `queue` ou probe injetada.
2. `database failed`: checar `DATABASE_URL`, `POSTGRES_SCHEMA`, migrations
   (`runPostgresMigrations`), RLS/preflight (`AUD19-005`).
3. Não reiniciar em loop sem causa: o worker registra `homolog_unhealthy`,
   suspende novos claims e só volta a `ready` ao recuperar.

`CVG_HOMOLOG_HEALTH_INTERVAL_MS` é independente de
`CVG_HOMOLOG_SWEEP_INTERVAL_MS`; health não depende de um sweep bem-sucedido.

### Fila crescendo (`queue.pending` alto)

1. Checar workers vivos (`homolog_ready`/`homolog_sweep` recentes).
2. Checar DLQ/terminais (`FAILED_TERMINAL`) e `uncertain` nos sweeps.
3. Carga e restore: ver `AUD19-015`.

### Vazamento de PII/sigilo

Proibido em logs, métricas, traces e auditoria: tokens, segredos, corpos de
mensagem, `senderRef`, `authorization`. Travado por teste
(`homolog-observability.test.ts`); payloads de auditoria passam por
sanitização (`sanitizeAuditEvidencePayload`) e outbox por redação
(`outbox-r6`).

## Exporter

Homologação = JSON lines no stdout (sem exporter externo, sem OTel SDK).
Cada linha tem `event`, `correlationId`/`workerId` e escopo
`synthetic-local-only`. Correlação ponta a ponta: `meta.correlationId` da
resposta == evento de auditoria persistido (prova em
`homolog-correlation-postgres.test.ts`).
