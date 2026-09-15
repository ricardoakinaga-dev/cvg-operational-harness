import type {
  ApprovalRecord,
  ApprovalRequestInput,
  ApprovalReserveInput,
  ApprovalReservation,
  ApprovalResource,
  EffectEvidence
} from './contracts.ts'
import type { ApprovalConsumption } from './engine.ts'

/**
 * A value that a synchronous decision authority returns directly and a durable
 * authority (PostgreSQL, another process) returns through a promise.
 */
export type ApprovalAuthorityResult<T> = T | Promise<T>

/**
 * Runtime-facing approval authority (PROD-04, architecture A2).
 *
 * The canonical decision state machine stays in `ApprovalEngine`: this
 * interface only widens every return type to `T | Promise<T>`. `ApprovalEngine`
 * structurally satisfies it because a synchronous return is a valid
 * maybe-async return, so existing engine tests and call sites that already
 * await stay untouched. A durable implementation wraps the same engine and
 * persists each transition with a compare-and-set instead of duplicating any
 * decision rule.
 *
 * `expireStale` keeps the engine signature but is intentionally unsupported by
 * the RLS-scoped durable authority: the engine sweep is cross-tenant while
 * every durable connection carries exactly one `cvg.tenant_id`. Callers sweep
 * per tenant through `releaseExpired`.
 */
export interface ApprovalAuthority {
  request(input: ApprovalRequestInput): ApprovalAuthorityResult<ApprovalRecord>

  submit(
    tenantId: string,
    approvalId: string,
    actorId: string
  ): ApprovalAuthorityResult<ApprovalRecord>

  approve(
    tenantId: string,
    approvalId: string,
    input: { approverId: string; reason?: string }
  ): ApprovalAuthorityResult<ApprovalRecord>

  reject(
    tenantId: string,
    approvalId: string,
    input: { approverId: string; reason?: string }
  ): ApprovalAuthorityResult<ApprovalRecord>

  cancel(
    tenantId: string,
    approvalId: string,
    actorId: string
  ): ApprovalAuthorityResult<ApprovalRecord>

  verifyAndConsume(input: {
    tenantId: string
    approvalId: string
    action: string
    resource: ApprovalResource
    payload: unknown
    executionRef?: string
  }): ApprovalAuthorityResult<ApprovalConsumption>

  reserve(
    input: ApprovalReserveInput
  ): ApprovalAuthorityResult<ApprovalReservation>

  markExecuting(input: {
    tenantId: string
    approvalId: string
    reservationId: string
  }): ApprovalAuthorityResult<ApprovalRecord>

  confirm(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    evidence: EffectEvidence
  }): ApprovalAuthorityResult<ApprovalRecord>

  release(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    evidence: EffectEvidence
  }): ApprovalAuthorityResult<ApprovalRecord>

  fail(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    evidence: EffectEvidence
  }): ApprovalAuthorityResult<ApprovalRecord>

  markUncertain(input: {
    tenantId: string
    approvalId: string
    reservationId: string
    reason: string
    evidence?: EffectEvidence
  }): ApprovalAuthorityResult<ApprovalRecord>

  reconcile(input: {
    tenantId: string
    approvalId: string
    actorId: string
    evidence: EffectEvidence
  }): ApprovalAuthorityResult<ApprovalRecord>

  releaseExpired(input: {
    tenantId: string
    now?: Date
    ttlMs?: number
    evidenceFor: (record: ApprovalRecord) => EffectEvidence | undefined
  }): ApprovalAuthorityResult<{ released: number; uncertain: number }>

  expireStale(now?: Date): ApprovalAuthorityResult<number>

  list(
    tenantId: string,
    status?: ApprovalRecord['status']
  ): ApprovalAuthorityResult<ApprovalRecord[]>

  get(
    tenantId: string,
    approvalId: string
  ): ApprovalAuthorityResult<ApprovalRecord>
}
