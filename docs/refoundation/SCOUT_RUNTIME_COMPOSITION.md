# Scout evidence — runtime composition trace

Source: independent read-only scout `Volta`, completed 2026-09-13. No files,
runtime state, `.gauntlet` state, tests, databases, or external services were
modified or executed by the scout.

## Observed path

```text
API buildServer
  -> receiveInboundMessage / atomic inbound + outbox persistence
  -> PostgreSQL worker claim and handler
  -> published-agent or opt-in governed-kernel branch
  -> model / policy / controlled capability path
  -> completion transaction and outbound response
```

The current API composition root is the 5,533-line `buildServer` in
`apps/api/src/server.ts`. The current worker path is selected in
`apps/worker/src/main.ts` and `apps/worker/src/postgres-controlled.ts`. The
strongest reusable inner factory is `createGovernedRuntimeComposition` in
`packages/agent-runtime/src/composition.ts`, but it is worker-specific and
accepts concrete implementation types.

## Boundary findings

- No single neutral public composition root existed before
  `packages/harness/src/createOperationalHarness.ts`.
- `CVG_WORKER_RUNTIME` and `WORKFLOW_COORDINATOR` have different defaults,
  exposing a current dual-runtime/dual-selection seam.
- The active tool path is platform plugin infrastructure; `@cvg/tools` is not
  the public API/worker path.
- Kernel audit and telemetry are process-local in the current worker
  composition; the integration test does not prove durable cross-process
  continuity.
- Several current imports cross package manifest/project-reference boundaries,
  including persistence → agent-runtime and worker → runtime/model/policy/
  observability.

## Preserved invariants

Tenant context cleanup, atomic inbound/idempotency/outbox persistence,
at-least-once outbox acknowledgement, immutable session agent/version binding,
approval/effect journaling, no automatic replay of `UNCERTAIN` effects,
controlled `externalEffects: false`, and trace/correlation propagation remain
explicit brownfield invariants. This refoundation does not replace them.

## Discriminating follow-up checks

The scout recommended real PostgreSQL bridge and worker composition checks,
negative kernel-envelope behavior, restart/idempotency proof, and durable audit
assertions as later operational work. Those checks remain outside this
controlled neutral package slice and outside the production AAA-21 claim.
