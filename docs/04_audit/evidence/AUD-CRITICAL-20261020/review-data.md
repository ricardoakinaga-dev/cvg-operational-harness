<!-- Lead: links absolutos da candidata normalizados para paths portáteis; resposta original preservada no runtime privado. -->
**Decision: REJECT for the inspected lane.** Artifact: `3704e3f853e45e9a967dfc07b366eb9c6acb51a5`. Five substantive defects are confirmed by source inspection. Their database reproductions are **NOT_RUN**, reserved for the Lead.

1. **I1-01 — P1: worker startup accepts an unisolated effect journal, permitting cross-tenant recovery writes.** Confidence: high. Q2/Q4.

   Production uses the default [critical-table list](../../../../apps/worker/src/postgres-role-preflight.ts), which omits `effect_journal` and `runtime_approvals`. The additional [kernel preflight](../../../../apps/worker/src/kernel-composition.ts) checks only that both tables can be selected. It does not verify their RLS policies, ownership or write privileges.

   This has a concrete tenant impact: [releaseExpired](../../../../packages/persistence/src/effect-journal-postgres.ts) updates expired journal rows without a tenant predicate, relying entirely on RLS. Every governed turn invokes that [sweep](../../../../packages/agent-runtime/src/runtime.ts).

   **Reproduce:** migrate an isolated database; disable RLS only on `effect_journal`; seed an expired reservation for tenant B; run both worker preflights and a synthetic kernel turn for tenant A. The preflights accept the configuration, and A’s sweep can change B’s reservation to `ABANDONED` or `UNCERTAIN`. Production worker startup depends on migration completion, so an API startup refusal does not protect this worker.

2. **I1-02 — P1: partial audit persistence permanently loses chain records after retry.** Confidence: high. Q4/Q6.

   A turn captures the current in-memory ledger position, executes, then persists only the [new records](../../../../apps/worker/src/kernel-composition.ts). [persistKernelAudit](../../../../apps/worker/src/kernel-composition.ts) inserts records individually through separate repository operations. There is no batch transaction or durable retry cursor.

   If insert 2 fails after insert 1 commits, the remaining records still exist in memory. The next turn starts its slice after those records, so they are never retried. Later persisted records reference missing predecessors. The shipped [chain verifier](../../../../apps/worker/src/kernel-audit-chain.ts) requires contiguous, linked records.

   **Reproduce:** inject one failure on the second kernel audit insert, after the first insert commits; allow the outbox retry or another turn to succeed in the same worker process. Query sequences by ledger ID and run `verifyPersistedKernelAudit`. Expect missing sequences and an invalid chain despite subsequent successful processing. This also obstructs the backup chain verification.

3. **I1-03 — P1: outbox ownership has no attempt fence; a stale process can terminate a newer claim.** Confidence: high. Q4.

   [Claiming](../../../../packages/persistence/src/postgres-outbox.ts) increments `attempts`, but [ack/fail inputs](../../../../packages/persistence/src/outbox.ts) carry no attempt token. [fail](../../../../packages/persistence/src/postgres-outbox.ts) accepts any live processing lease with the same worker ID. Ack uses the same ownership rule.

   Reused IDs are reachable: the production composition supplies a [fixed default worker ID](../../../../deploy/harness/compose.production.yaml).

   **Reproduce:** A claims event E as worker W. After expiry, B reclaims E using W and keeps its handler active. A then calls `fail({eventId:E, workerId:W, terminal:true, ...})`. The stale failure satisfies the ownership check and dead-letters B’s current work. A stale ack can similarly publish its result against B’s claim.

4. **I1-04 — P2: PostgreSQL lease heartbeats never extend the lease.** Confidence: high. Q3/Q4.

   The continuous worker renews only when its adapter exposes `heartbeatClaim`. Its [fallback](../../../../apps/worker/src/continuous-worker.ts) merely reads the event and compares status/owner; it does not even check expiry. The concrete [PostgreSQL adapter](../../../../packages/persistence/src/tenant-scoped-postgres.ts) has no renewal method.

   Consequently, heartbeat metrics can report success while the original 30-second lease expires. Another worker can reclaim the event while its handler remains active, and the original final ack then fails its expiry check.

   **Reproduce:** run a PostgreSQL continuous worker with `leaseMs=1000`, frequent heartbeats and a handler blocked for more than one second. Observe an unchanged `lease_until`; start a second worker and observe reclamation before releasing the first handler. This defeats protection for valid work delayed by database operations.

5. **I1-05 — P2: repeated lease recovery bypasses retry exhaustion in both queues.** Confidence: high. Q3/Q4.

   For the production outbox, [claimNext](../../../../packages/persistence/src/postgres-outbox.ts) reclaims expired processing rows and increments attempts without checking the maximum. Exhaustion is enforced only inside [fail](../../../../packages/persistence/src/postgres-outbox.ts), which a killed worker never reaches.

   The neutral execution store has the corresponding problem: [recoverExpired](../../../../packages/persistence/src/operational-execution-postgres.ts) always returns expired work to `QUEUED`; its [claim exhaustion branch](../../../../packages/persistence/src/operational-execution-postgres.ts) applies only to `FAILED_RETRYABLE`.

   **Reproduce:** repeatedly claim, terminate after claim, expire the lease and recover. Exceed five attempts for the outbox or configured `maxAttempts` for neutral executions. Both remain claimable without the specified terminal/dead-letter outcome. This contradicts the bounded retry requirements in the [durability PRD](../../../../docs/01_prd/0023_rem0539_r2_durability.md) and [Phase 2 PRD](../../../../docs/phase2/PRD.md).

Inspected surfaces included worker entrypoint and production gates, readiness/liveness, continuous consumption and shutdown, neutral execution composition, migration runner and deployment grants, RLS preflight, execution recovery/fencing/cancellation, approval adapters, effect journals, outbox transitions, audit persistence/verifier, worker operations, and backup/restore composition.

| Frozen criterion | Lane result |
|---|---|
| Q2 identity/tenant/approval fail-closed | **FAIL** — I1-01 |
| Q3 bounded runtime | **FAIL** — I1-05; lease limitation I1-04 |
| Q4 durable worker/data | **FAIL** — I1-01 through I1-05 |
| Q6 deploy/health/recovery | Audit recovery defect found; deployment and restore execution **NOT_RUN** |
| Q1/Q5/Q7 | No lane-wide PASS; runtime/integration/current qualification evidence **NOT_RUN** |

Explicit gaps: no database probes, process-kill tests, migration execution, deployment startup, restore drill or test suites were run. Approval/effect crash windows and connection-pool saturation still need executable investigation. Production refusal for the neutral operational worker and suppression of real outbound effects are intentional capability boundaries, not defects.

The 181 tracked lane files had the same before/after fingerprint:

`958a8eedf6e1dca57d9eb62c5eac3284bdb1b67a7538cda10037051f62621278`

HEAD remained unchanged. No edits, descendants, installs, network calls or application/database processes were initiated. An untracked `.audit/` appeared during review; I did not open or modify it.

Independence qualification: findings were derived directly from source, without using prior audit verdicts or builder evidence. Reading the required, unusually large coordination file incidentally exposed historical operational/consolidation status paragraphs; those were excluded from the reasoning. No production authorization is granted.
