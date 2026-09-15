# AAA-21 — Phase 2 durable execution spine

- task: `AAA-21-PHASE2-DURABLE-EXECUTION-SPINE`
- owner: `cvg-operational-harness`
- mode: controlled local BUILD with independent AUDIT
- scope: neutral HTTP → durable execution identity/queue → worker lease →
  public `createOperationalHarness` → governed Runtime V1 → persisted outcome
- authorization: explicit user request; synthetic/local effects only
- entry gate: `TECHNICALLY_SPECIFIED` for this controlled slice, supported by
  `DISCOVERY.md`, `PRD.md`, `SPEC.md`, `PRE_FLIGHT.md`, and `QUALITY_BAR.md`
- implementation rule: no production release, no real data, no real channel,
  no real clinical/financial action, no unrestricted provider/effect
- done: focused tests and credible regression recorded, independent critic
  attempts rejection against candidate evidence, and all remaining gaps are
  classified honestly
- next action: execute the registered repair task below; keep production
  `NO_GO` until the frozen quality bar and fresh critic pass.

## Registered repair task — AAA-21-R4

- objective: close the remaining controlled vertical-path gap by composing an
  explicit synthetic side-effect fixture through the public operational
  worker, persisting its effect journal in PostgreSQL when a database is
  configured, and publishing a reproducible Phase 2 demo/verification entry
  point.
- allowed files: neutral operational worker composition, synthetic-only tool
  fixture, focused API/worker/persistence tests, controlled verification
  scripts, and Phase 2 evidence/ledger documents.
- forbidden: real data/providers/channels/RAG, external effects, production
  enablement, changes to the legacy Secretary path, weakening the frozen
  quality bar, or treating the synthetic journal as an exactly-once claim for
  an external provider.
- acceptance:
  - the default worker remains effect-free; an explicit
    `CVG_WORKER_SYNTHETIC_EFFECT=true` fixture is accepted only in non-
    production with `CVG_WORKER_CONTROLLED_MODE=true`, and invalid or
    production configuration fails closed;
  - a queued `RuntimeInput.requestedTool` is selected by the public
    `createOperationalHarness` path, policy is evaluated before the synthetic
    tool, and the journaled tool registry records one durable `CONFIRMED`
    result without external I/O;
  - controlled HTTP→queue→worker→GET evidence proves one effect authority
    under duplicate submission/replay, with tenant-scoped effect visibility
    and no second synthetic invocation;
  - approval, policy-deny, unknown-effect, audit, and telemetry failure
    semantics remain fail-closed and are covered by existing or new focused
    tests;
  - `npm run demo:phase2` and `npm run verify:phase2` are bounded, synthetic-
    only entry points whose output and exit status distinguish success from a
    missing database, failed gate, or production safety violation;
  - focused, full regression, PostgreSQL (when available), static, build, and
    evidence-integrity checks pass without unexplained new regression.
- gate: `TECHNICALLY_SPECIFIED` under frozen `AAA-21-v1`, with this task
  registered in TASK/PRD/SPEC/runtime/log/backlog before implementation.
- current status: `AUDIT_COMPLETE_CONTROLLED / FINAL_CRITIC_BLOCKED_NO_REPORT`; R4
  synthetic-effect memory and disposable-PostgreSQL vertical proofs, guarded
  demo/verification commands, and regression/static gates passed. The final
  critic returned no report within its bounded window; that limitation is
  recorded separately and production remains `NO_GO`.

## Registered repair task — AAA-21-R1

- objective: bind a tenant-scoped, authenticated durable approval authority to
  `WAITING_APPROVAL`, expose an explicit approval decision/resume boundary, and
  re-run the same immutable execution after restart without bypassing policy,
  proposal binding, or the effect journal.
- allowed files: neutral harness/contracts, approval adapter, API/worker,
  persistence migration only when required, focused tests, and phase2 evidence.
- forbidden: real data/providers/channels/effects, production release, legacy
  Secretary path migration, or weakening the frozen quality bar.
- acceptance: approval identifier is durably linked to the execution;
  duplicate approval is idempotent; cross-tenant and unauthorized decisions
  fail; approved resume requeues only after durable decision and binding
  checks; the worker re-evaluates policy before any effect; focused tests cover
  restart-equivalent resume and no-effect-before-approval.
- gate: `TECHNICALLY_SPECIFIED` inherited from `SPEC.md`, with ADR-014 and
  ADR-018 repaired before implementation; evidence must distinguish controlled
  in-memory proof from live PostgreSQL proof.
