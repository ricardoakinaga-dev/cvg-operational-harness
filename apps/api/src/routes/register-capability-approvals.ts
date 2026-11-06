import {
  createCorrelationId,
  DomainError,
  redactSensitiveText,
  ok,
  toSafeError,
  fail
} from '@cvg/shared'
import {
  requirePlatformScope,
  resolveOperatorIdentity,
  appendPlatformAudit,
  capabilityApprovalReference
} from '../server-identity.ts'
import {
  CapabilityApprovalIssueRequestSchema,
  CapabilityApprovalParamsSchema,
  CapabilityApprovalExecutionRequestSchema
} from '../server-schemas.ts'
import { statusCodeForError } from '../server-query.ts'
import { type AgentExecutionActor, executeConfiguredAgent } from '@cvg/platform'
import type { RouteContext } from './context.ts'

export function registerCapabilityApprovalsRoutes(ctx: RouteContext): void {
  const {
    agentRuntime,
    app,
    audit,
    capabilityApprovalAuthority,
    fallbackCapabilityGateway,
    operatorIdentityResolver,
    options,
    platform
  } = ctx

  app.post('/v1/admin/capability-approvals', async (request, reply) => {
    const correlationId = createCorrelationId()
    try {
      const scope = requirePlatformScope(
        request.headers,
        'approval:decide',
        operatorIdentityResolver
      )
      const identity = resolveOperatorIdentity(
        request.headers,
        operatorIdentityResolver
      )
      const body = CapabilityApprovalIssueRequestSchema.parse(request.body)
      const version = await platform.getVersion(scope, body.versionId)
      if (
        !version ||
        version.agentId !== body.agentId ||
        !['APPROVED', 'PUBLISHED'].includes(version.status)
      ) {
        throw new DomainError(
          'invalid_action',
          'Only an approved agent version can receive a capability approval'
        )
      }
      const approvalGateway =
        agentRuntime?.capabilityGateway ?? fallbackCapabilityGateway
      const configuredTool = approvalGateway.resolveConfiguredTool(
        version.config,
        body.toolName
      )
      if (configuredTool.status !== 'resolved') {
        throw new DomainError(
          'invalid_action',
          'Capability tool is not available in the approved agent version'
        )
      }
      if (body.actorId === identity.operatorId) {
        throw new DomainError(
          'forbidden',
          'Capability approvals require a separate executor'
        )
      }
      const approval = await capabilityApprovalAuthority.issue({
        tenantId: scope.tenantId,
        agentId: body.agentId,
        versionId: body.versionId,
        toolName: body.toolName,
        input: { message: redactSensitiveText(body.input.message) },
        actorId: body.actorId,
        issuer: identity.operatorId,
        expiresAt: body.expiresAt,
        ...(body.nonce ? { nonce: body.nonce } : {})
      })
      await appendPlatformAudit(
        audit,
        identity,
        correlationId,
        scope.tenantId,
        {
          event: 'capability_approval_issued',
          tenantId: scope.tenantId,
          approvalId: approval.id,
          agentId: approval.agentId,
          versionId: approval.versionId,
          toolName: approval.toolName,
          actorId: approval.actorId,
          expiresAt: approval.expiresAt.toISOString()
        }
      )
      return ok(approval, correlationId)
    } catch (error) {
      const safeError = toSafeError(error)
      reply.code(statusCodeForError(safeError.code))
      return fail(safeError.code, safeError.message, correlationId)
    }
  })

  app.get(
    '/v1/admin/capability-approvals/:approvalId',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'approval:view',
          operatorIdentityResolver
        )
        const params = CapabilityApprovalParamsSchema.parse(request.params)
        const approval = await capabilityApprovalAuthority.get(
          params.approvalId,
          scope.tenantId
        )
        if (!approval) {
          throw new DomainError(
            'invalid_action',
            'Capability approval not found'
          )
        }
        return ok(approval, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )

  app.post(
    '/v1/admin/capability-approvals/:approvalId/revoke',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'approval:decide',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = CapabilityApprovalParamsSchema.parse(request.params)
        const revoked = await capabilityApprovalAuthority.revoke(
          params.approvalId,
          identity.operatorId,
          scope.tenantId
        )
        if (!revoked) {
          throw new DomainError(
            'invalid_action',
            'Capability approval cannot be revoked by this issuer'
          )
        }
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'capability_approval_revoked',
            tenantId: scope.tenantId,
            approvalId: params.approvalId
          }
        )
        return ok(
          { revoked: true, approvalId: params.approvalId },
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
    '/v1/admin/capability-approvals/:approvalId/execute',
    async (request, reply) => {
      const correlationId = createCorrelationId()
      try {
        const scope = requirePlatformScope(
          request.headers,
          'approval:execute',
          operatorIdentityResolver
        )
        const identity = resolveOperatorIdentity(
          request.headers,
          operatorIdentityResolver
        )
        const params = CapabilityApprovalParamsSchema.parse(request.params)
        const body = CapabilityApprovalExecutionRequestSchema.parse(
          request.body
        )
        const record = await capabilityApprovalAuthority.get(
          params.approvalId,
          scope.tenantId
        )
        if (!record || record.status !== 'issued') {
          throw new DomainError(
            'invalid_action',
            'Capability approval is not available for execution'
          )
        }
        if (record.actorId !== identity.operatorId) {
          throw new DomainError(
            'forbidden',
            'Capability approval is bound to another operator'
          )
        }
        const version = await platform.getVersion(scope, record.versionId)
        if (
          !version ||
          version.agentId !== record.agentId ||
          !['APPROVED', 'PUBLISHED'].includes(version.status)
        ) {
          throw new DomainError(
            'invalid_action',
            'Approved agent version is no longer executable'
          )
        }
        const runtimeGateway =
          agentRuntime?.capabilityGateway ?? fallbackCapabilityGateway
        const configuredTool = runtimeGateway.resolveConfiguredTool(
          version.config,
          record.toolName
        )
        if (configuredTool.status !== 'resolved') {
          throw new DomainError(
            'invalid_action',
            'Capability tool is not available in the approved agent version'
          )
        }
        const actor: AgentExecutionActor = {
          id: identity.operatorId,
          role: identity.role,
          permissions: [configuredTool.permission]
        }
        const trace = await executeConfiguredAgent({
          store: platform,
          tenantId: scope.tenantId,
          agentId: record.agentId,
          versionId: record.versionId,
          message: body.message,
          history: body.history,
          executionMode: 'CONTROLLED_RUNTIME',
          capabilityGateway: runtimeGateway,
          actor,
          capabilityApproval: capabilityApprovalReference(record),
          requireCapabilityApproval: true,
          onToolAudit: async (event) => {
            await audit.append(
              {
                type: event.type,
                actorType: 'System',
                actorId: 'capability-approval-runtime',
                correlationId: event.correlationId,
                policyVersion: 'plugin-gateway-v1',
                payload: {
                  tenantId: event.tenantId,
                  agentId: event.agentId,
                  versionId: event.versionId,
                  traceId: event.traceId,
                  plugin: event.plugin,
                  toolName: event.toolName,
                  status: event.status,
                  payload: event.payload
                }
              },
              event.tenantId
            )
          },
          ...(options.resolveApprovedKnowledge
            ? { resolveApprovedKnowledge: options.resolveApprovedKnowledge }
            : {})
        })
        const capabilityResult = trace.tools.find(
          (tool) => tool.name === record.toolName
        )
        if (capabilityResult?.status !== 'succeeded') {
          throw new DomainError(
            'invalid_action',
            'Capability approval was not consumed by the controlled tool'
          )
        }
        await appendPlatformAudit(
          audit,
          identity,
          correlationId,
          scope.tenantId,
          {
            event: 'capability_approval_executed',
            tenantId: scope.tenantId,
            approvalId: record.id,
            traceId: trace.traceId,
            toolName: record.toolName,
            externalCall: trace.provider.externalCall
          }
        )
        return ok(trace, correlationId)
      } catch (error) {
        const safeError = toSafeError(error)
        reply.code(statusCodeForError(safeError.code))
        return fail(safeError.code, safeError.message, correlationId)
      }
    }
  )
}
