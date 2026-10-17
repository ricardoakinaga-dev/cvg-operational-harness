import {
  type DurableOutboxAdapter,
  OUTBOX_TAKEOVER_SUPPRESSED_ERROR,
  type OutboxEffect,
  type OutboxEventRecord,
  type OutboxTakeoverCheck
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import type {
  ClaimExecutionRegistry,
  ClaimExecutionSlot
} from '../claimed-execution-lifecycle.ts'

export const CONTROLLED_OUTBOX_EVENT_TYPES = [
  'inbound.process',
  'message.outbound'
] as const

/**
 * A handler failure that no retry can fix (for example a malformed inbound
 * envelope). It goes straight to dead-letter instead of spending the retry
 * budget; an operator can still requeue it after correcting the cause.
 */
export class NonRetryableOutboxError extends Error {
  readonly nonRetryable = true as const

  constructor(message: string) {
    super(message)
    this.name = 'NonRetryableOutboxError'
  }
}

export function isNonRetryableOutboxError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error as { nonRetryable?: unknown }).nonRetryable === true
  )
}

export interface ProcessOutboxEventInput {
  tenantId: TenantId
  workerId: string
  adapter: DurableOutboxAdapter
  claimExecutions?: ClaimExecutionRegistry
  eventId?: string
  leaseMs?: number
  effect?: OutboxEffect
  /** The adapter rechecks this inside its ack boundary before any effect. */
  takeoverActive?: OutboxTakeoverCheck
  /** Used only when an effect intentionally returns no value. */
  result?: unknown
}

export interface OutboxHandoffResult {
  eventId: string
  tenantId: TenantId
  status: 'handoff'
  handoff: true
}

export type ProcessOutboxEventResult =
  | OutboxEventRecord
  | OutboxHandoffResult
  | null

export type ClaimedOutboxEventResult = Exclude<ProcessOutboxEventResult, null>

export interface CompleteClaimedOutboxEventInput {
  tenantId: TenantId
  workerId: string
  adapter: DurableOutboxAdapter
  claimExecutions?: ClaimExecutionRegistry
  slot?: ClaimExecutionSlot
  event: OutboxEventRecord
  effect?: OutboxEffect
  /** The adapter rechecks this inside its ack boundary before any effect. */
  takeoverActive?: OutboxTakeoverCheck
  /** Used only when an effect intentionally returns no value. */
  result?: unknown
}

/**
 * Claims one event and delegates the only execution of its local effect to
 * the adapter's at-least-once `ack` protocol. The PostgreSQL adapter commits
 * ownership before invoking a handler and commits the sanitized journal/state
 * transition afterward; controlled handlers must therefore be idempotent.
 * A handler is never invoked in the job itself.
 */
export async function processOutboxEvent(
  input: ProcessOutboxEventInput
): Promise<ProcessOutboxEventResult> {
  const claimed = await claimNextForExecution(input)
  if (!claimed) return null
  return completeClaimedOutboxEvent({ ...input, ...claimed })
}

/** The synchronous reservation owns even a checkout that resolves after shutdown. */
export async function claimNextForExecution(
  input: ProcessOutboxEventInput
): Promise<{ event: OutboxEventRecord; slot?: ClaimExecutionSlot } | null> {
  const registry = input.claimExecutions
  if (registry) {
    const adapter = registry.claimAdapter(
      input.tenantId,
      input.workerId,
      input.adapter
    )
    const slot = registry.reserveClaimSlot()
    if (!slot) return null
    try {
      const claimed = await adapter.claimNextFenced({
        tenantId: input.tenantId,
        workerId: input.workerId,
        ...(input.eventId ? { eventId: input.eventId } : {})
      })
      if (!claimed) {
        registry.releaseClaimSlot(slot)
        return null
      }
      registry.bindClaim(slot, claimed)
      return { event: claimed.event, slot }
    } catch (error) {
      registry.releaseClaimSlot(slot)
      throw error
    }
  }
  const event = await input.adapter.claimNext({
    tenantId: input.tenantId,
    workerId: input.workerId,
    ...(input.eventId ? { eventId: input.eventId } : {}),
    ...(input.leaseMs ? { leaseMs: input.leaseMs } : {})
  })
  if (!event) return null

  return { event }
}

/**
 * Executes the controlled dispatch and durable acknowledgement for an event
 * that was already claimed (and whose lease belongs to `workerId`). The
 * continuous worker uses this seam to heartbeat the lease while the handler
 * runs without claiming the same event twice.
 */
