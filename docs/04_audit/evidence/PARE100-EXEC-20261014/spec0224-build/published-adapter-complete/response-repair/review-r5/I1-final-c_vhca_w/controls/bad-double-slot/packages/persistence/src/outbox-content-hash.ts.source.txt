/**
 * AUD19-004 — canonical content binding for outbox idempotency.
 *
 * The same (tenant, idempotencyKey) must never silently accept a different
 * (type, envelopeVersion, payload). The binding is a comparison authority:
 * stores compute it for the incoming event and for the recorded winner with
 * the same canonicalization, so key-ordering or whitespace can never cause a
 * false divergence, and any semantic divergence fails closed.
 */
import { createHash } from 'node:crypto'
import { canonicalizeJson } from '@cvg/shared'

export interface OutboxContentBinding {
  readonly tenantId: string
  readonly type: string
  readonly envelopeVersion: number
  readonly payload: unknown
}

export function computeOutboxContentHash(
  binding: OutboxContentBinding
): string {
  return createHash('sha256')
    .update(
      canonicalizeJson({
        tenantId: binding.tenantId,
        type: binding.type,
        envelopeVersion: binding.envelopeVersion,
        payload: binding.payload ?? null
      })
    )
    .digest('hex')
}

/**
 * Fail-closed comparison used on every idempotency-key hit. Returns the
 * winner record hash context for evidence; throws DomainError-shaped plain
 * errors through the caller's own error type.
 */
export function assertSameOutboxContent(
  winner: OutboxContentBinding,
  incoming: OutboxContentBinding,
  throwConflict: (message: string) => never
): void {
  if (computeOutboxContentHash(winner) !== computeOutboxContentHash(incoming)) {
    throwConflict(
      `Outbox idempotency key is bound to different content (type/version/payload mismatch)`
    )
  }
}
