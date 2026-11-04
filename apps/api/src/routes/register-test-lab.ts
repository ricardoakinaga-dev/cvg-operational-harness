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
  TestLabRequestSchema,
  TestLabEvaluationRequestSchema
} from '../server-schemas.ts'
import {
  runTestLab,
  TestSuiteCreateInputSchema,
  AgentIdSchema,
  TestSuiteIdSchema,
  TestSuiteCloneInputSchema,
  AgentVersionIdSchema,
  type TestSuiteVariantResult,
  evaluateTestLabSuite
} from '@cvg/platform'
import { statusCodeForError, parseTraceLimit } from '../server-query.ts'
import { z } from 'zod'
import {
  evaluateTestSuiteVariant,
  recordSuiteRun
} from '../server-capability.ts'
import type { RouteContext } from './context.ts'

export function registerTestLabRoutes(ctx: RouteContext): void {
  const {
    app,
    audit,
    emitRuntimeLog,
    operatorIdentityResolver,
    options,
    platform
  } = ctx

  app.post('/v1/admin/test-lab/runs', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const body = TestLabRequestSchema.parse(request.body)
      const trace = await runTestLab({
        store: platform,
        tenantId: scope.tenantId,
        agentId: body.agentId,
        versionId: body.versionId,
        message: body.message,
        history: body.history,
        ...(options.resolveApprovedKnowledge
          ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
          : {}),
        ...(body.approvedKnowledge && !options.resolveApprovedKnowledge
          ? { approvedKnowledge: body.approvedKnowledge }
          : {})
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
          event: 'test_lab_completed',
          tenantId: scope.tenantId,
          agentId: trace.agentId,
          versionId: trace.versionId,
          traceId: trace.traceId,
          externalCall: trace.provider.externalCall
        }
      )
      emitRuntimeLog({
        event: 'platform.test_lab_completed',
        correlationId,
        route: '/v1/admin/test-lab/runs',
        status: 'ok',
        resourceId: trace.traceId
      })
      return ok(trace, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/admin/test-lab/suites', async (request, reply) => {
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
      const suite = await platform.createTestSuite(
        scope,
        TestSuiteCreateInputSchema.parse(request.body),
        identity.operatorId
      )
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'test_suite_created',
          tenantId: scope.tenantId,
          suiteId: suite.id,
          agentId: suite.agentId,
          versionId: suite.versionId,
          version: suite.version
        }
      )
      return ok(suite, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/test-lab/suites', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const query = z
        .object({ agentId: AgentIdSchema })
        .strict()
        .parse(request.query)
      return ok(
        await platform.listTestSuites(scope, query.agentId),
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post(
    '/v1/admin/test-lab/suites/:suiteId/clone',
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
          .object({ suiteId: TestSuiteIdSchema })
          .strict()
          .parse(request.params)
        return ok(
          await platform.cloneTestSuite(
            scope,
            params.suiteId,
            TestSuiteCloneInputSchema.parse(request.body),
            identity.operatorId
          ),
          correlationId
        )
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/test-lab/suites/:suiteId/evaluate',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'test:run',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = z
          .object({ suiteId: TestSuiteIdSchema })
          .strict()
          .parse(request.params)
        const body = z
          .object({ versionId: AgentVersionIdSchema.optional() })
          .strict()
          .parse(request.body)
        const suite = await platform.getTestSuite(scope, params.suiteId)
        if (!suite)
          throw new DomainError('invalid_action', 'Test suite not found')
        const versionId = body.versionId ?? suite.versionId
        const variant = await evaluateTestSuiteVariant({
          store: platform,
          tenantId: scope.tenantId,
          agentId: suite.agentId,
          versionId,
          cases: suite.cases,
          label: 'A',
          ...(options.resolveApprovedKnowledge
            ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
            : {})
        })
        const run = await recordSuiteRun({
          platform,
          scope,
          suite,
          variants: [variant],
          createdBy: identity.operatorId
        })
        return ok(run, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/test-lab/suites/:suiteId/compare',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'test:run',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = z
          .object({ suiteId: TestSuiteIdSchema })
          .strict()
          .parse(request.params)
        const body = z
          .object({
            versionAId: AgentVersionIdSchema,
            versionBId: AgentVersionIdSchema
          })
          .strict()
          .parse(request.body)
        const suite = await platform.getTestSuite(scope, params.suiteId)
        if (!suite)
          throw new DomainError('invalid_action', 'Test suite not found')
        const variants: TestSuiteVariantResult[] = await Promise.all([
          evaluateTestSuiteVariant({
            store: platform,
            tenantId: scope.tenantId,
            agentId: suite.agentId,
            versionId: body.versionAId,
            cases: suite.cases,
            label: 'A',
            ...(options.resolveApprovedKnowledge
              ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
              : {})
          }),
          evaluateTestSuiteVariant({
            store: platform,
            tenantId: scope.tenantId,
            agentId: suite.agentId,
            versionId: body.versionBId,
            cases: suite.cases,
            label: 'B',
            ...(options.resolveApprovedKnowledge
              ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
              : {})
          })
        ])
        return ok(
          await recordSuiteRun({
            platform,
            scope,
            suite,
            variants,
            createdBy: identity.operatorId
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

  app.get('/v1/admin/test-lab/suites/:suiteId/runs', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const params = z
        .object({ suiteId: TestSuiteIdSchema })
        .strict()
        .parse(request.params)
      const limit = parseTraceLimit(request.query)
      const items = await platform.listTestSuiteRuns(
        scope,
        params.suiteId,
        limit
      )
      return ok(
        {
          items,
          pageInfo: {
            limit,
            offset: 0,
            total: items.length,
            hasNextPage: false
          }
        },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/test-lab/runs', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const limit = parseTraceLimit(request.query)
      const items = await platform.listTestRuns(scope, limit)
      return ok(
        {
          items,
          pageInfo: {
            limit,
            offset: 0,
            total: items.length,
            hasNextPage: false
          }
        },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get('/v1/admin/execution-traces', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'audit:view_full',
        operatorIdentityResolver
      )
      const limit = parseTraceLimit(request.query)
      const items = await platform.listExecutionTraces(scope, limit)
      return ok(
        {
          items,
          pageInfo: {
            limit,
            offset: 0,
            total: items.length,
            hasNextPage: false
          }
        },
        correlationId
      )
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.post('/v1/admin/test-lab/evaluate', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'test:run',
        operatorIdentityResolver
      )
      const body = TestLabEvaluationRequestSchema.parse(request.body)
      const result = await evaluateTestLabSuite({
        store: platform,
        tenantId: scope.tenantId,
        agentId: body.agentId,
        versionId: body.versionId,
        cases: body.cases,
        ...(options.resolveApprovedKnowledge
          ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
          : {})
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
          event: 'test_lab_evaluated',
          tenantId: scope.tenantId,
          agentId: body.agentId,
          versionId: body.versionId,
          caseCount: result.results.length,
          passed: result.passed
        }
      )
      return ok(result, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })
}
