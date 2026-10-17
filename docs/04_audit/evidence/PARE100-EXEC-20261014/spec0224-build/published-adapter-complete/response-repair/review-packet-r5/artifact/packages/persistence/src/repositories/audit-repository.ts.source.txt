import {
  createDomainId,
  DomainError,
  sanitizeAuditEvidencePayload
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import {
  AuditEvidenceCheckpointActorIdSchema,
  AuditEvidenceCheckpointCreateInputSchema,
  AuditEvidenceCheckpointIdSchema,
  AuditEvidenceCheckpointStatusSchema,
  cloneAuditEvidenceCheckpoint,
  computeAuditEvidenceCheckpointDigest,
  createAuditEvidenceCheckpointId,
  normalizeAuditEvidenceCheckpointFilters,
  type AuditEvidenceCheckpointCreateInput,
  type AuditEvidenceCheckpointRecord,
  type AuditEvidenceCheckpointStatus
} from '../audit-evidence-checkpoint.ts'
import type { InMemoryDatabase } from '../db.ts'
import type {
  AuditEventRecord,
  AuditEvidenceFilters,
  AuditEvidencePage,
  AuditEvidenceQuery,
  AuditEvidenceSummary
} from '../schema.ts'

export class AuditRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  append(
    input: Omit<AuditEventRecord, 'id' | 'createdAt'>,
    rawTenantId?: TenantId
  ): AuditEventRecord {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    // AUD19-003: exactly-once approval decisions. A repeated
    // `approval_decision` for the same (tenant, approvalId, decision)
    // converges on the recorded event instead of duplicating it, so route
    // retries after a crash between resume and audit stay consistent.
    if (input.type === 'approval_decision') {
      const replay = this.findApprovalDecision(
        input.payload,
        tenantId ?? input.tenantId
      )
      if (replay) return replay
    }
    const event: AuditEventRecord = {
      ...input,
      ...(tenantId ? { tenantId } : {}),
      payload: sanitizeAuditEvidencePayload(input.payload).payload,
      id: createDomainId('audit'),
      createdAt: new Date()
    }
    this.db.state.auditEvents = [...this.db.state.auditEvents, event]
    return event
  }

  /**
   * AUD19-003 — idempotency read for approval decisions. Matches the
   * Postgres `appendAudit` predicate (tenant, payload approvalId, payload
   * decision) so memory and durable stores converge identically.
   */
  findApprovalDecision(
    payload: unknown,
    tenantId?: TenantId
  ): AuditEventRecord | null {
    if (typeof payload !== 'object' || payload === null) return null
    const record = payload as { approvalId?: unknown; decision?: unknown }
    if (
      typeof record.approvalId !== 'string' ||
      typeof record.decision !== 'string'
    ) {
      return null
    }
    return (
      this.db.state.auditEvents.find(
        (event) =>
          event.type === 'approval_decision' &&
          (!tenantId || this.eventBelongsToTenant(event, tenantId)) &&
          typeof event.payload === 'object' &&
          event.payload !== null &&
          (event.payload as { approvalId?: unknown }).approvalId ===
            record.approvalId &&
          (event.payload as { decision?: unknown }).decision === record.decision
      ) ?? null
    )
  }

  listByCorrelation(
    correlationId: string,
    rawTenantId?: TenantId
  ): AuditEventRecord[] {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    return this.db.state.auditEvents.filter(
      (event) =>
        event.correlationId === correlationId &&
        (!tenantId || this.eventBelongsToTenant(event, tenantId))
    )
  }

  listBySession(sessionId: string, rawTenantId?: TenantId): AuditEventRecord[] {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    return this.db.state.auditEvents.filter((event) => {
      if (!payloadHasSession(event.payload, sessionId)) {
        return false
      }
      return !tenantId || this.eventBelongsToTenant(event, tenantId)
    })
  }

  listEvidence(
    query: AuditEvidenceQuery,
    rawTenantId?: TenantId
  ): AuditEvidencePage {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const filtered = this.filterEvidence(query, tenantId)
    const items = filtered.slice(query.offset, query.offset + query.limit)
    return {
      items,
      pageInfo: {
        limit: query.limit,
        offset: query.offset,
        total: filtered.length,
        hasNextPage: query.offset + items.length < filtered.length
      }
    }
  }

  summarizeEvidence(
    filters: AuditEvidenceFilters = {},
    rawTenantId?: TenantId
  ): AuditEvidenceSummary {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const filtered = this.filterEvidence(filters, tenantId)
    return summarizeAuditEvents(filtered)
  }

  listAuditEventsByIds(
    rawIds: string[],
    rawTenantId?: TenantId
  ): AuditEventRecord[] {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const ids = new Set(rawIds)
    return this.db.state.auditEvents.filter(
      (event) =>
        ids.has(event.id) &&
        (!tenantId || this.eventBelongsToTenant(event, tenantId))
    )
  }

  createAuditEvidenceCheckpoint(
    rawInput: AuditEvidenceCheckpointCreateInput,
    rawCreatedBy: string,
    rawTenantId?: TenantId
  ): AuditEvidenceCheckpointRecord {
    const tenantId = requireCheckpointTenant(rawTenantId)
    const input = AuditEvidenceCheckpointCreateInputSchema.parse(rawInput)
    const createdBy = AuditEvidenceCheckpointActorIdSchema.parse(rawCreatedBy)
    const events = this.listAuditEventsByIds(input.eventIds, tenantId)
    assertCheckpointEvents(input, events, input.eventIds)
    const evidenceDigest = computeAuditEvidenceCheckpointDigest(
      tenantId,
      input,
      events
    )
    if (
      this.db.state.auditEvidenceCheckpoints.some(
        (checkpoint) =>
          checkpoint.tenantId === tenantId &&
          checkpoint.evidenceDigest === evidenceDigest
      )
    ) {
      throw new DomainError(
        'conflict',
        'Audit evidence checkpoint already exists'
      )
    }
    const now = new Date()
    const checkpoint: AuditEvidenceCheckpointRecord = {
      tenantId,
      id: createAuditEvidenceCheckpointId(),
      filters: { ...(input.filters ?? {}) },
      eventIds: [...input.eventIds].sort(),
      eventCount: input.eventIds.length,
      evidenceDigest,
      status: 'SEALED',
      createdBy,
      updatedBy: createdBy,
      createdAt: now,
      updatedAt: now
    }
    this.db.state.auditEvidenceCheckpoints = [
      ...this.db.state.auditEvidenceCheckpoints,
      cloneAuditEvidenceCheckpoint(checkpoint)
    ]
    return cloneAuditEvidenceCheckpoint(checkpoint)
  }

  getAuditEvidenceCheckpoint(
    rawId: string,
    rawTenantId?: TenantId
  ): AuditEvidenceCheckpointRecord | null {
    const tenantId = requireCheckpointTenant(rawTenantId)
    const id = AuditEvidenceCheckpointIdSchema.parse(rawId)
    const checkpoint = this.db.state.auditEvidenceCheckpoints.find(
      (candidate) => candidate.id === id && candidate.tenantId === tenantId
    )
    return checkpoint ? cloneAuditEvidenceCheckpoint(checkpoint) : null
  }

  listAuditEvidenceCheckpoints(
    rawTenantId?: TenantId
  ): AuditEvidenceCheckpointRecord[] {
    const tenantId = requireCheckpointTenant(rawTenantId)
    return this.db.state.auditEvidenceCheckpoints
      .filter((checkpoint) => checkpoint.tenantId === tenantId)
      .sort(
        (left, right) => right.createdAt.getTime() - left.createdAt.getTime()
      )
      .map(cloneAuditEvidenceCheckpoint)
  }

  transitionAuditEvidenceCheckpoint(
    rawId: string,
    rawStatus: AuditEvidenceCheckpointStatus,
    rawUpdatedBy: string,
    rawExpectedStatus: AuditEvidenceCheckpointStatus,
    rawTenantId?: TenantId
  ): AuditEvidenceCheckpointRecord | null {
    const tenantId = requireCheckpointTenant(rawTenantId)
    const id = AuditEvidenceCheckpointIdSchema.parse(rawId)
    const status = AuditEvidenceCheckpointStatusSchema.parse(rawStatus)
    const expectedStatus =
      AuditEvidenceCheckpointStatusSchema.parse(rawExpectedStatus)
    const updatedBy = AuditEvidenceCheckpointActorIdSchema.parse(rawUpdatedBy)
    const current = this.db.state.auditEvidenceCheckpoints.find(
      (candidate) => candidate.id === id && candidate.tenantId === tenantId
    )
    if (!current) return null
    if (current.status !== expectedStatus) {
      throw new DomainError(
        'conflict',
        `Audit evidence checkpoint status is ${current.status}, expected ${expectedStatus}`
      )
    }
    if (current.status !== 'SEALED' || status !== 'ARCHIVED') {
      throw new DomainError(
        'invalid_action',
        'Audit evidence checkpoint transition is not allowed'
      )
    }
    const updated: AuditEvidenceCheckpointRecord = {
      ...current,
      status,
      updatedBy,
      updatedAt: new Date()
    }
    this.db.state.auditEvidenceCheckpoints =
      this.db.state.auditEvidenceCheckpoints.map((candidate) =>
        candidate.id === id && candidate.tenantId === tenantId
          ? cloneAuditEvidenceCheckpoint(updated)
          : candidate
      )
    return cloneAuditEvidenceCheckpoint(updated)
  }

  private filterEvidence(
    filters: AuditEvidenceFilters,
    tenantId?: TenantId
  ): AuditEventRecord[] {
    return this.db.state.auditEvents.filter(
      (event) =>
        auditEventMatches(event, filters) &&
        (!tenantId || this.eventBelongsToTenant(event, tenantId))
    )
  }

  private eventBelongsToTenant(
    event: AuditEventRecord,
    tenantId: TenantId
  ): boolean {
    return event.tenantId === tenantId
  }
}

