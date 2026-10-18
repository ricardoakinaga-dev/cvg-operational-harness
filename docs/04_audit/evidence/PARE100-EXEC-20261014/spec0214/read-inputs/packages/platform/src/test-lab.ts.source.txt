import { DomainError, redactSensitiveText } from '@cvg/shared'
import {
  assessConversationSafety,
  normalizeSafetyText,
  type SafetyAssessment
} from './safety-assessment.ts'
import type { ControlPlaneStore } from './control-plane-store.ts'
import type {
  AgentConfig,
  AgentVersionRecord,
  AgentExecutionMode,
  HandoffPriority,
  TestRunTrace,
  TraceSpanName,
  ApprovedKnowledgeForTest
} from './contracts.ts'
import { ApprovedKnowledgeForTestSchema } from './contracts.ts'
import {
  createTraceId,
  TraceIdSchema,
  type AgentId,
  type TenantId,
  type TraceId
} from './ids.ts'
import type { HumanTakeoverState } from './handoff.ts'
import { resolveControlledModelProvider } from './model-provider.ts'
import { createControlledCapabilityGateway } from './controlled-plugins.ts'
import type {
  CapabilityApproval,
  CapabilityApprovalResolver,
  CapabilityGateway,
  PluginAuditEvent
} from './plugin-gateway.ts'
import type { PlatformEventBus, PlatformEventName } from './event-bus.ts'
import { composePrompt } from './prompt-composer.ts'
import { createPromptProfileSnapshot } from './prompt-profile.ts'
import { evaluatePlatformPolicy } from './policy-evaluator.ts'
import {
  CONTROLLED_SAFE_OUTPUTS,
  enforceControlledOutput
} from './output-policy.ts'

export interface TestLabInput {
  store: ControlPlaneStore
  tenantId: TenantId
  agentId: AgentId
  versionId: AgentVersionRecord['id']
  traceId?: TraceId
  message: string
  history: string[]
  approvedKnowledge?: ApprovedKnowledgeForTest
  resolveApprovedKnowledge?: ApprovedKnowledgeResolver
  capabilityGateway?: CapabilityGateway
  actor?: AgentExecutionActor
  capabilityApproval?: CapabilityApproval
  resolveCapabilityApproval?: CapabilityApprovalResolver
  requireCapabilityApproval?: boolean
  onToolAudit?: (event: PluginAuditEvent) => void | Promise<void>
  eventBus?: PlatformEventBus
  context?: { conversationId?: string; sessionId?: string }
  monotonicClock?: () => number
}

export interface ApprovedKnowledgeResolverInput {
  tenantId: TenantId
  question: string
}

export type ApprovedKnowledgeResolver = (
  input: ApprovedKnowledgeResolverInput
) =>
  | ApprovedKnowledgeForTest
  | null
  | undefined
  | Promise<ApprovedKnowledgeForTest | null | undefined>

export interface ControlledTraceTiming {
  measure<T>(name: TraceSpanName, operation: () => T): T
  measureAsync<T>(
    name: TraceSpanName,
    operation: () => T | PromiseLike<T>
  ): Promise<T>
  snapshot(): Partial<Record<TraceSpanName, number>>
}

const TRACE_STAGE_MAX_DURATION_MS = 86_400_000

export function createControlledTraceTiming(
  clock: () => number = () => globalThis.performance.now()
): ControlledTraceTiming {
  if (typeof clock !== 'function') {
    throw new DomainError(
      'validation_failed',
      'Trace timing clock must be callable'
    )
  }

  let lastClockValue = Number.NEGATIVE_INFINITY
  let durations: Partial<Record<TraceSpanName, number>> = {}

  const readClock = (): number => {
    const value = clock()
    if (!Number.isFinite(value) || value < lastClockValue) {
      throw new DomainError(
        'validation_failed',
        'Trace timing clock must be finite and monotonic'
      )
    }
    lastClockValue = value
    return value
  }

  const record = (name: TraceSpanName, durationMs: number): void => {
    if (
      !Number.isFinite(durationMs) ||
      durationMs < 0 ||
      durationMs > TRACE_STAGE_MAX_DURATION_MS
    ) {
      throw new DomainError(
        'validation_failed',
        'Trace stage duration is outside the controlled bound'
      )
    }
    const totalDurationMs = (durations[name] ?? 0) + durationMs
    if (
      !Number.isFinite(totalDurationMs) ||
      totalDurationMs > TRACE_STAGE_MAX_DURATION_MS
    ) {
      throw new DomainError(
        'validation_failed',
        'Trace stage duration total is outside the controlled bound'
      )
    }
    durations = { ...durations, [name]: totalDurationMs }
  }

  return {
    measure<T>(name: TraceSpanName, operation: () => T): T {
      const startedAt = readClock()
      try {
        return operation()
      } finally {
        record(name, readClock() - startedAt)
      }
    },
    async measureAsync<T>(
      name: TraceSpanName,
      operation: () => T | PromiseLike<T>
    ): Promise<T> {
      const startedAt = readClock()
      try {
        return await operation()
      } finally {
        record(name, readClock() - startedAt)
      }
    },
    snapshot(): Partial<Record<TraceSpanName, number>> {
      return { ...durations }
    }
  }
}

