import { createHash, randomUUID } from 'node:crypto'
import type {
  AgenticKnowledgeProvider,
  ApprovalExecutionHandle,
  ApprovalExecutionRequest,
  ApprovalId,
  Claim,
  ClaimValidation,
  CompletionEvaluation,
  CompletionEvaluator,
  ContextEngine,
  DecisionValidationResult,
  ExecutionCheckpoint,
  ExecutionStep,
  ExecutionStepStore,
  IterativeOrchestrator,
  KnowledgeSearchResult,
  LoopDecision,
  ModelUsage,
  Observation,
  RuntimeInput,
  RuntimeResult,
  StopReason,
  SufficiencyEvaluator
} from '@cvg/harness-contracts'
import {
  EMPTY_BUDGET_USAGE,
  EMPTY_MODEL_USAGE,
  MAX_CHECKPOINT_OBSERVATIONS,
  RUNTIME_V2_VERSION,
  HYBRID_ORCHESTRATOR_VERSION,
  sanitizeLoopDecision,
  validateLoopDecision
} from '@cvg/harness-contracts'
import type {
  ApprovalEngine,
  AuditSink,
  ModelGateway,
  PolicyEngine,
  TelemetryEvent,
  TelemetrySink,
  ToolDefinition,
  ToolDescriptor,
  ToolRegistry,
  ToolResult
} from '@cvg/harness-contracts'
import { DefaultContextEngine } from './context-engine.ts'
import { DeterministicCompletionEvaluator } from './completion.ts'
import { sealCheckpoint } from './step-store.ts'

export interface IterativeGovernedRuntimeOptions {
  readonly orchestrator: IterativeOrchestrator
  readonly modelGateway: ModelGateway
  readonly policy: PolicyEngine
  readonly approvals: ApprovalEngine
  readonly tools: ToolRegistry
  readonly capabilityFingerprint?: string
  readonly audit: AuditSink
  readonly telemetry: TelemetrySink
  readonly stepStore: ExecutionStepStore
  readonly contextEngine?: ContextEngine
  readonly knowledge?: AgenticKnowledgeProvider
  readonly sufficiencyEvaluator?: SufficiencyEvaluator
  readonly completionEvaluator?: CompletionEvaluator
  readonly claimExtractor?: (response: string) => readonly Claim[]
  readonly loopDetection?: {
    readonly repeatThreshold?: number
    readonly maxSignatures?: number
  }
  readonly maxObservationPayloadChars?: number
  readonly clock?: () => Date
  readonly orchestratorVersion?: string
}

const DEADLINE_EXCEEDED = Symbol('iterative-deadline-exceeded')

const BUDGET_STOP_REASONS = new Set<StopReason>([
  'MAX_STEPS',
  'MAX_COST',
  'MAX_DURATION',
  'MAX_TOKENS',
  'MAX_MODEL_CALLS',
  'MAX_TOOL_CALLS',
  'MAX_REPLANS',
  'MAX_KNOWLEDGE_CALLS',
  'MAX_VERIFICATION_CALLS'
])

const TERMINAL_STOPS = new Set<StopReason>([
  'COMPLETED',
  'HUMAN_TAKEOVER',
  'POLICY_DENIED',
  'INSUFFICIENT_EVIDENCE',
  'MAX_STEPS',
  'MAX_COST',
  'MAX_DURATION',
  'MAX_TOKENS',
  'MAX_MODEL_CALLS',
  'MAX_TOOL_CALLS',
  'MAX_REPLANS',
  'MAX_KNOWLEDGE_CALLS',
  'MAX_VERIFICATION_CALLS',
  'VERIFICATION_FAILED',
  'LOOP_DETECTED',
  'STATE_CONFLICT',
  'UNSAFE_REQUEST',
  'CANCELLED'
])

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function bindCapabilityFingerprint(
  payload: unknown,
  capabilityFingerprint: string | undefined
): unknown {
  return capabilityFingerprint
    ? { capabilityFingerprint, input: payload }
    : payload
}

function hasValidBoundaryInput(input: RuntimeInput): boolean {
  const identityValues = [
    input.agent?.id,
    input.agent?.version,
    input.tenantId,
    input.conversationId,
    input.sessionId,
    input.correlationId,
    input.traceId
  ]
  const budgetValues = [
    input.budget?.maxSteps,
    input.budget?.maxModelCalls,
    input.budget?.maxToolCalls,
    input.budget?.maxDurationMs,
    input.budget?.maxCostUsd,
    input.budget?.maxTokens
  ]
  const optionalBudgetValues = [
    input.budget?.maxKnowledgeCalls,
    input.budget?.maxReplans,
    input.budget?.maxVerificationCalls,
    input.budget?.maxDecisionRepairs
  ].filter((value): value is number => value !== undefined)
  return (
    identityValues.every(isNonEmptyString) &&
    budgetValues.every(
      (value) =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0
    ) &&
    optionalBudgetValues.every((value) => Number.isFinite(value) && value >= 0)
  )
}

function describeTool(tool: ToolDefinition): ToolDescriptor {
  const { execute, ...descriptor } = tool
  void execute
  return descriptor
}

function normalizeForSignature(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeForSignature)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return Object.fromEntries(
      Object.keys(record)
        .filter((key) => record[key] !== undefined)
        .sort()
        .map((key) => [key, normalizeForSignature(record[key])])
    )
  }
  return value
}

export function decisionSignature(decision: LoopDecision): string {
  const material = {
    decisionType: decision.decisionType,
    capability: decision.toolId ?? decision.selectedCapability ?? null,
    query: decision.query ?? null,
    toolInput: decision.toolInput ?? null,
    knowledgeCategories: decision.knowledgeCategories ?? null,
    verificationTarget: decision.verificationTarget ?? null
  }
  return createHash('sha256')
    .update(JSON.stringify(normalizeForSignature(material)))
    .digest('hex')
}

/**
 * Detects alternating decision cycles (length >= 2). Single-element repeats
 * are handled by the repeat threshold so the two controls compose: the
 * threshold catches identical decisions, this catches A/B alternation.
 */
export function detectDecisionCycle(
  signatures: readonly string[],
  candidate: string,
  maxCycleLength = 3
): boolean {
  const sequence = [...signatures, candidate]
  const immediatelyPrevious = sequence[sequence.length - 2]
  for (let length = 2; length <= maxCycleLength; length += 1) {
    const previousIndex = sequence.length - 1 - length
    if (previousIndex < 0) continue
    // Pure repeats (candidate equals the immediately previous decision) are
    // the repeat threshold's job; this detects A/B(,C) alternation.
    if (immediatelyPrevious === candidate) continue
    if (sequence[previousIndex] === candidate) return true
  }
  return false
}

function mapEvaluationToStopReason(
  evaluation: CompletionEvaluation
): StopReason {
  if (evaluation.reasonCode === 'HANDOFF_REQUIRED') return 'HUMAN_TAKEOVER'
  if (evaluation.outcome === 'INSUFFICIENT_EVIDENCE') {
    return 'INSUFFICIENT_EVIDENCE'
  }
  if (evaluation.outcome === 'NEEDS_USER') return 'NEEDS_USER_INPUT'
  if (evaluation.outcome === 'WAITING_APPROVAL') return 'APPROVAL_REQUIRED'
  if (evaluation.outcome === 'FAILED') return 'VERIFICATION_FAILED'
  return 'INSUFFICIENT_EVIDENCE'
}

function boundedPayload(value: unknown, maxChars: number): unknown {
  let serialized: string
  try {
    serialized = JSON.stringify(value) ?? ''
  } catch {
    return '[unserializable payload]'
  }
  if (serialized.length <= maxChars) return value
  return `${serialized.slice(0, maxChars)}…[truncated]`
}

function defaultClaimValidation(
  claims: readonly Claim[],
  observations: readonly Observation[]
): ClaimValidation {
  const evidence = new Set<string>()
  for (const observation of observations) {
    if (observation.provenance.effectRef) {
      evidence.add(observation.provenance.effectRef)
    }
    if (observation.provenance.operationKey) {
      evidence.add(observation.provenance.operationKey)
    }
    const payload = observation.payload as {
      items?: readonly { itemId?: unknown }[]
    } | null
    if (payload && Array.isArray(payload.items)) {
      for (const item of payload.items) {
        if (typeof item?.itemId === 'string') evidence.add(item.itemId)
      }
    }
  }
  const unsupported = claims
    .filter(
      (claim) =>
        claim.evidenceRefs.length === 0 ||
        claim.evidenceRefs.some((ref) => !evidence.has(ref))
    )
    .map((claim) => claim.text.slice(0, 240))
  return { valid: unsupported.length === 0, unsupportedClaims: unsupported }
}

interface MutableState {
  goal: string
  stepNumber: number
  observations: Observation[]
  openQuestions: string[]
  pendingQuestion?:
    | {
        questionType:
          | 'CLARIFICATION'
          | 'MISSING_FIELD'
          | 'CONFIRMATION'
          | 'CHOICE'
        missingFields: readonly string[]
        promptIntent: string
        choices?: readonly string[]
      }
    | undefined
  pendingApprovalId?: string | undefined
  pendingDecision?: LoopDecision | undefined
  pendingStepNumber?: number | undefined
  selectedCapability?: string | undefined
  resolvedInputs: Record<string, unknown>
  loopSignatures: string[]
  stopReason?: StopReason | undefined
  lastEvaluation?: CompletionEvaluation | undefined
}

interface MutableUsage {
  steps: number
  modelCalls: number
  toolCalls: number
  knowledgeCalls: number
  verificationCalls: number
  replans: number
  decisionRepairs: number
  inputTokens: number
  outputTokens: number
  costUsd: number
  activeDurationMs: number
}

