import { describe, expect, it } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import { ApprovalRepository } from '../repositories/approval-repository.ts'
import { AuditRepository } from '../repositories/audit-repository.ts'
import { TaskRepository } from '../repositories/task-repository.ts'
import type { ApprovalRequestRecord } from '../schema.ts'

const tenantA = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000b01'
)
const tenantB = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000b02'
)
const conversationId = 'conv_00000000-0000-4000-8000-000000000b01'
const sessionId = 'sess_00000000-0000-4000-8000-000000000b01'
const correlationId = 'corr_00000000-0000-4000-8000-000000000b01'

function seededDatabase(tenantId = tenantA): InMemoryDatabase {
  const db = new InMemoryDatabase()
  db.state.conversations.push({
    tenantId,
    id: conversationId,
    channel: 'web',
    senderRef: 'fixture',
    senderRefHash: 'fixture-hash',
    status: 'active',
    correlationId,
    createdAt: new Date('2026-09-13T10:00:00.000Z'),
    updatedAt: new Date('2026-09-13T10:00:00.000Z')
  })
  db.state.sessions.push({
    id: sessionId,
    conversationId,
    status: 'open',
    takeoverState: 'BOT_ACTIVE',
    createdAt: new Date('2026-09-13T10:00:00.000Z'),
    updatedAt: new Date('2026-09-13T10:00:00.000Z')
  })
  return db
}

function approvalRequest(
  overrides: Partial<ApprovalRequestRecord> = {}
): ApprovalRequestRecord {
  return {
    id: 'appr_00000000-0000-4000-8000-000000000b01',
    sessionId,
    proposedAction: 'synthetic_action',
    summary: 'fixture summary',
    riskLevel: 'low',
    status: 'pending',
    decidedBy: null,
    decidedAt: null,
    createdAt: new Date('2026-09-13T10:00:00.000Z'),
    ...overrides
  }
}

