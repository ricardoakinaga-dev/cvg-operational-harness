import type {
  CanonicalEnvelopeInput,
  CanonicalOutboundMessage
} from './contracts.ts'

export interface InboundDedupStore {
  /**
   * Atomic insert-if-absent with expiration. Returns true only when the caller
   * reserved the key (first delivery).
   */
  reserve(key: string, expiresAtMs: number): boolean
  has(key: string): boolean
}

export class InMemoryInboundDedupStore implements InboundDedupStore {
  readonly #entries = new Map<string, number>()
  readonly #clock: () => number

  constructor(options: { clock?: () => number } = {}) {
    this.#clock = options.clock ?? (() => Date.now())
  }

  reserve(key: string, expiresAtMs: number): boolean {
    this.#sweep()
    const existing = this.#entries.get(key)
    if (existing !== undefined && existing > this.#clock()) return false
    this.#entries.set(key, expiresAtMs)
    return true
  }

  has(key: string): boolean {
    this.#sweep()
    return this.#entries.has(key)
  }

  size(): number {
    return this.#entries.size
  }

  #sweep(): void {
    const now = this.#clock()
    for (const [key, expiresAt] of this.#entries) {
      if (expiresAt <= now) this.#entries.delete(key)
    }
  }
}

export class InboundDeduplicator {
  readonly #store: InboundDedupStore
  readonly #ttlMs: number
  readonly #clock: () => number

  constructor(
    options: {
      store?: InboundDedupStore
      ttlMs?: number
      clock?: () => number
    } = {}
  ) {
    this.#clock = options.clock ?? (() => Date.now())
    this.#store =
      options.store ?? new InMemoryInboundDedupStore({ clock: this.#clock })
    this.#ttlMs = options.ttlMs ?? 7 * 24 * 60 * 60 * 1000
  }

  accept(envelope: Pick<CanonicalEnvelopeInput, 'idempotencyKey'>): {
    accepted: boolean
    key: string
  } {
    const key = envelope.idempotencyKey
    const accepted = this.#store.reserve(key, this.#clock() + this.#ttlMs)
    return { accepted, key }
  }
}

export type { CanonicalOutboundMessage }
