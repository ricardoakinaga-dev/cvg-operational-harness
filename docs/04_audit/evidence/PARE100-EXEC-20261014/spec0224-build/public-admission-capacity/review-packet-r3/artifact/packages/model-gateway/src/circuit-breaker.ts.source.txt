export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN'

export interface CircuitBreakerOptions {
  failureThreshold?: number
  openMs?: number
  halfOpenSuccesses?: number
  clock?: () => number
  onTransition?: (transition: CircuitTransition) => void
}

export interface CircuitTransition {
  key: string
  from: CircuitState
  to: CircuitState
  at: number
}

interface CircuitEntry {
  state: CircuitState
  failures: number
  successes: number
  openedAt: number
  halfOpenInFlight: boolean
}

export class CircuitOpenError extends Error {
  readonly key: string
  readonly retryAt: number

  constructor(key: string, retryAt: number) {
    super(`Circuit breaker is open for ${key}`)
    this.name = 'CircuitOpenError'
    this.key = key
    this.retryAt = retryAt
  }
}

/**
 * Per provider/model circuit breaker with CLOSED -> OPEN -> HALF_OPEN
 * transitions. HALF_OPEN admits a single probe at a time.
 */
export class CircuitBreaker {
  readonly #failureThreshold: number
  readonly #openMs: number
  readonly #halfOpenSuccesses: number
  readonly #clock: () => number
  readonly #onTransition?: (transition: CircuitTransition) => void
  readonly #entries = new Map<string, CircuitEntry>()

  constructor(options: CircuitBreakerOptions = {}) {
    this.#failureThreshold = options.failureThreshold ?? 5
    this.#openMs = options.openMs ?? 30_000
    this.#halfOpenSuccesses = options.halfOpenSuccesses ?? 2
    this.#clock = options.clock ?? (() => Date.now())
    if (options.onTransition) this.#onTransition = options.onTransition
  }

  state(key: string): CircuitState {
    const entry = this.#entry(key)
    this.#refresh(entry, key)
    return entry.state
  }

  canRequest(key: string): boolean {
    const entry = this.#entry(key)
    this.#refresh(entry, key)
    if (entry.state === 'CLOSED') return true
    if (entry.state === 'OPEN') return false
    if (entry.halfOpenInFlight) return false
    entry.halfOpenInFlight = true
    return true
  }

  onSuccess(key: string): void {
    const entry = this.#entry(key)
    this.#refresh(entry, key)
    if (entry.state === 'HALF_OPEN') {
      entry.successes += 1
      entry.halfOpenInFlight = false
      if (entry.successes >= this.#halfOpenSuccesses) {
        entry.failures = 0
        entry.successes = 0
        this.#transition(entry, key, 'CLOSED')
      }
      return
    }
    entry.failures = 0
    entry.halfOpenInFlight = false
  }

  onFailure(key: string): void {
    const entry = this.#entry(key)
    this.#refresh(entry, key)
    entry.halfOpenInFlight = false
    if (entry.state === 'HALF_OPEN') {
      entry.failures = this.#failureThreshold
      entry.successes = 0
      entry.openedAt = this.#clock()
      this.#transition(entry, key, 'OPEN')
      return
    }
    entry.failures += 1
    if (entry.failures >= this.#failureThreshold) {
      entry.openedAt = this.#clock()
      this.#transition(entry, key, 'OPEN')
    }
  }

  snapshot(): Record<string, CircuitState> {
    const result: Record<string, CircuitState> = {}
    for (const [key, entry] of this.#entries) {
      this.#refresh(entry, key)
      result[key] = entry.state
    }
    return result
  }

  #entry(key: string): CircuitEntry {
    let entry = this.#entries.get(key)
    if (!entry) {
      entry = {
        state: 'CLOSED',
        failures: 0,
        successes: 0,
        openedAt: 0,
        halfOpenInFlight: false
      }
      this.#entries.set(key, entry)
    }
    return entry
  }

  #refresh(entry: CircuitEntry, key: string): void {
    if (
      entry.state === 'OPEN' &&
      this.#clock() - entry.openedAt >= this.#openMs
    ) {
      entry.state = 'HALF_OPEN'
      entry.successes = 0
      entry.halfOpenInFlight = false
      this.#emit({ key, from: 'OPEN', to: 'HALF_OPEN', at: this.#clock() })
    }
  }

  #transition(entry: CircuitEntry, key: string, to: CircuitState): void {
    const from = entry.state
    entry.state = to
    if (to === 'OPEN') {
      entry.openedAt = this.#clock()
    }
    this.#emit({ key, from, to, at: this.#clock() })
  }

  #emit(transition: CircuitTransition): void {
    this.#onTransition?.(transition)
  }
}
