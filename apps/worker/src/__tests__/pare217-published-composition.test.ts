// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executePublishedAgent, getConversationTimeline } from '@cvg/agent-core'
import {
  InMemoryDatabase,
  OutboxRepository,
  type ControlledPublishedAdmissionRecord,
  type ControlledPublishedClaim,
  type FencedOutboxClaimAdapter,
  type FencedOutboxAckInput,
  type FencedOutboxFailInput,
  type TenantScopedPostgresRuntimeRepository,
  type TenantScopedPostgresControlPlaneRepository,
  type InboundRuntimeContext
} from '@cvg/persistence'
import {
  InMemoryControlPlaneStore,
  createControlledReferencePreset,
  createControlledCapabilityGateway,
  prepareControlledPublishedAdmission,
  type ControlledKernelHostContext,
  type PluginAuditEvent,
  type TestRunTrace
} from '@cvg/platform'
import {
  ClaimExecutionRegistry,
  type ClaimedEventExecution
} from '../claimed-execution-lifecycle.ts'
import { createControlledDispatch } from '../controlled-worker.ts'
import { processOutboxEvent } from '../jobs/process-outbox-event.ts'
import {
  createPublishedKernelHandlers,
  closePublishedWorkerResources,
  type PublishedKernelStore
} from '../published-kernel-composition.ts'

vi.mock('@cvg/agent-core', async (original) => ({
  ...(await original<typeof import('@cvg/agent-core')>()),
  executePublishedAgent: vi.fn(),
  getConversationTimeline: vi.fn()
}))

const tenantId = 'tenant_00000000-0000-4000-8000-000000000217'
const workerId = 'worker.synthetic217:00000000-0000-4000-8000-000000000001'
const correlationId = 'corr_00000000-0000-4000-8000-000000000217'
const actor = {
  id: 'system.controlled-runtime',
  role: 'System' as const,
  permissions: ['scheduling:read']
}
function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
async function flush() {
  for (let i = 0; i < 35; i++) await Promise.resolve()
}

