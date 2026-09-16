import { PolicyEngine } from '@cvg/policy-engine'
import { ApprovalEngine } from '@cvg/approval-engine'
import { GovernedAgentRuntime } from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/runtime.ts'
const policy = new PolicyEngine()
const d = policy.evaluate({
  tenantId: 'tenant_00000000-0000-4000-8000-000000000001',
  operatorId: 'op_1',
  operatorRole: 'Supervisor',
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentProfile: 'secretary',
  capability: 'schedule.read',
  action: 'schedule.read',
  correlationId: 'corr_00000000-0000-4000-8000-000000000001',
  resource: { type: 'schedule' },
  context: { dataClassification: 'INTERNAL' }
})
console.log('schedule.read =>', d.decision, d.reason)
const d2 = policy.evaluate({
  tenantId: 'tenant_00000000-0000-4000-8000-000000000001',
  operatorId: 'op_1',
  operatorRole: 'Supervisor',
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentProfile: 'secretary',
  capability: 'appointment.cancel',
  action: 'appointment.cancel',
  correlationId: 'corr_00000000-0000-4000-8000-000000000001',
  resource: { type: 'appointment', id: 'apt_1' },
  context: { dataClassification: 'INTERNAL' }
})
console.log('appointment.cancel =>', d2.decision, d2.reason)
console.log(
  'runtime ctor',
  typeof GovernedAgentRuntime,
  'approvals',
  typeof ApprovalEngine
)
