/**
 * Neutral consumer example (HISO-009): a synthetic veterinary-hospital
 * reception agent composed only through the supported public package exports
 * listed in docs/architecture/PUBLIC_API.md.
 *
 * Everything here is synthetic: one fixed institutional source, a
 * deterministic model provider, in-memory sinks and journal. It has no
 * network, channel, database, patient record, diagnosis or prescription. The
 * appointment capability is gated by approval and never performs a real
 * scheduling effect.
 */
import {
  InMemoryEffectJournal,
  createCapabilityRegistry,
  createOperationalHarness
} from '@cvg/harness'
import type { OperationalHarness } from '@cvg/harness'
import type {
  AgentId,
  AgentProfile,
  AgentVersion,
  ApprovalDecision,
  ApprovalEngine,
  ApprovalId,
  ApprovalRequest,
  AuditEvent,
  AuditSink,
  CapabilityRegistration,
  ConversationId,
  CorrelationId,
  ExecutionBudget,
  ModelGateway,
  ModelRequest,
  ModelResult,
  Orchestrator,
  OrchestratorDecision,
  OrchestratorInput,
  PolicyDecision,
  PolicyEngine,
  PolicyRequest,
  RuntimeInput,
  SessionId,
  TelemetryEvent,
  TelemetrySink,
  TenantId,
  ToolResult,
  TraceId
} from '@cvg/harness-contracts'
import {
  DeterministicModelProvider,
  InMemoryCostBudgetStore,
  ModelGateway as ProviderModelGateway,
  PromptRegistry
} from '@cvg/model-gateway'
import type {
  ModelGatewayEvent,
  ModelProfile,
  ProviderRequest,
  ProviderResult
} from '@cvg/model-gateway'

/** `@cvg/model-gateway` requires `tenant_<uuid>` tenant identifiers. */
export const RECEPTION_TENANT_ID =
  'tenant_00000000-0000-4000-8000-00000000a001' as TenantId

export const LOOKUP_OPENING_HOURS = 'reception.lookup_opening_hours'
export const REQUEST_APPOINTMENT_SLOT = 'reception.request_appointment_slot'
const CAPABILITY_VERSION = '1.0.0'
const PROVIDER_ID = 'reception-agent-example'
const PROVIDER_VERSION = '0.1.0'

/** Fixed synthetic institutional source; it is not a real hospital schedule. */
export const SYNTHETIC_OPENING_HOURS_SOURCE = {
  sourceId: 'reception.synthetic.opening-hours',
  sourceVersion: '2026-10-01',
  synthetic: true,
  text: 'Hospital veterinário sintético: recepção aberta de segunda a sexta, das 08:00 às 20:00, e aos sábados, das 08:00 às 14:00.'
} as const

export const SYNTHETIC_GREETING =
  'Olá! Sou o agente sintético da recepção. Posso informar o horário de funcionamento ou encaminhar um pedido de horário para a equipe.'

export const receptionAgentProfile: AgentProfile = {
  id: 'reception-agent' as AgentId,
  version: '0.1.0' as AgentVersion,
  objective:
    'Answer institutional reception questions from approved synthetic sources and route scheduling requests to humans.',
  instructions: [
    'Answer only from the configured institutional source.',
    'Never confirm, cancel or reschedule an appointment.',
    'Never give clinical guidance, diagnosis or prescription.'
  ],
  skills: [{ id: 'reception-desk', version: '0.1.0' }],
  tools: [LOOKUP_OPENING_HOURS, REQUEST_APPOINTMENT_SLOT],
  policies: ['reception-policy']
}

export const receptionBudget: ExecutionBudget = {
  maxSteps: 1,
  maxModelCalls: 1,
  maxToolCalls: 1,
  maxDurationMs: 5_000,
  maxCostUsd: 0.01,
  maxTokens: 512
}

