# Harness overview

The CVG Operational Harness is the neutral layer between reusable agent
profiles and product adapters.

```text
Product
  -> Agent Profile
  -> Skills / Tool requirements
  -> Harness Contracts
  -> Runtime / Orchestrator
  -> Policy / Approval / Audit / Observability ports
  -> Capability and adapter implementations
  -> External systems (only outside this core)
```

## Implemented Phase 0/1 seam

- `@cvg/harness-contracts` contains branded identifiers, runtime inputs and
  results, budgets, stop reasons, tool/skill/model/policy/approval/audit/
  telemetry/state/knowledge/channel ports.
- `@cvg/harness-orchestrator` contains deterministic `SinglePassOrchestrator`
  and `NoopOrchestrator` implementations. They receive tool descriptors,
  choose a next action, and never execute an effect.
- `@cvg/harness` contains `SinglePassGovernedRuntime` and the public
  `createOperationalHarness` factory. The runtime enforces
  policy → approval → tool execution.
- `examples/basic-agent` proves a mock model response, echo tool, policy,
  audit, and telemetry without Secretary or external systems.

The runtime deliberately executes one bounded decision. `RETRIEVE`, `VERIFY`,
and future loop behavior have contract-level vocabulary but no autonomous
implementation in this phase.

## Boundary rules

Contracts import no framework, database, provider SDK, or product package.
Runtime consumers inject ports; the factory does not mount Fastify, open a
PostgreSQL connection, choose a channel, or read credentials. A product may
implement a port, but the neutral harness cannot import that product back.

Policy is authorization, not registry lookup. Audit records governed outcomes;
telemetry records operational measurements. They are separate ports even when a
deployment persists both through the same infrastructure.
