import { describe, expect, it } from 'vitest'
import {
  AgentConfigSchema,
  InMemoryControlPlaneStore,
  PlatformEventBus,
  PluginManifestSchema,
  createControlledTraceTiming,
  runTestLab,
  type PlatformEventEnvelope,
  type PlatformEventName,
  type PluginHookHandler
} from '../index.ts'
import type { TenantId } from '../ids.ts'
import type { TraceId } from '../ids.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000203' as TenantId

const observedEventNames = [
  'message.received',
  'message.normalized',
  'conversation.loaded',
  'context.loaded',
  'agent.resolved',
  'policy.input.before',
  'policy.input.after',
  'policy.output.before',
  'policy.output.after',
  'intent.before',
  'intent.after',
  'knowledge.before',
  'knowledge.after',
  'prompt.before',
  'prompt.after',
  'model.before',
  'model.after',
  'response.before',
  'response.after',
  'handoff.requested',
  'conversation.completed'
] as const satisfies readonly PlatformEventName[]

function createConfig() {
  return AgentConfigSchema.parse({
    persona: { name: 'Esmeralda', role: 'secretary', tone: 'calm' },
    greeting: 'Como posso ajudar?',
    promptBlocks: [
      {
        id: 'event-persona',
        kind: 'persona',
        content: 'Respond only from controlled configuration.',
        priority: 1,
        enabled: true
      }
    ],
    responseTemplates: { institutional_question: 'Resposta controlada.' },
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/fake'
    },
    policies: {
      version: 'policy-event-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'institutional_question'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'controlled-reception',
      destinations: ['controlled-reception'],
      maxClarifications: 2
    }
  })
}

describe('Test Lab event integration', () => {
  it('records bounded stage duration with an injectable monotonic clock', async () => {
    const ticks = [100, 103, 107, 111]
    const timing = createControlledTraceTiming(() => ticks.shift() ?? 111)

    expect(timing.measure('model', () => 'controlled')).toBe('controlled')
    await expect(timing.measureAsync('tool', async () => 'done')).resolves.toBe(
      'done'
    )
    expect(timing.snapshot()).toEqual({ model: 3, tool: 4 })
  })

  it('rejects a non-monotonic clock and keeps snapshots isolated', () => {
    const ticks = [10, 9]
    const timing = createControlledTraceTiming(() => ticks.shift() ?? 9)

    expect(() => timing.measure('model', () => 'never')).toThrowError(
      expect.objectContaining({ code: 'validation_failed' })
    )

    const stable = createControlledTraceTiming(() => 10)
    stable.measure('model', () => 'controlled')
    const snapshot = stable.snapshot()
    snapshot.model = 999
    expect(stable.snapshot()).toEqual({ model: 0 })
  })

  it('emits representative lifecycle events without raw message or external calls', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      {
        slug: 'event-observer',
        name: 'Event Observer',
        description: 'Controlled event test'
      }
    )
    const version = await store.createVersion(
      { tenantId },
      agent.id,
      createConfig(),
      'admin-event'
    )
    const observed: PlatformEventEnvelope[] = []
    const hook: PluginHookHandler = (event) => {
      observed.push(event)
    }
    const manifest = PluginManifestSchema.parse({
      name: 'test-lab.observer',
      version: '1.0.0',
      capabilities: [],
      permissions: [],
      tools: [],
      hooks: [...observedEventNames],
      dependencies: [],
      configSchemaVersion: '1'
    })
    const hooks = Object.fromEntries(
      observedEventNames.map((name) => [name, hook])
    ) as Record<string, PluginHookHandler>
    const bus = new PlatformEventBus().registerPlugin({
      tenantId,
      plugin: { manifest, handlers: {}, hooks }
    })

    const trace = await runTestLab({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Qual o endereço? contato@example.com',
      history: [],
      eventBus: bus,
      context: {
        conversationId: 'conversation-controlled',
        sessionId: 'session-controlled'
      }
    })

    const names = observed.map((event) => event.name)
    expect(names).toEqual(expect.arrayContaining([...observedEventNames]))
    expect(observed.every((event) => event.tenantId === tenantId)).toBe(true)
    expect(observed.every((event) => event.executionMode === 'TEST_LAB')).toBe(
      true
    )
    expect(observed.every((event) => event.traceId === trace.traceId)).toBe(
      true
    )
    expect(new Set(observed.map((event) => event.id)).size).toBe(
      observed.length
    )
    expect(JSON.stringify(observed)).not.toContain('contato@example.com')
    expect(trace.provider.externalCall).toBe(false)
    expect(trace.handoff.requested).toBe(true)
  })

  it('rejects an injected invalid trace before emitting or executing', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      {
        slug: 'invalid-trace-input',
        name: 'Invalid Trace Input',
        description: 'Controlled invalid trace fixture'
      }
    )
    const version = await store.createVersion(
      { tenantId },
      agent.id,
      createConfig(),
      'admin-event'
    )
    const observed: PlatformEventEnvelope[] = []
    const manifest = PluginManifestSchema.parse({
      name: 'invalid-trace.observer',
      version: '1.0.0',
      capabilities: [],
      permissions: [],
      tools: [],
      hooks: ['message.received'],
      dependencies: [],
      configSchemaVersion: '1'
    })
    const bus = new PlatformEventBus().registerPlugin({
      tenantId,
      plugin: {
        manifest,
        handlers: {},
        hooks: {
          'message.received': (event) => {
            observed.push(event)
          }
        }
      }
    })

    await expect(
      runTestLab({
        store,
        tenantId,
        agentId: agent.id,
        versionId: version.id,
        message: 'Mensagem controlada',
        history: [],
        eventBus: bus,
        traceId: 'trace-invalid' as never
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })
    expect(observed).toHaveLength(0)
  })

  it('keeps a valid injected trace as the only execution identity', async () => {
    const store = new InMemoryControlPlaneStore()
    const agent = await store.createAgent(
      { tenantId },
      {
        slug: 'valid-trace-input',
        name: 'Valid Trace Input',
        description: 'Controlled valid trace fixture'
      }
    )
    const version = await store.createVersion(
      { tenantId },
      agent.id,
      createConfig(),
      'admin-event'
    )
    const traceId = 'trace_00000000-0000-4000-8000-000000000204' as TraceId
    const trace = await runTestLab({
      store,
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Mensagem controlada',
      history: [],
      traceId
    })

    expect(trace.traceId).toBe(traceId)
  })
})
