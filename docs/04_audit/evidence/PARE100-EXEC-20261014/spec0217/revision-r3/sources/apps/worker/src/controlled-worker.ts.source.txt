import { type DurableOutboxAdapter, type OutboxEffect } from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import {
  CONTROLLED_OUTBOX_EVENT_TYPES,
  processOutboxEvent,
  type ProcessOutboxEventResult
} from './jobs/process-outbox-event.ts'

export { CONTROLLED_OUTBOX_EVENT_TYPES }

export type ControlledOutboxEventType =
  (typeof CONTROLLED_OUTBOX_EVENT_TYPES)[number]

/**
 * The composition boundary is deliberately closed over known event types.
 * Callers cannot inject an arbitrary string-to-handler registry into the
 * worker process; the inbound and outbound seams are explicit and auditable.
 */
export interface ControlledWorkerHandlers {
  inboundProcess: OutboxEffect
  messageOutbound: OutboxEffect
}

export interface ControlledWorkerOptions {
  tenantId: TenantId
  workerId: string
  adapter: DurableOutboxAdapter
  handlers: ControlledWorkerHandlers
  leaseMs?: number
  takeoverActive?: boolean | (() => boolean | Promise<boolean>)
}

export interface ControlledWorkerDrainResult {
  processed: number
  results: ProcessOutboxEventResult[]
}

export interface ControlledWorker {
  processNext(eventId?: string): Promise<ProcessOutboxEventResult>
  drain(maxEvents?: number): Promise<ControlledWorkerDrainResult>
}

export function createControlledWorker(
  options: ControlledWorkerOptions
): ControlledWorker {
  const workerId = options.workerId.trim()
  if (!workerId) throw new Error('Controlled worker id is required')
  const dispatch = createControlledDispatch(options.handlers)

  const processNext = async (
    eventId?: string
  ): Promise<ProcessOutboxEventResult> =>
    processOutboxEvent({
      tenantId: options.tenantId,
      workerId,
      adapter: options.adapter,
      ...(eventId ? { eventId } : {}),
      ...(options.leaseMs ? { leaseMs: options.leaseMs } : {}),
      ...(options.takeoverActive !== undefined
        ? { takeoverActive: options.takeoverActive }
        : {}),
      effect: dispatch
    })

  const drain = async (maxEvents = 1): Promise<ControlledWorkerDrainResult> => {
    if (!Number.isInteger(maxEvents) || maxEvents <= 0 || maxEvents > 100) {
      throw new Error('Controlled worker drain limit must be between 1 and 100')
    }
    const results: ProcessOutboxEventResult[] = []
    for (let index = 0; index < maxEvents; index += 1) {
      const result = await processOutboxEvent({
        tenantId: options.tenantId,
        workerId,
        adapter: options.adapter,
        ...(options.leaseMs ? { leaseMs: options.leaseMs } : {}),
        ...(options.takeoverActive !== undefined
          ? { takeoverActive: options.takeoverActive }
          : {}),
        effect: dispatch
      })
      if (!result) break
      results.push(result)
    }
    return { processed: results.length, results }
  }

  return { processNext, drain }
}

export function createControlledDispatch(
  handlers: ControlledWorkerHandlers
): OutboxEffect {
  if (
    typeof handlers.inboundProcess !== 'function' ||
    typeof handlers.messageOutbound !== 'function'
  ) {
    throw new Error('Controlled worker handlers are required')
  }
  return (event) => {
    switch (event.type) {
      case 'inbound.process':
        return handlers.inboundProcess(event)
      case 'message.outbound':
        return handlers.messageOutbound(event)
      default:
        throw new Error(`Unsupported controlled outbox event: ${event.type}`)
    }
  }
}
