import { z } from 'zod'
import {
  ReceiveInboundMessageBaseSchema,
  ResolveApprovalSchema,
  CreateInternalTaskSchema
} from './application.ts'

export const WebhookMessagePayloadSchema = ReceiveInboundMessageBaseSchema.omit(
  {
    channel: true
  }
)
export const ApprovalDecisionPayloadSchema = ResolveApprovalSchema.omit({
  approvalRequestId: true
})
export const CreateTaskPayloadSchema = CreateInternalTaskSchema

export const ListConversationsQuerySchema = z.object({
  status: z.string().optional(),
  channel: z.string().optional(),
  contactId: z.string().optional(),
  updatedAfter: z.coerce.date().optional()
})
