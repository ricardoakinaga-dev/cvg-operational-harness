# Phase 4A architecture and execution plan

## Frozen direction

Language flexibility belongs above the Harness. Facts come from explicit
sources, actions go through the existing governed Runtime, state is durable
and bounded, and human handoff is a first-class outcome. The package is
optional and replaceable.

```text
channel/input
    -> ConversationService
       -> Interpreter (rules first; optional Model Gateway)
       -> DialogueManager (plan only)
       -> ResponseComposer / verifier
       -> Harness Runtime (policy -> approval -> journal -> capability)
       -> ConversationStore + DeliverySink + audit/telemetry
```

## Work waves

| Wave | Scope                                            | Gate/evidence                                                              |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------- |
| 0    | Phase 4 revalidation and handoff                 | Fresh critic, candidate fingerprint, sentinel, handoff `VERIFIED`.         |
| 1    | Discovery/PRD/SPEC and quality bar               | `SCOUT_REPORT`, `PRD`, `SPEC`, task registration and validation records.   |
| 2    | Neutral contracts, state machine, memory store   | Unit/property/adversarial tests; no SQL or external effect.                |
| 3    | Interpreter, dialogue manager, response verifier | Golden/conversation mutation corpus, model-output fail-closed tests.       |
| 4    | Harness bridge and synthetic capabilities        | Public Runtime path, policy/approval/journal/evidence tests.               |
| 5    | PostgreSQL store, migration and delivery outbox  | Disposable PG durability, RLS, recovery and idempotent delivery tests.     |
| 6    | Synthetic consumers, demos and second profile    | `demo:phase4a`, `verify:phase4a`, conformance test.                        |
| 7    | Audit and Gauntlet                               | Fresh architecture/adversarial/quality critics, sentinel and final report. |

## Quality and recovery controls

- One lead owns shared state; workers have disjoint write scopes.
- Critics are read-only and never write `.gauntlet`, certification, runtime,
  log, backlog or evidence state.
- Every material source/configuration change invalidates the candidate digest
  and all downstream evidence.
- No source code is started before the Phase 4 handoff and the Phase 4A
  discovery/PRD/SPEC gates are recorded.
- A failed persistence or delivery write never triggers a second capability
  effect. Recovery consults durable turn/effect state first.

## Design-director decision

The requested Phase 4A deliverable is a runtime/package and synthetic CLI
demonstration, not a new visual surface. Therefore visual QA is
`NOT_APPLICABLE` for this wave. Existing `apps/web` visual-shell tests remain
part of regression; if a conversational UI is added later, it becomes a
separate design task with screenshots and interaction checks at 375/768/1440.

## Rollback

The rollback unit is package activation: remove the conversation package from
the composition root and retain all existing `@cvg/harness` paths. The
database migration is additive and can be left inert when no conversation
store is configured. No legacy Secretary/Rick behavior is migrated or edited.
