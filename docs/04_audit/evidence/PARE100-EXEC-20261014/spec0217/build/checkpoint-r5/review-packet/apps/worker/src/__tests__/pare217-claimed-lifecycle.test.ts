// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import {
  FencedRenewalStoppedError,
  InMemoryDatabase,
  OutboxRepository,
  type FencedClaimedEvent,
  type FencedClaimRenewal,
  type FencedOutboxClaimAdapter,
  type FencedRenewalControl
} from '@cvg/persistence'
import {
  ClaimExecutionRegistry,
  type InnerExecutionFence
} from '../claimed-execution-lifecycle.ts'

const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000217'
)
const workerId = 'synthetic-worker-217'
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

function fixture() {
  const repository = new OutboxRepository(new InMemoryDatabase(), {
    now: () => now
  })
  repository.enqueue({
    tenantId,
    type: 'inbound.process',
    payload: { synthetic: true },
    idempotencyKey: 'pare217-lifecycle'
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
  const renew = vi.fn(
    async (_ref: typeof claimed.claimRef, control: FencedRenewalControl) => {
      control.assertActive()
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
      return renewal
    }
  )
  const adapter: FencedOutboxClaimAdapter = {
    enqueue: repository.enqueue.bind(repository),
    claimNext: repository.claimNext.bind(repository),
    ack: repository.ack.bind(repository),
    fail: repository.fail.bind(repository),
    requeueDeadLetter: repository.requeueDeadLetter.bind(repository),
    claimNextFenced: vi.fn(async () => claimed),
    renewOutboxClaim: renew,
    ackClaim: vi.fn(async () => event),
    failClaim: vi.fn(async () => event)
  }
  const registry = new ClaimExecutionRegistry({
    tenantId,
    workerId,
    adapter,
    renewPaired: paired,
    buildEffect: () => () => ({ synthetic: true })
  })
  const slot = registry.reserveClaimSlot()!
  const execution = registry.bindClaim(slot, claimed)
  return { registry, slot, execution, renew, paired, renewal, claimed, adapter }
}

const inner: InnerExecutionFence = {
  tenantId,
  executionId: 'exec_synthetic217',
  workerId,
  attempt: 1
}

afterEach(() => {
  vi.useRealTimers()
})

describe('SPEC0217 claimed lifecycle (synthetic unit; not K02)', () => {
  it('error stop closes the attempt before running renewal-abort callbacks', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.execution.startOuter()
    const cleanup = deferred()
    const checked = vi.fn()
    f.renew.mockImplementationOnce(async (_ref, control) => {
      control.signal.addEventListener(
        'abort',
        () => {
          expect(f.execution.signal.aborted).toBe(true)
          expect(() => f.execution.assertActive()).toThrow()
          checked()
        },
        { once: true }
      )
      await cleanup.promise
      const stopped = new FencedRenewalStoppedError(control.signal)
      stopped.cleanupConfirmed = true
      throw stopped
    })
    await vi.advanceTimersByTimeAsync(2_000)
    const reason = new Error('synthetic stop')
    f.execution.requestStop(reason)
    expect(checked).toHaveBeenCalledTimes(1)
    const join = f.execution.stopAndJoin().catch((error: unknown) => error)
    cleanup.resolve()
    expect(await join).toBe(reason)
    f.registry.releaseClaimSlot(f.slot)
  })
  it('publishes join ownership before a renewal abort callback can re-enter it', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.execution.startOuter()
    const cleanup = deferred()
    let callbackJoin: Promise<void> | undefined
    f.renew.mockImplementationOnce(async (_ref, control) => {
      control.signal.addEventListener(
        'abort',
        () => {
          callbackJoin = f.execution.stopAndJoin()
        },
        { once: true }
      )
      await cleanup.promise
      const stopped = new FencedRenewalStoppedError(control.signal)
      stopped.cleanupConfirmed = true
      throw stopped
    })
    await vi.advanceTimersByTimeAsync(2_000)
    const join = f.execution.stopAndJoin()
    expect(callbackJoin).toBe(join)
    cleanup.resolve()
    await join
    expect(f.execution.signal.aborted).toBe(false)
    f.registry.releaseClaimSlot(f.slot)
  })

  it('a late invalid acknowledgement remains a failure even after stop was requested', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.execution.startOuter()
    const tick = deferred<FencedClaimRenewal>()
    f.renew.mockImplementationOnce(() => tick.promise)
    await vi.advanceTimersByTimeAsync(2_000)
    const joined = f.execution.stopAndJoin().catch((error: unknown) => error)
    tick.resolve({
      ...f.renewal,
      claimRef: { ...f.claimed.claimRef, expectedAttemptRowId: '2' }
    })
    expect(await joined).toMatchObject({
      message: 'Invalid fenced renewal acknowledgement'
    })
    expect(f.execution.signal.aborted).toBe(true)
    f.registry.releaseClaimSlot(f.slot)
  })
  it('reserves one slot, validates the actual fence and preserves bigint identity', async () => {
    const f = fixture()
    expect(f.registry.reserveClaimSlot()).toBeNull()
    expect(f.execution.claimRef.expectedAttemptRowId).toBe('9007199254740993')
    expect(Object.isFrozen(f.execution.claimRef)).toBe(true)
    expect(() => f.registry.releaseClaimSlot(f.slot)).toThrow('live')
    expect(() =>
      f.registry.executionFor(
        { token: Symbol() },
        f.claimed.event,
        tenantId,
        workerId,
        f.adapter
      )
    ).toThrow('Foreign')
    await f.execution.stopAndJoin()
    f.registry.releaseClaimSlot(f.slot)
    const slot = f.registry.reserveClaimSlot()!
    expect(() =>
      f.registry.bindClaim(slot, {
        ...f.claimed,
        claimRef: { ...f.claimed.claimRef, expectedAttemptRowId: '01' }
      })
    ).toThrow('identity')
    f.registry.releaseClaimSlot(slot)
    const stopped = f.registry.stopAndDrain()
    expect(f.registry.acceptingClaims).toBe(false)
    expect(f.registry.reserveClaimSlot()).toBeNull()
    await stopped
  })

  it('awaits initial outer and paired renewal before admitting dispatch, with only one cadence', async () => {
    vi.useFakeTimers()
    const f = fixture()
    const initial = deferred<FencedClaimRenewal>()
    f.renew.mockImplementationOnce(() => initial.promise)
    let started = false
    const start = f.execution.startOuter().then(() => {
      started = true
    })
    await Promise.resolve()
    expect(started).toBe(false)
    expect(f.execution.state).toBe('STARTING')
    initial.resolve(f.renewal)
    await start
    expect(f.execution.state).toBe('OUTER_ACTIVE')
    const firstPaired = deferred<FencedClaimRenewal>()
    f.paired.mockImplementationOnce(() => firstPaired.promise)
    let attached = false
    const attaching = f.execution.attachInner(inner).then(() => {
      attached = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(attached).toBe(false)
    expect(f.paired).toHaveBeenCalledTimes(1)
    firstPaired.resolve(f.renewal)
    await attaching
    expect(f.execution.state).toBe('PAIRED_ACTIVE')
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(2_000)
    expect(f.renew).toHaveBeenCalledTimes(1)
    expect(f.paired).toHaveBeenCalledTimes(2)
    await expect(f.execution.attachInner(inner)).rejects.toThrow('once')
    await f.execution.stopAndJoin()
    expect(f.execution.signal.aborted).toBe(false)
    expect(f.execution.state).toBe('STOPPED')
    await vi.advanceTimersByTimeAsync(10_000)
    expect(f.paired).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
    f.registry.releaseClaimSlot(f.slot)
  })

  it('attach joins an actual outer tick before switching to the paired target', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.execution.startOuter()
    const tick = deferred<FencedClaimRenewal>()
    f.renew.mockImplementationOnce(() => tick.promise)
    await vi.advanceTimersByTimeAsync(2_000)
    const attaching = f.execution.attachInner(inner)
    await Promise.resolve()
    expect(f.paired).not.toHaveBeenCalled()
    tick.resolve(f.renewal)
    await attaching
    expect(f.paired).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)
    await f.execution.stopAndJoin()
    f.registry.releaseClaimSlot(f.slot)
  })

  it('watchdog aborts monotonically while stop joins late checkout/rollback/cleanup', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.execution.startOuter()
    const checkout = deferred()
    const cleanup = deferred()
    const began = vi.fn()
    f.renew.mockImplementationOnce(async (_ref, control) => {
      await checkout.promise
      try {
        control.assertActive()
        began()
        return f.renewal
      } catch (error) {
        await cleanup.promise
        if (error instanceof FencedRenewalStoppedError)
          error.cleanupConfirmed = true
        throw error
      }
    })
    await vi.advanceTimersByTimeAsync(2_000)
    await vi.advanceTimersByTimeAsync(1_500)
    expect(f.execution.signal.aborted).toBe(true)
    const firstReason = f.execution.signal.reason
    expect(firstReason.message).toContain('1500ms')
    let joined = false
    const join = f.execution.stopAndJoin().catch((error: unknown) => {
      joined = true
      return error
    })
    expect(f.execution.stopAndJoin()).toBe(f.execution.stopAndJoin())
    await vi.advanceTimersByTimeAsync(20_000)
    expect(joined).toBe(false)
    expect(f.renew).toHaveBeenCalledTimes(2)
    checkout.resolve()
    await Promise.resolve()
    expect(began).not.toHaveBeenCalled()
    expect(joined).toBe(false)
    cleanup.resolve()
    expect(await join).toBe(firstReason)
    expect(f.execution.signal.reason).toBe(firstReason)
    expect(f.execution.state).toBe('STOPPED')
    f.registry.releaseClaimSlot(f.slot)
  })

  it.each(['sql', 'unconfirmed', 'foreign-signal'] as const)(
    'does not swallow %s failure when finalization races renewal',
    async (kind) => {
      vi.useFakeTimers()
      const f = fixture()
      await f.execution.startOuter()
      const tick = deferred<FencedClaimRenewal>()
      let renewalSignal!: AbortSignal
      f.renew.mockImplementationOnce((_ref, control) => {
        renewalSignal = control.signal
        return tick.promise
      })
      await vi.advanceTimersByTimeAsync(2_000)
      const join = f.execution.stopAndJoin()
      const error =
        kind === 'sql'
          ? new Error('SQL cleanup failed')
          : new FencedRenewalStoppedError(
              kind === 'foreign-signal'
                ? new AbortController().signal
                : renewalSignal
            )
      if (
        error instanceof FencedRenewalStoppedError &&
        kind === 'foreign-signal'
      )
        error.cleanupConfirmed = true
      const observed = join.catch((value: unknown) => value)
      tick.reject(error)
      expect(await observed).toBe(error)
      expect(f.execution.signal.aborted).toBe(true)
      expect(f.execution.signal.reason).toBe(error)
      f.registry.releaseClaimSlot(f.slot)
    }
  )

  it('accepts only a confirmed exact-signal stop and joins cleanup before healthy finalization', async () => {
    vi.useFakeTimers()
    const f = fixture()
    await f.execution.startOuter()
    const cleanup = deferred()
    f.renew.mockImplementationOnce(async (_ref, control) => {
      await cleanup.promise
      const stopped = new FencedRenewalStoppedError(control.signal)
      stopped.cleanupConfirmed = true
      throw stopped
    })
    await vi.advanceTimersByTimeAsync(2_000)
    let settled = false
    const join = f.execution.stopAndJoin().then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(f.execution.signal.aborted).toBe(false)
    cleanup.resolve()
    await join
    expect(f.execution.state).toBe('STOPPED')
    expect(f.execution.signal.aborted).toBe(false)
    await expect(f.execution.attachInner(inner)).rejects.toThrow('closed')
    f.registry.releaseClaimSlot(f.slot)
  })

  it('shutdown callbacks can re-enter drain/join without losing the owned promise', async () => {
    const f = fixture()
    await f.execution.startOuter()
    let callbackDrain: Promise<void> | undefined
    f.execution.signal.addEventListener('abort', () => {
      callbackDrain = f.registry.stopAndDrain()
    })
    const drain = f.registry.stopAndDrain()
    expect(callbackDrain).toBe(drain)
    expect(f.execution.signal.aborted).toBe(true)
    await expect(f.execution.stopAndJoin()).rejects.toThrow('shutdown')
    let settled = false
    void drain.then(() => {
      settled = true
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    f.registry.releaseClaimSlot(f.slot)
    await drain
    expect(settled).toBe(true)
  })

  it('malformed or stale renewal acknowledgement is a terminal attempt failure', async () => {
    const f = fixture()
    f.renew.mockResolvedValueOnce({
      ...f.renewal,
      claimRef: { ...f.claimed.claimRef, expectedOuterAttempt: 2 }
    })
    await expect(f.execution.startOuter()).rejects.toThrow('acknowledgement')
    expect(f.execution.signal.aborted).toBe(true)
    await expect(f.execution.stopAndJoin()).rejects.toThrow('acknowledgement')
    f.registry.releaseClaimSlot(f.slot)
  })
})
