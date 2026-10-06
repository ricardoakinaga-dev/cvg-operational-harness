# Public API

This reference describes the current workspace exports and composition of the neutral Operational Harness. The Phase 0/1 single-pass API remains available; the public factory also selects a configured iterative runtime. This is an implementation reference, not approval of a production consumer or of the proposed UP91 contracts.

## Workspace entry points

Use package root imports rather than private source paths. These packages are private workspaces in this repository; this reference does not imply a published npm distribution.

| Package                     | Current public surface                                                                                                                                                                    | Role                                                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@cvg/harness-contracts`    | Branded identities, runtime input/result, budgets, tool/capability descriptors, policy/approval/audit/telemetry ports, iterative decisions and execution contracts                        | Neutral data and ports; `packages/contracts` is its source directory                                              |
| `@cvg/harness-orchestrator` | `SinglePassOrchestrator`, `NoopOrchestrator`, `HybridOrchestrator`, `ScriptedOrchestrator`, `StaticOrchestrator`, `ScriptedModelGateway`                                                  | Decision sources and synthetic adapters; decisions do not directly execute tools                                  |
| `@cvg/harness`              | `createOperationalHarness`, `OperationalHarnessOptions`, capability composition, effect journal, execution spine, context/completion, step store, trajectory and governed runtime classes | Canonical consumer composition and supporting implementations                                                     |
| `@cvg/agent-runtime`        | `GovernedAgentRuntime`, its turn contracts, effect journal, proposal/composition utilities and `ApprovalAuthority` type                                                                   | A distinct turn-oriented kernel; its contracts and journal are not interchangeable with the neutral harness ports |

Authoritative exports: [harness](../../packages/harness/src/index.ts), [contracts](../../packages/contracts/src/index.ts), [orchestrator](../../packages/orchestrator/src/index.ts) and [agent runtime](../../packages/agent-runtime/src/index.ts). The extracted `runtime-effect-recovery`, `runtime-approval-request`, `runtime-effect-identity` and `runtime-execution-context` modules are internal, not new barrel exports.

## Compose a consumer

[`createOperationalHarness`](../../packages/harness/src/createOperationalHarness.ts) accepts model, policy, approval, audit and telemetry ports plus exactly one explicit registry:

- `tools`: the compatibility `ToolRegistry` port. An effect journal is optional on this existing path.
- `capabilities`: the explicit `CapabilityRegistry` port. This path requires an explicit `effectJournal`.

Supplying both registries, neither registry, or capabilities without a journal throws during construction. `createCapabilityRegistry` and `composeCapabilities` build the immutable capability composition; its fingerprint is calculated by the registry, not supplied as an arbitrary factory option. The factory resolves the capability adapter and applies the journal wrapper when configured.

The returned `OperationalHarness` exposes:

| Member                   | Behavior                                                                          |
| ------------------------ | --------------------------------------------------------------------------------- |
| `run(input)`             | Delegates to the same execution path as `execute`                                 |
| `execute(input)`         | Resolves and invokes the configured governed profile, returning `RuntimeResult`   |
| `resolveProfile(input)`  | Resolves `input.runtimeProfile`, then `defaultRuntimeProfile`, then `single_pass` |
| `capabilityFingerprint?` | Present for capability composition; binds the descriptor composition              |

The factory constructs the single-pass runtime and constructs the iterative runtime only when **both** `iterativeOrchestrator` and `stepStore` are supplied. An iterative request without that configuration returns `STATE_CONFLICT` with zero steps, model calls and tool calls. Optional context, knowledge and completion ports feed the configured iterative runtime; supplying those ports alone does not select that runtime. The factory has no arbitrary runtime-class override.

The runtime classes remain exported for compatibility and lower-level composition. Consumer integrations should use the factory to preserve the registry/profile selection path. A factory call by itself is not evidence that every adapter satisfies durable approval, policy, tenant isolation or production requirements.

## Input, result and durable identity

[`RuntimeInput`](../../packages/contracts/src/contracts.ts:169) supplies an agent profile/version, tenant, conversation/session/correlation/trace identities, user message, context/state snapshots and an explicit execution budget. The optional `requestedTool` contains the registered tool identity/version, input and operation key.

The durable worker derives `executionId` and `resume` from its execution record. Public request bodies must not manufacture those fields. A capability-based durable execution must carry the composition fingerprint captured with the execution. A missing fingerprint on a durable capability execution, or a supplied fingerprint different from the current composition, returns `STATE_CONFLICT` before runtime dispatch with zero model/tool calls. Non-durable capability inputs receive the factory's fingerprint.

[`RuntimeResult`](../../packages/contracts/src/contracts.ts:199) contains response text, typed stop reason, step/model/tool counters, usage and optional approval/tool result. Inspect `stopReason`, not only the response string. `APPROVAL_REQUIRED`, `POLICY_DENIED`, `HUMAN_TAKEOVER`, `STATE_CONFLICT` and failures represent different outcomes. A successful return does not imply a real provider, channel, clinical or financial action was authorized.

Identifiers are branded at compile time. Type assertions used for synthetic identifiers in examples are not runtime validation or authentication. The serving boundary must establish trusted tenant/operator identity and the execution root must provide durable bindings.

## Synthetic smoke example

This complete example uses public imports, an empty tool registry and a deterministic `NoopOrchestrator`. It makes no model/provider/tool call, has no real channel or knowledge source, and keeps audit/telemetry in local arrays. The deny ports are fixtures, not production policy or approval implementations.

The assertions check the successful single-pass path, profile selection and denial of an unconfigured iterative profile. The example is compatible with the repository's Node 22 and TypeScript workspace configuration. Copy the block into a `.mts` file under this checkout and run it with `node_modules/.bin/tsx --tsconfig tsconfig.base.json <file.mts>` after installing the repository's dependencies. Typecheck it with a strict `noEmit` project extending `tsconfig.base.json` and listing that file; TSX execution alone does not check types.

```ts
import assert from 'node:assert/strict'
import { createOperationalHarness } from '@cvg/harness'
import { NoopOrchestrator } from '@cvg/harness-orchestrator'
import type {
  AuditEvent,
  RuntimeInput,
  TelemetryEvent
} from '@cvg/harness-contracts'