const SYNTHETIC_NOW = '2026-10-07T12:00:00.000Z'
const RECEPTION_PROMPT_ID = 'reception.synthetic.system'
const RECEPTION_PROMPT_VERSION = '0.1.0'
/** Same text the single-pass runtime sends as its system message. */
const RECEPTION_PROMPT_CONTENT = `${receptionAgentProfile.objective}\n${receptionAgentProfile.instructions.join('\n')}`

export function createReceptionAgentInput(
  userMessage: string,
  turnId = 'turn-1'
): RuntimeInput {
  return {
    agent: receptionAgentProfile,
    tenantId: RECEPTION_TENANT_ID,
    conversationId: `conversation_reception_${turnId}` as ConversationId,
    sessionId: 'session_reception_synthetic' as SessionId,
    correlationId: `correlation_reception_${turnId}` as CorrelationId,
    traceId: `trace_reception_${turnId}` as TraceId,
    userMessage,
    context: {
      values: { synthetic: true },
      sourceIds: [SYNTHETIC_OPENING_HOURS_SOURCE.sourceId],
      capturedAt: SYNTHETIC_NOW
    },
    state: { version: 1, values: {}, updatedAt: SYNTHETIC_NOW },
    budget: receptionBudget,
    runtimeProfile: 'single_pass'
  }
}

export interface ReceptionAgentOptions {
  /** Synthetic human decision; the example never approves an effect. */
  readonly approvalDecision?: 'PENDING' | 'DENIED'
  readonly auditFailure?: boolean
}

export interface ReceptionAgentFixture {
  readonly harness: OperationalHarness
  readonly effectJournal: InMemoryEffectJournal
  readonly auditEvents: AuditEvent[]
  readonly telemetryEvents: TelemetryEvent[]
  /** Events emitted by `@cvg/model-gateway` (ADR-004 provider gateway). */
  readonly modelEvents: ModelGatewayEvent[]
  readonly policyDecisions: PolicyDecision[]
  readonly approvalRequests: ApprovalRequest[]
  readonly providerCalls: { readonly externalCall: boolean }[]
  readonly capabilityCalls: { lookup: number; appointment: number }
}

