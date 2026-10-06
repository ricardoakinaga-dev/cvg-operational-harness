import { randomUUID } from 'node:crypto'
import type {
  AgenticKnowledgeProvider,
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
  sanitizeLoopDecision
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
  ToolRegistry
} from '@cvg/harness-contracts'
import { DefaultContextEngine } from './context-engine.ts'
import { DeterministicCompletionEvaluator } from './completion.ts'
import { decisionSignature, detectDecisionCycle } from './loop-detection.ts'
import { sealCheckpoint } from './step-store.ts'
import { agentExposesTool } from './runtime.ts'
import { KernelHost } from './kernel/host.ts'
import {
  CANCELLED_RESPONSE,
  createTurnState,
  runGate
} from './kernel/pipeline.ts'
import {
  approvalsControl,
  auditControl,
  budgetControl,
  effectsControl,
  logControl,
  modelCapability,
  pauseControl,
  policyControl,
  telemetryCapability,
  toolsCapability
} from './kernel/controls.ts'
import {
  CONTROL_SERVICES,
  DEADLINE,
  type EffectLedger,
  type KernelLog,
  type PauseSwitch,
  type ServiceKey,
  type TurnState
} from './kernel/types.ts'
import {
  applyResume,
  composeResponse,
  dispatchKnowledge,
  dispatchRespond,
  dispatchTool,
  evaluate,
  pause,
  validateDecision,
  type IterativeDispatchContext
} from './iterative-dispatch.ts'

export { decisionSignature, detectDecisionCycle } from './loop-detection.ts'

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
  /** Kernel controls (SPEC 0181); in-memory defaults when omitted. */
  readonly pause?: PauseSwitch
  readonly log?: KernelLog
  readonly effects?: EffectLedger
}

/** Services the iterative mode needs from the kernel (no single-pass planner). */
const ITERATIVE_REQUIRED_SERVICES: readonly ServiceKey[] = [
  ...CONTROL_SERVICES,
  'model',
  'tools',
  'telemetry'
]

export const DEADLINE_EXCEEDED = Symbol('iterative-deadline-exceeded')

const AUDIT_GRACE_MS = 200

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

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

