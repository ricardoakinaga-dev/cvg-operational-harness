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
  reviewedDescriptor,
  matchesPreparedInput,
  matchesPreparedOutput
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

describe('one canonical input and one canonical output transformation', () => {
  it.each(['gateway', 'kernel'] as const)(
    'applies defaults/transforms exactly once through %s',
    async (path) => {
      const f = await fixture()
      let inputParses = 0
      let outputParses = 0
      const received: unknown[] = []
      const plugin = createControlledSchedulingPlugin()
      const descriptor = reviewedDescriptor(
        gatewayCore(f.input.capabilityGateway)!.resolve(
          f.config,
          'find_available_slots'
        )!
      )!
      plugin.inputValidators!.find_available_slots = z
        .object({ message: z.string(), number: z.string().default('7') })
        .transform((value) => ({
          ...value,
          number: Number(value.number) + inputParses++
        }))
      plugin.outputValidators!.find_available_slots = z
        .object({ value: z.string() })
        .transform((value) => ({ value: Number(value.value) + outputParses++ }))
      plugin.handlers.find_available_slots = (value) => {
        received.push(value)
        return { status: 'succeeded', data: { value: '11' } }
      }
      attestReviewedPlugin(plugin, descriptor) // trusted reviewed test implementation, never client metadata
      const authorized: unknown[] = []
      const gateway = new CapabilityGateway(new PluginRegistry([plugin]), {
        actorAuthorizer: ({ requiredPermission }) => [requiredPermission]
      })
      f.prepared.input.capabilityGateway = gateway
      if (path === 'gateway') {
        expect(
          await gateway.execute({
            tenantId: f.input.tenantId,
            agentId: f.input.agentId,
            versionId: f.input.versionId,
            config: f.config,
            toolName: 'find_available_slots',
            input: { message: f.input.message },
            actor: f.input.actor,
            policy: f.prepared.policy,
            dryRun: true
          })
        ).toMatchObject({ status: 'succeeded', data: { value: 11 } })
      } else {
        const append = f.ports.log.append
        f.ports.log.append = (event) => {
          if (event.type === 'tool/call') authorized.push(event.input)
          return append(event)
        }
        const result = await executeControlledKernel(f.prepared, f.ports)
        expect(result.stop).toBe('COMPLETED')
        expect(result.attempts[0]!.command.output).toMatchObject({
          data: { value: 11 }
        })
        expect(authorized).toEqual([{ message: f.input.message, number: 7 }])
        expect(
          matchesPreparedInput(result.attempts[0]!.command, {
            message: f.input.message,
            number: 7
          })
        ).toBe(true)
        expect(
          matchesPreparedInput(result.attempts[0]!.command, {
            message: f.input.message,
            number: 8
          })
        ).toBe(false)
        expect(
          matchesPreparedOutput(result.attempts[0]!.command, { value: 11 })
        ).toBe(true)
      }
      expect(received).toEqual([{ message: f.input.message, number: 7 }])
      expect(inputParses).toBe(1)
      expect(outputParses).toBe(1)
    }
  )

  it('keeps output undefined without invoking the output validator', async () => {
    const f = await fixture()
    const plugin = createControlledSchedulingPlugin()
    plugin.handlers.find_available_slots = () => ({ status: 'succeeded' })
    const parse = vi.fn(() => {
      throw new Error('must not parse absent output')
    })
    plugin.outputValidators!.find_available_slots = { safeParse: parse }
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
    const result = await executeControlledKernel(f.prepared, f.ports)
    expect(result.stop).toBe('COMPLETED')
    expect(parse).not.toHaveBeenCalled()
  })
})
