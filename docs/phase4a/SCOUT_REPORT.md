# Phase 4A discovery — brownfield scout report

- Task: `CVG-PHASE4A-CONVERSATIONAL-INTELLIGENCE` / `AAA-4A`
- Observed: 2026-09-15
- Scope: controlled synthetic consumers only; production remains `NO_GO`.
- Discovery status: complete for planning; implementation remains gated by
  `PHASE_4_HANDOFF=VERIFIED` and the CVG PRD/SPEC gates.

## Current seams

| Concern                                                                     | Existing authority                                                                                                                                  | Reuse decision                                                                                                                                        |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime V1/V2, budgets, policy, approvals, effect journal, audit, telemetry | `packages/harness/src/createOperationalHarness.ts`, `runtime.ts`, `iterative-runtime.ts`, `effect-journal.ts`                                       | Consume through the public `OperationalHarness`/`HarnessRuntime` ports. Do not copy or wrap policy, approval, execution, or effect state.             |
| Capability composition                                                      | `packages/harness/src/capability-boundary.ts` and `@cvg/harness-contracts`                                                                          | Register synthetic capabilities through the existing descriptor/implementation boundary. Conversation interprets and plans; the Harness executes.     |
| Context assembly                                                            | `packages/harness/src/context-engine.ts`                                                                                                            | Pass bounded conversation state and observations into the existing `ContextEngine`; no second context engine.                                         |
| Structured runtime decisions                                                | `packages/contracts/src/execution-v2.ts` and `packages/orchestrator/src/hybrid-orchestrator.ts`                                                     | Use `LoopDecision` as the execution plan boundary. Dialogue decisions are translated to runtime input, never directly executed.                       |
| Model calls                                                                 | `packages/model-gateway/src/gateway.ts`, `contracts.ts`, `prompt-registry.ts`                                                                       | Use a typed interpreter adapter over the model gateway. Rules-first fast paths remain available without a model.                                      |
| Durable execution                                                           | `packages/persistence/src/operational-execution-postgres.ts`, `operational-step-postgres.ts` and migrations `0016–0019`                             | Link a conversation turn to an existing execution id. Conversation persistence never becomes a second execution spine.                                |
| Existing inbound/outbox                                                     | `packages/agent-core/src/commands/receive-inbound-message.ts`, `packages/persistence/src/outbox.ts`, `apps/worker/src/jobs/process-outbox-event.ts` | Preserve for legacy product paths. The generic package exposes an adapter port and uses a synthetic delivery sink in Phase 4A.                        |
| Existing conversation repository                                            | `packages/persistence/src/repositories/conversation-repository.ts` and `schema.ts`                                                                  | Do not extend product-shaped records with generic dialogue semantics. A separate conversation-intelligence store is required.                         |
| PostgreSQL tenant discipline                                                | `packages/persistence/src/tenant-scoped-postgres.ts`, migration `0001_tenant_isolation.sql`                                                         | Reuse the same `cvg.tenant_id` session setting, RLS, quarantine/fail-closed conventions, and checked-out transaction client.                          |
| Web surface                                                                 | `apps/web` and existing Playwright visual shell                                                                                                     | No new UI is required for the controlled Phase 4A slice. Design QA is recorded as not applicable; any future UI must use the existing visual QA gate. |

## Architectural risks found

1. The repository has both legacy product-shaped `agent-core` flows and the
   neutral Phase 3/4 Harness. Importing `agent-core` or `platform` from the
   generic conversation package would leak Secretary/veterinary semantics and
   create a second orchestration path.
2. The model-gateway contract (`generate`) and Harness contract (`complete`)
   are intentionally different. The adapter must make the purpose,
   prompt-version, data classification, budget, and structured output explicit;
   it must not cast one interface to the other.
3. Delivery is a separate effect from execution. A response may be persisted
   while delivery is pending; a failed delivery must not rerun a confirmed
   capability execution.
4. Conversation state is not the transcript. Checkpoints need bounded,
   structured state, profile/version binding, and a digest; transcript pages
   are read-only context input.
5. Natural-language agreement is not an approval. Only a proposal-bound,
   authenticated approval resume may enter the existing approval engine.

## Proposed write boundaries

- `packages/conversation/`: generic contracts, interpreter, dialogue manager,
  response verification/composition, in-memory store, delivery and synthetic
  adapters; no product imports and no direct executable tool access.
- `packages/persistence/migrations/0020_conversation_intelligence.sql` and a
  persistence adapter: durable state, turns, messages, response outbox and
  tenant RLS; no new execution or approval authority.
- `examples/phase4a/`: synthetic service-desk and knowledge-assistant
  profiles, capabilities, deterministic fixtures and demo scenario runner.
- `tests/phase4a/` or package tests: public contract, golden conversations,
  adversarial corpus, concurrency and failure proofs.
- `docs/phase4a/evidence/`: candidate-bound evidence only after source and
  tests exist; it is never a substitute for executable proof.

## Discovery conclusion

The requested layer is feasible as an optional package above the Harness. The
safe route is to keep the core neutral, make conversation a consumer of the
public Harness contract, and isolate product-specific legacy paths. No source
implementation is authorized while the Phase 4 handoff remains blocked.