export function createReceptionAgentFixture(
  options: ReceptionAgentOptions = {}
): ReceptionAgentFixture {
  const auditEvents: AuditEvent[] = []
  const telemetryEvents: TelemetryEvent[] = []
  const modelEvents: ModelGatewayEvent[] = []
  const policyDecisions: PolicyDecision[] = []
  const approvalRequests: ApprovalRequest[] = []
  const providerCalls: { externalCall: boolean }[] = []
  const capabilityCalls = { lookup: 0, appointment: 0 }

  const registrations: CapabilityRegistration[] = [
    {
      descriptor: {
        id: LOOKUP_OPENING_HOURS,
        version: CAPABILITY_VERSION,
        description:
          'Read the reception opening hours from the fixed synthetic institutional source.',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        },
        outputSchema: {
          type: 'object',
          required: ['answer', 'sourceId', 'sourceVersion', 'synthetic']
        },
        risk: 'LOW',
        sideEffect: 'READ',
        idempotent: true,
        requiresApproval: false,
        origin: 'knowledge',
        providerId: PROVIDER_ID,
        providerVersion: PROVIDER_VERSION
      },
      implementation: {
        validateInput: (input) =>
          isPlainObject(input) && Object.keys(input).length === 0,
        async execute(): Promise<ToolResult> {
          capabilityCalls.lookup += 1
          return {
            status: 'SUCCEEDED',
            output: {
              answer: SYNTHETIC_OPENING_HOURS_SOURCE.text,
              sourceId: SYNTHETIC_OPENING_HOURS_SOURCE.sourceId,
              sourceVersion: SYNTHETIC_OPENING_HOURS_SOURCE.sourceVersion,
              synthetic: true
            }
          }
        },
        validateOutput: (output) =>
          isPlainObject(output) &&
          output.sourceId === SYNTHETIC_OPENING_HOURS_SOURCE.sourceId &&
          typeof output.answer === 'string'
      }
    },
    {
      descriptor: {
        id: REQUEST_APPOINTMENT_SLOT,
        version: CAPABILITY_VERSION,
        description:
          'Ask the reception team for an appointment slot; requires human approval and never changes a real schedule.',
        inputSchema: {
          type: 'object',
          required: ['service', 'preferredPeriod'],
          additionalProperties: false
        },
        outputSchema: { type: 'object', required: ['status'] },
        risk: 'MEDIUM',
        sideEffect: 'WRITE',
        idempotent: false,
        requiresApproval: true,
        origin: 'skill',
        providerId: PROVIDER_ID,
        providerVersion: PROVIDER_VERSION
      },
      implementation: {
        validateInput: (input) =>
          isPlainObject(input) &&
          input.service === 'consulta-geral' &&
          ['MORNING', 'AFTERNOON', 'ANY'].includes(
            String(input.preferredPeriod)
          ),
        async execute(): Promise<ToolResult> {
          // Synthetic body: even if reached, it records nothing outside this
          // process. The journey asserts it is never reached.
          capabilityCalls.appointment += 1
          return { status: 'SUCCEEDED', output: { status: 'SYNTHETIC_ONLY' } }
        },
        validateOutput: (output) =>
          isPlainObject(output) && output.status === 'SYNTHETIC_ONLY'
      }
    }
  ]

  const policy: PolicyEngine = {
    async evaluate(request: PolicyRequest): Promise<PolicyDecision> {
      const decision = decideReceptionPolicy(request)
      policyDecisions.push(decision)
      return decision
    }
  }

  const approvals: ApprovalEngine = {
    async request(request): Promise<ApprovalDecision> {
      approvalRequests.push(request)
      const approvalId =
        `approval_reception_${approvalRequests.length}` as ApprovalId
      if (options.approvalDecision === 'DENIED') {
        return {
          status: 'DENIED',
          approvalId,
          reason: 'Synthetic reception team declined the request.'
        }
      }
      return {
        status: 'PENDING',
        approvalId,
        reason:
          'Pedido de horário encaminhado para a equipe da recepção; nenhuma agenda foi alterada.'
      }
    }
    // No `execution` port on purpose: without it the harness refuses to run
    // an approved effect (single-use approval, I9), so this example cannot
    // schedule anything even if a decision were APPROVED.
  }

  const audit: AuditSink = {
    async append(event) {
      if (options.auditFailure) throw new Error('synthetic audit failure')
      auditEvents.push(event)
    }
  }

  const telemetry: TelemetrySink = {
    record(event) {
      telemetryEvents.push(event)
    }
  }

  const effectJournal = new InMemoryEffectJournal()
  const harness = createOperationalHarness({
    orchestrator: new ReceptionIntentOrchestrator(),
    modelGateway: createReceptionModelGateway({
      tenantId: RECEPTION_TENANT_ID,
      modelEvents,
      providerCalls
    }),
    policy,
    approvals,
    capabilities: createCapabilityRegistry(registrations),
    effectJournal,
    audit,
    telemetry
  })

  return {
    harness,
    effectJournal,
    auditEvents,
    telemetryEvents,
    modelEvents,
    policyDecisions,
    approvalRequests,
    providerCalls,
    capabilityCalls
  }
}

export interface ReceptionJourney {
  readonly fixture: ReceptionAgentFixture
  readonly greeting: Awaited<ReturnType<OperationalHarness['run']>>
  readonly openingHours: Awaited<ReturnType<OperationalHarness['run']>>
  readonly appointment: Awaited<ReturnType<OperationalHarness['run']>>
  readonly clinicalQuestion: Awaited<ReturnType<OperationalHarness['run']>>
}

