# Phase 4A brownfield reuse map

This map is normative for the Phase 4A implementation. A new abstraction is
allowed only when the existing seam cannot express a conversational concern;
the reason must be recorded in the ADR and task ledger.

## Reuse matrix

| Phase 4A need             | Canonical brownfield symbol                               | Adapter/consumer rule                                                                         | Deliberately not reused                                           |
| ------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Governed action execution | `createOperationalHarness` / `OperationalHarness.execute` | Conversation supplies a validated `RuntimeInput`; it cannot call a capability implementation. | `GovernedAgentRuntime` direct construction from conversation.     |
| Iterative cognition       | `IterativeGovernedRuntime` via the public factory         | One execution per action/goal attempt; state remains in conversation store.                   | A conversation-owned loop or planner.                             |
| Capability inventory      | `CapabilityRegistry`, `CapabilityDescriptor`              | Expose descriptors to interpretation only; exact versions are pinned.                         | Product `PluginRegistry` as a generic authority.                  |
| Policy                    | `PolicyEngine` port in `@cvg/harness-contracts`           | Runtime evaluates every action. Natural language never changes outcome.                       | Policy checks in `DialogueManager`.                               |
| Approval                  | `ApprovalEngine` and `ApprovalExecutionPort`              | Only `approvalId` plus proposal hash/execution binding can resume.                            | “yes”, “ok”, or sentiment as approval.                            |
| External effect fencing   | `EffectJournal` / `JournaledToolRegistry`                 | Reuse operation key and composition fingerprint; response replay is read-only.                | Conversation-local effect journal.                                |
| Context                   | `ContextEngine` / `DefaultContextEngine`                  | Supply bounded observations and structured state.                                             | Transcript concatenation or a second context engine.              |
| Model routing             | `@cvg/model-gateway` `ModelGateway.generate`              | Explicit typed adapter with purpose `ORCHESTRATION`, `RESPONSE`, or `REPAIR`.                 | Direct provider SDK calls.                                        |
| Conversation persistence  | New `ConversationIntelligenceStore` port                  | Memory and PostgreSQL implementations share one contract.                                     | Product-shaped `ConversationRepository` records as generic state. |
| Durable execution links   | `OperationalExecutionStore`                               | Store only `executionId`, result/status and references in a turn.                             | Copying execution rows into conversation tables.                  |
| Message delivery          | Existing outbox/channel effect concepts                   | Use a delivery port with stable `responseId` and idempotency key.                             | Treating delivery as execution success.                           |
| Tenant context            | `TenantId`, `withTenantContext`, existing RLS convention  | Tenant is trusted only from the caller boundary and SQL setting.                              | Body/payload `tenantId` claims.                                   |
| Audit/telemetry           | `AuditSink`, `TelemetrySink`                              | Emit bounded events with fixed labels and no raw message text/IDs in metrics.                 | A second audit ledger in conversation.                            |

## Dependency direction

```text
synthetic consumer/profile
          |
          v
packages/conversation  --->  @cvg/harness  --->  @cvg/harness-contracts
          |                         |
          +----> store/delivery     +----> policy/approval/journal ports
                                      |
                                      +----> @cvg/model-gateway adapter (optional)
```

The reverse dependency is prohibited: `@cvg/harness`, `@cvg/harness-contracts`,
and `@cvg/harness-orchestrator` must compile without `packages/conversation`.
The conversation package must not import `@cvg/agent-core`, `@cvg/platform`,
`@cvg/policy`, `@cvg/tools`, or `@cvg/workflows`.

## Reuse decisions requiring explicit tests

- Removing the conversation package leaves `npm run build:harness` and the
  existing Phase 2/3 tests green.
- A non-conversation `RuntimeInput` still runs through the existing factory.
- A capability descriptor exposed to conversation contains no `execute`
  function and cannot be mutated into one.
- Provider replacement changes only the synthetic result/provider evidence,
  not policy, approval, execution, journal, tenant, or response-verifier
  behavior.
- Delivery retry reuses `responseId` and never invokes a capability again.
