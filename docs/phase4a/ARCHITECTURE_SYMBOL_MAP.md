# Phase 4A architecture symbol map — AAA-4A

## Current implementation binding — 2026-09-17

The symbols below are now implemented in `packages/conversation/src` unless
the owner is explicitly marked as an existing brownfield authority. The map
remains the boundary contract for audit: a conversation plan is data, and the
existing Harness remains the only action, policy, approval and effect
authority. The optional package is not imported by the Harness build. The
current code and evidence are indexed in `evidence/INDEX.md`.

This map records the ownership contract for the implemented controlled build.
The executable source and candidate-bound evidence are the proof of the seams
listed here.

| Symbol / seam                 | Owner                        | May depend on                                                                | Must not own                                              |
| ----------------------------- | ---------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `ConversationService`         | `packages/conversation`      | interpreter, dialogue manager, composer, store, delivery, Harness port       | policy, approval, effect execution, provider SDK          |
| `DialogueInterpreter`         | `packages/conversation`      | bounded contracts, optional typed Model Gateway adapter                      | policy decisions, approvals, execution results            |
| `DialogueManager`             | `packages/conversation`      | interpretation, state snapshot, profile descriptors                          | capability handlers, SQL, Runtime, authorization          |
| `ResponseComposer`            | `packages/conversation`      | claim verifier, typed source facts, persona/style descriptor                 | execution, mutation, unsupported claims                   |
| `ConversationStore`           | port in conversation package | bounded records, transaction/version port and pre-effect authorization fence | capability effects, product-specific repository semantics |
| `PostgresConversationStore`   | persistence adapter          | checked-out SQL client, RLS and migration                                    | a second execution or approval spine                      |
| `DeliverySink`                | port in conversation package | stable response/delivery ids and outbox adapter                              | treating delivery as execution success                    |
| `ConversationProfile`         | profile boundary             | capabilities, persona/style metadata, knowledge source declarations          | facts, authority or policy overrides                      |
| `HarnessRuntimePort`          | integration adapter          | public `@cvg/harness`/contract runtime                                       | natural-language interpretation or response prose         |
| `ModelGatewayAdapter`         | integration adapter          | `@cvg/model-gateway` typed `generate` contract                               | direct provider SDK or unbounded model calls              |
| `SyntheticServiceDeskProfile` | example/fixture              | generic profile and synthetic capability descriptors                         | hospital/veterinary/Secretary/Rick semantics              |
| `SyntheticKnowledgeProfile`   | example/fixture              | generic profile and approved synthetic evidence                              | real RAG, unsupported factual claims                      |

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
