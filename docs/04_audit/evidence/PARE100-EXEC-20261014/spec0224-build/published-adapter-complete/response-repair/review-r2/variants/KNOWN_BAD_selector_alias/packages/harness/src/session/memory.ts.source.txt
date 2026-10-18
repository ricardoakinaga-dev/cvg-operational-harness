import type {
  SessionStream,
  SessionEvent,
  SessionEventStore,
  SessionEventAppend,
  SessionEventRead
} from '@cvg/harness-contracts'
import {
  SessionEventError,
  materializeSessionEvent,
  sessionEventInputDigest,
  validateSessionEvent,
  validateSessionEventAppend,
  validateSessionEventRead,
  validateSessionStream
} from './events.ts'

const key = (tenant: string, session: string) =>
  JSON.stringify([tenant, session])
/** In-process fixture only; host adapters own durable multi-process append. */
export class InMemorySessionEventStore implements SessionEventStore {
  readonly #streams = new Map<
    string,
    {
      stream: SessionStream
      events: SessionEvent[]
      digests: Map<string, string>
    }
  >()
  async openSession(input: SessionStream): Promise<SessionStream> {
    const stream = validateSessionStream(input)
    const id = key(stream.tenantId, stream.sessionId)
    if (!this.#streams.has(id))
      this.#streams.set(id, { stream, events: [], digests: new Map() })
    return { ...stream }
  }
  async append(raw: SessionEventAppend): Promise<SessionEvent> {
    const input = validateSessionEventAppend(raw)
    const state = this.#streams.get(key(input.tenantId, input.sessionId))
    if (!state)
      throw new SessionEventError(
        'session_not_open',
        'Session stream is not open'
      )
    const digest = sessionEventInputDigest(input)
    const previous = state.events.find(
      (event) => event.eventId === input.eventId
    )
    if (previous) {
      if (state.digests.get(input.eventId) !== digest)
        throw new SessionEventError(
          'session_event_conflict',
          'Session event identity was reused with different input'
        )
      return validateSessionEvent(previous)
    }
    const event = materializeSessionEvent(input, state.events.length + 1)
    state.events.push(event)
    state.digests.set(input.eventId, digest)
    return validateSessionEvent(event)
  }
  async read(raw: SessionEventRead): Promise<readonly SessionEvent[]> {
    const input = validateSessionEventRead(raw)
    const state = this.#streams.get(key(input.tenantId, input.sessionId))
    if (!state)
      throw new SessionEventError(
        'session_not_open',
        'Session stream is not open'
      )
    return state.events
      .filter((event) => event.sequence > input.afterSequence)
      .slice(0, input.limit)
      .map(validateSessionEvent)
  }
}