export async function completeClaimedOutboxEvent(
  input: CompleteClaimedOutboxEventInput
): Promise<ClaimedOutboxEventResult> {
  if (input.claimExecutions)
    return completeFencedClaim(input, input.claimExecutions)
  const event = input.event
  if (await isTakeoverActive(input.takeoverActive)) {
    await input.adapter.fail({
      tenantId: input.tenantId,
      eventId: event.id,
      workerId: input.workerId,
      terminal: true,
      handoff: true,
      error: OUTBOX_TAKEOVER_SUPPRESSED_ERROR
    })
    return {
      eventId: event.id,
      tenantId: input.tenantId,
      status: 'handoff',
      handoff: true
    }
  }

  if (!isControlledOutboxEventType(event.type) || !input.effect) {
    return input.adapter.fail({
      tenantId: input.tenantId,
      eventId: event.id,
      workerId: input.workerId,
      terminal: true,
      error: `unknown controlled outbox handler: ${event.type}`
    })
  }

  try {
    const acked = await input.adapter.ack({
      tenantId: input.tenantId,
      eventId: event.id,
      workerId: input.workerId,
      effect: input.effect,
      ...(input.takeoverActive !== undefined
        ? { takeoverActive: input.takeoverActive }
        : {}),
      ...(input.result !== undefined ? { result: input.result } : {})
    })
    if (
      acked.status === 'dead_letter' &&
      acked.lastError === OUTBOX_TAKEOVER_SUPPRESSED_ERROR
    ) {
      return {
        eventId: acked.id,
        tenantId: input.tenantId,
        status: 'handoff',
        handoff: true
      }
    }
    return acked
  } catch (error) {
    // The adapter owns the durable ack boundary. If the handler or final
    // journal transition fails, the same lease is sent through the
    // repository's retry policy, unless the failure is known to be permanent.
    try {
      return await input.adapter.fail({
        tenantId: input.tenantId,
        eventId: event.id,
        workerId: input.workerId,
        ...(isNonRetryableOutboxError(error) ? { terminal: true } : {}),
        error
      })
    } catch {
      throw error
    }
  }
}

async function completeFencedClaim(
  input: CompleteClaimedOutboxEventInput,
  registry: ClaimExecutionRegistry
): Promise<ClaimedOutboxEventResult> {
  if (!input.slot)
    throw new Error('Fenced job requires its reserved claim slot')
  const slot = input.slot
  const { event } = input
  const execution = registry.beginJob(
    slot,
    event,
    input.tenantId,
    input.workerId,
    input.adapter
  )
  const adapter = registry.claimAdapter(
    input.tenantId,
    input.workerId,
    input.adapter
  )
  let terminal = false
  let handoff = false
  let jobFailure: unknown
  try {
    try {
      // Renew before ACK preparation, not before its final transaction only.
      await execution.startOuter()
      if (await isTakeoverActive(input.takeoverActive)) {
        terminal = true
        handoff = true
        throw OUTBOX_TAKEOVER_SUPPRESSED_ERROR
      }
      execution.assertActive()
      if (!isControlledOutboxEventType(event.type)) {
        terminal = true
        throw new Error(`unknown controlled outbox handler: ${event.type}`)
      }
      const effect = registry.buildEffect(execution)
      let joinedBeforeFinalAck = false
      const acked = await adapter.ackClaim({
        tenantId: input.tenantId,
        eventId: event.id,
        workerId: input.workerId,
        claimRef: execution.claimRef,
        signal: execution.signal,
        effect,
        beforeFinalAck: async () => {
          await execution.stopAndJoin()
          if (execution.signal.aborted) throw execution.signal.reason
          joinedBeforeFinalAck = true
        },
        ...(input.takeoverActive !== undefined
          ? { takeoverActive: input.takeoverActive }
          : {}),
        ...(input.result !== undefined ? { result: input.result } : {})
      })
      if (!joinedBeforeFinalAck)
        throw new Error('Fenced ACK omitted the final join hook')
      if (
        acked.status === 'dead_letter' &&
        acked.lastError === OUTBOX_TAKEOVER_SUPPRESSED_ERROR
      ) {
        return {
          eventId: event.id,
          tenantId: input.tenantId,
          status: 'handoff',
          handoff: true
        }
      }
      return acked
    } catch (error) {
      execution.requestStop('error')
      let failure = error
      try {
        await execution.stopAndJoin()
      } catch (joinError) {
        // Keep the triggering job error on ordinary attempt cancellation, but
        // never conceal a distinct SQL/cleanup failure discovered while joining.
        if (joinError !== execution.signal.reason) failure = joinError
      }
      const failed = await adapter.failClaim({
        tenantId: input.tenantId,
        eventId: event.id,
        workerId: input.workerId,
        claimRef: execution.claimRef,
        error: failure,
        ...(terminal || isNonRetryableOutboxError(error)
          ? { terminal: true }
          : {}),
        ...(handoff ? { handoff: true } : {})
      })
      return handoff
        ? {
            eventId: event.id,
            tenantId: input.tenantId,
            status: 'handoff',
            handoff: true
          }
        : failed
    }
  } catch (error) {
    jobFailure = error ?? new Error('Fenced job failed without an error value')
    throw error
  } finally {
    // ACK/fail and the handler have settled; renewal rollback/cleanup joined.
    registry.releaseClaimSlot(slot, jobFailure)
  }
}

async function isTakeoverActive(
  value: OutboxTakeoverCheck | undefined
): Promise<boolean> {
  if (typeof value === 'function') return Boolean(await value())
  return value === true
}

function isControlledOutboxEventType(
  value: string
): value is (typeof CONTROLLED_OUTBOX_EVENT_TYPES)[number] {
  return (CONTROLLED_OUTBOX_EVENT_TYPES as readonly string[]).includes(value)
}