- current status: `AUDIT_COMPLETE_CONTROLLED`; the authenticated approval
  adapter, decision/resume route, binding checks, lifecycle reservation, and
  restart-equivalent proof are implemented. PostgreSQL/D3–D5 evidence remains
  a separate required gate, the final candidate-frozen critic is recorded
  separately, and production remains `NO_GO`.

## Registered repair task — AAA-21-R2

- objective: close the remaining implementation gaps required by the frozen
  Phase 2 contract: bounded retry/dead-letter behavior, explicit safe
  cancellation, configurable neutral-worker concurrency with graceful stop,
  application/database execution-state invariants, and operational
  PostgreSQL startup/queue guards.
- allowed files: neutral harness/contracts, API/worker composition, shared
  lifecycle wiring, PostgreSQL adapter/migrations, focused tests, and Phase 2
  evidence/ledgers. Existing Secretary compatibility paths remain out of
  scope.
- forbidden: real data/providers/channels/effects, production release,
  unrestricted worker mode, legacy Secretary migration, or weakening the
  frozen quality bar.
- acceptance:
  - retryable execution attempts are bounded by an explicit safe default and
    end in `FAILED_TERMINAL` with `retry_exhausted`/dead-letter semantics;
  - `POST /v1/executions/:executionId/cancel` and its store boundary permit
    only safe pre-effect cancellation, are tenant/auth scoped, and fail closed
    for `CLAIMED`/`RUNNING` work;
  - neutral worker drain honors `CVG_WORKER_CONCURRENCY`, stops claiming on
    `SIGTERM`/`SIGINT`, waits for active work, and closes its pool without
    publishing a false terminal outcome;
  - a PostgreSQL operational worker runs a neutral schema/RLS/role preflight
    over the execution, queue, event, effect, and approval tables before its
    first claim; every queue mutation checks its affected-row count and every
    active transition requires worker/fence credentials;
  - in-memory and PostgreSQL adapters enforce the same terminal-result,
    failure, approval, lease, and timestamp-shape invariants, with additive
    SQL checks where possible;
  - focused tests cover the new boundaries plus HTTP-to-worker success and
    policy-denied paths, concurrent duplicate submissions, and all new failure
    transitions. Live PostgreSQL/restart/RLS evidence remains explicitly
    `ENVIRONMENT_BLOCKED` when the test authority is unavailable.
- gate: `TECHNICALLY_SPECIFIED` revalidated against the R2 contract below;
  implementation remains controlled-only and requires fresh evidence plus an
  independent critic before any verdict is changed.
- current status: `SUPERSEDED_BY_AAA-21-R3`; implementation and controlled/live
  verification are complete for the R2 slice. Its four fresh candidate-frozen
  critic attempts returned no report, so the historical R2 result was capped at
  `CONDITIONAL_PASS`; production remains `NO_GO`.

## Registered repair task — AAA-21-R3

- objective: close the remaining Phase 2 durability evidence gap by proving a
  process-realistic worker restart with real PostgreSQL and a controlled
  fault-injected recovery under competing workers, without widening the
  external-effect surface.
- allowed files: neutral harness lifecycle hooks, operational worker entrypoint,
  test-only fault-injection adapter, PostgreSQL integration tests, durability
  evidence, and the required runtime/log/backlog records.
- forbidden: real data/providers/channels/effects, staging or production
  databases, production fault-injection configuration, weakening the frozen
  quality bar, or migrating the legacy Secretary path.
- acceptance:
  - a synthetic execution is persisted, claimed by a real child worker process,
    deliberately interrupted at a test-only pre-effect fault point, and later
    reclaimed/completed by a newly started worker;
  - at least two worker processes compete for the same durable queue and the
    execution has one terminal outcome, no lost work, and no duplicate effect
    authority;
  - fault injection is unavailable in `NODE_ENV=production` and requires the
    explicit controlled worker mode;
  - raw execution/event/queue/effect evidence records process identities,
    attempts, lease fencing, recovery, and the synthetic effect count;
  - focused R3 tests, the full PostgreSQL catalog, full regression, and static
    gates pass with no unexplained new regression.
- gate: `TECHNICALLY_SPECIFIED` under the existing frozen `AAA-21-v1` bar;
  implementation may begin only after this task is registered in the task,
  PRD, SPEC, execution log, backlog, and runtime state.
- current status: `AUDIT_COMPLETE_CONTROLLED`; the real child-process fault,
  stale-lease recovery, and competing-worker proof passed against disposable
  PostgreSQL. The final independent critic window remains separately bounded;
  production remains `NO_GO`.
