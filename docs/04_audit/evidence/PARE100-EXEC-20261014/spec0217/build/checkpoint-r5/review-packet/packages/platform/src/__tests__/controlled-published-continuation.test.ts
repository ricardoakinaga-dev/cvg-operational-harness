import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCorrelationId } from '@cvg/shared'
import { validateCheckpointIntegrity } from '@cvg/harness'
import * as publicHarness from '@cvg/harness'
import * as inputBoundary from '../tool-invocation-boundary.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  InMemoryCapabilityApprovalAuthority,
  createCapabilityInputHash
} from '../approval-authority.ts'
import { PlatformEventBus } from '../event-bus.ts'
import { AgentConfigSchema } from '../contracts.ts'
import { InMemoryControlPlaneStore } from '../control-plane-store.ts'
import { createControlledCapabilityGateway } from '../controlled-plugins.ts'
import { createTraceId } from '../ids.ts'
import { DeterministicModelProvider } from '../model-provider.ts'
import {
  executeConfiguredAgent,
  type ControlledAgentExecutionInput
} from '../test-lab.ts'
import { createLocalControlledPorts } from '../controlled-kernel-execution.ts'
import {
  controlledCanonicalJson,
  controlledDigest,
  ControlledContinuationRuntime,
  prepareControlledPublishedAdmission,
  validateControlledSnapshot,
  type ControlledKernelHostContext,
  type ControlledPublishedPrepared,
  type ControlledPublishedState,
  type ControlledPhaseRef
} from '../controlled-kernel-continuation.ts'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
async function fixture() {
  const tenantId = 'tenant_00000000-0000-4000-8000-000000000217'
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
      timeoutMs: 10000,
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
    { slug: 'synthetic-217', name: 'Synthetic', description: 'Synthetic only' }
  )
  const version = await store.createVersion(
    { tenantId },
    agent.id,
    config,
    'synthetic'
  )
  const input: ControlledAgentExecutionInput = {
    store,
    tenantId,
    agentId: agent.id,
    versionId: version.id,
    traceId: createTraceId(),
    message: 'Quero uma consulta',
    history: [],
    executionMode: 'TEST_LAB',
    actor: { id: 'system.synthetic', role: 'System', permissions: [] },
    capabilityGateway: createControlledCapabilityGateway(),
    context: {
      conversationId: 'conversation-synthetic',
      sessionId: 'session-synthetic'
    }
  }
  const correlationId = createCorrelationId()
  const admission = () =>
    prepareControlledPublishedAdmission({
      version,
      input: {
        tenantId,
        agentId: input.agentId,
        versionId: version.id,
        message: input.message,
        history: input.history,
        executionMode: input.executionMode,
        ...(input.requireCapabilityApproval
          ? { requireCapabilityApproval: true }
          : {}),
        executionId: 'exec_00000000-0000-4000-8000-000000000217',
        traceId: input.traceId!,
        correlationId,
        inboundMessageId: 'inbound-synthetic',
        context: {
          conversationId: 'conversation-synthetic',
          sessionId: 'session-synthetic'
        }
      },
      actor: input.actor!,
      gateway: input.capabilityGateway!
    })
  const requestDigest = admission().requestDigest
  let state: ControlledPublishedState = {
    phaseState: 'IDLE_SEALED',
    snapshot: null,
    checkpoint: null,
    closedTrace: null,
    runtimeResult: null,
    sealId: 'seal-S0',
    stateRevision: 0,
    sequence: 0,
    hash: controlledDigest(['genesis']),
    sealCheckpointDigest: null,
    sealStateDigest: null,
    sealedThroughSequence: 0,
    phaseRevision: 0,
    openPhase: null,
    consumedSealId: null
  }
  let prepared: ControlledPublishedPrepared | null = null
  let startedAt = ''
  let expiresAt = ''
  let ordinal = 0
  let active: ControlledPhaseRef | null = null
  let offline = false
  let crashAfterS1 = false
  let crashAfterS2 = false
  const observations: string[] = []
  const seals: ControlledPublishedState[] = []
  const checkOnline = () => {
    if (offline) throw new Error('synthetic-unavailable')
  }
  const ack = () => ({
    sequence: ++state.sequence,
    hash: controlledDigest(['evidence', state.sequence])
  })
  const makeHost = (attempt = 1): ControlledKernelHostContext => {
    const ports = createLocalControlledPorts()
    const writeCheckpoint = ports.stepStore.saveCheckpoint.bind(ports.stepStore)
    ports.stepStore.loadCheckpoint = async () => state.checkpoint
    const host: ControlledKernelHostContext = {
      identity: {
        tenantId,
        executionId: 'exec_00000000-0000-4000-8000-000000000217',
        workerId: `synthetic-worker-${attempt}`,
        attempt,
        correlationId,
        traceId: input.traceId!,
        inboundMessageId: 'inbound-synthetic',
        conversationId: 'conversation-synthetic',
        sessionId: 'session-synthetic',
        agentId: input.agentId,
        versionId: version.id,
        requestDigest,
        outboxId: 'outbox-synthetic',
        outerAttempt: attempt,
        outerWorkerId: `synthetic-worker-${attempt}`,
        outerAttemptRowId: String(attempt)
      },
      signal: new AbortController().signal,
      expiresAt: expiresAt || null,
      ports,
      get state() {
        return state
      },
      continuation: {
        startPrepared: async (_f, p, runtime) => {
          checkOnline()
          observations.push('startPrepared')
          expect(runtime.executionId).toBe(host.identity.executionId)
          expect(runtime.signal).toBeUndefined()
          if (prepared)
            expect(controlledDigest(p)).toBe(controlledDigest(prepared))
          else {
            prepared = clone(p)
            startedAt = new Date().toISOString()
            expiresAt = new Date(
              Date.parse(startedAt) + config.model.timeoutMs
            ).toISOString()
          }
          return {
            preparedDigest: controlledDigest(prepared),
            startedAt,
            expiresAt
          }
        },
        beginPhase: async (f, sealId, type, inputDigest) => {
          checkOnline()
          expect(active).toBeNull()
          expect(sealId).toBe(state.sealId)
          observations.push(`intent:${type}`)
          state.phaseState = 'OPEN'
          state.consumedSealId = sealId
          ack()
          active = {
            phaseId: `phase-${++ordinal}`,
            phaseType: type,
            phaseRevision: ordinal,
            attempt: f.attempt,
            inputDigest
          }
          state.openPhase = active
          state.phaseRevision = ordinal
          return active
        },
        ackPhase: async (_f, phase) => {
          checkOnline()
          expect(active?.phaseId).toBe(phase.phaseId)
          observations.push(`ack:${phase.phaseType}`)
          active = null
          state.openPhase = null
          return ack()
        },
        saveResumePoint: async (_f, s, c, sequence) => {
          checkOnline()
          expect(active).toBeNull()
          expect(sequence).toBe(state.sequence)
          validateCheckpointIntegrity(c, {
            tenantId,
            executionId: host.identity.executionId
          })
          await writeCheckpoint(c)
          state = {
            ...state,
            ...ack(),
            phaseState: 'IDLE_SEALED',
            snapshot: clone(s),
            checkpoint: clone(c),
            sealId: `seal-${s.safePoint}`,
            stateRevision: state.stateRevision + 1,
            sealStateDigest: controlledDigest(s),
            sealCheckpointDigest: controlledDigest(clone(c)),
            sealedThroughSequence: sequence,
            openPhase: null,
            consumedSealId: null
          }
          seals.push(clone(state))
          observations.push(`seal:${s.safePoint}`)
          if (
            (crashAfterS1 && s.safePoint === 'S1') ||
            (crashAfterS2 && s.safePoint === 'S2')
          )
            offline = true
          return {
            sealId: state.sealId,
            stateRevision: state.stateRevision,
            sequence: state.sequence,
            hash: state.hash
          }
        },
        poison: async () => {
          checkOnline()
          state.phaseState = 'FAULTED'
          observations.push('poison')
        },
        close: async (_f, s, r, t) => {
          checkOnline()
          observations.push('close')
          state = {
            ...state,
            phaseState: 'CLOSED',
            snapshot: clone(s),
            runtimeResult: clone(r),
            closedTrace: t
          }
        }
      },
      approvalConsumption: {
        consumeBoundApproval: async () => {
          throw new Error('unexpected-approval')
        }
      },
      admission: {
        readGuards: async () => {
          checkOnline()
          return { paused: false, cancelled: false, expiresAt }
        },
        prepareDispatch: async (f, phase, command) => {
          checkOnline()
          observations.push('permit')
          return {
            permitId: 'permit-synthetic',
            ...f,
            ...command,
            expiresAt,
            leaseUntil: expiresAt,
            phaseId: phase.phaseId
          }
        }
      },
      lifecycle: {
        assertActive: () => {
          if (host.signal.aborted) throw new Error('stopped')
        },
        requestStop: () => {
          observations.push('requestStop')
        },
        stopAndJoin: async () => {
          observations.push('join')
        }
      }
    }
    return host
  }
  return {
    input,
    version,
    config,
    admission,
    makeHost,
    observations,
    seals,
    get state() {
      return state
    },
    set state(s) {
      state = s
      active = null
    },
    set offline(v: boolean) {
      offline = v
    },
    set crashAfterS2(v: boolean) {
      crashAfterS2 = v
    },
    set crashAfterS1(v: boolean) {
      crashAfterS1 = v
    }
  }
}
afterEach(() => vi.restoreAllMocks())

