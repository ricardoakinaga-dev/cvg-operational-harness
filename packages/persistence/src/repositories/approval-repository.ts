import {
  ApprovalStatusSchema,
  DomainError,
  type ApprovalStatus
} from '@cvg/shared'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import type { ApprovalRequestRecord, PageInfo } from '../schema.ts'
import {
  assertStatusPageQuery,
  pageInfoFor,
  type StatusPageQuery
} from './task-repository.ts'

import { AuditRepository } from './audit-repository.ts'
import {
  assertApprovalCreation,
  cloneAttendanceApproval,
  validateAttendanceDecision,
  attendanceDecisionAudit,
  type AttendanceApprovalDecision
} from '../attendance-approval.ts'

export type ApprovalListQuery = StatusPageQuery<ApprovalStatus>

export interface ApprovalPage {
  items: ApprovalRequestRecord[]
  pageInfo: PageInfo
}

export class ApprovalRepository {
  constructor(private readonly db: InMemoryDatabase) {}

  save(
    request: ApprovalRequestRecord,
    rawTenantId?: TenantId
  ): ApprovalRequestRecord {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    if (tenantId && !this.sessionBelongsToTenant(request.sessionId, tenantId)) {
      throw new DomainError('invalid_action', 'Session not found')
    }
    assertApprovalCreation(request)
    if (
      this.db.state.approvals.some((approval) => approval.id === request.id)
    ) {
      throw new DomainError('conflict', 'Approval request already exists')
    }
    this.db.state.approvals = [
      ...this.db.state.approvals,
      cloneAttendanceApproval(request)
    ]
    return cloneAttendanceApproval(request)
  }

  decideWithAudit(
    input: AttendanceApprovalDecision,
    rawTenantId?: TenantId
  ): ApprovalRequestRecord {
    input = validateAttendanceDecision(input)
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const current = this.findById(input.approvalRequestId, tenantId)
    if (!current)
      throw new DomainError('invalid_action', 'Approval request not found')
    if (current.status !== 'pending')
      throw new DomainError('conflict', 'Approval request is no longer pending')
    const decided: ApprovalRequestRecord = {
      ...current,
      status: input.decision,
      decidedBy: input.operatorId,
      decidedAt: new Date()
    }
    // Stage both writes before publishing either; audit preparation may throw.
    const staged = new InMemoryDatabase({ ...this.db.state })
    new AuditRepository(staged).append(
      attendanceDecisionAudit(decided, input, tenantId),
      tenantId
    )
    const approvals = this.db.state.approvals.map((item) =>
      item.id === decided.id ? cloneAttendanceApproval(decided) : item
    )
    this.db.state.approvals = approvals
    this.db.state.auditEvents = staged.state.auditEvents
    return cloneAttendanceApproval(decided)
  }

  findById(id: string, rawTenantId?: TenantId): ApprovalRequestRecord | null {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const found = this.db.state.approvals.find(
      (approval) =>
        approval.id === id &&
        (!tenantId || this.sessionBelongsToTenant(approval.sessionId, tenantId))
    )
    return found ? cloneAttendanceApproval(found) : null
  }

  list(rawTenantId?: TenantId): ApprovalRequestRecord[] {
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    return this.db.state.approvals
      .filter(
        (approval) =>
          !tenantId || this.sessionBelongsToTenant(approval.sessionId, tenantId)
      )
      .map(cloneAttendanceApproval)
  }

  /**
   * SPEC0250 §3.2 — bounded page in creation order, optionally filtered by
   * status; `total` counts every matching approval of the tenant.
   */
  listPage(
    rawTenantId: TenantId | undefined,
    query: ApprovalListQuery
  ): ApprovalPage {
    const { limit, offset, statuses } = assertStatusPageQuery(
      query,
      ApprovalStatusSchema.options
    )
    const tenantId = rawTenantId ? TenantIdSchema.parse(rawTenantId) : undefined
    const matching = this.db.state.approvals.filter(
      (approval) =>
        (!tenantId ||
          this.sessionBelongsToTenant(approval.sessionId, tenantId)) &&
        (!statuses || statuses.includes(approval.status))
    )
    const items = matching
      .slice(offset, offset + limit)
      .map(cloneAttendanceApproval)
    return {
      items,
      pageInfo: pageInfoFor({ limit, offset }, items.length, matching.length)
    }
  }

  private sessionBelongsToTenant(
    sessionId: string,
    tenantId: TenantId
  ): boolean {
    const session = this.db.state.sessions.find((item) => item.id === sessionId)
    const conversation = session
      ? this.db.state.conversations.find(
          (item) => item.id === session.conversationId
        )
      : undefined
    return conversation?.tenantId === tenantId
  }
}
