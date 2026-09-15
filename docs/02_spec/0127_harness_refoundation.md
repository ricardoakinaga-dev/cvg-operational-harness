# 0127 — SPEC: CVG Operational Harness Phase 0/1

Status: `SPEC_APPROVED_CONTROLLED_BUILD`  
Task: `REF-20260913-PHASE-0-1`  
PRD: [0027_harness_refoundation.md](../01_prd/0027_harness_refoundation.md)

## Target package topology

```text
@cvg/harness-contracts       pure TypeScript contracts, no runtime dependencies
        ↓
@cvg/harness-orchestrator    explicit decision seam and compatibility orchestrator
        ↓
@cvg/harness                 composition root plus governed single-pass runtime
        ↓
products / apps / legacy Secretary adapters
```

The existing packages remain in place. This slice does not claim that the old `@cvg/platform` or `@cvg/agent-runtime` are already neutral; their classification and migration path are documented separately.

## Contracts package

`packages/contracts/src/contracts.ts` defines branded identifiers and interfaces for:

- `AgentId`, `AgentVersion`, `AgentProfile`, `TenantId`, `ConversationId`, `SessionId`, `CorrelationId`, `TraceId`;
- `RuntimeInput`, `RuntimeResult`, `OrchestratorInput`, `OrchestratorDecision`;
- `ToolDefinition`, `ToolInvocation`, `ToolResult`;
- `SkillDefinition`, `SkillRequirement`;
- `PolicyRequest`, `PolicyDecision`, `ApprovalRequest`, `ApprovalDecision`;
- `ModelRequest`, `ModelResult`, `ContextSnapshot`, `StateSnapshot`;
- `StopReason`, `ExecutionBudget`, `AuditEvent`;
- ports for `Orchestrator`, `ModelGateway`, `PolicyEngine`, `ApprovalEngine`, `ToolRegistry`, `AuditSink`, `TelemetrySink`, `KnowledgeProvider`, `MemoryStore` and `HarnessRuntime`;
- channel-neutral `InboundMessage` and `OutboundMessage`.

The package has no dependencies and imports no application, framework, database, provider or Secretary path.

## Runtime and factory

`packages/harness/src/createOperationalHarness.ts` is the only new composition root. It accepts neutral ports, constructs the default compatibility orchestrator when none is supplied, and always creates the governed `SinglePassGovernedRuntime`. There is no arbitrary runtime escape hatch in the public factory. Domain rules are not placed in the factory.

The runtime sequence is:

1. validate budget/identity at the port boundary;
2. request one orchestrator decision;
3. for a response, call the model gateway and return a bounded result;
4. for a tool, evaluate policy, request approval when required, resolve the registry entry, execute once, and record audit/telemetry;
5. return an explicit `StopReason` for approval, denial, failure, cancellation or completion.

No provider SDK is imported by the runtime. No tool executes before policy and approval decisions.

## Orchestrator

`packages/orchestrator` provides `NoopOrchestrator` and `SinglePassOrchestrator`. They are deterministic compatibility seams, not LLM planners and not iterative loops. A future Runtime V2 may replace this decision port without changing governance or tool contracts.

## Compatibility and migration

- Existing runtime, model gateway, approval, policy, audit, outbox, persistence, tenant and channel packages remain unchanged by the new neutral core unless an isolated test requires an export-only change.
- Secretary-specific sources remain product residue. `legacy/secretary-product/` is a documented ownership boundary in this phase; copying or moving existing source is deferred until `AAA-21` and cutover/rollback evidence exist.
- Root identity is updated without mass symbol renaming. Existing UI/preset branding remains an explicit Secretary compatibility surface.

## Verification design

- Typecheck and lint cover new packages.
- `tests/architecture/dependency-direction.test.ts` scans source imports and manifests for forbidden neutral-core dependencies and checks the policy→approval→tool ordering contract.
- `tests/basic-agent.test.ts` exercises factory boot, model response, governed echo tool, audit and telemetry.
- Existing baseline commands are rerun. A baseline failure is not counted as a new failure unless its signature or count worsens.

## Controlled-build constraints

Synthetic data only; no network/provider/channel/IdP/production effects; no schema migration; no real appointments; no clinical, financial or definitive-record action; no RAG answer without an approved institutional source.
