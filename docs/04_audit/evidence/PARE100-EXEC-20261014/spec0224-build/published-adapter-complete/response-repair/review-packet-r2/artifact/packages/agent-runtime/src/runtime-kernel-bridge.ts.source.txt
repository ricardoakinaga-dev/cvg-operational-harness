import {
  DEADLINE,
  KernelHost,
  createTurnState,
  effectsControl,
  logControl,
  runGate,
  runModelCall,
  runToolCall,
  type BudgetService,
  type KernelGate,
  type KernelLog,
  type KernelPlugin,
  type KernelStop,
  type PauseSwitch,
  type ToolCallState,
  type ToolOutcome,
  type TurnBudget,
  type TurnState
} from '@cvg/harness'
import type {
  ExecutionBudget,
  RuntimeInput,
  ToolDefinition,
  ToolResult
} from '@cvg/harness-contracts'
import type {
  ModelGateway as GovernedModelGateway,
  ModelResult as GovernedModelResult
} from '@cvg/model-gateway'
import type { KernelPauseCheck, LoopLimits } from './contracts.ts'

/**
 * Single governance spine for the durable runtime (PDSH-001 / KPLG-004 Part
 * B, ADR-011). `GovernedAgentRuntime` keeps its durable phases — approval
 * reservation, effect journal, outbox — but budget, pause, deadline and tool
 * dispatch are decided by `kernel/pipeline.ts`, the same pipeline the
 * single-pass and iterative profiles run. Governed-only vocabulary (outcome
 * `paused`, capability-scoped denial codes) is mapped at this boundary, so no
 * second copy of the spine lives in the durable runtime.
 */

const BRIDGE_REQUIRED_SERVICES = [
  'budget',
  'pause',
  'log',
  'effects',
  'model'
] as const satisfies readonly (keyof import('@cvg/harness').Services)[]

export interface GovernedBridgeCounters {
  steps: number
  modelCalls: number
  toolCalls: number
  costUsd: number
  inputTokens: number
  outputTokens: number
}

export type BridgeStopCode =
  | 'steps_budget_exceeded'
  | 'model_calls_exhausted'
  | 'tool_calls_exhausted'
  | 'loop_cost_exceeded'
  | 'turn_cancelled'
  | 'loop_deadline_exceeded'

export type BridgeStageCheck = { readonly code: BridgeStopCode } | undefined

export type GovernedPauseCode = 'operator_paused' | 'pause_state_unavailable'

/**
 * The only budget implementation of a governed turn (SPEC 0181 I11): one
 * clock, one set of counters, one deadline. The kernel gates and the stage
 * opener both read this object, so a limit can never be enforced twice with
 * different results.
 */
class GovernedTurnBudget implements TurnBudget {
  public constructor(
    private readonly limits: LoopLimits,
    private readonly counters: GovernedBridgeCounters,
    private readonly clock: () => Date,
    private readonly startedAtMs: number
  ) {}

  public remainingMs(): number {
    return (
      this.limits.maxDurationMs - (this.clock().getTime() - this.startedAtMs)
    )
  }

  public async withDeadline<T>(
    operation: () => Promise<T>,
    ms: number = this.remainingMs()
  ): Promise<T | typeof DEADLINE> {
    if (ms <= 0) return DEADLINE
    let timer!: ReturnType<typeof setTimeout>
    const deadline = new Promise<typeof DEADLINE>((resolve) => {
      timer = setTimeout(() => resolve(DEADLINE), ms)
    })
    try {
      return await Promise.race([operation(), deadline])
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Single pre-model gate (I11 / PDSH-004): consumes one model-call slot
   * before the call. Tokens and cost are recorded post-result.
   */
  public beginModelRequest(): KernelStop | undefined {
    if (this.counters.modelCalls + 1 > this.limits.maxModelCalls) {
      return {
        kind: 'stop',
        stopReason: 'MAX_MODEL_CALLS',
        response: 'Model-call budget exhausted before the call was started.',
        modelCalls: this.counters.modelCalls,
        usage: {
          inputTokens: this.counters.inputTokens,
          outputTokens: this.counters.outputTokens,
          costUsd: this.counters.costUsd
        }
      }
    }
    this.counters.modelCalls += 1
    if (this.remainingMs() <= 0) {
      return {
        kind: 'stop',
        stopReason: 'MAX_DURATION',
        response: 'Duration budget exhausted before the call was started.',
        modelCalls: this.counters.modelCalls,
        usage: {
          inputTokens: this.counters.inputTokens,
          outputTokens: this.counters.outputTokens,
          costUsd: this.counters.costUsd
        }
      }
    }
    return undefined
  }

  /**
   * Single post-result accounting site (PDSH-004): records tokens and cost
   * and checks the resulting totals.
   */
  public recordModelResult(result: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly costUsd: number
  }): KernelStop | undefined {
    this.counters.inputTokens += result.inputTokens
    this.counters.outputTokens += result.outputTokens
    this.counters.costUsd += result.costUsd
    // A cost overrun is flagged for the runtime's single budget assertion
    // (I11 / beginStage), which denies with the governed stop code.
    if (this.counters.costUsd > this.limits.maxCostUsd) this.costOverrun = true
    return undefined
  }

  /** Set when the post-result accounting observes a cost overrun. */
  public costOverrun = false
}

/**
 * Pause switch over the runtime's durable check. An unreadable switch counts
 * as paused (I12) and records `pause_state_unavailable` so the runtime can
 * report the honest code instead of a generic operator pause.
 */
class BridgePauseSwitch implements PauseSwitch {
  public lastCode: GovernedPauseCode | undefined
  readonly #check: KernelPauseCheck | undefined
  readonly #tenantId: string