describe('repository error and scope paths', () => {
  it('scopes approval reads and writes by tenant', () => {
    const db = seededDatabase()
    const approvals = new ApprovalRepository(db)
    expect(() => approvals.save(approvalRequest(), tenantA)).not.toThrow()
    expect(() => approvals.save(approvalRequest(), tenantA)).toThrowError(
      /already exists/
    )
    expect(approvals.findById(approvalRequest().id, tenantA)).not.toBeNull()
    expect(approvals.findById(approvalRequest().id, tenantB)).toBeNull()
    expect(approvals.list(tenantA)).toHaveLength(1)
    expect(approvals.list(tenantB)).toHaveLength(0)
    const unscoped = new ApprovalRepository(db)
    expect(unscoped.list()).toHaveLength(1)

    const otherDb = seededDatabase(tenantB)
    const otherApprovals = new ApprovalRepository(otherDb)
    expect(() => otherApprovals.save(approvalRequest(), tenantA)).toThrowError(
      /Session not found/
    )
    expect(() =>
      otherApprovals.save(
        approvalRequest({ status: 'approved', decidedBy: 'op_fixture' }),
        tenantB
      )
    ).toThrowError(/must be pending/)
  })

  it('decides approvals with audit and rejects missing or decided requests', () => {
    const db = seededDatabase()
    const approvals = new ApprovalRepository(db)
    const created = approvals.save(approvalRequest(), tenantA)
    const decision = {
      approvalRequestId: created.id,
      decision: 'approved' as const,
      operatorId: 'op_fixture',
      role: 'Approver' as const,
      correlationId,
      note: 'fixture note'
    }
    const decided = approvals.decideWithAudit(decision, tenantA)
    expect(decided.status).toBe('approved')
    expect(decided.decidedBy).toBe('op_fixture')
    expect(db.state.auditEvents).toHaveLength(1)
    expect(() => approvals.decideWithAudit(decision, tenantA)).toThrowError(
      /no longer pending/
    )
    expect(() =>
      approvals.decideWithAudit(
        { ...decision, approvalRequestId: 'appr_missing' },
        tenantA
      )
    ).toThrowError(/Approval request not found/)
  })

  it('scopes task creation, reads and updates by tenant', () => {
    const db = seededDatabase()
    const tasks = new TaskRepository(db)
    const input = {
      sessionId,
      title: 'fixture task',
      description: 'fixture description',
      priority: 'medium' as const,
      source: 'fixture',
      idempotencyKey: 'task-edge-b01'
    }
    const created = tasks.create(input, tenantA)
    expect(tasks.create(input, tenantA).id).toBe(created.id)
    expect(tasks.findById(created.id, tenantA)?.status).toBe('open')
    expect(tasks.findById(created.id, tenantB)).toBeNull()
    expect(tasks.list(tenantA)).toHaveLength(1)
    expect(tasks.list(tenantB)).toHaveLength(0)
    expect(
      tasks.updateStatus(created.id, 'in_progress', tenantA)
    ).toMatchObject({ status: 'in_progress' })
    expect(tasks.updateStatus('task_missing', 'done', tenantA)).toBeNull()
    expect(tasks.updateStatus(created.id, 'done', tenantB)).toBeNull()

    const otherTasks = new TaskRepository(seededDatabase(tenantB))
    expect(() => otherTasks.create(input, tenantA)).toThrowError(
      /Session not found/
    )
  })

  it('filters audit evidence by correlation, session, type and actor', () => {
    const db = seededDatabase()
    const audit = new AuditRepository(db)
    audit.append(
      {
        type: 'tool_call',
        actorType: 'System',
        actorId: 'fixture-actor',
        correlationId,
        policyVersion: 'fixture-v1',
        payload: { sessionId }
      },
      tenantA
    )
    audit.append(
      {
        type: 'handoff',
        actorType: 'Operator',
        actorId: 'op_fixture',
        correlationId: 'corr_00000000-0000-4000-8000-000000000b02',
        policyVersion: 'fixture-v1',
        payload: { sessionId: 42 }
      },
      tenantA
    )
    audit.append(
      {
        type: 'handoff',
        actorType: 'Operator',
        actorId: 'op_foreign',
        correlationId: 'corr_00000000-0000-4000-8000-000000000b03',
        policyVersion: 'fixture-v1',
        payload: {}
      },
      tenantB
    )

    expect(audit.listByCorrelation(correlationId, tenantA)).toHaveLength(1)
    expect(audit.listByCorrelation(correlationId, tenantB)).toHaveLength(0)
    expect(audit.listBySession(sessionId, tenantA)).toHaveLength(1)
    expect(audit.listBySession(sessionId, tenantB)).toHaveLength(0)
    expect(
      audit.listEvidence(
        { limit: 10, offset: 0, type: 'handoff', actorId: 'op_fixture' },
        tenantA
      ).items
    ).toHaveLength(1)
    expect(
      audit.summarizeEvidence({ type: 'handoff' }, tenantA).byType
    ).toMatchObject({ handoff: 1 })
    expect(
      audit.listEvidence({ limit: 1, offset: 0 }, tenantA).pageInfo
    ).toMatchObject({ total: 2, hasNextPage: true })
  })

  it('creates, lists and transitions audit evidence checkpoints', () => {
    const db = seededDatabase()
    const audit = new AuditRepository(db)
    const event = audit.append(
      {
        type: 'tool_call',
        actorType: 'System',
        actorId: 'fixture-actor',
        correlationId,
        policyVersion: 'fixture-v1',
        payload: { sessionId }
      },
      tenantA
    )
    expect(() =>
      audit.createAuditEvidenceCheckpoint(
        { eventIds: [event.id] },
        'fixture-actor'
      )
    ).toThrowError(/Tenant scope is required/)
    const checkpoint = audit.createAuditEvidenceCheckpoint(
      { eventIds: [event.id], filters: { sessionId } },
      'fixture-actor',
      tenantA
    )
    expect(checkpoint.status).toBe('SEALED')
    expect(() =>
      audit.createAuditEvidenceCheckpoint(
        { eventIds: [event.id], filters: { sessionId } },
        'fixture-actor',
        tenantA
      )
    ).toThrowError(/already exists/)
    expect(audit.getAuditEvidenceCheckpoint(checkpoint.id, tenantA)?.id).toBe(
      checkpoint.id
    )
    expect(audit.getAuditEvidenceCheckpoint(checkpoint.id, tenantB)).toBeNull()
    expect(audit.listAuditEvidenceCheckpoints(tenantA)).toHaveLength(1)
    expect(
      audit.transitionAuditEvidenceCheckpoint(
        checkpoint.id,
        'ARCHIVED',
        'fixture-actor',
        'SEALED',
        tenantA
      )?.status
    ).toBe('ARCHIVED')
    expect(
      audit.transitionAuditEvidenceCheckpoint(
        'audit_checkpoint_00000000-0000-4000-8000-000000000b01',
        'ARCHIVED',
        'fixture-actor',
        'SEALED',
        tenantA
      )
    ).toBeNull()
    expect(() =>
      audit.transitionAuditEvidenceCheckpoint(
        checkpoint.id,
        'ARCHIVED',
        'fixture-actor',
        'SEALED',
        tenantA
      )
    ).toThrowError(/status is ARCHIVED/)
  })

  it('rejects checkpoints whose events are outside the tenant or filters', () => {
    const db = seededDatabase()
    const audit = new AuditRepository(db)
    const event = audit.append(
      {
        type: 'tool_call',
        actorType: 'System',
        actorId: 'fixture-actor',
        correlationId,
        policyVersion: 'fixture-v1',
        payload: { sessionId }
      },
      tenantA
    )
    expect(() =>
      audit.createAuditEvidenceCheckpoint(
        {
          eventIds: [event.id, 'audit_00000000-0000-4000-8000-000000000b99']
        },
        'fixture-actor',
        tenantA
      )
    ).toThrowError(/must exist in the tenant scope/)
    expect(() =>
      audit.createAuditEvidenceCheckpoint(
        { eventIds: [event.id], filters: { sessionId: 'sess_missing' } },
        'fixture-actor',
        tenantA
      )
    ).toThrowError(/must match the checkpoint filters/)
  })
})
