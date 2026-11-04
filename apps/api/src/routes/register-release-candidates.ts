import {
  createCorrelationId,
  ok,
  toSafeError,
  fail,
  DomainError
} from '@cvg/shared'
import {
  requirePlatformScope,
  resolveOperatorIdentity,
  appendPlatformAudit
} from '../server-identity.ts'
import {
  ReleaseCandidateCreateInputSchema,
  AgentIdSchema,
  ReleaseCandidateIdSchema,
  ReleaseCandidateTransitionInputSchema
} from '@cvg/platform'
import { statusCodeForError } from '../server-query.ts'
import { z } from 'zod'
import type { RouteContext } from './context.ts'

export function registerReleaseCandidatesRoutes(ctx: RouteContext): void {
  const { app, audit, operatorIdentityResolver, platform } = ctx

  app.post('/v1/admin/release-candidates', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const candidate = await platform.createReleaseCandidate(
        scope,
        ReleaseCandidateCreateInputSchema.parse(request.body),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'release_candidate_created',
          tenantId: scope.tenantId,
          releaseCandidateId: candidate.id,
          agentId: candidate.agentId,
          versionId: candidate.versionId,
          evidenceDigest: candidate.evidenceDigest,
          status: candidate.status,
          gateKeys: candidate.gateResults.map((gate) => gate.key)
        }
      )
      return ok(candidate, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/release-candidates', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const query = z
        .object({ agentId: AgentIdSchema })
        .strict()
        .parse(request.query)
      return ok(
        await platform.listReleaseCandidates(scope, query.agentId),
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get(
    '/v1/admin/release-candidates/:candidateId',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const params = z
          .object({ candidateId: ReleaseCandidateIdSchema })
          .strict()
          .parse(request.params)
        const candidate = await platform.getReleaseCandidate(
          scope,
          params.candidateId
        )
        if (!candidate) {
          throw new DomainError('invalid_action', 'Release candidate not found')
        }
        return ok(candidate, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/release-candidates/:candidateId/transition',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = z
          .object({ candidateId: ReleaseCandidateIdSchema })
          .strict()
          .parse(request.params)
        const body = ReleaseCandidateTransitionInputSchema.parse(request.body)
        const candidate = await platform.transitionReleaseCandidate(
          scope,
          params.candidateId,
          body.target,
          identity.operatorId,
          body.expectedStatus
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'release_candidate_transitioned',
            tenantId: scope.tenantId,
            releaseCandidateId: candidate.id,
            agentId: candidate.agentId,
            versionId: candidate.versionId,
            evidenceDigest: candidate.evidenceDigest,
            status: candidate.status,
            gateKeys: candidate.gateResults.map((gate) => gate.key)
          }
        )
        return ok(candidate, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )
}
