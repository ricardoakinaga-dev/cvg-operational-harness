# Manifesto de verificação — AUD19-009

- task: `AUD19-009`; onda: `W2`; status: `VERIFIED`.
- runtime: Node `v22.23.2`; PostgreSQL descartável `postgres:16-alpine`
  (container `aud19-pg`, porta 5434, sintético).
- autorização: prompt humano de 2026-09-19 (gate `G0`); sem commit/push,
  sem produção, sem exporter externo.

## Entregas

1. Health real: `/ready` 503 + `/live` 200 + `/health` 200 com DB quebrado;
   probe travada limitada; `checkHomologHealth` (DB + fila, timeouts) com
   log `homolog_unhealthy` sem derrubar o loop.
2. Redaction travada: logs + métricas sem token/segredo/corpo/PII.
3. Correlação PG: `meta.correlationId` == 1 evento de auditoria, sem PII.
4. Cardinalidade limitada + alertas puros (`evaluateHomologAlerts`).
5. Runbook `docs/runbooks/homolog-observability.md`.

## Provas

| Prova                                                                                  | Resultado    |
| -------------------------------------------------------------------------------------- | ------------ |
| observabilidade memory (5: /ready×/live, probe lenta, redação, cardinalidade, alertas) | 5/5 PASS     |
| correlação PG (1 evento, sem PII)                                                      | PASS         |
| health worker PG (ok + outage limitada)                                                | 3/3 PASS     |
| sem env + `AUD19_PG_REQUIRED=1`                                                        | FAIL fechado |
| regressão: api memory 57 arq/285, worker memory 75                                     | PASS         |
| `typecheck` / `lint` / `format:check` / `git diff --check`                             | PASS         |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `typecheck.txt`, `lint.txt`,
`format-after.txt`, `diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- Sem OTel SDK/exporter externo (adapter existente inalterado); homologação
  = JSON lines. Produção `NO_GO`.
