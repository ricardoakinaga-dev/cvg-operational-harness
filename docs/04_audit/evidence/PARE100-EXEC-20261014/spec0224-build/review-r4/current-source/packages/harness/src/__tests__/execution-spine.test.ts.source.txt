import { describe, expect, it } from 'vitest'
import {
  InMemoryOperationalExecutionStore,
  OperationalExecutionError,
  OperationalExecutionWorker,
  OPERATIONAL_EXECUTION_FAULT_POINT_AFTER_CLAIM,
  classifyRuntimeResult,
  computeExecutionRequestHash,
  deriveExecutionResume,
  type ExecutionFailure,
  isExecutionTransitionAllowed,
  parseExecutionSubmission,
  toExecutionView,
  validateExecutionTransitionPayload,
  type ExecutionSubmission
} from '../execution-spine.ts'
import { createCapabilityRegistry } from '../capability-boundary.ts'
import { InMemoryEffectJournal } from '../effect-journal.ts'
import type {
  ApprovalEngine,
  ApprovalId,
  AuditEvent,
  CapabilityRegistration,
  ModelGateway,
  Orchestrator,
  PolicyEngine,
  RuntimeInput,
  RuntimeResult,
  TelemetryEvent,
  ToolRegistry
} from '@cvg/harness-contracts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000001'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000002'
const workerCapabilityId = 'synthetic.worker.capability'

const approvalId = (value: string): ApprovalId => value as ApprovalId

function runtimeInput(tenantId = tenantA): RuntimeInput {
  return {
    agent: {
      id: 'agent.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'synthetic objective',
      instructions: ['never use real data'],
      skills: [],
      tools: [],
      policies: ['synthetic-only']
    },
    tenantId: tenantId as RuntimeInput['tenantId'],
    conversationId: 'conversation_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_synthetic' as RuntimeInput['sessionId'],
    correlationId: 'correlation_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_synthetic' as RuntimeInput['traceId'],
    userMessage: 'hello synthetic harness',
    context: {
      values: { source: 'fixture' },
      sourceIds: ['fixture'],
      capturedAt: '2026-09-13T00:00:00.000Z'
    },
    state: {
      version: 1,
      values: {},
      updatedAt: '2026-09-13T00:00:00.000Z'
    },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    }
  }
}

function submission(
  idempotencyKey = 'idem-1',
  tenantId = tenantA
): ExecutionSubmission {
  return { tenantId, idempotencyKey, runtime: runtimeInput(tenantId) }
}

function capabilityRuntimeInput(
  tenantId = tenantA,
  operationKey = 'worker-capability-operation'
): RuntimeInput {
  const base = runtimeInput(tenantId)
  return {
    ...base,
    correlationId: `correlation-${tenantId}` as RuntimeInput['correlationId'],
    traceId: `trace-${tenantId}` as RuntimeInput['traceId'],
    agent: { ...base.agent, tools: [workerCapabilityId] },
    requestedTool: {
      toolId: workerCapabilityId,
      toolVersion: 'v1',
      operationKey,
      input: { value: 'synthetic' }
    }
  }
}

function workerCapabilityRegistration(counter: {
  value: number
}): CapabilityRegistration {
  return {
    descriptor: {
      id: workerCapabilityId,
      version: 'v1',
      description: 'Synthetic worker capability',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'LOW',
      sideEffect: 'WRITE',
      idempotent: false,
      requiresApproval: false,
      origin: 'core',
      providerId: 'synthetic-worker-provider',
      providerVersion: 'v1'
    },
    implementation: {
      validateInput: (input) => typeof input === 'object' && input !== null,
      execute: async () => {
        counter.value += 1
        return { status: 'SUCCEEDED', output: { applied: true } }
      },
      validateOutput: (output) => typeof output === 'object' && output !== null
    }
  }
}

function harnessOptions(decision: 'RESPOND' | 'REQUEST_APPROVAL' = 'RESPOND'): {
  options: {
    orchestrator: Orchestrator
    modelGateway: ModelGateway
    policy: PolicyEngine
    approvals: ApprovalEngine
    tools: ToolRegistry
    audit: { append: (event: AuditEvent) => Promise<void> }
    telemetry: { record: (event: TelemetryEvent) => void }
  }
  auditEvents: AuditEvent[]
  telemetryEvents: TelemetryEvent[]
} {
  const auditEvents: AuditEvent[] = []
  const telemetryEvents: TelemetryEvent[] = []
  const modelGateway: ModelGateway = {
    complete: async () => ({
      text: 'model fixture',
      provider: 'deterministic-v1',
      model: 'fixture',
      inputTokens: 1,
      outputTokens: 1,
      costUsd: 0
    })
  }
  const policy: PolicyEngine = {
    evaluate: async () => ({
      outcome: 'ALLOW',
      reason: 'synthetic allow',
      policyVersion: 'synthetic-v1'
    })
  }
  const approvals: ApprovalEngine = {
    request: async () => ({
      status: 'PENDING',
      reason: 'synthetic approval pending'
    })
  }
  const tools: ToolRegistry = {
    list: () => [],
    resolve: () => undefined
  }
  const orchestrator: Orchestrator = {
    decideNextStep: async () =>
      decision === 'RESPOND'
        ? { action: 'RESPOND', response: 'synthetic complete' }
        : { action: 'REQUEST_APPROVAL', reason: 'approval required' }
  }
  return {
    options: {
      orchestrator,
      modelGateway,
      policy,
      approvals,
      tools,
      audit: {
        append: async (event: AuditEvent) => {
          auditEvents.push(event)
        }
      },
      telemetry: {
        record: (event: TelemetryEvent) => {
          telemetryEvents.push(event)
        }
      }
    },
    auditEvents,
    telemetryEvents
  }
}