  public constructor(check: KernelPauseCheck | undefined, tenantId: string) {
    this.#check = check
    this.#tenantId = tenantId
  }

  public async isPaused(): Promise<boolean> {
    if (this.#check === undefined) return false
    try {
      const paused = await this.#check.isPaused(this.#tenantId)
      this.lastCode = paused ? 'operator_paused' : undefined
      return paused
    } catch {
      this.lastCode = 'pause_state_unavailable'
      return true
    }
  }
}

function bridgeBudget(limits: LoopLimits): ExecutionBudget {
  return {
    maxSteps: limits.maxSteps,
    maxModelCalls: limits.maxModelCalls,
    maxToolCalls: limits.maxToolCalls,
    maxDurationMs: limits.maxDurationMs,
    maxCostUsd: limits.maxCostUsd,
    maxTokens: Number.MAX_SAFE_INTEGER
  }
}

export interface GovernedKernelBridgeOptions {
  readonly pause?: KernelPauseCheck
  readonly log?: KernelLog
  readonly limits: LoopLimits
  readonly clock: () => Date
  readonly startedAt: Date
  readonly tenantId: string
  readonly traceId: string
  readonly correlationId: string
  readonly agentId: string
  readonly agentVersion: string
  readonly modelGateway: GovernedModelGateway
  readonly cancelSignal?: AbortSignal
}

export type GovernedModelStage =
  | { readonly kind: 'stopped'; readonly gate: KernelStop }
  | { readonly kind: 'completed'; readonly result: GovernedModelResult }
  | { readonly kind: 'failed'; readonly error: unknown }
  | { readonly kind: 'deadline' }
  | { readonly kind: 'cancelled' }
  | {
      readonly kind: 'unrecorded'
      readonly result: GovernedModelResult
      readonly gate: KernelStop
    }

export type GovernedToolStage =
  | { readonly kind: 'not_started'; readonly gate: KernelStop }
  | {
      readonly kind: 'succeeded'
      readonly result: unknown
      readonly durationMs: number
    }
  | { readonly kind: 'failed'; readonly durationMs: number }
  | {
      readonly kind: 'threw'
      readonly error: unknown
      readonly durationMs: number
    }
  | { readonly kind: 'deadline'; readonly durationMs: number }
  | { readonly kind: 'cancelled'; readonly durationMs: number }
  | {
      readonly kind: 'confirm_failed'
      readonly result: unknown
      readonly error: string
      readonly durationMs: number
    }

export interface GovernedToolExecutor {
  (invocation: {
    payload: unknown
    signal: AbortSignal | undefined
  }): Promise<{ result: unknown }>
}

export interface GovernedToolCallSpec {
  readonly toolId: string
  readonly operationKey: string
  readonly input: unknown
  readonly executor: GovernedToolExecutor
}

/**
 * Boots a kernel host for one governed turn and exposes the pipeline stages
 * with governed vocabulary. The host is per-turn so counters and the pause
 * read can never leak across turns; `dispose` reaches quiescence.
 */
export class GovernedKernelBridge {
  public readonly counters: GovernedBridgeCounters = {
    steps: 0,
    modelCalls: 0,
    toolCalls: 0,
    costUsd: 0,
    inputTokens: 0,
    outputTokens: 0
  }
  readonly #options: GovernedKernelBridgeOptions
  readonly #budget: GovernedTurnBudget
  readonly #pauseSwitch: BridgePauseSwitch
  readonly #turnState: TurnState
  readonly #hostPromise: Promise<KernelHost>
  #lastModelError: unknown
  #lastToolError: unknown
  #lastModelRequest: Record<string, unknown> | undefined
  #lastModelResult: GovernedModelResult | undefined

