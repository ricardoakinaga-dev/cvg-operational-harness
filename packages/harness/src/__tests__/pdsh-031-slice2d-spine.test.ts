import { describe, expect, it } from 'vitest'
import type {
  AuditEvent,
  ModelGateway,
  Orchestrator,
  PolicyEngine,
  ApprovalEngine,
  RuntimeInput,
  TelemetryEvent,
  ToolRegistry
} from '@cvg/harness-contracts'
import {
  InMemoryOperationalExecutionStore,
  OperationalExecutionError,
  OperationalExecutionWorker,
  createInMemoryOperationalExecutionStore,
  toExecutionView,
  type ExecutionSubmission,
  type ExecutionTransitionInput
} from '../execution-spine.ts'
import { InMemoryEffectJournal } from '../effect-journal.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000001'
const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

function runtimeInput(): RuntimeInput {
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
    tenantId: tenantA as RuntimeInput['tenantId'],
    conversationId: 'conversation_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_synthetic' as RuntimeInput['sessionId'],
    correlationId: 'correlation_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_synthetic' as RuntimeInput['traceId'],
    userMessage: 'hello synthetic harness',
    context: {
      values: { source: 'fixture' },
      sourceIds: ['fixture'],
      capturedAt: '2026-10-12T00:00:00.000Z'
    },
    state: {
      version: 1,
      values: {},
      updatedAt: '2026-10-12T00:00:00.000Z'
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

function submission(idempotencyKey: string): ExecutionSubmission {
  return { tenantId: tenantA, idempotencyKey, runtime: runtimeInput() }
}

function harnessPorts(): {
  orchestrator: Orchestrator
  modelGateway: ModelGateway
  policy: PolicyEngine
  approvals: ApprovalEngine
  tools: ToolRegistry
  audit: { append: (event: AuditEvent) => Promise<void> }
  telemetry: { record: (event: TelemetryEvent) => void }
} {
  return {
    orchestrator: {
      decideNextStep: async () => ({
        action: 'RESPOND',
        response: 'synthetic complete'
      })
    },
    modelGateway: {
      complete: async () => ({
        text: 'model fixture',
        provider: 'deterministic-v1',
        model: 'fixture',
        inputTokens: 1,
        outputTokens: 1,
        costUsd: 0
      })
    },
    policy: {
      evaluate: async () => ({
        outcome: 'ALLOW',
        reason: 'synthetic allow',
        policyVersion: 'synthetic-v1'
      })
    },
    approvals: {
      request: async () => ({
        status: 'PENDING',
        reason: 'synthetic approval pending'
      })
    },
    tools: { list: () => [], resolve: () => undefined },
    audit: { append: async () => {} },
    telemetry: { record: () => {} }
  }
}

async function runningRecord(
  store: InMemoryOperationalExecutionStore,
  key: string,
  workerId = 'worker-slice2d'
) {
  const submitted = await store.submit(submission(key))
  const claimed = await store.claimNext(tenantA, workerId)
  const running = await store.transition({
    tenantId: tenantA,
    executionId: submitted.record.id,
    to: 'RUNNING',
    workerId,
    fenceToken: claimed!.record.attempt
  })
  return { submitted, claimed: claimed!, running }
}

describe('PDSH-031 slice 2d-3a — execution spine store edges', () => {
  it('rejects waiting-approval requeue, missing records and clockless calls', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const { submitted, running } = await runningRecord(store, 'waiting-requeue')
    await store.transition({
      tenantId: tenantA,
      executionId: submitted.record.id,
      to: 'WAITING_APPROVAL',
      workerId: 'worker-slice2d',
      fenceToken: running.attempt,
      result: {
        response: 'approval required',
        stopReason: 'APPROVAL_REQUIRED',
        approvalId: 'approval-slice2d' as never,
        steps: 1,
        modelCalls: 0,
        toolCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      }
    })
    await expect(
      store.transition({
        tenantId: tenantA,
        executionId: submitted.record.id,
        to: 'QUEUED',
        approvalId: 'approval-slice2d'
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })

    await expect(
      store.transition({
        tenantId: tenantA,
        executionId: 'exec_missing',
        to: 'QUEUED'
      })
    ).rejects.toMatchObject({ code: 'not_found' })

    expect(await store.recoverExpired(tenantA)).toEqual([])

    const userStore = new InMemoryOperationalExecutionStore()
    const user = await runningRecord(userStore, 'waiting-user')
    await userStore.transition({
      tenantId: tenantA,
      executionId: user.submitted.record.id,
      to: 'WAITING_USER',
      workerId: 'worker-slice2d',
      fenceToken: user.running.attempt,
      result: {
        response: 'need input',
        stopReason: 'NEEDS_USER_INPUT',
        steps: 1,
        modelCalls: 0,
        toolCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      }
    })
    const queued = await userStore.provideUserInput({
      tenantId: tenantA,
      executionId: user.submitted.record.id,
      actorId: 'operator-slice2d',
      message: 'synthetic answer'
    })
    expect(queued.state).toBe('QUEUED')
  })

  it('claims queued work in creation order and honors the retry window', async () => {
    const now = new Date('2026-10-12T10:00:00.000Z')
    const orderStore = new InMemoryOperationalExecutionStore({
      clock: () => now
    })
    const first = await orderStore.submit(submission('order-1'))
    await orderStore.submit(submission('order-2'))
    const claimed = await orderStore.claimNext(tenantA, 'worker-order', now)
    expect(claimed?.record.id).toBe(first.record.id)

    const retryStore = new InMemoryOperationalExecutionStore({
      clock: () => now
    })
    const retry = await runningRecord(
      retryStore,
      'retry-window',
      'worker-retry'
    )
    await retryStore.transition(
      {
        tenantId: tenantA,
        executionId: retry.submitted.record.id,
        to: 'FAILED_RETRYABLE',
        workerId: 'worker-retry',
        fenceToken: retry.running.attempt,
        failure: {
          kind: 'TECHNICAL_RETRYABLE',
          code: 'synthetic_timeout',
          message: 'synthetic retryable',
          retryAt: new Date(now.getTime() - 1_000).toISOString()
        }
      },
      now
    )
    const recovered = await retryStore.claimNext(tenantA, 'worker-retry-2', now)
    expect(recovered?.recovered).toBe(true)
    expect(recovered?.record.id).toBe(retry.submitted.record.id)

    const futureStore = new InMemoryOperationalExecutionStore({
      clock: () => now
    })
    const later = await runningRecord(
      futureStore,
      'retry-future',
      'worker-future'
    )
    await futureStore.transition(
      {
        tenantId: tenantA,
        executionId: later.submitted.record.id,
        to: 'FAILED_RETRYABLE',
        workerId: 'worker-future',
        fenceToken: later.running.attempt,
        failure: {
          kind: 'TECHNICAL_RETRYABLE',
          code: 'synthetic_timeout',
          message: 'synthetic retryable',
          retryAt: new Date(now.getTime() + 60_000).toISOString()
        }
      },
      now
    )
    expect(await futureStore.claimNext(tenantA, 'worker-none', now)).toBeNull()
  })

  it('resolves rejections idempotently, binds result approvals and cancels quietly', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const rejected = await runningRecord(store, 'rejection-1')
    await store.transition({
      tenantId: tenantA,
      executionId: rejected.submitted.record.id,
      to: 'WAITING_APPROVAL',
      workerId: 'worker-slice2d',
      fenceToken: rejected.running.attempt,
      result: {
        response: 'approval required',
        stopReason: 'APPROVAL_REQUIRED',
        approvalId: 'approval-reject' as never,
        steps: 1,
        modelCalls: 0,
        toolCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      }
    })
    const decided = await store.resolveApproval({
      tenantId: tenantA,
      executionId: rejected.submitted.record.id,
      approvalId: 'approval-reject',
      actorId: 'operator-slice2d',
      decision: 'REJECTED',
      reason: 'synthetic rejection'
    })
    expect(decided.state).toBe('FAILED_TERMINAL')
    expect(decided.failure).toMatchObject({
      kind: 'POLICY_DENIED',
      code: 'approval_rejected',
      message: 'synthetic rejection'
    })
    const replay = await store.resolveApproval({
      tenantId: tenantA,
      executionId: rejected.submitted.record.id,
      approvalId: 'approval-reject',
      actorId: 'operator-slice2d',
      decision: 'REJECTED',
      reason: 'synthetic rejection'
    })
    expect(replay.state).toBe('FAILED_TERMINAL')
    await expect(
      store.resolveApproval({
        tenantId: tenantA,
        executionId: rejected.submitted.record.id,
        approvalId: 'approval-reject',
        actorId: 'operator-slice2d',
        decision: 'APPROVED'
      })
    ).rejects.toMatchObject({ code: 'invalid_action' })

    const bare = await runningRecord(store, 'rejection-2')
    await store.transition({
      tenantId: tenantA,
      executionId: bare.submitted.record.id,
      to: 'WAITING_APPROVAL',
      workerId: 'worker-slice2d',
      fenceToken: bare.running.attempt,
      approvalId: 'approval-bare'
    })
    const bareRejected = await store.resolveApproval({
      tenantId: tenantA,
      executionId: bare.submitted.record.id,
      approvalId: 'approval-bare',
      actorId: 'operator-slice2d',
      decision: 'REJECTED'
    })
    expect(bareRejected.failure?.message).toBe('Approval was rejected.')

    const cancelled = await runningRecord(store, 'cancel-bare')
    await store.transition({
      tenantId: tenantA,
      executionId: cancelled.submitted.record.id,
      to: 'FAILED_RETRYABLE',
      workerId: 'worker-slice2d',
      fenceToken: cancelled.running.attempt,
      failure: {
        kind: 'TECHNICAL_RETRYABLE',
        code: 'synthetic_timeout',
        message: 'synthetic retryable'
      }
    })
    const quiet = await store.cancel({
      tenantId: tenantA,
      executionId: cancelled.submitted.record.id,
      actorId: 'operator-slice2d'
    })
    expect(quiet.failure?.message).toBe('Execution cancelled by operator.')
  })

  it('carries fingerprint bindings through submissions and views', async () => {
    const store = createInMemoryOperationalExecutionStore()
    expect(store).toBeInstanceOf(InMemoryOperationalExecutionStore)
    const submitted = await store.submit({
      ...submission('fingerprint-view'),
      capabilityFingerprint: 'binding-a'
    })
    expect(submitted.record.request.capabilityFingerprint).toBe('binding-a')
    expect(toExecutionView(submitted.record).capabilityFingerprint).toBe(
      'binding-a'
    )

    const runtimeBound = await store.submit({
      ...submission('fingerprint-runtime'),
      runtime: {
        ...runtimeInput(),
        capabilityFingerprint: 'binding-runtime'
      }
    })
    expect(runtimeBound.record.request.capabilityFingerprint).toBe(
      'binding-runtime'
    )
  })

  it('refreshes a lease without an explicit clock', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const { claimed } = await runningRecord(store, 'heartbeat-default-now')
    const refreshed = await store.heartbeat(
      tenantA,
      claimed.record.id,
      'worker-slice2d',
      claimed.record.attempt
    )
    expect(refreshed.leaseUntil).toBeTruthy()
  })
})