async function fixture(
  disposition: ControlledPublishedClaim['disposition'] = 'ACTIVE'
) {
  const memory = new InMemoryControlPlaneStore()
  const agent = await memory.createAgent(
    { tenantId },
    {
      slug: 'synthetic217-worker',
      name: 'Synthetic',
      description: 'Synthetic only'
    }
  )
  const draft = await memory.createVersion(
    { tenantId },
    agent.id,
    createControlledReferencePreset().config,
    'synthetic'
  )
  const version = { ...draft, status: 'PUBLISHED' as const }
  const repo = new OutboxRepository(new InMemoryDatabase())
  repo.enqueue({
    tenantId,
    type: 'inbound.process',
    correlationId,
    conversationId: 'conversation217',
    sessionId: 'session217',
    inboundMessageId: 'message217',
    idempotencyKey: 'published217',
    payload: { synthetic: true }
  })
  const event = repo.claimNext({ tenantId, workerId, leaseMs: 10_000 })!
  const outer = {
    tenantId,
    eventId: event.id,
    processWorkerId: workerId,
    expectedOuterAttempt: event.attempts!,
    expectedAttemptRowId: '9007199254740993'
  }
  const proposed = prepareControlledPublishedAdmission({
    version,
    actor,
    gateway: createControlledCapabilityGateway(),
    input: {
      tenantId,
      agentId: agent.id,
      versionId: version.id,
      message: 'Mensagem sintética',
      history: ['inbound: original history'],
      executionId: 'exec_00000000-0000-4000-8000-000000000217',
      traceId: 'trace_00000000-0000-4000-8000-000000000217',
      correlationId,
      inboundMessageId: 'message217',
      executionMode: 'CONTROLLED_RUNTIME',
      context: { conversationId: 'conversation217', sessionId: 'session217' }
    }
  })
  let record: ControlledPublishedAdmissionRecord = {
    ...proposed,
    executionId: proposed.input.executionId
  }
  const traceFor = (): TestRunTrace => ({
    traceId: record.input.traceId,
    tenantId,
    agentId: agent.id,
    versionId: version.id,
    input: {
      message: record.input.message,
      historySize: record.input.history.length
    },
    intent: { name: 'small_talk', confidence: 1 },
    policy: [],
    knowledge: { status: 'not_requested' },
    tools: [],
    handoff: {
      requested: disposition === 'SETTLEMENT',
      reason: null,
      state: 'BOT_ACTIVE'
    },
    response: {
      text: 'Resposta sintética',
      mode: disposition === 'SETTLEMENT' ? 'handoff' : 'answer'
    },
    provider: {
      provider: 'fake',
      model: 'deterministic-v1',
      externalCall: false
    },
    configVersion: 'synthetic',
    executionMode: 'CONTROLLED_RUNTIME',
    status: disposition === 'SETTLEMENT' ? 'failed' : 'completed',
    conversationId: 'conversation217',
    sessionId: 'session217',
    createdAt: new Date()
  })
  const state: ControlledPublishedClaim['state'] = {
    phaseState:
      disposition === 'CLOSED'
        ? 'CLOSED'
        : disposition === 'SETTLEMENT'
          ? 'FAULTED'
          : 'IDLE_SEALED',
    snapshot: null,
    checkpoint: null,
    closedTrace: disposition === 'CLOSED' ? traceFor() : null,
    runtimeResult:
      disposition === 'CLOSED'
        ? {
            response: 'Resposta sintética',
            stopReason: 'COMPLETED',
            steps: 1,
            modelCalls: 1,
            toolCalls: 0,
            usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
          }
        : null,
    sealId: 'seal_synthetic',
    stateRevision: 0,
    sequence: 0,
    hash: `sha256-${'0'.repeat(64)}`,
    sealCheckpointDigest: null,
    sealStateDigest: null,
    sealedThroughSequence: 0,
    phaseRevision: 0,
    openPhase: null,
    consumedSealId: null
  }
  const makeClaim = (): ControlledPublishedClaim => ({
    ...record,
    fence: {
      tenantId,
      executionId: record.executionId,
      workerId,
      attempt: 1,
      outer
    },
    identity: {
      tenantId,
      executionId: record.executionId,
      workerId,
      attempt: 1,
      correlationId,
      traceId: record.input.traceId,
      inboundMessageId: 'message217',
      conversationId: 'conversation217',
      sessionId: 'session217',
      agentId: agent.id,
      versionId: version.id,
      requestDigest: record.requestDigest,
      outboxId: event.id,
      outerAttempt: outer.expectedOuterAttempt,
      outerWorkerId: workerId,
      outerAttemptRowId: outer.expectedAttemptRowId
    },
    state,
    prepared: null,
    expiresAt: null,
    disposition
  })
  const renew = vi.fn(async () => ({
    claimRef: outer,
    dbNow: new Date().toISOString(),
    leaseUntil: new Date(Date.now() + 10_000).toISOString()
  }))
  const readAdmission = vi.fn(
    async (): Promise<ControlledPublishedAdmissionRecord | null> => record
  )
  const admit = vi.fn<PublishedKernelStore['admit']>(async (next) => {
    record = {
      executionId: next.input.executionId,
      input: next.input,
      runtime: next.runtime,
      requestDigest: next.requestDigest,
      fingerprint: next.fingerprint
    }
    return record
  })
  const claim = vi.fn(async () => makeClaim())
  const appendToolAudit = vi.fn<PublishedKernelStore['appendToolAudit']>(
    async () => {}
  )
  const createHost = vi.fn<PublishedKernelStore['createHost']>(
    (claim, lifecycle, signal) =>
      ({
        identity: claim.identity,
        state: claim.state,
        expiresAt: claim.expiresAt,
        lifecycle,
        signal
      }) as ControlledKernelHostContext
  )
  const store: PublishedKernelStore = {
    readAdmission,
    admit,
    claim,
    renewPaired: renew,
    appendToolAudit,
    createHost
  }
  const context: InboundRuntimeContext = {
    message: {
      id: 'message217',
      conversationId: 'conversation217',
      externalMessageId: 'external217',
      direction: 'inbound',
      body: 'Mensagem sintética',
      runtimeStatus: 'pending',
      createdAt: new Date()
    },
    session: {
      id: 'session217',
      conversationId: 'conversation217',
      status: 'open',
      takeoverState: 'BOT_ACTIVE',
      agentId: agent.id,
      agentVersionId: version.id,
      createdAt: new Date(),
      updatedAt: new Date()
    },
    channel: 'web',
    senderRef: 'synthetic',
    correlationId
  }
  const complete = vi.fn<
    TenantScopedPostgresRuntimeRepository['completeInboundRuntime']
  >(async () => ({ status: 'completed' }))
  const conversations = {
    findInboundRuntimeContext: vi.fn(async () => context),
    bindSessionAgentVersion: vi.fn(),
    completeInboundRuntime: complete
  } as unknown as TenantScopedPostgresRuntimeRepository
  const getVersion = vi.fn(async () => version)
  const platform = {
    getVersion,
    resolvePublished: vi.fn(async () => version)
  } as unknown as TenantScopedPostgresControlPlaneRepository
  let execution!: ClaimedEventExecution
  const fail = vi.fn(async (input: FencedOutboxFailInput) => {
    expect(input.claimRef).toEqual(outer)
    return { ...event, status: 'failed' as const }
  })
  const ack = vi.fn(async (input: FencedOutboxAckInput) => {
    await input.effect?.(event)
    await input.beforeFinalAck()
    return { ...event, status: 'processed' as const }
  })
  const adapter: FencedOutboxClaimAdapter = {
    enqueue: repo.enqueue.bind(repo),
    claimNext: repo.claimNext.bind(repo),
    ack: repo.ack.bind(repo),
    fail: repo.fail.bind(repo),
    requeueDeadLetter: repo.requeueDeadLetter.bind(repo),
    claimNextFenced: vi.fn(async () => ({
      event,
      claimRef: outer,
      dbClaimedAt: new Date().toISOString()
    })),
    renewOutboxClaim: renew,
    ackClaim: ack,
    failClaim: fail
  }
  const env = {
    CVG_WORKER_PUBLISHED_DURABILITY: 'postgres-v1',
    CVG_WORKER_QUEUE_ADAPTER: 'postgres-controlled',
    CVG_WORKER_CONTROLLED_MODE: 'true',
    POSTGRES_RLS_ENFORCEMENT: 'true',
    CVG_WORKER_AGENT_ID: agent.id
  }
  const registry = new ClaimExecutionRegistry({
    tenantId,
    workerId,
    adapter,
    renewPaired: renew,
    buildEffect: (handle) => {
      execution = handle
      return createControlledDispatch(
        createPublishedKernelHandlers({
          env,
          conversations,
          platform,
          store,
          claimContext: handle
        })
      )
    }
  })
  vi.mocked(executePublishedAgent).mockImplementation(async (_input, host) => {
    host!.lifecycle.requestStop('finalizing')
    await host!.lifecycle.stopAndJoin()
    return { status: 'completed', trace: traceFor() }
  })
  vi.mocked(getConversationTimeline).mockResolvedValue({
    messages: [{ ...context.message, id: 'earlier217' }],
    sessions: []
  })
  return {
    input: { tenantId, workerId, adapter, claimExecutions: registry },
    registry,
    store,
    readAdmission,
    admit,
    claim,
    appendToolAudit,
    createHost,
    context,
    conversations,
    platform,
    getVersion,
    complete,
    fail,
    ack,
    renew,
    event,
    outer,
    state,
    record: () => record,
    traceFor,
    execution: () => execution
  }
}

