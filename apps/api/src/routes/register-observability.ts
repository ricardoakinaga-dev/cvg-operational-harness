import {
  createCorrelationId,
  ok,
  toSafeError,
  fail,
  DomainError
} from '@cvg/shared'
import {
  resolveDataPlaneTenant,
  appendPlatformAudit
} from '../server-identity.ts'
import {
  parseAuditEvidenceQuery,
  sanitizeAuditEvidencePage,
  statusCodeForError
} from '../server-query.ts'
import {
  AuditEvidenceCheckpointCreateInputSchema,
  AuditEvidenceCheckpointIdSchema,
  AuditEvidenceCheckpointTransitionInputSchema
} from '@cvg/persistence'
import type { RouteContext } from './context.ts'

export function registerObservabilityRoutes(ctx: RouteContext): void {
  const { app, audit, emitRuntimeLog, requireIdentity } = ctx

  app.get('/v1/observability/audit-evidence', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(request.headers, 'audit:view_full')
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      const evidenceQuery = parseAuditEvidenceQuery(request.query)
      const [summary, page] = await Promise.all([
        audit.summarizeEvidence(evidenceQuery.filters, tenantId),
        audit.listEvidence(evidenceQuery.query, tenantId)
      ])
      emitRuntimeLog({
        event: 'observability.audit_evidence_exported',
        correlationId,
        route: '/v1/observability/audit-evidence',
        status: 'ok',
        sessionId: evidenceQuery.filters.sessionId ?? null,
        resourceId: identity.operatorId
      })
      return ok(
        {
          summary,
          ...sanitizeAuditEvidencePage(page),
          export: {
            format: 'json',
            controlled: true,
            externalDispatch: false,
            requestedBy: identity.operatorId
          }
        },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      emitRuntimeLog({
        event: 'observability.audit_evidence_failed',
        correlationId,
        route: '/v1/observability/audit-evidence',
        status: 'error',
        errorCode: safeError.code
      })
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/observability/audit-evidence/checkpoints',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(request.headers, 'audit:view_full')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const input = AuditEvidenceCheckpointCreateInputSchema.parse(
          request.body
        )
        const checkpoint = await audit.createAuditEvidenceCheckpoint(
          input,
          identity.operatorId,
          tenantId
        )
        await appendPlatformAudit(audit, identity, correlationId, tenantId, {
          event: 'audit_evidence_checkpoint_sealed',
          tenantId,
          checkpointId: checkpoint.id,
          eventIds: checkpoint.eventIds,
          eventCount: checkpoint.eventCount,
          evidenceDigest: checkpoint.evidenceDigest,
          status: checkpoint.status,
          filters: checkpoint.filters
        })
        emitRuntimeLog({
          event: 'observability.audit_evidence_checkpoint_sealed',
          correlationId,
          route: '/v1/observability/audit-evidence/checkpoints',
          status: 'ok',
          sessionId: checkpoint.filters.sessionId ?? null,
          resourceId: checkpoint.id
        })
        return ok({ checkpoint }, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        emitRuntimeLog({
          event: 'observability.audit_evidence_checkpoint_failed',
          correlationId,
          route: '/v1/observability/audit-evidence/checkpoints',
          status: 'error',
          errorCode: safeError.code
        })
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get(
    '/v1/observability/audit-evidence/checkpoints',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(request.headers, 'audit:view_full')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const checkpoints = await audit.listAuditEvidenceCheckpoints(tenantId)
        return ok({ checkpoints }, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get(
    '/v1/observability/audit-evidence/checkpoints/:checkpointId',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(request.headers, 'audit:view_full')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const params = request.params as { checkpointId: string }
        const checkpointId = AuditEvidenceCheckpointIdSchema.parse(
          params.checkpointId
        )
        const checkpoint = await audit.getAuditEvidenceCheckpoint(
          checkpointId,
          tenantId
        )
        if (!checkpoint) {
          throw new DomainError(
            'invalid_action',
            'Audit evidence checkpoint not found'
          )
        }
        return ok({ checkpoint }, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/observability/audit-evidence/checkpoints/:checkpointId/transition',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireIdentity(request.headers, 'audit:view_full')
        const tenantId = resolveDataPlaneTenant(request.headers, identity)
        const params = request.params as { checkpointId: string }
        const checkpointId = AuditEvidenceCheckpointIdSchema.parse(
          params.checkpointId
        )
        const input = AuditEvidenceCheckpointTransitionInputSchema.parse(
          request.body
        )
        const checkpoint = await audit.transitionAuditEvidenceCheckpoint(
          checkpointId,
          input.status,
          identity.operatorId,
          input.expectedStatus,
          tenantId
        )
        if (!checkpoint) {
          throw new DomainError(
            'invalid_action',
            'Audit evidence checkpoint not found'
          )
        }
        await appendPlatformAudit(audit, identity, correlationId, tenantId, {
          event: 'audit_evidence_checkpoint_archived',
          tenantId,
          checkpointId: checkpoint.id,
          eventCount: checkpoint.eventCount,
          evidenceDigest: checkpoint.evidenceDigest,
          status: checkpoint.status,
          filters: checkpoint.filters
        })
        emitRuntimeLog({
          event: 'observability.audit_evidence_checkpoint_archived',
          correlationId,
          route:
            '/v1/observability/audit-evidence/checkpoints/:checkpointId/transition',
          status: 'ok',
          sessionId: checkpoint.filters.sessionId ?? null,
          resourceId: checkpoint.id
        })
        return ok({ checkpoint }, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        emitRuntimeLog({
          event: 'observability.audit_evidence_checkpoint_transition_failed',
          correlationId,
          route:
            '/v1/observability/audit-evidence/checkpoints/:checkpointId/transition',
          status: 'error',
          errorCode: safeError.code
        })
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )
}
