/**
 * SPEC 0293 (PAR-C03): large tool output is stored outside the context and the
 * model gets a preview, the exact size and an opaque locator. Types only; the
 * rendering, the stores and the errors live in `@cvg/harness`.
 */

/**
 * `process` is the memory of one process (tests only); `shared` survives and
 * is visible across processes. A composition that is not `shared` reports
 * `armazenado=não` (SPEC 0293 I14).
 */
export type SpillDurability = 'process' | 'shared'

export interface SpillPutInput {
  readonly tenantId: string
  readonly sessionId: string
  readonly executionId: string
  readonly operationKey: string
  readonly sourceId: string
  readonly classification: string
  readonly mediaType: 'text/plain' | 'application/json'
  readonly content: string
  readonly signal?: AbortSignal
}

export interface SpillReceipt {
  /** Opaque, unguessable; carries no path, tenant, session or content. */
  readonly locator: string
  readonly bytes: number
  readonly sha256: string
  readonly createdAt: string
  readonly expiresAt: string
}

export interface SpillReadInput {
  readonly tenantId: string
  readonly sessionId: string
  readonly locator: string
  readonly offset: number
  readonly length: number
  readonly signal?: AbortSignal
}

export interface SpillSlice {
  readonly text: string
  readonly offset: number
  readonly bytesRead: number
  readonly totalBytes: number
  readonly eof: boolean
}

export interface SpillStore {
  readonly durability: SpillDurability
  put(input: SpillPutInput): Promise<SpillReceipt>
  read(input: SpillReadInput): Promise<SpillSlice>
}

export interface SpillPolicy {
  /** Output above this many UTF-8 bytes is stored and shown as a preview. */
  readonly thresholdBytes: number
  readonly previewHeadBytes: number
  readonly previewTailBytes: number
  readonly maxStoredBytes: number
  readonly ttlMs: number
  readonly ttlMaxMs: number
  readonly readMaxBytes: number
  readonly maxObjectsPerSession: number
  readonly maxBytesPerTenant: number
  /** Stored outputs per turn; further ones are shown as `armazenado=não`. */
  readonly maxLocatorsPerTurn: number
}

export const DEFAULT_SPILL_POLICY: SpillPolicy = Object.freeze({
  thresholdBytes: 8_192,
  previewHeadBytes: 2_048,
  previewTailBytes: 1_024,
  maxStoredBytes: 8 * 1024 * 1024,
  ttlMs: 24 * 60 * 60 * 1000,
  ttlMaxMs: 7 * 24 * 60 * 60 * 1000,
  readMaxBytes: 32_768,
  maxObjectsPerSession: 256,
  maxBytesPerTenant: 256 * 1024 * 1024,
  maxLocatorsPerTurn: 64
})

/**
 * What the model sees for one tool result, decided once on arrival and never
 * rewritten (SPEC 0293 I13). The text is untrusted data; the runtime, never the
 * tool, fills this in.
 */
export interface ObservationRendering {
  readonly form: 'inline' | 'preview'
  readonly text: string
  readonly bytes: number
  readonly sha256: string
  readonly stored: boolean
  readonly locator?: string
}
