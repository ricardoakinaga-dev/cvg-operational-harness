import { createHash } from 'node:crypto'
import { z } from 'zod'
import { canonicalizeJson } from '@cvg/shared'

export const ApprovalStatusSchema = z.enum([
  'REQUESTED',
  'PENDING',
  'APPROVED',
  'RESERVED',
  'EXECUTING',
  'REJECTED',
  'EXPIRED',
  'CANCELLED',
  'EXECUTED',
  'FAILED',
  'UNCERTAIN'
])

export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>

export const ApprovalResourceSchema = z
  .object({
    type: z.string().min(1).max(120),
    id: z.string().min(1).max(160).optional()
  })
  .strict()

export type ApprovalResource = z.infer<typeof ApprovalResourceSchema>

export const ApprovalRequestSchema = z
  .object({
    tenantId: z.string().min(1).max(120),
    operatorId: z.string().min(1).max(120),
    agentId: z.string().min(1).max(120),
    agentVersion: z.string().min(1).max(120),
    action: z.string().min(1).max(120),
    resource: ApprovalResourceSchema,
    payload: z.unknown(),
    policyVersion: z.string().min(1).max(120),
    promptVersion: z.string().min(1).max(120).optional(),
    correlationId: z.string().min(8).max(120),
    expiresInMs: z
      .number()
      .int()
      .min(1_000)
      .max(7 * 24 * 60 * 60 * 1_000)
      .optional(),
    singleUse: z.boolean().optional(),
    reason: z.string().max(500).optional(),
    operationKey: z.string().trim().min(1).max(200).optional(),
    executionRef: z.string().trim().min(1).max(200).optional(),
    proposalId: z.string().min(1).max(160).optional(),
    proposalHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    capability: z.string().min(1).max(120).optional(),
    dataClassification: z.string().min(1).max(120).optional(),
    proposalPayload: z.unknown().optional()
  })
  .strict()

/**
 * Typed proof about an effect. Absence/confirmation must be explicit; missing or
 * ambiguous information can never release a reservation by inference.
 */
export const EffectEvidenceSchema = z.discriminatedUnion('outcome', [
  z
    .object({
      outcome: z.literal('no_effect'),
      source: z.enum(['journal', 'adapter', 'operator']),
      evidenceRef: z.string().min(1).max(200)
    })
    .strict(),
  z
    .object({
      outcome: z.literal('effect_confirmed'),
      executionRef: z.string().min(1).max(200),
      evidenceRef: z.string().min(1).max(200)
    })
    .strict(),
  z
    .object({
      outcome: z.literal('effect_possibly_started'),
      evidenceRef: z.string().min(1).max(200)
    })
    .strict(),
  z
    .object({
      outcome: z.literal('unknown'),
      reason: z.string().min(1).max(500)
    })
    .strict()
])

export type EffectEvidence = z.infer<typeof EffectEvidenceSchema>

export const ApprovalReserveSchema = z
  .object({
    tenantId: z.string().min(1).max(120),
    approvalId: z.string().min(1).max(160),
    action: z.string().min(1).max(120),
    resource: ApprovalResourceSchema,
    payload: z.unknown().optional(),
    proposalHash: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .optional(),
    agentId: z.string().min(1).max(120).optional(),
    agentVersion: z.string().min(1).max(120).optional(),
    policyVersion: z.string().min(1).max(120).optional(),
    capability: z.string().min(1).max(120).optional(),
    operationKey: z.string().trim().min(1).max(200).optional(),
    reservationId: z.string().min(1).max(160).optional(),
    ownerId: z.string().min(1).max(120).optional(),
    ttlMs: z
      .number()
      .int()
      .min(1_000)
      .max(7 * 24 * 60 * 60 * 1_000)
      .optional()
  })
  .strict()

export type ApprovalReserveInput = z.input<typeof ApprovalReserveSchema>

export interface ApprovalReservation {
  approvalId: string
  tenantId: string
  reservationId: string
  reservationOwner: string
  reservedAt: string
  reservationExpiresAt: string
  action: string
  resource: ApprovalResource
  payloadHash: string
  generation: number
  proposalHash?: string
  operationKey?: string
}

export type ApprovalRequestInput = z.input<typeof ApprovalRequestSchema>
export type NormalizedApprovalRequest = z.output<typeof ApprovalRequestSchema>

export interface ApprovalRecord {
  approvalId: string
  tenantId: string
  operatorId: string
  agentId: string
  agentVersion: string
  action: string
  resource: ApprovalResource
  payloadHash: string
  policyVersion: string
  promptVersion?: string
  correlationId: string
  status: ApprovalStatus
  singleUse: boolean
  requestedAt: string
  expiresAt: string
  approvedAt?: string
  executedAt?: string
  rejectedAt?: string
  cancelledAt?: string
  expiredAt?: string
  approverId?: string
  decisionReason?: string
  executionCount: number
  executionRef?: string
  reservationId?: string
  reservationOwner?: string
  reservationExpiresAt?: string
  reservationGeneration?: number
  usedReservationIds?: string[]
  reservedAt?: string
  executingAt?: string
  releasedAt?: string
  failedAt?: string
  uncertainAt?: string
  confirmedAt?: string
  confirmationEvidenceRef?: string
  proposalId?: string
  proposalHash?: string
  capability?: string
  dataClassification?: string
  proposalPayload?: unknown
  operationKey?: string
}

export function computeApprovalPayloadHash(input: {
  action: string
  resource: ApprovalResource
  payload: unknown
}): string {
  const canonical = canonicalizeJson({
    action: input.action,
    resource: {
      type: input.resource.type,
      ...(input.resource.id !== undefined ? { id: input.resource.id } : {})
    },
    payload: input.payload
  })
  return createHash('sha256').update(canonical, 'utf8').digest('hex')
}

export function approvalMatchesAction(
  record: Pick<ApprovalRecord, 'action' | 'resource' | 'payloadHash'>,
  candidate: { action: string; resource: ApprovalResource; payload: unknown }
): boolean {
  if (record.action !== candidate.action) return false
  if (record.resource.type !== candidate.resource.type) return false
  if ((record.resource.id ?? null) !== (candidate.resource.id ?? null))
    return false
  return record.payloadHash === computeApprovalPayloadHash(candidate)
}
