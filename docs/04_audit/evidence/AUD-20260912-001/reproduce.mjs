const root = process.cwd()
const imp = (path) => import(`${root}/${path}`)
const { ApprovalEngine } = await imp('packages/approval-engine/src/index.ts')
const { ModelGateway, PromptRegistry, DeterministicModelProvider } = await imp(
  'packages/model-gateway/src/index.ts'
)
const { PolicyEngine } = await imp('packages/policy-engine/src/index.ts')
const { HashChainedAuditLedger, InMemoryTelemetry } = await imp(
  'packages/observability/src/index.ts'
)
const { GovernedAgentRuntime } = await imp(
  'packages/agent-runtime/src/index.ts'
)
const { ChannelGateway } = await imp('packages/channel-gateway/src/gateway.ts')
const { ControlledFakeChannelAdapter } = await imp(
  'packages/channel-gateway/src/adapters/fake.ts'
)
const { evaluateReadiness } = await imp('apps/api/src/readiness.ts')
const tenantId = 'tenant_00000000-0000-4000-8000-000000000001'
const correlationId = 'corr_00000000-0000-4000-8000-000000000001'
function harness({ failOutbox = false, failModel = false } = {}) {
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'audit',
    version: '1',
    content: 'synthetic audit',
    owner: 'audit',
    approvedBy: 'fixture',
    status: 'approved',
    effectiveFrom: '2026-01-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId
  })
  const provider = new DeterministicModelProvider({
    respond: () => {
      if (failModel) throw new Error('synthetic model failure')
      return {
        text: 'UNAPPROVED_MODEL_PAYLOAD',
        usage: { inputTokens: 1, outputTokens: 1 },
        providerId: 'deterministic',
        model: 'deterministic-v1',
        externalCall: false
      }
    }
  })
  const modelGateway = new ModelGateway({
    providers: [provider],
    profiles: {
      fast: {
        name: 'fast',
        providerId: 'deterministic',
        model: 'deterministic-v1',
        location: 'local',
        temperature: 0,
        maxTokens: 32,
        timeoutMs: 1000,
        maxCostUsd: 1,
        estimatedCostUsd: 0,
        maxRetries: 0,
        pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 }
      }
    },
    prompts,
    retry: { maxRetries: 0 }
  })
  const approvals = new ApprovalEngine()
  const effects = []
  const runtime = new GovernedAgentRuntime({
    policy: new PolicyEngine(),
    approvals,
    modelGateway,
    telemetry: new InMemoryTelemetry(),
    audit: new HashChainedAuditLedger(),
    toolExecutor: async (x) => {
      effects.push(x.payload)
      return { result: { synthetic: true } }
    },
    outbox: async () => {
      if (failOutbox) throw new Error('synthetic outbox failure')
      return { eventId: 'evt_audit' }
    }
  })
  return { runtime, approvals, effects }
}
const input = {
  tenantId,
  operatorId: 'op_audit',
  operatorRole: 'Supervisor',
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentVersion: 'v1',
  agentProfile: 'secretary',
  conversationId: 'conv_audit',
  correlationId,
  capability: 'appointment.create',
  action: 'appointment.create',
  resource: { type: 'appointment', id: 'apt_synthetic', tenantId },
  dataClassification: 'INTERNAL',
  prompt: { promptId: 'audit', version: '1' },
  modelProfile: 'fast',
  modelMessages: { messages: [{ role: 'user', content: 'synthetic fixture' }] },
  idempotencyKey: 'audit_same_operation'
}
const evidence = {}
const steps = harness()
const stepResult = await steps.runtime.runTurn({
  ...input,
  limits: { maxSteps: 1 }
})
evidence.maxSteps = {
  outcome: stepResult.outcome,
  toolCalls: steps.effects.length
}
const modify = harness()
const modified = await modify.runtime.runTurn({
  ...input,
  capability: 'appointment.modify',
  action: 'appointment.modify'
})
evidence.modifyWithoutApproval = {
  outcome: modified.outcome,
  decision: modified.decision.decision,
  toolCalls: modify.effects.length
}
const binding = harness()
const cancel = {
  ...input,
  capability: 'appointment.cancel',
  action: 'appointment.cancel',
  approvalPayload: { text: 'APPROVED_PAYLOAD' }
}
const request = await binding.runtime.runTurn(cancel)
binding.approvals.submit(tenantId, request.approvalId, 'op_audit')
binding.approvals.approve(tenantId, request.approvalId, {
  approverId: 'op_reviewer'
})
const result = await binding.runtime.runTurn({
  ...cancel,
  approvalId: request.approvalId
})
evidence.approvalBinding = {
  outcome: result.outcome,
  approved: cancel.approvalPayload,
  executed: binding.effects[0]
}
const failure = harness({ failModel: true })
const req = await failure.runtime.runTurn(cancel)
failure.approvals.submit(tenantId, req.approvalId, 'op_audit')
failure.approvals.approve(tenantId, req.approvalId, {
  approverId: 'op_reviewer'
})
const failed = await failure.runtime.runTurn({
  ...cancel,
  approvalId: req.approvalId
})
evidence.approvalBeforeFailure = {
  outcome: failed.outcome,
  reason: failed.reason,
  approvalStatus: failure.approvals.get(tenantId, req.approvalId).status,
  toolCalls: failure.effects.length
}
const duplicate = harness({ failOutbox: true })
const first = await duplicate.runtime.runTurn(input)
const second = await duplicate.runtime.runTurn(input)
evidence.outboxFailureReplay = {
  first: first.reason,
  second: second.reason,
  toolCalls: duplicate.effects.length,
  idempotencyKey: input.idempotencyKey
}
const adapter = new ControlledFakeChannelAdapter()
const gateway = new ChannelGateway({ outboundAdapters: [adapter] })
const outbound = {
  messageId: 'msg_audit',
  tenantId,
  conversationId: 'conv_audit',
  channel: 'whatsapp',
  recipient: { id: 'synthetic-recipient', type: 'phone' },
  body: { text: 'synthetic', attachments: [] },
  correlationId,
  idempotencyKey: `${tenantId}:whatsapp:audit`,
  metadata: {}
}
await Promise.all([
  gateway.dispatch(outbound, { takeoverActive: false }),
  gateway.dispatch(outbound, { takeoverActive: false })
])
evidence.channelRace = { dispatchCalls: 2, sends: adapter.sent.length }
evidence.readinessWithoutProbe = evaluateReadiness({
  persistenceMode: 'postgres-pool',
  durableInbound: true,
  production: true
})
console.log(JSON.stringify(evidence, null, 2))
