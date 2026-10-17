import { z } from 'zod'
import {
  ApprovalDecisionSchema,
  AutonomyLevelSchema,
  ChannelSchema,
  RiskLevelSchema,
  TaskPrioritySchema
} from '../enums.ts'

const TenantIdSchema = z.string().regex(/^tenant_[0-9a-f-]{36}$/)
const ConversationIdSchema = z.string().regex(/^conv_[0-9a-f-]{36}$/)
const SessionIdSchema = z.string().regex(/^sess_[0-9a-f-]{36}$/)

export const ReceiveInboundMessageBaseSchema = z.object({
  tenantId: TenantIdSchema,
  channel: ChannelSchema,
  externalMessageId: z.string().trim().min(1).max(200),
  senderRef: z.string().trim().min(3).max(200),
  body: z.string().min(1).max(4000),
  receivedAt: z.coerce.date(),
  conversationId: ConversationIdSchema.optional(),
  sessionId: SessionIdSchema.optional()
})

export const ReceiveInboundMessageSchema =
  ReceiveInboundMessageBaseSchema.superRefine((input, context) => {
    if (Boolean(input.conversationId) !== Boolean(input.sessionId)) {
      context.addIssue({
        code: 'custom',
        path: ['conversationId'],
        message: 'conversationId and sessionId must be provided together'
      })
    }
  })

export const RunAgentTurnSchema = z.object({
  sessionId: z.string().min(1),
  triggerMessageId: z.string().min(1),
  autonomyLevel: AutonomyLevelSchema
})

export const RequestHumanApprovalSchema = z.object({
  sessionId: z.string().min(1).max(160),
  proposedAction: z.string().min(1).max(200),
  summary: z.string().min(1).max(4000),
  riskLevel: RiskLevelSchema
})

export const ResolveApprovalSchema = z.object({
  approvalRequestId: z.string().min(1),
  decision: ApprovalDecisionSchema,
  operatorId: z.string().min(1),
  note: z.string().max(4000).optional()
})

export const CreateInternalTaskSchema = z.object({
  sessionId: z.string().min(1).max(160),
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  priority: TaskPrioritySchema,
  source: z.string().min(1).max(120),
  idempotencyKey: z.string().min(8).max(200)
})
