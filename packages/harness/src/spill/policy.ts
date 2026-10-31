import { DEFAULT_SPILL_POLICY, type SpillPolicy } from '@cvg/harness-contracts'
import { SpillPolicyError } from './errors.ts'

const POSITIVE_FIELDS = [
  'thresholdBytes',
  'previewHeadBytes',
  'previewTailBytes',
  'maxStoredBytes',
  'ttlMs',
  'ttlMaxMs',
  'readMaxBytes',
  'maxObjectsPerSession',
  'maxBytesPerTenant',
  'maxLocatorsPerTurn'
] as const

/** Merges an override into the defaults and fails closed on anything unusable. */
export function resolveSpillPolicy(
  override: Partial<SpillPolicy> = {}
): SpillPolicy {
  const policy: SpillPolicy = { ...DEFAULT_SPILL_POLICY, ...override }
  for (const field of POSITIVE_FIELDS) {
    const value = policy[field]
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new SpillPolicyError(
        `Spill policy ${field} must be a positive integer`
      )
    }
  }
  if (
    policy.previewHeadBytes + policy.previewTailBytes >=
    policy.thresholdBytes
  ) {
    throw new SpillPolicyError(
      'Spill preview must be smaller than the threshold it replaces'
    )
  }
  if (policy.ttlMs > policy.ttlMaxMs) {
    throw new SpillPolicyError('Spill ttlMs must not exceed ttlMaxMs')
  }
  if (policy.thresholdBytes > policy.maxStoredBytes) {
    throw new SpillPolicyError('Spill threshold must not exceed maxStoredBytes')
  }
  return Object.freeze(policy)
}
