# Manifesto de verificação — AUD19-008

- task: `AUD19-008`; onda: `W2`; status: `VERIFIED`.
- runtime: Node `v22.23.2`; PostgreSQL descartável `postgres:16-alpine`
  (container `aud19-pg`, porta 5434, sintético); processos reais via
  `tsx apps/worker/src/main.ts`.
- autorização técnica e operacional: prompt humano de 2026-09-19 (gate `G0`;
  homologação controlada local/sintética; produção `NO_GO` e recusada).

## Entrega

Modo `CVG_WORKER_RUNTIME=operational-harness-homolog`
(`homolog-worker.ts` + despacho em `main.ts` + ramo no gate de startup):

- arming `CVG_HOMOLOG_SYNTHETIC_ONLY=true`, `DATABASE_URL` e não-produção
  obrigatórios (recusa fail-closed); rollback 100% env.
- Composição PG (store/authority/journal) + surface de tools vazia (nenhum
  efeito real possível) + loop contínuo com drain SIGTERM/SIGINT.
- Ticks: `sweepExpiredApprovals` + `reconcileStuckApprovalDecisions`
  (WAITING com decisão → resolve+audit idempotentes, PG-only).

## Provas

| Prova                                                                                                                         | Resultado                 |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| smoke: SIGKILL pós-claim → reclaim → `SUCCEEDED` 1×, attempt 2, journal 0 efeitos, sweep observado, `homolog_ready` sintético | PASS                      |
| recusa sem arming/sem DB                                                                                                      | exit 1 + `homolog_failed` |
| SIGTERM idle → drain exit 0                                                                                                   | PASS                      |
| sem env + `AUD19_PG_REQUIRED=1`                                                                                               | FAIL fechado              |
| regressão: worker memory 75, R3 restart + synthetic-effect PG                                                                 | PASS                      |
| `typecheck` / `lint` / `format:check` / `git diff --check`                                                                    | PASS                      |

## Arquivos desta evidência

`SPEC.md`, `MANIFEST.md` (este), `typecheck.txt`, `lint.txt`,
`format-after.txt`, `diffcheck.txt`, `node-version.txt`.

## Limitações declaradas

- DLQ terminal-exhaustion provada em nível de store (existente); smoke
  prova terminal único sem duplicata.
- Produção `NO_GO` (recusada pelo próprio worker).