interface LoopRun {
  readonly input: RuntimeInput
  readonly executionId: string
  readonly startedAtMs: number
  stepNumber: number
  state: MutableState
  usage: MutableUsage
  observations: Observation[]
  responseText: string | null
  lastDecision: LoopDecision | null
  lastEvaluation: CompletionEvaluation | null
  lastToolObservation: Observation | null
  lastSufficiency: string | null
  lastDecisionErrors: readonly string[]
  skipEvaluationOnce: boolean
  countedSteps: Set<number>
}

type DispatchOutcome =
  | { readonly kind: 'continue' }
  | {
      readonly kind: 'stop'
      readonly stopReason: StopReason
      readonly response: string
      readonly approvalId?: ApprovalId
      /**
       * A rejected resume binding must not overwrite the durable pause with a
       * terminal checkpoint; the operator can retry the correct binding.
       */
      readonly preserveCheckpoint?: boolean
    }
  | {
      readonly kind: 'pause'
      readonly pausedKind: 'NEEDS_USER_INPUT' | 'APPROVAL_REQUIRED'
      readonly decision: LoopDecision | null
      readonly approvalId?: ApprovalId
      readonly pauseStepNumber?: number
    }

/**
 * Iterative governed runtime: the durable execution spine owns claiming,
 * leases and transitions; this runtime owns the cognitive loop, step
 * checkpoints, deterministic budgets and the completion evaluation. It never
 * claims jobs, never persists SQL directly and never executes a tool after a
 * rejected decision.
 */
export class IterativeGovernedRuntime {
  public readonly runtimeVersion = RUNTIME_V2_VERSION
  public readonly orchestratorVersion: string
  private readonly contextEngine: ContextEngine
  private readonly completionEvaluatorOverride: CompletionEvaluator | undefined
  private readonly completionEvaluators = new Map<string, CompletionEvaluator>()
  private readonly clock: () => Date
  private readonly repeatThreshold: number
  private readonly maxSignatures: number
  private readonly maxObservationPayloadChars: number

  public constructor(
    private readonly options: IterativeGovernedRuntimeOptions
  ) {
    this.contextEngine = options.contextEngine ?? new DefaultContextEngine()
    this.completionEvaluatorOverride = options.completionEvaluator
    this.clock = options.clock ?? (() => new Date())
    this.repeatThreshold = Math.max(
      1,
      options.loopDetection?.repeatThreshold ?? 2
    )
    this.maxSignatures = options.loopDetection?.maxSignatures ?? 12
    this.maxObservationPayloadChars =
      options.maxObservationPayloadChars ?? 4_000
    this.orchestratorVersion =
      options.orchestratorVersion ?? HYBRID_ORCHESTRATOR_VERSION
  }

  public async execute(input: RuntimeInput): Promise<RuntimeResult> {
    const startedAtMs = Date.now()
    const executionId = input.executionId ?? `execution_${input.correlationId}`

    if (!hasValidBoundaryInput(input)) {
      return this.earlyFinish(
        input,
        'Runtime identity or execution budget is invalid.',
        'UNSAFE_REQUEST',
        startedAtMs
      )
    }
    if (
      this.options.capabilityFingerprint &&
      input.capabilityFingerprint !== this.options.capabilityFingerprint
    ) {
      return this.earlyFinish(
        input,
        'Capability composition fingerprint does not match the runtime.',
        'STATE_CONFLICT',
        startedAtMs
      )
    }
    if (input.budget.maxSteps < 1) {
      return this.earlyFinish(
        input,
        'Execution budget exhausted before the first step.',
        'MAX_STEPS',
        startedAtMs
      )
    }
    if (input.budget.maxDurationMs < 1) {
      return this.earlyFinish(
        input,
        'Execution duration budget is not available.',
        'MAX_DURATION',
        startedAtMs
      )
    }

    let checkpoint: ExecutionCheckpoint | null = null
    try {
      checkpoint = await this.options.stepStore.loadCheckpoint(
        input.tenantId,
        executionId
      )
    } catch (error) {
      return this.earlyFinish(
        input,
        `Execution checkpoint could not be trusted: ${errorMessage(error)}.`,
        'STATE_CONFLICT',
        startedAtMs
      )
    }

    if (checkpoint) {
      const rejection = this.rejectCheckpoint(checkpoint, input)
      if (rejection) {
        return this.earlyFinish(input, rejection, 'STATE_CONFLICT', startedAtMs)
      }
    }

    const run: LoopRun = {
      input,
      executionId,
      startedAtMs,
      stepNumber: checkpoint?.state.stepNumber ?? 0,
      state: checkpoint
        ? {
            ...checkpoint.state,
            observations: [...checkpoint.state.observations],
            openQuestions: [...checkpoint.state.openQuestions],
            resolvedInputs: { ...checkpoint.state.resolvedInputs },
            loopSignatures: [...checkpoint.state.loopSignatures]
          }
        : {
            goal: input.agent.objective,
            ...(this.options.capabilityFingerprint
              ? { capabilityFingerprint: this.options.capabilityFingerprint }
              : {}),
            stepNumber: 0,
            observations: [],
            openQuestions: [],
            resolvedInputs: {},
            loopSignatures: []
          },
      usage: checkpoint
        ? { ...checkpoint.budgetUsage }
        : { ...EMPTY_BUDGET_USAGE },
      observations: checkpoint ? [...checkpoint.state.observations] : [],
      responseText: null,
      lastDecision: null,
      lastEvaluation: null,
      lastToolObservation: null,
      lastSufficiency: null,
      lastDecisionErrors: [],
      skipEvaluationOnce: false,
      countedSteps: new Set<number>()
    }
    run.state.observations = run.observations

    const resumeOutcome = this.applyResume(run, checkpoint)
    if (resumeOutcome) {
      return this.finalize(run, resumeOutcome, startedAtMs)
    }
    run.lastDecision = run.state.pendingDecision ?? null
    run.lastEvaluation = run.state.lastEvaluation ?? null

    await this.safeAudit(run, 'runtime_v2.started', {
      result: checkpoint ? 'resumed' : 'started'
    })

    try {
      const outcome = await this.runLoop(run)
      return await this.finalize(run, outcome, startedAtMs)
    } catch (error) {
      return await this.finalize(
        run,
        {
          kind: 'stop',
          stopReason: 'INTERNAL_FAILURE',
          response: `Execution failed internally: ${errorMessage(error)}.`
        },
        startedAtMs
      )
    }
  }

  private rejectCheckpoint(
    checkpoint: ExecutionCheckpoint,
    input: RuntimeInput
  ): string | null {
    if (checkpoint.runtimeProfile !== 'iterative') {
      return 'Execution checkpoint belongs to a different runtime profile.'
    }
    if (checkpoint.runtimeVersion !== RUNTIME_V2_VERSION) {
      return `Execution checkpoint requires runtime ${checkpoint.runtimeVersion}, this runtime is ${RUNTIME_V2_VERSION}.`
    }
    if (input.runtimeProfile && input.runtimeProfile !== 'iterative') {
      return 'Execution checkpoint conflicts with the requested runtime profile.'
    }
    if (
      this.options.capabilityFingerprint &&
      checkpoint.state.capabilityFingerprint !==
        this.options.capabilityFingerprint
    ) {
      return 'Execution checkpoint belongs to a different capability composition.'
    }
    if (
      checkpoint.state.stopReason &&
      TERMINAL_STOPS.has(checkpoint.state.stopReason) &&
      checkpoint.state.stopReason !== 'NEEDS_USER_INPUT' &&
      checkpoint.state.stopReason !== 'APPROVAL_REQUIRED'
    ) {
      return 'Terminal execution cannot be resumed.'
    }
    return null
  }

  private applyResume(
    run: LoopRun,
    checkpoint: ExecutionCheckpoint | null
  ): Extract<DispatchOutcome, { kind: 'stop' }> | null {
    const resume = run.input.resume
    if (!resume) return null
    if (!checkpoint) {
      return {
        kind: 'stop',
        stopReason: 'STATE_CONFLICT',
        response: 'Resume input arrived without a durable checkpoint.'
      }
    }
    if (resume.kind === 'approval') {
      if (run.state.pendingQuestion) {
        // Wrong-kind resume: the execution is paused for an answer, not for an
        // approval. Never let this open the loop with a question unresolved.
        return {
          kind: 'stop',
          stopReason: 'STATE_CONFLICT',
          response: 'Approval resume arrived while a user question is pending.',
          preserveCheckpoint: true
        }
      }
      if (!run.state.pendingApprovalId) {
        if (run.state.stopReason === 'APPROVAL_REQUIRED') {
          return {
            kind: 'stop',
            stopReason: 'STATE_CONFLICT',
            response: 'The paused approval binding is missing.',
            preserveCheckpoint: true
          }
        }
        // The approval was already consumed and the checkpoint cleared the
        // binding; a retry of the same attempt is a safe no-op.
        return null
      }
      if (run.state.pendingApprovalId !== resume.approvalId) {
        return {
          kind: 'stop',
          stopReason: 'STATE_CONFLICT',
          response: 'Approval does not match the paused execution binding.',
          preserveCheckpoint: true
        }
      }
      return null
    }
    if (run.state.pendingApprovalId) {
      return {
        kind: 'stop',
        stopReason: 'STATE_CONFLICT',
        response: 'User input arrived while an approval is pending.',
        preserveCheckpoint: true
      }
    }
    if (!run.state.pendingQuestion) {
      const alreadyResolved = Object.values(run.state.resolvedInputs).includes(
        resume.message
      )
      if (alreadyResolved) return null
      return {
        kind: 'stop',
        stopReason: 'STATE_CONFLICT',
        response: 'User input arrived without a pending question.',
        preserveCheckpoint: true
      }
    }
    const stepNumber = Math.max(1, run.state.stepNumber)
    const observation = this.makeObservation(run, {
      stepId: `step_${run.executionId}_${stepNumber}_user_input`,
      stepNumber,
      type: 'USER_MESSAGE',
      source: 'USER',
      trust: 'UNTRUSTED',
      payload: { message: resume.message },
      summary: 'User answered the pending question.',
      provenance: { sourceId: 'user' }
    })
    run.observations = [...run.observations, observation].slice(
      -MAX_CHECKPOINT_OBSERVATIONS
    )
    const pendingQuestion = run.state.pendingQuestion
    run.state = {
      ...run.state,
      pendingQuestion: undefined,
      openQuestions: run.state.openQuestions.filter(
        (question) => question !== pendingQuestion.promptIntent
      ),
      resolvedInputs: {
        ...run.state.resolvedInputs,
        [`answer_${stepNumber}`]: resume.message
      }
    }
    return null
  }

