import { describe, expect, it, vi } from 'vitest'
import {
  DefaultConversationService,
  DefaultResponseComposer,
  InMemoryHandoffSink,
  InMemoryConversationStore,
  InMemoryResponseDelivery,
  RulesFirstDialogueInterpreter,
  createModelGatewayInterpreter,
  asConversationId,
  asCorrelationId,
  asMessageId,
  asSessionId,
  asTenantId,
  asTurnId,
  createEmptyWorkingMemory,
  createStaticConversationProfileAuthority,
  type ConversationProfile,
  type ConversationScope,
  type ActionProposal,
  type TurnAcceptanceInput,
  type TurnIdentity
} from '../index.ts'
import {
  createSyntheticKnowledgeAssistantProfile,
  createSyntheticServiceDeskProfile
} from '../../../../examples/phase4a/profiles.ts'

const serviceDeskProfile = createSyntheticServiceDeskProfile()
const profileAuthority = createStaticConversationProfileAuthority([
  serviceDeskProfile
])

function makeTurn(
  overrides: Partial<TurnAcceptanceInput> = {},
  selectedProfile: ConversationProfile = serviceDeskProfile
): TurnAcceptanceInput {
  const profile = overrides.profile ?? selectedProfile
  return {
    tenantId: asTenantId('tenant-synthetic-a'),
    conversationId: asConversationId('conversation-synthetic-a'),
    sessionId: asSessionId('session-synthetic-a'),
    profileId: profile.id,
    profileVersion: profile.version,
    turnId: asTurnId('turn-synthetic-a'),
    messageId: asMessageId('message-synthetic-a'),
    correlationId: asCorrelationId('correlation-synthetic-a'),
    text: 'qual é o horário do ambiente sintético?',
    idempotencyKey: 'idempotency-synthetic-a',
    receivedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
    profile
  }
}

function identityOf(input: TurnAcceptanceInput): TurnIdentity {
  const identity = {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    profileId: input.profileId,
    profileVersion: input.profileVersion,
    turnId: input.turnId,
    messageId: input.messageId,
    correlationId: input.correlationId
  }
  return input.executionId
    ? { ...identity, executionId: input.executionId }
    : identity
}

function scopeOf(input: TurnAcceptanceInput): ConversationScope {
  return {
    tenantId: input.tenantId,
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    profileId: input.profileId,
    profileVersion: input.profileVersion
  }
}