beforeEach(() => {
  vi.mocked(executePublishedAgent).mockReset()
  vi.mocked(getConversationTimeline).mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('SPEC217 published durable compositor (synthetic ports)', () => {
  it('atomic mirror failure aborts the attempt and prevents completion', async () => {
    const f = await fixture()
    const sql = new Error('synthetic mirror SQL failure')
    f.appendToolAudit.mockRejectedValueOnce(sql)
    vi.mocked(executePublishedAgent).mockImplementationOnce(async (input) => {
      await input.onToolAudit!({
        type: 'tool_call',
        tenantId,
        traceId: input.traceId!,
        agentId: input.agentId,
        versionId: input.versionId!,
        correlationId,
        plugin: 'scheduling.controlled',
        toolName: 'find_available_slots',
        status: 'succeeded',
        payload: {}
      })
      return { status: 'completed', trace: f.traceFor() }
    })
    await expect(processOutboxEvent(f.input)).resolves.toMatchObject({
      status: 'failed'
    })
    expect(f.execution().signal.aborted).toBe(true)
    expect(f.complete).not.toHaveBeenCalled()
    expect(f.fail).toHaveBeenCalledTimes(1)
    const error = f.fail.mock.calls[0]![0].error
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toContain(sql)
  })

  it('shutdown waits for settlement failure before ending the pool and reports failure', async () => {
    const f = await fixture()
    const body = deferred()
    const admitted = deferred()
    const failed = deferred<ReturnType<typeof f.traceFor>>()
    const sql = new Error('synthetic failClaim SQL failure')
    vi.mocked(executePublishedAgent).mockImplementationOnce(async () => {
      admitted.resolve()
      await body.promise
      return { status: 'completed', trace: f.traceFor() }
    })
    f.fail.mockImplementationOnce(async () => {
      await failed.promise
      throw sql
    })
    const job = processOutboxEvent(f.input)
    await admitted.promise
    const pool = { end: vi.fn(async () => {}) }
    const closed = closePublishedWorkerResources(f.registry, pool, job).catch(
      (error: unknown) => error
    )
    body.resolve()
    await flush()
    expect(pool.end).not.toHaveBeenCalled()
    failed.resolve(f.traceFor())
    const result = await closed
    expect(result).toBeInstanceOf(AggregateError)
    expect((result as AggregateError).errors).toContain(sql)
    expect(pool.end).toHaveBeenCalledTimes(1)
  })
  it('uses original admission on redelivery, attaches paired renewal, and calls the real facade seam with the exact handle host', async () => {
    const f = await fixture()
    await expect(processOutboxEvent(f.input)).resolves.toMatchObject({
      status: 'processed'
    })
    expect(f.admit).not.toHaveBeenCalled()
    expect(getConversationTimeline).not.toHaveBeenCalled()
    expect(f.getVersion).not.toHaveBeenCalled()
    const [input, host] = vi.mocked(executePublishedAgent).mock.calls[0]!
    expect(input.history).toEqual(['inbound: original history'])
    expect(input.traceId).toBe(f.record().input.traceId)
    expect(host!.signal).toBe(f.execution().signal)
    expect(f.execution().state).toBe('STOPPED')
    expect(f.execution().signal.aborted).toBe(false)
    expect(f.renew).toHaveBeenCalledTimes(2)
    expect(f.complete.mock.calls[0]![0].toolAuditEvents).toEqual([])
  })
  it('first admission persists the returned identity rather than assuming another ID', async () => {
    const f = await fixture()
    f.readAdmission.mockResolvedValueOnce(null)
    await expect(processOutboxEvent(f.input)).resolves.toMatchObject({
      status: 'processed'
    })
    expect(f.admit).toHaveBeenCalledTimes(1)
    expect(getConversationTimeline).toHaveBeenCalledTimes(1)
    expect(f.claim).toHaveBeenCalledWith(f.record().executionId, f.outer)
    expect(f.record().input.executionId).toMatch(/^exec_[0-9a-f-]{36}$/)
  })
  it('CLOSED replay performs completion with the persisted trace and no host/kernel/factory dispatch', async () => {
    const f = await fixture('CLOSED')
    await expect(processOutboxEvent(f.input)).resolves.toMatchObject({
      status: 'processed'
    })
    expect(executePublishedAgent).not.toHaveBeenCalled()
    expect(f.createHost).not.toHaveBeenCalled()
    expect(f.renew).toHaveBeenCalledTimes(1)
    expect(f.complete.mock.calls[0]![0].trace).toBe(f.state.closedTrace)
  })
  it('OPEN/FAULTED settlement skips attach and enters the facade with a stopped healthy lifecycle', async () => {
    const f = await fixture('SETTLEMENT')
    vi.mocked(executePublishedAgent).mockImplementationOnce(
      async (_input, host) => {
        expect(f.execution().state).toBe('STOPPED')
        expect(host!.state.phaseState).toBe('FAULTED')
        expect(host!.signal.aborted).toBe(false)
        return { status: 'completed', trace: f.traceFor() }
      }
    )
    await processOutboxEvent(f.input)
    expect(f.renew).toHaveBeenCalledTimes(1)
    expect(f.complete).toHaveBeenCalledTimes(1)
  })
  it('waits for actual atomic tool mirror before allowing empty-array completion', async () => {
    const f = await fixture()
    const mirror = deferred()
    f.appendToolAudit.mockImplementationOnce(() => mirror.promise)
    vi.mocked(executePublishedAgent).mockImplementationOnce(
      async (input, host) => {
        const audit: PluginAuditEvent = {
          type: 'tool_call',
          tenantId,
          traceId: input.traceId!,
          agentId: input.agentId,
          versionId: input.versionId!,
          correlationId,
          plugin: 'scheduling.controlled',
          toolName: 'find_available_slots',
          status: 'succeeded',
          payload: { synthetic: true }
        }
        await input.onToolAudit!(audit)
        host!.lifecycle.requestStop('finalizing')
        await host!.lifecycle.stopAndJoin()
        return { status: 'completed', trace: f.traceFor() }
      }
    )
    const job = processOutboxEvent(f.input)
    await flush()
    expect(f.appendToolAudit).toHaveBeenCalledTimes(1)
    expect(f.complete).not.toHaveBeenCalled()
    mirror.resolve()
    await job
    expect(f.complete.mock.calls[0]![0].toolAuditEvents).toEqual([])
  })
  it('joins a pending mirror even when the facade rejects, then uses one fenced fail', async () => {
    const f = await fixture()
    const mirror = deferred()
    f.appendToolAudit.mockImplementationOnce(() => mirror.promise)
    vi.mocked(executePublishedAgent).mockImplementationOnce(async (input) => {
      void input.onToolAudit!({
        type: 'tool_call',
        tenantId,
        traceId: input.traceId!,
        agentId: input.agentId,
        versionId: input.versionId!,
        correlationId,
        plugin: 'scheduling.controlled',
        toolName: 'find_available_slots',
        status: 'succeeded',
        payload: {}
      })
      throw new Error('synthetic facade failure')
    })
    const job = processOutboxEvent(f.input)
    await flush()
    expect(f.fail).not.toHaveBeenCalled()
    expect(f.complete).not.toHaveBeenCalled()
    mirror.resolve()
    await job
    expect(f.fail).toHaveBeenCalledTimes(1)
  })
  it('completed inbound skips admission and kernel entirely', async () => {
    const f = await fixture()
    f.context.message.runtimeStatus = 'completed'
    await processOutboxEvent(f.input)
    expect(f.readAdmission).not.toHaveBeenCalled()
    expect(executePublishedAgent).not.toHaveBeenCalled()
    expect(f.complete).not.toHaveBeenCalled()
  })
  it('a foreign callback parent cannot reach the mirror or completion', async () => {
    const f = await fixture()
    vi.mocked(executePublishedAgent).mockImplementationOnce(async (input) => {
      await input.onToolAudit!({
        type: 'tool_call',
        tenantId,
        traceId: 'trace_other',
        agentId: input.agentId,
        versionId: input.versionId!,
        correlationId,
        plugin: 'scheduling.controlled',
        toolName: 'find_available_slots',
        status: 'succeeded',
        payload: {}
      })
      return { status: 'completed', trace: f.traceFor() }
    })
    await expect(processOutboxEvent(f.input)).resolves.toMatchObject({
      status: 'failed'
    })
    expect(f.appendToolAudit).not.toHaveBeenCalled()
    expect(f.complete).not.toHaveBeenCalled()
    expect(f.execution().signal.aborted).toBe(true)
  })
  it('a 5000ms preparation watchdog aborts but does not detach a late context lookup', async () => {
    vi.useFakeTimers()
    const f = await fixture()
    const lookup = deferred<InboundRuntimeContext>()
    vi.mocked(f.conversations.findInboundRuntimeContext).mockImplementationOnce(
      () => lookup.promise
    )
    const job = processOutboxEvent(f.input)
    await flush()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(f.execution().signal.aborted).toBe(true)
    expect(f.fail).not.toHaveBeenCalled()
    lookup.resolve(f.context)
    await job
    expect(f.fail).toHaveBeenCalledTimes(1)
    expect(f.complete).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('shutdown joins acquisition/job and closes the pool only after the real job settles', async () => {
    const f = await fixture()
    const body = deferred()
    const admitted = deferred()
    vi.mocked(executePublishedAgent).mockImplementationOnce(async () => {
      admitted.resolve()
      await body.promise
      return { status: 'completed', trace: f.traceFor() }
    })
    const job = processOutboxEvent(f.input)
    await admitted.promise
    const pool = { end: vi.fn(async () => {}) }
    const closed = closePublishedWorkerResources(f.registry, pool, job)
    expect(f.execution().signal.aborted).toBe(true)
    await flush()
    expect(pool.end).not.toHaveBeenCalled()
    body.resolve()
    await closed
    expect(pool.end).toHaveBeenCalledTimes(1)
    expect(f.fail).toHaveBeenCalledTimes(1)
  })
})