  private async runLoop(
    run: LoopRun
  ): Promise<Extract<DispatchOutcome, { kind: 'stop' }>> {
    if (
      run.state.pendingQuestion &&
      (!run.input.resume || run.input.resume.kind !== 'user_input')
    ) {
      // Deterministic rule: a pending question must not be answered by a new
      // model decision. Re-pause without spending a model call.
      return this.pause(run, Math.max(1, run.state.stepNumber), {
        kind: 'pause',
        pausedKind: 'NEEDS_USER_INPUT',
        decision: null
      })
    }
    while (true) {
      const budgetStop = this.checkBudget(run)
      if (budgetStop) return this.stop(budgetStop.reason, budgetStop.response)

      let decision: LoopDecision
      let stepNumber: number

      if (run.state.pendingDecision && run.state.pendingStepNumber) {
        decision = run.state.pendingDecision
        stepNumber = run.state.pendingStepNumber
        run.lastDecision = decision
      } else {
        stepNumber = run.stepNumber + 1
        if (stepNumber > run.input.budget.maxSteps) {
          return this.stop('MAX_STEPS', 'Step budget exhausted.')
        }
        const decisionResult = await this.decide(run, stepNumber)
        if (decisionResult.outcome) return decisionResult.outcome
        decision = sanitizeLoopDecision(decisionResult.decision)
        run.lastDecision = decision
      }

      const validation = this.validateDecision(run, decision)
      if (!validation.valid) {
        run.usage.decisionRepairs += 1
        run.lastDecisionErrors = validation.errors
        const repairBudget = run.input.budget.maxDecisionRepairs ?? 1
        if (
          run.usage.decisionRepairs <= repairBudget &&
          !run.state.pendingDecision
        ) {
          continue
        }
        const capabilityOnly = validation.errors.every((error) =>
          error.startsWith('capability:')
        )
        return this.stop(
          capabilityOnly ? 'STATE_CONFLICT' : 'MODEL_FAILURE',
          `Orchestrator decision was rejected: ${validation.errors.join('; ')}`
        )
      }
      run.lastDecisionErrors = []

      const signature = decisionSignature(decision)
      if (decision.decisionType !== 'STOP') {
        const repeats = run.state.loopSignatures.filter(
          (candidate) => candidate === signature
        ).length
        const threshold = this.effectiveRepeatThreshold(run, decision)
        const cycle = detectDecisionCycle(run.state.loopSignatures, signature)
        if (repeats >= threshold || cycle) {
          await this.recordStep(run, {
            stepNumber,
            stepType: 'POLICY',
            status: 'FAILED',
            sideEffecting: false,
            errorCode: 'loop_detected',
            reasonCode: 'LOOP_SUSPECTED'
          })
          return this.stop(
            'LOOP_DETECTED',
            cycle
              ? 'A repeated decision cycle was detected; the loop stopped without executing another effect.'
              : 'Repeated identical decisions were detected; the loop stopped without executing another effect.'
          )
        }
      }

      await this.safeAudit(run, 'orchestrator.decided', {
        result: `${decision.decisionType}:${decision.reasonCode}`,
        tool: decision.toolId ?? null
      })

      const dispatch = await this.dispatch(run, decision, stepNumber)
      if (dispatch.kind === 'pause') {
        return await this.pause(run, stepNumber, dispatch)
      }
      if (dispatch.kind === 'stop') {
        run.stepNumber = stepNumber
        return dispatch
      }

      const signatures = [...run.state.loopSignatures, signature].slice(
        -this.maxSignatures
      )
      run.stepNumber = stepNumber
      run.state = {
        ...run.state,
        stepNumber,
        loopSignatures: signatures,
        pendingDecision: undefined,
        pendingStepNumber: undefined,
        selectedCapability:
          decision.toolId ??
          decision.selectedCapability ??
          run.state.selectedCapability
      }
      await this.persistCheckpoint(run)

      if (run.skipEvaluationOnce) {
        run.skipEvaluationOnce = false
        continue
      }
      const evaluationOutcome = await this.evaluate(run, decision)
      if (evaluationOutcome) return evaluationOutcome
    }
  }

  private checkBudget(
    run: LoopRun
  ): { reason: StopReason; response: string } | null {
    if (this.effectiveDuration(run) > run.input.budget.maxDurationMs) {
      return { reason: 'MAX_DURATION', response: 'Duration budget exhausted.' }
    }
    // An in-flight step persisted before a pause/crash is allowed to settle
    // even when it consumed the last step slot.
    if (
      run.stepNumber >= run.input.budget.maxSteps &&
      !run.state.pendingDecision
    ) {
      return { reason: 'MAX_STEPS', response: 'Step budget exhausted.' }
    }
    return null
  }

  private stop(
    stopReason: StopReason,
    response: string
  ): Extract<DispatchOutcome, { kind: 'stop' }> {
    return { kind: 'stop', stopReason, response }
  }

  private async decide(
    run: LoopRun,
    stepNumber: number
  ): Promise<{
    outcome?: Extract<DispatchOutcome, { kind: 'stop' }>
    decision?: LoopDecision
  }> {
    const remaining = this.remainingDuration(run)
    if (remaining <= 0) {
      return {
        outcome: this.stop(
          'MAX_DURATION',
          'Duration budget exhausted before the next decision.'
        )
      }
    }
    if (run.usage.modelCalls + 1 > run.input.budget.maxModelCalls) {
      return {
        outcome: this.stop(
          'MAX_MODEL_CALLS',
          'Model-call budget exhausted before the next decision.'
        )
      }
    }
    const stateForContext: MutableState = {
      ...run.state,
      observations: run.observations
    }
    const context = await this.contextEngine.build({
      runtime: {
        executionId: run.executionId,
        tenantId: run.input.tenantId,
        conversationId: run.input.conversationId,
        correlationId: run.input.correlationId,
        traceId: run.input.traceId,
        userMessage: run.input.userMessage,
        context: run.input.context,
        objective: run.input.agent.objective,
        instructions: run.input.agent.instructions,
        agentId: run.input.agent.id,
        agentVersion: run.input.agent.version
      },
      profile: 'iterative',
      stepNumber,
      goal: run.state.goal,
      state: stateForContext,
      capabilities: this.availableTools(),
      knowledgeAvailable: Boolean(this.options.knowledge),
      completionStrategy: run.input.agent.completionStrategy ?? 'DETERMINISTIC',
      allowedDecisionTypes: this.allowedDecisionTypes(run),
      budget: run.input.budget,
      budgetUsage: run.usage,
      ...(run.usage.decisionRepairs > 0
        ? {
            decisionRepair: {
              attempt: run.usage.decisionRepairs,
              errors: run.lastDecisionErrors
            }
          }
        : {})
    })
    const decisionOrDeadline = await this.withDeadline(
      this.options.orchestrator.decide({ context }),
      remaining
    )
    if (decisionOrDeadline === DEADLINE_EXCEEDED) {
      return {
        outcome: this.stop(
          'MAX_DURATION',
          'Duration budget exhausted while deciding the next step.'
        )
      }
    }
    const turn = decisionOrDeadline
    const usage = turn.usage ?? EMPTY_MODEL_USAGE
    this.accountUsage(run, usage)
    const usageStop = this.checkAfterUsage(run)
    if (usageStop) {
      return { outcome: this.stop(usageStop.reason, usageStop.response) }
    }
    return { decision: turn.decision }
  }

  /**
   * A non-idempotent tool must never be invoked twice for the same decision;
   * the safe threshold is one repeat (stop before the second effect).
   */
  private effectiveRepeatThreshold(
    run: LoopRun,
    decision: LoopDecision
  ): number {
    if (
      decision.decisionType === 'CALL_TOOL' ||
      decision.decisionType === 'REQUEST_APPROVAL'
    ) {
      const tool = decision.toolId
        ? this.options.tools.resolve(decision.toolId, decision.toolVersion)
        : undefined
      if (tool && tool.idempotent === false && tool.sideEffect !== 'NONE') {
        return 1
      }
    }
    return this.repeatThreshold
  }

  private validateDecision(
    run: LoopRun,
    decision: LoopDecision
  ): DecisionValidationResult {
    const allowed = this.allowedDecisionTypes(run)
    if (!allowed.includes(decision.decisionType)) {
      return {
        valid: false,
        errors: [
          `capability: decision ${decision.decisionType} is not available in this state`
        ]
      }
    }
    const validation = validateLoopDecision(decision)
    if (!validation.valid) return validation
    if (
      decision.decisionType === 'CALL_TOOL' ||
      decision.decisionType === 'REQUEST_APPROVAL'
    ) {
      if (!decision.toolId) {
        return {
          valid: false,
          errors: ['capability: tool selection requires a toolId']
        }
      }
      const tool = this.options.tools.resolve(
        decision.toolId,
        decision.toolVersion
      )
      if (!tool) {
        return {
          valid: false,
          errors: [
            `capability: tool "${decision.toolId}" is not in the catalog`
          ]
        }
      }
      const profileTools = run.input.agent.tools
      if (profileTools.length > 0 && !profileTools.includes(tool.id)) {
        return {
          valid: false,
          errors: [
            `capability: tool "${tool.id}" is not exposed to this agent profile`
          ]
        }
      }
    }
    if (
      decision.decisionType === 'SEARCH_KNOWLEDGE' &&
      !this.options.knowledge
    ) {
      return {
        valid: false,
        errors: ['capability: no knowledge provider is configured']
      }
    }
    return { valid: true, errors: [] }
  }

