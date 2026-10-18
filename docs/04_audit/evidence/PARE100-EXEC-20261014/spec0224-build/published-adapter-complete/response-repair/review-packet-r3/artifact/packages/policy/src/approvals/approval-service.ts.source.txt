import {
  createDomainId,
  DomainError,
  type ApprovalDecision,
  type ApprovalStatus,
  type RiskLevel,
  type Role
} from '@cvg/shared'
import { roleHasPermission } from '@cvg/shared'

export interface ApprovalRequest {
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

export class ApprovalService {
  create(input: {
    sessionId: string
    proposedAction: string
    summary: string
    riskLevel: RiskLevel
  }): ApprovalRequest {
    return {
      id: createDomainId('approval'),
      sessionId: input.sessionId,
      proposedAction: input.proposedAction,
      summary: input.summary,
      riskLevel: input.riskLevel,
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date()
    }
  }

  decide(input: {
    request: ApprovalRequest
    decision: ApprovalDecision
    operatorId: string
    role: Role
  }): ApprovalRequest {
    if (!roleHasPermission(input.role, 'approval:decide')) {
      throw new DomainError(
        'operator_not_allowed',
        'Operator role cannot decide approval requests'
      )
    }
    if (input.request.status !== 'pending') {
      throw new DomainError(
        'approval_not_pending',
        'Approval request is not pending'
      )
    }
    return {
      ...input.request,
      status: input.decision,
      decidedBy: input.operatorId,
      decidedAt: new Date()
    }
  }
}