describe('@cvg/conversation public contracts', () => {
  it('keeps internal action verbs out of localized proposal language', () => {
    const composer = new DefaultResponseComposer()
    const identity = identityOf(
      makeTurn({
        turnId: asTurnId('turn-action-language'),
        messageId: asMessageId('message-action-language'),
        correlationId: asCorrelationId('correlation-action-language'),
        idempotencyKey: 'idempotency-action-language'
      })
    )
    const labels = [
      ['READ', 'a consulta de disponibilidade'],
      ['CREATE', 'a criação da reserva'],
      ['MODIFY', 'a alteração da reserva'],
      ['CANCEL', 'o cancelamento da reserva']
    ] as const

    for (const [action, label] of labels) {
      const proposal: ActionProposal = {
        proposalId: `proposal-language-${action.toLowerCase()}`,
        action,
        capabilityId: `synthetic.${action.toLowerCase()}`,
        capabilityVersion: '1.0.0',
        payload: { date: 'friday' },
        resource: { type: 'synthetic', id: 'resource-language' },
        proposalHash: 'a'.repeat(64),
        operationKey: `conversation:language:${action.toLowerCase()}`,
        requiresApproval: action !== 'READ',
        entityVersions: { date: 1 },
        createdTurnId: identity.turnId,
        status: 'DRAFT',
        createdAt: '2026-09-17T00:00:00.000Z'
      }
      const memory = createEmptyWorkingMemory()
      const draft = composer.compose({
        identity,
        profile: serviceDeskProfile,
        memory,
        plan: {
          kind: 'PROPOSE_ACTION',
          proposal,
          question: {
            questionId: `question-language-${action.toLowerCase()}`,
            type: 'CONFIRMATION',
            prompt: `Confirmar ${label} com os dados informados?`,
            missingFields: [],
            goalId: 'goal-language',
            createdTurnId: identity.turnId,
            createdAt: '2026-09-17T00:00:00.000Z'
          },
          memory
        }
      })

      expect(draft.text).toContain(label)
      expect(draft.text).not.toMatch(/\b(?:read|create|modify|cancel)\b/i)
      expect(composer.verify(draft).accepted).toBe(true)
    }
  })

  it('preserves distinct turn identities and pins the profile to a tenant-scoped conversation', async () => {
    const store = new InMemoryConversationStore()
    const input = makeTurn({
      conversationId: asConversationId('conversation-identity'),
      sessionId: asSessionId('session-identity'),
      turnId: asTurnId('turn-identity'),
      messageId: asMessageId('message-identity'),
      correlationId: asCorrelationId('correlation-identity'),
      idempotencyKey: 'idempotency-identity'
    })

    const accepted = await store.acceptTurn(input)

    expect(accepted.replayed).toBe(false)
    expect(accepted.turn.identity).toMatchObject({
      tenantId: input.tenantId,
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      profileId: input.profileId,
      profileVersion: input.profileVersion,
      turnId: input.turnId,
      messageId: input.messageId,
      correlationId: input.correlationId
    })
    expect(
      new Set([
        String(input.tenantId),
        String(input.conversationId),
        String(input.sessionId),
        String(input.turnId),
        String(input.messageId),
        String(input.correlationId)
      ])
    ).toHaveLength(6)

    const otherTenant = makeTurn({
      tenantId: asTenantId('tenant-synthetic-b'),
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      turnId: asTurnId('turn-identity-b'),
      messageId: asMessageId('message-identity-b'),
      correlationId: asCorrelationId('correlation-identity-b'),
      idempotencyKey: 'idempotency-identity-b'
    })
    await store.acceptTurn(otherTenant)

    expect((await store.load(scopeOf(input)))?.scope.tenantId).toBe(
      'tenant-synthetic-a'
    )
    expect((await store.load(scopeOf(otherTenant)))?.scope.tenantId).toBe(
      'tenant-synthetic-b'
    )

    const differentProfile = createSyntheticKnowledgeAssistantProfile()
    const profileMismatch = makeTurn({
      conversationId: input.conversationId,
      sessionId: input.sessionId,
      turnId: asTurnId('turn-profile-mismatch'),
      messageId: asMessageId('message-profile-mismatch'),
      correlationId: asCorrelationId('correlation-profile-mismatch'),
      idempotencyKey: 'idempotency-profile-mismatch',
      profileId: differentProfile.id,
      profileVersion: differentProfile.version,
      profile: differentProfile
    })

    await expect(store.acceptTurn(profileMismatch)).rejects.toMatchObject({
      code: 'PROFILE_MISMATCH'
    })
  })

  it('evaluates deterministic confirmations before consulting the optional model', async () => {
    const model = {
      interpret: vi.fn().mockResolvedValue({})
    }
    const interpreter = new RulesFirstDialogueInterpreter({ model })
    const input = makeTurn({
      text: 'sim',
      turnId: asTurnId('turn-rules-first'),
      messageId: asMessageId('message-rules-first'),
      correlationId: asCorrelationId('correlation-rules-first'),
      idempotencyKey: 'idempotency-rules-first'
    })

    const result = await interpreter.interpret({
      identity: identityOf(input),
      text: input.text,
      memory: createEmptyWorkingMemory(),
      profile: serviceDeskProfile
    })

    expect(result).toMatchObject({
      intent: 'COLLECT',
      confirmationSignal: true,
      reasonCodes: ['FIELD_COLLECTION']
    })
    expect(model.interpret).not.toHaveBeenCalled()

    const fallbackInput = makeTurn({
      text: 'descreva uma rota sintética misteriosa',
      turnId: asTurnId('turn-model-fallback'),
      messageId: asMessageId('message-model-fallback'),
      correlationId: asCorrelationId('correlation-model-fallback'),
      idempotencyKey: 'idempotency-model-fallback'
    })
    await interpreter.interpret({
      identity: identityOf(fallbackInput),
      text: fallbackInput.text,
      memory: createEmptyWorkingMemory(),
      profile: serviceDeskProfile
    })

    expect(model.interpret).toHaveBeenCalledTimes(1)
  })

  it('rejects reuse of a turn id for a different message', async () => {
    const store = new InMemoryConversationStore()
    const first = makeTurn({
      conversationId: asConversationId('conversation-turn-reuse'),
      sessionId: asSessionId('session-turn-reuse'),
      turnId: asTurnId('turn-reuse'),
      messageId: asMessageId('message-reuse-a'),
      correlationId: asCorrelationId('correlation-reuse-a'),
      idempotencyKey: 'idempotency-reuse-a',
      text: 'primeira mensagem'
    })
    await store.acceptTurn(first)

    await expect(
      store.acceptTurn({
        ...first,
        messageId: asMessageId('message-reuse-b'),
        correlationId: asCorrelationId('correlation-reuse-b'),
        idempotencyKey: 'idempotency-reuse-b',
        text: 'segunda mensagem'
      })
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  })

  it('rejects a request that combines identities already owned by different turns', async () => {
    const store = new InMemoryConversationStore()
    const first = makeTurn({
      conversationId: asConversationId('conversation-identity-collision'),
      sessionId: asSessionId('session-identity-collision'),
      turnId: asTurnId('turn-identity-collision-a'),
      messageId: asMessageId('message-identity-collision-a'),
      correlationId: asCorrelationId('correlation-identity-collision-a'),
      idempotencyKey: 'idempotency-identity-collision-a'
    })
    const second = makeTurn({
      conversationId: first.conversationId,
      sessionId: first.sessionId,
      turnId: asTurnId('turn-identity-collision-b'),
      messageId: asMessageId('message-identity-collision-b'),
      correlationId: asCorrelationId('correlation-identity-collision-b'),
      idempotencyKey: 'idempotency-identity-collision-b'
    })
    await store.acceptTurn(first)
    await store.acceptTurn(second)

    await expect(
      store.acceptTurn({
        ...first,
        turnId: asTurnId('turn-identity-collision-c'),
        messageId: first.messageId,
        correlationId: asCorrelationId('correlation-identity-collision-c'),
        idempotencyKey: second.idempotencyKey
      })
    ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  })

  it('adapts the existing Model Gateway with tenant metadata and a strict interpretation schema', async () => {
    const gateway = {
      generate: vi.fn().mockResolvedValue({
        output: {
          text: '',
          structured: {
            intent: 'INFO',
            confidence: 0.9,
            entities: [],
            references: [],
            confirmationSignal: false,
            untrustedSpans: [],
            reasonCodes: ['MODEL_SUGGESTION']
          }
        }
      })
    }
    const interpreter = createModelGatewayInterpreter({
      gateway,
      promptId: 'phase4a.conversation.interpretation',
      promptVersion: '1.0.0',
      modelProfile: 'local'
    })
    const turn = makeTurn({
      text: 'descreva uma rota sintética misteriosa',
      turnId: asTurnId('turn-model-gateway'),
      messageId: asMessageId('message-model-gateway'),
      correlationId: asCorrelationId('correlation-model-gateway'),
      idempotencyKey: 'idempotency-model-gateway'
    })

    const result = await interpreter.interpret({
      identity: identityOf(turn),
      text: turn.text,
      memory: createEmptyWorkingMemory(),
      profile: serviceDeskProfile
    })
    const request = gateway.generate.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >

    expect(result).toMatchObject({ intent: 'INFO', confidence: 0.9 })
    expect(request).toMatchObject({
      tenantId: turn.tenantId,
      conversationId: turn.conversationId,
      sessionId: turn.sessionId,
      task: 'conversation_interpretation',
      structuredOutput: {
        schemaName: 'cvg-conversation-interpretation-v1'
      }
    })
    expect(request).not.toHaveProperty('approvalGranted')
  })

  it('rejects a forged success claim without effect-backed evidence', () => {
    const composer = new DefaultResponseComposer()
    const input = makeTurn({
      turnId: asTurnId('turn-grounding'),
      messageId: asMessageId('message-grounding'),
      correlationId: asCorrelationId('correlation-grounding'),
      idempotencyKey: 'idempotency-grounding'
    })
    const draft = {
      responseId: 'response-grounding',
      deliveryKey: 'delivery:tenant-synthetic-a:response-grounding',
      text: 'A ação sintética foi concluída com sucesso.',
      claims: [
        {
          text: 'A ação sintética foi concluída com sucesso.',
          sourceRefs: ['execution:synthetic-failed'],
          kind: 'STATUS' as const,
          successClaim: true
        }
      ],
      sources: [
        {
          kind: 'TOOL_RESULT' as const,
          ref: 'execution:synthetic-failed',
          status: 'FAILED' as const
        }
      ]
    }

    const verified = composer.verify(draft, serviceDeskProfile)

    expect(verified.accepted).toBe(false)
    expect(verified.errors.join(' ')).toContain(
      'success claim is not effect-backed'
    )
    expect(verified.response.text).toContain('Não posso confirmar')
    expect(identityOf(input).tenantId).toBe('tenant-synthetic-a')
  })

  it('delivers a repeated response idempotently without re-running interpretation', async () => {
    const store = new InMemoryConversationStore()
    const interpreter = new RulesFirstDialogueInterpreter()
    const send = vi.fn().mockResolvedValue(undefined)
    const delivery = new InMemoryResponseDelivery({ send })
    const service = new DefaultConversationService({
      store,
      profileAuthority,
      interpreter,
      delivery
    })
    const input = makeTurn({
      text: 'qual é o horário do ambiente sintético?',
      turnId: asTurnId('turn-delivery'),
      messageId: asMessageId('message-delivery'),
      correlationId: asCorrelationId('correlation-delivery'),
      idempotencyKey: 'idempotency-delivery'
    })

    const first = await service.runTurn(input)
    const replay = await service.runTurn(input)

    expect(first.replayed).toBe(false)
    expect(replay.replayed).toBe(true)
    expect(replay.response).toMatchObject({
      responseId: first.response.responseId,
      deliveryKey: first.response.deliveryKey,
      deliveryStatus: 'DELIVERED'
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(
      delivery.inspect(String(input.tenantId), first.response.deliveryKey)
    ).toMatchObject({
      status: 'DELIVERED',
      attempts: 1,
      responseId: first.response.responseId
    })
  })

  it('coalesces concurrent delivery attempts behind the stable response key', async () => {
    const send = vi.fn(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 2))
    })
    const delivery = new InMemoryResponseDelivery({ send })
    const scope = {
      tenantId: asTenantId('tenant-synthetic-delivery'),
      conversationId: asConversationId('conversation-synthetic-delivery'),
      sessionId: asSessionId('session-synthetic-delivery'),
      profileId: serviceDeskProfile.id,
      profileVersion: serviceDeskProfile.version
    }
    const input = {
      scope,
      turnId: asTurnId('turn-delivery-concurrent'),
      responseId: 'response-delivery-concurrent',
      deliveryKey: 'delivery:concurrent',
      text: 'resposta sintética'
    }

    const receipts = await Promise.all([
      delivery.deliver(input),
      delivery.deliver(input),
      delivery.deliver(input)
    ])

    expect(send).toHaveBeenCalledTimes(1)
    expect(receipts.every((receipt) => receipt.status === 'DELIVERED')).toBe(
      true
    )
    expect(receipts.map((receipt) => receipt.attempts)).toEqual([1, 1, 1])
  })

  it('requires an idempotent sink across an ambiguous send failure', async () => {
    const acceptedDeliveryKeys = new Set<string>()
    let sinkCalls = 0
    const delivery = new InMemoryResponseDelivery({
      send: async (request) => {
        sinkCalls += 1
        if (!acceptedDeliveryKeys.has(request.deliveryKey)) {
          acceptedDeliveryKeys.add(request.deliveryKey)
          throw new Error('synthetic acknowledgement lost after sink accept')
        }
      }
    })
    const input = {
      scope: {
        tenantId: asTenantId('tenant-synthetic-delivery-crash'),
        conversationId: asConversationId(
          'conversation-synthetic-delivery-crash'
        ),
        sessionId: asSessionId('session-synthetic-delivery-crash'),
        profileId: serviceDeskProfile.id,
        profileVersion: serviceDeskProfile.version
      },
      turnId: asTurnId('turn-delivery-crash'),
      responseId: 'response-delivery-crash',
      deliveryKey: 'delivery:crash-window',
      text: 'resposta sintética'
    }

    await expect(delivery.deliver(input)).rejects.toThrow(
      'synthetic acknowledgement lost after sink accept'
    )
    const retry = await delivery.deliver(input)

    expect(retry.status).toBe('DELIVERED')
    expect(sinkCalls).toBe(2)
    expect(acceptedDeliveryKeys).toEqual(new Set([input.deliveryKey]))
    expect(
      delivery.inspect(String(input.scope.tenantId), input.deliveryKey)
    ).toMatchObject({
      status: 'DELIVERED',
      attempts: 2
    })
  })

  it('persists a bounded handoff checkpoint and replays the handoff idempotently', async () => {
    const store = new InMemoryConversationStore()
    const handoff = new InMemoryHandoffSink()
    const service = new DefaultConversationService({
      store,
      profileAuthority,
      interpreter: new RulesFirstDialogueInterpreter(),
      handoff
    })
    const input = makeTurn({
      text: 'Quero falar com um atendente humano.',
      turnId: asTurnId('turn-handoff'),
      messageId: asMessageId('message-handoff'),
      correlationId: asCorrelationId('correlation-handoff'),
      idempotencyKey: 'idempotency-handoff'
    })

    const first = await service.runTurn(input)
    const packet = first.snapshot.workingMemory.handoff
    const replay = await service.runTurn(input)

    expect(first.turn.planKind).toBe('HANDOFF')
    expect(first.response.text).toContain('Encaminhei')
    expect(first.snapshot.status).toBe('HANDOFF')
    expect(packet).toMatchObject({
      handoffId: 'handoff_turn-handoff',
      turnId: 'turn-handoff',
      reason: 'USER_REQUESTED_HANDOFF'
    })
    expect(packet).not.toHaveProperty('pendingApproval')
    expect(
      handoff.inspect({ tenantId: input.tenantId }, 'handoff_turn-handoff')
    ).toEqual(packet)
    expect(replay.replayed).toBe(true)
    expect(replay.response.responseId).toBe(first.response.responseId)
  })
})