/** Synthetic journey: greeting, institutional answer, gated request, handoff. */
export async function runReceptionJourney(
  fixture: ReceptionAgentFixture = createReceptionAgentFixture()
): Promise<ReceptionJourney> {
  const greeting = await fixture.harness.run(
    createReceptionAgentInput('Bom dia!', 'greeting')
  )
  const openingHours = await fixture.harness.run(
    createReceptionAgentInput(
      'Qual é o horário de funcionamento da recepção?',
      'opening-hours'
    )
  )
  const appointment = await fixture.harness.run(
    createReceptionAgentInput(
      'Quero marcar uma consulta para a manhã de sexta.',
      'appointment'
    )
  )
  const clinicalQuestion = await fixture.harness.run(
    createReceptionAgentInput(
      'Qual dose de remédio posso dar em casa?',
      'clinical-question'
    )
  )
  return { fixture, greeting, openingHours, appointment, clinicalQuestion }
}

/** Operation key used for a capability requested in one synthetic turn. */
export function receptionOperationKey(
  correlationId: string,
  capabilityId: string
): string {
  return `${correlationId}:${capabilityId}`
}

/**
 * Deterministic intent routing. It only returns decisions; the harness
 * resolves, governs and executes capabilities.
 */
class ReceptionIntentOrchestrator implements Orchestrator {
  async decideNextStep(
    input: OrchestratorInput
  ): Promise<OrchestratorDecision> {
    const text = normalize(input.runtime.userMessage)
    if (/(dose|remedio|medicamento|diagnostic|sintoma|receita)/.test(text)) {
      return {
        action: 'HANDOFF',
        response:
          'Orientação clínica não é feita por este agente; a conversa precisa de atendimento humano.',
        reason: 'clinical_guidance_out_of_scope'
      }
    }
    if (/(agend|marcar|consulta|vaga)/.test(text)) {
      return this.#call(input, REQUEST_APPOINTMENT_SLOT, {
        service: 'consulta-geral',
        preferredPeriod: /manha/.test(text)
          ? 'MORNING'
          : /tarde/.test(text)
            ? 'AFTERNOON'
            : 'ANY'
      })
    }
    if (/(funcionamento|abre|fecha|horario)/.test(text)) {
      return this.#call(input, LOOKUP_OPENING_HOURS, {})
    }
    return { action: 'RESPOND' }
  }

  #call(
    input: OrchestratorInput,
    capabilityId: string,
    capabilityInput: Record<string, unknown>
  ): OrchestratorDecision {
    const descriptor = input.availableTools.find(
      (tool) => tool.id === capabilityId
    )
    if (!descriptor) {
      return {
        action: 'HANDOFF',
        response: 'A recepção humana precisa responder esta mensagem.',
        reason: 'capability_unavailable'
      }
    }
    return {
      action: 'CALL_TOOL',
      toolInvocation: {
        toolId: descriptor.id,
        toolVersion: descriptor.version,
        input: capabilityInput,
        operationKey: receptionOperationKey(
          input.runtime.correlationId,
          descriptor.id
        )
      },
      reason: `intent:${descriptor.id}`
    }
  }
}

/** Consumer policy: reads are allowed; anything that writes needs a human. */
function decideReceptionPolicy(request: PolicyRequest): PolicyDecision {
  const policyVersion = 'reception-policy@0.1.0'
  const { tool } = request
  if (tool.risk === 'HIGH' || tool.risk === 'CRITICAL') {
    return {
      outcome: 'HANDOFF',
      reason: 'High-risk capabilities are handled by people.',
      policyVersion
    }
  }
  if (
    tool.requiresApproval ||
    tool.sideEffect === 'WRITE' ||
    tool.sideEffect === 'EXTERNAL'
  ) {
    return {
      outcome: 'REQUIRE_APPROVAL',
      reason: 'Scheduling requests require a reception team decision.',
      policyVersion
    }
  }
  if (tool.sideEffect === 'NONE' || tool.sideEffect === 'READ') {
    return {
      outcome: 'ALLOW',
      reason: 'Synthetic institutional read.',
      policyVersion
    }
  }
  return { outcome: 'DENY', reason: 'Unsupported capability.', policyVersion }
}

/**
 * Consumer-side bridge from the harness model port (`ModelGateway.complete`)
 * to the provider gateway in `@cvg/model-gateway` (`ModelGateway.generate`),
 * so both ADR-004 layers apply: the harness execution budget, audit and
 * telemetry, and the gateway prompt, routing, cost budget, timeout and
 * events. The harness `ModelRequest` carries no tenant, so the bridge is bound
 * to one tenant at composition time.
 */
