/**
 * LEGACY CONTENT — HTTP routes of the Esmeralda V2 tutor/pet/appointment
 * journeys, moved from apps/api/src/server.ts by SPEC-LEGACY-004 (PR-L04),
 * slice 2. The route bodies are byte-for-byte the former ones, except
 * `POST /v1/journeys/tasks`, which SPEC0251 puts behind the case authority
 * injected by the API; the API passes its identity, tenant, case and error
 * helpers in through the composition point.
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
  /**
   * SPEC0251 §4.3 — case precondition of a journey task: the operator must
   * be able to act on the session's case (404 otherwise). Injected by the API.
   */
  authorizeTaskSession: (
    identity: OperatorIdentity,
    tenantId: TenantId,
    sessionId: string
  ) => Promise<void>
  /**
   * SPEC0251 I7 — error mapping of the journey task route: the case branch
   * ahead of the API's generic mapping, with the HTTP status. Injected by the API.
   */
  toSafeTaskError: (error: unknown) => {
    status: number
    code: string
    message: string
  }
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
    statusCodeForError,
    authorizeTaskSession,
    toSafeTaskError
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
      const body = request.body
      // SPEC0251 §4.3: the session id follows CreateInternalTaskSchema
      // (string of 1 to 160 characters) and is validated before the case.
      const sessionId =
        typeof body === 'object' && body !== null && !Array.isArray(body)
          ? (body as Record<string, unknown>).sessionId
          : undefined
      if (
        typeof sessionId !== 'string' ||
        sessionId.length < 1 ||
        sessionId.length > 160
      ) {
        throw new DomainError(
          'validation_failed',
          'Journey task session is invalid'
        )
      }
      if (identity) await authorizeTaskSession(identity, tenantId, sessionId)
      const task = await journeys.createJourneyTask({
        ...(body as Parameters<JourneyRepository['createJourneyTask']>[0]),
        tenantId,
        auditContext: journeyAuditContext(identity, correlationId)
      } as Parameters<JourneyRepository['createJourneyTask']>[0])
      reply.header('cache-control', 'no-store')
      return ok(task, correlationId)
    } catch (error) {
      const safeError = toSafeTaskError(error)
      reply.code(safeError.status).header('cache-control', 'no-store')
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
