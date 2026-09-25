import { describe, expect, it } from 'vitest'
import {
  reconcileApprovalDecision,
  type ApprovalReconciliationPorts,
  type ReconciliationApproval
} from '../approval-reconciliation.ts'

const approval: ReconciliationApproval = {
  approvalId: 'approval_causality_1',
  status: 'APPROVED',
  approverId: 'operator.human.synthetic',
  decisionActorType: 'Approver',
  decisionReason: 'synthetic approval reason',
  decisionCorrelationId: 'corr_decision_causality_1',
  decisionCommandKey: 'cmd_decision_causality_1',
  policyVersion: 'policy-causality-v1',
  payloadHash: 'a'.repeat(64),
  operationKey: 'operation.causality.1',
  correlationId: 'corr_request_causality_1'
}

function portsFor(
  current: ReconciliationApproval,
  observed: {
    execution?: Record<string, unknown>
    audit?: Record<string, unknown>
  }
): ApprovalReconciliationPorts {
  return {
    getApproval: () => current,
    resolveExecution: async (input) => {
      observed.execution = input
      return { id: 'execution_causality_1', state: 'QUEUED' }
    },
    appendAudit: async (event) => {
      observed.audit = event
    }
  }
}

describe('approval decision reconciliation (AUD20-007)', () => {
  it('replays the persisted decision envelope without worker metadata', async () => {
    const observed: {
      execution?: Record<string, unknown>
      audit?: Record<string, unknown>
    } = {}

    await reconcileApprovalDecision(portsFor(approval, observed), {
      tenantId: 'tenant_causality_synthetic',
      executionId: 'execution_causality_1',
      approvalId: approval.approvalId,
      decision: 'APPROVED'
    })

    expect(observed.execution).toMatchObject({
      actorId: approval.approverId,
      decision: 'APPROVED',
      reason: approval.decisionReason
    })
    expect(observed.audit).toMatchObject({
      actorType: 'Approver',
      actorId: approval.approverId,
      correlationId: approval.decisionCorrelationId,
      policyVersion: approval.policyVersion,
      payload: {
        decision: 'approved',
        reason: approval.decisionReason,
        payloadHash: approval.payloadHash,
        commandKey: approval.decisionCommandKey,
        operationKey: approval.operationKey
      }
    })
  })

  it('fails closed before mutation when the persisted envelope is incomplete', async () => {
    const observed: {
      execution?: Record<string, unknown>
      audit?: Record<string, unknown>
    } = {}
    const { decisionCommandKey: _decisionCommandKey, ...incomplete } = approval
    void _decisionCommandKey

    await expect(
      reconcileApprovalDecision(portsFor(incomplete, observed), {
        tenantId: 'tenant_causality_synthetic',
        executionId: 'execution_causality_1',
        approvalId: approval.approvalId,
        decision: 'APPROVED'
      })
    ).rejects.toThrow('complete persisted approval decision envelope')
    expect(observed).toEqual({})
  })
})
