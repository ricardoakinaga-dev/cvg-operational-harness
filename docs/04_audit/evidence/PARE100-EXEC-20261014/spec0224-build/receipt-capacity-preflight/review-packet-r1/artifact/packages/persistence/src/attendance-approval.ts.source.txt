import {
  CorrelationIdSchema,
  DomainError,
  ResolveApprovalSchema,
  requirePermission,
  type ApprovalDecision,
  type Role
} from '@cvg/shared'
import type { TenantId } from '@cvg/platform'
import type { ApprovalRequestRecord, AuditEventRecord } from './schema.ts'

export interface AttendanceApprovalDecision {
  approvalRequestId: string
  decision: ApprovalDecision
  operatorId: string
  role: Role
  correlationId: string
  note?: string
}

export function validateAttendanceDecision(
  input: AttendanceApprovalDecision
): AttendanceApprovalDecision {
  const parsed = ResolveApprovalSchema.parse(input)
  const correlationId = CorrelationIdSchema.parse(input.correlationId)
  requirePermission(input.role, 'approval:decide')
  const normalized: AttendanceApprovalDecision = {
    approvalRequestId: parsed.approvalRequestId,
    decision: parsed.decision,
    operatorId: parsed.operatorId,
    role: input.role,
    correlationId
  }
  if (parsed.note !== undefined) normalized.note = parsed.note
  return normalized
}

export function assertApprovalCreation(request: ApprovalRequestRecord): void {
  if (
    request.status !== 'pending' ||
    request.decidedBy !== null ||
    request.decidedAt !== null
  ) {
    throw new DomainError('invalid_action', 'Approval creation must be pending')
  }
}

export function cloneAttendanceApproval(
  request: ApprovalRequestRecord
): ApprovalRequestRecord {
  return {
    ...request,
    createdAt: new Date(request.createdAt),
    decidedAt: request.decidedAt ? new Date(request.decidedAt) : null
  }
}

export function attendanceDecisionAudit(
  request: ApprovalRequestRecord,
  input: AttendanceApprovalDecision,
  tenantId?: TenantId
): Omit<AuditEventRecord, 'id' | 'createdAt'> {
  return {
    ...(tenantId ? { tenantId } : {}),
    type: request.status === 'assumed' ? 'handoff' : 'approval_decision',
    actorType: input.role,
    actorId: input.operatorId,
    correlationId: input.correlationId,
    policyVersion: 'api-runtime-v1',
    payload: {
      sessionId: request.sessionId,
      approvalRequestId: request.id,
      status: request.status,
      ...(tenantId ? { tenantId } : {}),
      effect:
        request.status === 'assumed' ? 'handoff_only' : 'approval_state_only'
    }
  }
}
