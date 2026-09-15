# AAA-19 — Limitations (builder evidence)

1. **D01 / AAA-21 composition not implemented (out of scope).** The worker entrypoint does not compose a
   durable `ApprovalEngine`/`ApprovalStore`/`EffectJournalPort`, so periodic sweeps are not enabled in
   `main.ts`; it logs `worker.sweeps_disabled` with `reason=approval_engine_composition_pending_aaa21`.
   Sweeps are fully wired through dependency injection (`createContinuousWorker({ sweeps })` and
   `createPeriodicSweepRunner`) and proven by tests (`worker-sweeps.test.ts`). Enabling them in the
   entrypoint requires the AAA-21/D01 runtime-choice decision.
2. **No production enablement.** `NODE_ENV=production` remains rejected for the controlled PostgreSQL
   worker; the continuous mode requires explicit `CVG_WORKER_RUN_MODE=continuous`,
   `CVG_WORKER_QUEUE_ADAPTER=postgres|postgres-controlled`, `CVG_WORKER_CONTROLLED_MODE=true`,
   `POSTGRES_RLS_ENFORCEMENT=true`, a valid tenant and `DATABASE_URL`. Handlers are synthetic/controlled
   only (`createControlledNoopHandlers`/`createPostgresControlledHandlers`); no provider, channel or
   external effect path is composed.
3. **Workspace package manifests not updated (rule: do not edit `package.json`).** The worker now imports
   `@cvg/agent-runtime`, `@cvg/approval-engine` (type-only) and `@cvg/observability` (type-only +
   `redactFields`) which are not listed in `apps/worker/package.json` dependencies. Resolution works in
   this workspace via `tsconfig.base.json` paths / vitest alias and hoisted `node_modules`; the lead must
   register the dependencies before any standalone install.
4. **Adapter-level lease renewal seam is new; persistence adapters unchanged (no writes allowed).**
   `DurableOutboxAdapter` exposes no renew method, so the heartbeat renews when an adapter implements the
   optional `heartbeatClaim` port; otherwise it re-verifies `processing` + `leaseOwner` and fails closed
   on a lost lease while `leaseMs` bounds handler duration. Both adapters used here take the verification
   path (`OutboxRepository.findById`, `TenantScopedPostgresRuntimeRepository.findOutboxById`); the renewal
   path is proven with a synthetic adapter in `continuous-worker.test.ts`. A renewal endpoint in
   persistence needs an AAA-10/AAA-16 handoff.
5. **Queue lag probe for PostgreSQL is worker-owned read-only SQL.** `createPostgresOutboxBacklogProbe`
   runs a tenant-scoped `SELECT count(*)` through `withTenantContext` (no payload columns, no writes).
   No persistence product file was modified; a persistence-owned depth API would be preferable and can
   replace the probe in a later task.
6. **At-least-once semantics.** Handlers must be idempotent, as required by the R2 outbox contract. On a
   bounded shutdown the event is released via `adapter.fail` and may be retried by another worker while
   the previous handler promise is still resolving; the durable journal records exactly one result
   (proven in memory and PostgreSQL) and the late attempt loses the lease CAS.
7. **Environment limits.** Node 24 local (target Node 22 not re-run); physical durability / fsync,
   mutation testing, Docker image and external gates (D03/D04/D05) remain `NOT_RUN`; production remains
   `NO-GO`. Only the disposable fixture PostgreSQL (port 55432) was used; port 5432 untouched.
8. **Shutdown bound.** `stop({ drainMs })` releases remaining leases after the drain window; a hung
   adapter call (`claimNext`/`ack` never settling) is bounded by `timeoutMs = drainMs + 5s` in the
   shutdown controller, which exits non-zero. In-flight handler promises still resolving after release
   are left to the runtime's idempotent retry contract.
9. **Shared registries untouched.** Per task rules, `package.json`, tracking files and shared
   runtime-state/execution-log/backlog registries were not edited; integration of this evidence into
   those registries belongs to the lead integrator.