export interface AgentExecutionActor {
  id: string
  role: string
  permissions: string[]
}

export interface ControlledAgentExecutionInput extends TestLabInput {
  executionMode: AgentExecutionMode
}

export async function runTestLab(input: TestLabInput): Promise<TestRunTrace> {
  const trace = await executeConfiguredAgent({
    ...input,
    executionMode: 'TEST_LAB',
    capabilityGateway:
      input.capabilityGateway ?? createControlledCapabilityGateway(),
    actor: input.actor ?? controlledRuntimeActor
  })
  return input.store.recordTestRun({ tenantId: input.tenantId }, trace)
}

export async function executeConfiguredAgent(
  input: ControlledAgentExecutionInput
): Promise<TestRunTrace> {
  const traceId = resolveExecutionTraceId(input.traceId)
  const executionInput: ControlledAgentExecutionInput = { ...input, traceId }
  const timing = createControlledTraceTiming(input.monotonicClock)
  const startedAt = new Date()
  const version = await timing.measureAsync('context', () =>
    input.store.getVersion({ tenantId: input.tenantId }, input.versionId)
  )
  if (!version || version.agentId !== input.agentId) {
    throw new DomainError('invalid_action', 'Agent version is not available')
  }
  const normalizedInput = timing.measure('normalize', () => ({
    message: validateMessage(input.message),
    history: validateHistory(input.history)
      .map(validateHistoryItem)
      .map(redactTestMessage)
  }))
  const message = normalizedInput.message
  const history = normalizedInput.history
  const config = version.config
  const modelProvider = resolveControlledModelProvider(config.model)
  const promptProfile = createPromptProfileSnapshot(version)
  await emitPlatformEvent(executionInput, 'message.received', {
    messageLength: message.length,
    historySize: input.history.length
  })
  await emitPlatformEvent(executionInput, 'message.normalized', {
    messageLength: message.length,
    historySize: history.length
  })
  await emitPlatformEvent(executionInput, 'conversation.loaded', {
    historySize: history.length
  })
  await emitPlatformEvent(executionInput, 'context.loaded', {
    hasConversationId: Boolean(input.context?.conversationId),
    hasSessionId: Boolean(input.context?.sessionId)
  })
  await emitPlatformEvent(executionInput, 'agent.resolved', {
    version: version.version,
    status: version.status
  })
  await emitPlatformEvent(executionInput, 'prompt.before', {
    blockCount: config.promptBlocks.length
  })
  const prompt = timing.measure('prompt', () => composePrompt(config))
  await emitPlatformEvent(executionInput, 'prompt.after', {
    blockIds: prompt.blockIds,
    textLength: prompt.text.length
  })

  await emitPlatformEvent(executionInput, 'intent.before', {
    messageLength: message.length
  })
  const safety = assessConversationSafety(message, history)
  const intent = timing.measure('intent', () => classifyForDryRun(message))
  await emitPlatformEvent(executionInput, 'intent.after', intent)
  const approvedKnowledge = await timing.measureAsync('knowledge', async () => {
    const candidate =
      input.resolveApprovedKnowledge && intent.name === 'institutional_question'
        ? await input.resolveApprovedKnowledge({
            tenantId: input.tenantId,
            question: message
          })
        : input.resolveApprovedKnowledge
          ? undefined
          : input.approvedKnowledge
    return validateApprovedKnowledge(candidate ?? undefined)
  })
  const { action, policy } = timing.measure('policy', () => {
    const nextAction = actionForMessage(message, intent.name)
    const nextPolicy = evaluatePlatformPolicy({
      action: nextAction,
      confidence: intent.confidence,
      config,
      clarificationCount: history.length,
      riskLevel: safety.level
    })
    return { action: nextAction, policy: nextPolicy }
  })
  await emitPlatformEvent(executionInput, 'policy.input.before', {
    action,
    confidence: intent.confidence,
    clarificationCount: history.length
  })
  await emitPlatformEvent(executionInput, 'policy.input.after', {
    decision: policy.decision,
    layer: policy.layer,
    reason: policy.reason
  })
  if (policy.decision === 'blocked') {
    await emitPlatformEvent(executionInput, 'security.blocked', {
      action,
      reason: policy.reason
    })
  }
  const risk = riskForSafety(safety, policy)
  await emitPlatformEvent(executionInput, 'knowledge.before', {
    intent: intent.name,
    configuredBindings: config.knowledge.length
  })
  const knowledge = timing.measure('knowledge', () =>
    resolveKnowledge(intent.name, approvedKnowledge, config.knowledge)
  )
  await emitPlatformEvent(executionInput, 'knowledge.after', knowledge.trace)
  const handoffRequested =
    safety.level !== 'low' ||
    policy.decision === 'handoff' ||
    policy.decision === 'requires_approval' ||
    intent.name === 'medication_advice' ||
    knowledge.trace.status === 'approved_source_missing' ||
    knowledge.trace.status === 'handoff'
  const handoffReason = handoffRequested
    ? safety.level !== 'low' &&
      policy.decision === 'blocked' &&
      intent.name !== 'medication_advice'
      ? safety.reason
      : policy.decision === 'handoff' || policy.decision === 'requires_approval'
        ? policy.reason
        : intent.name === 'medication_advice'
          ? 'veterinary_evaluation_required'
          : 'approved_source_missing'
    : null
  const response = timing.measure('response', () =>
    buildResponse({
      config,
      intent: intent.name,
      policyDecision: policy.decision,
      knowledge: knowledge.trace,
      knowledgeAnswer: knowledge.answer,
      handoffRequested
    })
  )
  await emitPlatformEvent(executionInput, 'response.before', {
    mode: response.mode
  })
  const promptWithHistory = history.length
    ? `${prompt.text}\n\nConversation history:\n${history.join('\n')}`
    : prompt.text
  await emitPlatformEvent(executionInput, 'model.before', {
    provider: modelProvider.name,
    model: config.model.model,
    promptLength: promptWithHistory.length
  })
  let rawCompletion: unknown
  try {
    rawCompletion = await timing.measureAsync('model', () =>
      modelProvider.complete({
        prompt: promptWithHistory,
        fallbackText: response.text
      })
    )
  } catch (error) {
    await emitPlatformEvent(executionInput, 'model.error', {
      provider: modelProvider.name,
      model: config.model.model,
      reason: 'model_execution_failed'
    })
    throw error
  }
  const completionText = readCompletionText(rawCompletion)
  await emitPlatformEvent(executionInput, 'model.after', {
    provider: modelProvider.name,
    model: config.model.model,
    externalCall: false,
    responseLength:
      typeof completionText === 'string' ? completionText.length : 0
  })
  await emitPlatformEvent(executionInput, 'policy.output.before', {
    mode: response.mode,
    riskLevel: risk.level,
    responseLength:
      typeof completionText === 'string' ? completionText.length : 0
  })
  const output = timing.measure('response', () =>
    enforceControlledOutput({
      text: completionText,
      mode: response.mode,
      riskLevel: risk.level
    })
  )
  await emitPlatformEvent(executionInput, 'policy.output.after', {
    decision: output.decision,
    reason: output.reason,
    mode: output.mode,
    redacted: output.redacted,
    responseLength: output.text.length
  })
  const completedResponse = {
    ...response,
    mode: output.mode,
    text: output.text
  }
  const handoff = timing.measure('handoff', () => {
    const outputCausedHandoff =
      !handoffRequested && completedResponse.mode === 'handoff'
    const finalHandoffRequested = handoffRequested || outputCausedHandoff
    const outputRejectedHandoff =
      output.decision === 'rewritten' && completedResponse.mode === 'handoff'
    const finalHandoffReason = outputRejectedHandoff
      ? output.reason
      : handoffRequested
        ? handoffReason
        : outputCausedHandoff
          ? output.reason
          : null
    const finalHandoffDestination = finalHandoffRequested
      ? config.handoff.lowConfidenceDestination
      : undefined
    const finalHandoffPriority = finalHandoffRequested
      ? resolveHandoffPriority(config.handoff.priority, risk.level)
      : undefined
    const finalHandoffState: HumanTakeoverState = finalHandoffRequested
      ? 'HANDOFF_REQUESTED'
      : 'BOT_ACTIVE'
    return {
      finalHandoffRequested,
      finalHandoffReason,
      finalHandoffDestination,
      finalHandoffPriority,
      finalHandoffState
    }
  })
  const {
    finalHandoffRequested,
    finalHandoffReason,
    finalHandoffDestination,
    finalHandoffPriority,
    finalHandoffState
  } = handoff
  if (finalHandoffRequested) {
    await emitPlatformEvent(executionInput, 'handoff.requested', {
      reason: finalHandoffReason,
      destination: finalHandoffDestination,
      priority: finalHandoffPriority
    })
  }
  const tools = await timing.measureAsync('tool', () =>
    output.decision === 'rewritten' ||
    risk.level === 'high' ||
    risk.level === 'critical'
      ? []
      : executePlannedTools({
          input: executionInput,
          config,
          intent: intent.name,
          policy,
          traceId
        })
  )
  await emitPlatformEvent(executionInput, 'response.after', {
    mode: completedResponse.mode,
    responseLength: completedResponse.text.length
  })
  const completedAt = new Date()
  const promptTokens = estimateTokenCount(promptWithHistory)
  const completionTokens = estimateTokenCount(completedResponse.text)
  const trace: TestRunTrace = {
    traceId,
    tenantId: input.tenantId,
    agentId: input.agentId,
    versionId: input.versionId,
    input: { message: redactTestMessage(message), historySize: history.length },
    intent,
    risk,
    policy: [policy],
    knowledge: knowledge.trace,
    tools,
    toolResults: tools.map((tool) => ({
      name: tool.name,
      status: tool.status,
      output: tool.status === 'succeeded' ? { redacted: true } : null
    })),
    handoff: {
      requested: finalHandoffRequested,
      reason: finalHandoffReason,
      state: finalHandoffState,
      ...(finalHandoffDestination
        ? { destination: finalHandoffDestination }
        : {}),
      ...(finalHandoffPriority ? { priority: finalHandoffPriority } : {})
    },
    response: completedResponse,
    outputPolicy: {
      decision: output.decision,
      reason: output.reason,
      mode: output.mode,
      redacted: output.redacted
    },
    provider: {
      provider: modelProvider.name,
      model: config.model.model,
      externalCall: false
    },
    prompt: {
      version: promptProfile.version,
      status: promptProfile.status,
      checksum: promptProfile.checksum,
      blockIds: promptProfile.blockIds
    },
    configVersion: `${version.id}:v${version.version}`,
    executionMode: input.executionMode,
    status: policy.decision === 'blocked' ? 'blocked' : 'completed',
    startedAt,
    completedAt,
    latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime()),
    tokenUsage: {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens,
      estimated: true
    },
    spans: createTraceSpans({
      policy,
      knowledge: knowledge.trace,
      tools,
      handoffRequested: finalHandoffRequested,
      durations: timing.snapshot(),
      latencyMs: Math.max(0, completedAt.getTime() - startedAt.getTime())
    }),
    ...(input.context?.conversationId
      ? { conversationId: input.context.conversationId }
      : {}),
    ...(input.context?.sessionId ? { sessionId: input.context.sessionId } : {}),
    createdAt: completedAt
  }
  await emitPlatformEvent(executionInput, 'conversation.completed', {
    status: trace.status,
    policyDecision: policy.decision,
    handoffRequested: finalHandoffRequested,
    externalCall: trace.provider.externalCall
  })
  return trace
}

