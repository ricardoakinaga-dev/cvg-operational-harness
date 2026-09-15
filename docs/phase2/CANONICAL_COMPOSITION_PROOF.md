# AAA-21 canonical composition proof

## Claim

The controlled Phase 2 worker consumes a queued execution and invokes the
public `createOperationalHarness(options)` factory. It does not establish a
parallel runtime kernel or call the legacy Secretary composition as its
canonical path.

## Source evidence

- `packages/harness/src/execution-spine.ts`: `OperationalExecutionWorker`
  imports and calls `createOperationalHarness`.
- `apps/worker/src/operational-harness-worker.ts`: controlled worker composition
  supplies deterministic model, policy, approval, audit, and telemetry. Its
  default tool registry is empty; an explicit controlled-only R4 flag adds the
  versioned no-I/O `synthetic.phase2-effect@v1` fixture.
- `apps/worker/src/main.ts`: `CVG_WORKER_RUNTIME=operational-harness` selects
  the controlled worker and production startup is rejected by its factory.

## Test evidence

- `packages/harness/src/__tests__/execution-spine.test.ts`: successful worker
  execution and causal events.
- `apps/api/src/__tests__/execution-spine.test.ts`: HTTP acceptance leaves the
  row queued, then a worker persists the result.
- `apps/worker/src/__tests__/operational-harness-worker.test.ts`: public
  worker composition and production rejection.
- `apps/worker/src/__tests__/operational-harness-synthetic-effect.test.ts` and
  its PostgreSQL integration counterpart: requested-tool selection through the
  public worker, one journal confirmation, idempotent replay, and tenant-scoped
  visibility.
- Architecture/dependency-direction checks pass for the focused run.

This proves the source boundary and controlled synthetic behavior. It is not a
claim that real providers or production worker deployment are ready.
