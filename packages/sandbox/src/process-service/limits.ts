import { ProcessServiceError } from './errors.ts'
import type { ProcessLimits, ProcessServiceLimitsCaps } from './types.ts'

export const DEFAULT_LIMIT_CAPS: ProcessServiceLimitsCaps = Object.freeze({
  startupMs: 30_000,
  lifetimeMs: 3_600_000,
  cleanupMs: 60_000,
  graceMs: 10_000,
  maxOutputBytes: 64 * 1024 * 1024,
  maxStdinBytes: 16 * 1024 * 1024
})

const fail = (what: string): never => {
  throw new ProcessServiceError('invalid_limits', `limit ${what} is invalid`)
}
function positive(
  value: unknown,
  name: keyof ProcessLimits,
  cap: number,
  min = 1
): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < min ||
    value > cap
  )
    fail(name)
  return value as number
}

/** Every limit is mandatory, finite and within the host caps (SPEC 0286 I7/I8). */
export function validateProcessLimits(
  limits: ProcessLimits,
  caps: ProcessServiceLimitsCaps = DEFAULT_LIMIT_CAPS
): ProcessLimits {
  if (limits === null || typeof limits !== 'object') fail('limits')
  const out = {
    startupMs: positive(limits.startupMs, 'startupMs', caps.startupMs),
    lifetimeMs: positive(limits.lifetimeMs, 'lifetimeMs', caps.lifetimeMs),
    cleanupMs: positive(limits.cleanupMs, 'cleanupMs', caps.cleanupMs, 100),
    graceMs: positive(limits.graceMs, 'graceMs', caps.graceMs, 0),
    maxOutputBytes: positive(
      limits.maxOutputBytes,
      'maxOutputBytes',
      caps.maxOutputBytes
    ),
    maxStdinBytes: positive(
      limits.maxStdinBytes,
      'maxStdinBytes',
      caps.maxStdinBytes,
      0
    )
  }
  // The grace period is part of the cleanup budget, never longer than it.
  if (out.graceMs > out.cleanupMs) fail('graceMs')
  return Object.freeze(out)
}