function validateMessage(rawMessage: string): string {
  if (typeof rawMessage !== 'string') {
    throw new DomainError('validation_failed', 'Test message must be text')
  }
  const message = rawMessage.trim()
  if (message.length === 0 || message.length > 4000) {
    throw new DomainError(
      'validation_failed',
      'Test message must contain between 1 and 4000 characters'
    )
  }
  return message
}

function resolveHandoffPriority(
  configuredPriority: HandoffPriority | undefined,
  riskLevel: NonNullable<TestRunTrace['risk']>['level']
): HandoffPriority {
  if (riskLevel === 'high' || riskLevel === 'critical') return 'high'
  return configuredPriority ?? 'medium'
}

function validateHistory(history: string[]): string[] {
  if (!Array.isArray(history) || history.length > 50) {
    throw new DomainError(
      'validation_failed',
      'Test history must contain at most 50 items'
    )
  }
  return history
}

function validateHistoryItem(rawItem: string): string {
  if (typeof rawItem !== 'string' || rawItem.length > 4000) {
    throw new DomainError('validation_failed', 'Test history item is invalid')
  }
  return rawItem
}

function readCompletionText(completion: unknown): unknown {
  if (
    typeof completion !== 'object' ||
    completion === null ||
    Array.isArray(completion)
  ) {
    return undefined
  }
  return (completion as { text?: unknown }).text
}

