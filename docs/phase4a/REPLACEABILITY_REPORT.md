# Replaceability report — AAA-4A

The package is replaceable at the composition boundary. A consumer depends on
the `ConversationService`, `ConversationStore`, `KnowledgeProvider`,
`DeliverySink` and `ConversationHarness` contracts. The in-memory adapters can
be replaced by PostgreSQL or another approved implementation without changing
the dialogue manager or composer. The model interpreter is optional and can be
replaced while preserving the strict interpretation schema.

The existing Harness remains independently buildable through
`npm run build:harness`. Removing the conversation package removes only the
optional conversational path and its additive migration activation. No
conversation module owns a capability implementation, policy, approval,
effect journal, channel or provider SDK. The synthetic consumers are examples,
not required dependencies of the generic package.

Replacement requires preserving tenant/profile bindings, the trusted profile
authority, proposal and operation identity, owner-turn and execution fencing,
effect evidence, delivery keys, state bounds, source allowlists and the
`NO_GO` production boundary. A replacement delivery sink must deduplicate its
delivery key because the durable adapter's external contract is at-least-once.
Those invariants are the contract; concrete adapters are implementation
choices.
