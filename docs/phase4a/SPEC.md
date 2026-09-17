# Phase 4A technical specification

## 1. Package boundary

Create one optional package, `@cvg/conversation`, under
`packages/conversation`. It may depend on `@cvg/harness-contracts` and
`@cvg/harness`; `@cvg/harness` is a development/test fixture dependency
while runtime code consumes only `@cvg/harness-contracts`. The package must not
be imported by either. Model-gateway, storage and
delivery integrations are ports/adapters. No generic conversation code may
import product-shaped `agent-core`, `platform`, `policy`, `tools`, or
`workflows` packages.

The package is split into these modules:

```text
contracts.ts              public bounded data contracts and ports
state.ts                  transition/invariant logic and state snapshots
interpreter.ts            rules-first interpretation and typed model adapter
dialogue-manager.ts       goal/entity/question planning; no execution access
response-composer.ts      source-aware composition and verifier/repair
conversation-service.ts   turn transaction, Harness bridge, persistence
memory-store.ts           controlled in-memory implementation
postgres-store.ts         SQL adapter over a narrow query/transaction port
delivery.ts               stable response outbox/delivery idempotency
profiles.ts               generic profile factory and synthetic profile ports
```

Profiles also carry a locale and bounded response copy. Generic composition
uses those profile-owned labels and templates, so a consumer cannot leak
reservation-specific wording or internal action verbs into another profile.

## 2. Identity and state

Every turn carries `tenantId`, `conversationId`, `sessionId`, `turnId`,
`messageId`, `correlationId`, and an optional `executionId`. These are separate
identities. The conversation store binds all records to tenant and profile
version before returning them.

Conversation state is one of `ACTIVE`, `WAITING_USER`, `WAITING_APPROVAL`,
`HANDOFF`, `COMPLETED`, or `CANCELLED`. A terminal conversation may accept a
new goal by creating a new turn; it may not resume an old terminal execution.
An execution can be `PENDING`, `RUNNING`, `WAITING_USER`, `WAITING_APPROVAL`,
`SUCCEEDED`, `FAILED`, `CANCELLED`, or `UNCERTAIN` without changing the
conversation state implicitly.

The structured working memory contains only bounded entities, goals,
clarification, pending proposal/approval references, and source references.
Transcript, knowledge evidence, runtime checkpoint, and working memory are
distinct records. No cross-session long-term memory is implemented.

## 3. Interpretation contract

```ts
interface DialogueInterpreter {
  interpret(input: InterpretationInput): Promise<DialogueInterpretation>
}
```

`DialogueInterpretation` is a validated low-authority value: intent (`INFO`,
`COLLECT`, `AVAILABILITY`, `CREATE`, `MODIFY`, `CANCEL`, `KNOWLEDGE`,
`CLARIFY`, `CORRECT`, `SIDE_QUESTION`, `HANDOFF`, `STOP`), confidence,
entities, references, requested capability/action, and untrusted text spans.
It cannot contain policy decisions, approval grants, execution results, or
provider credentials. Invalid structured output becomes a safe clarification
or handoff and causes zero Harness calls.

Rules-first patterns cover explicit confirmations, corrections, ordinal
references and known synthetic fields. Model fallback is optional, uses the
existing Model Gateway through a typed adapter, has purpose/budget metadata,
and treats all transcript/tool/knowledge text as untrusted content.

## 4. Dialogue planning and Harness bridge

`DialogueManager` converts interpretation plus bounded state into a
`DialoguePlan`: respond, ask a minimal/grouped clarification, search approved
knowledge, create a governed proposal, resume a proposal-bound approval,
handoff, or stop. It never receives a tool implementation, policy engine,
approval authority, effect journal, or SQL client.

The service maps an action plan to an existing `RuntimeInput` and calls the
injected `HarnessRuntime`/`OperationalHarness`. The action payload includes
trusted identity from the service boundary and the exact composition
fingerprint; user-supplied tenant/agent/execution fields are ignored. The
service records only the resulting `RuntimeResult` and evidence references.

## 5. Response authority

`ResponseComposer` consumes typed facts from:

- `USER_CONFIRMED` — only facts explicitly confirmed in current conversation;
- `TOOL_RESULT` — validated output from a governed execution;
- `KNOWLEDGE_EVIDENCE` — approved, versioned source evidence;
- `SYSTEM_STATE` — persisted service/session state.

It rejects or repairs claims not supported by those sources. `FAILED`,
`REJECTED`, `UNCERTAIN`, `WAITING_APPROVAL`, and `HANDOFF` outcomes cannot be
rendered as success. A response never authorizes or executes an effect.
Delivery status is separate from execution status and is keyed by stable
`responseId`/`deliveryKey`.

## 6. Persistence model

Migration `0020_conversation_intelligence.sql` adds tenant-scoped tables for
conversation sessions, messages, turns, bounded state snapshots, and response
delivery. Each table has an authoritative `tenant_id`, quarantine flag, RLS
`USING`/`WITH CHECK` policy tied to `cvg.tenant_id`, and no public grants.
Unique keys include tenant and the relevant idempotency key. SQL writes use a
single transaction for message + turn acceptance and `SELECT ... FOR UPDATE`
for versioned state transitions. The adapter validates JSON size and state
version on both read and write.

The SQL adapter is structural and does not make conversation tables mandatory
for non-conversation Harness operation. The disposable PostgreSQL test applies
all existing migrations plus `0020` and proves two-tenant isolation.

## 7. Approval and correction invariants

- Natural-language “yes” only resolves a pending _question_; it never becomes
  an approval decision.
- An approval request is bound to proposal hash, tenant, profile/version,
  action, resource, payload digest, conversation and execution.
- Any correction/reference resolution that changes the proposal invalidates
  the old approval and operation key; the old approval cannot resume the new
  proposal.
- A confirmed journal effect is never rerun to regenerate a response.

## 8. Verification surface

The package must expose deterministic `runTurn`/`inspect` seams for tests but
not executable capability implementations. Required scripts are
`npm run demo:phase4a` and `npm run verify:phase4a`; the latter runs focused
conversation, adversarial, persistence, tenant, concurrency, and conformance
checks and reports all skips/limitations explicitly.
