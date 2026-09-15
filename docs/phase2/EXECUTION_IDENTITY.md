# AAA-21 execution identity

## Boundary

The neutral execution spine accepts exactly one JSON-safe envelope:

```text
tenantId
idempotencyKey
runtime: RuntimeInput
```

`runtime.tenantId` must equal the authenticated tenant scope. The API takes
tenant authority from the authenticated scope when it is available; a body
tenant that disagrees is rejected. Provider credentials, tool functions, and
opaque runtime objects are not accepted in this envelope.

## Canonical identity

The semantic identity is `(tenant_id, idempotency_key)`. The request hash is a
SHA-256 digest of the normalized JSON envelope: object keys are sorted,
undefined properties are omitted, and arrays preserve order. A repeated key
with the same hash returns the original execution. A repeated key with a
different hash is a conflict; it never creates a second execution.

The database migration reinforces this with `UNIQUE (tenant_id,
idempotency_key)`. The in-memory adapter uses the same composite key only for
controlled tests and local development.

## Public response

`POST /v1/executions` returns HTTP `202` with a public execution view and does
not expose the stored request payload. The view contains state, attempt,
lease metadata, result/failure, timestamps, and the request hash. `GET
/v1/executions/:executionId` is tenant scoped and returns not-found across a
tenant boundary, avoiding an IDOR oracle.

## Lifecycle identity

The execution ID is stable across retries and recovery. The attempt number is
incremented at claim time. A worker lease is identified by `(tenant,
execution, worker, lease_until)` and is checked before heartbeat or an active
transition. Terminal state is final. An uncertain external effect is not
represented as successful merely because the worker process stopped.

## Evidence and limits

- Contract and HTTP tests: `packages/harness/src/__tests__/execution-spine.test.ts`
  and `apps/api/src/__tests__/execution-spine.test.ts`.
- SQL authority: `packages/persistence/migrations/0016_operational_execution_spine.sql`.
- PostgreSQL concurrency and restart evidence is not available in this
  environment; this document does not claim physical durability or exactly-once
  external execution.