describe('PDSH-031 slice 2d-3a — execution worker edges', () => {
  it('returns idle when the queue is empty', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-idle',
      tenantId: tenantA,
      harnessOptions: harnessPorts()
    })
    expect(await worker.processNext()).toEqual({ kind: 'idle' })
  })

  it('claims a retry with the retry signal and executes a durable resume', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const retry = await runningRecord(store, 'worker-retry-claimed', 'worker-r')
    await store.transition({
      tenantId: tenantA,
      executionId: retry.submitted.record.id,
      to: 'FAILED_RETRYABLE',
      workerId: 'worker-r',
      fenceToken: retry.running.attempt,
      failure: {
        kind: 'TECHNICAL_RETRYABLE',
        code: 'synthetic_timeout',
        message: 'synthetic retryable',
        retryAt: '2020-01-01T00:00:00.000Z'
      }
    })
    const signals: string[] = []
    const retryWorker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-retry-run',
      tenantId: tenantA,
      harnessOptions: harnessPorts(),
      onSignal: (name) => signals.push(name)
    })
    const processed = await retryWorker.processNext()
    expect(processed.kind).toBe('processed')
    expect(signals).toContain('execution.retry_claimed')

    const resumed = await runningRecord(store, 'worker-resume', 'worker-a')
    await store.transition({
      tenantId: tenantA,
      executionId: resumed.submitted.record.id,
      to: 'WAITING_APPROVAL',
      workerId: 'worker-a',
      fenceToken: resumed.running.attempt,
      approvalId: 'approval-resume-worker',
      result: {
        response: 'approval required',
        stopReason: 'APPROVAL_REQUIRED',
        approvalId: 'approval-resume-worker' as never,
        steps: 1,
        modelCalls: 0,
        toolCalls: 0,
        usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
      }
    })
    await store.resolveApproval({
      tenantId: tenantA,
      executionId: resumed.submitted.record.id,
      approvalId: 'approval-resume-worker',
      actorId: 'operator-slice2d',
      decision: 'APPROVED'
    })
    const resumeSignals: string[] = []
    const resumeWorker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-resume-run',
      tenantId: tenantA,
      effectJournal: new InMemoryEffectJournal(),
      effectJournalOptions: {},
      harnessOptions: harnessPorts(),
      onSignal: (name) => resumeSignals.push(name)
    })
    const resumedResult = await resumeWorker.processNext()
    expect(resumedResult.kind).toBe('processed')
    if (resumedResult.kind !== 'processed') return
    expect(resumedResult.record.id).toBe(resumed.submitted.record.id)
    expect(resumedResult.record.state).toBe('SUCCEEDED')
    expect(resumeSignals).toContain('execution.claimed')
  })

  it('keeps one heartbeat in flight and reports heartbeat failures', async () => {
    class PatientHeartbeatStore extends InMemoryOperationalExecutionStore {
      override async heartbeat(
        tenantId: string,
        executionId: string,
        workerId: string,
        fenceToken: number,
        now?: Date,
        leaseMs?: number
      ) {
        await sleep(25)
        return super.heartbeat(
          tenantId,
          executionId,
          workerId,
          fenceToken,
          now,
          leaseMs
        )
      }
    }
    const patientStore = new PatientHeartbeatStore({ leaseMs: 5_000 })
    await patientStore.submit(submission('heartbeat-in-flight'))
    const patientWorker = new OperationalExecutionWorker({
      store: patientStore,
      workerId: 'worker-patient-heartbeat',
      tenantId: tenantA,
      leaseMs: 5_000,
      heartbeatMs: 1,
      harnessOptions: {
        ...harnessPorts(),
        orchestrator: {
          decideNextStep: async () => {
            await sleep(60)
            return { action: 'RESPOND' as const, response: 'patient complete' }
          }
        }
      }
    })
    const processed = await patientWorker.processNext()
    expect(processed.kind).toBe('processed')
    if (processed.kind === 'processed') {
      expect(processed.record.state).toBe('SUCCEEDED')
    }

    class FailingHeartbeatStore extends InMemoryOperationalExecutionStore {
      override async heartbeat(): Promise<
        Awaited<ReturnType<InMemoryOperationalExecutionStore['heartbeat']>>
      > {
        await sleep(5)
        throw new Error('synthetic heartbeat failure')
      }
    }
    const failingStore = new FailingHeartbeatStore({ leaseMs: 5_000 })
    await failingStore.submit(submission('heartbeat-failure'))
    const heartbeatSignals: string[] = []
    const failingWorker = new OperationalExecutionWorker({
      store: failingStore,
      workerId: 'worker-failing-heartbeat',
      tenantId: tenantA,
      leaseMs: 5_000,
      heartbeatMs: 1,
      harnessOptions: {
        ...harnessPorts(),
        orchestrator: {
          decideNextStep: async () => {
            await sleep(25)
            return { action: 'RESPOND' as const, response: 'failing complete' }
          }
        }
      },
      onSignal: (name) => heartbeatSignals.push(name)
    })
    const failingProcessed = await failingWorker.processNext()
    expect(failingProcessed.kind).toBe('processed')
    expect(heartbeatSignals).toContain('execution.heartbeat_failed')
  })

  it('normalizes non-Error worker configuration failures', async () => {
    const store = new InMemoryOperationalExecutionStore()
    const submitted = await store.submit(submission('worker-raw-failure'))
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-raw-failure',
      tenantId: tenantA,
      harnessOptions: (() => {
        throw 'raw configuration failure'
      }) as never
    })
    const processed = await worker.processNext()
    expect(processed.kind).toBe('processed')
    if (processed.kind !== 'processed') return
    expect(processed.record.id).toBe(submitted.record.id)
    expect(processed.record.state).toBe('FAILED_RETRYABLE')
    expect(processed.record.failure?.message).toBe('worker execution failed')
  })

  it('persists an empty-audit terminal outcome when the fingerprint conflicts', async () => {
    const { composeCapabilities } = await import('../capability-boundary.ts')
    const store = new InMemoryOperationalExecutionStore()
    const submitted = await store.submit({
      ...submission('worker-fingerprint-conflict'),
      capabilityFingerprint: 'binding-conflict'
    })
    const { registry } = composeCapabilities([])
    const { tools: _tools, ...withoutTools } = harnessPorts()
    void _tools
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-fingerprint-conflict',
      tenantId: tenantA,
      harnessOptions: {
        ...withoutTools,
        capabilities: registry,
        effectJournal: new InMemoryEffectJournal()
      }
    })
    const processed = await worker.processNext()
    expect(processed.kind).toBe('processed')
    if (processed.kind !== 'processed') return
    expect(processed.record.id).toBe(submitted.record.id)
    expect(processed.record.state).toBe('FAILED_TERMINAL')
    expect(processed.record.failure?.code).toBe('state_conflict')
  })

  it('returns idle when the lease was lost and the record disappeared', async () => {
    class VanishedLeaseStore extends InMemoryOperationalExecutionStore {
      override async transition(
        input: ExecutionTransitionInput,
        now?: Date
      ): ReturnType<InMemoryOperationalExecutionStore['transition']> {
        if (input.to === 'SUCCEEDED') {
          throw new OperationalExecutionError('lease_lost', 'synthetic loss')
        }
        return super.transition(input, now)
      }

      override async get(): Promise<null> {
        return null
      }
    }
    const store = new VanishedLeaseStore()
    await store.submit(submission('worker-vanished-lease'))
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-vanished',
      tenantId: tenantA,
      harnessOptions: harnessPorts()
    })
    expect(await worker.processNext()).toEqual({ kind: 'idle' })
  })

  it('rethrows outcome store failures that are not lease losses', async () => {
    class BrokenOutcomeStore extends InMemoryOperationalExecutionStore {
      override async transition(
        input: ExecutionTransitionInput,
        now?: Date
      ): ReturnType<InMemoryOperationalExecutionStore['transition']> {
        if (input.to === 'SUCCEEDED') {
          throw new Error('synthetic store failure')
        }
        return super.transition(input, now)
      }
    }
    const store = new BrokenOutcomeStore()
    await store.submit(submission('worker-broken-outcome'))
    const worker = new OperationalExecutionWorker({
      store,
      workerId: 'worker-broken',
      tenantId: tenantA,
      harnessOptions: harnessPorts()
    })
    await expect(worker.processNext()).rejects.toThrow(
      'synthetic store failure'
    )
  })
})