function validateApprovedKnowledge(
  approvedKnowledge: ApprovedKnowledgeForTest | undefined
): ApprovedKnowledgeForTest | undefined {
  if (approvedKnowledge === undefined) return undefined
  const parsed = ApprovedKnowledgeForTestSchema.safeParse(approvedKnowledge)
  if (!parsed.success) {
    throw new DomainError(
      'validation_failed',
      'Approved knowledge payload is invalid'
    )
  }
  return parsed.data
}

function classifyForDryRun(message: string): {
  name: string
  confidence: number
} {
  const text = normalizeSafetyText(message)
  if (
    /dipirona|ibuprofeno|paracetamol|medicamento|medica[cç][aã]o|rem[eé]dio|antibi[oó]tico|medication|medicine|drug/.test(
      text
    )
  ) {
    return { name: 'medication_advice', confidence: 0.99 }
  }
  if (/endere[cç]o|hor[aá]rio de funcionamento/.test(text)) {
    return { name: 'institutional_question', confidence: 0.94 }
  }
  if (/consulta|hor[aá]rio|agenda/.test(text)) {
    return { name: 'scheduling', confidence: 0.92 }
  }
  if (assessConversationSafety(message, []).level === 'high') {
    return { name: 'triage', confidence: 0.96 }
  }
  return { name: 'unknown', confidence: 0.32 }
}

