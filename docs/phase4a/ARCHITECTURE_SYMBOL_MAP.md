# Phase 4A architecture symbol map — AAA-4A

This map fixes ownership before BUILD. Names are proposed public seams, not
evidence that the package already exists.

| Symbol / seam                 | Owner                        | May depend on                                                          | Must not own                                              |
| ----------------------------- | ---------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------- |
| `ConversationService`         | `packages/conversation`      | interpreter, dialogue manager, composer, store, delivery, Harness port | policy, approval, effect execution, provider SDK          |
| `DialogueInterpreter`         | `packages/conversation`      | bounded contracts, optional typed Model Gateway adapter                | policy decisions, approvals, execution results            |
| `DialogueManager`             | `packages/conversation`      | interpretation, state snapshot, profile descriptors                    | capability handlers, SQL, Runtime, authorization          |
| `ResponseComposer`            | `packages/conversation`      | claim verifier, typed source facts, persona/style descriptor           | execution, mutation, unsupported claims                   |
| `ConversationStore`           | port in conversation package | bounded records and transaction/version port                           | capability effects, product-specific repository semantics |
| `PostgresConversationStore`   | persistence adapter          | checked-out SQL client, RLS and migration                              | a second execution or approval spine                      |
| `DeliverySink`                | port in conversation package | stable response/delivery ids and outbox adapter                        | treating delivery as execution success                    |
| `ConversationProfile`         | profile boundary             | capabilities, persona/style metadata, knowledge source declarations    | facts, authority or policy overrides                      |
| `HarnessRuntimePort`          | integration adapter          | public `@cvg/harness`/contract runtime                                 | natural-language interpretation or response prose         |
| `ModelGatewayAdapter`         | integration adapter          | `@cvg/model-gateway` typed `generate` contract                         | direct provider SDK or unbounded model calls              |
| `SyntheticServiceDeskProfile` | example/fixture              | generic profile and synthetic capability descriptors                   | hospital/veterinary/Secretary/Rick semantics              |
| `SyntheticKnowledgeProfile`   | example/fixture              | generic profile and approved synthetic evidence                        | real RAG, unsupported factual claims                      |

## Dependency direction

```text
channel/input -> ConversationService
                    |-> Interpreter -> ModelGatewayAdapter (optional)
                    |-> DialogueManager -> bounded DialoguePlan
                    |-> ResponseComposer -> claim verifier
                    |-> HarnessRuntimePort -> existing governed Harness
                    |-> ConversationStore / DeliverySink

synthetic profiles -> public conversation contracts
packages/harness  -X-> packages/conversation
packages/harness-contracts -X-> packages/conversation
conversation -X-> agent-core/platform/policy/tools/workflows
```

## Boundary checks before merge

1. Removing or disabling `packages/conversation` leaves the existing Harness
   build and non-conversation tests green.
2. Static dependency checks reject reverse imports and product-shaped imports.
3. Public capability descriptors are detached data and expose no executable
   handler to interpretation or response code.
4. The only action call is the injected public Harness Runtime port; the
   conversation package cannot construct a policy, approval or effect engine.
5. Profile, persona and style metadata can change expression only; they cannot
   change facts, authority, policy outcome or source-of-truth precedence.