  private constructor(options: GovernedKernelBridgeOptions) {
    this.#options = options
    this.#budget = new GovernedTurnBudget(
      options.limits,
      this.counters,
      options.clock,
      options.startedAt.getTime()
    )
    this.#pauseSwitch = new BridgePauseSwitch(options.pause, options.tenantId)
    this.#turnState = createTurnState(
      bridgeRuntimeInput(options),
      options.startedAt.getTime(),
      this.#budget,
      options.cancelSignal ?? new AbortController().signal
    )
    this.#hostPromise = KernelHost.boot(
      this.#plugins(),
      BRIDGE_REQUIRED_SERVICES
    )
  }

  public static boot(
    options: GovernedKernelBridgeOptions
  ): GovernedKernelBridge {
    return new GovernedKernelBridge(options)
  }

  public get turnState(): TurnState {
    return this.#turnState
  }

  public get pauseSwitch(): BridgePauseSwitch {
    return this.#pauseSwitch
  }

  /** Cancel/deadline stop, the same clock the budget view uses. */
  public stopReason(): 'turn_cancelled' | 'loop_deadline_exceeded' | undefined {
    if (this.#options.cancelSignal?.aborted === true) return 'turn_cancelled'
    if (
      this.#options.clock().getTime() >=
      this.#options.startedAt.getTime() + this.#options.limits.maxDurationMs
    ) {
      return 'loop_deadline_exceeded'
    }
    return undefined
  }

  public addCost(costUsd: number): void {
    this.counters.costUsd += costUsd
  }

  public async readPause(): Promise<GovernedPauseCode | undefined> {
    if (this.#options.pause === undefined) return undefined
    const paused = await this.#pauseSwitch.isPaused()
    // `isPaused` returning true always records a pause code.
    return paused
      ? (this.#pauseSwitch.lastCode as GovernedPauseCode)
      : undefined
  }

  /** Single budget assertion (I11); never mutates counters. */
  public assertStage(
    stage: 'model.generate' | 'tool.execute' | 'outbox.enqueue'
  ): BridgeStageCheck {
    if (this.counters.steps >= this.#options.limits.maxSteps) {
      return { code: 'steps_budget_exceeded' }
    }
    if (
      stage === 'model.generate' &&
      this.counters.modelCalls >= this.#options.limits.maxModelCalls
    ) {
      return { code: 'model_calls_exhausted' }
    }
    if (
      stage === 'tool.execute' &&
      this.counters.toolCalls >= this.#options.limits.maxToolCalls
    ) {
      return { code: 'tool_calls_exhausted' }
    }
    if (this.counters.costUsd > this.#options.limits.maxCostUsd) {
      return { code: 'loop_cost_exceeded' }
    }
    const reason = this.stopReason()
    return reason === undefined ? undefined : { code: reason }
  }

  /** Asserts and consumes one stage slot; model slot is not consumed here. */
  public beginStage(
    stage: 'model.generate' | 'tool.execute' | 'outbox.enqueue'
  ): BridgeStageCheck {
    const check = this.assertStage(stage)
    if (check !== undefined) return check
    this.counters.steps += 1
    if (stage === 'tool.execute') this.counters.toolCalls += 1
    return undefined
  }

  /** Kernel `turn/before-step` gate: pause decided by the kernel pipeline. */
  public async gateTurnStep(): Promise<KernelGate> {
    const host = await this.#hostPromise
    return runGate(host, 'turn/before-step', this.#turnState)
  }

  public takeModelError(): unknown {
    const error = this.#lastModelError
    this.#lastModelError = undefined
    return error
  }

  public takeToolError(): unknown {
    const error = this.#lastToolError
    this.#lastToolError = undefined
    return error
  }

  /**
   * Model stage through `kernel/pipeline.ts` (`model/before-call` gate, I6
   * request log, deadline/cancel race). The governed request is the payload;
   * the kernel-shaped view only carries the governance fields the pipeline
   * reads.
   */
  public async runModelStage(
    request: Record<string, unknown>
  ): Promise<GovernedModelStage> {
    const host = await this.#hostPromise
    this.#lastModelRequest = request
    this.#lastModelResult = undefined
    const kernelRequest = {
      messages: [],
      context: { values: {}, sourceIds: [], capturedAt: '' },
      budget: this.#turnState.input.budget,
      correlationId: this.#turnState.input.correlationId
    }
    const outcome = await runModelCall(
      host,
      this.#turnState,
      kernelRequest as never
    )
    switch (outcome.kind) {
      case 'stopped':
        return { kind: 'stopped', gate: outcome.gate }
      case 'deadline':
        return { kind: 'deadline' }
      case 'cancelled':
        return { kind: 'cancelled' }
      case 'failed':
        return { kind: 'failed', error: this.takeModelError() }
      case 'unrecorded':
        return {
          kind: 'unrecorded',
          result: this.#requireModelResult(),
          gate: outcome.gate
        }
      case 'completed':
        return { kind: 'completed', result: this.#requireModelResult() }
    }
  }

  /** Tool stage through `kernel/pipeline.ts` (`runToolCall`). */
  public async runToolStage(
    spec: GovernedToolCallSpec
  ): Promise<GovernedToolStage> {
    const host = await this.#hostPromise
    const call: ToolCallState = {
      turn: this.#turnState,
      tool: this.#toolDefinition(spec),
      invocation: {
        toolId: spec.toolId,
        input: spec.input,
        operationKey: spec.operationKey
      },
      needsApproval: false
    }
    const pipeline = await runToolCall(host, call)
    if (pipeline.kind === 'stopped') {
      return { kind: 'not_started', gate: pipeline.gate }
    }
    return this.#mapToolOutcome(pipeline.outcome)
  }

  public async dispose(): Promise<void> {
    const host = await this.#hostPromise
    await host.dispose()
  }

  #mapToolOutcome(outcome: ToolOutcome): GovernedToolStage {
    switch (outcome.kind) {
      /* v8 ignore next 2 -- a stopped pipeline returns before this mapping */
      case 'not_started':
        return { kind: 'not_started', gate: outcome.gate }
      case 'deadline':
        return { kind: 'deadline', durationMs: outcome.durationMs }
      case 'cancelled':
        return { kind: 'cancelled', durationMs: outcome.durationMs }
      case 'threw':
        return {
          kind: 'threw',
          /* v8 ignore next -- a thrown executor always stashes its error first */
          error: this.takeToolError() ?? new Error(outcome.error),
          durationMs: outcome.durationMs
        }
      /* v8 ignore next 2 -- no composed control can settle a failed tool result */
      case 'failed':
        return { kind: 'failed', durationMs: outcome.durationMs }
      /* v8 ignore next 7 -- confirmation settlement needs a composed control */
      case 'confirm_failed':
        return {
          kind: 'confirm_failed',
          result: outcome.result.output,
          error: outcome.error,
          durationMs: outcome.durationMs
        }
      case 'succeeded':
        return {
          kind: 'succeeded',
          result: outcome.result.output,
          durationMs: outcome.durationMs
        }
    }
  }

  #requireModelResult(): GovernedModelResult {
    /* v8 ignore next -- every non-failed model outcome stashes its result */
    if (this.#lastModelResult === undefined) {
      throw new Error('governed kernel bridge: model result was not recorded')
    }
    return this.#lastModelResult
  }

  #toolDefinition(spec: GovernedToolCallSpec): ToolDefinition {
    return {
      id: spec.toolId,
      version: this.#options.agentVersion,
      description: `governed capability ${this.#options.agentId}`,
      inputSchema: null,
      outputSchema: null,
      risk: 'HIGH',
      sideEffect: 'EXTERNAL',
      idempotent: false,
      requiresApproval: false,
      execute: async (_input, context): Promise<ToolResult> => {
        try {
          const executed = await spec.executor({
            payload: spec.input,
            signal: context.signal
          })
          return { status: 'SUCCEEDED', output: executed.result }
        } catch (error) {
          this.#lastToolError = error
          throw error
        }
      }
    }
  }

  #plugins(): KernelPlugin[] {
    const budget = this.#budget
    const pause = this.#pauseSwitch
    const gateway = this.#options.modelGateway

    const budgetPlugin: KernelPlugin = {
      name: 'control.governed-budget',
      kind: 'control',
      provides: ['budget'],
      apply(ctx) {
        /* v8 ignore next -- the pipelines read the turn budget, never this service */
        const service: BudgetService = { begin: () => budget }
        ctx.provide('budget', service)
        ctx.on('model/before-call', async (_call, next) => {
          // Accounting is beginModelRequest's single gate (PDSH-004 / I11).
          if (budget.remainingMs() <= 0) {
            return {
              kind: 'stop',
              stopReason: 'MAX_DURATION',
              response: 'Duration budget exhausted before model execution.'
            }
          }
          return next()
        })
        ctx.on('tool/pre-execute', async (_call, next) => {
          if (budget.remainingMs() <= 0) {
            return {
              kind: 'stop',
              stopReason: 'MAX_DURATION',
              response: 'Duration budget exhausted before policy evaluation.'
            }
          }
          return next()
        })
      }
    }

    const pausePlugin: KernelPlugin = {
      name: 'control.governed-pause',
      kind: 'control',
      provides: ['pause'],
      apply(ctx) {
        ctx.provide('pause', pause)
        const verdict = async () => {
          const paused = await pause.isPaused()
          if (!paused) return undefined
          return {
            // `isPaused` returning true always records a pause code.
            reason: pause.lastCode as string,
            stopReason: 'HUMAN_TAKEOVER' as const,
            cause: 'operator_paused' as const
          }
        }
        ctx.on('turn/before-step', async (_turn, next) => {
          const denied = await verdict()
          if (denied === undefined) return next()
          return {
            kind: 'stop',
            stopReason: 'HUMAN_TAKEOVER',
            response: denied.reason,
            cause: 'operator_paused'
          }
        })
        ctx.guard(async () => verdict())
      }
    }

    // Bind private accessors to closures instead of aliasing `this`.
    const peekRequest = () => this.#lastModelRequest
    const stashResult = (result: GovernedModelResult) => {
      this.#lastModelResult = result
    }
    const stashError = (error: unknown) => {
      this.#lastModelError = error
    }

    const modelPlugin: KernelPlugin = {
      name: 'capability.governed-model',
      kind: 'capability',
      provides: ['model'],
      apply(ctx) {
        ctx.provide('model', {
          complete: async (request: { signal?: AbortSignal }) => {
            const stashed = peekRequest()
            /* v8 ignore start -- the stage always stashes the request before the call */
            if (stashed === undefined) {
              throw new Error('governed kernel bridge: model request missing')
            }
            /* v8 ignore stop */
            const governedRequest = {
              ...stashed,
              /* v8 ignore next -- the kernel pipeline always provides its signal */
              ...(request.signal !== undefined
                ? { signal: request.signal }
                : {})
            }
            try {
              const result = (await gateway.generate(
                governedRequest as never
              )) as GovernedModelResult
              stashResult(result)
              return {
                text: result.output.text,
                provider: result.providerId,
                model: result.model,
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                costUsd: result.costUsd
              }
            } catch (error) {
              stashError(error)
              throw error
            }
          }
        })
      }
    }

    return [
      budgetPlugin,
      pausePlugin,
      logControl(this.#options.log),
      effectsControl(),
      modelPlugin
    ]
  }
}

/**
 * Synthesized compatibility view of a governed turn for kernel plugins. The
 * kernel controls only read tenant/identity/budget/signal, which the governed
 * input supplies; product-specific fields stay on the governed side.
 */
function bridgeRuntimeInput(
  options: GovernedKernelBridgeOptions
): RuntimeInput {
  return {
    agent: {
      id: options.agentId,
      version: options.agentVersion,
      objective: 'governed turn',
      instructions: [],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: options.tenantId,
    conversationId: options.correlationId,
    sessionId: options.correlationId,
    correlationId: options.correlationId,
    traceId: options.traceId,
    userMessage: '',
    context: {
      values: {},
      sourceIds: [],
      capturedAt: options.startedAt.toISOString()
    },
    state: {
      version: 0,
      values: {},
      updatedAt: options.startedAt.toISOString()
    },
    budget: bridgeBudget(options.limits),
    ...(options.cancelSignal !== undefined
      ? { signal: options.cancelSignal }
      : {})
  } as unknown as RuntimeInput
}

/** Pause code carried by a kernel stop produced by the governed pause control. */
export function pauseCodeFromGate(
  gate: KernelStop
): GovernedPauseCode | undefined {
  if (gate.cause !== 'operator_paused') return undefined
  return gate.response === 'operator_paused' ||
    gate.response === 'pause_state_unavailable'
    ? gate.response
    : 'operator_paused'
}

/** Maps a kernel `model/before-call` stop to the governed denial code. */
export function modelGateStopCode(gate: KernelStop): string {
  switch (gate.stopReason) {
    case 'MAX_MODEL_CALLS':
      return 'model_calls_exhausted'
    case 'MAX_DURATION':
      return 'loop_deadline_exceeded'
    case 'CANCELLED':
      return 'turn_cancelled'
    default:
      return gate.response
  }
}