describe('SPEC0217 synthetic connected platform continuation', () => {
  it('prepares pure canonical redacted admission without model/planning/parse/authority', async () => {
    const f = await fixture()
    const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    f.input.message = ' Quero uma consulta CPF 123.456.789-09 '
    const a = f.admission()
    const b = f.admission()
    expect(a.requestDigest).toMatch(/^sha256-[a-f0-9]{64}$/)
    expect(a.requestDigest).toBe(b.requestDigest)
    expect(a.input.message).not.toContain('123.456.789-09')
    expect(a.budget.maxModelCalls).toBe(1)
    expect(a.budget.maxToolCalls).toBe(1)
    expect(plan).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
  })
  it('executes via mandatory ports, S1 with formed commands, S2 ACK seal and S3', async () => {
    const f = await fixture()
    const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const host = f.makeHost()
    const log = vi.spyOn(host.ports.log, 'append')
    const trace = await executeConfiguredAgent(f.input, host)
    expect(trace.status, JSON.stringify(f.observations)).toBe('completed')
    expect(trace.tools).toEqual([
      { name: 'find_available_slots', status: 'succeeded' }
    ])
    expect(model).toHaveBeenCalledTimes(1)
    expect(plan).toHaveBeenCalledTimes(1)
    const request = log.mock.calls
      .map((call) => call[0])
      .find((event) => event.type === 'model/request')
    expect(request?.type).toBe('model/request')
    if (request?.type === 'model/request') {
      expect(request.request.context.values.promptWithHistory).toBeTypeOf(
        'string'
      )
      expect(request.request.context.values.modelProfile).toMatchObject({
        provider: 'fake',
        model: 'deterministic-v1',
        retries: 0
      })
      expect(request.request.context.values.requestDigest).toBe(
        host.identity.requestDigest
      )
      expect(request.request.context.values.promptChecksum).toBeTypeOf('string')
      expect(JSON.stringify(request)).not.toContain('secret://')
    }
    const s1 = f.seals.find((s) => s.snapshot?.safePoint === 'S1')!.snapshot!
    expect(s1.planSealed).toBe(true)
    expect(s1.attempts).toHaveLength(1)
    expect(s1.expectedStep).toBe(2)
    expect(s1.attempts[0]!.command.execution).not.toHaveProperty('config')
    expect(controlledCanonicalJson(s1)).not.toContain('secret://')
    expect(f.seals.map((s) => s.snapshot!.safePoint)).toEqual(['S1', 'S2'])
    expect(f.state.phaseState).toBe('CLOSED')
    expect(f.state.snapshot?.finalIssued).toBe(true)
    const stop = f.observations.indexOf('requestStop')
    expect(stop).toBeGreaterThan(-1)
    expect(f.observations.indexOf('join')).toBeGreaterThan(stop)
    expect(f.observations.indexOf('close')).toBeGreaterThan(
      f.observations.indexOf('join')
    )
    expect(f.observations.slice(stop)).not.toContain('permit')
  })
  it('resumes S1 after pre-op rollback without model/planning/input parse replay', async () => {
    const f = await fixture()
    const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const parse = vi.spyOn(inputBoundary, 'parseToolInput')
    f.crashAfterS1 = true
    await expect(executeConfiguredAgent(f.input, f.makeHost())).rejects.toThrow(
      'terminal_persistence'
    )
    expect(f.state.phaseState).toBe('IDLE_SEALED')
    expect(f.state.snapshot?.safePoint).toBe('S1')
    const loadedCheckpoint = f.state.checkpoint!
    expect(Object.hasOwn(loadedCheckpoint.state, 'pendingDecision')).toBe(false)
    const rawCheckpoint = {
      ...loadedCheckpoint,
      state: {
        ...loadedCheckpoint.state,
        pendingDecision: undefined,
        pendingStepNumber: undefined
      }
    }
    validateCheckpointIntegrity(rawCheckpoint, {
      tenantId: f.input.tenantId,
      executionId: loadedCheckpoint.executionId
    })
    expect(() => controlledCanonicalJson(rawCheckpoint)).toThrow('state_json')
    const projectedCheckpoint = JSON.parse(JSON.stringify(rawCheckpoint))
    expect(controlledCanonicalJson(projectedCheckpoint)).toBe(
      controlledCanonicalJson(loadedCheckpoint)
    )
    expect(controlledDigest(projectedCheckpoint)).toBe(
      f.state.sealCheckpointDigest
    )
    expect(f.state.snapshot?.attempts[0]!.phase).toBe('PENDING')
    expect(f.observations).not.toContain('permit')
    f.offline = false
    f.crashAfterS1 = false
    const trace = await executeConfiguredAgent(f.input, f.makeHost(2))
    expect(trace.status, JSON.stringify(f.observations)).toBe('completed')
    expect(trace.tools[0]?.status).toBe('succeeded')
    expect(model).toHaveBeenCalledTimes(1)
    expect(plan).toHaveBeenCalledTimes(1)
    expect(f.observations.filter((x) => x === 'permit')).toHaveLength(1)
    expect(parse).toHaveBeenCalledTimes(1)
  })
  it.each(['OPEN', 'FAULTED'] as const)(
    'recovers %s only through handoff with no model/factory dispatch',
    async (phaseState) => {
      const f = await fixture()
      f.state = { ...f.state, phaseState }
      const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
      const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
      const trace = await executeConfiguredAgent(f.input, f.makeHost(2))
      expect(trace.status).toBe('failed')
      expect(trace.response.mode).toBe('handoff')
      expect(model).not.toHaveBeenCalled()
      expect(plan).not.toHaveBeenCalled()
      expect(f.observations.filter((x) => x.startsWith('intent:'))).toEqual([])
      expect(f.state.phaseState).toBe('CLOSED')
    }
  )
  it('returns S3 projection with no factory/model/planning or new phases', async () => {
    const f = await fixture()
    const trace = await executeConfiguredAgent(f.input, f.makeHost())
    const before = f.observations.length
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
    expect(await executeConfiguredAgent(f.input, f.makeHost(2))).toBe(trace)
    expect(model).not.toHaveBeenCalled()
    expect(plan).not.toHaveBeenCalled()
    expect(f.observations.slice(before)).toEqual(['requestStop', 'join'])
  })
  it('does not invoke operation when intent ACK is missing', async () => {
    const f = await fixture()
    const host = f.makeHost()
    host.continuation.beginPhase = async () => {
      throw new Error('no ACK')
    }
    const r = new ControlledContinuationRuntime(host)
    r.expiresAt = Date.now() + 10000
    const operation = vi.fn()
    await expect(r.run('mandatory', {}, operation)).rejects.toThrow(
      'evidence_unavailable'
    )
    expect(operation).not.toHaveBeenCalled()
    expect(r.closed).toBe(true)
    expect(r.fault).toBe('mandatory')
  })
  it('latches operation failure and never admits after local close', async () => {
    const f = await fixture()
    const host = f.makeHost()
    const r = new ControlledContinuationRuntime(host)
    r.expiresAt = Date.now() + 10000
    await expect(
      r.run('mandatory', {}, () => {
        throw new Error('failed')
      })
    ).rejects.toThrow()
    const operation = vi.fn()
    await expect(r.run('late', {}, operation)).rejects.toThrow()
    expect(operation).not.toHaveBeenCalled()
    expect(r.fault).toBe('mandatory')
  })
  it('requires every port and validates identity before provider', async () => {
    const f = await fixture()
    const host = f.makeHost()
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    host.identity.outerAttemptRowId = '900719925474099300000'
    host.identity.tenantId = 'wrong'
    await expect(executeConfiguredAgent(f.input, host)).rejects.toThrow(
      'host_identity'
    )
    expect(model).not.toHaveBeenCalled()
  })
  it('refuses missing mandatory host port instead of a local fallback', async () => {
    const f = await fixture()
    const host = f.makeHost()
    Reflect.deleteProperty(host.ports, 'effectJournal')
    await expect(executeConfiguredAgent(f.input, host)).rejects.toThrow(
      'host_ports'
    )
  })
  it('durable profile never invokes approved knowledge resolver or answers RAG', async () => {
    const f = await fixture()
    f.input.message = 'Qual o horário de atendimento da clínica?'
    const resolver = vi.fn()
    f.input.resolveApprovedKnowledge = resolver
    const host = f.makeHost()
    host.identity.requestDigest = f.admission().requestDigest
    const trace = await executeConfiguredAgent(f.input, host)
    expect(resolver).not.toHaveBeenCalled()
    expect(trace.knowledge.status).not.toBe('answered')
  })
  it.each([
    () => ({ handler: () => true }),
    () => ({ expiresAt: Infinity }),
    () => ({ huge: 'x'.repeat(262145) }),
    () => {
      const v: unknown[] = []
      v.push(v)
      return v
    }
  ])('rejects nonserializable or oversized state', (value) => {
    expect(() => controlledCanonicalJson(value())).toThrow()
  })
  it.each(['requireApproval', 'policy'] as const)(
    'rejects S2 proof downgraded against its command %s',
    async (mode) => {
      const f = await fixture()
      await executeConfiguredAgent(f.input, f.makeHost())
      const seal = f.seals.find((s) => s.snapshot?.safePoint === 'S2')!
      const original = seal.snapshot!
      const host = { ...f.makeHost(), state: seal }
      expect(
        validateControlledSnapshot(
          original,
          host,
          original.fingerprint,
          original.preparedDigest
        )
      ).toEqual(original)
      const bad = clone(original)
      const a = bad.attempts[0]!
      if (mode === 'requireApproval') a.command.execution.requireApproval = true
      else
        a.command.execution.policy = {
          ...a.command.execution.policy,
          decision: 'requires_approval'
        }
      a.approvalRequired = false
      a.approvalConsumed = false
      delete a.approvalReceipt
      bad.planDigest = controlledDigest({
        names: bad.names,
        attempts: bad.attempts.map((a) => a.command),
        outcome: bad.planOutcome
      })
      expect(() =>
        validateControlledSnapshot(
          bad,
          {
            ...host,
            state: {
              ...seal,
              snapshot: bad,
              sealStateDigest: controlledDigest(bad)
            }
          },
          bad.fingerprint,
          bad.preparedDigest
        )
      ).toThrow('controlled_snapshot_s2_approval_requirement')
    }
  )
  it.each(['approval', 'policy', 'dry-run', 'input'] as const)(
    'rejects S1 command %s drift against the trusted request before dispatch',
    async (field) => {
      const f = await fixture()
      f.input.requireCapabilityApproval = true
      const first = f.makeHost()
      first.identity.requestDigest = f.admission().requestDigest
      f.crashAfterS1 = true
      await expect(executeConfiguredAgent(f.input, first)).rejects.toThrow(
        'terminal_persistence'
      )
      const snapshot = f.state.snapshot!
      expect(snapshot.safePoint).toBe('S1')
      const command = snapshot.attempts[0]!.command
      if (field === 'approval') command.execution.requireApproval = false
      if (field === 'policy') command.execution.policy.reason = 'changed'
      if (field === 'dry-run') command.execution.dryRun = false
      if (field === 'input') {
        command.execution.input = { message: 'Outra mensagem sintética' }
        command.canonical = controlledCanonicalJson(command.execution.input)
        command.inputHash = createCapabilityInputHash(command.execution)
      }
      snapshot.planDigest = controlledDigest({
        names: snapshot.names,
        attempts: snapshot.attempts.map((a) => a.command),
        outcome: snapshot.planOutcome
      })
      f.state.sealStateDigest = controlledDigest(snapshot)
      f.offline = false
      f.crashAfterS1 = false
      const resume = f.makeHost(2)
      resume.identity.requestDigest = first.identity.requestDigest
      const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
      const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
      const parse = vi.spyOn(inputBoundary, 'parseToolInput')
      const trace = await executeConfiguredAgent(f.input, resume)
      expect(trace.status).toBe('failed')
      expect(trace.response.mode).toBe('handoff')
      expect(trace.tools.some((t) => t.status === 'succeeded')).toBe(false)
      expect(f.observations).not.toContain('permit')
      expect(model).not.toHaveBeenCalled()
      expect(plan).not.toHaveBeenCalled()
      expect(parse).not.toHaveBeenCalled()
    }
  )
  it('resumes S2 without another model/plan/body and preserves usage', async () => {
    const f = await fixture()
    f.crashAfterS2 = true
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
    await expect(executeConfiguredAgent(f.input, f.makeHost())).rejects.toThrow(
      'terminal_persistence'
    )
    expect(f.state.snapshot?.safePoint).toBe('S2')
    expect(f.observations.filter((x) => x === 'permit')).toHaveLength(1)
    f.offline = false
    f.crashAfterS2 = false
    const trace = await executeConfiguredAgent(f.input, f.makeHost(2))
    expect(trace.status, JSON.stringify(f.observations)).toBe('completed')
    expect(model).toHaveBeenCalledTimes(1)
    expect(plan).toHaveBeenCalledTimes(1)
    expect(f.observations.filter((x) => x === 'permit')).toHaveLength(1)
    expect(f.state.runtimeResult?.modelCalls).toBe(1)
    expect(f.state.runtimeResult?.toolCalls).toBe(1)
  })
  it('keeps ACKed-intent failure OPEN when poison is unavailable, never resets to S1', async () => {
    const f = await fixture()
    const host = f.makeHost()
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
    host.ports.audit.append = async (event) => {
      if (event.action === 'evaluation.completed') {
        f.offline = true
        throw new Error('synthetic-audit-rollback')
      }
    }
    await expect(executeConfiguredAgent(f.input, host)).rejects.toThrow(
      'terminal_persistence'
    )
    expect(f.state.phaseState).toBe('OPEN')
    expect(f.state.openPhase?.phaseType).toBe('completion.evaluate')
    expect(f.state.consumedSealId).toBe('seal-S1')
    expect(f.observations).not.toContain('permit')
    f.offline = false
    const trace = await executeConfiguredAgent(f.input, f.makeHost(2))
    expect(trace.status).toBe('failed')
    expect(trace.response.mode).toBe('handoff')
    expect(model).toHaveBeenCalledTimes(1)
    expect(plan).toHaveBeenCalledTimes(1)
    expect(f.observations).not.toContain('permit')
  })
  it('joins renewal before the first terminal port await, closing admission synchronously', async () => {
    const f = await fixture()
    const host = f.makeHost()
    let release!: () => void
    let joined = false
    host.lifecycle.stopAndJoin = () =>
      new Promise<void>((resolve) => {
        release = () => {
          joined = true
          resolve()
        }
      })
    const terminal = vi.fn()
    const r = new ControlledContinuationRuntime(host)
    r.expiresAt = Date.now() - 1
    const pending = r.run('step.saveCheckpoint', {}, terminal, true)
    expect(r.closed).toBe(true)
    expect(terminal).not.toHaveBeenCalled()
    const late = vi.fn()
    const blocked = r.run('model.request', {}, late)
    expect(late).not.toHaveBeenCalled()
    release()
    await expect(blocked).rejects.toThrow()
    await pending
    expect(joined).toBe(true)
    expect(terminal).toHaveBeenCalledTimes(1)
  })
  it('rejects drifted digest and sealed snapshot without invoking model or plan', async () => {
    const f = await fixture()
    f.crashAfterS1 = true
    await expect(
      executeConfiguredAgent(f.input, f.makeHost())
    ).rejects.toThrow()
    f.offline = false
    f.crashAfterS1 = false
    f.state.snapshot!.expectedStep = 1
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
    const trace = await executeConfiguredAgent(f.input, f.makeHost(2))
    expect(trace.status).toBe('failed')
    expect(model).not.toHaveBeenCalled()
    expect(plan).not.toHaveBeenCalled()
    expect(f.observations).not.toContain('permit')
  })
  it('refuses a mismatched dispatch permit and a post-permit abort', async () => {
    for (const abort of [false, true]) {
      const f = await fixture()
      const host = f.makeHost()
      const original = host.admission.prepareDispatch
      const controller = new AbortController()
      host.signal = controller.signal
      host.admission.prepareDispatch = async (...args) => {
        const permit = await original(...args)
        if (abort) controller.abort()
        return {
          ...permit,
          attempt: abort ? permit.attempt : permit.attempt + 1
        }
      }
      const trace = await executeConfiguredAgent(f.input, host)
      expect(trace.status).not.toBe('completed')
      expect(trace.tools.every((t) => t.status !== 'succeeded')).toBe(true)
      expect(trace.response.mode).toBe('handoff')
    }
  })
  it('rejects S3 payload drift instead of returning the previous success', async () => {
    const f = await fixture()
    await executeConfiguredAgent(f.input, f.makeHost())
    f.input.message = 'Outro pedido'
    await expect(
      executeConfiguredAgent(f.input, f.makeHost(2))
    ).rejects.toThrow('request_digest')
  })
  it('has one public factory call site and no persistence/private-core executor imports', () => {
    const runtime = readFileSync(
      resolve('packages/platform/src/controlled-kernel-execution.ts'),
      'utf8'
    )
    expect(runtime.match(/createOperationalHarness\(/g)).toHaveLength(1)
    for (const name of [
      'controlled-kernel-continuation.ts',
      'controlled-kernel-execution.ts',
      'controlled-kernel-adapters.ts'
    ]) {
      const source = readFileSync(
        resolve('packages/platform/src', name),
        'utf8'
      )
      expect(source).not.toMatch(
        /from ['"]@cvg\/persistence|from ['"][^'"]*harness\/src|new IterativeGovernedRuntime/
      )
    }
  })
  it('masks privately confirmed tool output after a terminal audit fault', async () => {
    const f = await fixture()
    const host = f.makeHost()
    host.ports.audit.append = async (event) => {
      if (event.action === 'runtime.completed')
        throw new Error('synthetic-terminal-audit')
    }
    const trace = await executeConfiguredAgent(f.input, host)
    expect(trace.status).toBe('failed')
    expect(trace.tools[0]?.status).toBe('failed')
    expect(trace.toolResults?.[0]?.output).toBeNull()
    expect(trace.response.mode).toBe('handoff')
    expect(f.state.runtimeResult?.stopReason).toBe('INSUFFICIENT_EVIDENCE')
    expect(f.state.runtimeResult?.toolResult?.status).toBe('REJECTED')
    expect(f.state.snapshot?.stop).toBe('INSUFFICIENT_EVIDENCE')
    expect(f.state.snapshot?.fault?.code).toBe('evidence_unavailable')
    expect(f.state.snapshot?.dispatchClosed).toBe(true)
    expect(f.state.snapshot?.attempts[0]?.closed).toBe(true)
    expect(f.state.snapshot?.budgetUsage.steps).toBe(
      f.state.runtimeResult?.steps
    )
    const privateReceipt = await host.ports.effectJournal.get(
      f.input.tenantId,
      `${host.identity.executionId}:s2:find_available_slots`
    )
    expect(privateReceipt?.state).toBe('CONFIRMED')
  })
  it('bounds async pause reads and prevents a late intent ACK from running its callback', async () => {
    const f = await fixture()
    const host = f.makeHost()
    const r = new ControlledContinuationRuntime(host)
    r.expiresAt = Date.now() + 20
    let acknowledge!: (phase: ControlledPhaseRef) => void
    host.continuation.beginPhase = () =>
      new Promise((resolve) => {
        acknowledge = resolve
      })
    const operation = vi.fn()
    await expect(r.run('pause.read', {}, operation)).rejects.toThrow(
      'evidence_unavailable'
    )
    expect(r.closed).toBe(true)
    acknowledge({
      phaseId: 'late',
      phaseType: 'pause.read',
      phaseRevision: 1,
      attempt: 1,
      inputDigest: controlledDigest({})
    })
    await Promise.resolve()
    expect(operation).not.toHaveBeenCalled()
  })
  it('consumes approval only through the bound port and records the full receipt', async () => {
    const f = await fixture()
    const authority = new InMemoryCapabilityApprovalAuthority()
    const consume = authority.verifyAndConsume.bind(authority)
    const unbound = vi.spyOn(authority, 'verifyAndConsume')
    f.input.capabilityGateway = createControlledCapabilityGateway({
      approvalAuthority: authority
    })
    f.input.requireCapabilityApproval = true
    const issued = await authority.issue({
      tenantId: f.input.tenantId,
      agentId: f.input.agentId,
      versionId: f.input.versionId,
      toolName: 'find_available_slots',
      input: { message: f.input.message },
      actorId: f.input.actor!.id,
      issuer: 'synthetic-reviewer',
      expiresAt: new Date(Date.now() + 60000)
    })
    f.input.capabilityApproval = {
      id: issued.id,
      tenantId: issued.tenantId,
      agentId: issued.agentId,
      versionId: issued.versionId,
      toolName: issued.toolName,
      actorId: issued.actorId,
      expiresAt: issued.expiresAt
    }
    const host = f.makeHost()
    host.identity.requestDigest = f.admission().requestDigest
    const bound = vi.fn(
      async (
        fence: Parameters<
          typeof host.approvalConsumption.consumeBoundApproval
        >[0],
        phase: Parameters<
          typeof host.approvalConsumption.consumeBoundApproval
        >[1],
        verification: Parameters<
          typeof host.approvalConsumption.consumeBoundApproval
        >[2]
      ) => {
        const record = await consume(verification)
        if (!record) return null
        return {
          record,
          receipt: {
            receiptId: 'receipt-synthetic',
            approvalId: record.id,
            inputHash: record.inputHash,
            executionRef: verification.executionRef,
            consumptionAuditId: 'audit-synthetic',
            phaseId: phase.phaseId,
            ...fence,
            operationKey: verification.operationKey,
            stepId: verification.stepId,
            stepNumber: verification.stepNumber,
            outboxId: host.identity.outboxId,
            outerAttempt: host.identity.outerAttempt,
            outerWorkerId: host.identity.outerWorkerId,
            outerAttemptRowId: host.identity.outerAttemptRowId,
            requestDigest: verification.requestDigest,
            fingerprint: verification.fingerprint,
            agentId: record.agentId,
            versionId: record.versionId,
            actorId: record.actorId,
            consumedAt: record.consumedAt!.toISOString(),
            sequence: f.state.sequence + 1,
            hash: controlledDigest(['consumption'])
          }
        }
      }
    )
    host.approvalConsumption.consumeBoundApproval = bound
    const trace = await executeConfiguredAgent(f.input, host)
    expect(trace.status, JSON.stringify(f.observations)).toBe('completed')
    expect(bound).toHaveBeenCalledTimes(1)
    expect(unbound).not.toHaveBeenCalled()
    const receipt = f.seals[1]!.snapshot!.attempts[0]!.approvalReceipt!
    expect(receipt.receiptId).toBe('receipt-synthetic')
    expect(receipt.inputHash).toBe(issued.inputHash)
    expect(receipt.executionId).toBe(host.identity.executionId)
    expect(receipt.outerAttemptRowId).toBe('1')
    expect((await authority.get(issued.id, f.input.tenantId))?.status).toBe(
      'consumed'
    )
    expect(f.seals[0]!.snapshot!.attempts[0]!.command.correlationId).toBe(
      host.identity.correlationId
    )
  })
  it('never replays facade preparation callbacks on S1/recovery; invoked kernel hooks have a phase', async () => {
    const f = await fixture()
    const bus = new PlatformEventBus()
    const original = bus.emit.bind(bus)
    f.input.eventBus = bus
    const emit = vi.spyOn(bus, 'emit').mockImplementation(async (event) => {
      expect(f.state.phaseState).toBe('OPEN')
      expect(f.state.openPhase).not.toBeNull()
      return original(event)
    })
    f.crashAfterS1 = true
    await expect(
      executeConfiguredAgent(f.input, f.makeHost())
    ).rejects.toThrow()
    emit.mockClear()
    f.offline = false
    f.crashAfterS1 = false
    const trace = await executeConfiguredAgent(f.input, f.makeHost(2))
    expect(trace.status).toBe('completed')
    expect(emit.mock.calls.map((call) => call[0].name)).toEqual([
      'tool.before',
      'tool.after'
    ])
    emit.mockClear()
    await executeConfiguredAgent(f.input, f.makeHost(3))
    expect(emit).not.toHaveBeenCalled()
  })
  it('observes an active async pause immediately before model without invoking provider', async () => {
    const f = await fixture()
    const host = f.makeHost()
    const original = host.admission.readGuards
    let reads = 0
    host.admission.readGuards = async (fence) => ({
      ...(await original(fence)),
      paused: ++reads >= 2
    })
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
    const trace = await executeConfiguredAgent(f.input, host)
    expect(trace.status).not.toBe('completed')
    expect(model).not.toHaveBeenCalled()
    expect(plan).not.toHaveBeenCalled()
    expect(f.observations).not.toContain('permit')
  })
  it('settlement rejects capability/control admission names even inside the finalization window', async () => {
    const f = await fixture()
    const host = f.makeHost()
    const r = new ControlledContinuationRuntime(host)
    r.expiresAt = Date.now() - 1
    const operation = vi.fn()
    await expect(r.run('approval.begin', {}, operation, true)).rejects.toThrow()
    expect(operation).not.toHaveBeenCalled()
    expect(r.closed).toBe(true)
  })
  it('F4 closes with live final flags, terminal receipts and cumulative usage rather than the S2 seal', async () => {
    const f = await fixture()
    const host = f.makeHost()
    const close = vi.spyOn(host.continuation, 'close')
    await executeConfiguredAgent(f.input, host)
    const final = close.mock.calls[0]![1]!
    const result = close.mock.calls[0]![2]
    const sealed = f.seals[1]!.snapshot!
    expect(final.finalIssued).toBe(true)
    expect(final.dispatchClosed).toBe(true)
    expect(final.stop).toBe('COMPLETED')
    expect(final.fault).toBeNull()
    expect(final.safePoint).toBe('S2')
    expect(final).not.toBe(sealed)
    expect(sealed.finalIssued).toBe(false)
    expect(sealed.dispatchClosed).toBe(false)
    expect(sealed.stop).toBeNull()
    expect(final.attempts[0]!.closed).toBe(true)
    expect(sealed.attempts[0]!.closed).toBe(false)
    expect(final.budgetUsage.steps).toBe(result.steps)
    expect(final.budgetUsage.modelCalls).toBe(result.modelCalls)
    expect(final.budgetUsage.toolCalls).toBe(result.toolCalls)
    expect(final.budgetUsage.inputTokens).toBe(result.usage.inputTokens)
    expect(final.budgetUsage.outputTokens).toBe(result.usage.outputTokens)
    expect(final.expectedStep).toBe(4)
    expect(final.nextPlannerStep).toBe(4)
    expect(
      final.attempts[0]!.evidenceRefs?.some(
        (ref) => ref.phaseType === 'audit.runtime.completed'
      )
    ).toBe(true)
    expect(
      final.attempts[0]!.evidenceRefs?.some(
        (ref) => ref.phaseType === 'callback.platform.tool.after'
      )
    ).toBe(true)
    expect(final.attempts[0]!.evidenceRefs!.length).toBeGreaterThan(
      sealed.attempts[0]!.evidenceRefs!.length
    )
    expect(final.planDigest).toBe(sealed.planDigest)
    expect(f.seals.map((seal) => seal.snapshot!.safePoint)).toEqual([
      'S1',
      'S2'
    ])
  })
  it('F5 projects a trusted attempt-zero CANCELLED parent with no factory/model/tool phases', async () => {
    const f = await fixture()
    f.state = { ...f.state, phaseState: 'FAULTED' }
    const host = f.makeHost()
    host.identity.attempt = 0
    host.cancelled = true
    const model = vi.spyOn(DeterministicModelProvider.prototype, 'complete')
    const plan = vi.spyOn(f.input.capabilityGateway!, 'planTools')
    const close = vi.spyOn(host.continuation, 'close')
    const start = vi.spyOn(host.continuation, 'startPrepared')
    const factory = vi.spyOn(publicHarness, 'createOperationalHarness')
    const trace = await executeConfiguredAgent(f.input, host)
    expect(factory).not.toHaveBeenCalled()
    expect(trace.status).toBe('failed')
    expect(trace.response.mode).toBe('handoff')
    expect(trace.handoff.reason).toBe('controlled_runtime_cancelled')
    expect(close.mock.calls[0]![2].stopReason).toBe('CANCELLED')
    expect(close.mock.calls[0]![1]).toBeNull()
    expect(start).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
    expect(plan).not.toHaveBeenCalled()
    expect(f.observations.filter((x) => x.startsWith('intent:'))).toEqual([])
    expect(f.observations).not.toContain('permit')
  })
  it('F4 finalizes a legitimate empty S1 plan without inventing S2 or another seal', async () => {
    const f = await fixture()
    f.input.message = 'Olá'
    const host = f.makeHost()
    host.identity.requestDigest = f.admission().requestDigest
    const close = vi.spyOn(host.continuation, 'close')
    await executeConfiguredAgent(f.input, host)
    const final = close.mock.calls[0]![1]!
    const result = close.mock.calls[0]![2]
    expect(final.safePoint).toBe('S1')
    expect(final.names).toEqual([])
    expect(final.attempts).toEqual([])
    expect(final.finalIssued).toBe(true)
    expect(final.dispatchClosed).toBe(true)
    expect(final.stop).toBe('COMPLETED')
    expect(final.budgetUsage.steps).toBe(result.steps)
    expect(final.expectedStep).toBe(3)
    expect(final.nextPlannerStep).toBe(3)
    expect(f.seals.map((seal) => seal.snapshot!.safePoint)).toEqual(['S1'])
    expect(f.seals[0]!.snapshot!.finalIssued).toBe(false)
    expect(f.seals[0]!.snapshot!.stop).toBeNull()
  })
  it('F4 validates an exact sealed anchor through a data-only host pick, never the final projection', async () => {
    const f = await fixture()
    await executeConfiguredAgent(f.input, f.makeHost())
    const sealed = f.seals[1]!
    const host = f.makeHost(2)
    const dataOnly = {
      identity: host.identity,
      state: sealed,
      expiresAt: host.expiresAt
    }
    const snapshot = sealed.snapshot!
    expect(
      validateControlledSnapshot(
        snapshot,
        dataOnly,
        snapshot.fingerprint,
        snapshot.preparedDigest
      )
    ).toEqual(snapshot)
    expect(() =>
      validateControlledSnapshot(
        f.state.snapshot!,
        dataOnly,
        snapshot.fingerprint,
        snapshot.preparedDigest
      )
    ).toThrow('snapshot_binding')
  })
  it.each([undefined, false])(
    'F5 rejects attempt zero without a strictly true trusted cancellation flag (%s)',
    async (cancelled) => {
      const f = await fixture()
      const host = f.makeHost()
      host.identity.attempt = 0
      if (cancelled !== undefined) host.cancelled = cancelled
      Object.assign(f.input, { cancelled: true })
      await expect(executeConfiguredAgent(f.input, host)).rejects.toThrow(
        'host_identity'
      )
      expect(f.observations).toEqual([])
    }
  )
  it('F5 cancellation wins over an idle S0 and never starts preparation or a phase', async () => {
    const f = await fixture()
    const host = f.makeHost()
    host.cancelled = true
    const factory = vi.spyOn(publicHarness, 'createOperationalHarness')
    const close = vi.spyOn(host.continuation, 'close')
    const trace = await executeConfiguredAgent(f.input, host)
    expect(trace.response.mode).toBe('handoff')
    expect(close.mock.calls[0]![2].stopReason).toBe('CANCELLED')
    expect(factory).not.toHaveBeenCalled()
    expect(f.observations).toEqual(['requestStop', 'join', 'close'])
  })
  it.each([false, true])(
    'F4/F5 projects recovery closure while preserving the exact S1 anchor (cancelled %s)',
    async (cancelled) => {
      const f = await fixture()
      f.crashAfterS1 = true
      await expect(
        executeConfiguredAgent(f.input, f.makeHost())
      ).rejects.toThrow()
      f.offline = false
      f.crashAfterS1 = false
      const sealed = clone(f.state)
      if (!cancelled)
        f.state = {
          ...f.state,
          phaseState: 'OPEN',
          consumedSealId: f.state.sealId
        }
      const host = f.makeHost(2)
      if (cancelled) host.cancelled = true
      const close = vi.spyOn(host.continuation, 'close')
      const factory = vi.spyOn(publicHarness, 'createOperationalHarness')
      const trace = await executeConfiguredAgent(f.input, host)
      const final = close.mock.calls[0]![1]!
      expect(final.stop).toBe(cancelled ? 'CANCELLED' : 'INSUFFICIENT_EVIDENCE')
      expect(final.finalIssued).toBe(false)
      expect(final.dispatchClosed).toBe(true)
      expect(final.safePoint).toBe('S1')
      expect(final.attempts[0]!.closed).toBe(true)
      expect(final.attempts[0]!.phase).toBe('CLOSED_WITHOUT_ENTRY')
      expect(final.attempts[0]!.cause).toBe(final.stop)
      expect(final.fault?.code).toBe(
        cancelled ? undefined : 'evidence_unavailable'
      )
      expect(sealed.snapshot!.attempts[0]!.phase).toBe('PENDING')
      expect(sealed.snapshot!.attempts[0]!.closed).toBe(false)
      expect(sealed.snapshot!.stop).toBeNull()
      expect(f.seals).toHaveLength(1)
      expect(factory).not.toHaveBeenCalled()
      expect(trace.tools.every((tool) => tool.status !== 'succeeded')).toBe(
        true
      )
    }
  )
  it.each([
    'expired',
    'at-now',
    'invalid',
    'missing',
    'beyond-kernel',
    'empty'
  ] as const)(
    'D10 denies %s dispatch lease despite a live kernel deadline, before body entry',
    async (mode) => {
      const f = await fixture()
      const host = f.makeHost()
      const original = host.admission.prepareDispatch
      const bodyResult = vi.spyOn(inputBoundary, 'normalizePluginHandlerResult')
      let kernelDeadline = 0
      host.admission.prepareDispatch = async (...args) => {
        const permit = await original(...args)
        kernelDeadline = Date.parse(permit.expiresAt)
        const now = Date.now()
        if (mode === 'at-now') vi.spyOn(Date, 'now').mockReturnValue(now)
        const lease =
          mode === 'expired'
            ? new Date(now - 1).toISOString()
            : mode === 'at-now'
              ? new Date(now).toISOString()
              : mode === 'invalid'
                ? 'invalid-lease'
                : mode === 'beyond-kernel'
                  ? new Date(kernelDeadline + 1).toISOString()
                  : ''
        Reflect.set(permit, 'leaseUntil', lease)
        if (mode === 'missing') Reflect.deleteProperty(permit, 'leaseUntil')
        return permit
      }
      const trace = await executeConfiguredAgent(f.input, host)
      expect(kernelDeadline).toBeGreaterThan(Date.now())
      expect(trace.status).not.toBe('completed')
      expect(trace.response.mode).toBe('handoff')
      expect(trace.tools.every((tool) => tool.status !== 'succeeded')).toBe(
        true
      )
      expect(bodyResult).not.toHaveBeenCalled()
      expect(f.state.snapshot?.attempts[0]?.phase).toBe('CLOSED_WITHOUT_ENTRY')
      expect(f.state.snapshot?.attempts[0]?.command.output).toBeUndefined()
    }
  )

  it('D10 admits a live shorter lease and never serializes the permit', async () => {
    const f = await fixture()
    const host = f.makeHost()
    const original = host.admission.prepareDispatch
    const bodyResult = vi.spyOn(inputBoundary, 'normalizePluginHandlerResult')
    host.admission.prepareDispatch = async (...args) => {
      const permit = await original(...args)
      return {
        ...permit,
        leaseUntil: new Date(Date.parse(permit.expiresAt) - 1000).toISOString()
      }
    }
    const trace = await executeConfiguredAgent(f.input, host)
    expect(trace.status).toBe('completed')
    expect(bodyResult).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(f.state.snapshot)).not.toContain('leaseUntil')
    expect(f.state.snapshot?.attempts[0]).not.toHaveProperty('permit')
    for (const seal of f.seals)
      expect(JSON.stringify(seal.snapshot)).not.toContain('leaseUntil')
  })
  it('D10 keeps exact kernel expiry binding even when the permit lease is valid', async () => {
    const f = await fixture()
    const host = f.makeHost()
    const original = host.admission.prepareDispatch
    const bodyResult = vi.spyOn(inputBoundary, 'normalizePluginHandlerResult')
    host.admission.prepareDispatch = async (...args) => {
      const permit = await original(...args)
      return {
        ...permit,
        expiresAt: new Date(Date.parse(permit.expiresAt) + 1).toISOString()
      }
    }
    const trace = await executeConfiguredAgent(f.input, host)
    expect(trace.status).not.toBe('completed')
    expect(bodyResult).not.toHaveBeenCalled()
    expect(trace.tools.every((tool) => tool.status !== 'succeeded')).toBe(true)
  })
})