  private allowedDecisionTypes(run: LoopRun): LoopDecision['decisionType'][] {
    const allowed: LoopDecision['decisionType'][] = ['RESPOND', 'ASK_USER']
    if (this.availableTools().length > 0) {
      allowed.push('CALL_TOOL', 'REQUEST_APPROVAL')
    }
    if (this.options.knowledge && this.remaining(run, 'knowledge') > 0) {
      allowed.push('SEARCH_KNOWLEDGE')
    }
    if (this.remaining(run, 'verification') > 0) {
      allowed.push('VERIFY')
    }
    if (this.remaining(run, 'replan') > 0) {
      allowed.push('REPLAN')
    }
    allowed.push('HANDOFF', 'STOP')
    return allowed
  }

  private remaining(
    run: LoopRun,
    kind: 'knowledge' | 'verification' | 'replan'
  ): number {
    const budget = run.input.budget
    if (kind === 'knowledge') {
      return Math.max(
        0,
        (budget.maxKnowledgeCalls ?? budget.maxSteps) - run.usage.knowledgeCalls
      )
    }
    if (kind === 'verification') {
      return Math.max(
        0,
        (budget.maxVerificationCalls ?? budget.maxSteps) -
          run.usage.verificationCalls
      )
    }
    return Math.max(
      0,
      (budget.maxReplans ?? budget.maxSteps) - run.usage.replans
    )
  }

  private availableTools(): readonly ToolDescriptor[] {
    return this.options.tools.list().map(describeTool)
  }

  private async dispatch(
    run: LoopRun,
    decision: LoopDecision,
    stepNumber: number
  ): Promise<DispatchOutcome> {
    switch (decision.decisionType) {
      case 'CALL_TOOL':
        return this.dispatchTool(run, decision, stepNumber, false)
      case 'REQUEST_APPROVAL':
        return this.dispatchTool(run, decision, stepNumber, true)
      case 'SEARCH_KNOWLEDGE':
        return this.dispatchKnowledge(run, decision, stepNumber)
      case 'VERIFY':
        return this.dispatchVerify(run, decision, stepNumber)
      case 'REPLAN':
        return this.dispatchReplan(run, decision, stepNumber)
      case 'RESPOND':
        return this.dispatchRespond(run, decision, stepNumber)
      case 'ASK_USER':
        return {
          kind: 'pause',
          pausedKind: 'NEEDS_USER_INPUT',
          decision
        }
      case 'HANDOFF':
        await this.recordStep(run, {
          stepNumber,
          stepType: 'HANDOFF',
          status: 'SUCCEEDED',
          sideEffecting: false,
          reasonCode: decision.reasonCode
        })
        return this.stop(
          'HUMAN_TAKEOVER',
          'Execution handed off to a human operator.'
        )
      case 'STOP':
        await this.recordStep(run, {
          stepNumber,
          stepType: 'STOP',
          status: 'SUCCEEDED',
          sideEffecting: false,
          reasonCode: decision.reasonCode
        })
        return { kind: 'continue' }
    }
  }

