// Independent review harness (P1). Fresh context, no builder code copied.
// Wires the governed runtime with the real workspace sources.
import { z } from 'zod'
import { ApprovalEngine, InMemoryApprovalStore } from '@cvg/approval-engine'
import {
  DeterministicModelProvider,
  ModelGateway,
  PromptRegistry,
  type ModelProfile
} from '@cvg/model-gateway'
import {
  PolicyEngine,
  type Capability,
  type PolicyDocument
} from '@cvg/policy-engine'
import {
  HashChainedAuditLedger,
  InMemoryTelemetry,
  type ActiveSpan,
  type Attributes,
  type Telemetry,
  type TraceContext
} from '@cvg/observability'
import {
  GovernedAgentRuntime,
  type EffectScope,
  type GovernedTurnInput,
  type OutboxEnqueueInput,
  type ToolInvocation
} from '/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/runtime.ts'

export const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
export const AGENT = 'agent_00000000-0000-4000-8000-000000000001'
export const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
export const NOW = new Date('2026-09-12T12:00:00.000Z')
export const PAYLOAD_SCHEMA = z.object({ text: z.string() })

export class SpanTracker {
  open = new Set<string>()
  started = 0
  ended = 0
  names: string[] = []
}

class TrackingSpan implements ActiveSpan {
  constructor(
    private readonly inner: ActiveSpan,
    private readonly tracker: SpanTracker
  ) {
    this.tracker.open.add(inner.spanId)
  }
  get name(): string {
    return this.inner.name
  }
  get traceId(): string {
    return this.inner.traceId
  }
  get spanId(): string {
    return this.inner.spanId
  }
  get context(): TraceContext {
    return this.inner.context
  }
  setAttribute(key: string, value: string | number | boolean): ActiveSpan {
    this.inner.setAttribute(key, value)
    return this
  }
  child(name: string, attributes?: Attributes): ActiveSpan {
    this.tracker.started += 1
    this.tracker.names.push(name)
    return new TrackingSpan(this.inner.child(name, attributes), this.tracker)
  }
  end(status?: 'ok' | 'error', errorCode?: string): void {
    if (this.tracker.open.has(this.spanId)) {
      this.tracker.open.delete(this.spanId)
      this.tracker.ended += 1
    }
    this.inner.end(status, errorCode)
  }
}

export class TrackingTelemetry implements Telemetry {
  readonly tracker = new SpanTracker()
  constructor(private readonly inner: InMemoryTelemetry) {}
  startSpan(
    name: string,
    attributes?: Attributes,
    parent?: TraceContext
  ): ActiveSpan {
    this.tracker.started += 1
    this.tracker.names.push(name)
    return new TrackingSpan(
      this.inner.startSpan(name, attributes, parent),
      this.tracker
    )
  }
  recordMetric(name: string, value: number, attributes?: Attributes): void {
    this.inner.recordMetric(name, value, attributes)
  }
  log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    fields?: Record<string, unknown>
  ): void {
    this.inner.log(level, message, fields)
  }
  spans() {
    return this.inner.spans()
  }
  metrics() {
    return this.inner.metrics()
  }
  logs() {
    return this.inner.logs()
  }
}

export interface HarnessOptions {
  responses?: readonly string[]
  documents?: PolicyDocument[]
  effectScopes?: Partial<Record<Capability, EffectScope>>
  realEffectAuthorizations?: string[]
  now?: () => Date
  toolExecutor?: (invocation: ToolInvocation) => Promise<{ result: unknown }>
  store?: InMemoryApprovalStore
  effectJournal?: import('/home/ricardo/cvg-agent-secretary-v2/packages/agent-runtime/src/effect-journal.ts').EffectJournalPort
  reservationTtlMs?: number
  policy?: PolicyEngine
  modelGateway?: unknown
  outbox?: (event: OutboxEnqueueInput) => Promise<{ eventId: string }>
}

