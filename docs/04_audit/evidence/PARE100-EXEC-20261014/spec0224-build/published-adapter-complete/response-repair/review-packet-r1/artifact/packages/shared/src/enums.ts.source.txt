import { z } from 'zod'

export const ChannelSchema = z.enum(['whatsapp', 'web', 'internal'])
export type Channel = z.infer<typeof ChannelSchema>

export const ConversationStatusSchema = z.enum([
  'new',
  'active',
  'waiting_human',
  'waiting_approval',
  'resolved',
  'archived'
])
export type ConversationStatus = z.infer<typeof ConversationStatusSchema>

export const SessionStatusSchema = z.enum([
  'open',
  'collecting_data',
  'triage',
  'scheduling',
  'handoff',
  'closed'
])
export type SessionStatus = z.infer<typeof SessionStatusSchema>

export const IntentSchema = z.enum([
  'identify_owner_pet',
  'triage',
  'scheduling',
  'handoff',
  'task',
  'institutional_question',
  'unknown'
])
export type Intent = z.infer<typeof IntentSchema>

export const RiskLevelSchema = z.enum(['low', 'medium', 'high', 'critical'])
export type RiskLevel = z.infer<typeof RiskLevelSchema>

export const AutonomyLevelSchema = z.enum([
  'level_1_collect',
  'level_2_suggest'
])
export type AutonomyLevel = z.infer<typeof AutonomyLevelSchema>

export const ApprovalDecisionSchema = z.enum([
  'approved',
  'rejected',
  'assumed'
])
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>

export const ApprovalStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'expired',
  'assumed'
])
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>

export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent'])
export type TaskPriority = z.infer<typeof TaskPrioritySchema>

export const TaskStatusSchema = z.enum([
  'open',
  'in_progress',
  'done',
  'canceled'
])
export type TaskStatus = z.infer<typeof TaskStatusSchema>

export const RoleSchema = z.enum([
  'Operator',
  'Approver',
  'Supervisor',
  'Admin',
  'System'
])
export type Role = z.infer<typeof RoleSchema>

export const ToolStatusSchema = z.enum([
  'pending',
  'succeeded',
  'failed',
  'blocked'
])
export type ToolStatus = z.infer<typeof ToolStatusSchema>

export const PolicyDecisionSchema = z.enum([
  'allowed',
  'blocked',
  'requires_approval',
  'handoff'
])
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>