export function bindCapabilityFingerprint(
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

export function mapEvaluationToStopReason(
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

export function boundedPayload(value: unknown, maxChars: number): unknown {
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

export interface LoopRun {
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
  /**
   * The checkpoint holds a step that already passed the dispatch checkpoint
   * (its tool call was counted) but never settled: a crash or an operator
   * pause. Resuming it must not spend the tool budget again.
   */
  inFlightCounted: boolean
}

export type DispatchOutcome =
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
  #kernel: Promise<KernelHost> | undefined
  readonly #turns = new WeakMap<
    LoopRun,
    { host: KernelHost; signal: AbortSignal }
  >()

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

  /**
   * Dependency surface handed to the extracted dispatch domain. It is built
   * here, where private members are accessible, so the exported class keeps
   * its exact public contract and the module never touches instance state
   * directly.
   */
  private get dispatchContext(): IterativeDispatchContext {
    return {
      options: this.options,
      maxObservationPayloadChars: this.maxObservationPayloadChars,
      stop: (stopReason, response) => this.stop(stopReason, response),
      operationKey: (run, stepNumber, toolId) =>
        this.operationKey(run, stepNumber, toolId),
      remainingDuration: (run) => this.remainingDuration(run),
      makeObservation: (run, input) => this.makeObservation(run, input),
      checkAfterUsage: (run) => this.checkAfterUsage(run),
      allowedDecisionTypes: (run) => this.allowedDecisionTypes(run),
      evaluatorFor: (run) => this.evaluatorFor(run),
      validateClaims: (run, responseText) =>
        this.validateClaims(run, responseText),
      withDeadline: (operation, remainingMs) =>
        this.withDeadline(operation, remainingMs),
      recordObservation: (run, observation) =>
        this.recordObservation(run, observation),
      recordStep: (run, input) => this.recordStep(run, input),
      persistCheckpoint: (run) => this.persistCheckpoint(run),
      safeAudit: (run, action, extras) => this.safeAudit(run, action, extras),
      composeResponse: (run, decision) => this.composeResponse(run, decision),
      kernel: (run) => this.kernelFor(run),
      turn: (run) => this.turnFor(run)
    }
  }

  /** Boots the kernel profile of the iterative mode once (SPEC 0181). */
  private bootKernel(): Promise<KernelHost> {
    this.#kernel ??= KernelHost.boot(
      [
        budgetControl(),
        pauseControl(this.options.pause),
        logControl(this.options.log),
        effectsControl(this.options.effects),
        policyControl(this.options.policy),
        approvalsControl(
          this.options.approvals,
          this.options.capabilityFingerprint
            ? { capabilityFingerprint: this.options.capabilityFingerprint }
            : {}
        ),
        auditControl(this.options.audit, { action: 'harness.iterative' }),
        modelCapability(this.options.modelGateway),
        toolsCapability(this.options.tools),
        telemetryCapability(this.options.telemetry, {
          name: 'harness.iterative'
        })
      ],
      ITERATIVE_REQUIRED_SERVICES
    )
    return this.#kernel
  }

  private kernelFor(run: LoopRun): KernelHost {
    const entry = this.#turns.get(run)
    if (!entry) throw new Error('Kernel turn is not bound to this run.')
    return entry.host
  }

  /**
   * Kernel view of the current run: the iterative active-duration budget and
   * the caller's cancel signal drive the shared pipelines.
   */
  private turnFor(run: LoopRun): TurnState {
    const entry = this.#turns.get(run)
    if (!entry) throw new Error('Kernel turn is not bound to this run.')
    return createTurnState(
      run.input,
      run.startedAtMs,
      {
        remainingMs: () => this.remainingDuration(run),
        withDeadline: async (operation, ms = this.remainingDuration(run)) => {
          const outcome = await this.withDeadline(
            ms <= 0 ? new Promise<never>(() => undefined) : operation(),
            ms
          )
          return outcome === DEADLINE_EXCEEDED ? DEADLINE : outcome
        },
        afterModel: () => undefined
      },
      entry.signal
    )
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

    let host: KernelHost
    try {
      host = await this.bootKernel()
    } catch (error) {
      return this.earlyFinish(
        input,
        `Kernel could not start: ${errorMessage(error)}.`,
        'INTERNAL_FAILURE',
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
      countedSteps: new Set<number>(),
      inFlightCounted: Boolean(
        checkpoint?.state.pendingDecision && !checkpoint.state.stopReason
      )
    }
    run.state.observations = run.observations
    const controller = new AbortController()
    if (input.signal?.aborted) controller.abort()
    input.signal?.addEventListener('abort', () => controller.abort(), {
      once: true
    })
    this.#turns.set(run, { host, signal: controller.signal })

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
    return applyResume(this.dispatchContext, run, checkpoint)
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
      // I8: cancellation is honored before every step.
      if (this.#turns.get(run)?.signal.aborted) {
        return this.stop('CANCELLED', CANCELLED_RESPONSE)
      }
      // I12: pause (and any other step control) is checked before each step.
      const beforeStep = await runGate(
        this.kernelFor(run),
        'turn/before-step',
        this.turnFor(run)
      )
      if (beforeStep.kind === 'stop') {
        // An operator pause is not terminal: the durable checkpoint, with any
        // pending approval or question, stays resumable (AUD-0597 F03).
        return {
          ...this.stop(beforeStep.stopReason, beforeStep.response),
          ...(beforeStep.cause === 'operator_paused'
            ? { preserveCheckpoint: true }
            : {})
        }
      }
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
      capabilities: this.availableTools(run),
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
    const decisionAbortController = new AbortController()
    const decisionOrDeadline = await this.withDeadline(
      this.options.orchestrator.decide({
        context,
        signal: decisionAbortController.signal
      }),
      remaining
    )
    if (decisionOrDeadline === DEADLINE_EXCEEDED) {
      decisionAbortController.abort()
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
    return validateDecision(this.dispatchContext, run, decision)
  }

  private allowedDecisionTypes(run: LoopRun): LoopDecision['decisionType'][] {
    const allowed: LoopDecision['decisionType'][] = ['RESPOND', 'ASK_USER']
    if (this.availableTools(run).length > 0) {
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

  private availableTools(run: LoopRun): readonly ToolDescriptor[] {
    return this.options.tools
      .list()
      .filter((tool) => agentExposesTool(run.input.agent.tools, tool.id))
      .map(describeTool)
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
    return dispatchTool(
      this.dispatchContext,
      run,
      decision,
      stepNumber,
      forceApproval
    )
  }

  private async dispatchKnowledge(
    run: LoopRun,
    decision: LoopDecision,
    stepNumber: number
  ): Promise<DispatchOutcome> {
    return dispatchKnowledge(this.dispatchContext, run, decision, stepNumber)
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
    return dispatchRespond(this.dispatchContext, run, decision, stepNumber)
  }

  private async composeResponse(
    run: LoopRun,
    decision: LoopDecision
  ): Promise<
    { response: string } | { stopReason: StopReason; response: string }
  > {
    return composeResponse(this.dispatchContext, run, decision)
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
    return evaluate(this.dispatchContext, run, decision)
  }

  private async pause(
    run: LoopRun,
    stepNumber: number,
    outcome: Extract<DispatchOutcome, { kind: 'pause' }>
  ): Promise<Extract<DispatchOutcome, { kind: 'stop' }>> {
    return pause(this.dispatchContext, run, stepNumber, outcome)
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

  /**
   * A terminal stop never leaves its pending tool step open (AUD-0600 F02).
   * A WAITING step never reached its effect (approval wait, or parked by an
   * operator pause), so it closes with the stop's own code. A step still
   * RUNNING here may have started its effect before a crash or a failure
   * after dispatch, so it is closed as `unknown_effect` for reconciliation
   * instead of being declared not executed.
   */
  private async closePendingStep(
    run: LoopRun,
    stopReason: StopReason
  ): Promise<void> {
    const stepNumber = run.state.pendingStepNumber
    if (!stepNumber) return
    const steps = await this.options.stepStore.listSteps(
      run.input.tenantId,
      run.executionId
    )
    const step = steps.find(
      (candidate) =>
        candidate.stepNumber === stepNumber && candidate.stepType === 'TOOL'
    )
    if (!step || (step.status !== 'WAITING' && step.status !== 'RUNNING')) {
      return
    }
    await this.recordStep(run, {
      stepNumber,
      stepType: 'TOOL',
      status: 'FAILED',
      sideEffecting: step.sideEffecting,
      ...(step.reasonCode ? { reasonCode: step.reasonCode } : {}),
      errorCode:
        step.status === 'RUNNING'
          ? 'unknown_effect'
          : stopReason === 'CANCELLED'
            ? 'cancelled'
            : stopReason === 'MAX_DURATION'
              ? 'deadline'
              : 'not_started'
    })
  }

  private async finalize(
    run: LoopRun,
    outcome: Extract<DispatchOutcome, { kind: 'stop' }>,
    startedAtMs: number
  ): Promise<RuntimeResult> {
    let stopReason = outcome.stopReason ?? 'INSUFFICIENT_EVIDENCE'
    run.usage.activeDurationMs += Date.now() - startedAtMs
    if (!outcome.preserveCheckpoint && TERMINAL_STOPS.has(stopReason)) {
      try {
        await this.closePendingStep(run, stopReason)
      } catch {
        // The open step could not be closed: the terminal checkpoint must not
        // claim a clean stop while the step store disagrees.
        stopReason = 'INSUFFICIENT_EVIDENCE'
      }
    }
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
    // Audit always gets at least a bounded grace window, so a budget stop
    // (possibly after an effect) is still recorded. If even that fails, the
    // result is degraded like any other unaudited outcome (ENG-008).
    try {
      const deadlineMs = Math.max(this.remainingDuration(run), AUDIT_GRACE_MS)
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

export function stringifySummary(value: unknown, fallback: string): string {
  if (value === undefined || value === null) return fallback
  if (typeof value === 'string') return value.slice(0, 300)
  try {
    return (JSON.stringify(value) ?? fallback).slice(0, 300)
  } catch {
    return fallback
  }
}