function actionForMessage(message: string, intent: string): string {
  const text = normalizeSafetyText(message)
  if (/send_external|enviar.*extern|canal real|provider real/.test(text)) {
    return 'send_external'
  }
  if (/confirmar|confirm/.test(text) && intent === 'scheduling') {
    return 'confirm_appointment'
  }
  if (/cancelar|cancel/.test(text) && intent === 'scheduling') {
    return 'cancel_appointment'
  }
  if (/reagendar|remarcar|reschedule/.test(text) && intent === 'scheduling') {
    return 'reschedule_appointment'
  }
  return intent === 'unknown' ? 'respond' : intent
}

function resolveKnowledge(
  intent: string,
  approvedKnowledge: ApprovedKnowledgeForTest | undefined,
  bindings: AgentConfig['knowledge']
): { trace: TestRunTrace['knowledge']; answer?: string } {
  if (intent !== 'institutional_question') {
    return { trace: { status: 'not_requested' } }
  }
  if (!approvedKnowledge)
    return { trace: { status: 'approved_source_missing' } }
  const binding = bindings.find(
    (candidate) =>
      candidate.enabled &&
      candidate.requiresApprovedSource &&
      candidate.source === approvedKnowledge.source &&
      candidate.version === approvedKnowledge.version
  )
  if (!binding) return { trace: { status: 'approved_source_missing' } }
  return {
    trace: {
      status: 'answered',
      source: approvedKnowledge.source,
      version: approvedKnowledge.version
    },
    answer: approvedKnowledge.answer
  }
}

