import { DomainError } from '@cvg/shared'
import {
  AgentIdSchema,
  AgentVersionIdSchema,
  ApprovedKnowledgeForTestSchema,
  TenantIdSchema,
  type ControlPlaneStore,
  type ApprovedKnowledgeResolver
} from '@cvg/platform'
import { z } from 'zod'

const boundedContextId = z.string().trim().min(1).max(160)

export const PublishedAgentJobSchema = z
  .object({
    tenantId: TenantIdSchema,
    agentId: AgentIdSchema,
    versionId: AgentVersionIdSchema,
    message: z.string().trim().min(1).max(4000),
    history: z.array(z.string().max(4000)).max(50),
    approvedKnowledge: ApprovedKnowledgeForTestSchema.optional(),
    conversationId: boundedContextId.optional(),
    sessionId: boundedContextId.optional()
  })
  .strict()

export type PublishedAgentJob = z.infer<typeof PublishedAgentJobSchema>

export interface PublishedAgentJobDependencies {
  platform: ControlPlaneStore
  resolveApprovedKnowledge?: ApprovedKnowledgeResolver
}

export function parsePublishedAgentJob(rawInput: unknown): PublishedAgentJob {
  try {
    return PublishedAgentJobSchema.parse(rawInput)
  } catch {
    throw new DomainError('validation_failed', 'Worker runtime job is invalid')
  }
}
