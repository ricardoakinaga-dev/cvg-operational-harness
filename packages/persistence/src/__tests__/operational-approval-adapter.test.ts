import { ApprovalEngine } from '@cvg/approval-engine'
import { describe, expect, it } from 'vitest'
import { DurableApprovalEngineAdapter } from '../operational-approval-adapter.ts'
import type { ApprovalRequest } from '@cvg/harness-contracts'

const tenantId =
  'tenant_00000000-0000-4000-8000-000000000731' as ApprovalRequest['tenantId']

function request(): ApprovalRequest {
  return {
    tenantId,
    agentId: 'agent.synthetic' as ApprovalRequest['agentId'],
    operationKey: 'approval-adapter-concurrent-1',
    toolId: 'synthetic.tool',
    summary: 'synthetic approval',
    correlationId:
      'correlation_approval_adapter_1' as ApprovalRequest['correlationId'],
    executionRef: 'exec_synthetic_approval_adapter_1',
    operatorId: 'agent.synthetic',
    agentVersion: 'v1' as NonNullable<ApprovalRequest['agentVersion']>,
    action: 'tool.execute',
    resource: { type: 'tool', id: 'synthetic.tool' },
    payload: { value: 1 },
    policyVersion: 'policy-v1'
  }
}

describe('durable approval adapter', () => {
  it('serializes concurrent approval requests for one execution binding', async () => {
    const authority = new ApprovalEngine()
    const adapter = new DurableApprovalEngineAdapter(authority)

    const [first, second] = await Promise.all([
      adapter.request(request()),
      adapter.request(request())
    ])

    expect(first.status).toBe('PENDING')
    expect(second).toEqual(first)
    expect(authority.list(tenantId)).toHaveLength(1)
  })

  it('fails closed when the execution binding is absent', async () => {
    const authority = new ApprovalEngine()
    const adapter = new DurableApprovalEngineAdapter(authority)
    const { executionRef: _executionRef, ...unbound } = request()
    void _executionRef

    await expect(adapter.request(unbound)).rejects.toThrow(
      'requires an execution reference'
    )
    expect(authority.list(tenantId)).toHaveLength(0)
  })

  describe('SPEC 0317 G1 requester', () => {
    const requester = { kind: 'human', id: 'human.a', tenantId } as const
    const requested = (): ApprovalRequest => ({
      ...request(),
      operationKey: 'approval-adapter-requester',
      requestedBy: requester
    })
    const execution = (approvalId: string) => ({
      tenantId,
      approvalId: approvalId as never,
      agentId: 'agent.synthetic' as ApprovalRequest['agentId'],
      agentVersion: 'v1' as NonNullable<ApprovalRequest['agentVersion']>,
      action: 'tool.execute',
      resource: { type: 'tool', id: 'synthetic.tool' },
      payload: { value: 1 },
      policyVersion: 'policy-v1',
      operationKey: 'approval-adapter-requester',
      executionRef: 'exec_synthetic_approval_adapter_1'
    })

    it('persists the requester and keeps operatorId for the agent', async () => {
      const authority = new ApprovalEngine()
      const adapter = new DurableApprovalEngineAdapter(authority)
      await adapter.request(requested())
      const [record] = authority.list(tenantId)
      expect(record?.requestedBy).toEqual(requester)
      expect(record?.operatorId).toBe('agent.synthetic')
    })

    it('does not reuse an approval for another requester, on a retry or after a restart', async () => {
      const authority = new ApprovalEngine()
      await new DurableApprovalEngineAdapter(authority).request(requested())
      const decision = await new DurableApprovalEngineAdapter(
        authority
      ).request({
        ...requested(),
        requestedBy: { ...requester, id: 'human.b' }
      })
      expect(decision.status).toBe('DENIED')
      expect(authority.list(tenantId)).toHaveLength(1)
    })

    it('does not consume an approval without a requester, even if APPROVED', async () => {
      const authority = new ApprovalEngine()
      const adapter = new DurableApprovalEngineAdapter(authority)
      const { requestedBy: _unknown, ...legacy } = requested()
      void _unknown
      const pending = await adapter.request(legacy)
      const approvalId = pending.approvalId as string
      authority.approve(tenantId, approvalId, { approverId: 'human.b' })
      await expect(
        adapter.execution.begin(execution(approvalId))
      ).rejects.toThrow('no trusted separate requester')
      expect(authority.get(tenantId, approvalId).status).toBe('APPROVED')
    })

    it('consumes an approval decided by someone other than the requester', async () => {
      const authority = new ApprovalEngine()
      const adapter = new DurableApprovalEngineAdapter(authority)
      const pending = await adapter.request(requested())
      const approvalId = pending.approvalId as string
      authority.approve(tenantId, approvalId, { approverId: 'human.b' })
      await expect(
        adapter.execution.begin(execution(approvalId))
      ).resolves.toMatchObject({ approvalId })
    })
  })
})