export function buildHarness(options: HarnessOptions = {}) {
  const now = options.now ?? (() => NOW)
  const prompts = new PromptRegistry()
  prompts.register({
    promptId: 'binding-core',
    version: '1.0.0',
    content: 'You are the CVG secretary.',
    owner: 'platform',
    approvedBy: 'reviewer',
    status: 'approved',
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    classification: 'INTERNAL',
    tenantId: TENANT
  })
  const responses = options.responses ?? [
    JSON.stringify({ text: 'APPROVED_PAYLOAD' })
  ]
  let providerCalls = 0
  const provider = new DeterministicModelProvider({
    respond: () => {
      const index = Math.min(providerCalls, responses.length - 1)
      providerCalls += 1
      return {
        text: responses[index] ?? '{}',
        usage: { inputTokens: 10, outputTokens: 5 },
        providerId: 'deterministic',
        model: 'deterministic-v1',
        externalCall: false
      }
    }
  })
  const profile: ModelProfile = {
    name: 'fast',
    providerId: 'deterministic',
    model: 'deterministic-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 256,
    timeoutMs: 5_000,
    maxCostUsd: 1,
    estimatedCostUsd: 0,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 }
  }
  const modelGateway =
    options.modelGateway ??
    new ModelGateway({
      providers: [provider],
      profiles: { fast: profile },
      prompts,
      clock: now,
      retry: { maxRetries: 0 }
    })
  const policy =
    options.policy ??
    new PolicyEngine({ documents: options.documents ?? [], clock: now })
  const store = options.store ?? new InMemoryApprovalStore()
  const approvals = new ApprovalEngine({ store, clock: now })
  const innerTelemetry = new InMemoryTelemetry({ clock: now })
  const telemetry = new TrackingTelemetry(innerTelemetry)
  const audit = new HashChainedAuditLedger()
  let toolCalls = 0
  const toolInvocations: ToolInvocation[] = []
  const baseTool =
    options.toolExecutor ??
    (async (_invocation: ToolInvocation) => ({ result: { ok: true } }))
  const toolExecutor = async (invocation: ToolInvocation) => {
    toolCalls += 1
    toolInvocations.push(invocation)
    return baseTool(invocation)
  }
  let outboxCalls = 0
  const outboxAttempts: OutboxEnqueueInput[] = []
  const outboxBase =
    options.outbox ??
    (async (event: OutboxEnqueueInput) => ({
      eventId: `evt_${event.idempotencyKey}`
    }))
  const outboxFn = async (event: OutboxEnqueueInput) => {
    outboxCalls += 1
    outboxAttempts.push(event)
    return outboxBase(event)
  }
  const runtime = new GovernedAgentRuntime({
    policy,
    approvals,
    modelGateway: modelGateway as never,
    telemetry,
    audit,
    toolExecutor,
    outbox: outboxFn,
    clock: now,
    ...(options.effectJournal !== undefined
      ? { effectJournal: options.effectJournal }
      : {}),
    ...(options.reservationTtlMs !== undefined
      ? { reservationTtlMs: options.reservationTtlMs }
      : {}),
    ...(options.effectScopes !== undefined
      ? { effectScopes: options.effectScopes }
      : {}),
    ...(options.realEffectAuthorizations !== undefined
      ? { realEffectAuthorizations: options.realEffectAuthorizations }
      : {})
  })
  return {
    runtime,
    approvals,
    policy,
    modelGateway,
    telemetry,
    tracker: telemetry.tracker,
    audit,
    store,
    toolCalls: () => toolCalls,
    toolInvocations,
    outboxCalls: () => outboxCalls,
    outboxAttempts,
    providerCalls: () => providerCalls
  }
}

export type Harness = ReturnType<typeof buildHarness>

export function turnInput(
  overrides: Partial<GovernedTurnInput> = {}
): GovernedTurnInput {
  return {
    tenantId: TENANT,
    operatorId: 'op_1',
    operatorRole: 'Supervisor',
    agentId: AGENT,
    agentVersion: 'v1',
    agentProfile: 'secretary',
    conversationId: 'conv_1',
    correlationId: CORRELATION,
    capability: 'appointment.cancel',
    action: 'appointment.cancel',
    resource: { type: 'appointment', id: 'apt_1', tenantId: TENANT },
    dataClassification: 'INTERNAL',
    prompt: { promptId: 'binding-core', version: '1.0.0' },
    modelProfile: 'fast',
    modelMessages: {
      messages: [{ role: 'user', content: 'cancelar consulta' }]
    },
    structuredOutput: { schemaName: 'PayloadContract', schema: PAYLOAD_SCHEMA },
    ...overrides
  }
}

export function approveApproval(harness: Harness, approvalId: string): void {
  harness.approvals.submit(TENANT, approvalId, 'op_1')
  harness.approvals.approve(TENANT, approvalId, { approverId: 'op_2' })
}

export const FAKE_CANCEL_SCOPE: Partial<Record<Capability, EffectScope>> = {
  'appointment.cancel': 'controlled_fake'
}

export function report(name: string, data: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      probe: name,
      observedAt: new Date().toISOString(),
      ...data
    })
  )
}
