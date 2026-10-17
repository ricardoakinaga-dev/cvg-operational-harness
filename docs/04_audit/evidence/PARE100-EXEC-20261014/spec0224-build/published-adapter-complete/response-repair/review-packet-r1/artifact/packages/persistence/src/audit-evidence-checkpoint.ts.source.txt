import { createHash, randomUUID } from 'node:crypto'
import { sanitizeAuditEvidencePayload } from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import { z } from 'zod'
import type {
  AuditEventRecord,
  AuditEvidenceFilters,
  AuditEventType
} from './schema.ts'

const boundedFilter = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z0-9._:-]+$/)

export const AuditEvidenceCheckpointIdSchema = z
  .string()
  .regex(/^audit_checkpoint_[0-9a-f-]{36}$/)

export type AuditEvidenceCheckpointId = z.infer<
  typeof AuditEvidenceCheckpointIdSchema
>

export const AuditEvidenceCheckpointStatusSchema = z.enum([
  'SEALED',
  'ARCHIVED'
])
export type AuditEvidenceCheckpointStatus = z.infer<
  typeof AuditEvidenceCheckpointStatusSchema
>

export const AuditEvidenceCheckpointFiltersSchema = z
  .object({
    sessionId: boundedFilter.optional(),
    correlationId: boundedFilter.optional(),
    type: z
      .enum([
        'tool_call',
        'safety_event',
        'integration_event',
        'policy_decision',
        'approval_decision',
        'handoff'
      ])
      .optional(),
    actorId: boundedFilter.optional()
  })
  .strict()

export type AuditEvidenceCheckpointFilters = z.infer<
  typeof AuditEvidenceCheckpointFiltersSchema
>

const AuditEvidenceEventIdSchema = z.string().regex(/^audit_[0-9a-f-]{36}$/)

export const AuditEvidenceCheckpointCreateInputSchema = z
  .object({
    eventIds: z.array(AuditEvidenceEventIdSchema).min(1).max(200),
    filters: AuditEvidenceCheckpointFiltersSchema.default({})
  })
  .strict()
  .superRefine((input, context) => {
    if (new Set(input.eventIds).size !== input.eventIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['eventIds'],
        message: 'eventIds must be unique'
      })
    }
  })

export type AuditEvidenceCheckpointCreateInput = z.input<
  typeof AuditEvidenceCheckpointCreateInputSchema
>

export const AuditEvidenceCheckpointTransitionInputSchema = z
  .object({
    status: z.literal('ARCHIVED'),
    expectedStatus: z.literal('SEALED')
  })
  .strict()

export type AuditEvidenceCheckpointTransitionInput = z.infer<
  typeof AuditEvidenceCheckpointTransitionInputSchema
>

export const AuditEvidenceCheckpointActorIdSchema = boundedFilter

export interface AuditEvidenceCheckpointRecord {
  tenantId: TenantId
  id: AuditEvidenceCheckpointId
  filters: AuditEvidenceCheckpointFilters
  eventIds: string[]
  eventCount: number
  evidenceDigest: string
  status: AuditEvidenceCheckpointStatus
  createdBy: string
  updatedBy: string
  createdAt: Date
  updatedAt: Date
}

export function createAuditEvidenceCheckpointId(): AuditEvidenceCheckpointId {
  return AuditEvidenceCheckpointIdSchema.parse(
    `audit_checkpoint_${randomUUID()}`
  )
}

export function computeAuditEvidenceCheckpointDigest(
  rawTenantId: TenantId,
  rawInput: AuditEvidenceCheckpointCreateInput,
  events: AuditEventRecord[]
): string {
  const tenantId = TenantIdSchema.parse(rawTenantId)
  const input = AuditEvidenceCheckpointCreateInputSchema.parse(rawInput)
  const canonical = {
    tenantId,
    filters: canonicalize(input.filters),
    eventIds: [...input.eventIds].sort(),
    events: [...events]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((event) => ({
        id: event.id,
        type: event.type,
        actorType: event.actorType,
        actorId: event.actorId,
        correlationId: event.correlationId,
        policyVersion: event.policyVersion,
        createdAt: canonicalize(event.createdAt),
        payload: canonicalize(
          sanitizeAuditEvidencePayload(event.payload).payload
        )
      }))
  }
  return createHash('sha256').update(canonicalJson(canonical)).digest('hex')
}

export function cloneAuditEvidenceCheckpoint(
  checkpoint: AuditEvidenceCheckpointRecord
): AuditEvidenceCheckpointRecord {
  return {
    ...checkpoint,
    filters: { ...checkpoint.filters },
    eventIds: [...checkpoint.eventIds],
    createdAt: new Date(checkpoint.createdAt.getTime()),
    updatedAt: new Date(checkpoint.updatedAt.getTime())
  }
}

export function normalizeAuditEvidenceCheckpointFilters(
  filters: AuditEvidenceCheckpointFilters
): AuditEvidenceFilters {
  return {
    ...(filters.sessionId ? { sessionId: filters.sessionId } : {}),
    ...(filters.correlationId ? { correlationId: filters.correlationId } : {}),
    ...(filters.type ? { type: filters.type as AuditEventType } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {})
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((item) => canonicalize(item))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)])
    )
  }
  return value
}
