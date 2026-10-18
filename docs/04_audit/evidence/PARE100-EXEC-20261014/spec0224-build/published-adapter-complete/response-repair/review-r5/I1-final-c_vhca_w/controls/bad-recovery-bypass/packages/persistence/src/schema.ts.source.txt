import type {
  ApprovalStatus,
  Channel,
  ConversationStatus,
  RiskLevel,
  SessionStatus,
  TaskPriority,
  TaskStatus,
  ToolStatus
} from '@cvg/shared'
import type {
  AgentId,
  AgentVersionId,
  HumanTakeoverState,
  TenantId
} from '@cvg/platform'
import type { AuditEvidenceCheckpointRecord } from './audit-evidence-checkpoint.ts'

export interface ConversationRecord {
  tenantId: TenantId
  id: string
  channel: Channel
  senderRef: string
  senderRefHash: string
  status: ConversationStatus
  correlationId: string
  createdAt: Date
  updatedAt: Date
}

export interface PaginationInput {
  limit: number
  offset: number
}

export interface PageInfo {
  limit: number
  offset: number
  total: number
  hasNextPage: boolean
}

export interface ConversationListItem {
  id: string
  channel: Channel
  senderRef: string
  status: ConversationStatus
  correlationId: string
  openSessionId: string | null
  lastMessageBody: string | null
  lastMessageAt: Date | null
  createdAt: Date
  updatedAt: Date
}

export interface ConversationPage {
  items: ConversationListItem[]
  pageInfo: PageInfo
}

export interface MessageRecord {
  id: string
  conversationId: string
  externalMessageId: string
  direction: 'inbound' | 'outbound'
  body: string
  /** Inbound runtime work is retryable until its finalizer commits. */
  runtimeStatus?: 'pending' | 'completed'
  createdAt: Date
}

export interface SessionRecord {
  id: string
  conversationId: string
  status: SessionStatus
  takeoverState: HumanTakeoverState
  /** Immutable runtime binding; absent only for legacy/unconfigured sessions. */
  agentId?: AgentId
  agentVersionId?: AgentVersionId
  createdAt: Date
  updatedAt: Date
}

/** Safe pointer used by a worker to reload a committed inbound message. */
export interface InboundRuntimeContext {
  message: MessageRecord
  channel: Channel
  senderRef: string
  correlationId: string
  session: SessionRecord | null
}

export interface AgentRunRecord {
  id: string
  sessionId: string
  status: 'started' | 'completed' | 'failed'
  createdAt: Date
  updatedAt: Date
}

export interface ToolCallRecord {
  id: string
  agentRunId: string
  toolName: string
  status: ToolStatus
  input: unknown
  output: unknown
  error: string | null
  createdAt: Date
}

export interface ApprovalRequestRecord {
  id: string
  sessionId: string
  proposedAction: string
  summary: string
  riskLevel: RiskLevel
  status: ApprovalStatus
  decidedBy: string | null
  decidedAt: Date | null
  createdAt: Date
}

export interface TaskRecord {
  id: string
  sessionId: string
  title: string
  description: string
  priority: TaskPriority
  source: string
  status: TaskStatus
  idempotencyKey: string
  createdAt: Date
}

export type JourneyDraftStatus = 'draft' | 'linked' | 'expired'

export interface OwnerDraftRecord {
  tenantId: TenantId
  id: string
  conversationId: string | null
  sessionId: string | null
  phone: string | null
  name: string | null
  candidateIds: string[]
  status: JourneyDraftStatus
  idempotencyKey: string
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}

export interface PatientDraftRecord {
  tenantId: TenantId
  id: string
  ownerDraftId: string | null
  ownerCandidateId: string | null
  conversationId: string | null
  sessionId: string | null
  name: string | null
  species: string | null
  candidateIds: string[]
  status: JourneyDraftStatus
  idempotencyKey: string
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}

export interface AppointmentDraftRecord {
  tenantId: TenantId
  id: string
  patientDraftId: string
  conversationId: string | null
  sessionId: string | null
  slot: string
  sourceVersion: string
  status: 'proposed' | 'awaiting_approval' | 'expired' | 'cancelled'
  confirmationBlocked: true
  idempotencyKey: string
  createdAt: Date
  updatedAt: Date
  expiresAt: Date
}

export interface AuditEventRecord {
  id: string
  /** Persisted ownership; payload.tenantId is never authoritative. */
  tenantId?: TenantId
  type: AuditEventType
  actorType: 'System' | 'Operator' | 'Approver' | 'Supervisor' | 'Admin'
  actorId: string
  correlationId: string
  policyVersion: string
  payload: unknown
  createdAt: Date
}

export type AuditEventType =
  | 'tool_call'
  | 'safety_event'
  | 'integration_event'
  | 'policy_decision'
  | 'approval_decision'
  | 'handoff'

export interface AuditEvidenceFilters {
  sessionId?: string
  correlationId?: string
  type?: AuditEventType
  actorId?: string
}

export interface AuditEvidenceQuery extends AuditEvidenceFilters {
  limit: number
  offset: number
}

export interface AuditEvidenceSummary {
  totalEvents: number
  byType: Record<string, number>
  byActorType: Record<string, number>
  byCorrelationId: Record<string, number>
  bySessionId: Record<string, number>
}

export interface AuditEvidencePage {
  items: AuditEventRecord[]
  pageInfo: PageInfo
}

export interface IdempotencyRecord {
  key: string
  resourceId: string
  createdAt: Date
}

export interface OutboxEventRecord {
  id: string
  type: string
  payload: unknown
  /** Persisted ownership. Optional only for legacy fixtures during migration. */
  tenantId?: TenantId
  correlationId?: string
  idempotencyKey?: string
  envelopeVersion?: number
  conversationId?: string | null
  sessionId?: string | null
  agentId?: AgentId | null
  agentVersionId?: AgentVersionId | null
  inboundMessageId?: string | null
  status: 'pending' | 'processing' | 'processed' | 'failed' | 'dead_letter'
  createdAt: Date
  /** All fields below are repository-owned state. */
  availableAt?: Date
  attempts?: number
  leaseOwner?: string | null
  leaseUntil?: Date | null
  lastError?: string | null
  processedAt?: Date | null
  deadLetteredAt?: Date | null
  parentEventId?: string | null
}

export type OutboxAttemptOutcome =
  | 'claimed'
  | 'lease_expired'
  | 'processed'
  | 'failed'
  | 'dead_letter'
  | 'requeued'
  | 'handoff'

export interface OutboxAttemptRecord {
  eventId: string
  attempt: number
  tenantId: TenantId
  workerId: string
  claimedAt: Date
  outcome: OutboxAttemptOutcome
  error: string | null
}

export interface OutboxEffectRecord {
  tenantId: TenantId
  idempotencyKey: string
  eventId: string
  result: unknown
  appliedAt: Date
}

export interface DatabaseState {
  conversations: ConversationRecord[]
  messages: MessageRecord[]
  sessions: SessionRecord[]
  agentRuns: AgentRunRecord[]
  toolCalls: ToolCallRecord[]
  approvals: ApprovalRequestRecord[]
  tasks: TaskRecord[]
  auditEvents: AuditEventRecord[]
  auditEvidenceCheckpoints: AuditEvidenceCheckpointRecord[]
  idempotency: IdempotencyRecord[]
  outbox: OutboxEventRecord[]
  outboxAttempts: OutboxAttemptRecord[]
  outboxEffects: OutboxEffectRecord[]
  ownerDrafts: OwnerDraftRecord[]
  patientDrafts: PatientDraftRecord[]
  appointmentDrafts: AppointmentDraftRecord[]
}