describe('neutral durable execution spine contract', () => {
  it('binds idempotency to tenant and rejects payload mismatch', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const first = await store.submit(submission())
    const duplicate = await store.submit(submission())

    expect(first.created).toBe(true)
    expect(duplicate.created).toBe(false)
    expect(duplicate.record.id).toBe(first.record.id)

    await expect(
      store.submit({
        ...submission(),
        runtime: { ...runtimeInput(), userMessage: 'different payload' }
      })
    ).rejects.toMatchObject({ code: 'conflict' })

    expect(await store.get(tenantB, first.record.id)).toBeNull()
    expect((await store.get(tenantA, first.record.id))?.state).toBe('QUEUED')

    await expect(
      store.transition({
        tenantId: tenantA,
        executionId: first.record.id,
        to: 'CLAIMED',
        workerId: 'worker-direct-claim'
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })
  })

  it('fences concurrent claims and recovers an expired lease', async () => {
    let now = new Date('2026-09-13T12:00:00.000Z')
    const store = new InMemoryOperationalExecutionStore({
      clock: () => now,
      leaseMs: 100
    })
    const submitted = await store.submit(submission(), now)
    const [claimA, claimB] = await Promise.all([
      store.claimNext(tenantA, 'worker-a', now, 100),
      store.claimNext(tenantA, 'worker-b', now, 100)
    ])

    expect([claimA, claimB].filter(Boolean)).toHaveLength(1)
    const owner = claimA?.record.leaseOwner ?? claimB?.record.leaseOwner
    expect(owner).toBeDefined()

    await expect(
      store.transition({
        tenantId: tenantA,
        executionId: submitted.record.id,
        to: 'RUNNING'
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })

    await expect(
      store.transition(
        {
          tenantId: tenantA,
          executionId: submitted.record.id,
          to: 'RUNNING',
          workerId: owner === 'worker-a' ? 'worker-b' : 'worker-a'
        },
        now
      )
    ).rejects.toMatchObject({ code: 'lease_lost' })

    now = new Date('2026-09-13T12:00:01.000Z')
    const recovered = await store.recoverExpired(tenantA, now)
    expect(recovered).toHaveLength(1)
    expect(recovered[0]?.state).toBe('QUEUED')
    expect(recovered[0]?.leaseOwner).toBeNull()
  })

  it('calls the public harness factory from the worker and persists success', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const submitted = await store.submit(submission())
    const options = harnessOptions()
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-public-harness',
      tenantId: tenantA,
      harnessOptions: options.options
    })

    const processed = await worker.processNext()
    expect(processed.kind).toBe('processed')
    if (processed.kind !== 'processed') return
    expect(processed.record.id).toBe(submitted.record.id)
    expect(processed.record.state).toBe('SUCCEEDED')
    expect(processed.record.result?.response).toBe('synthetic complete')
    expect(options.auditEvents).toHaveLength(1)
    expect(options.telemetryEvents).toHaveLength(1)

    const events = await store.listEvents(tenantA, submitted.record.id)
    expect(events.map((event) => event.type)).toEqual([
      'RECEIVED',
      'QUEUED',
      'CLAIMED',
      'RUNNING',
      'SUCCEEDED'
    ])
    expect((await store.get(tenantA, submitted.record.id))?.state).toBe(
      'SUCCEEDED'
    )
  })

  it('composes capabilities through the worker and existing effect journal', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const fixtures = harnessOptions()
    const { tools: _tools, ...withoutTools } = fixtures.options
    void _tools
    const counter = { value: 0 }
    const capabilities = createCapabilityRegistry([
      workerCapabilityRegistration(counter)
    ])
    const submitted = await store.submit({
      tenantId: tenantA,
      idempotencyKey: 'capability-worker-1',
      capabilityFingerprint: capabilities.compositionFingerprint(),
      runtime: capabilityRuntimeInput()
    })
    expect(submitted.record.capabilityFingerprint).toBe(
      capabilities.compositionFingerprint()
    )
    expect(submitted.record.request.capabilityFingerprint).toBe(
      capabilities.compositionFingerprint()
    )
    const journal = new InMemoryEffectJournal()
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-capability-boundary',
      tenantId: tenantA,
      effectJournal: journal,
      harnessOptions: {
        ...withoutTools,
        capabilities,
        orchestrator: {
          decideNextStep: async ({ runtime }) => ({
            action: 'CALL_TOOL' as const,
            toolInvocation: runtime.requestedTool!
          })
        }
      }
    })

    const processed = await worker.processNext()

    expect(processed.kind).toBe('processed')
    if (processed.kind !== 'processed') return
    expect(processed.record.id).toBe(submitted.record.id)
    expect(processed.record.state).toBe('SUCCEEDED')
    expect(processed.record.result?.response).toContain('applied')
    expect(counter.value).toBe(1)
    expect(
      (await journal.get(tenantA, 'worker-capability-operation'))?.state
    ).toBe('CONFIRMED')
    expect(fixtures.auditEvents).toHaveLength(1)
  })

  it('keeps identical worker capability operation keys isolated by tenant', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const fixtures = harnessOptions()
    const { tools: _tools, ...withoutTools } = fixtures.options
    void _tools
    const counter = { value: 0 }
    const capabilities = createCapabilityRegistry([
      workerCapabilityRegistration(counter)
    ])
    const operationKey = 'worker-cross-tenant-operation'
    const submittedA = await store.submit({
      tenantId: tenantA,
      idempotencyKey: 'capability-worker-tenant-a',
      capabilityFingerprint: capabilities.compositionFingerprint(),
      runtime: capabilityRuntimeInput(tenantA, operationKey)
    })
    const submittedB = await store.submit({
      tenantId: tenantB,
      idempotencyKey: 'capability-worker-tenant-b',
      capabilityFingerprint: capabilities.compositionFingerprint(),
      runtime: capabilityRuntimeInput(tenantB, operationKey)
    })
    const journal = new InMemoryEffectJournal()
    const options = {
      ...withoutTools,
      capabilities,
      orchestrator: {
        decideNextStep: async ({ runtime }: { runtime: RuntimeInput }) => ({
          action: 'CALL_TOOL' as const,
          toolInvocation: runtime.requestedTool!
        })
      }
    }
    const workerA = new OperationalExecutionWorker({
      store,
      workerId: 'worker-capability-tenant-a',
      tenantId: tenantA,
      effectJournal: journal,
      harnessOptions: options
    })
    const workerB = new OperationalExecutionWorker({
      store,
      workerId: 'worker-capability-tenant-b',
      tenantId: tenantB,
      effectJournal: journal,
      harnessOptions: options
    })

    const processedA = await workerA.processNext()
    const processedB = await workerB.processNext()

    expect(processedA.kind).toBe('processed')
    expect(processedB.kind).toBe('processed')
    if (processedA.kind !== 'processed' || processedB.kind !== 'processed') {
      return
    }
    expect(processedA.record.id).toBe(submittedA.record.id)
    expect(processedB.record.id).toBe(submittedB.record.id)
    expect(processedA.record.state).toBe('SUCCEEDED')
    expect(processedB.record.state).toBe('SUCCEEDED')
    expect(counter.value).toBe(2)
    expect((await journal.get(tenantA, operationKey))?.state).toBe('CONFIRMED')
    expect((await journal.get(tenantB, operationKey))?.state).toBe('CONFIRMED')
    expect(fixtures.auditEvents.map((event) => event.tenant)).toEqual([
      tenantA,
      tenantB
    ])
  })

  it('invokes the fault injector after claim and before runtime creation', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const submitted = await store.submit(submission('fault-after-claim'))
    const fixtures = harnessOptions()
    let harnessCreated = false
    const observedPoints: string[] = []
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-fault-after-claim',
      tenantId: tenantA,
      harnessOptions: () => {
        harnessCreated = true
        return fixtures.options
      },
      faultInjector: async (point) => {
        observedPoints.push(point)
        expect(point).toBe(OPERATIONAL_EXECUTION_FAULT_POINT_AFTER_CLAIM)
        expect(await store.get(tenantA, submitted.record.id)).toMatchObject({
          state: 'CLAIMED',
          leaseOwner: 'worker-fault-after-claim',
          attempt: 1
        })
        expect(harnessCreated).toBe(false)
      }
    })

    const processed = await worker.processNext()

    expect(processed.kind).toBe('processed')
    expect(observedPoints).toEqual([
      OPERATIONAL_EXECUTION_FAULT_POINT_AFTER_CLAIM
    ])
    expect(harnessCreated).toBe(true)
    expect((await store.get(tenantA, submitted.record.id))?.state).toBe(
      'SUCCEEDED'
    )
  })

  it('leaves the claim recoverable when the fault injector rejects', async () => {
    let now = new Date('2026-09-13T12:30:00.000Z')
    const store = new InMemoryOperationalExecutionStore({
      clock: () => now,
      leaseMs: 100
    })
    const submitted = await store.submit(submission('fault-rejected'), now)
    const interruptedFixtures = harnessOptions()
    let interruptedHarnessCreated = false
    const injectedError = new Error('synthetic fault injection rejection')
    const interruptedWorker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-fault-rejected',
      tenantId: tenantA,
      leaseMs: 100,
      now: () => now,
      harnessOptions: () => {
        interruptedHarnessCreated = true
        return interruptedFixtures.options
      },
      faultInjector: async (point) => {
        expect(point).toBe(OPERATIONAL_EXECUTION_FAULT_POINT_AFTER_CLAIM)
        throw injectedError
      }
    })

    await expect(interruptedWorker.processNext()).rejects.toBe(injectedError)
    expect(interruptedHarnessCreated).toBe(false)
    expect(await store.get(tenantA, submitted.record.id)).toMatchObject({
      state: 'CLAIMED',
      leaseOwner: 'worker-fault-rejected',
      attempt: 1
    })
    expect(
      (await store.listEvents(tenantA, submitted.record.id)).map(
        (event) => event.type
      )
    ).toEqual(['RECEIVED', 'QUEUED', 'CLAIMED'])

    now = new Date(now.getTime() + 101)
    const recoveryFixtures = harnessOptions()
    const recoveryWorker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-after-fault',
      tenantId: tenantA,
      leaseMs: 100,
      now: () => now,
      harnessOptions: recoveryFixtures.options
    })
    const recovered = await recoveryWorker.processNext()

    expect(recovered.kind).toBe('processed')
    if (recovered.kind !== 'processed') return
    expect(recovered.record.state).toBe('SUCCEEDED')
    expect(recovered.record.attempt).toBe(2)
  })

  it('keeps a long-running synthetic execution leased with heartbeats', async () => {
    const store = new InMemoryOperationalExecutionStore({ leaseMs: 100 })
    await store.submit(submission('heartbeat-1'))
    const fixtures = harnessOptions()
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-heartbeat',
      tenantId: tenantA,
      leaseMs: 100,
      heartbeatMs: 10,
      harnessOptions: {
        ...fixtures.options,
        orchestrator: {
          decideNextStep: async () => {
            await new Promise((resolve) => setTimeout(resolve, 250))
            return {
              action: 'RESPOND' as const,
              response: 'heartbeat complete'
            }
          }
        }
      }
    })

    const processed = await worker.processNext()

    expect(processed.kind).toBe('processed')
    if (processed.kind === 'processed') {
      expect(processed.record.state).toBe('SUCCEEDED')
      expect(processed.record.result?.response).toBe('heartbeat complete')
    }
  })

  it('durably pauses for approval before any effect and can be queued again', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const submitted = await store.submit(submission('approval-1'))
    const claimed = await store.claimNext(tenantA, 'worker-approval')
    const running = await store.transition({
      tenantId: tenantA,
      executionId: submitted.record.id,
      to: 'RUNNING',
      workerId: 'worker-approval',
      fenceToken: claimed!.record.attempt
    })
    await expect(
      store.transition({
        tenantId: tenantA,
        executionId: submitted.record.id,
        to: 'WAITING_APPROVAL',
        workerId: 'worker-approval',
        fenceToken: running.attempt,
        result: {
          response: 'approval required without identity',
          stopReason: 'APPROVAL_REQUIRED',
          steps: 1,
          modelCalls: 0,
          toolCalls: 0,
          usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
        }
      })
    ).rejects.toMatchObject({ code: 'validation_failed' })
    const paused = await store.transition({
      tenantId: tenantA,
      executionId: submitted.record.id,
      to: 'WAITING_APPROVAL',
      workerId: 'worker-approval',
      fenceToken: running.attempt,
      approvalId: 'approval_synthetic',
      result: {
        response: 'approval required',
        stopReason: 'APPROVAL_REQUIRED',
        approvalId: 'approval_synthetic' as never,
        steps: 1,
        modelCalls: 0,
        toolCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      }
    })
    expect(paused.state).toBe('WAITING_APPROVAL')
    expect(paused.result?.stopReason).toBe('APPROVAL_REQUIRED')

    const resumed = await store.resolveApproval({
      tenantId: tenantA,
      executionId: submitted.record.id,
      approvalId: 'approval_synthetic',
      actorId: 'approver.synthetic',
      decision: 'APPROVED'
    })
    expect(resumed.state).toBe('QUEUED')
    expect(
      (await store.claimNext(tenantA, 'worker-after-restart'))?.record.id
    ).toBe(submitted.record.id)
  })

  it('does not allow a terminal execution to be resurrected', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const submitted = await store.submit(submission('terminal-1'))
    const claimed = await store.claimNext(tenantA, 'worker-terminal')
    expect(claimed?.record.id).toBe(submitted.record.id)
    await store.transition({
      tenantId: tenantA,
      executionId: submitted.record.id,
      to: 'RUNNING',
      workerId: 'worker-terminal',
      fenceToken: claimed!.record.attempt
    })
    await store.transition({
      tenantId: tenantA,
      executionId: submitted.record.id,
      to: 'FAILED_TERMINAL',
      workerId: 'worker-terminal',
      fenceToken: claimed!.record.attempt,
      failure: {
        kind: 'SEMANTIC_TERMINAL',
        code: 'fixture_terminal',
        message: 'synthetic terminal outcome'
      }
    })
    await expect(
      store.transition({
        tenantId: tenantA,
        executionId: submitted.record.id,
        to: 'QUEUED'
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })
  })

  it('dead-letters retryable work after the configured attempt bound', async () => {
    const now = new Date('2026-09-13T13:00:00.000Z')
    const store = new InMemoryOperationalExecutionStore({
      maxAttempts: 2,
      retryDelayMs: 1
    })
    const submitted = await store.submit(submission('retry-bound-1'), now)

    for (const expectedAttempt of [1, 2]) {
      const claimed = await store.claimNext(
        tenantA,
        `worker-retry-${expectedAttempt}`,
        now
      )
      expect(claimed?.record.attempt).toBe(expectedAttempt)
      expect(claimed?.record.id).toBe(submitted.record.id)
      if (!claimed) return
      await store.transition(
        {
          tenantId: tenantA,
          executionId: submitted.record.id,
          to: 'RUNNING',
          workerId: `worker-retry-${expectedAttempt}`,
          fenceToken: claimed.record.attempt
        },
        now
      )
      const failed = await store.transition(
        {
          tenantId: tenantA,
          executionId: submitted.record.id,
          to: 'FAILED_RETRYABLE',
          workerId: `worker-retry-${expectedAttempt}`,
          fenceToken: claimed.record.attempt,
          failure: {
            kind: 'TECHNICAL_RETRYABLE',
            code: 'fixture_timeout',
            message: 'synthetic retryable failure'
          }
        },
        now
      )
      if (expectedAttempt === 1) {
        expect(failed.state).toBe('FAILED_RETRYABLE')
      } else {
        expect(failed.state).toBe('FAILED_TERMINAL')
        expect(failed.failure?.code).toBe('retry_exhausted')
      }
    }

    expect(
      await store.claimNext(tenantA, 'worker-after-dead-letter', now)
    ).toBe(null)
    expect(
      (await store.listEvents(tenantA, submitted.record.id)).at(-1)?.type
    ).toBe('FAILED_TERMINAL')
  })

  it('cancels only pre-effect work and rejects active cancellation', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const queued = await store.submit(submission('cancel-queued'))
    const cancelled = await store.cancel({
      tenantId: tenantA,
      executionId: queued.record.id,
      actorId: 'operator.synthetic',
      reason: 'synthetic cancellation'
    })
    expect(cancelled.state).toBe('CANCELLED')
    expect(cancelled.failure?.kind).toBe('CANCELLED')
    expect(
      await store.cancel({
        tenantId: tenantA,
        executionId: queued.record.id,
        actorId: 'operator.synthetic'
      })
    ).toMatchObject({ state: 'CANCELLED' })
    expect(await store.claimNext(tenantA, 'worker-cancelled')).toBeNull()

    const active = await store.submit(submission('cancel-running'))
    const claimed = await store.claimNext(tenantA, 'worker-active')
    await store.transition({
      tenantId: tenantA,
      executionId: active.record.id,
      to: 'RUNNING',
      workerId: 'worker-active',
      fenceToken: claimed!.record.attempt
    })
    await expect(
      store.cancel({
        tenantId: tenantA,
        executionId: active.record.id,
        actorId: 'operator.synthetic'
      })
    ).rejects.toMatchObject({ code: 'conflict' })
  })

  it('stops claiming when the controlled worker is asked to shut down', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const submitted = await store.submit(submission('worker-stop'))
    const fixtures = harnessOptions()
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-stop',
      tenantId: tenantA,
      harnessOptions: fixtures.options
    })
    worker.requestStop()
    await worker.stop()
    expect(await worker.processNext()).toEqual({ kind: 'idle' })
    expect((await store.get(tenantA, submitted.record.id))?.state).toBe(
      'QUEUED'
    )
  })

  it('does not claim after shutdown begins during lease recovery', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const submitted = await store.submit(submission('worker-stop-recovery'))
    let releaseRecovery!: () => void
    const recoveryGate = new Promise<void>((resolve) => {
      releaseRecovery = resolve
    })
    const recoverExpired = store.recoverExpired.bind(store)
    store.recoverExpired = async (tenantId, now) => {
      await recoveryGate
      return recoverExpired(tenantId, now)
    }
    const fixtures = harnessOptions()
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-stop-recovery',
      tenantId: tenantA,
      harnessOptions: fixtures.options
    })
    const processing = worker.processNext()
    await Promise.resolve()
    worker.requestStop()
    releaseRecovery()

    expect(await processing).toEqual({ kind: 'idle' })
    expect((await store.get(tenantA, submitted.record.id))?.state).toBe(
      'QUEUED'
    )
  })

  it('persists policy denial as terminal without invoking the tool', async () => {
    const store = new InMemoryOperationalExecutionStore()
    await store.submit(submission('policy-denied'))
    let toolCalls = 0
    const tool = {
      id: 'synthetic.denied.tool',
      version: 'v1',
      description: 'Synthetic denied tool',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'LOW' as const,
      sideEffect: 'NONE' as const,
      idempotent: true,
      requiresApproval: false,
      execute: async () => {
        toolCalls += 1
        return { status: 'SUCCEEDED' as const, output: {} }
      }
    }
    const fixtures = harnessOptions()
    const processed = await new OperationalExecutionWorker({
      store,
      workerId: 'worker-policy-deny',
      tenantId: tenantA,
      harnessOptions: {
        ...fixtures.options,
        orchestrator: {
          decideNextStep: async () => ({
            action: 'CALL_TOOL' as const,
            toolInvocation: {
              toolId: tool.id,
              input: {},
              operationKey: 'operation.policy-denied'
            }
          })
        },
        policy: {
          evaluate: async () => ({
            outcome: 'DENY' as const,
            reason: 'synthetic policy denial',
            policyVersion: 'synthetic-deny-v1'
          })
        },
        tools: { list: () => [tool], resolve: () => tool }
      }
    }).processNext()
    expect(processed.kind).toBe('processed')
    if (processed.kind !== 'processed') return
    expect(processed.record.state).toBe('FAILED_TERMINAL')
    expect(processed.record.failure?.kind).toBe('POLICY_DENIED')
    expect(toolCalls).toBe(0)
  })
})

