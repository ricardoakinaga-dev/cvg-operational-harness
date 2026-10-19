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
})
