import {
  AgentConfigSchema,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore,
  PlatformEventBus,
  PluginManifestSchema,
  type ControlPlaneStore,
  type PlatformEventEnvelope,
  type PluginHookHandler,
  type CapabilityGateway
} from '@cvg/platform'
import { describe, expect, it, vi } from 'vitest'
import { executePublishedAgent } from '../index.ts'
import type { TraceId } from '@cvg/platform'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000071'

function config() {
  return AgentConfigSchema.parse({
    persona: { name: 'Luna', role: 'secretary', tone: 'calm' },
    greeting: 'Olá, resposta controlada.',
    promptBlocks: [
      {
        id: 'runtime-safety',
        kind: 'safety',
        content: 'Use apenas fixtures fictícias.',
        priority: 1,
        enabled: true
      }
    ],
    responseTemplates: {
      institutional_question: 'Resposta institucional publicada.',
      scheduling: 'Diagnóstico: gastrite.'
    },
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/runtime'
    },
    policies: {
      version: 'runtime-policy-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'institutional_question', 'scheduling'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [],
    knowledge: [
      {
        source: 'controlled://institutional',
        version: 'knowledge-v1',
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

async function publishedFixture() {
  const store = new InMemoryControlPlaneStore()
  const agent = await store.createAgent(
    { tenantId },
    {
      slug: 'runtime-secretary',
      name: 'Runtime Secretary',
      description: 'Fixture'
    }
  )
  const draft = await store.createVersion(
    { tenantId },
    agent.id,
    config(),
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
  const published = await store.publishVersion(
    { tenantId },
    approved.id,
    releaseCandidate.id
  )
  return { store, agent, published }
}

describe('published agent runtime adapter', () => {
  it('preempts administrative planning for compound and unresolved history risk', async () => {
    const { store, agent, published } = await publishedFixture()
    const planTools = vi.fn().mockReturnValue([{ toolName: 'fixture_tool' }])
    const execute = vi.fn()
    const resolveCapabilityApproval = vi.fn()
    for (const entry of [
      {
        message: 'Quero consulta, meu cachorro está vomitando sangue.',
        history: []
      },
      {
        message: 'Quero consulta.',
        history: ['Meu cachorro está vomitando sangue.']
      }
    ]) {
      const result = await executePublishedAgent({
        store,
        tenantId,
        agentId: agent.id,
        versionId: published.id,
        ...entry,
        capabilityGateway: {
          planTools,
          execute
        } as unknown as CapabilityGateway,
        resolveCapabilityApproval
      })
      expect(result.trace).toMatchObject({
        risk: { level: 'high' },
        handoff: { requested: true, priority: 'high' },
        tools: [],
        provider: { externalCall: false }
      })
    }
    expect(planTools).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    expect(resolveCapabilityApproval).not.toHaveBeenCalled()
  })

  it('blocks tools after rejecting an unsafe output in controlled runtime', async () => {
    const { store, agent, published } = await publishedFixture()
    const observed: PlatformEventEnvelope[] = []
    const observedEventNames = [
      'model.after',
      'policy.output.before',
      'policy.output.after',
      'handoff.requested',
      'response.after',
      'conversation.completed'
    ] as const
    const hook: PluginHookHandler = (event) => {
      observed.push(event)
    }
    const manifest = PluginManifestSchema.parse({
      name: 'published-output.observer',
      version: '1.0.0',
      capabilities: [],
      permissions: [],
      tools: [],
      hooks: [...observedEventNames],
      dependencies: [],
      configSchemaVersion: '1'
    })
    const eventBus = new PlatformEventBus().registerPlugin({
      tenantId,
      plugin: {
        manifest,
        handlers: {},
        hooks: Object.fromEntries(
          observedEventNames.map((name) => [name, hook])
        ) as Record<string, PluginHookHandler>
      }
    })
    const planTools = vi.fn().mockReturnValue([
      {
        plugin: 'fixture.published-output',
        version: '1.0.0',
        toolName: 'fixture_tool'
      }
    ])
    const execute = vi.fn().mockResolvedValue({
      status: 'succeeded',
      correlationId: 'corr_published_output_fixture'
    })
    const resolveCapabilityApproval = vi.fn().mockResolvedValue(null)

    const result = await executePublishedAgent({
      store,
      tenantId,
      agentId: agent.id,
      versionId: published.id,
      message: 'Quero consultar horários fictícios.',
      history: [],
      capabilityGateway: { planTools, execute } as unknown as CapabilityGateway,
      actor: {
        id: 'actor.published-output',
        role: 'Operator',
        permissions: ['fixture:execute']
      },
      requireCapabilityApproval: true,
      resolveCapabilityApproval,
      eventBus
    })

    expect(result.status).toBe('completed')
    expect(result.trace).toMatchObject({
      executionMode: 'CONTROLLED_RUNTIME',
      response: {
        mode: 'handoff',
        text: 'Vou encaminhar sua solicitação para a equipe responsável.'
      },
      handoff: {
        requested: true,
        reason: 'unsafe_output_rejected',
        state: 'HANDOFF_REQUESTED'
      },
      outputPolicy: {
        decision: 'rewritten',
        reason: 'unsafe_output_rejected',
        mode: 'handoff',
        redacted: false
      },
      tools: []
    })
    expect(planTools).not.toHaveBeenCalled()
    expect(resolveCapabilityApproval).not.toHaveBeenCalled()
    expect(execute).not.toHaveBeenCalled()
    expect(observed.map((event) => event.name)).toEqual([...observedEventNames])
    expect(JSON.stringify(observed)).not.toContain('Diagnóstico')
  })

  it('resolves the published version and executes the configured behavior', async () => {
    const { store, agent, published } = await publishedFixture()

    const result = await executePublishedAgent({
      store,
      tenantId,
      agentId: agent.id,
      message: 'Qual endereço?',
      history: [],
      context: {
        conversationId: 'conv_runtime_fixture',
        sessionId: 'sess_runtime_fixture'
      },
      approvedKnowledge: {
        version: 'knowledge-v1',
        answer: 'Rua fictícia, 100.',
        source: 'controlled://institutional'
      }
    })

    expect(result.status).toBe('completed')
    expect(result.trace).toMatchObject({
      agentId: agent.id,
      versionId: published.id,
      executionMode: 'CONTROLLED_RUNTIME',
      conversationId: 'conv_runtime_fixture',
      sessionId: 'sess_runtime_fixture',
      provider: { externalCall: false },
      response: { text: '[redacted-address].', mode: 'answer' }
    })
    expect(result.trace?.input.message).not.toContain('+5511999999999')
    expect(JSON.stringify(result.trace)).not.toContain(
      'secret://controlled/runtime'
    )
  })

  it('passes one injected execution trace through the published runtime', async () => {
    const { store, agent, published } = await publishedFixture()
    const observed: PlatformEventEnvelope[] = []
    const traceId = 'trace_00000000-0000-4000-8000-000000000072' as TraceId
    const manifest = PluginManifestSchema.parse({
      name: 'published-trace.observer',
      version: '1.0.0',
      capabilities: [],
      permissions: [],
      tools: [],
      hooks: ['message.received', 'conversation.completed'],
      dependencies: [],
      configSchemaVersion: '1'
    })
    const eventBus = new PlatformEventBus().registerPlugin({
      tenantId,
      plugin: {
        manifest,
        handlers: {},
        hooks: {
          'message.received': (event) => {
            observed.push(event)
          },
          'conversation.completed': (event) => {
            observed.push(event)
          }
        }
      }
    })

    const result = await executePublishedAgent({
      store,
      tenantId,
      agentId: agent.id,
      versionId: published.id,
      message: 'Mensagem publicada controlada',
      history: [],
      traceId,
      eventBus
    })

    expect(result.status).toBe('completed')
    expect(result.trace?.traceId).toBe(traceId)
    expect(observed).toHaveLength(2)
    expect(observed.every((event) => event.traceId === traceId)).toBe(true)
  })

  it('rejects an invalid injected execution trace before store lookup', async () => {
    const getVersion = vi.fn()
    const store = { getVersion } as unknown as ControlPlaneStore

    await expect(
      executePublishedAgent({
        store,
        tenantId,
        agentId: 'agent_invalid_trace' as never,
        versionId: 'agent_version_invalid_trace' as never,
        traceId: 'trace-invalid' as never,
        message: 'Mensagem controlada',
        history: []
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })
    expect(getVersion).not.toHaveBeenCalled()
  })

  it('reuses the controlled model boundary for a pinned published version', async () => {
    const { agent, published } = await publishedFixture()
    const invalidVersion = {
      ...published,
      config: {
        ...published.config,
        model: {
          ...published.config.model,
          provider: 'openrouter',
          model: 'external'
        }
      }
    }
    const getVersion = vi.fn().mockResolvedValue(invalidVersion)
    const publishedStore = { getVersion } as unknown as ControlPlaneStore

    await expect(
      executePublishedAgent({
        store: publishedStore,
        tenantId,
        agentId: agent.id,
        versionId: published.id,
        message: 'Mensagem fictícia',
        history: []
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })
    expect(getVersion).toHaveBeenCalledWith({ tenantId }, published.id)
  })

  it('rejects fallback configuration when resolving a published version without an explicit pin', async () => {
    const { agent, published } = await publishedFixture()
    const invalidVersion = {
      ...published,
      config: {
        ...published.config,
        model: {
          ...published.config.model,
          fallbackProvider: 'fake'
        }
      }
    }
    const resolvePublished = vi.fn().mockResolvedValue(invalidVersion)
    const getVersion = vi.fn().mockResolvedValue(invalidVersion)
    const publishedStore = {
      resolvePublished,
      getVersion
    } as unknown as ControlPlaneStore

    await expect(
      executePublishedAgent({
        store: publishedStore,
        tenantId,
        agentId: agent.id,
        message: 'Mensagem fictícia',
        history: []
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })
    expect(resolvePublished).toHaveBeenCalledWith({ tenantId }, agent.id)
    expect(getVersion).toHaveBeenCalledWith({ tenantId }, published.id)
  })

  it('fails closed without a published version and does not invent a response', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      { slug: 'unpublished-agent', name: 'Unpublished', description: 'Fixture' }
    )

    const result = await executePublishedAgent({
      store,
      tenantId,
      agentId: agent.id,
      message: 'Mensagem sem versão',
      history: []
    })

    expect(result).toEqual({
      status: 'not_configured',
      trace: null,
      reason: 'published_version_missing'
    })
  })

  it('executes an explicitly pinned archived snapshot instead of resolving the active version', async () => {
    const { store, agent, published } = await publishedFixture()
    const nextDraft = await store.createVersion(
      { tenantId },
      agent.id,
      config(),
      'admin.runtime'
    )
    const nextTesting = await store.transitionVersion(
      { tenantId },
      nextDraft.id,
      'TESTING'
    )
    const nextApproved = await store.transitionVersion(
      { tenantId },
      nextTesting.id,
      'APPROVED'
    )
    const releaseCandidate = await createValidatedControlledReleaseCandidate(
      store,
      tenantId,
      agent.id,
      nextApproved.id,
      'admin.runtime'
    )
    await store.publishVersion(
      { tenantId },
      nextApproved.id,
      releaseCandidate.id
    )

    const result = await executePublishedAgent({
      store,
      tenantId,
      agentId: agent.id,
      versionId: published.id,
      message: 'Qual endereço?',
      history: [],
      approvedKnowledge: {
        version: 'knowledge-v1',
        answer: 'Rua fictícia, 100.',
        source: 'controlled://institutional'
      }
    })

    expect(result.status).toBe('completed')
    expect(result.trace?.versionId).toBe(published.id)
  })
})
