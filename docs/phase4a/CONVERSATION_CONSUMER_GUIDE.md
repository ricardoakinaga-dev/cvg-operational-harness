# Conversation consumer guide — AAA-4A

Consumers provide a profile, an interpreter, a store and optional adapters.
They do not implement a second planner or call capabilities directly.

```ts
import {
  DefaultConversationService,
  InMemoryConversationStore,
  RulesFirstDialogueInterpreter,
  createOperationalHarnessBridge
} from '@cvg/conversation'
import { createSyntheticServiceDeskProfile } from '../../examples/phase4a/profiles.ts'

const profile = createSyntheticServiceDeskProfile()
const harness = createOperationalHarnessBridge({
  trustedAgent: { id: 'agent.phase4a.synthetic', version: '1.0.0' },
  harness: existingHarness,
  buildRuntimeInput: toExistingRuntimeInput
})
const service = new DefaultConversationService({
  store: new InMemoryConversationStore(),
  interpreter: new RulesFirstDialogueInterpreter(),
  harness
})

const result = await service.runTurn({
  tenantId,
  conversationId,
  sessionId,
  profileId: profile.id,
  profileVersion: profile.version,
  turnId,
  messageId,
  correlationId,
  idempotencyKey: 'synthetic-message-001',
  receivedAt: new Date().toISOString(),
  text: 'Reserve a synthetic room on Friday at 10:00.',
  profile
})
```

An action first returns a proposal or approval-required state. The consumer
must obtain an authenticated approval through its authorized channel and pass
the exact `approvalId`, proposal hash, operation key and execution id for a
resume. A natural-language “yes” is not an approval token.

The bridge is the only action boundary. Its composition root must provide the
trusted agent id and version, preserve the tenant, conversation, session,
correlation, execution and context fields in `buildRuntimeInput`, and delegate
to the existing Harness. Consumers do not pass capability implementations to
the conversation package.

Knowledge consumers configure approved source ids and versioned evidence. The
service filters provider results again, and the composer requires a citation.
Handoff is an explicit packet with bounded facts and references. The package
does not accept real appointments, patient data, credentials or production
channels in this controlled example.
