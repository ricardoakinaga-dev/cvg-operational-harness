import {
  type DurableOutboxAdapter,
  OUTBOX_TAKEOVER_SUPPRESSED_ERROR,
  type OutboxEffect,
  type OutboxEventRecord,
  type OutboxTakeoverCheck
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'

export const CONTROLLED_OUTBOX_EVENT_TYPES = [
  'inbound.process',
  'message.outbound'
] as const

export interface ProcessOutboxEventInput {
  tenantId: TenantId
  workerId: string
  adapter: DurableOutboxAdapter
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
  const event = await input.adapter.claimNext({
    tenantId: input.tenantId,
    workerId: input.workerId,
    ...(input.eventId ? { eventId: input.eventId } : {}),
    ...(input.leaseMs ? { leaseMs: input.leaseMs } : {})
  })
  if (!event) return null

  return completeClaimedOutboxEvent({ ...input, event })
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
    // repository's retry policy.
    try {
      return await input.adapter.fail({
        tenantId: input.tenantId,
        eventId: event.id,
        workerId: input.workerId,
        error
      })
    } catch {
      throw error
    }
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