const observed = { model: 0, policy: 0, approval: 0 }
const auditEvents: AuditEvent[] = []
const telemetryEvents: TelemetryEvent[] = []
const harness = createOperationalHarness({
  orchestrator: new NoopOrchestrator(),
  tools: { list: () => [], resolve: () => undefined },
  modelGateway: {
    async complete() {
      observed.model += 1
      throw new Error('The synthetic example must not call a model')
    }
  },
  policy: {
    async evaluate() {
      observed.policy += 1
      return {
        outcome: 'DENY',
        reason: 'Synthetic smoke only',
        policyVersion: 'synthetic-v1'
      }
    }
  },
  approvals: {
    async request() {
      observed.approval += 1
      return { status: 'DENIED', reason: 'Synthetic smoke only' }
    }
  },
  audit: {
    async append(event) {
      auditEvents.push(event)
    }
  },
  telemetry: {
    record(event) {
      telemetryEvents.push(event)
    }
  }
})
const now = '2026-09-30T00:00:00.000Z'
const input: RuntimeInput = {
  agent: {
    id: 'agent.synthetic.public-api' as RuntimeInput['agent']['id'],
    version: 'synthetic-v1' as RuntimeInput['agent']['version'],
    objective: 'Exercise the public composition without effects',
    instructions: ['Synthetic smoke only'],
    skills: [],
    tools: [],
    policies: []
  },
  tenantId: 'tenant.synthetic.public-api' as RuntimeInput['tenantId'],
  conversationId: 'conversation.synthetic' as RuntimeInput['conversationId'],
  sessionId: 'session.synthetic' as RuntimeInput['sessionId'],
  correlationId: 'correlation.synthetic' as RuntimeInput['correlationId'],
  traceId: 'trace.synthetic' as RuntimeInput['traceId'],
  userMessage: 'Synthetic smoke',
  context: { values: {}, sourceIds: [], capturedAt: now },
  state: { version: 1, values: {}, updatedAt: now },
  budget: {
    maxSteps: 1,
    maxModelCalls: 0,
    maxToolCalls: 0,
    maxDurationMs: 5_000,
    maxCostUsd: 0,
    maxTokens: 0
  }
}
assert.equal(harness.resolveProfile(input), 'single_pass')
const result = await harness.run(input)
assert.equal(result.stopReason, 'COMPLETED')
assert.equal(result.response, 'Acknowledged.')
assert.equal(result.modelCalls, 0)
assert.equal(result.toolCalls, 0)
const iterativeInput: RuntimeInput = { ...input, runtimeProfile: 'iterative' }
assert.equal(harness.resolveProfile(iterativeInput), 'iterative')
const unconfigured = await harness.execute(iterativeInput)
assert.equal(unconfigured.stopReason, 'STATE_CONFLICT')
assert.equal(unconfigured.steps, 0)
assert.equal(unconfigured.modelCalls, 0)
assert.equal(unconfigured.toolCalls, 0)
assert.deepEqual(observed, { model: 0, policy: 0, approval: 0 })
assert.ok(auditEvents.length > 0)
assert.ok(telemetryEvents.length > 0)
console.log(
  JSON.stringify({
    singlePass: result.stopReason,
    iterative: unconfigured.stopReason,
    modelCalls: observed.model,
    toolCalls: result.toolCalls + unconfigured.toolCalls,
    auditEvents: auditEvents.length,
    telemetryEvents: telemetryEvents.length
  })
)
```

For an actual iterative composition, supply an `IterativeOrchestrator` and an `ExecutionStepStore`; `InMemoryExecutionStepStore` and `ScriptedOrchestrator` support synthetic exercises. They are not PostgreSQL durability evidence. [The existing runtime selection corpus](../../packages/harness/src/__tests__/runtime-selection.test.ts) exercises both configured profiles through the same factory. Integrations needing durable execution must use the appropriate persistence adapters and verify the complete API/worker path.

## Governance and current limits

Tool decisions resolve a registry entry, run policy and request approval when required by policy or the tool. The model gateway is the model boundary; an orchestrator decision cannot directly call a tool implementation. A configured journal records supported effect outcomes; indeterminate outcomes require reconciliation rather than an unsupported promise of exactly-once external delivery.

The current neutral `ApprovalEngine.execution` port remains optional, and current policy inputs can bypass mandatory risk floors. The factory and its exports do **not** prove mandatory sensitive lifecycle admission in every composition. Those material gaps remain open under [UP91-012/014](../03_build/0364_program_backlog_2026-09-30.md#up91-012), with [SPEC0167](../02_spec/0167_policy_prompt_approval_knowledge_audit.md) pending explicit T3 review. This example exercises no sensitive tool and does not demonstrate those pending fixes.

Context, response provenance, per-attempt budget accounting, approved prompt binding, knowledge revocation and audit/checkpoint V2 described in [SPEC0166](../02_spec/0166_governed_context_response_budget.md) and SPEC0167 are proposals, not additional current API guarantees. Do not implement against the proposed contracts as if they were exported and approved.

[The current architecture guide](CURRENT_IMPLEMENTATION_2026-09-29.md), [operational glossary](GLOSSARY.md), [roadmap](../03_build/0363_program_roadmap_2026-09-30.md) and [current execution report](../04_audit/evidence/UP91-EXEC-20260930/round3-report.md) describe the wider system and outstanding qualification. The original Phase 0/1 document is preserved byte-for-byte as a [historical source](../04_audit/evidence/UP91-EXEC-20260930/public-api-doc/PUBLIC_API.before.md.txt). This reference grants no real clinical, financial, scheduling or record action, external effects, release or production approval.
