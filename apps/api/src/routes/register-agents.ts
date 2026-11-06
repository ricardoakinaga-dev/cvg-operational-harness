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
import { statusCodeForError } from '../server-query.ts'
import {
  AgentIdSchema,
  AgentConfigSchema,
  AgentVersionIdSchema,
  assertPromptProfileClone,
  AgentVersionStatusSchema,
  runCriticalSafetyPreflight,
  ReleaseCandidateIdSchema,
  assertReleaseCandidatePublishAuthority
} from '@cvg/platform'
import { VersionCloneRequestSchema } from '../server-schemas.ts'
import { z } from 'zod'
import type { RouteContext } from './context.ts'

export function registerAgentsRoutes(ctx: RouteContext): void {
  const { app, audit, emitRuntimeLog, operatorIdentityResolver, platform } = ctx

  app.post('/v1/admin/agents', async (request, reply) => {
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
      const agent = await platform.createAgent(
        { tenantId: scope.tenantId },
        request.body as { slug: string; name: string; description: string }
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'agent_created',
          tenantId: scope.tenantId,
          agentId: agent.id
        }
      )
      emitRuntimeLog({
        event: 'platform.agent_created',
        correlationId,
        route: '/v1/admin/agents',
        status: 'ok',
        resourceId: agent.id
      })
      return ok(agent, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/agents', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:view',
        operatorIdentityResolver
      )
      return ok(await platform.listAgents(scope), correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/admin/agents/:agentId/versions', async (request, reply) => {
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
      const params = request.params as { agentId: string }
      const agentId = AgentIdSchema.parse(params.agentId)
      const body = request.body as { config?: unknown }
      const version = await platform.createVersion(
        scope,
        agentId,
        AgentConfigSchema.parse(body.config),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'version_created',
          tenantId: scope.tenantId,
          agentId,
          versionId: version.id,
          version: version.version
        }
      )
      return ok(version, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/agents/:agentId/versions/:versionId/clone',
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
        const params = request.params as {
          agentId: string
          versionId: string
        }
        const agentId = AgentIdSchema.parse(params.agentId)
        const versionId = AgentVersionIdSchema.parse(params.versionId)
        const source = await platform.getVersion(scope, versionId)
        if (!source || source.agentId !== agentId) {
          throw new DomainError('invalid_action', 'Agent version not found')
        }
        const body = VersionCloneRequestSchema.parse(request.body)
        if (body.config) {
          assertPromptProfileClone(source.config, body.config)
        }
        const version = await platform.createVersion(
          scope,
          agentId,
          body.config ?? source.config,
          identity.operatorId
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_cloned',
            tenantId: scope.tenantId,
            agentId,
            sourceVersionId: source.id,
            versionId: version.id,
            version: version.version
          }
        )
        return ok(version, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.get('/v1/admin/agents/:agentId/versions', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:view',
        operatorIdentityResolver
      )
      const params = request.params as { agentId: string }
      const agentId = AgentIdSchema.parse(params.agentId)
      return ok(await platform.listVersions(scope, agentId), correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/agents/:agentId/versions/:versionId/transition',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const params = request.params as {
          agentId: string
          versionId: string
        }
        const agentId = AgentIdSchema.parse(params.agentId)
        const versionId = AgentVersionIdSchema.parse(params.versionId)
        const body = z
          .object({
            target: AgentVersionStatusSchema,
            expectedStatus: AgentVersionStatusSchema.optional()
          })
          .strict()
          .parse(request.body)
        const version = await platform.getVersion(scope, versionId)
        if (!version || version.agentId !== agentId) {
          throw new DomainError('invalid_action', 'Agent version not found')
        }
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const updated = await platform.transitionVersion(
          scope,
          versionId,
          body.target,
          body.expectedStatus
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_transitioned',
            tenantId: scope.tenantId,
            agentId,
            versionId,
            target: updated.status
          }
        )
        return ok(updated, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/agents/:agentId/versions/:versionId/publish-preflight',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const params = request.params as {
          agentId: string
          versionId: string
        }
        const agentId = AgentIdSchema.parse(params.agentId)
        const versionId = AgentVersionIdSchema.parse(params.versionId)
        const version = await platform.getVersion(scope, versionId)
        if (!version || version.agentId !== agentId) {
          throw new DomainError('invalid_action', 'Agent version not found')
        }
        z.object({})
          .strict()
          .parse(request.body ?? {})
        const report = await runCriticalSafetyPreflight({
          store: platform,
          tenantId: scope.tenantId,
          agentId,
          versionId
        })
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_publish_preflight',
            tenantId: scope.tenantId,
            agentId,
            versionId,
            passed: report.passed,
            caseCount: report.caseCount,
            externalCall: report.externalCall,
            failedCaseIds: report.failures.map((failure) => failure.caseId)
          }
        )
        return ok(report, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/agents/:agentId/versions/:versionId/publish',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'agent:configure',
          operatorIdentityResolver
        )
        const params = request.params as {
          agentId: string
          versionId: string
        }
        const agentId = AgentIdSchema.parse(params.agentId)
        const versionId = AgentVersionIdSchema.parse(params.versionId)
        const version = await platform.getVersion(scope, versionId)
        if (!version || version.agentId !== agentId) {
          throw new DomainError('invalid_action', 'Agent version not found')
        }
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const body = z
          .object({
            releaseCandidateId: ReleaseCandidateIdSchema,
            expectedStatus: AgentVersionStatusSchema.optional()
          })
          .strict()
          .parse(request.body ?? {})
        const releaseCandidate = await platform.getReleaseCandidate(
          scope,
          body.releaseCandidateId
        )
        assertReleaseCandidatePublishAuthority({
          candidate: releaseCandidate,
          tenantId: scope.tenantId,
          agentId,
          versionId
        })
        const preflight = await runCriticalSafetyPreflight({
          store: platform,
          tenantId: scope.tenantId,
          agentId,
          versionId
        })
        if (!preflight.passed) {
          await appendPlatformAudit(
            audit,
            identity,
            correlationId,
            scope.tenantId,
            {
              event: 'version_publish_preflight_failed',
              tenantId: scope.tenantId,
              agentId,
              versionId,
              caseCount: preflight.caseCount,
              externalCall: preflight.externalCall,
              failedCaseIds: preflight.failures.map((failure) => failure.caseId)
            }
          )
          throw new DomainError(
            'invalid_action',
            'Critical safety preflight failed; version was not published'
          )
        }
        const published = await platform.publishVersion(
          scope,
          versionId,
          body.releaseCandidateId,
          body.expectedStatus
        )
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_published',
            tenantId: scope.tenantId,
            agentId,
            versionId: published.id,
            version: published.version,
            safetyPreflight: {
              passed: preflight.passed,
              caseCount: preflight.caseCount
            }
          }
        )
        return ok(published, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post('/v1/admin/agents/:agentId/rollback', async (request, reply) => {
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
      const params = request.params as { agentId: string }
      const agentId = AgentIdSchema.parse(params.agentId)
      const body = z
        .object({
          versionId: AgentVersionIdSchema,
          releaseCandidateId: ReleaseCandidateIdSchema,
          expectedStatus: AgentVersionStatusSchema.optional()
        })
        .strict()
        .parse(request.body)
      const versionId = body.versionId
      const source = await platform.getVersion(scope, versionId)
      if (!source || source.agentId !== agentId) {
        throw new DomainError('invalid_action', 'Agent version not found')
      }
      const releaseCandidate = await platform.getReleaseCandidate(
        scope,
        body.releaseCandidateId
      )
      assertReleaseCandidatePublishAuthority({
        candidate: releaseCandidate,
        tenantId: scope.tenantId,
        agentId,
        versionId
      })
      const preflight = await runCriticalSafetyPreflight({
        store: platform,
        tenantId: scope.tenantId,
        agentId,
        versionId
      })
      if (!preflight.passed) {
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'version_rollback_preflight_failed',
            tenantId: scope.tenantId,
            agentId,
            sourceVersionId: versionId,
            caseCount: preflight.caseCount,
            externalCall: preflight.externalCall,
            failedCaseIds: preflight.failures.map((failure) => failure.caseId)
          }
        )
        throw new DomainError(
          'invalid_action',
          'Critical safety preflight failed; rollback was not published'
        )
      }
      const version = await platform.rollback(
        scope,
        agentId,
        versionId,
        identity.operatorId,
        body.releaseCandidateId,
        body.expectedStatus
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'version_rollback',
          tenantId: scope.tenantId,
          agentId,
          sourceVersionId: versionId,
          publishedVersionId: version.id,
          version: version.version,
          safetyPreflight: {
            passed: preflight.passed,
            caseCount: preflight.caseCount
          }
        }
      )
      return ok(version, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })
}