function buildResponse(input: {
  config: AgentConfig
  intent: string
  policyDecision: ReturnType<typeof evaluatePlatformPolicy>['decision']
  knowledge: TestRunTrace['knowledge']
  knowledgeAnswer: string | undefined
  handoffRequested: boolean
}): TestRunTrace['response'] {
  if (input.intent === 'medication_advice') {
    return {
      mode: 'handoff',
      text: CONTROLLED_SAFE_OUTPUTS.medicationRefusal
    }
  }
  if (input.policyDecision === 'blocked') {
    return {
      mode: 'blocked',
      text: CONTROLLED_SAFE_OUTPUTS.blocked
    }
  }
  if (input.policyDecision === 'clarify') {
    return {
      mode: 'clarify',
      text:
        input.config.responseTemplates.low_confidence ??
        CONTROLLED_SAFE_OUTPUTS.clarify
    }
  }
  if (input.handoffRequested) {
    return {
      mode: 'handoff',
      text:
        (input.intent === 'scheduling' &&
          input.config.responseTemplates.scheduling_without_evidence) ||
        (input.knowledge.status === 'approved_source_missing' &&
          input.config.responseTemplates.no_knowledge) ||
        input.config.responseTemplates.handoff ||
        CONTROLLED_SAFE_OUTPUTS.handoff
    }
  }
  if (input.knowledge.status === 'answered') {
    return {
      mode: 'answer',
      text:
        input.knowledgeAnswer ??
        input.config.responseTemplates[input.intent] ??
        input.config.greeting
    }
  }
  return {
    mode: 'answer',
    text:
      input.config.responseTemplates[input.intent] ??
      (input.knowledge.status === 'approved_source_missing'
        ? input.config.responseTemplates.no_knowledge
        : undefined) ??
      input.config.greeting
  }
}

function riskForSafety(
  safety: SafetyAssessment,
  policy: ReturnType<typeof evaluatePlatformPolicy>
): { level: 'low' | 'medium' | 'high' | 'critical'; reason: string } {
  if (safety.level !== 'low') return safety
  if (policy.layer === 'hard_safety' && policy.decision === 'blocked') {
    return { level: 'critical', reason: policy.reason }
  }
  return safety
}

function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4)
}

function createTraceSpans(input: {
  policy: ReturnType<typeof evaluatePlatformPolicy>
  knowledge: TestRunTrace['knowledge']
  tools: TestRunTrace['tools']
  handoffRequested: boolean
  durations: Partial<Record<TraceSpanName, number>>
  latencyMs: number
}): NonNullable<TestRunTrace['spans']> {
  const durations = fitTraceDurations(input.durations, input.latencyMs)
  const durationFor = (
    name: TraceSpanName,
    status: 'completed' | 'blocked' | 'skipped'
  ): number => (status === 'skipped' ? 0 : (durations[name] ?? 0))
  const toolStatus = input.tools.length
    ? input.tools.some((tool) => tool.status === 'blocked')
      ? 'blocked'
      : 'completed'
    : 'skipped'
  return [
    {
      name: 'normalize',
      status: 'completed',
      durationMs: durationFor('normalize', 'completed')
    },
    {
      name: 'context',
      status: 'completed',
      durationMs: durationFor('context', 'completed')
    },
    {
      name: 'intent',
      status: 'completed',
      durationMs: durationFor('intent', 'completed')
    },
    {
      name: 'policy',
      status: input.policy.decision === 'blocked' ? 'blocked' : 'completed',
      durationMs: durationFor(
        'policy',
        input.policy.decision === 'blocked' ? 'blocked' : 'completed'
      )
    },
    {
      name: 'knowledge',
      status:
        input.knowledge.status === 'not_requested' ? 'skipped' : 'completed',
      durationMs: durationFor(
        'knowledge',
        input.knowledge.status === 'not_requested' ? 'skipped' : 'completed'
      )
    },
    {
      name: 'prompt',
      status: 'completed',
      durationMs: durationFor('prompt', 'completed')
    },
    {
      name: 'model',
      status: 'completed',
      durationMs: durationFor('model', 'completed')
    },
    {
      name: 'tool',
      status: toolStatus,
      durationMs: durationFor('tool', toolStatus)
    },
    {
      name: 'response',
      status: 'completed',
      durationMs: durationFor('response', 'completed')
    },
    {
      name: 'handoff',
      status: input.handoffRequested ? 'completed' : 'skipped',
      durationMs: durationFor(
        'handoff',
        input.handoffRequested ? 'completed' : 'skipped'
      )
    },
    { name: 'delivery', status: 'skipped', durationMs: 0 }
  ]
}

