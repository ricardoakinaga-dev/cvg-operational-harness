import { ModelGatewayError } from './errors.ts'

export interface RetryPolicy {
  maxRetries: number
  baseDelayMs: number
  maxDelayMs: number
  jitterRatio: number
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxRetries: 2,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
  jitterRatio: 0.2
}

export interface RetryDelayInput {
  attempt: number
  policy: RetryPolicy
  random: () => number
}

/**
 * Bounded exponential backoff with proportional jitter. Deterministic when the
 * injected random source is deterministic.
 */
export function computeRetryDelayMs({
  attempt,
  policy,
  random
}: RetryDelayInput): number {
  const exponent = Math.max(0, attempt - 1)
  const raw = policy.baseDelayMs * 2 ** exponent
  const bounded = Math.min(raw, policy.maxDelayMs)
  const jitter = bounded * policy.jitterRatio * clampUnit(random())
  return Math.round(bounded - bounded * policy.jitterRatio + jitter)
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

export function isRetryable(error: unknown): boolean {
  return error instanceof ModelGatewayError && error.retryable
}
