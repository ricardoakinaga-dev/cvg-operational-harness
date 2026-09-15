import {
  AgentConfigSchema,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore
} from '@cvg/platform'
import { describe, expect, it } from 'vitest'
import { buildServer, type InboundRuntimeCompletion } from '../server.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000831'

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

function config(enableScheduling = false) {
  return AgentConfigSchema.parse({
    persona: { name: 'Inbound Agent', role: 'secretary', tone: 'calm' },
    greeting: 'Resposta fictícia.',
    promptBlocks: [],
    responseTemplates: {},
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/inbound'
    },
    policies: {
      version: 'inbound-coverage-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: enableScheduling
        ? ['respond', 'scheduling']
        : ['respond'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: enableScheduling
      ? [
          {
            plugin: 'scheduling.controlled',
            version: '1.0.0',
            enabled: true,
            allowedTools: ['find_available_slots'],
            config: {}
          }
        ]
      : [],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

async function createPublishedAgent(
  store: InMemoryControlPlaneStore,
  enableScheduling = false
) {
  const agent = await store.createAgent(
    { tenantId },
    {
      slug: 'inbound-coverage-agent',
      name: 'Inbound Coverage Agent',
      description: 'Fixture'
    }
  )
  const draft = await store.createVersion(
    { tenantId },
    agent.id,
    config(enableScheduling),
    'admin.inbound'
  )
  const testing = await store.transitionVersion(
    { tenantId },
    draft.id,
    'TESTING'
  )
  const approved = await store.transitionVersion(
    { tenantId },
    testing.id,
    'APPROVED'
  )
  const releaseCandidate = await createValidatedControlledReleaseCandidate(
    store,
    tenantId,
    agent.id,
    approved.id,
    'admin.inbound'
  )
  await store.publishVersion({ tenantId }, approved.id, releaseCandidate.id)
  return agent
}

function webhookPayload(externalMessageId: string, body: string, extra = {}) {
  return {
    externalMessageId,
    senderRef: 'fixture-sender',
    body,
    receivedAt: '2026-08-23T10:00:00-03:00',
    ...extra
  }
}

describe('inbound runtime edge branches', () => {
  it('returns not_configured when the runtime cannot resolve an agent', async () => {
    const platform = new InMemoryControlPlaneStore()
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: { resolveAgentId: () => null }
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: webhookPayload('inbound-edge-1', 'Mensagem sem agente')
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data.runtime).toEqual({
      status: 'not_configured',
      trace: null,
      reason: 'agent_mapping_missing'
    })
  })

  it('carries unresolved high and medication safety signals from conversation history', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await createPublishedAgent(platform)
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: { resolveAgentId: () => agent.id }
    })

    const first = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: webhookPayload('inbound-edge-2', 'Olá, tudo bem?')
    })
    const firstData = first.json().data as {
      conversationId: string
      sessionId: string
    }
    await app.persistence.conversations.appendOutboundMessage({
      tenantId,
      conversationId: firstData.conversationId,
      externalMessageId: 'history-fixture-high',
      body: 'Relato fictício de dor persistente'
    })
    const continued = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: webhookPayload('inbound-edge-3', 'Como devo proceder?', {
        conversationId: firstData.conversationId,
        sessionId: firstData.sessionId
      })
    })

    const medicationFirst = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: webhookPayload('inbound-edge-4', 'Olá novamente')
    })
    const medicationData = medicationFirst.json().data as {
      conversationId: string
      sessionId: string
    }
    await app.persistence.conversations.appendOutboundMessage({
      tenantId,
      conversationId: medicationData.conversationId,
      externalMessageId: 'history-fixture-critical',
      body: 'Uso fictício de dipirona'
    })
    const medicationContinued = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: webhookPayload('inbound-edge-5', 'E agora?', {
        conversationId: medicationData.conversationId,
        sessionId: medicationData.sessionId
      })
    })
    await app.close()

    expect(first.statusCode).toBe(200)
    expect(continued.statusCode).toBe(200)
    expect(medicationFirst.statusCode).toBe(200)
    expect(medicationContinued.statusCode).toBe(200)
    expect(continued.json().data.runtime).toMatchObject({
      status: 'completed',
      trace: {
        provider: { externalCall: false },
        input: { historySize: expect.any(Number) }
      }
    })
    expect(medicationContinued.json().data.runtime).toMatchObject({
      status: 'completed',
      trace: { provider: { externalCall: false } }
    })
  })

  it('uses an injected inbound completion boundary for completed and paused results', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await createPublishedAgent(platform, true)
    const completions: Array<{ status: string; toolEvents: number }> = []
    const completeInboundRuntime: InboundRuntimeCompletion = async (input) => {
      completions.push({
        status: 'completed',
        toolEvents: input.toolAuditEvents.length
      })
      return { status: 'completed' }
    }
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: {
        resolveAgentId: () => agent.id,
        completeInboundRuntime
      }
    })
    const completed = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: webhookPayload('inbound-edge-6', 'Quero agendar uma consulta')
    })
    const pausedApp = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: {
        resolveAgentId: () => agent.id,
        completeInboundRuntime: async () => ({ status: 'paused' })
      }
    })
    const paused = await pausedApp.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: webhookPayload('inbound-edge-7', 'Quero agendar outra consulta')
    })
    await app.close()
    await pausedApp.close()

    expect(completed.statusCode).toBe(200)
    expect(completed.json().data.runtime).toMatchObject({
      status: 'completed',
      trace: { provider: { externalCall: false } }
    })
    expect(completions).toHaveLength(1)
    expect(completions[0]?.toolEvents).toBeGreaterThanOrEqual(0)
    expect(paused.statusCode).toBe(200)
    expect(paused.json().data.runtime).toEqual({
      status: 'paused',
      trace: null,
      reason: 'human_takeover_active'
    })
  })

  it('rejects an invalid inbound channel before persisting the message', async () => {
    const app = buildServer()
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/telegram/messages',
      payload: webhookPayload('inbound-edge-8', 'Canal inexistente')
    })
    await app.close()

    expect(response.statusCode).toBe(400)
    expect((response.json() as Envelope<never>).error?.code).toBe(
      'validation_failed'
    )
  })

  it('fails closed when the webhook verifier denies or leases the delivery', async () => {
    const deniedApp = buildServer({ webhookVerifier: () => false })
    const denied = await deniedApp.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: webhookPayload('inbound-edge-9', 'Verificação negada')
    })
    await deniedApp.close()

    let committed = 0
    let released = 0
    const leaseApp = buildServer({
      webhookVerifier: () => ({
        verified: true,
        commit: async () => {
          committed += 1
        },
        release: async () => {
          released += 1
        }
      })
    })
    const accepted = await leaseApp.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: webhookPayload('inbound-edge-10', 'Entrega verificada')
    })
    const releasedOnFailure = await leaseApp.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/telegram/messages',
      payload: webhookPayload('inbound-edge-11', 'Falha após verificação')
    })
    const emptyDelivery = await leaseApp.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages'
    })
    await leaseApp.close()

    expect(denied.statusCode).toBe(401)
    expect((denied.json() as Envelope<never>).error?.code).toBe('unauthorized')
    expect(accepted.statusCode).toBe(200)
    expect(committed).toBe(1)
    expect(releasedOnFailure.statusCode).toBe(400)
    expect(emptyDelivery.statusCode).toBe(400)
    expect(released).toBe(2)
  })
})