  private async dispatchTool(
    run: LoopRun,
    decision: LoopDecision,
    stepNumber: number,
    forceApproval: boolean
  ): Promise<DispatchOutcome> {
    if (run.usage.toolCalls + 1 > run.input.budget.maxToolCalls) {
      return this.stop(
        'MAX_TOOL_CALLS',
        'Tool-call budget exhausted before the tool could run.'
      )
    }
    const tool = this.options.tools.resolve(
      decision.toolId as string,
      decision.toolVersion
    )
    if (!tool) {
      return this.stop(
        'STATE_CONFLICT',
        `Tool "${decision.toolId}" is unavailable.`
      )
    }
    const operationKey = this.operationKey(run, stepNumber, tool.id)
    const invocation = {
      toolId: tool.id,
      ...(tool.version ? { toolVersion: tool.version } : {}),
      input: decision.toolInput ?? {},
      operationKey
    }
    const remaining = this.remainingDuration(run)
    if (remaining <= 0) {
      return this.stop(
        'MAX_DURATION',
        'Duration budget exhausted before tool execution.'
      )
    }

    let policyDecision
    try {
      const policyOrDeadline = await this.withDeadline(
        this.options.policy.evaluate({
          tenantId: run.input.tenantId,
          agentId: run.input.agent.id,
          action: 'tool.execute',
          tool,
          invocation,
          correlationId: run.input.correlationId
        }),
        remaining
      )
      if (policyOrDeadline === DEADLINE_EXCEEDED) {
        return this.stop(
          'MAX_DURATION',
          'Duration budget exhausted during policy evaluation.'
        )
      }
      policyDecision = policyOrDeadline
    } catch (error) {
      return this.stop(
        'POLICY_DENIED',
        `Policy evaluation failed: ${errorMessage(error)}.`
      )
    }
    if (
      policyDecision.outcome !== 'ALLOW' &&
      policyDecision.outcome !== 'DENY' &&
      policyDecision.outcome !== 'REQUIRE_APPROVAL' &&
      policyDecision.outcome !== 'HANDOFF'
    ) {
      await this.recordObservation(
        run,
        this.makeObservation(run, {
          stepId: `step_${run.executionId}_${stepNumber}_tool`,
          stepNumber,
          type: 'POLICY_DECISION',
          source: 'POLICY',
          trust: 'TRUSTED',
          payload: { outcome: 'UNSUPPORTED' },
          summary: 'Policy returned an unsupported outcome.',
          provenance: { sourceId: 'policy-engine' }
        })
      )
      await this.recordStep(run, {
        stepNumber,
        stepType: 'POLICY',
        status: 'FAILED',
        sideEffecting: false,
        reasonCode: 'POLICY_REQUIRED',
        errorCode: 'policy_outcome_invalid'
      })
      return this.stop(
        'INSUFFICIENT_EVIDENCE',
        'Policy returned an unsupported decision.'
      )
    }

    await this.recordObservation(
      run,
      this.makeObservation(run, {
        stepId: `step_${run.executionId}_${stepNumber}_tool`,
        stepNumber,
        type: 'POLICY_DECISION',
        source: 'POLICY',
        trust: 'TRUSTED',
        payload: {
          outcome: policyDecision.outcome,
          policyVersion: policyDecision.policyVersion
        },
        summary: `Policy outcome ${policyDecision.outcome}.`,
        provenance: { sourceId: 'policy-engine' }
      })
    )

    if (policyDecision.outcome === 'DENY') {
      await this.recordStep(run, {
        stepNumber,
        stepType: 'POLICY',
        status: 'FAILED',
        sideEffecting: false,
        reasonCode: 'POLICY_REQUIRED',
        errorCode: 'policy_denied'
      })
      return this.stop('POLICY_DENIED', policyDecision.reason)
    }
    if (policyDecision.outcome === 'HANDOFF') {
      await this.recordStep(run, {
        stepNumber,
        stepType: 'HANDOFF',
        status: 'SUCCEEDED',
        sideEffecting: false,
        reasonCode: 'HANDOFF_REQUIRED'
      })
      return this.stop('HUMAN_TAKEOVER', policyDecision.reason)
    }

    const requiresApproval =
      forceApproval ||
      policyDecision.outcome === 'REQUIRE_APPROVAL' ||
      tool.requiresApproval
    let approvalId: ApprovalId | undefined
    let approvalExecutionRequest: ApprovalExecutionRequest | undefined
    let approvalExecution: ApprovalExecutionHandle | undefined

    if (requiresApproval) {
      const approvalRemaining = this.remainingDuration(run)
      if (approvalRemaining <= 0) {
        return this.stop(
          'MAX_DURATION',
          'Duration budget exhausted before approval evaluation.'
        )
      }
      let approval
      try {
        const approvalOrDeadline = await this.withDeadline(
          this.options.approvals.request({
            tenantId: run.input.tenantId,
            agentId: run.input.agent.id,
            operationKey,
            toolId: tool.id,
            summary: tool.description,
            correlationId: run.input.correlationId,
            executionRef: run.executionId,
            operatorId: run.input.agent.id,
            agentVersion: run.input.agent.version,
            action: 'tool.execute',
            resource: { type: 'tool', id: tool.id },
            payload: bindCapabilityFingerprint(
              invocation.input,
              this.options.capabilityFingerprint
            ),
            policyVersion: policyDecision.policyVersion
          }),
          approvalRemaining
        )
        if (approvalOrDeadline === DEADLINE_EXCEEDED) {
          return this.stop(
            'MAX_DURATION',
            'Duration budget exhausted during approval evaluation.'
          )
        }
        approval = approvalOrDeadline
      } catch (error) {
        return this.stop(
          'APPROVAL_REQUIRED',
          `Approval could not be evaluated: ${errorMessage(error)}.`
        )
      }
      if (approval.status === 'PENDING') {
        return {
          kind: 'pause',
          pausedKind: 'APPROVAL_REQUIRED',
          decision,
          ...(approval.approvalId ? { approvalId: approval.approvalId } : {}),
          pauseStepNumber: stepNumber
        }
      }
      if (approval.status === 'DENIED') {
        await this.recordStep(run, {
          stepNumber,
          stepType: 'APPROVAL',
          status: 'FAILED',
          sideEffecting: false,
          reasonCode: 'POLICY_REQUIRED',
          errorCode: 'approval_denied'
        })
        return this.stop('POLICY_DENIED', approval.reason)
      }
      if (!approval.approvalId) {
        return this.stop(
          'INSUFFICIENT_EVIDENCE',
          'Approved execution has no approval identifier.'
        )
      }
      approvalId = approval.approvalId
      if (
        run.state.pendingApprovalId &&
        run.state.pendingApprovalId !== approvalId
      ) {
        return this.stop(
          'STATE_CONFLICT',
          'Approval identity changed while resuming the execution.'
        )
      }
      approvalExecutionRequest = {
        tenantId: run.input.tenantId,
        approvalId,
        agentId: run.input.agent.id,
        agentVersion: run.input.agent.version,
        action: 'tool.execute',
        resource: { type: 'tool', id: tool.id },
        payload: bindCapabilityFingerprint(
          invocation.input,
          this.options.capabilityFingerprint
        ),
        policyVersion: policyDecision.policyVersion,
        operationKey,
        executionRef: run.executionId
      }
    }

    // Budget accounting is committed with the in-flight decision so a crash
    // cannot replay the same step against an unconsumed counter.
    run.usage.toolCalls += 1
    run.state = {
      ...run.state,
      pendingDecision: decision,
      pendingStepNumber: stepNumber,
      ...(approvalId ? { pendingApprovalId: approvalId } : {})
    }
    await this.persistCheckpoint(run)
    await this.recordStep(run, {
      stepNumber,
      stepType: 'TOOL',
      status: 'RUNNING',
      sideEffecting: true,
      reasonCode: decision.reasonCode
    })

    if (approvalExecutionRequest && this.options.approvals.execution) {
      const beginRemaining = this.remainingDuration(run)
      if (beginRemaining <= 0) {
        return this.stop(
          'MAX_DURATION',
          'Duration budget exhausted before approval execution.'
        )
      }
      try {
        const handleOrDeadline = await this.withDeadline(
          this.options.approvals.execution.begin(approvalExecutionRequest),
          beginRemaining
        )
        if (handleOrDeadline === DEADLINE_EXCEEDED) {
          return this.stop(
            'MAX_DURATION',
            'Approval execution reservation timed out.'
          )
        }
        approvalExecution = handleOrDeadline
      } catch (error) {
        return this.stop(
          'STATE_CONFLICT',
          `Approval could not be consumed safely: ${errorMessage(error)}.`
        )
      }
    }

    const abortController = new AbortController()
    let toolResult: ToolResult
    let toolThrew = false
    try {
      const toolRemaining = this.remainingDuration(run)
      if (toolRemaining <= 0) {
        return this.stop(
          'MAX_DURATION',
          'Duration budget exhausted before tool execution.'
        )
      }
      const resultOrDeadline = await this.withDeadline(
        tool.execute(invocation.input, {
          tenantId: run.input.tenantId,
          agentId: run.input.agent.id,
          correlationId: run.input.correlationId,
          traceId: run.input.traceId,
          operationKey,
          signal: abortController.signal
        }),
        toolRemaining
      )
      if (resultOrDeadline === DEADLINE_EXCEEDED) {
        abortController.abort()
        if (
          approvalExecution &&
          approvalExecutionRequest &&
          this.options.approvals.execution
        ) {
          await this.options.approvals.execution
            .uncertain({
              request: approvalExecutionRequest,
              reservationId: approvalExecution.reservationId,
              reason:
                'Tool exceeded its deadline after approval execution started.',
              evidenceRef: `${run.executionId}:tool_deadline`
            })
            .catch(() => undefined)
        }
        await this.recordStep(run, {
          stepNumber,
          stepType: 'TOOL',
          status: 'FAILED',
          sideEffecting: true,
          reasonCode: decision.reasonCode,
          errorCode: approvalExecution ? 'unknown_effect' : 'deadline'
        })
        return this.stop(
          approvalExecution ? 'TOOL_FAILURE' : 'MAX_DURATION',
          approvalExecution
            ? 'unknown_effect: duration budget exhausted during tool execution.'
            : 'Duration budget exhausted during tool execution.'
        )
      }
      toolResult = resultOrDeadline
    } catch (error) {
      toolThrew = true
      toolResult = { status: 'FAILED', error: errorMessage(error) }
    }

    if (toolResult.status !== 'SUCCEEDED') {
      if (
        approvalExecution &&
        approvalExecutionRequest &&
        this.options.approvals.execution
      ) {
        const port = this.options.approvals.execution
        if (toolThrew) {
          await port
            .uncertain({
              request: approvalExecutionRequest,
              reservationId: approvalExecution.reservationId,
              reason: `Tool executor threw after approval execution started: ${toolResult.error ?? 'unknown failure'}`,
              evidenceRef: `${run.executionId}:tool_uncertain`
            })
            .catch(() => undefined)
        } else {
          await port
            .fail({
              request: approvalExecutionRequest,
              reservationId: approvalExecution.reservationId,
              evidenceRef: `${run.executionId}:tool_failed`
            })
            .catch(() => undefined)
        }
      }
      const unknownEffect =
        toolThrew || toolResult.error?.startsWith('unknown_effect:') === true
      await this.recordObservation(
        run,
        this.makeObservation(run, {
          stepId: `step_${run.executionId}_${stepNumber}_tool`,
          stepNumber,
          type: 'TOOL_RESULT',
          source: 'TOOL',
          trust: 'UNTRUSTED',
          payload: {
            status: unknownEffect ? 'REJECTED' : toolResult.status,
            error: toolResult.error ?? 'tool execution failed'
          },
          summary: unknownEffect
            ? 'Tool outcome is uncertain and requires reconciliation.'
            : 'Tool execution failed.',
          provenance: {
            sourceId: tool.id,
            ...(tool.version ? { sourceVersion: tool.version } : {}),
            operationKey,
            ...(unknownEffect ? { effectRef: operationKey } : {})
          }
        })
      )
      await this.recordStep(run, {
        stepNumber,
        stepType: 'TOOL',
        status: 'FAILED',
        sideEffecting: true,
        reasonCode: decision.reasonCode,
        errorCode: unknownEffect ? 'unknown_effect' : 'tool_failed'
      })
      return this.stop(
        'TOOL_FAILURE',
        unknownEffect
          ? `unknown_effect: ${toolResult.error ?? 'Tool execution outcome is uncertain.'}`
          : (toolResult.error ?? 'Tool execution failed.')
      )
    }

    if (
      approvalExecution &&
      approvalExecutionRequest &&
      this.options.approvals.execution
    ) {
      try {
        await this.options.approvals.execution.complete({
          request: approvalExecutionRequest,
          reservationId: approvalExecution.reservationId,
          evidenceRef: `${run.executionId}:tool_confirmed`
        })
      } catch (error) {
        await this.recordObservation(
          run,
          this.makeObservation(run, {
            stepId: `step_${run.executionId}_${stepNumber}_tool`,
            stepNumber,
            type: 'TOOL_RESULT',
            source: 'TOOL',
            trust: 'UNTRUSTED',
            payload: {
              status: 'REJECTED',
              error: 'approval_confirmation_failed'
            },
            summary: 'Approval confirmation failed after the effect.',
            provenance: {
              sourceId: tool.id,
              operationKey,
              effectRef: operationKey
            }
          })
        )
        await this.recordStep(run, {
          stepNumber,
          stepType: 'TOOL',
          status: 'FAILED',
          sideEffecting: true,
          reasonCode: decision.reasonCode,
          errorCode: 'unknown_effect'
        })
        return this.stop(
          'TOOL_FAILURE',
          `unknown_effect: approval confirmation failed: ${errorMessage(error)}.`
        )
      }
    }

    const observation = this.makeObservation(run, {
      stepId: `step_${run.executionId}_${stepNumber}_tool`,
      stepNumber,
      type: 'TOOL_RESULT',
      source: 'TOOL',
      trust: 'UNTRUSTED',
      payload: {
        status: 'SUCCEEDED',
        sideEffect: tool.sideEffect,
        output: boundedPayload(
          toolResult.output,
          this.maxObservationPayloadChars
        )
      },
      summary: stringifySummary(
        toolResult.output,
        'Tool completed successfully.'
      ),
      provenance: {
        sourceId: tool.id,
        ...(tool.version ? { sourceVersion: tool.version } : {}),
        operationKey,
        effectRef: operationKey
      }
    })
    await this.recordObservation(run, observation)
    run.lastToolObservation = observation
    run.state = { ...run.state, pendingApprovalId: undefined }
    await this.recordStep(run, {
      stepNumber,
      stepType: 'TOOL',
      status: 'SUCCEEDED',
      sideEffecting: true,
      reasonCode: decision.reasonCode,
      observationRefs: [observation.observationId]
    })
    return { kind: 'continue' }
  }

