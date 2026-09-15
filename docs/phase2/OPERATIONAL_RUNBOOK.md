# AAA-21 controlled operational runbook

## Scope

This runbook is for synthetic local development and audit. It must not be used
to confirm, cancel, reschedule, or perform a clinical, financial, channel, or
production action.

## Start

Use the repository’s normal development commands after selecting a supported
Node 22 environment. For the neutral worker set, at minimum:

```text
NODE_ENV=test
CVG_WORKER_RUNTIME=operational-harness
CVG_WORKER_TENANT_ID=<synthetic-tenant>
CVG_WORKER_ID=<synthetic-worker>
```

Without `DATABASE_URL`, the worker uses the process-local store and reports
`memory-operational-execution`; this is controlled-only. With a disposable
PostgreSQL authority, run the migration and the PostgreSQL-specific test gate
before interpreting the worker as durable.

The default worker has no tools and no effect journal. To exercise the R4
vertical fixture, set both guards explicitly in the short-lived controlled
process:

```text
CVG_WORKER_CONTROLLED_MODE=true
CVG_WORKER_SYNTHETIC_EFFECT=true
```

The only exposed fixture is `synthetic.phase2-effect@v1`. It returns a
deterministic synthetic result, performs no network or product I/O, and is
journaled as `RESERVED → EFFECT_STARTED → CONFIRMED`. The fixture is rejected
in production, with a missing controlled-mode guard, or for any unsupported
flag value.

## Inspect

- Submit: `POST /v1/executions` with synthetic `RuntimeInput` and an
  idempotency key.
- Observe: `GET /v1/executions/:executionId` under the same tenant.
- Inspect transition evidence through the store’s event list in controlled
  tests or SQL queries under the tenant context.
- Confirm that a `202` response has no audit/telemetry side effect from an
  inline runtime invocation.
- For the R4 fixture, inspect the tenant-scoped journal by operation key and
  verify one `CONFIRMED` row, one executor observation, and no row visible to a
  different tenant. A duplicate idempotent submission must return
  `created: false` and must not invoke the fixture again.

## Recovery

1. Stop the worker without deleting execution rows.
2. Preserve the execution ID, tenant ID, attempt, lease, and event sequence.
3. Restart a controlled worker with the same tenant and a new worker ID.
4. Allow stale leases to recover; never bypass fencing manually.
5. For `UNCERTAIN`, stop automatic retry and open reconciliation. Do not mark
   success by hand.

## Shutdown and escalation

Keep production disabled. If PostgreSQL is unavailable, record
`ENVIRONMENT_BLOCKED` and do not substitute memory for a durability claim.
Any sensitive action requires approval or handoff; the neutral Phase 2 worker
has no real tool registry. The bounded verification entry points are:

```text
npm run demo:phase2
TEST_DATABASE_URL=<synthetic disposable PostgreSQL URL> npm run verify:phase2
```

The second command exits `2` when the PostgreSQL authority is absent, exits
`1` for a failed gate, and never authorizes production or external effects.
