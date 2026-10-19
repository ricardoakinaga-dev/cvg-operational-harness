import {
  FencedRenewalStoppedError,
  type DurableOutboxAdapter,
  type FencedClaimedEvent,
  type FencedClaimRenewal,
  type FencedOuterClaimRef,
  type FencedOutboxClaimAdapter,
  type FencedRenewalControl,
  type OutboxEffect,
  type OutboxEventRecord
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'

export interface InnerExecutionFence {
  tenantId: string
  executionId: string
  workerId: string
  attempt: number
}

export interface ClaimExecutionRegistryOptions {
  tenantId: TenantId
  workerId: string
  adapter: FencedOutboxClaimAdapter
  renewPaired: (
    outer: FencedOuterClaimRef,
    inner: InnerExecutionFence,
    control: FencedRenewalControl
  ) => Promise<FencedClaimRenewal>
  buildEffect: (context: ClaimedEventExecution) => OutboxEffect
}

export type ClaimedExecutionState =
  | 'STARTING'
  | 'OUTER_ACTIVE'
  | 'PAIRED_ACTIVE'
  | 'STOPPING'
  | 'STOPPED'

/** Opaque reservation; the registry keeps all mutable ownership privately. */
export interface ClaimExecutionSlot {
  readonly token: symbol
}

interface Reservation {
  slot: ClaimExecutionSlot
  done: Promise<void>
  resolve: () => void
  execution?: ClaimedEventExecution
  jobStarted?: boolean
  jobFailure?: unknown
}

const TICK_MS = 2_000
const RENEWAL_BUDGET_MS = 1_500

/** One process, one reservation, including the time spent acquiring its row. */
export class ClaimExecutionRegistry {
  private reservation: Reservation | undefined
  private accepting = true
  private draining = false
  private drainPromise: Promise<void> | undefined
  private readonly shutdownError = new Error('Claim execution shutdown')

  constructor(private readonly options: ClaimExecutionRegistryOptions) {
    this.options = Object.freeze({ ...options })
    if (!options.tenantId || !options.workerId.trim()) {
      throw new Error('Claim execution tenant and worker are required')
    }
    for (const method of [
      'claimNextFenced',
      'renewOutboxClaim',
      'ackClaim',
      'failClaim'
    ] as const) {
      if (typeof options.adapter[method] !== 'function') {
        throw new Error(`Missing fenced outbox method: ${method}`)
      }
    }
    if (
      typeof options.renewPaired !== 'function' ||
      typeof options.buildEffect !== 'function'
    ) {
      throw new Error(
        'Claim execution renewal and effect builders are required'
      )
    }
  }

  get acceptingClaims(): boolean {
    return this.accepting
  }

  reserveClaimSlot(): ClaimExecutionSlot | null {
    if (!this.accepting || this.reservation) return null
    let resolve!: () => void
    const done = new Promise<void>((finish) => {
      resolve = finish
    })
    const slot = Object.freeze({ token: Symbol('claim-execution') })
    this.reservation = { slot, done, resolve }
    return slot
  }

  bindClaim(
    slot: ClaimExecutionSlot,
    claimed: FencedClaimedEvent
  ): ClaimedEventExecution {
    const reservation = this.requireSlot(slot)
    if (reservation.execution) throw new Error('Claim slot is already bound')
    validateClaim(claimed, this.options.tenantId, this.options.workerId)
    const execution = new ClaimedEventExecution(claimed, this.options)
    reservation.execution = execution
    if (this.draining) execution.requestStop(this.shutdownError)
    return execution
  }

  executionFor(
    slot: ClaimExecutionSlot,
    event: OutboxEventRecord,
    tenantId: TenantId,
    workerId: string,
    adapter: DurableOutboxAdapter
  ): ClaimedEventExecution {
    const execution = this.requireSlot(slot).execution
    if (
      !execution ||
      execution.event !== event ||
      tenantId !== this.options.tenantId ||
      workerId !== this.options.workerId ||
      adapter !== this.options.adapter
    ) {
      throw new Error('Claim slot does not belong to this job')
    }
    return execution
  }

  beginJob(
    slot: ClaimExecutionSlot,
    event: OutboxEventRecord,
    tenantId: TenantId,
    workerId: string,
    adapter: DurableOutboxAdapter
  ): ClaimedEventExecution {
    const execution = this.executionFor(
      slot,
      event,
      tenantId,
      workerId,
      adapter
    )
    const reservation = this.requireSlot(slot)
    if (reservation.jobStarted)
      throw new Error('Claim slot job already started')
    reservation.jobStarted = true
    return execution
  }

  /** Validates registry identity before sending the claim to PostgreSQL. */
  claimAdapter(
    tenantId: TenantId,
    workerId: string,
    adapter: DurableOutboxAdapter
  ): FencedOutboxClaimAdapter {
    if (
      tenantId !== this.options.tenantId ||
      workerId !== this.options.workerId ||
      adapter !== this.options.adapter
    ) {
      throw new Error('Claim registry does not belong to this worker')
    }
    return this.options.adapter
  }

  buildEffect(context: ClaimedEventExecution): OutboxEffect {
    if (this.reservation?.execution !== context)
      throw new Error('Foreign claim execution')
    context.assertActive()
    const effect = this.options.buildEffect(context)
    if (typeof effect !== 'function')
      throw new Error('Claim effect must be a function')
    return (event) => {
      context.assertActive()
      if (
        event.id !== context.event.id ||
        event.tenantId !== context.event.tenantId
      ) {
        throw new Error('Claim effect event identity mismatch')
      }
      return effect(event)
    }
  }

  releaseClaimSlot(slot: ClaimExecutionSlot, jobFailure?: unknown): void {
    const reservation = this.requireSlot(slot)
    if (reservation.execution && reservation.execution.state !== 'STOPPED') {
      throw new Error('Cannot release a live claim execution')
    }
    this.reservation = undefined
    reservation.jobFailure = jobFailure
    reservation.resolve()
  }

  stopClaims(): void {
    this.accepting = false
  }

  stopAndDrain(): Promise<void> {
    if (this.drainPromise) return this.drainPromise
    this.stopClaims()
    this.draining = true
    const reservation = this.reservation
    // Publish before abort callbacks run; callbacks may re-enter shutdown.
    this.drainPromise = Promise.resolve().then(async () => {
      if (!reservation) return
      await reservation.done
      if (!reservation.execution) return
      try {
        await reservation.execution.stopAndJoin()
      } catch (error) {
        if (error !== this.shutdownError) throw error
      }
      if (reservation.jobFailure !== undefined) throw reservation.jobFailure
    })
    reservation?.execution?.requestStop(this.shutdownError)
    return this.drainPromise
  }

  private requireSlot(slot: ClaimExecutionSlot): Reservation {
    if (!this.reservation || this.reservation.slot !== slot) {
      throw new Error('Foreign or released claim slot')
    }
    return this.reservation
  }
}

/** Owns the actual SQL/cleanup promise, rather than a timeout proxy for it. */
export class ClaimedEventExecution {
  readonly claimRef: Readonly<FencedOuterClaimRef>
  readonly event: OutboxEventRecord
  readonly signal: AbortSignal
  private readonly attemptController = new AbortController()
  private readonly renewalController = new AbortController()
  private currentState: ClaimedExecutionState = 'STARTING'
  private generation = 0
  private firstFailure: Error | undefined
  private cadence: ReturnType<typeof setTimeout> | undefined
  private inFlight: Promise<void> | undefined
  private initial: Promise<void> | undefined
  private join: Promise<void> | undefined
  private inner: Readonly<InnerExecutionFence> | undefined
  private attaching = false
  private attached = false

  constructor(
    claimed: FencedClaimedEvent,
    private readonly options: ClaimExecutionRegistryOptions
  ) {
    validateClaim(claimed, options.tenantId, options.workerId)
    this.claimRef = Object.freeze({ ...claimed.claimRef })
    this.event = Object.freeze(claimed.event)
    this.signal = this.attemptController.signal
  }

  get state(): ClaimedExecutionState {
    return this.currentState
  }

  assertActive(): void {
    if (this.firstFailure) throw this.firstFailure
    if (this.signal.aborted) throw this.signal.reason
    if (this.currentState === 'STOPPING' || this.currentState === 'STOPPED') {
      throw new Error('Claim execution admission is closed')
    }
  }

  startOuter(): Promise<void> {
    this.assertActive()
    if (this.initial) return this.initial
    this.initial = this.renew().then(() => {
      this.assertActive()
      this.currentState = 'OUTER_ACTIVE'
    })
    return this.initial
  }

  async attachInner(fence: InnerExecutionFence): Promise<void> {
    this.assertActive()
    if (!this.initial)
      throw new Error('Outer claim must start before attaching inner')
    if (this.attached)
      throw new Error('Inner execution may only be attached once')
    if (
      fence.tenantId !== this.claimRef.tenantId ||
      !fence.executionId ||
      fence.workerId !== this.claimRef.processWorkerId ||
      !Number.isSafeInteger(fence.attempt) ||
      fence.attempt <= 0
    ) {
      throw new Error('Invalid inner execution fence')
    }
    this.attached = true
    this.attaching = true
    this.clearCadence()
    try {
      await this.initial
      if (this.inFlight) await this.inFlight
      this.assertActive()
      this.inner = Object.freeze({ ...fence })
      await this.renew()
      this.assertActive()
      this.currentState = 'PAIRED_ACTIVE'
    } finally {
      this.attaching = false
      this.schedule()
    }
  }

  requestStop(reason: unknown): void {
    const stopping =
      this.currentState !== 'STOPPING' && this.currentState !== 'STOPPED'
    if (stopping) {
      this.currentState = 'STOPPING'
      this.generation += 1
      this.clearCadence()
    }
    if (reason !== 'finalizing' && !this.signal.aborted) {
      this.attemptController.abort(reason)
    }
    // Renewal abort callbacks must never observe a still-admitted attempt.
    if (stopping) this.renewalController.abort(reason)
  }

  stopAndJoin(): Promise<void> {
    if (this.join) return this.join
    this.join = Promise.resolve().then(async () => {
      try {
        if (this.inFlight) await this.inFlight
      } finally {
        this.currentState = 'STOPPED'
      }
      if (this.firstFailure) throw this.firstFailure
      if (this.signal.aborted) throw this.signal.reason
    })
    this.requestStop('finalizing')
    return this.join
  }

  private renew(): Promise<void> {
    this.assertActive()
    if (this.inFlight) throw new Error('Renewal already in flight')
    const generation = this.generation
    const signal = this.renewalController.signal
    const control: FencedRenewalControl = {
      signal,
      assertActive: () => {
        if (signal.aborted || generation !== this.generation) {
          throw new FencedRenewalStoppedError(signal)
        }
      }
    }
    // Assign ownership before calling user-supplied ports: a port can trigger shutdown.
    const pending = Promise.resolve().then(async () => {
      let watchdog: ReturnType<typeof setTimeout> | undefined
      let runnerStarted = false
      let runnerCompleted = false
      try {
        control.assertActive()
        watchdog = setTimeout(() => {
          this.fail(new Error('Claim renewal exceeded 1500ms budget'))
        }, RENEWAL_BUDGET_MS)
        watchdog.unref?.()
        runnerStarted = true
        const renewed = this.inner
          ? await this.options.renewPaired(this.claimRef, this.inner, control)
          : await this.options.adapter.renewOutboxClaim(this.claimRef, control)
        runnerCompleted = true
        validateRenewal(renewed, this.claimRef)
        // Port success includes COMMIT/cleanup; invalidation still closes admission.
        control.assertActive()
      } catch (error) {
        // The trusted runner emits this exact signal witness only after confirmed
        // rollback/cleanup. A SQL/cleanup/ambiguous-COMMIT error is never a stop.
        if (
          !(
            error instanceof FencedRenewalStoppedError &&
            error.signal === signal &&
            signal.aborted &&
            (error.cleanupConfirmed === true ||
              !runnerStarted ||
              runnerCompleted)
          )
        ) {
          this.fail(error)
          throw this.firstFailure
        }
      } finally {
        if (watchdog) clearTimeout(watchdog)
        this.inFlight = undefined
        this.schedule()
      }
    })
    this.inFlight = pending
    // Timer callers have no awaiter, but the original promise stays joinable.
    void pending.catch(() => {})
    return pending
  }

  private fail(error: unknown): void {
    this.firstFailure ??=
      error instanceof Error
        ? error
        : new Error('Claim renewal failed', { cause: error })
    this.requestStop(this.firstFailure)
  }

  private clearCadence(): void {
    if (this.cadence) clearTimeout(this.cadence)
    this.cadence = undefined
  }

  private schedule(): void {
    if (
      this.cadence ||
      this.inFlight ||
      this.attaching ||
      this.renewalController.signal.aborted ||
      this.firstFailure
    )
      return
    this.cadence = setTimeout(() => {
      this.cadence = undefined
      void this.renew().catch(() => {})
    }, TICK_MS)
    this.cadence.unref?.()
  }
}

function sameRef(a: FencedOuterClaimRef, b: FencedOuterClaimRef): boolean {
  return (
    a.tenantId === b.tenantId &&
    a.eventId === b.eventId &&
    a.processWorkerId === b.processWorkerId &&
    a.expectedOuterAttempt === b.expectedOuterAttempt &&
    a.expectedAttemptRowId === b.expectedAttemptRowId
  )
}

function validateClaim(
  claimed: FencedClaimedEvent,
  tenantId: TenantId,
  workerId: string
): void {
  const { event, claimRef: ref, dbClaimedAt } = claimed
  if (
    !event ||
    !ref ||
    ref.tenantId !== tenantId ||
    ref.processWorkerId !== workerId ||
    event.tenantId !== tenantId ||
    event.id !== ref.eventId ||
    !event.id ||
    event.status !== 'processing' ||
    event.leaseOwner !== workerId ||
    !Number.isSafeInteger(ref.expectedOuterAttempt) ||
    ref.expectedOuterAttempt <= 0 ||
    event.attempts !== ref.expectedOuterAttempt ||
    typeof ref.expectedAttemptRowId !== 'string' ||
    !/^[1-9][0-9]*$/.test(ref.expectedAttemptRowId) ||
    !Number.isFinite(Date.parse(dbClaimedAt)) ||
    !(event.leaseUntil instanceof Date) ||
    !Number.isFinite(event.leaseUntil.getTime()) ||
    event.leaseUntil.getTime() <= Date.parse(dbClaimedAt)
  ) {
    throw new Error('Invalid fenced outbox claim identity')
  }
}

function validateRenewal(
  renewed: FencedClaimRenewal,
  ref: FencedOuterClaimRef
): void {
  if (
    !renewed ||
    !renewed.claimRef ||
    !sameRef(renewed.claimRef, ref) ||
    !Number.isFinite(Date.parse(renewed.dbNow)) ||
    !Number.isFinite(Date.parse(renewed.leaseUntil)) ||
    Date.parse(renewed.leaseUntil) <= Date.parse(renewed.dbNow)
  ) {
    throw new Error('Invalid fenced renewal acknowledgement')
  }
}
