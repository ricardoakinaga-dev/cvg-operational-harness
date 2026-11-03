import { randomUUID } from 'node:crypto'
import type { SessionEventStore, SessionStream } from '@cvg/harness-contracts'
import type { KernelLog } from '../kernel/types.ts'
import { SessionEventError, validateSessionStream } from './events.ts'

export interface SessionKernelLogOptions extends SessionStream {
  readonly store: SessionEventStore
  readonly traceId: string
  readonly correlationId: string
  readonly eventId?: () => string
  readonly clock?: () => Date
}
/** Bind this adapter to a session/turn; callers open the stream explicitly. */
export function createSessionKernelLog(
  options: SessionKernelLogOptions
): KernelLog {
  const stream = validateSessionStream({
    tenantId: options.tenantId,
    sessionId: options.sessionId,
    formatVersion: options.formatVersion
  })
  const { store, traceId, correlationId } = options
  const id = options.eventId ?? randomUUID
  const clock = options.clock ?? (() => new Date())
  return {
    append: async (event) => {
      if (event.correlationId !== correlationId)
        throw new SessionEventError(
          'invalid_session_event',
          'Kernel log correlation differs from bound turn'
        )
      const { type, ...payload } = event
      await store.append({
        ...stream,
        type,
        payload: payload as never,
        eventId: id(),
        timestamp: clock().toISOString(),
        correlationId,
        traceId
      })
    }
  }
}
