/**
 * LEGACY CONTENT — HTTP routes of the Esmeralda V2 tutor/pet/appointment
 * journeys, moved from apps/api/src/server.ts by SPEC-LEGACY-004 (PR-L04),
 * slice 2. The route bodies are byte-for-byte the former ones; the API passes
 * its identity, tenant and error helpers in through the composition point.
 */
import type { FastifyInstance } from 'fastify'
import type { TenantId } from '@cvg/platform'
import {
  DomainError,
  createCorrelationId,
  fail,
  ok,
  toSafeError,
  type OperatorIdentity
} from '@cvg/shared'
import type {
  JourneyRepository,
  JourneyRepositoryPort
} from './memory-repository.ts'

export interface SecretaryJourneyRouteDependencies {
  journeys: JourneyRepositoryPort | null
  requireIdentity: (
    headers: Record<string, unknown>,
    permission: string
  ) => OperatorIdentity
  requireAuthenticatedMutations: boolean
  resolveDataPlaneTenant: (
    headers: Record<string, unknown>,
    identity: OperatorIdentity
  ) => TenantId
  resolveOptionalRequestTenant: (headers: Record<string, unknown>) => TenantId
  statusCodeForError: (code: string) => number
}

export function registerSecretaryJourneyRoutes(
  app: FastifyInstance,
  dependencies: SecretaryJourneyRouteDependencies
): void {
  const {
    journeys,
    requireIdentity,
    requireAuthenticatedMutations,
    resolveDataPlaneTenant,
    resolveOptionalRequestTenant,
    statusCodeForError
  } = dependencies

  app.get('/v1/journeys/owners/search', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      const query = request.query as { phone?: unknown }
      return ok(
        { matches: await journeys.searchOwnerByPhone(tenantId, query.phone) },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/journeys/patients/search', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      const query = request.query as {
        ownerDraftId?: string
        ownerCandidateId?: string
        name?: string
      }
      return ok(
        {
          matches: await journeys.searchPatient({
            tenantId,
            ...(query.ownerDraftId ? { ownerDraftId: query.ownerDraftId } : {}),
            ...(query.ownerCandidateId
              ? { ownerCandidateId: query.ownerCandidateId }
              : {}),
            ...(query.name ? { name: query.name } : {})
          })
        },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/journeys/owner-drafts', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireAuthenticatedMutations
        ? requireIdentity(request.headers, 'conversation:update')
        : null
      const tenantId = identity
        ? resolveDataPlaneTenant(request.headers, identity)
        : resolveOptionalRequestTenant(request.headers)
      if (!tenantId)
        throw new DomainError('unauthorized', 'Tenant scope is required')
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      const draft = await journeys.createOwnerDraft({
        ...(request.body as Record<string, unknown>),
        tenantId,
        auditContext: journeyAuditContext(identity, correlationId)
      } as Parameters<JourneyRepository['createOwnerDraft']>[0])
      return ok(draft, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/journeys/owner-drafts', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      return ok(
        await Promise.resolve(journeys.listOwnerDrafts(tenantId)),
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/journeys/patient-drafts', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireAuthenticatedMutations
        ? requireIdentity(request.headers, 'conversation:update')
        : null
      const tenantId = identity
        ? resolveDataPlaneTenant(request.headers, identity)
        : resolveOptionalRequestTenant(request.headers)
      if (!tenantId)
        throw new DomainError('unauthorized', 'Tenant scope is required')
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      const draft = await journeys.createPatientDraft({
        ...(request.body as Record<string, unknown>),
        tenantId,
        auditContext: journeyAuditContext(identity, correlationId)
      } as Parameters<JourneyRepository['createPatientDraft']>[0])
      return ok(draft, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/journeys/patient-drafts', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      return ok(
        { drafts: await journeys.listPatientDrafts(tenantId) },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/journeys/patient-drafts/:draftId/link',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const identity = requireAuthenticatedMutations
          ? requireIdentity(request.headers, 'conversation:update')
          : null
        const tenantId = identity
          ? resolveDataPlaneTenant(request.headers, identity)
          : resolveOptionalRequestTenant(request.headers)
        if (!tenantId)
          throw new DomainError('unauthorized', 'Tenant scope is required')
        if (!journeys)
          throw new DomainError(
            'invalid_action',
            'Journey persistence is unavailable in this mode'
          )
        const body = request.body as { candidateId?: unknown }
        if (typeof body.candidateId !== 'string')
          throw new DomainError('validation_failed', 'candidateId is required')
        return ok(
          await journeys.linkPatient({
            tenantId,
            patientDraftId: (request.params as { draftId: string }).draftId,
            candidateId: body.candidateId,
            auditContext: journeyAuditContext(identity, correlationId)
          }),
          correlationId
        )
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get('/v1/journeys/slots', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      return ok(
        { slots: await journeys.findAvailableSlots(tenantId) },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/journeys/appointment-drafts', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireAuthenticatedMutations
        ? requireIdentity(request.headers, 'conversation:update')
        : null
      const tenantId = identity
        ? resolveDataPlaneTenant(request.headers, identity)
        : resolveOptionalRequestTenant(request.headers)
      if (!tenantId)
        throw new DomainError('unauthorized', 'Tenant scope is required')
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      return ok(
        await journeys.createAppointmentDraft({
          ...(request.body as Record<string, unknown>),
          tenantId,
          auditContext: journeyAuditContext(identity, correlationId)
        } as Parameters<JourneyRepository['createAppointmentDraft']>[0]),
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/journeys/appointment-drafts', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireIdentity(
        request.headers,
        'conversation:view_assigned'
      )
      const tenantId = resolveDataPlaneTenant(request.headers, identity)
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      return ok(
        { drafts: await journeys.listAppointmentDrafts(tenantId) },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/journeys/tasks', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const identity = requireAuthenticatedMutations
        ? requireIdentity(request.headers, 'task:update')
        : null
      const tenantId = identity
        ? resolveDataPlaneTenant(request.headers, identity)
        : resolveOptionalRequestTenant(request.headers)
      if (!tenantId)
        throw new DomainError('unauthorized', 'Tenant scope is required')
      if (!journeys)
        throw new DomainError(
          'invalid_action',
          'Journey persistence is unavailable in this mode'
        )
      const body = request.body as Record<string, unknown>
      const task = await journeys.createJourneyTask({
        ...(body as Parameters<JourneyRepository['createJourneyTask']>[0]),
        tenantId,
        auditContext: journeyAuditContext(identity, correlationId)
      } as Parameters<JourneyRepository['createJourneyTask']>[0])
      return ok(task, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })
}

function journeyAuditContext(
  identity: OperatorIdentity | null,
  correlationId: string
): {
  actorType: 'Operator' | 'System'
  actorId: string
  correlationId: string
} {
  if (!identity) {
    return {
      actorType: 'System',
      actorId: 'system.journey-repository',
      correlationId
    }
  }
  return {
    actorType: 'Operator',
    actorId: identity.operatorId,
    correlationId
  }
}