  private async dispatchKnowledge(
    run: LoopRun,
    decision: LoopDecision,
    stepNumber: number
  ): Promise<DispatchOutcome> {
    const knowledgeLimit =
      run.input.budget.maxKnowledgeCalls ?? run.input.budget.maxSteps
    if (run.usage.knowledgeCalls + 1 > knowledgeLimit) {
      return this.stop(
        'MAX_KNOWLEDGE_CALLS',
        'Knowledge-call budget exhausted.'
      )
    }
    const remaining = this.remainingDuration(run)
    if (remaining <= 0) {
      return this.stop(
        'MAX_DURATION',
        'Duration budget exhausted before knowledge search.'
      )
    }
    const provider = this.options.knowledge
    if (!provider) {
      return this.stop('STATE_CONFLICT', 'No knowledge provider is configured.')
    }
    const query = decision.query as string
    run.usage.knowledgeCalls += 1
    await this.persistCheckpoint(run)
    let result: KnowledgeSearchResult
    try {
      const searchOrDeadline = await this.withDeadline(
        provider.search({
          query,
          ...(decision.knowledgeCategories
            ? { categories: decision.knowledgeCategories }
            : {}),
          context: run.input.context,
          correlationId: run.input.correlationId
        }),
        remaining
      )
      if (searchOrDeadline === DEADLINE_EXCEEDED) {
        return this.stop(
          'MAX_DURATION',
          'Duration budget exhausted during knowledge search.'
        )
      }
      result = searchOrDeadline
    } catch (error) {
      await this.recordStep(run, {
        stepNumber,
        stepType: 'KNOWLEDGE',
        status: 'FAILED',
        sideEffecting: false,
        reasonCode: decision.reasonCode,
        errorCode: 'knowledge_failure'
      })
      return this.stop(
        'INSUFFICIENT_EVIDENCE',
        `Knowledge search failed: ${errorMessage(error)}.`
      )
    }
    const observation = this.makeObservation(run, {
      stepId: `step_${run.executionId}_${stepNumber}_knowledge`,
      stepNumber,
      type: 'KNOWLEDGE_RESULT',
      source: 'KNOWLEDGE',
      trust: 'UNTRUSTED',
      payload: {
        query,
        items: boundedPayload(result.items, this.maxObservationPayloadChars)
      },
      summary: `Knowledge search returned ${result.items.length} item(s) for "${query}".`,
      provenance: {
        sourceId: 'knowledge-provider',
        ...(result.provenance[0]?.sourceVersion
          ? { sourceVersion: result.provenance[0].sourceVersion }
          : {})
      }
    })
    await this.recordObservation(run, observation)
    await this.recordStep(run, {
      stepNumber,
      stepType: 'KNOWLEDGE',
      status: 'SUCCEEDED',
      sideEffecting: false,
      reasonCode: decision.reasonCode,
      observationRefs: [observation.observationId]
    })

    if (this.options.sufficiencyEvaluator) {
      const sufficiency = await this.options.sufficiencyEvaluator.evaluate({
        query,
        requestedCategories: decision.knowledgeCategories ?? [],
        observations: run.observations.filter(
          (entry) => entry.type === 'KNOWLEDGE_RESULT'
        )
      })
      run.lastSufficiency = sufficiency.level
      await this.recordObservation(
        run,
        this.makeObservation(run, {
          stepId: `step_${run.executionId}_${stepNumber}_knowledge`,
          stepNumber,
          type: 'SUFFICIENCY',
          source: 'SYSTEM',
          trust: 'TRUSTED',
          payload: sufficiency,
          summary: `Evidence sufficiency is ${sufficiency.level}.`,
          provenance: { sourceId: 'sufficiency-evaluator' }
        })
      )
    }
    return { kind: 'continue' }
  }

  private async dispatchVerify(
    run: LoopRun,
    decision: LoopDecision,
    stepNumber: number
  ): Promise<DispatchOutcome> {
    const verificationLimit =
      run.input.budget.maxVerificationCalls ?? run.input.budget.maxSteps
    if (run.usage.verificationCalls + 1 > verificationLimit) {
      return this.stop(
        'MAX_VERIFICATION_CALLS',
        'Verification budget exhausted.'
      )
    }
    run.usage.verificationCalls += 1
    await this.persistCheckpoint(run)
    const target = decision.verificationTarget as string
    const verification = this.verify(run, target)
    await this.recordObservation(
      run,
      this.makeObservation(run, {
        stepId: `step_${run.executionId}_${stepNumber}_verify`,
        stepNumber,
        type: 'VERIFICATION',
        source: 'SYSTEM',
        trust: 'TRUSTED',
        payload: { target, ...verification },
        summary: `Verification ${verification.valid ? 'passed' : 'failed'} for target ${target}.`,
        provenance: { sourceId: 'runtime-verifier' }
      })
    )
    await this.recordStep(run, {
      stepNumber,
      stepType: 'VERIFY',
      status: verification.valid ? 'SUCCEEDED' : 'FAILED',
      sideEffecting: false,
      reasonCode: decision.reasonCode,
      ...(verification.valid ? {} : { errorCode: 'verification_failed' })
    })
    if (!verification.valid) {
      run.skipEvaluationOnce = true
      run.state = {
        ...run.state,
        lastEvaluation: {
          outcome: 'INCOMPLETE',
          reasonCode: 'VERIFICATION_FAILED',
          deterministic: true,
          detail: verification.details.join('; ')
        }
      }
      run.lastEvaluation = run.state.lastEvaluation ?? null
    }
    return { kind: 'continue' }
  }

  private verify(
    run: LoopRun,
    target: string
  ): { valid: boolean; details: readonly string[] } {
    if (target === 'tool-result') {
      const succeeded =
        run.lastToolObservation !== null &&
        (run.lastToolObservation.payload as { status?: string } | null)
          ?.status === 'SUCCEEDED'
      return {
        valid: succeeded,
        details: succeeded ? [] : ['no successful tool result is available']
      }
    }
    if (target === 'evidence-coverage') {
      const valid = run.lastSufficiency === 'SUFFICIENT'
      return {
        valid,
        details: valid
          ? []
          : [`evidence sufficiency is ${run.lastSufficiency ?? 'unknown'}`]
      }
    }
    if (target === 'response-claims') {
      const validation = this.validateClaims(run, run.responseText ?? '')
      return {
        valid: validation.valid,
        details: validation.unsupportedClaims
      }
    }
    return {
      valid: false,
      details: [`unsupported verification target ${target}`]
    }
  }

  private validateClaims(run: LoopRun, responseText: string): ClaimValidation {
    const extractor = this.options.claimExtractor
    if (!extractor || !responseText.trim()) {
      return { valid: true, unsupportedClaims: [] }
    }
    return defaultClaimValidation(extractor(responseText), run.observations)
  }

  private async dispatchReplan(
    run: LoopRun,
    decision: LoopDecision,
    stepNumber: number
  ): Promise<DispatchOutcome> {
    const replanLimit = run.input.budget.maxReplans ?? run.input.budget.maxSteps
    if (run.usage.replans + 1 > replanLimit) {
      return this.stop('MAX_REPLANS', 'Replan budget exhausted.')
    }
    run.usage.replans += 1
    await this.persistCheckpoint(run)
    await this.recordObservation(
      run,
      this.makeObservation(run, {
        stepId: `step_${run.executionId}_${stepNumber}_replan`,
        stepNumber,
        type: 'SYSTEM_EVENT',
        source: 'SYSTEM',
        trust: 'TRUSTED',
        payload: { event: 'replan', reasonCode: decision.reasonCode },
        summary: `Strategy changed: ${decision.reasonCode}.`,
        provenance: { sourceId: 'runtime-replan' }
      })
    )
    await this.recordStep(run, {
      stepNumber,
      stepType: 'MODEL',
      status: 'SUCCEEDED',
      sideEffecting: false,
      reasonCode: decision.reasonCode
    })
    await this.safeAudit(run, 'runtime.replanned', {
      result: decision.reasonCode
    })
    return { kind: 'continue' }
  }

  private async dispatchRespond(
    run: LoopRun,
    decision: LoopDecision,
    stepNumber: number
  ): Promise<DispatchOutcome> {
    let response = decision.responseText?.trim() ?? ''
    if (!response && decision.responseIntent?.trim()) {
      const composed = await this.composeResponse(run, decision)
      if ('stopReason' in composed) {
        return this.stop(composed.stopReason, composed.response)
      }
      response = composed.response
    }
    if (!response) {
      return this.stop(
        'INSUFFICIENT_EVIDENCE',
        'The orchestrator attempted to respond without content.'
      )
    }
    run.responseText = response

    const implicitVerification = this.validateClaims(run, response)
    if (!implicitVerification.valid) {
      const limit =
        run.input.budget.maxVerificationCalls ?? run.input.budget.maxSteps
      if (run.usage.verificationCalls + 1 > limit) {
        await this.recordStep(run, {
          stepNumber,
          stepType: 'RESPOND',
          status: 'FAILED',
          sideEffecting: false,
          reasonCode: decision.reasonCode,
          errorCode: 'verification_failed'
        })
        return this.stop(
          'VERIFICATION_FAILED',
          `Response claims are not supported by evidence: ${implicitVerification.unsupportedClaims.join('; ')}`
        )
      }
      run.usage.verificationCalls += 1
      await this.persistCheckpoint(run)
      await this.recordObservation(
        run,
        this.makeObservation(run, {
          stepId: `step_${run.executionId}_${stepNumber}_respond`,
          stepNumber,
          type: 'VERIFICATION',
          source: 'SYSTEM',
          trust: 'TRUSTED',
          payload: {
            target: 'response-claims',
            valid: false,
            unsupportedClaims: implicitVerification.unsupportedClaims
          },
          summary: 'Response contains claims without evidence references.',
          provenance: { sourceId: 'runtime-verifier' }
        })
      )
      await this.recordStep(run, {
        stepNumber,
        stepType: 'RESPOND',
        status: 'FAILED',
        sideEffecting: false,
        reasonCode: decision.reasonCode,
        errorCode: 'verification_failed'
      })
      run.state = {
        ...run.state,
        lastEvaluation: {
          outcome: 'INCOMPLETE',
          reasonCode: 'VERIFICATION_FAILED',
          deterministic: true,
          detail: 'The response must be revised with grounded claims.'
        }
      }
      run.lastEvaluation = run.state.lastEvaluation ?? null
      run.skipEvaluationOnce = true
      return { kind: 'continue' }
    }

    await this.recordStep(run, {
      stepNumber,
      stepType: 'RESPOND',
      status: 'SUCCEEDED',
      sideEffecting: false,
      reasonCode: decision.reasonCode
    })
    return { kind: 'continue' }
  }

