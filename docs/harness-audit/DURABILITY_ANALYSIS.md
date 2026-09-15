# Persistence e durability

## Capabilities confirmadas

- PostgreSQL/transactions/RLS e tenant context com cleanup: `packages/persistence/src/tenant-scoped-postgres.ts:69-120`.
- effect journal com operation key, attempt, CAS/revision/fencing/uncertainty: `packages/agent-runtime/src/effect-journal.ts:14-113`; `packages/persistence/src/effect-journal-postgres.ts:151-391`.
- runtime approvals duráveis e CAS: `packages/persistence/src/runtime-approval-store.ts:359-390`.
- outbox com unique idempotency, `SKIP LOCKED`, leases, attempt journal, retry exponencial e DLQ/requeue: `packages/persistence/src/postgres.ts:903-1512`.
- worker com concurrency, heartbeat, lease loss e shutdown release: `apps/worker/src/continuous-worker.ts:107-158`, `:239-657`.
- FORCE RLS e role preflight para tabelas críticas.

## Matriz de sobrevivência

| Falha                            | Estado                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------- |
| process/worker restart           | STRONG/PARTIAL: outbox/approval/journal/context sobrevivem; audit/telemetry/result arrays não  |
| provider/network                 | IMPLEMENTED no Model Gateway: timeout/retry/fallback/circuit                                   |
| duplicate webhook/outbox enqueue | IMPLEMENTED com idempotency tenant-scoped                                                      |
| duplicate high-risk effect       | PARTIAL/STRONG no kernel com journal/fencing; handlers at-least-once ainda exigem idempotência |
| DB serialization/deadlock        | bounded retry no adapter do journal                                                            |
| effect confirmado + outbox falha | GAP: repair wiring não comprovado                                                              |

Defeito de contrato observado: no direct-ALLOW path, tool pode ter concluído e uma falha posterior de outbox retorna `denied/outbox_failed` sem `effectConfirmed/outboxPending` (`packages/agent-runtime/src/runtime.ts:970-1005`); o caminho approved preserva `executed/outbox_pending` (`:1591-1645`).

Sweeps reutilizáveis existem, mas o entrypoint os marca desabilitados pendente da composição (`apps/worker/src/main.ts:154-178`). Backup/restore, RPO/RTO, soak, capacity e rollback de migration são `NOT_RUN/UNKNOWN` nesta auditoria.

Scores: Persistence **7**, Durability **6**.
