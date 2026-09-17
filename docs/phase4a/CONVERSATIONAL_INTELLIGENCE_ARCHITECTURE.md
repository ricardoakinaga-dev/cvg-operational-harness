# Conversational intelligence architecture — AAA-4A

## Implemented boundary

```text
synthetic consumer or channel adapter
              |
              v
     DefaultConversationService
       |        |          |
       v        v          v
 interpreter  manager   composer/verifier
       |        |          |
       v        v          v
 typed model  DialoguePlan  source-backed draft
 gateway       (no execute)       |
                                  v
                         ConversationHarness port
                                  |
                                  v
                 existing OperationalHarness / Runtime
                 policy -> approval -> capability -> journal

       store: memory or PostgreSQL          delivery: local or outbox adapter
```

`@cvg/conversation` is an optional package above `@cvg/harness`. The existing
Harness and its contracts do not import it. `packages/conversation/src` is
split into contracts, state, interpreter, manager, composer, service, bridge,
handoff, context adapter, memory store, PostgreSQL store, delivery and profile
modules. The package has no direct provider, channel, SQL capability,
approval-engine or effect-journal construction.

The service requires a trusted `ConversationProfileAuthority`. The transport
may name a profile, but its capability and knowledge descriptors are ignored;
the authority resolves the frozen id/version registry entry before acceptance.
Execution claims persist the owner `turnId`, proposal hash, operation key and
execution id. Identical operation keys may coalesce across concurrent turns,
while finalization is fenced to the original owner turn and lease. A goal can
complete while its conversation remains `ACTIVE`; only explicit
`COMPLETED`/`CANCELLED` sessions reject a distinct new turn.
Before a new reservation is inserted, the store proves the accepted state
version or the exact active pending proposal. Immediately before the Harness
call, a second `authorizeExecution` fence locks the session and reservation
together, rechecks that binding and the live lease, and establishes the
ordering point for the effect. A correction that commits first therefore
cannot reach the Harness; a correction after authorization is ordered after
the action permission. A trusted composition-root runtime agent id/version is
also checked by the bridge; a three-way merge keeps the latest durable pending
state when concurrent turns commit.

The `context-adapter.ts` module converts bounded working memory into the
existing neutral `ContextSnapshot` shape. It does not rank, trim or
reinterpret context; those decisions remain with the existing Context Engine
when a runtime composition invokes it. The `handoff.ts` module creates a
bounded continuation packet without credentials, approval material, raw
transcript or hidden reasoning.

## Request lifecycle

1. `acceptTurn` binds the caller-supplied scope and message idempotency key.
2. The rules-first interpreter attempts a deterministic typed interpretation;
   the optional model adapter is bounded and schema-validated.
3. The manager applies state transitions and creates a plan. A plan cannot
   call a capability.
4. Knowledge search runs against the profile's approved source ids. An action
   reserves an execution claim only after its state-version or pending-proposal
   binding is proven, then obtains the store's second effect-authorization
   fence before entering the Harness call.
5. The service validates the returned identity, proposal hash, operation key,
   status, effect flag, evidence and bounded output.
6. The composer verifies the draft, commits the turn with optimistic CAS, and
   delivers with a stable response id. Delivery retry reuses the response and
   never calls the Harness again. PostgreSQL delivery leases serialize active
   sends, but an external sink must deduplicate `deliveryKey` across the
   crash window after send and before the durable `DELIVERED` mark.

The rollback unit is package activation. Existing Harness builds and paths
remain usable if this package and migration are left unused. The current
implementation and test bindings are listed in `CORE_CHANGE_LEDGER.md`.
