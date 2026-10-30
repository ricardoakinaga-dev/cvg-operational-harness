import { ApprovalEngine } from '@cvg/approval-engine'
import { describe, expect, it } from 'vitest'
import { DurableApprovalEngineAdapter } from '../operational-approval-adapter.ts'
import type { ApprovalRequest } from '@cvg/harness-contracts'

// SPEC 0291 phase 1, control: on the durable kernel path the approval IS bound to the execution
// that asked (`executionRef`), so a granted approval is not answered to another execution.
const tenantId =
  'tenant_00000000-0000-4000-8000-000000000732' as ApprovalRequest['tenantId']
const request = (executionRef: string): ApprovalRequest => ({
  tenantId,
  agentId: 'agent.synthetic' as ApprovalRequest['agentId'],
  operationKey: 'approval-session-binding-1',
  toolId: 'synthetic.tool',
  summary: 'synthetic approval',
  correlationId: 'correlation_binding_1' as ApprovalRequest['correlationId'],
  executionRef,
  operatorId: 'agent.synthetic',
  agentVersion: 'v1' as NonNullable<ApprovalRequest['agentVersion']>,
  action: 'tool.execute',
  resource: { type: 'tool', id: 'synthetic.tool' },
  payload: { value: 1 },
  policyVersion: 'policy-v1'
})

describe('durable approval adapter: execution binding (SPEC 0291 control)', () => {
  it('answers a granted approval to its own execution and denies it to another one with the same operation key', async () => {
    const authority = new ApprovalEngine()
    const adapter = new DurableApprovalEngineAdapter(authority)
    const own = await adapter.request(request('exec_A'))
    expect(own.status).toBe('PENDING')
    authority.approve(tenantId, own.approvalId!, { approverId: 'approver' })
    expect((await adapter.request(request('exec_A'))).status).toBe('APPROVED')
    const other = await adapter.request(request('exec_B'))
    expect(other.status).toBe('DENIED')
    expect(other.reason).toMatch(/no longer matches/)
  })
})
