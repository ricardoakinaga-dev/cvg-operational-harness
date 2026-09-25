/**
 * AUD19-003 — exactly-once approval decision audit events (memory store).
 */
import { createCorrelationId } from '@cvg/shared'
import { describe, expect, it } from 'vitest'
import { InMemoryDatabase } from '../db.ts'
import { AuditRepository } from '../repositories/audit-repository.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000211'

function decisionEvent(note: string) {
  return {
    type: 'approval_decision' as const,
    actorType: 'Approver' as const,
    actorId: 'approver.synthetic',
    correlationId: createCorrelationId(),
    policyVersion: 'policy-approval-v1',
    payload: {
      executionId: 'exec_atomic_1',
      approvalId: 'appr_atomic_1',
      decision: 'APPROVED',
      previousState: 'WAITING_APPROVAL',
      nextState: 'QUEUED',
      note
    }
  }
}

describe('approval decision audit dedupe (AUD19-003)', () => {
  it('converges repeated identical decisions on one event', () => {
    const audit = new AuditRepository(new InMemoryDatabase())
    const first = audit.append(decisionEvent('first'), tenantA)
    const second = audit.append(decisionEvent('retry'), tenantA)
    expect(second.id).toBe(first.id)
    expect(
      audit
        .listEvidence({ limit: 10, offset: 0 }, tenantA)
        .items.filter((event) => event.type === 'approval_decision')
    ).toHaveLength(1)
  })

  it('keeps distinct decisions and tenants separate', () => {
    const audit = new AuditRepository(new InMemoryDatabase())
    const tenantB = 'tenant_00000000-0000-4000-8000-000000000212'
    audit.append(decisionEvent('a'), tenantA)
    audit.append(
      {
        ...decisionEvent('b'),
        payload: {
          ...(decisionEvent('b').payload as Record<string, unknown>),
          decision: 'REJECTED'
        }
      },
      tenantA
    )
    audit.append(decisionEvent('c'), tenantB)
    expect(audit.listEvidence({ limit: 10, offset: 0 }).pageInfo.total).toBe(3)
  })

  it('finds the recorded decision for convergence reads', () => {
    const audit = new AuditRepository(new InMemoryDatabase())
    expect(
      audit.findApprovalDecision(
        { approvalId: 'appr_atomic_1', decision: 'APPROVED' },
        tenantA
      )
    ).toBeNull()
    const recorded = audit.append(decisionEvent('first'), tenantA)
    expect(
      audit.findApprovalDecision(
        { approvalId: 'appr_atomic_1', decision: 'APPROVED' },
        tenantA
      )?.id
    ).toBe(recorded.id)
    expect(
      audit.findApprovalDecision(
        { approvalId: 'appr_atomic_1', decision: 'REJECTED' },
        tenantA
      )
    ).toBeNull()
  })
})