function fitTraceDurations(
  durations: Partial<Record<TraceSpanName, number>>,
  latencyMs: number
): Partial<Record<TraceSpanName, number>> {
  const names = Object.keys(durations) as TraceSpanName[]
  const totalDurationMs = names.reduce(
    (total, name) => total + (durations[name] ?? 0),
    0
  )
  if (totalDurationMs <= latencyMs) return { ...durations }
  if (latencyMs <= 0 || totalDurationMs <= 0) {
    return Object.fromEntries(names.map((name) => [name, 0]))
  }
  const scale = latencyMs / totalDurationMs
  return Object.fromEntries(
    names.map((name) => [name, (durations[name] ?? 0) * scale])
  )
}

async function executePlannedTools(input: {
  input: ControlledAgentExecutionInput
  config: AgentConfig
  intent: string
  policy: ReturnType<typeof evaluatePlatformPolicy>
  traceId: TraceId
}): Promise<TestRunTrace['tools']> {
  const toolNames = input.input.capabilityGateway
    ? input.input.capabilityGateway
        .planTools(input.config, input.intent)
        .map((tool) => tool.toolName)
    : []
  if (toolNames.length === 0) return []

  return Promise.all(
    toolNames.map(async (toolName) => {
      await emitPlatformEvent(input.input, 'tool.before', {
        toolName,
        dryRun: input.input.executionMode === 'TEST_LAB'
      })
      if (!input.input.capabilityGateway || !input.input.actor) {
        const blocked = { name: toolName, status: 'blocked' as const }
        await emitPlatformEvent(input.input, 'tool.after', blocked)
        return blocked
      }
      const toolInput = { message: redactTestMessage(input.input.message) }
      try {
        let approval = input.input.capabilityApproval
        if (!approval && input.input.resolveCapabilityApproval) {
          approval =
            (await input.input.resolveCapabilityApproval({
              tenantId: input.input.tenantId,
              agentId: input.input.agentId,
              versionId: input.input.versionId,
              toolName,
              input: toolInput,
              actor: input.input.actor!
            })) ?? undefined
        }
        const result = await input.input.capabilityGateway.execute({
          tenantId: input.input.tenantId,
          agentId: input.input.agentId,
          versionId: input.input.versionId,
          config: input.config,
          toolName,
          input: toolInput,
          actor: input.input.actor,
          policy: input.policy,
          dryRun: input.input.executionMode === 'TEST_LAB',
          traceId: input.traceId,
          ...(approval ? { approval } : {}),
          ...(input.input.requireCapabilityApproval
            ? { requireApproval: true }
            : {}),
          ...(input.input.onToolAudit
            ? { onAudit: input.input.onToolAudit }
            : {})
        })
        const completed = { name: toolName, status: result.status }
        await emitPlatformEvent(input.input, 'tool.after', completed)
        return completed
      } catch (error) {
        await emitPlatformEvent(input.input, 'tool.error', {
          toolName,
          reason: 'tool_execution_failed'
        })
        throw error
      }
    })
  )
}

function resolveExecutionTraceId(rawTraceId: unknown): TraceId {
  if (rawTraceId === undefined) return createTraceId()
  const parsed = TraceIdSchema.safeParse(rawTraceId)
  if (!parsed.success) {
    throw new DomainError('validation_failed', 'Execution trace ID is invalid')
  }
  return parsed.data
}

const controlledRuntimeActor: AgentExecutionActor = {
  id: 'system.controlled-runtime',
  role: 'System',
  permissions: ['scheduling:read']
}

function redactTestMessage(message: string): string {
  return redactSensitiveText(message)
}

async function emitPlatformEvent(
  input: ControlledAgentExecutionInput,
  name: PlatformEventName,
  payload: Record<string, unknown>
): Promise<void> {
  if (!input.eventBus) return
  try {
    await input.eventBus.emit({
      name,
      tenantId: input.tenantId,
      agentId: input.agentId,
      versionId: input.versionId,
      executionMode: input.executionMode,
      ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
      payload
    })
  } catch {
    // Hook observability is strictly non-blocking for the controlled runtime.
  }
}