  private async composeResponse(
    run: LoopRun,
    decision: LoopDecision
  ): Promise<
    { response: string } | { stopReason: StopReason; response: string }
  > {
    if (run.usage.modelCalls + 1 > run.input.budget.maxModelCalls) {
      return {
        stopReason: 'MAX_MODEL_CALLS',
        response:
          'Model-call budget exhausted before the response was composed.'
      }
    }
    const remaining = this.remainingDuration(run)
    if (remaining <= 0) {
      return {
        stopReason: 'MAX_DURATION',
        response: 'Duration budget exhausted before the response was composed.'
      }
    }
    try {
      const modelOrDeadline = await this.withDeadline(
        this.options.modelGateway.complete({
          messages: [
            {
              role: 'system',
              content: [
                'Compose the final user-facing answer.',
                'Use only the structured observations as facts.',
                'Never claim an external action succeeded without an effect observation.',
                `Response intent: ${decision.responseIntent ?? ''}`
              ].join(' ')
            },
            { role: 'user', content: run.input.userMessage }
          ],
          context: run.input.context,
          budget: run.input.budget,
          correlationId: run.input.correlationId,
          purpose: 'RESPONSE'
        }),
        remaining
      )
      if (modelOrDeadline === DEADLINE_EXCEEDED) {
        return {
          stopReason: 'MAX_DURATION',
          response: 'Duration budget exhausted during response composition.'
        }
      }
      run.usage.modelCalls += 1
      run.usage.inputTokens += modelOrDeadline.inputTokens
      run.usage.outputTokens += modelOrDeadline.outputTokens
      run.usage.costUsd += modelOrDeadline.costUsd
      const afterUsage = this.checkAfterUsage(run)
      if (afterUsage) {
        return { stopReason: afterUsage.reason, response: afterUsage.response }
      }
      return { response: modelOrDeadline.text }
    } catch (error) {
      return {
        stopReason: 'MODEL_FAILURE',
        response: `Response composition failed: ${errorMessage(error)}.`
      }
    }
  }

  private evaluatorFor(run: LoopRun): CompletionEvaluator {
    if (this.completionEvaluatorOverride) {
      return this.completionEvaluatorOverride
    }
    const strategy = run.input.agent.completionStrategy ?? 'DETERMINISTIC'
    const cached = this.completionEvaluators.get(strategy)
    if (cached) return cached
    const evaluator = new DeterministicCompletionEvaluator({ strategy })
    this.completionEvaluators.set(strategy, evaluator)
    return evaluator
  }

  private async evaluate(
    run: LoopRun,
    decision: LoopDecision
  ): Promise<Extract<DispatchOutcome, { kind: 'stop' }> | null> {
    const evaluation = await this.evaluatorFor(run).evaluate({
      goal: run.state.goal,
      state: { ...run.state, observations: run.observations },
      observations: run.observations,
      lastDecision: decision,
      ...(run.responseText ? { result: run.responseText } : {})
    })
    if (evaluation.usage) {
      run.usage.modelCalls += evaluation.usage.modelCalls
      run.usage.inputTokens += evaluation.usage.inputTokens
      run.usage.outputTokens += evaluation.usage.outputTokens
      run.usage.costUsd += evaluation.usage.costUsd
    }
    run.lastEvaluation = evaluation
    run.state = { ...run.state, lastEvaluation: evaluation }
    await this.safeAudit(run, 'evaluation.completed', {
      result: `${evaluation.outcome}:${evaluation.reasonCode}`
    })
    if (evaluation.usage) {
      const afterEvaluation = this.checkAfterUsage(run)
      if (afterEvaluation) {
        return this.stop(afterEvaluation.reason, afterEvaluation.response)
      }
    }

    if (evaluation.outcome === 'COMPLETE') {
      if (decision.decisionType === 'RESPOND') {
        return this.stop(
          'COMPLETED',
          run.responseText ?? 'Execution completed.'
        )
      }
      if (
        decision.decisionType === 'STOP' &&
        decision.reasonCode === 'USER_REQUESTED_STOP'
      ) {
        return this.stop('COMPLETED', 'Execution stopped at the user request.')
      }
      // Completion requires an explicit RESPOND step.
      return null
    }
    if (evaluation.outcome === 'FAILED') {
      return this.stop(
        mapEvaluationToStopReason(evaluation),
        run.responseText ??
          `Completion evaluation failed: ${evaluation.detail ?? evaluation.reasonCode}.`
      )
    }
    if (evaluation.outcome === 'INSUFFICIENT_EVIDENCE') {
      if (
        decision.decisionType === 'RESPOND' ||
        decision.decisionType === 'STOP'
      ) {
        return this.stop(
          'INSUFFICIENT_EVIDENCE',
          run.responseText ??
            'The available evidence is insufficient for a complete answer.'
        )
      }
    }
    // A finalising decision with incomplete evidence is terminal: the agent
    // tried to answer and the runtime will not let it keep improvising.
    if (
      evaluation.outcome === 'INCOMPLETE' &&
      evaluation.reasonCode === 'EVIDENCE_INCOMPLETE' &&
      (decision.decisionType === 'RESPOND' || decision.decisionType === 'STOP')
    ) {
      return this.stop(
        'INSUFFICIENT_EVIDENCE',
        'The available evidence is incomplete for a final answer.'
      )
    }
    return null
  }

  private async pause(
    run: LoopRun,
    stepNumber: number,
    outcome: Extract<DispatchOutcome, { kind: 'pause' }>
  ): Promise<Extract<DispatchOutcome, { kind: 'stop' }>> {
    const decision = outcome.decision
    if (outcome.pausedKind === 'NEEDS_USER_INPUT') {
      const requested = decision?.requestedInput
      const promptIntent =
        requested?.promptIntent ??
        decision?.responseIntent ??
        'More information is required.'
      run.state = {
        ...run.state,
        stepNumber,
        pendingQuestion: requested ?? {
          questionType: 'CLARIFICATION',
          missingFields: [],
          promptIntent
        },
        openQuestions: [...run.state.openQuestions, promptIntent],
        stopReason: 'NEEDS_USER_INPUT'
      }
      run.stepNumber = stepNumber
      await this.recordStep(run, {
        stepNumber,
        stepType: 'USER_INPUT',
        status: 'WAITING',
        sideEffecting: false,
        reasonCode: decision?.reasonCode ?? 'MISSING_INFORMATION'
      })
      await this.persistCheckpoint(run)
      await this.safeAudit(run, 'runtime.paused', {
        result: 'NEEDS_USER_INPUT'
      })
      return {
        kind: 'stop',
        stopReason: 'NEEDS_USER_INPUT',
        response: promptIntent
      }
    }

    const pauseStepNumber = outcome.pauseStepNumber ?? stepNumber
    run.state = {
      ...run.state,
      stepNumber: pauseStepNumber,
      pendingDecision: decision ?? undefined,
      pendingStepNumber: pauseStepNumber,
      ...(outcome.approvalId ? { pendingApprovalId: outcome.approvalId } : {}),
      stopReason: 'APPROVAL_REQUIRED'
    }
    run.stepNumber = pauseStepNumber
    await this.recordStep(run, {
      stepNumber: pauseStepNumber,
      stepType: 'TOOL',
      status: 'WAITING',
      sideEffecting: true,
      reasonCode: 'POLICY_REQUIRED'
    })
    await this.persistCheckpoint(run)
    await this.safeAudit(run, 'runtime.paused', { result: 'APPROVAL_REQUIRED' })
    return {
      kind: 'stop',
      stopReason: 'APPROVAL_REQUIRED',
      ...(outcome.approvalId ? { approvalId: outcome.approvalId } : {}),
      response:
        decision?.responseIntent ?? 'Approval is required before continuing.'
    }
  }

  private checkAfterUsage(
    run: LoopRun
  ): { reason: StopReason; response: string } | null {
    if (run.usage.modelCalls > run.input.budget.maxModelCalls) {
      return {
        reason: 'MAX_MODEL_CALLS',
        response: 'Model-call budget exhausted.'
      }
    }
    if (
      run.usage.inputTokens + run.usage.outputTokens >
      run.input.budget.maxTokens
    ) {
      return { reason: 'MAX_TOKENS', response: 'Token budget exhausted.' }
    }
    if (run.usage.costUsd > run.input.budget.maxCostUsd) {
      return { reason: 'MAX_COST', response: 'Cost budget exhausted.' }
    }
    return null
  }

  private accountUsage(run: LoopRun, usage: ModelUsage): void {
    run.usage.modelCalls += usage.modelCalls
    run.usage.inputTokens += usage.inputTokens
    run.usage.outputTokens += usage.outputTokens
    run.usage.costUsd += usage.costUsd
  }

  private effectiveDuration(run: LoopRun): number {
    return run.usage.activeDurationMs + (Date.now() - run.startedAtMs)
  }

  private remainingDuration(run: LoopRun): number {
    return run.input.budget.maxDurationMs - this.effectiveDuration(run)
  }

  private makeObservation(
    run: LoopRun,
    input: {
      stepId: string
      stepNumber: number
      type: Observation['type']
      source: Observation['source']
      trust: Observation['trust']
      payload: unknown
      summary: string
      provenance: Observation['provenance']
    }
  ): Observation {
    return {
      observationId: `obs_${randomUUID()}`,
      executionId: run.executionId,
      stepId: input.stepId,
      stepNumber: input.stepNumber,
      type: input.type,
      source: input.source,
      trust: input.trust,
      payload: boundedPayload(input.payload, this.maxObservationPayloadChars),
      summary: input.summary.slice(0, 500),
      provenance: input.provenance,
      timestamp: this.clock().toISOString()
    }
  }

  private async recordObservation(
    run: LoopRun,
    observation: Observation
  ): Promise<void> {
    run.observations = [...run.observations, observation].slice(
      -MAX_CHECKPOINT_OBSERVATIONS
    )
    run.state = { ...run.state, observations: run.observations }
    await this.safeAudit(run, 'observation.recorded', {
      result: `${observation.source}:${observation.type}`
    })
  }