function runtimeResult(
  stopReason: RuntimeResult['stopReason'],
  response = `synthetic ${stopReason}`
): RuntimeResult {
  return {
    response,
    stopReason,
    steps: 1,
    modelCalls: 0,
    toolCalls: 0,
    usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  }
}

describe('execution spine pure boundary helpers', () => {
  it('normalizes public submissions and keeps request hashes deterministic', () => {
    const first = submission('hash-order')
    const second: ExecutionSubmission = {
      ...first,
      runtime: {
        ...first.runtime,
        context: {
          ...first.runtime.context,
          values: { b: 2, a: 1 }
        }
      }
    }
    const equivalent: ExecutionSubmission = {
      ...first,
      runtime: {
        ...first.runtime,
        context: {
          ...first.runtime.context,
          values: { a: 1, b: 2 }
        }
      }
    }
    expect(computeExecutionRequestHash(second)).toBe(
      computeExecutionRequestHash(equivalent)
    )
    expect(isExecutionTransitionAllowed('QUEUED', 'CLAIMED')).toBe(true)
    expect(isExecutionTransitionAllowed('SUCCEEDED', 'QUEUED')).toBe(false)

    expect(() => parseExecutionSubmission(null)).toThrow(/object/i)
    expect(() => parseExecutionSubmission({ tenantId: 42 })).toThrow(
      /tenantId must be a string/i
    )
    expect(() =>
      parseExecutionSubmission({ tenantId: tenantB }, tenantA)
    ).toThrow(/authenticated tenant/i)

    const parsed = parseExecutionSubmission(
      {
        tenantId: tenantA,
        idempotencyKey: 'parse-public',
        runtime: {
          ...runtimeInput(),
          executionId: 'forged-execution',
          resume: { kind: 'approval', approvalId: 'forged-approval' }
        }
      },
      tenantA
    )
    expect(parsed.tenantId).toBe(tenantA)
    expect(parsed.runtime).not.toHaveProperty('executionId')
    expect(parsed.runtime).not.toHaveProperty('resume')
  })

  it('derives only durable resume bindings and exposes a safe view', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const created = await store.submit(submission('resume-helper'))
    const base = created.record
    expect(deriveExecutionResume(base)).toBeUndefined()
    expect(
      deriveExecutionResume({
        ...base,
        resume: {
          kind: 'approval',
          approvalId: 'approval-durable',
          boundAt: base.createdAt
        }
      })
    ).toEqual({ kind: 'approval', approvalId: 'approval-durable' })
    expect(
      deriveExecutionResume({
        ...base,
        resume: { kind: 'user_input', input: '  ', boundAt: base.createdAt }
      })
    ).toBeUndefined()
    expect(
      deriveExecutionResume({
        ...base,
        resume: {
          kind: 'user_input',
          input: '2026-10-01',
          boundAt: base.createdAt
        }
      })
    ).toEqual({ kind: 'user_input', message: '2026-10-01' })
    expect(toExecutionView(base)).toMatchObject({
      id: base.id,
      tenantId: tenantA,
      state: 'QUEUED'
    })
  })

  it('enforces transition payload invariants before persistence', () => {
    const retryable: ExecutionFailure = {
      kind: 'TECHNICAL_RETRYABLE',
      code: 'timeout',
      message: 'synthetic timeout'
    }
    const cancelled: ExecutionFailure = {
      kind: 'CANCELLED',
      code: 'cancelled',
      message: 'synthetic cancellation'
    }
    expect(() =>
      validateExecutionTransitionPayload({ to: 'SUCCEEDED' })
    ).toThrow(/runtime result/i)
    expect(() =>
      validateExecutionTransitionPayload({
        to: 'SUCCEEDED',
        result: runtimeResult('COMPLETED'),
        failure: retryable
      })
    ).toThrow(/cannot carry a failure/i)
    expect(() =>
      validateExecutionTransitionPayload({ to: 'FAILED_RETRYABLE' })
    ).toThrow(/requires a failure/i)
    expect(() =>
      validateExecutionTransitionPayload({
        to: 'FAILED_RETRYABLE',
        failure: cancelled
      })
    ).toThrow(/technical retryable/i)
    expect(() =>
      validateExecutionTransitionPayload({
        to: 'CANCELLED',
        failure: retryable
      })
    ).toThrow(/cancellation failure/i)
    expect(() =>
      validateExecutionTransitionPayload({
        to: 'WAITING_APPROVAL',
        approvalId: approvalId('approval-a'),
        result: {
          ...runtimeResult('APPROVAL_REQUIRED'),
          approvalId: approvalId('approval-b')
        }
      })
    ).toThrow(/approval id/i)
    expect(() =>
      validateExecutionTransitionPayload({
        to: 'WAITING_APPROVAL',
        approvalId: approvalId('approval-a'),
        result: runtimeResult('APPROVAL_REQUIRED')
      })
    ).not.toThrow()
  })

  it('classifies every runtime stop family into durable execution states', () => {
    expect(classifyRuntimeResult(runtimeResult('COMPLETED'))).toMatchObject({
      state: 'SUCCEEDED'
    })
    expect(
      classifyRuntimeResult(runtimeResult('APPROVAL_REQUIRED'))
    ).toMatchObject({
      state: 'FAILED_TERMINAL',
      failure: { code: 'approval_missing' }
    })
    expect(
      classifyRuntimeResult({
        ...runtimeResult('APPROVAL_REQUIRED'),
        approvalId: approvalId('approval-classified')
      })
    ).toMatchObject({
      state: 'WAITING_APPROVAL',
      approvalId: 'approval-classified'
    })
    expect(
      classifyRuntimeResult(runtimeResult('NEEDS_USER_INPUT'))
    ).toMatchObject({
      state: 'WAITING_USER'
    })
    for (const stopReason of ['MODEL_FAILURE', 'INTERNAL_FAILURE'] as const) {
      expect(classifyRuntimeResult(runtimeResult(stopReason))).toMatchObject({
        state: 'FAILED_RETRYABLE'
      })
    }
    expect(
      classifyRuntimeResult(
        runtimeResult('TOOL_FAILURE', 'unknown_effect: reconcile')
      )
    ).toMatchObject({
      state: 'FAILED_TERMINAL',
      failure: { kind: 'UNKNOWN_EFFECT' }
    })
    expect(classifyRuntimeResult(runtimeResult('TOOL_FAILURE'))).toMatchObject({
      state: 'FAILED_RETRYABLE'
    })
    for (const stopReason of [
      'POLICY_DENIED',
      'UNSAFE_REQUEST',
      'INSUFFICIENT_EVIDENCE',
      'HUMAN_TAKEOVER',
      'VERIFICATION_FAILED',
      'LOOP_DETECTED'
    ] as const) {
      expect(classifyRuntimeResult(runtimeResult(stopReason))).toMatchObject({
        state: 'FAILED_TERMINAL'
      })
    }
    expect(classifyRuntimeResult(runtimeResult('CANCELLED'))).toMatchObject({
      state: 'CANCELLED'
    })
    for (const stopReason of [
      'MAX_STEPS',
      'MAX_COST',
      'MAX_DURATION',
      'MAX_TOKENS',
      'MAX_MODEL_CALLS',
      'MAX_TOOL_CALLS',
      'MAX_REPLANS',
      'MAX_KNOWLEDGE_CALLS',
      'MAX_VERIFICATION_CALLS',
      'STATE_CONFLICT'
    ] as const) {
      expect(classifyRuntimeResult(runtimeResult(stopReason))).toMatchObject({
        state: 'FAILED_TERMINAL'
      })
    }
  })

  it('rejects malformed submissions, clocks, options, and failure payloads', async () => {
    expect(() => new InMemoryOperationalExecutionStore({ leaseMs: 0 })).toThrow(
      /positive integer/i
    )
    expect(
      () => new InMemoryOperationalExecutionStore({ maxAttempts: 0 })
    ).toThrow(/positive integer/i)
    expect(() => parseExecutionSubmission(42)).toThrow(/object/i)
    expect(() =>
      parseExecutionSubmission({
        tenantId: tenantA,
        idempotencyKey: 'missing-runtime'
      })
    ).toThrow(/tenantId must match runtime/i)
    expect(() =>
      parseExecutionSubmission(
        {
          tenantId: tenantA,
          idempotencyKey: 'tenant-mismatch',
          runtime: { ...runtimeInput(), tenantId: tenantB }
        },
        tenantA
      )
    ).toThrow(/tenantId must match/i)
    expect(() =>
      parseExecutionSubmission({
        tenantId: tenantA,
        capabilityFingerprint: 'binding-a',
        idempotencyKey: 'fingerprint-mismatch',
        runtime: { ...runtimeInput(), capabilityFingerprint: 'binding-b' }
      })
    ).toThrow(/fingerprint/i)

    const store = new InMemoryOperationalExecutionStore()
    await expect(
      store.submit({
        ...submission('missing-runtime'),
        runtime: null as never
      })
    ).rejects.toThrow(/runtime is required/i)
    await expect(
      store.submit(submission(), new Date('invalid'))
    ).rejects.toThrow(/now is invalid/i)
    await expect(store.get('', 'missing')).rejects.toMatchObject({
      code: 'validation_failed'
    })

    const created = await store.submit(submission('invalid-failure'))
    const claimed = await store.claimNext(tenantA, 'worker-invalid-failure')
    expect(claimed?.record.id).toBe(created.record.id)
    await store.transition({
      tenantId: tenantA,
      executionId: created.record.id,
      to: 'RUNNING',
      workerId: 'worker-invalid-failure',
      fenceToken: claimed!.record.attempt
    })

    const transitionBase = {
      tenantId: tenantA,
      executionId: created.record.id,
      to: 'FAILED_RETRYABLE' as const,
      workerId: 'worker-invalid-failure',
      fenceToken: claimed!.record.attempt
    }
    await expect(
      store.transition({
        ...transitionBase,
        failure: {
          kind: 'NOT_A_FAILURE',
          code: 'bad',
          message: 'bad'
        } as never
      })
    ).rejects.toThrow(/failure.kind/i)
    await expect(
      store.transition({
        ...transitionBase,
        failure: {
          kind: 'TECHNICAL_RETRYABLE',
          code: 'bad',
          message: 'x'.repeat(501)
        }
      })
    ).rejects.toThrow(/failure.message/i)
    await expect(
      store.transition({
        ...transitionBase,
        failure: {
          kind: 'TECHNICAL_RETRYABLE',
          code: 'bad',
          message: 'bad',
          retryAt: 'not-a-date'
        }
      })
    ).rejects.toThrow(/retryAt/i)
  })

  it('covers durable user and approval resumes, terminal cancellation, and recovery', async () => {
    const now = new Date('2026-09-17T00:00:00.000Z')
    const store = new InMemoryOperationalExecutionStore({
      clock: () => now,
      leaseMs: 10
    })
    expect(await store.claimNext(tenantB, 'worker-empty', now)).toBeNull()

    const userExecution = await store.submit(submission('user-resume'), now)
    const userClaim = await store.claimNext(tenantA, 'worker-user', now)
    await store.transition(
      {
        tenantId: tenantA,
        executionId: userExecution.record.id,
        to: 'RUNNING',
        workerId: 'worker-user',
        fenceToken: userClaim!.record.attempt
      },
      now
    )
    await store.transition(
      {
        tenantId: tenantA,
        executionId: userExecution.record.id,
        to: 'WAITING_USER',
        workerId: 'worker-user',
        fenceToken: userClaim!.record.attempt,
        result: runtimeResult('NEEDS_USER_INPUT')
      },
      now
    )
    const queued = await store.provideUserInput(
      {
        tenantId: tenantA,
        executionId: userExecution.record.id,
        actorId: 'operator-user',
        message: 'synthetic answer'
      },
      now
    )
    expect(queued.state).toBe('QUEUED')
    expect(
      await store.provideUserInput(
        {
          tenantId: tenantA,
          executionId: userExecution.record.id,
          actorId: 'operator-user',
          message: 'synthetic answer'
        },
        now
      )
    ).toMatchObject({ state: 'QUEUED' })
    await expect(
      store.provideUserInput(
        {
          tenantId: tenantA,
          executionId: userExecution.record.id,
          actorId: 'operator-user',
          message: 'different answer'
        },
        now
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })

    const approvalStore = new InMemoryOperationalExecutionStore({
      clock: () => now,
      leaseMs: 10
    })
    const approvalExecution = await approvalStore.submit(
      submission('approval-resume'),
      now
    )
    const approvalClaim = await approvalStore.claimNext(
      tenantA,
      'worker-approval-boundary',
      now
    )
    await approvalStore.transition(
      {
        tenantId: tenantA,
        executionId: approvalExecution.record.id,
        to: 'RUNNING',
        workerId: 'worker-approval-boundary',
        fenceToken: approvalClaim!.record.attempt
      },
      now
    )
    const waiting = await approvalStore.transition(
      {
        tenantId: tenantA,
        executionId: approvalExecution.record.id,
        to: 'WAITING_APPROVAL',
        workerId: 'worker-approval-boundary',
        fenceToken: approvalClaim!.record.attempt,
        approvalId: approvalId('approval-boundary'),
        result: {
          ...runtimeResult('APPROVAL_REQUIRED'),
          approvalId: approvalId('approval-boundary')
        }
      },
      now
    )
    expect(waiting.state).toBe('WAITING_APPROVAL')
    await expect(
      approvalStore.resolveApproval(
        {
          tenantId: tenantA,
          executionId: approvalExecution.record.id,
          approvalId: 'wrong-approval',
          actorId: 'operator-approval',
          decision: 'APPROVED'
        },
        now
      )
    ).rejects.toMatchObject({ code: 'conflict' })
    const resumed = await approvalStore.resolveApproval(
      {
        tenantId: tenantA,
        executionId: approvalExecution.record.id,
        approvalId: 'approval-boundary',
        actorId: 'operator-approval',
        decision: 'APPROVED'
      },
      now
    )
    expect(resumed.state).toBe('QUEUED')
    expect(
      await approvalStore.resolveApproval(
        {
          tenantId: tenantA,
          executionId: approvalExecution.record.id,
          approvalId: 'approval-boundary',
          actorId: 'operator-approval',
          decision: 'APPROVED'
        },
        now
      )
    ).toMatchObject({ state: 'QUEUED' })

    const terminalStore = new InMemoryOperationalExecutionStore({
      clock: () => now,
      leaseMs: 10
    })
    const terminal = await terminalStore.submit(
      submission('terminal-cancel'),
      now
    )
    const terminalClaim = await terminalStore.claimNext(
      tenantA,
      'worker-terminal-boundary',
      now
    )
    await terminalStore.transition(
      {
        tenantId: tenantA,
        executionId: terminal.record.id,
        to: 'RUNNING',
        workerId: 'worker-terminal-boundary',
        fenceToken: terminalClaim!.record.attempt
      },
      now
    )
    await terminalStore.transition(
      {
        tenantId: tenantA,
        executionId: terminal.record.id,
        to: 'SUCCEEDED',
        workerId: 'worker-terminal-boundary',
        fenceToken: terminalClaim!.record.attempt,
        result: runtimeResult('COMPLETED')
      },
      now
    )
    await expect(
      terminalStore.cancel(
        {
          tenantId: tenantA,
          executionId: terminal.record.id,
          actorId: 'operator-terminal'
        },
        now
      )
    ).rejects.toMatchObject({ code: 'invalid_action' })

    const recoveryStore = new InMemoryOperationalExecutionStore({
      clock: () => now,
      leaseMs: 10
    })
    const expired = await recoveryStore.submit(
      submission('expired-recovery'),
      now
    )
    const expiredClaim = await recoveryStore.claimNext(
      tenantA,
      'worker-expired',
      now
    )
    expect(expiredClaim?.record.id).toBe(expired.record.id)
    const recovered = await recoveryStore.recoverExpired(
      tenantA,
      new Date('2026-09-17T00:00:00.011Z')
    )
    expect(recovered.map((record) => record.id)).toContain(expired.record.id)
  })

  it('keeps worker failures, lease loss, observability, and shutdown bounded', async () => {
    const exceptionStore = new InMemoryOperationalExecutionStore()
    const exceptionSubmission = await exceptionStore.submit(
      submission('worker-exception')
    )
    const failed = await new OperationalExecutionWorker({
      store: exceptionStore,
      workerId: 'worker-exception',
      tenantId: tenantA,
      harnessOptions: () => {
        throw new Error('synthetic worker configuration failure')
      }
    }).processNext()
    expect(failed.kind).toBe('processed')
    if (failed.kind !== 'processed') return
    expect(failed.record.id).toBe(exceptionSubmission.record.id)
    expect(failed.record.state).toBe('FAILED_RETRYABLE')

    class LeaseLostStore extends InMemoryOperationalExecutionStore {
      override async transition(
        input: Parameters<InMemoryOperationalExecutionStore['transition']>[0],
        now?: Date
      ) {
        if (input.to === 'SUCCEEDED') {
          throw new OperationalExecutionError(
            'lease_lost',
            'synthetic lease loss'
          )
        }
        return super.transition(input, now)
      }
    }
    const leaseStore = new LeaseLostStore()
    await leaseStore.submit(submission('worker-lease-loss'))
    const leaseSignals: string[] = []
    const leaseResult = await new OperationalExecutionWorker({
      store: leaseStore,
      workerId: 'worker-lease-loss',
      tenantId: tenantA,
      harnessOptions: harnessOptions().options,
      onSignal: (name) => leaseSignals.push(name)
    }).processNext()
    expect(leaseResult.kind).toBe('processed')
    expect(leaseSignals).toContain('execution.lease_lost')

    const flushedSignals: string[] = []
    const observabilityStore = new InMemoryOperationalExecutionStore()
    await observabilityStore.submit(submission('worker-observability'))
    const fixtures = harnessOptions()
    const observabilityResult = await new OperationalExecutionWorker({
      store: observabilityStore,
      workerId: 'worker-observability',
      tenantId: tenantA,
      harnessOptions: {
        ...fixtures.options,
        audit: {
          append: async () => {
            throw new Error('audit sink failure')
          }
        },
        telemetry: {
          record: () => {
            throw new Error('telemetry sink failure')
          }
        }
      },
      onSignal: (name) => flushedSignals.push(name)
    }).processNext()
    expect(observabilityResult.kind).toBe('processed')
    expect(flushedSignals).toEqual(
      expect.arrayContaining([
        'execution.audit_failed',
        'execution.telemetry_failed'
      ])
    )

    let releaseDecision!: () => void
    let started!: () => void
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve
    })
    const decisionGate = new Promise<void>((resolve) => {
      releaseDecision = resolve
    })
    const shutdownStore = new InMemoryOperationalExecutionStore()
    const shutdownSubmission = await shutdownStore.submit(
      submission('worker-shutdown-wait')
    )
    const shutdownWorker = new OperationalExecutionWorker({
      store: shutdownStore,
      workerId: 'worker-shutdown-wait',
      tenantId: tenantA,
      harnessOptions: {
        ...harnessOptions().options,
        orchestrator: {
          decideNextStep: async () => {
            started()
            await decisionGate
            return {
              action: 'RESPOND' as const,
              response: 'synthetic complete'
            }
          }
        }
      }
    })
    const processing = shutdownWorker.processNext()
    await startedPromise
    const stopping = shutdownWorker.stop()
    releaseDecision()
    await Promise.all([processing, stopping])
    expect(
      (await shutdownStore.get(tenantA, shutdownSubmission.record.id))?.state
    ).toBe('SUCCEEDED')
  })
})
