// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import {
  FencedRenewalStoppedError,
  InMemoryDatabase,
  OutboxRepository,
  type FencedClaimedEvent,
  type FencedClaimRenewal,
  type FencedOutboxAckInput,
  type FencedOutboxClaimAdapter,
  type FencedOutboxFailInput,
  type FencedRenewalControl,
  type OutboxEventRecord,
  type OutboxEffect
} from '@cvg/persistence'
import {
  ClaimExecutionRegistry,
  type ClaimedEventExecution,
  type InnerExecutionFence
} from '../claimed-execution-lifecycle.ts'
import {
  claimNextForExecution,
  completeClaimedOutboxEvent,
  NonRetryableOutboxError,
  processOutboxEvent
} from '../jobs/process-outbox-event.ts'
import { createControlledWorker } from '../controlled-worker.ts'
import { createContinuousWorker } from '../continuous-worker.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000217'
)
const workerId = 'synthetic-worker-job217'
const now = new Date('2026-10-15T12:00:00.000Z')
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
  for (let i = 0; i < 25; i += 1) await Promise.resolve()
}

function fixture(type = 'inbound.process') {
  const repository = new OutboxRepository(new InMemoryDatabase(), {
    now: () => now
  })
  repository.enqueue({
    tenantId,
    type,
    payload: { synthetic: true },
    idempotencyKey: 'pare217-fenced-job'
  })
  const event = repository.claimNext({ tenantId, workerId, leaseMs: 10_000 })!
  const claimed: FencedClaimedEvent = {
    event,
    claimRef: {
      tenantId,
      eventId: event.id,
      processWorkerId: workerId,
      expectedOuterAttempt: event.attempts!,
      expectedAttemptRowId: '9007199254740993'
    },
    dbClaimedAt: now.toISOString()
  }
  const renewal: FencedClaimRenewal = {
    claimRef: claimed.claimRef,
    dbNow: now.toISOString(),
    leaseUntil: new Date(now.getTime() + 10_000).toISOString()
  }
  const steps: string[] = []
  let context: ClaimedEventExecution | undefined
  const effect = vi.fn(async (_event: OutboxEventRecord) => {
    expect(_event.id).toBe(event.id)
    steps.push('effect')
    return { synthetic: true }
  })
  const renew = vi.fn(
    async (_ref: typeof claimed.claimRef, control: FencedRenewalControl) => {
      control.assertActive()
      steps.push('renew')
      return renewal
    }
  )
  const paired = vi.fn(
    async (
      _ref: typeof claimed.claimRef,
      _inner: InnerExecutionFence,
      control: FencedRenewalControl
    ) => {
      control.assertActive()
      steps.push('paired')
      return renewal
    }
  )
  const ackClaim = vi.fn(async (input: FencedOutboxAckInput) => {
    steps.push('prepare')
    await input.effect?.(event)
    steps.push('hook')
    await input.beforeFinalAck()
    steps.push('final')
    return { ...event, status: 'processed' as const }
  })
  const failClaim = vi.fn(
    async (input: FencedOutboxFailInput): Promise<OutboxEventRecord> => {
      steps.push('fail')
      return {
        ...event,
        status: input.terminal ? ('dead_letter' as const) : ('failed' as const)
      }
    }
  )
  let available = true
  const claimNextFenced = vi.fn<FencedOutboxClaimAdapter['claimNextFenced']>(
    async () => {
      if (!available) return null
      available = false
      return claimed
    }
  )
  const adapter: FencedOutboxClaimAdapter = {
    enqueue: repository.enqueue.bind(repository),
    claimNext: vi.fn(() => {
      throw new Error('legacy claim forbidden')
    }),
    ack: vi.fn(() => {
      throw new Error('legacy ack forbidden')
    }),
    fail: vi.fn(() => {
      throw new Error('legacy fail forbidden')
    }),
    requeueDeadLetter: repository.requeueDeadLetter.bind(repository),
    claimNextFenced,
    renewOutboxClaim: renew,
    ackClaim,
    failClaim
  }
  const buildEffect = vi.fn((handle: ClaimedEventExecution): OutboxEffect => {
    context = handle
    return effect
  })
  const registry = new ClaimExecutionRegistry({
    tenantId,
    workerId,
    adapter,
    renewPaired: paired,
    buildEffect
  })
  const input = { tenantId, workerId, adapter, claimExecutions: registry }
  return {
    input,
    registry,
    adapter,
    claimNextFenced,
    ackClaim,
    failClaim,
    claimed,
    event,
    renewal,
    effect,
    buildEffect,
    renew,
    paired,
    steps,
    context: () => context
  }
}
afterEach(() => {
  vi.useRealTimers()
})