function requireCheckpointTenant(rawTenantId?: TenantId): TenantId {
  const parsed = TenantIdSchema.safeParse(rawTenantId)
  if (!parsed.success) {
    throw new DomainError('unauthorized', 'Tenant scope is required')
  }
  return parsed.data
}

function assertCheckpointEvents(
  input: AuditEvidenceCheckpointCreateInput,
  events: AuditEventRecord[],
  requestedIds: string[]
): void {
  if (events.length !== requestedIds.length) {
    throw new DomainError(
      'invalid_action',
      'All audit evidence events must exist in the tenant scope'
    )
  }
  const filters = normalizeAuditEvidenceCheckpointFilters(input.filters ?? {})
  if (events.some((event) => !auditEventMatches(event, filters))) {
    throw new DomainError(
      'invalid_action',
      'All audit evidence events must match the checkpoint filters'
    )
  }
}

export function summarizeAuditEvents(
  events: AuditEventRecord[]
): AuditEvidenceSummary {
  return events.reduce<AuditEvidenceSummary>(
    (summary, event) => {
      const sessionId = readPayloadSessionId(event.payload)
      return {
        totalEvents: summary.totalEvents + 1,
        byType: {
          ...summary.byType,
          [event.type]: (summary.byType[event.type] ?? 0) + 1
        },
        byActorType: {
          ...summary.byActorType,
          [event.actorType]: (summary.byActorType[event.actorType] ?? 0) + 1
        },
        byCorrelationId: {
          ...summary.byCorrelationId,
          [event.correlationId]:
            (summary.byCorrelationId[event.correlationId] ?? 0) + 1
        },
        bySessionId: sessionId
          ? {
              ...summary.bySessionId,
              [sessionId]: (summary.bySessionId[sessionId] ?? 0) + 1
            }
          : summary.bySessionId
      }
    },
    {
      totalEvents: 0,
      byType: {},
      byActorType: {},
      byCorrelationId: {},
      bySessionId: {}
    }
  )
}

export function auditEventMatches(
  event: AuditEventRecord,
  filters: AuditEvidenceFilters
): boolean {
  if (filters.sessionId && !payloadHasSession(event.payload, filters.sessionId))
    return false
  if (filters.correlationId && event.correlationId !== filters.correlationId)
    return false
  if (filters.type && event.type !== filters.type) return false
  if (filters.actorId && event.actorId !== filters.actorId) return false
  return true
}

function payloadHasSession(payload: unknown, sessionId: string): boolean {
  return readPayloadSessionId(payload) === sessionId
}

function readPayloadSessionId(payload: unknown): string | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('sessionId' in payload)
  ) {
    return null
  }
  const sessionId = payload.sessionId
  return typeof sessionId === 'string' ? sessionId : null
}
