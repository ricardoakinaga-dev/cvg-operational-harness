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

const phases = [
  'audit.runtime_v2.started',
  'audit.orchestrator.decided',
  'audit.observation.recorded',
  'audit.step.started',
  'audit.step.completed',
  'audit.evaluation.completed',
  'audit.runtime.completed',
  'log.model/request',
  'log.model/result',
  'log.tool/call',
  'log.tool/result',
  'effects.started',
  'effects.finished',
  'journal.reserve',
  'journal.markStarted',
  'journal.confirm',
  'step.recordStep',
  'step.saveCheckpoint'
]
describe('mandatory evidence latches and final handler admission', () => {
  it.each(['healthy', 'reject', 'hang'] as const)(
    'preserves the final deadline veto and bounded terminal evidence (%s)',
    async (mode) => {
      vi.useFakeTimers()
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
      const callback = vi.fn()
      f.prepared.input.onToolAudit = callback
      let started = false
      let crossed = false
      const markStarted = f.ports.effectJournal.markStarted.bind(
        f.ports.effectJournal
      )
      f.ports.effectJournal.markStarted = async (input) => {
        const value = await markStarted(input)
        started = true
        return value
      }
      const expires = Date.now() + f.config.model.timeoutMs
      f.ports.pause = {
        isPaused: () => {
          if (started && !crossed) {
            crossed = true
            vi.setSystemTime(expires + 1)
          }
          return false
        }
      }
      let toolResults = 0
      let terminalAudits = 0
      const append = f.ports.log.append.bind(f.ports.log)
      f.ports.log.append = async (event) => {
        if (event.type === 'tool/result') {
          toolResults++
          if (mode === 'reject')
            throw new Error('synthetic terminal log failure')
          if (mode === 'hang') return new Promise<void>(() => undefined)
        }
        await append(event)
      }
      const audit = f.ports.audit.append.bind(f.ports.audit)
      f.ports.audit.append = async (event) => {
        if (['runtime.completed', 'runtime.stopped'].includes(event.action))
          terminalAudits++
        await audit(event)
      }
      const running = executeControlledKernel(f.prepared, f.ports)
      await vi.advanceTimersByTimeAsync(2000)
      const result = await running
      expect(crossed).toBe(true)
      expect(result.stop).toBe(
        mode === 'healthy' ? 'MAX_DURATION' : 'INSUFFICIENT_EVIDENCE'
      )
      expect(result.attempts[0]).toMatchObject({
        phase: 'CLOSED_WITHOUT_ENTRY',
        cause: 'MAX_DURATION',
        closed: true,
        approvalConsumed: true
      })
      expect(result.attempts[0]!.command.output).toBeUndefined()
      expect(result.response.mode).toBe('handoff')
      expect(result.tools[0]?.status).toBe('failed')
      expect(toolResults).toBe(1)
      if (mode === 'healthy') {
        expect(result.evidence.fault).toBeNull()
        expect(terminalAudits).toBe(1)
        expect(callback).toHaveBeenCalledTimes(1)
      } else {
        expect(result.evidence.fault?.phase).toBe('log.tool/result')
        expect(callback).not.toHaveBeenCalled()
      }
      expect((await authority.get(approval.id, f.input.tenantId))?.status).toBe(
        'consumed'
      )
      expect(
        (
          await f.ports.effectJournal.get(
            f.input.tenantId,
            result.attempts[0]!.operationKey!
          )
        )?.state
      ).not.toBe('CONFIRMED')
      const snapshot = JSON.stringify({
        stop: result.stop,
        tools: result.tools,
        response: result.response,
        cause: result.attempts[0]!.cause
      })
      await vi.advanceTimersByTimeAsync(1000)
      expect(
        JSON.stringify({
          stop: result.stop,
          tools: result.tools,
          response: result.response,
          cause: result.attempts[0]!.cause
        })
      ).toBe(snapshot)
    }
  )

  it.each(
    phases.flatMap((phase) =>
      ['reject', 'hang'].map((mode) => ({ phase, mode }))
    )
  )('fails closed at $phase ($mode)', async ({ phase, mode }) => {
    vi.useFakeTimers()
    const f = await fixture()
    let injected = false
    const io = InvocationEvidenceState.prototype.io
    vi.spyOn(InvocationEvidenceState.prototype, 'io').mockImplementation(
      function <T>(
        this: InvocationEvidenceState,
        observed: string,
        operation: () => T | PromiseLike<T>,
        terminal?: boolean
      ) {
        if (observed === phase && !injected) {
          injected = true
          return io.call(
            this,
            observed,
            () =>
              mode === 'reject'
                ? Promise.reject(new Error('private synthetic detail'))
                : new Promise<T>(() => undefined),
            terminal
          ) as Promise<T>
        }
        return io.call(this, observed, operation, terminal) as Promise<T>
      }
    )
    const running = executeControlledKernel(f.prepared, f.ports)
    await vi.advanceTimersByTimeAsync(1600)
    const result = await running
    expect(injected).toBe(true)
    expect(result.stop).toBe('INSUFFICIENT_EVIDENCE')
    expect(result.evidence.fault).not.toBeNull()
    if (mode === 'reject') expect(result.evidence.fault?.phase).toBe(phase)
    expect(result.tools.every((t) => t.status !== 'succeeded')).toBe(true)
    if (
      ![
        'journal.confirm',
        'effects.finished',
        'log.tool/result',
        'audit.runtime.completed'
      ].includes(phase)
    ) {
      expect(result.attempts.every((a) => a.phase !== 'ENTERED')).toBe(true)
    }
    expect(result.response).toEqual({
      mode: 'handoff',
      text: 'Vou encaminhar sua solicitação para a equipe responsável.'
    })
  })

  it('keeps CONFIRMED privately after callback failure and invokes the callback once', async () => {
    const f = await fixture()
    const audit = vi.fn().mockRejectedValue(new Error('callback synthetic'))
    f.prepared.input.onToolAudit = audit
    const result = await executeControlledKernel(f.prepared, f.ports)
    expect(result.stop).toBe('INSUFFICIENT_EVIDENCE')
    expect(audit).toHaveBeenCalledTimes(1)
    expect(result.tools[0]?.status).toBe('failed')
    const record = await f.ports.effectJournal.get(
      f.input.tenantId,
      result.attempts[0]!.operationKey!
    )
    expect(record?.state).toBe('CONFIRMED')
  })

  it.each([
    'CONFIRMED',
    'EFFECT_STARTED',
    'UNCERTAIN',
    'FOREIGN_RESERVED',
    'WRONG_HASH'
  ] as const)(
    'honors bound journal state %s without a second handler entry',
    async (status) => {
      const f = await fixture()
      const journal = f.ports.effectJournal
      const reserve = journal.reserve.bind(journal)
      journal.reserve = async (input) => {
        const r = await reserve(input)
        if (status === 'WRONG_HASH') return { ...r, proposalHash: 'different' }
        if (status === 'FOREIGN_RESERVED')
          return { ...r, attemptId: 'attempt_other' }
        await journal.markStarted(input)
        if (status === 'CONFIRMED')
          return journal.confirm({
            ...input,
            result: { controlled: true, dryRun: true, slots: [] }
          })
        if (status === 'UNCERTAIN')
          return journal.markUncertain({
            ...input,
            reason: 'synthetic_previous_uncertainty'
          })
        return (await journal.get(input.tenantId, input.operationKey))!
      }
      const result = await executeControlledKernel(f.prepared, f.ports)
      expect(result.attempts[0]?.phase).toBe('CLOSED_WITHOUT_ENTRY')
      expect(result.stop === 'COMPLETED').toBe(status === 'CONFIRMED')
      if (status === 'CONFIRMED')
        expect(result.tools[0]?.status).toBe('succeeded')
      else expect(result.tools[0]?.status).not.toBe('succeeded')
    }
  )

  it.each(['effects.started', 'journal.markStarted'])(
    'rechecks pause after %s ACK, without handler entry',
    async (phase) => {
      const f = await fixture()
      let paused = false
      f.ports.pause = { isPaused: () => paused }
      const io = InvocationEvidenceState.prototype.io
      vi.spyOn(InvocationEvidenceState.prototype, 'io').mockImplementation(
        function <T>(
          this: InvocationEvidenceState,
          observed: string,
          operation: () => T | PromiseLike<T>,
          terminal?: boolean
        ) {
          return io.call(
            this,
            observed,
            async () => {
              const value = await operation()
              if (observed === phase) paused = true
              return value
            },
            terminal
          ) as Promise<T>
        }
      )
      const result = await executeControlledKernel(f.prepared, f.ports)
      expect(result.stop).toBe('HUMAN_TAKEOVER')
      expect(result.attempts[0]).toMatchObject({
        phase: 'CLOSED_WITHOUT_ENTRY',
        cause: 'HUMAN_TAKEOVER',
        closed: true
      })
      expect(result.tools[0]?.status).toBe('blocked')
    }
  )

  it('checks cancellation again after the synchronous final pause read', async () => {
    const f = await fixture()
    let controller: AbortController | undefined
    let atFinalAdmission = false
    f.ports.pause = {
      isPaused: () => {
        if (atFinalAdmission) controller!.abort()
        return false
      }
    }
    const io = InvocationEvidenceState.prototype.io
    vi.spyOn(InvocationEvidenceState.prototype, 'io').mockImplementation(
      function <T>(
        this: InvocationEvidenceState,
        phase: string,
        operation: () => T | PromiseLike<T>,
        terminal?: boolean
      ) {
        controller = this.controller
        return io.call(
          this,
          phase,
          async () => {
            const value = await operation()
            if (phase === 'journal.markStarted') atFinalAdmission = true
            return value
          },
          terminal
        ) as Promise<T>
      }
    )
    const result = await executeControlledKernel(f.prepared, f.ports)
    expect(result.stop).toBe('CANCELLED')
    expect(result.attempts[0]).toMatchObject({
      phase: 'CLOSED_WITHOUT_ENTRY',
      cause: 'CANCELLED',
      closed: true
    })
  })

  it('closes PENDING on cancellation before a journal ACK and keeps the first result immutable after late ACK', async () => {
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
    let acknowledge!: () => void
    const held = new Promise<void>((resolve) => {
      acknowledge = resolve
    })
    let entered!: () => void
    const atJournal = new Promise<void>((resolve) => {
      entered = resolve
    })
    let controller!: AbortController
    const io = InvocationEvidenceState.prototype.io
    vi.spyOn(InvocationEvidenceState.prototype, 'io').mockImplementation(
      function <T>(
        this: InvocationEvidenceState,
        phase: string,
        operation: () => T | PromiseLike<T>,
        terminal?: boolean
      ) {
        controller = this.controller
        return io.call(
          this,
          phase,
          async () => {
            const result = await operation()
            if (phase === 'journal.markStarted') {
              entered()
              await held
            }
            return result
          },
          terminal
        ) as Promise<T>
      }
    )
    const running = executeControlledKernel(f.prepared, f.ports)
    await atJournal
    controller.abort()
    const result = await running
    expect(result.stop).toBe('CANCELLED')
    expect(result.attempts[0]).toMatchObject({
      phase: 'CLOSED_WITHOUT_ENTRY',
      cause: 'CANCELLED',
      closed: true,
      approvalConsumed: true
    })
    const first = JSON.stringify({
      tools: result.tools,
      response: result.response,
      stop: result.stop,
      admission: result.attempts[0]
    })
    acknowledge()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(
      JSON.stringify({
        tools: result.tools,
        response: result.response,
        stop: result.stop,
        admission: result.attempts[0]
      })
    ).toBe(first)
    expect(
      (
        await authority.get(
          f.prepared.input.capabilityApproval.id,
          f.input.tenantId
        )
      )?.status
    ).toBe('consumed')
    expect(
      (
        await f.ports.effectJournal.get(
          f.input.tenantId,
          result.attempts[0]!.operationKey!
        )
      )?.state
    ).not.toBe('CONFIRMED')
  })

  it.each(['throw', 'async', 'invalid'] as const)(
    'fails closed for a %s pause reader',
    async (kind) => {
      const f = await fixture()
      let started = false
      const original = f.ports.effectJournal.markStarted
      f.ports.effectJournal.markStarted = async (input) => {
        const r = await original.call(f.ports.effectJournal, input)
        started = true
        return r
      }
      f.ports.pause = {
        isPaused: () => {
          if (!started) return false
          if (kind === 'throw') throw new Error('synthetic')
          if (kind === 'async') return Promise.resolve(false)
          return 'invalid' as never
        }
      }
      const result = await executeControlledKernel(f.prepared, f.ports)
      expect(result.stop).toBe('INTERNAL_FAILURE')
      expect(result.attempts[0]?.phase).toBe('CLOSED_WITHOUT_ENTRY')
    }
  )
})
