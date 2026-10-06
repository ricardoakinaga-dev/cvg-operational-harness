import { createHash } from 'node:crypto'
import type { Capability } from '@cvg/policy-engine'
import { canonicalizeJson } from '@cvg/shared'
import type { GovernedTurnInput } from './contracts.ts'

export function normalizedResource(resource: {
  type: string
  id?: string | undefined
}): { type: string; id?: string } {
  return {
    type: resource.type,
    ...(resource.id !== undefined ? { id: resource.id } : {})
  }
}

/**
 * AAA-03 section 2 operation key. It is stable across retries: with a caller
 * idempotency key only the tenant + caller key identify the operation; without
 * it the tenant, capability, action, canonical resource and proposal hash do.
 */
export function computeOperationKey(input: {
  tenantId: string
  callerIdempotencyKey?: string
  capability: Capability
  action: string
  resource: { type: string; id?: string | undefined }
  proposalHash: string
}): string {
  const canonical =
    input.callerIdempotencyKey !== undefined
      ? canonicalizeJson({
          tenantId: input.tenantId,
          callerIdempotencyKey: input.callerIdempotencyKey
        })
      : canonicalizeJson({
          tenantId: input.tenantId,
          capability: input.capability,
          action: input.action,
          resource: normalizedResource(input.resource),
          proposalHash: input.proposalHash
        })
  return `op:${createHash('sha256').update(canonical, 'utf8').digest('hex')}`
}

export function computeResultDigest(result: unknown): string {
  return createHash('sha256')
    .update(canonicalizeJson(result), 'utf8')
    .digest('hex')
}

export function approvalResource(input: GovernedTurnInput): {
  type: string
  id?: string
} {
  return {
    type: input.resource.type,
    ...(input.resource.id !== undefined ? { id: input.resource.id } : {})
  }
}
