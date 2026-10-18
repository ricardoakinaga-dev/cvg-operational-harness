import catalog from './session-event-schemas.v1.json' with { type: 'json' }

function freeze(value: object): void {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') freeze(child)
  }
  Object.freeze(value)
}
freeze(catalog)
/** Immutable schema data; fingerprints include the complete referenced definitions. */
export const SESSION_EVENT_CATALOG_V1 = catalog
export type SessionEventType = keyof typeof catalog.events
export type SessionJson =
  | null
  | boolean
  | number
  | string
  | readonly SessionJson[]
  | { readonly [key: string]: SessionJson }
export interface SessionStream {
  readonly tenantId: string
  readonly sessionId: string
  readonly formatVersion: 1
}
export interface SessionEventAppend extends SessionStream {
  readonly eventId: string
  readonly timestamp: string
  readonly correlationId: string
  readonly traceId: string
  readonly type: SessionEventType
  readonly payload: SessionJson
}
export interface SessionEvent extends SessionEventAppend {
  readonly sequence: number
  readonly schemaFingerprint: string
}
export interface SessionEventRead {
  readonly tenantId: string
  readonly sessionId: string
  readonly afterSequence?: number
  readonly limit?: number
}
/** Trusted composition binds tenant/identity; transport adapters authenticate first. */
export interface SessionEventStore {
  openSession(input: SessionStream): Promise<SessionStream>
  append(input: SessionEventAppend): Promise<SessionEvent>
  read(input: SessionEventRead): Promise<readonly SessionEvent[]>
}
