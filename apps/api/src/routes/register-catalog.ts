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
  PluginCatalogCreateInputSchema,
  PluginCatalogIdSchema,
  PluginCatalogTransitionInputSchema,
  KnowledgeSourceCreateInputSchema,
  KnowledgeSourceIdSchema,
  KnowledgeSourceTransitionInputSchema
} from '@cvg/platform'
import { statusCodeForError } from '../server-query.ts'
import { z } from 'zod'
import type { RouteContext } from './context.ts'

export function registerCatalogRoutes(ctx: RouteContext): void {
  const { app, audit, operatorIdentityResolver, platform } = ctx

  app.post('/v1/admin/plugins/catalog', async (request, reply) => {
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
      const entry = await platform.createPluginCatalogEntry(
        scope,
        PluginCatalogCreateInputSchema.parse(request.body),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'plugin_catalog_created',
          tenantId: scope.tenantId,
          pluginCatalogId: entry.id,
          pluginName: entry.manifest.name,
          pluginVersion: entry.manifest.version,
          status: entry.status
        }
      )
      return ok(entry, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/plugins/catalog', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const query = z
        .object({
          name: z
            .string()
            .trim()
            .min(1)
            .max(120)
            .regex(/^[A-Za-z0-9._:-]+$/)
            .optional()
        })
        .strict()
        .parse(request.query)
      return ok(
        await platform.listPluginCatalogEntries(scope, query.name),
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/plugins/catalog/:pluginId', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const params = z
        .object({ pluginId: PluginCatalogIdSchema })
        .strict()
        .parse(request.params)
      const entry = await platform.getPluginCatalogEntry(scope, params.pluginId)
      if (!entry) {
        throw new DomainError(
          'invalid_action',
          'Plugin catalog entry not found'
        )
      }
      return ok(entry, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/plugins/catalog/:pluginId/transition',
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
          .object({ pluginId: PluginCatalogIdSchema })
          .strict()
          .parse(request.params)
        const body = PluginCatalogTransitionInputSchema.parse(request.body)
        const entry = await platform.transitionPluginCatalogEntry(
          scope,
          params.pluginId,
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
            event: 'plugin_catalog_transitioned',
            tenantId: scope.tenantId,
            pluginCatalogId: entry.id,
            pluginName: entry.manifest.name,
            pluginVersion: entry.manifest.version,
            status: entry.status
          }
        )
        return ok(entry, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post('/v1/admin/knowledge-sources', async (request, reply) => {
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
      const source = await platform.createKnowledgeSource(
        scope,
        KnowledgeSourceCreateInputSchema.parse(request.body),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'knowledge_source_created',
          tenantId: scope.tenantId,
          knowledgeSourceId: source.id,
          source: source.source,
          version: source.version,
          status: source.status
        }
      )
      return ok(source, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/knowledge-sources', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      return ok(await platform.listKnowledgeSources(scope), correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/knowledge-sources/:sourceId', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'agent:configure',
        operatorIdentityResolver
      )
      const params = z
        .object({ sourceId: KnowledgeSourceIdSchema })
        .strict()
        .parse(request.params)
      const source = await platform.getKnowledgeSource(scope, params.sourceId)
      if (!source) {
        throw new DomainError('invalid_action', 'Knowledge source not found')
      }
      return ok(source, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/knowledge-sources/:sourceId/transition',
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
          .object({ sourceId: KnowledgeSourceIdSchema })
          .strict()
          .parse(request.params)
        const body = KnowledgeSourceTransitionInputSchema.parse(request.body)
        const source = await platform.transitionKnowledgeSource(
          scope,
          params.sourceId,
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
            event: 'knowledge_source_transitioned',
            tenantId: scope.tenantId,
            knowledgeSourceId: source.id,
            source: source.source,
            version: source.version,
            status: source.status
          }
        )
        return ok(source, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )
}