  private async recordStep(
    run: LoopRun,
    input: {
      stepNumber: number
      stepType: ExecutionStep['stepType']
      status: ExecutionStep['status']
      sideEffecting: boolean
      decisionType?: ExecutionStep['decisionType']
      reasonCode?: ExecutionStep['reasonCode']
      errorCode?: string
      observationRefs?: readonly string[]
    }
  ): Promise<void> {
    const stepId = `step_${run.executionId}_${input.stepNumber}_${input.stepType.toLowerCase()}`
    const terminal = input.status === 'SUCCEEDED' || input.status === 'FAILED'
    const decisionType =
      input.decisionType ?? run.lastDecision?.decisionType ?? undefined
    await this.options.stepStore.recordStep({
      stepId,
      executionId: run.executionId,
      tenantId: run.input.tenantId,
      stepNumber: input.stepNumber,
      stepType: input.stepType,
      status: input.status,
      attempt: 1,
      sideEffecting: input.sideEffecting,
      startedAt: this.clock().toISOString(),
      ...(terminal ? { completedAt: this.clock().toISOString() } : {}),
      ...(decisionType ? { decisionType } : {}),
      ...(input.reasonCode ? { reasonCode: input.reasonCode } : {}),
      observationRefs: input.observationRefs ?? [],
      ...(input.errorCode ? { errorCode: input.errorCode } : {})
    })
    if (
      (terminal || input.status === 'WAITING') &&
      !run.countedSteps.has(input.stepNumber)
    ) {
      run.countedSteps.add(input.stepNumber)
      run.usage.steps += 1
    }
    await this.safeAudit(
      run,
      input.status === 'RUNNING' ? 'step.started' : 'step.completed',
      { result: `${input.stepType}:${input.status}`, tool: null }
    )
  }

  private async persistCheckpoint(run: LoopRun): Promise<void> {
    const checkpoint = sealCheckpoint({
      executionId: run.executionId,
      tenantId: run.input.tenantId,
      checkpointVersion: 1,
      runtimeProfile: 'iterative',
      runtimeVersion: RUNTIME_V2_VERSION,
      orchestratorVersion: this.orchestratorVersion,
      stepNumber: run.state.stepNumber,
      state: {
        ...run.state,
        observations: run.observations.slice(-MAX_CHECKPOINT_OBSERVATIONS)
      },
      budgetUsage: { ...run.usage }
    })
    await this.options.stepStore.saveCheckpoint(checkpoint)
  }

  private operationKey(
    run: LoopRun,
    stepNumber: number,
    toolId: string
  ): string {
    return `${run.executionId}:s${stepNumber}:${toolId}`
  }

  private async safeAudit(
    run: LoopRun,
    action: string,
    extras: { result: string; tool?: string | null }
  ): Promise<void> {
    try {
      await this.options.audit.append({
        actor: run.input.agent.id,
        agent: run.input.agent.id,
        tenant: run.input.tenantId,
        action,
        policy: null,
        approval:
          (run.state.pendingApprovalId as ApprovalId | undefined) ?? null,
        tool: extras.tool ?? null,
        result: extras.result,
        timestamp: this.clock().toISOString(),
        traceId: run.input.traceId,
        correlationId: run.input.correlationId
      })
    } catch {
      // Observability must not turn a governed loop into an unhandled error.
    }
  }

  private async finalize(
    run: LoopRun,
    outcome: Extract<DispatchOutcome, { kind: 'stop' }>,
    startedAtMs: number
  ): Promise<RuntimeResult> {
    const stopReason = outcome.stopReason ?? 'INSUFFICIENT_EVIDENCE'
    run.usage.activeDurationMs += Date.now() - startedAtMs
    run.state = { ...run.state, stopReason }
    let checkpointProven = true
    if (outcome.preserveCheckpoint) {
      // Intentional no-write: the durable pause must stay resumable after a
      // rejected resume binding.
    } else {
      try {
        await this.persistCheckpoint(run)
      } catch {
        checkpointProven = false
      }
    }
    const claimedReason: StopReason = checkpointProven
      ? stopReason
      : 'INSUFFICIENT_EVIDENCE'
    if (!checkpointProven) {
      run.state = { ...run.state, stopReason: claimedReason }
    }
    const result: RuntimeResult = {
      response: outcome.response ?? 'Execution stopped.',
      stopReason: claimedReason,
      ...(outcome.kind === 'stop' && outcome.approvalId
        ? { approvalId: outcome.approvalId }
        : {}),
      steps: run.usage.steps,
      modelCalls: run.usage.modelCalls,
      toolCalls: run.usage.toolCalls,
      usage: {
        inputTokens: run.usage.inputTokens,
        outputTokens: run.usage.outputTokens,
        costUsd: run.usage.costUsd
      },
      ...(run.lastToolObservation
        ? {
            toolResult: {
              status:
                (run.lastToolObservation.payload as { status?: string } | null)
                  ?.status === 'SUCCEEDED'
                  ? ('SUCCEEDED' as const)
                  : ('REJECTED' as const),
              output: (
                run.lastToolObservation.payload as {
                  output?: unknown
                } | null
              )?.output
            }
          }
        : {})
    }
    const finalResult = await this.recordAuditOutcome(
      run,
      result,
      claimedReason
    )
    this.recordTelemetry(run, finalResult, startedAtMs)
    return finalResult
  }

  private async recordAuditOutcome(
    run: LoopRun,
    result: RuntimeResult,
    stopReason: StopReason
  ): Promise<RuntimeResult> {
    const action =
      stopReason === 'COMPLETED'
        ? 'runtime.completed'
        : stopReason === 'NEEDS_USER_INPUT' ||
            stopReason === 'APPROVAL_REQUIRED'
          ? 'runtime.paused'
          : 'runtime.stopped'
    const remaining = this.remainingDuration(run)
    // A budget stop has no remaining time; grant a bounded audit grace so the
    // deterministic stop reason survives, and keep the result honest if even
    // that grace cannot record the audit event.
    const budgetStop = BUDGET_STOP_REASONS.has(stopReason) || remaining <= 0
    try {
      const deadlineMs = remaining > 0 ? remaining : 200
      const auditOrDeadline = await this.withDeadline(
        this.options.audit.append({
          actor: run.input.agent.id,
          agent: run.input.agent.id,
          tenant: run.input.tenantId,
          action,
          policy: null,
          approval: (result.approvalId as ApprovalId | undefined) ?? null,
          tool: run.lastToolObservation?.provenance.sourceId ?? null,
          result: stopReason,
          timestamp: this.clock().toISOString(),
          traceId: run.input.traceId,
          correlationId: run.input.correlationId
        }),
        deadlineMs
      )
      if (auditOrDeadline === DEADLINE_EXCEEDED) {
        throw new Error('audit deadline exceeded')
      }
      return result
    } catch {
      if (budgetStop) {
        return result
      }
      return {
        ...result,
        response:
          'Execution could not be completed because audit recording failed.',
        stopReason: 'INSUFFICIENT_EVIDENCE'
      }
    }
  }

  private recordTelemetry(
    run: LoopRun,
    result: RuntimeResult,
    startedAtMs: number
  ): void {
    const telemetry: TelemetryEvent = {
      name: 'harness.iterative',
      latencyMs: Date.now() - startedAtMs,
      errors: result.stopReason === 'COMPLETED' ? 0 : 1,
      costUsd: result.usage.costUsd,
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
      provider: null,
      toolDurationMs: 0,
      steps: result.steps,
      traceId: run.input.traceId,
      correlationId: run.input.correlationId,
      attributes: {
        outcome: result.stopReason,
        model_calls: result.modelCalls,
        tool_calls: result.toolCalls,
        knowledge_calls: run.usage.knowledgeCalls,
        replans: run.usage.replans,
        verification_calls: run.usage.verificationCalls
      }
    }
    try {
      this.options.telemetry.record(telemetry)
    } catch {
      // telemetry is best effort
    }
  }

  private async earlyFinish(
    input: RuntimeInput,
    response: string,
    stopReason: StopReason,
    startedAtMs: number
  ): Promise<RuntimeResult> {
    void startedAtMs
    const result: RuntimeResult = {
      response,
      stopReason,
      steps: 0,
      modelCalls: 0,
      toolCalls: 0,
      usage: { inputTokens: 0, outputTokens: 0, costUsd: 0 }
    }
    try {
      await this.options.audit.append({
        actor: input.agent.id,
        agent: input.agent.id,
        tenant: input.tenantId,
        action: 'runtime.stopped',
        policy: null,
        approval: null,
        tool: null,
        result: stopReason,
        timestamp: this.clock().toISOString(),
        traceId: input.traceId,
        correlationId: input.correlationId
      })
    } catch {
      return {
        ...result,
        response:
          'Execution could not be completed because audit recording failed.',
        stopReason: 'INSUFFICIENT_EVIDENCE'
      }
    }
    return result
  }

  private async withDeadline<T>(
    operation: Promise<T>,
    remainingMs: number
  ): Promise<T | typeof DEADLINE_EXCEEDED> {
    if (remainingMs <= 0) return DEADLINE_EXCEEDED
    let timer: ReturnType<typeof setTimeout> | undefined
    const deadline = new Promise<typeof DEADLINE_EXCEEDED>((resolve) => {
      timer = setTimeout(() => resolve(DEADLINE_EXCEEDED), remainingMs)
    })
    try {
      return await Promise.race([operation, deadline])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }
}

function stringifySummary(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string') return value.slice(0, 300)
  try {
    return (JSON.stringify(value) ?? fallback).slice(0, 300)
  } catch {
    return fallback
  }
}
