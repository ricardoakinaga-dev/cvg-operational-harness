import { describe, expect, it, vi } from 'vitest'
import {
  DefaultConversationService,
  InMemoryConversationStore,
  RulesFirstDialogueInterpreter,
  asConversationId,
  asCorrelationId,
  asMessageId,
  asSessionId,
  asTenantId,
  asTurnId,
  createStaticConversationProfileAuthority,
  type ConversationCapability
} from '../../packages/conversation/src/index.ts'
import { createSyntheticKnowledgeAssistantProfile } from '../../examples/phase4a/profiles.ts'
import { runKnowledgeAssistantDemo } from '../../examples/phase4a/knowledge-assistant.ts'

describe('AAA-4A Knowledge Assistant governed journey', () => {
  it('uses the shared public service with profile-specific English copy and approved evidence', async () => {
    const result = await runKnowledgeAssistantDemo()

    expect(result.profile).toEqual({
      id: 'synthetic-knowledge-assistant',
      version: '1.0.0'
    })
    expect(result.grounding).toMatchObject({
      accepted: true,
      sourceId: 'synthetic-knowledge-handbook',
      sourceVersion: '1.0.0',
      citationPresent: true,
      providerSearches: 1
    })
    expect(result.transcript[0]?.response).toContain(
      'The synthetic support plan'
    )
    expect(result.transcript[0]?.response).not.toContain('A ação')
    expect(result.provider.excludedDecoySource).toBe(
      'synthetic-service-desk-handbook'
    )
  })

  it('uses profile-owned English copy when a generic capability needs fields', async () => {
    const base = createSyntheticKnowledgeAssistantProfile()
    const capability: ConversationCapability = {
      id: 'synthetic.support-case',
      version: '1.0.0',
      action: 'CREATE',
      description: 'Creates a synthetic support case',
      requiredFields: ['caseId'],
      sideEffect: 'WRITE',
      requiresApproval: true
    }
    const profile = { ...base, capabilities: [capability] }
    const execute = vi.fn()
    const service = new DefaultConversationService({
      store: new InMemoryConversationStore(),
      profileAuthority: createStaticConversationProfileAuthority([profile]),
      interpreter: new RulesFirstDialogueInterpreter(),
      harness: { execute }
    })

    const result = await service.runTurn({
      tenantId: asTenantId('tenant.phase4a.knowledge.copy'),
      conversationId: asConversationId('conversation.phase4a.knowledge.copy'),
      sessionId: asSessionId('session.phase4a.knowledge.copy'),
      profileId: profile.id,
      profileVersion: profile.version,
      turnId: asTurnId('turn.phase4a.knowledge.copy'),
      messageId: asMessageId('message.phase4a.knowledge.copy'),
      correlationId: asCorrelationId('correlation.phase4a.knowledge.copy'),
      text: 'create a support case',
      idempotencyKey: 'idempotency.phase4a.knowledge.copy',
      receivedAt: '2026-09-17T12:02:00.000Z',
      profile
    })

    expect(result.turn.planKind).toBe('ASK_USER')
    expect(result.response.text).toContain(
      'I need these details to continue: caseId.'
    )
    expect(result.response.text).not.toContain('Preciso')
    expect(execute).not.toHaveBeenCalled()
  })
})
