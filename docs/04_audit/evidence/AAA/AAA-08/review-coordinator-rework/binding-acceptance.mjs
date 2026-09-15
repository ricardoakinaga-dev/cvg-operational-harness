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
const results = []
for (const action of ['appointment.confirm', 'appointment.reschedule', 'appointment.cancel']) {
  const h = harness()
  const request = { ...input, capability: 'appointment.modify', action, resource: { type: 'appointment_draft', id: 'draft_synthetic', tenantId } }
  const result = await h.runtime.runTurn(request)
  results.push({ capability: request.capability, action, resourceType: request.resource.type, outcome: result.outcome, decision: result.decision?.decision, reason: result.decision?.reason, toolCalls: h.effects.length })
}
console.log(JSON.stringify({ fixture: 'synthetic-only; tool records payload in memory', results }, null, 2))
if (!results.every(x => x.outcome === 'denied' && x.decision === 'DENY' && x.reason === 'action_capability_mismatch' && x.toolCalls === 0)) throw new Error('Regression: forbidden action reached the executor')