function createReceptionModelGateway(options: {
  readonly tenantId: TenantId
  readonly modelEvents: ModelGatewayEvent[]
  readonly providerCalls: { externalCall: boolean }[]
}): ModelGateway {
  const clock = () => new Date(SYNTHETIC_NOW)
  const prompts = new PromptRegistry()
  const prompt = prompts.register({
    promptId: RECEPTION_PROMPT_ID,
    version: RECEPTION_PROMPT_VERSION,
    content: RECEPTION_PROMPT_CONTENT,
    owner: PROVIDER_ID,
    approvedBy: 'synthetic-reviewer',
    status: 'approved',
    effectiveFrom: '2026-10-01T00:00:00.000Z',
    classification: 'INTERNAL'
  })
  const provider = new DeterministicModelProvider({
    id: 'reception-deterministic',
    model: 'reception-synthetic-v1',
    respond: (request: ProviderRequest): ProviderResult => {
      options.providerCalls.push({ externalCall: false })
      const inputChars =
        (request.input.system?.length ?? 0) +
        request.input.messages.reduce(
          (total, message) => total + message.content.length,
          0
        )
      return {
        text: SYNTHETIC_GREETING,
        usage: {
          inputTokens: Math.ceil(inputChars / 4),
          outputTokens: Math.ceil(SYNTHETIC_GREETING.length / 4)
        },
        providerId: 'reception-deterministic',
        model: request.model,
        externalCall: false,
        finishReason: 'stop'
      }
    }
  })
  const profile: ModelProfile = {
    name: 'fast',
    providerId: 'reception-deterministic',
    model: 'reception-synthetic-v1',
    location: 'local',
    temperature: 0,
    maxTokens: 256,
    timeoutMs: 2_000,
    maxCostUsd: 0.01,
    estimatedCostUsd: 0.0001,
    maxRetries: 0,
    pricing: { inputPer1kUsd: 0.001, outputPer1kUsd: 0.002 }
  }
  const gateway = new ProviderModelGateway({
    providers: [provider],
    profiles: { fast: profile },
    prompts,
    budget: {
      store: new InMemoryCostBudgetStore(),
      limits: { request: 0.01, tenant: 0.05 }
    },
    retry: { maxRetries: 0 },
    clock,
    onEvent: (event) => options.modelEvents.push(event),
    defaultTimeoutMs: 2_000
  })
  let sequence = 0

  return {
    async complete(request: ModelRequest): Promise<ModelResult> {
      const system = request.messages
        .filter((message) => message.role === 'system')
        .map((message) => message.content)
        .join('\n')
      if (system !== RECEPTION_PROMPT_CONTENT) {
        throw new Error('system message differs from the approved prompt')
      }
      const messages = request.messages.flatMap((message) => {
        if (message.role === 'system') return []
        if (message.role === 'tool') {
          throw new Error('tool messages are not forwarded by this bridge')
        }
        return [{ role: message.role, content: message.content }]
      })
      sequence += 1
      const result = await gateway.generate({
        requestId: `${request.correlationId}:model:${sequence}`,
        tenantId: options.tenantId,
        correlationId: request.correlationId,
        promptId: RECEPTION_PROMPT_ID,
        promptVersion: RECEPTION_PROMPT_VERSION,
        promptSha256: prompt.sha256,
        modelProfile: 'fast',
        dataClassification: 'INTERNAL',
        input: { system, messages },
        timeoutMs: Math.max(
          100,
          Math.min(profile.timeoutMs, request.budget.maxDurationMs)
        ),
        maxTokens: Math.max(
          1,
          Math.min(profile.maxTokens, request.budget.maxTokens)
        ),
        ...(request.signal ? { signal: request.signal } : {})
      })
      return {
        text: result.output.text,
        provider: result.providerId,
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        costUsd: result.costUsd
      }
    }
  }
}

function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
