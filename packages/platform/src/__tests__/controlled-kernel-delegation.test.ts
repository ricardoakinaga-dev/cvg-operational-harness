import { afterEach, describe, expect, it, vi } from 'vitest'

import { STOP_REASONS } from '@cvg/harness-contracts'
import { AgentConfigSchema } from '../contracts.ts'
import { InMemoryControlPlaneStore } from '../control-plane-store.ts'
import { createControlledCapabilityGateway } from '../controlled-plugins.ts'
import { CapabilityGateway } from '../plugin-gateway.ts'

import { DeterministicModelProvider } from '../model-provider.ts'
import {
  executeConfiguredAgent,
  createControlledTraceTiming
} from '../test-lab.ts'
import { createTraceId } from '../ids.ts'
import {
  executeControlledKernel,
  createLocalControlledPorts,
  type ControlledKernelInput
} from '../controlled-kernel-execution.ts'

import {
  CONTROLLED_STOP_PROJECTION,
  projectControlledTools
} from '../controlled-execution-plan.ts'

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

describe('configured execution on the real iterative kernel', () => {
  it('records one model request and a real governed tool before final response', async () => {
    const f = await fixture()
    const events: string[] = []
    const append = f.ports.log.append
    f.ports.log.append = async (event) => {
      events.push(event.type)
      await append(event)
    }
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const publicGateway = vi.spyOn(f.input.capabilityGateway, 'execute')
    const result = await executeControlledKernel(f.prepared, f.ports)
    expect({
      stop: result.stop,
      raw: result.rawStop,
      fault: result.evidence.fault,
      result: result.result,
      attempts: result.attempts
    }).toMatchObject({ stop: 'COMPLETED' })
    expect(result.result).toMatchObject({
      modelCalls: 1,
      toolCalls: 1,
      steps: 3
    })
    expect(result.tools).toEqual([
      { name: 'find_available_slots', status: 'succeeded' }
    ])
    expect(events).toEqual([
      'model/request',
      'model/result',
      'tool/call',
      'tool/result'
    ])
    expect(model).toHaveBeenCalledTimes(1)
    expect(publicGateway).not.toHaveBeenCalled()
    expect(result.attempts[0]).toMatchObject({
      phase: 'ENTERED',
      closed: true,
      policyAllowed: true,
      resultAcknowledged: true
    })
  })

  it('normalizes provider exceptions through the public façade', async () => {
    const f = await fixture()
    vi.spyOn(
      DeterministicModelProvider.prototype,
      'complete'
    ).mockRejectedValue(new Error('private provider stack'))
    const trace = await executeConfiguredAgent(f.input)
    expect(trace).toMatchObject({
      status: 'failed',
      response: {
        mode: 'handoff',
        text: 'Vou encaminhar sua solicitação para a equipe responsável.'
      },
      handoff: { reason: 'controlled_runtime_model_failure' },
      tools: []
    })
    expect(trace.outputPolicy).toBeUndefined()
    expect(JSON.stringify(trace)).not.toContain('private provider stack')
    expect(trace.tokenUsage?.completion).toBe(0)
  })

  it.each([
    null,
    {},
    { text: '' },
    { text: 'x'.repeat(4001) },
    { text: 'Prescreva ibuprofeno.' }
  ])(
    'guards malformed/hostile output before opaque planning (%j)',
    async (completion) => {
      const f = await fixture()
      const opaque = {
        planTools: vi.fn(),
        execute: vi.fn()
      } as unknown as CapabilityGateway
      f.prepared.input.capabilityGateway = opaque
      vi.spyOn(
        DeterministicModelProvider.prototype,
        'complete'
      ).mockResolvedValue(completion as never)
      const result = await executeControlledKernel(f.prepared, f.ports)
      expect(result.stop).toBe('COMPLETED')
      expect(result.output?.decision).toBe('rewritten')
      expect(opaque.planTools).not.toHaveBeenCalled()
      expect(result.tools).toEqual([])
    }
  )

  it('maps exactly all 23 stops and masks successes beyond the checkpoint window', () => {
    expect(Object.keys(CONTROLLED_STOP_PROJECTION)).toEqual([...STOP_REASONS])
    expect(
      Object.values(CONTROLLED_STOP_PROJECTION).filter(
        (x) => x.status === 'blocked'
      )
    ).toHaveLength(5)
    const names = Array.from({ length: 61 }, (_, i) => `synthetic_${i}`)
    const attempts = names.map((name) => ({
      command: {
        execution: { toolName: name },
        output: { status: 'succeeded' }
      },
      attempted: true,
      resultAcknowledged: true,
      phase: 'ENTERED'
    })) as unknown as Parameters<typeof projectControlledTools>[1]
    expect(
      projectControlledTools(names, attempts, 'COMPLETED').every(
        (t) => t.status === 'succeeded'
      )
    ).toBe(true)
    for (const stop of STOP_REASONS.filter((s) => s !== 'COMPLETED')) {
      expect(projectControlledTools(names, attempts, stop)).toEqual(
        names.map((name) => ({ name, status: 'failed' }))
      )
    }
    const denied = { ...attempts[0]!, denied: true }
    const untried = { ...attempts[1]!, attempted: false }
    expect(
      projectControlledTools(
        names.slice(0, 2),
        [denied, untried],
        'POLICY_DENIED'
      )
    ).toEqual([
      { name: names[0], status: 'blocked' },
      { name: names[1], status: 'not_run' }
    ])
    const failed = {
      ...attempts[1]!,
      command: {
        ...attempts[1]!.command,
        output: { status: 'failed' as const }
      }
    }
    expect(
      projectControlledTools(
        names.slice(0, 2),
        [attempts[0]!, failed],
        'TOOL_FAILURE'
      )
    ).toEqual([
      { name: names[0], status: 'failed' },
      { name: names[1], status: 'failed' }
    ])
  })

  it('uses the translated prompt budget, not config.maxTokens or a second model call', async () => {
    const f = await fixture()
    f.config.plugins = []
    f.prepared.promptWithHistory = 'p'.repeat(1000)
    const model = vi
      .spyOn(DeterministicModelProvider.prototype, 'complete')
      .mockResolvedValue({
        text: 'x'.repeat(4000),
        provider: 'fake',
        model: 'deterministic-v1',
        externalCall: false
      })
    const result = await executeControlledKernel(f.prepared, f.ports)
    expect(result.stop).toBe('COMPLETED')
    expect(result.result?.usage).toEqual({
      inputTokens: 250,
      outputTokens: 1000,
      costUsd: 0
    })
    expect(model).toHaveBeenCalledTimes(1)
  })

  it('does not restore output or tool entry after a late model result past deadline', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    vi.spyOn(
      DeterministicModelProvider.prototype,
      'complete'
    ).mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                text: 'Resposta controlada.',
                provider: 'fake',
                model: 'deterministic-v1',
                externalCall: false
              }),
            1100
          )
        )
    )
    const running = executeControlledKernel(f.prepared, f.ports)
    await vi.advanceTimersByTimeAsync(1001)
    const result = await running
    expect(result.stop).toBe('MAX_DURATION')
    expect(result.attempts).toEqual([])
    expect(result.output).toBeUndefined()
    const first = JSON.stringify({
      stop: result.stop,
      response: result.response,
      tools: result.tools
    })
    await vi.advanceTimersByTimeAsync(200)
    expect(
      JSON.stringify({
        stop: result.stop,
        response: result.response,
        tools: result.tools
      })
    ).toBe(first)
  })
})
