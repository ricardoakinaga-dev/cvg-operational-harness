# Public API

The supported Phase 0/1 entry points are:

```ts
import { createOperationalHarness } from '@cvg/harness'
import type {
  AgentProfile,
  ModelGateway,
  PolicyEngine,
  ApprovalEngine,
  ToolRegistry,
  AuditSink,
  TelemetrySink,
  RuntimeInput
} from '@cvg/harness-contracts'

const harness = createOperationalHarness({
  modelGateway,
  policy,
  approvals,
  tools,
  audit,
  telemetry
})

const result = await harness.run(input)
```

## Export packages

- `@cvg/harness-contracts`: neutral types and ports.
- `@cvg/harness-orchestrator`: `SinglePassOrchestrator` and `NoopOrchestrator`.
- `@cvg/harness`: `createOperationalHarness` and
  `SinglePassGovernedRuntime`.

`OperationalHarness` exposes only `run` and `execute` over the runtime port.
Consumers do not mount internal runtime classes or access provider-specific
objects through the public result.
The factory always constructs the governed single-pass runtime; it has no
arbitrary runtime override that could bypass policy, approval, audit, or
telemetry.

## Safety behavior

An explicit tool request is resolved from the registry, evaluated by policy,
then sent to approval when either policy or the tool requires it. A denied,
pending, handed-off, failed, or unrecordable operation returns a typed stop
reason. The model gateway is the only model boundary; it cannot directly
execute a tool.

Identifiers are branded at compile time, while the demo uses synthetic values.
The API does not authorize real clinical, financial, scheduling, or record
actions.
