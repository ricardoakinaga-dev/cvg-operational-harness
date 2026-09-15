# AAA-21 durable schema

Migration: `packages/persistence/migrations/0016_operational_execution_spine.sql`.

| Table | Key | Purpose | Invariants |
| --- | --- | --- | --- |
| `operational_executions` | `(tenant_id, id)`; unique `(tenant_id, idempotency_key)` | canonical identity, lifecycle, result/failure | active lease required for CLAIMED/RUNNING; completed timestamp required for terminal state |
| `operational_execution_outbox` | `(tenant_id, execution_id)` | durable handoff paired with execution | foreign key; processing requires owner and lease |
| `operational_execution_events` | `(tenant_id, sequence)` | append-only causal transitions | foreign key; tenant scoped; attempt captured |
| `operational_effect_journal` | `(tenant_id, operation_key)` | synthetic effect reservation/replay/reconciliation | one semantic operation per tenant; `UNCERTAIN` is explicit |

All four tables enable and force row-level security with `cvg.tenant_id`.
Public table privileges are revoked. Indexes cover tenant/state lookup, queue
claim, event lookup, and journal state.

## Relations

`operational_executions 1—1 operational_execution_outbox` and
`operational_executions 1—N operational_execution_events` are tenant-qualified
foreign-key relations. The effect journal is related by the tenant and
operation key carried through the runtime tool context; it deliberately does
not claim an external provider transaction.

## Migration safety

The migration is additive and uses `IF NOT EXISTS`/policy replacement. It does
not drop or rewrite existing Secretary tables. Rollback must be a separately
reviewed migration; no destructive rollback is executed by this Phase 2 round.
