# Conversational authority model — AAA-4A

## Current binding — 2026-09-17

The conversation layer is an interpreter and planning boundary. It can
organize a request into bounded data, but it cannot grant authority. Authority
is assigned to the existing Harness Runtime and to the persisted records that
bind a turn, proposal, approval, execution and response.

| Input or component             | Authority it has                                                                                                                             | Authority it does not have                                            |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| User message                   | Supplies an untrusted request and explicit facts                                                                                             | Tenant identity, approval, capability, policy result or effect result |
| `DialogueInterpreter`          | Emits typed intent, entities, references and confidence                                                                                      | Policy, approval, execution, source approval or factual truth         |
| `ConversationProfileAuthority` | Resolves the frozen profile descriptor for the requested id/version; owns capability and knowledge allowlists                                | Runtime permission, policy override, provider credential or effect    |
| `ConversationProfile`          | Describes available capability ids, versions, fields, approved source ids, locale and bounded response copy after trusted resolution         | Runtime permission, policy override, provider credential or effect    |
| `DialogueManager`              | Builds a bounded answer, question, knowledge search, proposal, handoff or stop plan                                                          | SQL, capability implementation, policy evaluation, approval or effect |
| `ConversationService`          | Binds trusted request identity, state version, proposal hash and execution id; obtains a second store fence immediately before Harness entry | Bypassing the injected Harness or inventing a successful outcome      |
| `OperationalHarnessBridge`     | Preserves the composition-root runtime agent id/version and exact execution bindings before delegating                                       | Selecting a runtime agent, capability or policy from transport data   |
| Existing Harness Runtime       | Evaluates policy, approval, capability boundary, journal, audit and telemetry                                                                | Conversational prose or hidden conversation memory                    |
| `ConversationStore`            | Persists scoped turns, bounded state, claims and replay data                                                                                 | Capability effects or approval decisions                              |
| `ResponseComposer`             | Writes bounded language from accepted source facts                                                                                           | Changing source status or turning uncertainty into success            |
| Handoff sink                   | Persists a bounded continuation packet                                                                                                       | Granting permission to execute or approving a proposal                |

The following rules are executable invariants:

1. A natural-language “yes” is a response to a pending user question. It is
   never an approval grant.
2. An action crosses the injected `ConversationHarness` port with trusted
   identities and the exact proposal binding. The package has no capability
   implementation or policy engine.
3. A correction changes eligible conversation facts, invalidates the affected
   proposal and approval, and forces a new proposal hash and operation key.
4. Only a validated `SUCCEEDED` Harness result with effect evidence can be
   rendered as a completed effect.
5. A knowledge claim requires an approved source id and non-empty version;
   user text, model output and a decoy source cannot become evidence.
6. All state and replay records are tenant and profile/version scoped. The
   payload cannot override the trusted scope.
7. A delivery adapter may retry a committed response after a crash between
   external send and the `DELIVERED` mark. The stable `deliveryKey` is the
   sink's required deduplication key; the conversation package claims
   at-least-once delivery with idempotent sink semantics.
8. A new execution reservation must match the accepted state version when its
   turn created the proposal, or the exact active pending proposal when it is
   a later confirmation. A second lease and state fence immediately before the
   Harness call establishes the effect ordering point. A correction that wins
   before that fence becomes a bounded clarification; it cannot reach the
   Harness or restore stale pending state.

The current proof map is maintained in `evidence/EVIDENCE_GRAPH.json`. A
missing PostgreSQL run limits the durability and SQL isolation claims even
when the in-memory controls pass.
