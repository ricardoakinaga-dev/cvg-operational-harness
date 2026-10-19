import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { AgentConfigSchema } from '../contracts.ts'
import { InMemoryControlPlaneStore } from '../control-plane-store.ts'
import {
  createControlledCapabilityGateway,
  createControlledSchedulingPlugin
} from '../controlled-plugins.ts'
import { CapabilityGateway, PluginRegistry } from '../plugin-gateway.ts'

import { DeterministicModelProvider } from '../model-provider.ts'
import { createControlledTraceTiming } from '../test-lab.ts'
import { createTraceId } from '../ids.ts'
import {
  executeControlledKernel,
  createLocalControlledPorts,
  type ControlledKernelInput
} from '../controlled-kernel-execution.ts'

import {
  attestReviewedPlugin,
  gatewayCore,
  reviewedDescriptor
} from '../plugin-execution-core.ts'

async function fixture() {
  const tenantId = 'tenant_00000000-0000-4000-8000-000000000214'
  const config = AgentConfigSchema.parse({
    persona: { name: 'Synthetic', role: 'assistant', tone: 'calm' },
    greeting: 'Resposta controlada.',
    promptBlocks: [],
    responseTemplates: {},
    model: {
      provider: 'fake',
      model: 'deterministic-v1',
      temperature: 0,
      maxTokens: 128,
      timeoutMs: 1000,
      retries: 0,
      secretRef: 'secret://controlled/synthetic'
    },
    policies: {
      version: 'synthetic-v1',
      minConfidence: 0.7,
      lowConfidence: 'clarify',
      maxClarifications: 2,
      enabledActions: ['respond', 'scheduling'],
      approvalActions: [],
      blockedActions: []
    },
    plugins: [
      {
        plugin: 'scheduling.controlled',
        version: '1.0.0',
        enabled: true,
        allowedTools: ['find_available_slots'],
        config: {}
      }
    ],
    knowledge: [],
    handoff: {
      lowConfidenceDestination: 'synthetic',
      destinations: ['synthetic'],
      maxClarifications: 2
    }
  })
  const store = new InMemoryControlPlaneStore()
  const agent = await store.createAgent(
    { tenantId },
    { slug: 'synthetic-214', name: 'Synthetic', description: 'Synthetic only' }
  )
  const version = await store.createVersion(
    { tenantId },
    agent.id,
    config,
    'synthetic'
  )
  const input = {
    store,
    tenantId,
    agentId: agent.id,
    versionId: version.id,
    traceId: createTraceId(),
    message: 'Quero uma consulta',
    history: [],
    executionMode: 'TEST_LAB' as const,
    actor: {
      id: 'system.synthetic',
      role: 'System',
      permissions: ['untrusted']
    },
    capabilityGateway: createControlledCapabilityGateway()
  }
  const provider = new DeterministicModelProvider()
  const prepared: ControlledKernelInput = {
    input,
    version,
    config,
    intent: 'scheduling',
    policy: {
      decision: 'allowed',
      reason: 'synthetic',
      layer: 'agent_behavior',
      policyVersion: 'synthetic-v1'
    },
    risk: { level: 'low', reason: 'synthetic' },
    response: { mode: 'answer', text: 'Resposta controlada.' },
    promptWithHistory: 'Synthetic prompt',
    sourceIds: [],
    provider,
    timing: createControlledTraceTiming(),
    emit: async () => undefined
  }
  return {
    input,
    config,
    version,
    provider,
    prepared,
    ports: createLocalControlledPorts()
  }
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('implementation provenance, not descriptor strings', () => {
  it('propagates the real attestation through registry normalization and clones', async () => {
    const f = await fixture()
    const core = gatewayCore(f.input.capabilityGateway)!
    expect(
      reviewedDescriptor(core.resolve(f.config, 'find_available_slots')!)
    ).toMatchObject({
      risk: 'LOW',
      sideEffect: 'NONE',
      idempotent: true,
      requiresApproval: false
    })
    expect((await executeControlledKernel(f.prepared, f.ports)).stop).toBe(
      'COMPLETED'
    )
  })

  it.each([
    'handler',
    'validator',
    'safeParse',
    'accessor',
    'manifest',
    'copy'
  ] as const)(
    'refuses a legitimate gateway with changed %s',
    async (change) => {
      const f = await fixture()
      let plugin = createControlledSchedulingPlugin()
      const body = vi.fn(() => ({ status: 'succeeded' as const }))
      if (change === 'handler') plugin.handlers.find_available_slots = body
      if (change === 'accessor') {
        const validator = plugin.inputValidators!.find_available_slots!
        const parse = validator.safeParse
        Object.defineProperty(validator, 'safeParse', { get: () => parse })
      }
      if (change === 'validator')
        plugin.inputValidators!.find_available_slots = z.object({
          message: z.string()
        })
      if (change === 'safeParse')
        plugin.inputValidators!.find_available_slots!.safeParse = () => ({
          success: true,
          data: {}
        })
      if (change === 'manifest') plugin.manifest.configSchemaVersion = '2'
      if (change === 'copy') plugin = { ...plugin }
      const authorizer = vi.fn(({ requiredPermission }) => [requiredPermission])
      f.prepared.input.capabilityGateway = new CapabilityGateway(
        new PluginRegistry([plugin]),
        { actorAuthorizer: authorizer }
      )
      const result = await executeControlledKernel(f.prepared, f.ports)
      expect(result.stop).toBe('UNSAFE_REQUEST')
      expect(result.tools).toEqual([
        { name: 'find_available_slots', status: 'not_run' }
      ])
      expect(result.attempts).toEqual([])
      expect(body).not.toHaveBeenCalled()
      expect(authorizer).not.toHaveBeenCalled()
    }
  )

  it('rejects a mutation of safeParse after registry registration', async () => {
    const f = await fixture()
    const plugin = createControlledSchedulingPlugin()
    const gateway = new CapabilityGateway(new PluginRegistry([plugin]), {
      actorAuthorizer: ({ requiredPermission }) => [requiredPermission]
    })
    plugin.outputValidators!.find_available_slots!.safeParse = () => ({
      success: true,
      data: {}
    })
    f.prepared.input.capabilityGateway = gateway
    const result = await executeControlledKernel(f.prepared, f.ports)
    expect(result.stop).toBe('UNSAFE_REQUEST')
    expect(result.attempts).toEqual([])
  })

  it('refuses a validator changed while an admitted handler is pending', async () => {
    const f = await fixture()
    const plugin = createControlledSchedulingPlugin()
    let release!: () => void
    let entered!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const atBody = new Promise<void>((resolve) => {
      entered = resolve
    })
    plugin.handlers.find_available_slots = async () => {
      entered()
      await pending
      return {
        status: 'succeeded',
        data: { slots: [], controlled: true, dryRun: true }
      }
    }
    attestReviewedPlugin(
      plugin,
      reviewedDescriptor(
        gatewayCore(f.input.capabilityGateway)!.resolve(
          f.config,
          'find_available_slots'
        )!
      )!
    )
    f.prepared.input.capabilityGateway = new CapabilityGateway(
      new PluginRegistry([plugin]),
      { actorAuthorizer: ({ requiredPermission }) => [requiredPermission] }
    )
    const running = executeControlledKernel(f.prepared, f.ports)
    await atBody
    const replaced = vi.fn(() => ({ success: true, data: {} }))
    plugin.outputValidators!.find_available_slots!.safeParse = replaced
    release()
    const result = await running
    expect(result.stop).toBe('TOOL_FAILURE')
    expect(result.attempts[0]?.phase).toBe('ENTERED')
    expect(result.tools[0]?.status).toBe('failed')
    expect(replaced).not.toHaveBeenCalled()
  })

  it('refuses N>1 before prepare/approval/body even for reviewed synthetic fixtures', async () => {
    const f = await fixture()
    const one = createControlledSchedulingPlugin()
    const two = createControlledSchedulingPlugin()
    const original = two.handlers.find_available_slots!
    two.manifest.name = 'synthetic.second'
    two.manifest.tools[0]!.name = 'synthetic_second'
    two.handlers = { synthetic_second: original }
    two.inputValidators = {
      synthetic_second: two.inputValidators!.find_available_slots!
    }
    two.outputValidators = {
      synthetic_second: two.outputValidators!.find_available_slots!
    }
    attestReviewedPlugin(two, {
      ...reviewedDescriptor(
        gatewayCore(f.input.capabilityGateway)!.resolve(
          f.config,
          'find_available_slots'
        )!
      )!,
      id: 'synthetic_second',
      providerId: 'synthetic.second'
    })
    f.config.plugins.push({
      plugin: 'synthetic.second',
      version: '1.0.0',
      enabled: true,
      allowedTools: ['synthetic_second'],
      config: {}
    })
    f.prepared.input.capabilityGateway = new CapabilityGateway(
      new PluginRegistry([one, two]),
      { actorAuthorizer: ({ requiredPermission }) => [requiredPermission] }
    )
    const resolve = vi.fn()
    f.prepared.input.resolveCapabilityApproval = resolve
    const result = await executeControlledKernel(f.prepared, f.ports)
    expect(result.stop).toBe('UNSAFE_REQUEST')
    expect(result.tools.map((t) => t.status)).toEqual(['not_run', 'not_run'])
    expect(result.attempts).toEqual([])
    expect(resolve).not.toHaveBeenCalled()
  })
})
