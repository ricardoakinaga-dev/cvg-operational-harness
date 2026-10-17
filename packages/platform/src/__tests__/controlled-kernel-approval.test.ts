import { afterEach, describe, expect, it, vi } from 'vitest'

import { AgentConfigSchema } from '../contracts.ts'
import { InMemoryControlPlaneStore } from '../control-plane-store.ts'
import { createControlledCapabilityGateway } from '../controlled-plugins.ts'

import { InMemoryCapabilityApprovalAuthority } from '../approval-authority.ts'
import { DeterministicModelProvider } from '../model-provider.ts'
import { createControlledTraceTiming } from '../test-lab.ts'
import { createTraceId } from '../ids.ts'
import {
  executeControlledKernel,
  createLocalControlledPorts,
  type ControlledKernelInput
} from '../controlled-kernel-execution.ts'
import { InvocationEvidenceState } from '../controlled-kernel-adapters.ts'

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

async function approvedFixture() {
  const f = await fixture()
  const authority = new InMemoryCapabilityApprovalAuthority()
  const approval = await authority.issue({
    tenantId: f.input.tenantId,
    agentId: f.input.agentId,
    versionId: f.input.versionId,
    toolName: 'find_available_slots',
    input: { message: f.input.message },
    actorId: f.input.actor.id,
    issuer: 'human.synthetic',
    expiresAt: new Date(Date.now() + 60_000)
  })
  f.prepared.input.capabilityApproval = {
    id: approval.id,
    tenantId: approval.tenantId,
    agentId: approval.agentId,
    versionId: approval.versionId,
    toolName: approval.toolName,
    actorId: approval.actorId,
    expiresAt: approval.expiresAt
  }
  f.prepared.input.requireCapabilityApproval = true
  f.prepared.input.capabilityGateway = createControlledCapabilityGateway({
    approvalAuthority: authority
  })
  return { ...f, authority, approval }
}

describe('legacy atomic one-use approval inside the real kernel', () => {
  it('consumes once before entry and denies replay with no release', async () => {
    const f = await approvedFixture()
    const consume = vi.spyOn(f.authority, 'verifyAndConsume')
    const result = await executeControlledKernel(f.prepared, f.ports)
    expect(result.stop).toBe('COMPLETED')
    expect(result.attempts[0]).toMatchObject({
      approvalRequired: true,
      approvalConsumed: true,
      phase: 'ENTERED'
    })
    expect(consume).toHaveBeenCalledTimes(1)
    expect(consume.mock.calls[0]![0]).toMatchObject({
      input: { message: f.input.message },
      actorId: f.input.actor.id,
      consumptionAudit: { traceId: f.input.traceId }
    })
    expect(
      (await f.authority.get(f.approval.id, f.input.tenantId))?.status
    ).toBe('consumed')
    const replay = await executeControlledKernel(f.prepared)
    expect(replay.stop).toBe('POLICY_DENIED')
    expect(replay.attempts[0]?.phase).toBe('CLOSED_WITHOUT_ENTRY')
    expect(consume).toHaveBeenCalledTimes(1)
  })

  it('allows at most one body under two callers racing on the authority', async () => {
    const f = await approvedFixture()
    const results = await Promise.all([
      executeControlledKernel(f.prepared),
      executeControlledKernel(f.prepared)
    ])
    expect(results.filter((r) => r.stop === 'COMPLETED')).toHaveLength(1)
    expect(
      results.flatMap((r) => r.attempts).filter((a) => a.phase === 'ENTERED')
    ).toHaveLength(1)
    expect(
      (await f.authority.get(f.approval.id, f.input.tenantId))?.status
    ).toBe('consumed')
  })

  it.each([
    'actor',
    'tenant',
    'version',
    'tool',
    'input',
    'expired',
    'revoked',
    'clock'
  ] as const)(
    'rejects changed %s without consuming or entering',
    async (field) => {
      const f = await approvedFixture()
      const consume = vi.spyOn(f.authority, 'verifyAndConsume')
      const approval = { ...f.approval }
      if (field === 'actor') approval.actorId = 'system.other'
      if (field === 'tenant')
        approval.tenantId = 'tenant_00000000-0000-4000-8000-000000000215'
      if (field === 'version')
        approval.versionId =
          'agent_version_00000000-0000-4000-8000-000000000215'
      if (field === 'tool') approval.toolName = 'different_tool'
      if (field === 'input') f.prepared.input.message += ' changed'
      if (field === 'expired') approval.expiresAt = new Date(Date.now() - 1)
      if (field === 'revoked')
        await f.authority.revoke(
          approval.id,
          'human.synthetic',
          f.input.tenantId
        )
      if (field === 'clock')
        f.prepared.input.capabilityGateway = createControlledCapabilityGateway({
          approvalAuthority: f.authority,
          now: () => new Date(NaN)
        })
      f.prepared.input.capabilityApproval = {
        id: approval.id,
        tenantId: approval.tenantId,
        agentId: approval.agentId,
        versionId: approval.versionId,
        toolName: approval.toolName,
        actorId: approval.actorId,
        expiresAt: approval.expiresAt
      }
      const result = await executeControlledKernel(f.prepared)
      expect(result.stop).toBe('POLICY_DENIED')
      expect(result.attempts[0]?.phase).toBe('CLOSED_WITHOUT_ENTRY')
      expect(consume).not.toHaveBeenCalled()
    }
  )

  it('never releases a consumed grant after a terminal audit fault', async () => {
    const f = await approvedFixture()
    const append = f.ports.audit.append
    f.ports.audit.append = (event) =>
      event.action === 'runtime.completed'
        ? Promise.reject(new Error('synthetic'))
        : append(event)
    const result = await executeControlledKernel(f.prepared, f.ports)
    expect(result.attempts[0]?.approvalConsumed).toBe(true)
    expect(result.stop).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.tools[0]?.status).toBe('failed')
    expect(
      (await f.authority.get(f.approval.id, f.input.tenantId))?.status
    ).toBe('consumed')
  })

  it('keeps a consumed grant uncertain when begin ACK is lost, without body or automatic replay', async () => {
    vi.useFakeTimers()
    const f = await approvedFixture()
    const consume = vi.spyOn(f.authority, 'verifyAndConsume')
    const io = InvocationEvidenceState.prototype.io
    vi.spyOn(InvocationEvidenceState.prototype, 'io').mockImplementation(
      function <T>(
        this: InvocationEvidenceState,
        phase: string,
        operation: () => T | PromiseLike<T>,
        terminal?: boolean
      ) {
        return io.call(
          this,
          phase,
          async () => {
            const value = await operation()
            if (phase === 'approval.begin') await new Promise(() => undefined)
            return value
          },
          terminal
        ) as Promise<T>
      }
    )
    const running = executeControlledKernel(f.prepared, f.ports)
    await vi.advanceTimersByTimeAsync(1600)
    const result = await running
    expect(result.stop).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.attempts[0]?.phase).toBe('CLOSED_WITHOUT_ENTRY')
    expect(consume).toHaveBeenCalledTimes(1)
    expect(
      (await f.authority.get(f.approval.id, f.input.tenantId))?.status
    ).toBe('consumed')
  })
})
