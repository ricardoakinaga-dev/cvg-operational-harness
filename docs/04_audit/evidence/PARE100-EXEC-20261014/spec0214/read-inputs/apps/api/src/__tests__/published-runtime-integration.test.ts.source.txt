import {
  AgentConfigSchema,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore
} from '@cvg/platform'
import { describe, expect, it } from 'vitest'
import { buildServer } from '../server.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000072'
const headers = {
  'x-operator-id': 'admin.runtime',
  'x-operator-role': 'Admin',
  'x-tenant-id': tenantId
}

function config(
  enableScheduling = false,
  lowConfidence: 'clarify' | 'handoff' = 'clarify'
) {
  return AgentConfigSchema.parse({
    persona: { name: 'Luna', role: 'secretary', tone: 'calm' },
    greeting: 'Greeting publicada.',
    promptBlocks: [
      {
        id: 'runtime-safety',
        kind: 'safety',
        content: 'Use apenas fixtures fictícias.',
        priority: 1,
        enabled: true
      }
    ],
    responseTemplates: { institutional_question: 'Template publicado.' },
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/runtime-api'
    },
    policies: {
      version: 'runtime-api-policy-v1',
      minConfidence: 0.7,
      lowConfidence,
      maxClarifications: 2,
      enabledActions: [
        'respond',
        'institutional_question',
        ...(enableScheduling ? ['scheduling'] : [])
      ],
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
    knowledge: [
      {
        source: 'controlled://runtime-api',
        version: 'runtime-knowledge-v1',
        enabled: true,
        requiresApprovedSource: true
      }
    ],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

async function createPublishedAgent(
  store: InMemoryControlPlaneStore,
  enableScheduling = false,
  lowConfidence: 'clarify' | 'handoff' = 'clarify'
) {
  const agent = await store.createAgent(
    { tenantId },
    {
      slug: 'runtime-api-agent',
      name: 'Runtime API Agent',
      description: 'Fixture'
    }
  )
  const draft = await store.createVersion(
    { tenantId },
    agent.id,
    config(enableScheduling, lowConfidence),
    'admin.runtime'
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
    'admin.runtime'
  )
  await store.publishVersion({ tenantId }, approved.id, releaseCandidate.id)
  return agent
}

class RetryableRuntimePlatform extends InMemoryControlPlaneStore {
  private failPublishedLookup = true

  async resolvePublished(
    ...args: Parameters<InMemoryControlPlaneStore['resolvePublished']>
  ) {
    if (this.failPublishedLookup) {
      this.failPublishedLookup = false
      throw new Error('temporary platform failure')
    }
    return super.resolvePublished(...args)
  }
}

describe('published runtime integration', () => {
  it('executes the published config after inbound persistence without external calls', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await createPublishedAgent(platform)
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: {
        resolveAgentId: () => agent.id,
        approvedKnowledge: {
          version: 'runtime-knowledge-v1',
          answer: 'Endereço fictício publicado.',
          source: 'controlled://runtime-api'
        }
      }
    })

    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      headers,
      payload: {
        externalMessageId: 'runtime-integration-1',
        senderRef: 'fixture-sender',
        body: 'Qual endereço?',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data.runtime).toMatchObject({
      status: 'completed',
      trace: {
        executionMode: 'CONTROLLED_RUNTIME',
        response: { text: 'Endereço fictício publicado.', mode: 'answer' },
        provider: { externalCall: false }
      }
    })
    await expect(
      platform.listExecutionTraces({ tenantId })
    ).resolves.toMatchObject([
      {
        executionMode: 'CONTROLLED_RUNTIME',
        conversationId: response.json().data.conversationId
      }
    ])
  })

  it('returns a fail-closed runtime result when the resolver has no published version', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await platform.createAgent(
      { tenantId },
      {
        slug: 'runtime-api-unpublished',
        name: 'Unpublished',
        description: 'Fixture'
      }
    )
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: { resolveAgentId: () => agent.id }
    })

    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'runtime-integration-2',
        senderRef: 'fixture-sender',
        body: 'Mensagem sem versão',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data.runtime).toEqual({
      status: 'not_configured',
      trace: null,
      reason: 'published_version_missing'
    })
  })

  it('keeps a continued session on its first published version after a new publish', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await createPublishedAgent(platform)
    const firstVersion = await platform.resolvePublished({ tenantId }, agent.id)
    if (!firstVersion)
      throw new Error('Fixture did not publish its first version')
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: { resolveAgentId: () => agent.id }
    })

    const first = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'runtime-pinning-1',
        senderRef: 'fixture-sender',
        body: 'Primeira mensagem',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    const firstData = first.json().data as {
      conversationId: string
      sessionId: string
    }

    const nextDraft = await platform.createVersion(
      { tenantId },
      agent.id,
      AgentConfigSchema.parse({
        ...firstVersion.config,
        greeting: 'Greeting v2 publicada.'
      }),
      'admin.runtime'
    )
    const nextTesting = await platform.transitionVersion(
      { tenantId },
      nextDraft.id,
      'TESTING'
    )
    const nextApproved = await platform.transitionVersion(
      { tenantId },
      nextTesting.id,
      'APPROVED'
    )
    const releaseCandidate = await createValidatedControlledReleaseCandidate(
      platform,
      tenantId,
      agent.id,
      nextApproved.id,
      'admin.runtime'
    )
    const secondVersion = await platform.publishVersion(
      { tenantId },
      nextApproved.id,
      releaseCandidate.id
    )

    const continued = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'runtime-pinning-2',
        senderRef: 'fixture-sender',
        body: 'Continuação da conversa',
        conversationId: firstData.conversationId,
        sessionId: firstData.sessionId,
        receivedAt: '2026-08-23T10:01:00-03:00'
      }
    })
    await app.close()

    const traces = await platform.listExecutionTraces({ tenantId })
    expect(first.statusCode).toBe(200)
    expect(continued.statusCode).toBe(200)
    expect(secondVersion.id).not.toBe(firstVersion.id)
    expect(traces).toHaveLength(2)
    expect(traces.map((trace) => trace.versionId)).toEqual([
      firstVersion.id,
      firstVersion.id
    ])
  })

  it('retries pending runtime work when the inbound delivery is replayed after a transient failure', async () => {
    const platform = new RetryableRuntimePlatform()
    const agent = await createPublishedAgent(platform)
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: { resolveAgentId: () => agent.id }
    })
    const request = {
      method: 'POST' as const,
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'runtime-retry-1',
        senderRef: 'fixture-sender',
        body: 'Mensagem para retry',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    }

    const failed = await app.inject(request)
    const retried = await app.inject(request)
    await app.close()

    expect(failed.statusCode).toBe(500)
    expect(retried.statusCode).toBe(200)
    expect(retried.json().data.accepted).toBe(false)
    expect(retried.json().data.runtime).toMatchObject({
      status: 'completed',
      trace: { provider: { externalCall: false } }
    })
    await expect(
      platform.listExecutionTraces({ tenantId })
    ).resolves.toHaveLength(1)
  })

  it('executes enabled scheduling through the controlled capability gateway and audits the tool', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await createPublishedAgent(platform, true)
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: { resolveAgentId: () => agent.id }
    })

    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'runtime-scheduling-1',
        senderRef: 'fixture-sender',
        body: 'Quero agendar uma consulta',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    const sessionId = response.json().data.sessionId as string
    const audit = await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${sessionId}`,
      headers: {
        'x-operator-id': 'supervisor.runtime',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': tenantId
      }
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.json().data.runtime.trace.tools).toEqual([
      { name: 'find_available_slots', status: 'succeeded' }
    ])
    expect(audit.statusCode).toBe(200)
    expect(audit.json().data.events).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'tool_call' })])
    )
    const traceId = response.json().data.runtime.trace.traceId as string
    const toolAudit = audit
      .json()
      .data.events.find(
        (event: { type?: string }) => event.type === 'tool_call'
      )
    expect(toolAudit?.payload.traceId).toBe(traceId)
    expect(toolAudit?.correlationId).toMatch(/^corr_/)
    expect(toolAudit?.correlationId).not.toBe(traceId)
  })

  it('silences a continued session during human takeover and resumes only after explicit release', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await createPublishedAgent(platform, false, 'handoff')
    const app = buildServer({
      platform,
      inboundTenantResolver: () => tenantId,
      agentRuntime: {
        resolveAgentId: () => agent.id,
        approvedKnowledge: {
          version: 'runtime-knowledge-v1',
          answer: 'Endereço fictício publicado.',
          source: 'controlled://runtime-api'
        }
      }
    })

    const first = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'runtime-handoff-1',
        senderRef: 'fixture-sender',
        body: 'Olá',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    const firstData = first.json().data as {
      conversationId: string
      sessionId: string
      runtime: {
        trace: { traceId: string; handoff: { state: string } }
      }
    }
    const firstAudit = await app.inject({
      method: 'GET',
      url: `/v1/audit/sessions/${firstData.sessionId}`,
      headers: {
        'x-operator-id': 'supervisor.runtime',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': tenantId
      }
    })
    const accept = await app.inject({
      method: 'POST',
      url: `/v1/sessions/${firstData.sessionId}/takeover`,
      headers: {
        'x-operator-id': 'supervisor.runtime',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': tenantId
      },
      payload: { event: 'accept_handoff' }
    })
    const continued = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'runtime-handoff-2',
        senderRef: 'fixture-sender',
        body: 'Ainda preciso de ajuda',
        conversationId: firstData.conversationId,
        sessionId: firstData.sessionId,
        receivedAt: '2026-08-23T10:01:00-03:00'
      }
    })
    const resolve = await app.inject({
      method: 'POST',
      url: `/v1/sessions/${firstData.sessionId}/takeover`,
      headers: {
        'x-operator-id': 'supervisor.runtime',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': tenantId
      },
      payload: { event: 'resolve_handoff' }
    })
    const release = await app.inject({
      method: 'POST',
      url: `/v1/sessions/${firstData.sessionId}/takeover`,
      headers: {
        'x-operator-id': 'supervisor.runtime',
        'x-operator-role': 'Supervisor',
        'x-tenant-id': tenantId
      },
      payload: { event: 'release_to_bot' }
    })
    const resumed = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'runtime-handoff-3',
        senderRef: 'fixture-sender',
        body: 'Qual endereço?',
        conversationId: firstData.conversationId,
        sessionId: firstData.sessionId,
        receivedAt: '2026-08-23T10:02:00-03:00'
      }
    })
    await app.close()

    expect(first.statusCode).toBe(200)
    expect(firstData.runtime.trace.handoff.state).toBe('HANDOFF_REQUESTED')
    expect(firstAudit.statusCode).toBe(200)
    const handoffAudit = firstAudit
      .json()
      .data.events.find((event: { type?: string }) => event.type === 'handoff')
    expect(handoffAudit?.correlationId).toMatch(/^corr_/)
    expect(handoffAudit?.correlationId).not.toBe(
      firstData.runtime.trace.traceId
    )
    expect(handoffAudit?.payload.traceId).toBe(firstData.runtime.trace.traceId)
    expect(accept.statusCode).toBe(200)
    expect(continued.statusCode).toBe(200)
    expect(continued.json().data.runtime).toMatchObject({
      status: 'paused',
      trace: null,
      reason: 'human_takeover_active'
    })
    expect(resolve.statusCode).toBe(200)
    expect(release.statusCode).toBe(200)
    expect(resumed.json().data.runtime).toMatchObject({
      status: 'completed',
      trace: {
        input: { historySize: 3 },
        response: { text: 'Endereço fictício publicado.' }
      }
    })
  })
})
