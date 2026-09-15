# AAA-21 architecture

## Before

The repository had a neutral public harness factory and a governed Runtime V1,
but no neutral durable HTTP-to-worker execution spine. Existing Secretary
inbound/outbox and worker composition remained a compatibility lane and could
not serve as proof of the canonical Phase 2 path.

## After

```text
authenticated client
        |
        v
API: parse + tenant scope + idempotency hash
        |
        v
execution authority + outbox/queue + causal events
        |
        v
worker: claim / lease / fencing / recovery
        |
        v
createOperationalHarness(options).execute(RuntimeInput)
        |
        +--> policy --> durable approval (pause if pending) --> reservation/confirmation --> journaled tool
        +--> deterministic model / orchestrator in controlled mode
        +--> audit + telemetry ports
        |
        v
persisted result or classified failure
```

`packages/harness` owns the neutral contract. `apps/api` and `apps/worker` are
composition adapters. `packages/persistence` owns PostgreSQL storage. The
worker does not import the legacy `createGovernedRuntimeComposition` path.

## Authority boundaries

- The execution row is the identity/state authority.
- The outbox/queue row is the handoff authority.
- The lease owner is the processing authority only while its lease is valid.
- The effect journal is the replay/reconciliation authority for a tool
  operation, never a claim of external exactly-once execution.
- The terminal execution event may carry the buffered runtime audit payload;
  it is committed with the state transition before the external audit sink is
  flushed.
- Policy and approval remain before an effect. Approval identity is linked to
  the execution row; approval reservation/confirmation and the effect journal
  both fail closed on ambiguous outcomes.

## R2 lifecycle and failure boundaries

The queue is finite rather than a retry loop: claim increments the execution
attempt, a retryable failure is scheduled with bounded deterministic backoff,
and the store atomically dead-letters the execution at `maxAttempts`.
Cancellation is a command on the execution authority. It only changes states
that are known to be before an active effect; active claims are rejected so an
external provider cannot be mistaken for a cancellable local task. The
worker's stop flag prevents additional claims and lets the shared shutdown
controller await the current lease before closing resources.

## Controlled limitations

The neutral worker uses a deterministic model and synthetic controlled tools;
the production composition remains guarded. The isolated PostgreSQL catalog
and least-privilege operational-role proof establish the live adapter/RLS
boundary at D3. External audit/telemetry sink integration and production
provider/tool certification remain outside this controlled slice.

## R3 process and fault boundary

The R3 extension composes a test-only fault injector at the operational worker
entrypoint. It is never read by the API, persistence adapter, Runtime V1, or a
production boot. Its only enabled point terminates a synthetic child after a
committed claim, making durable lease recovery observable. A restarted child
re-enters through the same preflight, claim, public harness, and
terminal-transition path. Competing children share only the isolated
PostgreSQL authority; they do not share in-memory execution state. The
allowlisted fault point requires explicit controlled mode and fails closed for
production or unknown values.
