import {
  AgentConfigSchema,
  AgentIdSchema,
  AgentVersionIdSchema,
  ApprovedKnowledgeForTestSchema,
  TestLabCaseSchema
} from '@cvg/platform'
import { z } from 'zod'

export const TestLabRequestSchema = z
  .object({
    agentId: AgentIdSchema,
    versionId: AgentVersionIdSchema,
    message: z.string().trim().min(1).max(4000),
    history: z.array(z.string().max(4000)).max(50).default([]),
    approvedKnowledge: ApprovedKnowledgeForTestSchema.optional()
  })
  .strict()

export const VersionCloneRequestSchema = z
  .object({ config: AgentConfigSchema.optional() })
  .strict()

export const TakeoverRequestSchema = z
  .object({
    event: z.enum([
      'request_handoff',
      'accept_handoff',
      'resolve_handoff',
      'release_to_bot'
    ])
  })
  .strict()

export const TestLabEvaluationRequestSchema = z
  .object({
    agentId: AgentIdSchema,
    versionId: AgentVersionIdSchema,
    cases: z.array(TestLabCaseSchema).min(1).max(100)
  })
  .strict()

export const OperationalApprovalDecisionSchema = z
  .object({
    decision: z.preprocess(
      (value) => (typeof value === 'string' ? value.toUpperCase() : value),
      z.enum(['APPROVED', 'REJECTED'])
    ),
    note: z.string().trim().max(500).optional()
  })
  .strict()

export const OperationalExecutionCancelSchema = z
  .object({
    reason: z.string().trim().max(500).optional()
  })
  .strict()

export const OperationalExecutionInputSchema = z
  .object({
    message: z.string().trim().min(1).max(32_000)
  })
  .strict()

export const CapabilityApprovalParamsSchema = z
  .object({ approvalId: z.string().trim().min(1).max(160) })
  .strict()

export const CapabilityApprovalIssueRequestSchema = z
  .object({
    agentId: AgentIdSchema,
    versionId: AgentVersionIdSchema,
    toolName: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[A-Za-z0-9._:-]+$/),
    actorId: z
      .string()
      .trim()
      .min(3)
      .max(80)
      .regex(/^[A-Za-z0-9._:-]+$/),
    input: z
      .object({
        message: z.string().trim().min(1).max(4000)
      })
      .strict(),
    expiresAt: z.coerce.date(),
    nonce: z
      .string()
      .trim()
      .min(8)
      .max(160)
      .regex(/^[A-Za-z0-9._:-]+$/)
      .optional()
  })
  .strict()
  .superRefine((input, context) => {
    const now = Date.now()
    const expiry = input.expiresAt.getTime()
    if (!Number.isFinite(expiry) || expiry <= now) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Approval expiry must be in the future'
      })
    } else if (expiry > now + 15 * 60 * 1000) {
      context.addIssue({
        code: 'custom',
        path: ['expiresAt'],
        message: 'Approval lifetime cannot exceed 15 minutes'
      })
    }
  })

export const CapabilityApprovalExecutionRequestSchema = z
  .object({
    message: z.string().trim().min(1).max(4000),
    history: z.array(z.string().max(4000)).max(50).default([]),
    approvedKnowledge: ApprovedKnowledgeForTestSchema.optional()
  })
  .strict()
