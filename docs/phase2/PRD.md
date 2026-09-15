# Phase 2 AAA-21 — PRD

## Scope

Implement one versioned endpoint, `POST /v1/executions`, plus
`GET /v1/executions/:executionId`, backed by a tenant-scoped execution
repository and queue. The POST boundary validates and persists the request,
returns `202`, and never invokes the runtime inline. A worker consumes the
queued identity and calls the neutral public harness factory.

## Required behavior

1. A canonical request identity includes tenant, execution, correlation,
   trace, agent/version, session/conversation, idempotency key, request hash,
   budget, and synthetic runtime input.
2. Duplicate requests in one tenant with the same idempotency key return the
   original execution. A different payload is an explicit conflict.
3. State transitions are explicit and fail closed. Terminal states cannot be
   resurrected; paused states can be resumed through a controlled repository
   operation.
4. Claims are tenant-scoped and lease/fencing protected. Expired claims are
   recoverable and recorded as recovery events.
5. Worker completion is persisted before the execution is reported as
   succeeded. Retryable failures and uncertain effects are distinct from
   terminal failures.
6. Audit and telemetry are synthetic, causal, and redaction-safe. No result
   claims completion before the durable state transition.
7. Retry policy is explicit and bounded: retryable failures use deterministic
   scheduled backoff and reach terminal/dead-letter state after a configured
   maximum attempt count; approval pauses are not retries.
8. Cancellation is an authenticated, tenant-scoped command. It is proven for
   queued/pre-effect work and fails closed while a claim or runtime is active
   because arbitrary external effects are not safely cancellable in this
   controlled boundary.
9. The neutral worker has a safe default concurrency, honors graceful
   `SIGTERM`/`SIGINT` stop, and closes durable connections only after active
   executions settle or the shutdown controller times out.
10. Execution persistence rejects impossible result/failure/lease/terminal
    combinations in both adapters and in PostgreSQL constraints where the
    database can enforce them.
11. A PostgreSQL operational worker fails closed at startup unless the
    neutral execution schema, approval binding tables, tenant RLS, and
    least-privilege runtime role are verified; queue updates are checked for
    atomic pairing with the execution row.
12. When local infrastructure permits, the worker durability proof uses a
    real child-process boundary: a test-only fault after claim must leave
    durable work recoverable by a newly started worker, with no false terminal
    outcome.
13. Competing worker processes must demonstrate one durable execution/effect
    authority under the injected fault; the fault hook is controlled-only,
    fail-closed in production, and never enables a real external effect.

## R4 controlled vertical-effect repair

The neutral operational worker must expose one explicit, controlled-only
synthetic tool fixture so the public `POST /v1/executions` → durable queue →
worker → `createOperationalHarness` → Runtime V1 path can prove the effect
journal boundary end to end. The default worker composition remains
effect-free. The fixture is enabled only by an explicit controlled environment
flag, rejects production and missing controlled-mode guards, performs no
network or product I/O, and uses the existing journal adapter as its sole
durable effect authority.

The proof must submit a runtime containing an explicit `requestedTool`, show
that policy precedes the tool, persist the synthetic result as `CONFIRMED`,
return it through the status endpoint, and replay the same idempotent request
without a second executor invocation. Existing approval-required, policy-deny,
unknown-effect, audit-failure, telemetry-failure, tenant-isolation, and
process-restart semantics remain in force and cannot be weakened by the
fixture.

The controlled slice also provides bounded `demo:phase2` and
`verify:phase2` commands. They are verification conveniences only: they may
use memory or a disposable database, must fail closed on unsafe configuration,
and do not authorize production or external effects.

## Non-goals

No V2 planner/checkpoint loop, MCP, multi-agent orchestration, external model
provider, real effect, RAG, appointment action, production release, or claim
of exactly-once external execution.

## Acceptance

The frozen bar in [QUALITY_BAR.md](QUALITY_BAR.md) is the acceptance contract.
The final verdict must separately state implementation evidence,
environment-blocked PostgreSQL evidence, baseline debt, and production
readiness.
