/**
 * Published-agent execution entrypoint (worker/API path).
 *
 * This resolves the published/pinned agent version from the ControlPlaneStore
 * and DELEGATES execution to the platform's CONTROLLED_RUNTIME
 * (`executeConfiguredAgent` in `@cvg/platform`). It is a profile/delegation
 * layer. The platform facade composes the public governed harness for the
 * attested synthetic profile specified by SPEC0214. Public result envelopes
 * remain those of PublishedAgentExecutionResult; a completed transport wrapper
 * does not certify tool success or grant release. Local one-use execution does
 * not close the durable migration/restart requirements of PDSH-003b/P100-010.
 */
import {
  createControlledCapabilityGateway,
  executeConfiguredAgent,
  type ApprovedKnowledgeForTest,
  type AgentExecutionActor,
  type ControlPlaneStore,
  type PluginAuditEvent,
  type CapabilityApproval,
  type CapabilityApprovalResolver,
  type CapabilityGateway,
  type PlatformEventBus,
  type ApprovedKnowledgeResolver,
  type ControlledKernelHostContext
} from '@cvg/platform'
import { TraceIdSchema } from '@cvg/platform'
import { DomainError } from '@cvg/shared'
import type { AgentId, AgentVersionId, TenantId, TraceId } from '@cvg/platform'

export interface PublishedAgentExecutionInput {
  store: ControlPlaneStore
  tenantId: TenantId
  agentId: AgentId
  versionId?: AgentVersionId
  traceId?: TraceId
  message: string
  history: string[]
  context?: { conversationId?: string; sessionId?: string }
  approvedKnowledge?: ApprovedKnowledgeForTest
  resolveApprovedKnowledge?: ApprovedKnowledgeResolver
  capabilityGateway?: CapabilityGateway
  actor?: AgentExecutionActor
  capabilityApproval?: CapabilityApproval
  resolveCapabilityApproval?: CapabilityApprovalResolver
  requireCapabilityApproval?: boolean
  onToolAudit?: (event: PluginAuditEvent) => void | Promise<void>
  eventBus?: PlatformEventBus
}

export type PublishedAgentExecutionResult =
  | {
      status: 'completed'
      trace: Awaited<ReturnType<typeof executeConfiguredAgent>>
    }
  | {
      status: 'not_configured'
      trace: null
      reason:
        | 'published_version_missing'
        | 'pinned_version_missing'
        | 'pinned_version_invalid'
    }

export async function executePublishedAgent(
  input: PublishedAgentExecutionInput,
  host?: ControlledKernelHostContext
): Promise<PublishedAgentExecutionResult> {
  const traceId = resolveOptionalTraceId(input.traceId)
  const version = input.versionId
    ? await input.store.getVersion(
        { tenantId: input.tenantId },
        input.versionId
      )
    : await input.store.resolvePublished(
        { tenantId: input.tenantId },
        input.agentId
      )
  if (!version) {
    return {
      status: 'not_configured',
      trace: null,
      reason: input.versionId
        ? ('pinned_version_missing' as const)
        : ('published_version_missing' as const)
    }
  }
  if (
    version.agentId !== input.agentId ||
    (input.versionId &&
      version.status !== 'PUBLISHED' &&
      version.status !== 'ARCHIVED')
  ) {
    return {
      status: 'not_configured',
      trace: null,
      reason: 'pinned_version_invalid' as const
    }
  }

  const trace = await executeConfiguredAgent(
    {
      store: input.store,
      tenantId: input.tenantId,
      agentId: input.agentId,
      versionId: version.id,
      ...(traceId !== undefined ? { traceId } : {}),
      message: input.message,
      history: input.history,
      executionMode: 'CONTROLLED_RUNTIME',
      capabilityGateway:
        input.capabilityGateway ?? createControlledCapabilityGateway(),
      actor: input.actor ?? {
        id: 'system.controlled-runtime',
        role: 'System',
        permissions: ['scheduling:read']
      },
      ...(input.capabilityApproval
        ? { capabilityApproval: input.capabilityApproval }
        : {}),
      ...(input.resolveCapabilityApproval
        ? { resolveCapabilityApproval: input.resolveCapabilityApproval }
        : {}),
      ...(input.requireCapabilityApproval
        ? { requireCapabilityApproval: true }
        : {}),
      ...(input.onToolAudit ? { onToolAudit: input.onToolAudit } : {}),
      ...(input.eventBus ? { eventBus: input.eventBus } : {}),
      ...(input.context ? { context: input.context } : {}),
      ...(input.approvedKnowledge
        ? { approvedKnowledge: input.approvedKnowledge }
        : {}),
      ...(input.resolveApprovedKnowledge
        ? { resolveApprovedKnowledge: input.resolveApprovedKnowledge }
        : {})
    },
    host
  )
  return { status: 'completed', trace }
}

function resolveOptionalTraceId(rawTraceId: unknown): TraceId | undefined {
  if (rawTraceId === undefined) return undefined
  const parsed = TraceIdSchema.safeParse(rawTraceId)
  if (!parsed.success) {
    throw new DomainError('validation_failed', 'Execution trace ID is invalid')
  }
  return parsed.data
}
