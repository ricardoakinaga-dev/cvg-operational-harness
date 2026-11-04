import type { ProviderUsage } from './contracts.ts'

export interface TokenMeterSnapshot {
  readonly requests: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly totalTokens: number
}

export class TokenMeterError extends Error {
  readonly code = 'invalid_usage' as const

  constructor(message: string) {
    super(message)
    this.name = 'TokenMeterError'
  }
}

/** A count that can be summed without losing integer precision. */
export function isValidTokenCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= Number.MAX_SAFE_INTEGER
  )
}

export function isValidProviderUsage(value: unknown): value is ProviderUsage {
  if (typeof value !== 'object' || value === null) return false
  const usage = value as { inputTokens?: unknown; outputTokens?: unknown }
  return (
    isValidTokenCount(usage.inputTokens) &&
    isValidTokenCount(usage.outputTokens)
  )
}

function assertSum(current: number, added: number): number {
  const next = current + added
  if (!Number.isSafeInteger(next)) {
    throw new TokenMeterError('TokenMeter overflowed its safe integer range')
  }
  return next
}

/**
 * PDSH-024 / SPEC 0205: per-turn aggregation of measured provider usage.
 * A host creates one meter per turn and reads `snapshot()` at the end; the
 * gateway records every successful call when a meter is composed.
 */
export class TokenMeter {
  #requests = 0
  #inputTokens = 0
  #outputTokens = 0
  #unreportedRequests = 0

  /**
   * SPEC 0267 §3.3: a call whose provider reported no counters. Counted
   * apart; no token is added to the measured sums.
   */
  recordUnreported(): void {
    this.#unreportedRequests = assertSum(this.#unreportedRequests, 1)
  }

  get unreportedRequests(): number {
    return this.#unreportedRequests
  }

  record(usage: ProviderUsage): TokenMeterSnapshot {
    if (!isValidProviderUsage(usage)) {
      throw new TokenMeterError(
        'TokenMeter only accepts non-negative safe integer usage from the provider'
      )
    }
    const requests = assertSum(this.#requests, 1)
    const inputTokens = assertSum(this.#inputTokens, usage.inputTokens)
    const outputTokens = assertSum(this.#outputTokens, usage.outputTokens)
    this.#requests = requests
    this.#inputTokens = inputTokens
    this.#outputTokens = outputTokens
    return this.snapshot()
  }

  /**
   * Convenience: records the usage of a gateway `ModelResult`. A result whose
   * `usageStatus` is `unreported` carries an accounting bound, not a
   * measurement (SPEC 0267 §3.3): it is counted apart and adds no tokens.
   */
  recordModelResult(result: {
    readonly usage: ProviderUsage
    readonly usageStatus?: 'reported' | 'unreported'
  }): TokenMeterSnapshot {
    if (
      !result ||
      typeof result !== 'object' ||
      !isValidProviderUsage(result.usage)
    ) {
      throw new TokenMeterError(
        'TokenMeter.recordModelResult requires a result with measured usage'
      )
    }
    if (result.usageStatus === 'unreported') {
      this.recordUnreported()
      return this.snapshot()
    }
    return this.record(result.usage)
  }

  snapshot(): TokenMeterSnapshot {
    return Object.freeze({
      requests: this.#requests,
      inputTokens: this.#inputTokens,
      outputTokens: this.#outputTokens,
      totalTokens: this.#inputTokens + this.#outputTokens
    })
  }
}