describe('SPEC0217 fenced shared job and worker wiring (synthetic)', () => {
  it('keeps renewal active during ACK preparation, and joins outside the final transaction', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const preparation = deferred()
    let inTransaction = false
    f.ackClaim.mockImplementationOnce(async (input) => {
      inTransaction = true
      await preparation.promise
      inTransaction = false
      await input.effect?.(f.event)
      expect(inTransaction).toBe(false)
      await input.beforeFinalAck()
      expect(f.context()?.state).toBe('STOPPED')
      inTransaction = true
      inTransaction = false
      return { ...f.event, status: 'processed' }
    })
    const job = processOutboxEvent(f.input)
    await flush()
    expect(inTransaction).toBe(true)
    expect(f.effect).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2_000)
    expect(f.renew).toHaveBeenCalledTimes(2)
    preparation.resolve()
    await job
    expect(f.effect).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('paired initial renewal must succeed before the inner body is admitted', async () => {
    const f = fixture()
    const pair = deferred<FencedClaimRenewal>()
    const body = vi.fn()
    f.paired.mockImplementationOnce(() => pair.promise)
    f.buildEffect.mockImplementationOnce((context) => async () => {
      await context.attachInner({
        tenantId,
        executionId: 'exec_synthetic217',
        workerId,
        attempt: 1
      })
      body()
      return { synthetic: true }
    })
    const job = processOutboxEvent(f.input)
    await flush()
    expect(f.ackClaim).toHaveBeenCalledTimes(1)
    expect(f.paired).toHaveBeenCalledTimes(1)
    expect(body).not.toHaveBeenCalled()
    const error = new Error('paired CAS lost')
    pair.reject(error)
    await expect(job).resolves.toMatchObject({ status: 'failed' })
    expect(body).not.toHaveBeenCalled()
    expect(f.failClaim.mock.calls[0]?.[0].error).toBe(error)
  })

  it('the same slot cannot start a second job while its first ACK is live', async () => {
    const f = fixture()
    const body = deferred<{ synthetic: boolean }>()
    f.effect.mockImplementationOnce(() => body.promise)
    const claimed = (await claimNextForExecution(f.input))!
    const job = completeClaimedOutboxEvent({ ...f.input, ...claimed })
    await flush()
    await expect(
      completeClaimedOutboxEvent({ ...f.input, ...claimed })
    ).rejects.toThrow('already started')
    expect(f.ackClaim).toHaveBeenCalledTimes(1)
    body.resolve({ synthetic: true })
    await job
  })

  it('shutdown abort after an earlier healthy close still rejects the final ACK hook', async () => {
    const f = fixture()
    const closed = deferred()
    const completion = deferred()
    let context!: ClaimedEventExecution
    f.buildEffect.mockImplementationOnce((handle) => async () => {
      context = handle
      await context.stopAndJoin()
      closed.resolve()
      await completion.promise
      return { synthetic: true }
    })
    const job = processOutboxEvent(f.input)
    await closed.promise
    expect(context.signal.aborted).toBe(false)
    const drain = f.registry.stopAndDrain()
    completion.resolve()
    await expect(job).resolves.toMatchObject({ status: 'failed' })
    await drain
    expect(f.steps).not.toContain('final')
    expect(f.failClaim).toHaveBeenCalledTimes(1)
  })

  it('continuous shutdown reports a real settlement SQL failure after joining the handler', async () => {
    const f = fixture()
    const body = deferred<{ synthetic: boolean }>()
    const admitted = deferred()
    f.effect.mockImplementationOnce(() => {
      admitted.resolve()
      return body.promise
    })
    const sql = new Error('failClaim SQL failed')
    f.failClaim.mockRejectedValueOnce(sql)
    const worker = createContinuousWorker({
      ...f.input,
      handlers: { inboundProcess: vi.fn(), messageOutbound: vi.fn() },
      telemetry: { log: vi.fn(), metric: vi.fn() }
    })
    worker.start()
    await admitted.promise
    const stopped = worker.stop().catch((error: unknown) => error)
    body.resolve({ synthetic: true })
    expect(await stopped).toBe(sql)
    expect(f.failClaim).toHaveBeenCalledTimes(1)
  })
  it('renews before preparation and invokes the trusted effect only inside ACK', async () => {
    const f = fixture()
    const first = deferred<FencedClaimRenewal>()
    f.renew.mockImplementationOnce(() => first.promise)
    const untrusted = vi.fn()
    const job = processOutboxEvent({
      ...f.input,
      leaseMs: 1,
      effect: untrusted
    })
    await flush()
    expect(f.ackClaim).not.toHaveBeenCalled()
    expect(f.buildEffect).not.toHaveBeenCalled()
    expect(f.effect).not.toHaveBeenCalled()
    expect(f.claimNextFenced).toHaveBeenCalledWith({ tenantId, workerId })
    first.resolve(f.renewal)
    await expect(job).resolves.toMatchObject({ status: 'processed' })
    expect(f.steps).toEqual(['prepare', 'effect', 'hook', 'final'])
    expect(untrusted).not.toHaveBeenCalled()
    expect(f.context()?.state).toBe('STOPPED')
    expect(f.context()?.signal.aborted).toBe(false)
    expect(f.ackClaim.mock.calls[0]?.[0].claimRef.expectedAttemptRowId).toBe(
      '9007199254740993'
    )
    expect(f.failClaim).not.toHaveBeenCalled()
    const free = f.registry.reserveClaimSlot()!
    expect(free).not.toBeNull()
    f.registry.releaseClaimSlot(free)
  })

  it('reservation precedes claim await; shutdown tracks a late claim through its one fail and cleanup', async () => {
    const f = fixture()
    const acquisition = deferred<FencedClaimedEvent | null>()
    const fail = deferred<OutboxEventRecord>()
    f.claimNextFenced.mockImplementationOnce(() => {
      expect(f.registry.reserveClaimSlot()).toBeNull()
      return acquisition.promise
    })
    f.failClaim.mockImplementationOnce(() => fail.promise)
    const job = processOutboxEvent(f.input)
    let drained = false
    const drain = f.registry.stopAndDrain().then(() => {
      drained = true
    })
    await flush()
    expect(drained).toBe(false)
    acquisition.resolve(f.claimed)
    await flush()
    expect(f.renew).not.toHaveBeenCalled()
    expect(f.ackClaim).not.toHaveBeenCalled()
    expect(f.buildEffect).not.toHaveBeenCalled()
    expect(f.failClaim).toHaveBeenCalledTimes(1)
    expect(drained).toBe(false)
    fail.resolve({ ...f.event, status: 'failed' })
    await job
    await drain
    expect(drained).toBe(true)
    expect(f.adapter.fail).not.toHaveBeenCalled()
  })

  it.each(['empty', 'failure'] as const)(
    'releases an acquiring slot after %s without leaking shutdown',
    async (kind) => {
      const f = fixture()
      const acquisition = deferred<FencedClaimedEvent | null>()
      f.claimNextFenced.mockImplementationOnce(() => acquisition.promise)
      const job = processOutboxEvent(f.input).catch((error: unknown) => error)
      const drain = f.registry.stopAndDrain()
      if (kind === 'empty') acquisition.resolve(null)
      else acquisition.reject(new Error('checkout failed'))
      const result = await job
      expect(kind === 'empty' ? result === null : result instanceof Error).toBe(
        true
      )
      await drain
      expect(f.failClaim).not.toHaveBeenCalled()
    }
  )

  it('keeps a single controlled claim slot across concurrent processNext and drain calls', async () => {
    const f = fixture()
    const body = deferred<{ synthetic: boolean }>()
    f.effect.mockImplementationOnce(() => body.promise)
    const worker = createControlledWorker({
      ...f.input,
      handlers: { inboundProcess: vi.fn(), messageOutbound: vi.fn() }
    })
    const active = worker.processNext()
    await flush()
    await expect(worker.processNext()).resolves.toBeNull()
    await expect(worker.drain(2)).resolves.toEqual({
      processed: 0,
      results: []
    })
    expect(f.claimNextFenced).toHaveBeenCalledTimes(1)
    body.resolve({ synthetic: true })
    await expect(active).resolves.toMatchObject({ status: 'processed' })
    f.registry.stopClaims()
    await expect(worker.processNext()).resolves.toBeNull()
    expect(f.claimNextFenced).toHaveBeenCalledTimes(1)
  })

  it('joins handler, renewal and cleanup before one fail; keeps slot until fail settles', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const body = deferred<{ synthetic: boolean }>()
    const cleanup = deferred()
    const failed = deferred<OutboxEventRecord>()
    f.effect.mockImplementationOnce(() => body.promise)
    const job = processOutboxEvent(f.input)
    await flush()
    f.renew.mockImplementationOnce(async (_ref, control) => {
      await cleanup.promise
      const error = new FencedRenewalStoppedError(control.signal)
      error.cleanupConfirmed = true
      throw error
    })
    await vi.advanceTimersByTimeAsync(2_000)
    f.failClaim.mockImplementationOnce(() => failed.promise)
    body.reject(new NonRetryableOutboxError('synthetic permanent failure'))
    await flush()
    expect(f.context()?.signal.aborted).toBe(true)
    expect(f.failClaim).not.toHaveBeenCalled()
    expect(f.registry.reserveClaimSlot()).toBeNull()
    cleanup.resolve()
    await flush()
    expect(f.failClaim).toHaveBeenCalledTimes(1)
    expect(f.failClaim.mock.calls[0]?.[0].terminal).toBe(true)
    expect(f.registry.reserveClaimSlot()).toBeNull()
    failed.resolve({ ...f.event, status: 'dead_letter' })
    await expect(job).resolves.toMatchObject({ status: 'dead_letter' })
    expect(f.context()?.state).toBe('STOPPED')
    const free = f.registry.reserveClaimSlot()!
    f.registry.releaseClaimSlot(free)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('a first renewal SQL failure prevents preparation/effect and runs only fenced fail', async () => {
    const f = fixture()
    const sql = new Error('renew SQL failed')
    f.renew.mockRejectedValueOnce(sql)
    await expect(processOutboxEvent(f.input)).resolves.toMatchObject({
      status: 'failed'
    })
    expect(f.failClaim).toHaveBeenCalledTimes(1)
    expect(f.failClaim.mock.calls[0]?.[0].error).toBe(sql)
    expect(f.ackClaim).not.toHaveBeenCalled()
    expect(f.effect).not.toHaveBeenCalled()
  })

  it.each(['marker', 'S3'] as const)(
    '%s skips effects but still joins the same hook before final ACK',
    async (mode) => {
      const f = fixture()
      f.ackClaim.mockImplementationOnce(async (input) => {
        if (mode === 'S3') f.context()!.requestStop('finalizing')
        expect(f.context()?.signal.aborted).toBe(false)
        await input.beforeFinalAck()
        expect(f.context()?.state).toBe('STOPPED')
        return { ...f.event, status: 'processed' }
      })
      await expect(processOutboxEvent(f.input)).resolves.toMatchObject({
        status: 'processed'
      })
      expect(f.effect).not.toHaveBeenCalled()
      expect(f.paired).not.toHaveBeenCalled()
      expect(f.failClaim).not.toHaveBeenCalled()
    }
  )

  it('refuses a missing/foreign slot and validates the process before claiming', async () => {
    const f = fixture()
    await expect(
      completeClaimedOutboxEvent({ ...f.input, event: f.event })
    ).rejects.toThrow('slot')
    await expect(
      processOutboxEvent({ ...f.input, workerId: 'other-worker' })
    ).rejects.toThrow('worker')
    expect(f.claimNextFenced).not.toHaveBeenCalled()
    const claimed = await claimNextForExecution(f.input)
    await expect(
      completeClaimedOutboxEvent({
        ...f.input,
        ...claimed!,
        slot: { token: Symbol() }
      })
    ).rejects.toThrow('Foreign')
    await completeClaimedOutboxEvent({ ...f.input, ...claimed! })
  })

  it.each(['unknown', 'takeover'] as const)(
    'preserves terminal %s policy without executing a body',
    async (mode) => {
      const f = fixture(mode === 'unknown' ? 'synthetic.unknown' : undefined)
      await expect(
        processOutboxEvent({ ...f.input, takeoverActive: mode === 'takeover' })
      ).resolves.toMatchObject({
        status: mode === 'takeover' ? 'handoff' : 'dead_letter'
      })
      expect(f.ackClaim).not.toHaveBeenCalled()
      expect(f.buildEffect).not.toHaveBeenCalled()
      expect(f.failClaim.mock.calls[0]?.[0].terminal).toBe(true)
      expect(f.context()).toBeUndefined()
    }
  )

  it('continuous shutdown is reentrant and waits the actual handler instead of legacy fail/release', async () => {
    const f = fixture()
    const body = deferred<{ synthetic: boolean }>()
    const admitted = deferred()
    f.effect.mockImplementationOnce(() => {
      admitted.resolve()
      return body.promise
    })
    const heartbeatClaim = vi.fn()
    Object.assign(f.adapter, { heartbeatClaim })
    const worker = createContinuousWorker({
      ...f.input,
      handlers: { inboundProcess: vi.fn(), messageOutbound: vi.fn() },
      pollIntervalMs: 1,
      drainMs: 0,
      telemetry: { log: vi.fn(), metric: vi.fn() }
    })
    worker.start()
    await admitted.promise
    let fromCallback: ReturnType<typeof worker.stop> | undefined
    f.context()!.signal.addEventListener('abort', () => {
      fromCallback = worker.stop()
    })
    const stop = worker.stop({ drainMs: 0 })
    expect(fromCallback).toBe(stop)
    let stopped = false
    void stop.then(() => {
      stopped = true
    })
    await flush()
    expect(stopped).toBe(false)
    expect(f.failClaim).not.toHaveBeenCalled()
    expect(f.adapter.fail).not.toHaveBeenCalled()
    expect(heartbeatClaim).not.toHaveBeenCalled()
    body.resolve({ synthetic: true })
    await expect(stop).resolves.toMatchObject({
      drained: true,
      released: 0,
      releaseFailed: 0
    })
    expect(f.failClaim).toHaveBeenCalledTimes(1)
    expect(f.adapter.fail).not.toHaveBeenCalled()
  })

  it('continuous pump tracks late acquisition and does not use its old shutdown release loop', async () => {
    const f = fixture()
    const acquisition = deferred<FencedClaimedEvent | null>()
    const acquiring = deferred()
    f.claimNextFenced.mockImplementationOnce(() => {
      acquiring.resolve()
      return acquisition.promise
    })
    const worker = createContinuousWorker({
      ...f.input,
      handlers: { inboundProcess: vi.fn(), messageOutbound: vi.fn() },
      drainMs: 0,
      telemetry: { log: vi.fn(), metric: vi.fn() }
    })
    worker.start()
    await acquiring.promise
    const stop = worker.stop()
    let stopped = false
    void stop.then(() => {
      stopped = true
    })
    await flush()
    expect(stopped).toBe(false)
    acquisition.resolve(f.claimed)
    await expect(stop).resolves.toMatchObject({ drained: true })
    expect(f.renew).not.toHaveBeenCalled()
    expect(f.failClaim).toHaveBeenCalledTimes(1)
    expect(f.adapter.fail).not.toHaveBeenCalled()
    expect(f.buildEffect).not.toHaveBeenCalled()
  })
})
