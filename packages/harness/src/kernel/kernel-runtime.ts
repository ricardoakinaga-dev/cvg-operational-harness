import type {
  HarnessRuntime,
  RuntimeInput,
  RuntimeResult,
  ToolDescriptor,
  ToolDefinition,
  ToolInvocation,
  ToolResult
} from '@cvg/harness-contracts'
import { KernelHost } from './host.ts'
import {
  CANCELLED,
  CANCELLED_RESPONSE,
  appendLog,
  createTurnState,
  race,
  runGate,
  runModelCall,
  runToolCall
} from './pipeline.ts'
import {
  CONTROL_SERVICES,
  DEADLINE,
  LOOP_CAPABILITIES,
  stop,
  type KernelPlugin,
  type KernelStop,
  type ToolCallState,
  type ToolOutcome,
  type TurnState
} from './types.ts'

/** Services every kernel profile must provide before it may run (I1). */
export const REQUIRED_SERVICES = [
  ...CONTROL_SERVICES,
  ...LOOP_CAPABILITIES
] as const

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function hasValidBoundaryInput(input: RuntimeInput): boolean {
  const identity = [
    input.agent?.id,
    input.agent?.version,
    input.tenantId,
    input.conversationId,
    input.sessionId,
    input.correlationId,
    input.traceId
  ]
  const budget = [
    input.budget?.maxSteps,
    input.budget?.maxModelCalls,
    input.budget?.maxToolCalls,
    input.budget?.maxDurationMs,
    input.budget?.maxCostUsd,
    input.budget?.maxTokens
  ]
  return (
    identity.every(isNonEmptyString) &&
    budget.every(
      (value) =>
        typeof value === 'number' && Number.isFinite(value) && value >= 0
    )
  )
}

function stringifyOutput(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}

/** Wildcard that explicitly exposes every registered tool to a profile. */
export const ALL_AGENT_TOOLS = '*'

/**
 * Tool exposure is deny-by-default: an empty list exposes nothing and only
 * the explicit wildcard exposes the whole registry (ENG-004).
 */
export function agentExposesTool(
  allowed: readonly string[],
  toolId: string
): boolean {
  return allowed.includes(ALL_AGENT_TOOLS) || allowed.includes(toolId)
}

const exposes = agentExposesTool

function describe(tool: ToolDefinition): ToolDescriptor {
  const { execute, ...descriptor } = tool
  void execute
  return descriptor
}

interface ResultValues {
  readonly response: string
  readonly stopReason: RuntimeResult['stopReason']
  readonly approvalId?: RuntimeResult['approvalId']
  readonly modelCalls: number
  readonly toolCalls: number
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly costUsd?: number
  readonly toolResult?: ToolResult
}

function result(values: ResultValues): RuntimeResult {
  return {
    response: values.response,
    stopReason: values.stopReason,
    ...(values.approvalId !== undefined
      ? { approvalId: values.approvalId }
      : {}),
    steps: 1,
    modelCalls: values.modelCalls,
    toolCalls: values.toolCalls,
    usage: {
      inputTokens: values.inputTokens ?? 0,
      outputTokens: values.outputTokens ?? 0,
      costUsd: values.costUsd ?? 0
    },
    ...(values.toolResult ? { toolResult: values.toolResult } : {})
  }
}

function fromStop(gate: KernelStop): RuntimeResult {
  return result({
    response: gate.response,
    stopReason: gate.stopReason,
    ...(gate.approvalId !== undefined ? { approvalId: gate.approvalId } : {}),
    modelCalls: gate.modelCalls ?? 0,
    toolCalls: gate.toolCalls ?? 0,
    ...(gate.usage ?? {})
  })
}

export interface KernelRuntimeOptions {
  /** Response used when the kernel cannot boot (lazy facade path). */
  readonly bootFailureResponse?: string
}

/**
 * Single-turn governed loop on the plugin kernel (SPEC 0181). Every phase runs
 * through a named interception point; governance lives in control plugins.
 * Behavior matches `SinglePassGovernedRuntime` and closes the conformance gaps
 * I5 (call logged before dispatch), I6 (model request logged), I7 (listener
 * failures normalized) and I8 (cancellation by `RuntimeInput.signal`).
 */
export class KernelRuntime implements HarnessRuntime {
  #host: Promise<KernelHost> | undefined

  private constructor(
    private readonly plugins: readonly KernelPlugin[],
    host: KernelHost | undefined,
    private readonly options: KernelRuntimeOptions = {}
  ) {
    if (host) this.#host = Promise.resolve(host)
  }

  /** Boots eagerly and fails loudly when the profile is incomplete. */
  public static async boot(
    plugins: readonly KernelPlugin[],
    options: KernelRuntimeOptions = {}
  ): Promise<KernelRuntime> {
    const host = await KernelHost.boot(plugins, REQUIRED_SERVICES)
    return new KernelRuntime(plugins, host, options)
  }

  /** Boots on first use; a boot failure becomes a fail-closed result. */
  public static lazy(
    plugins: readonly KernelPlugin[],
    options: KernelRuntimeOptions = {}
  ): KernelRuntime {
    return new KernelRuntime(plugins, undefined, options)
  }

  public async dispose(): Promise<void> {
    if (!this.#host) return
    const host = await this.#host.catch(() => undefined)
    await host?.dispose()
  }

  public async execute(input: RuntimeInput): Promise<RuntimeResult> {
    let host: KernelHost
    try {
      this.#host ??= KernelHost.boot(this.plugins, REQUIRED_SERVICES)
      host = await this.#host
    } catch (error) {
      return result({
        response:
          this.options.bootFailureResponse ??
          `Kernel could not start: ${errorMessage(error)}.`,
        stopReason: 'INTERNAL_FAILURE',
        modelCalls: 0,
        toolCalls: 0
      })
    }
    return new Turn(host, input).run()
  }
}

/** One execution of the loop over a booted, sealed host. */
class Turn {
  readonly #host: KernelHost
  readonly #controller = new AbortController()
  readonly #state: TurnState

  public constructor(host: KernelHost, input: RuntimeInput) {
    this.#host = host
    const startedAt = Date.now()
    if (input.signal?.aborted) this.#controller.abort()
    input.signal?.addEventListener('abort', () => this.#controller.abort(), {
      once: true
    })
    this.#state = createTurnState(
      input,
      startedAt,
      host.get('budget').begin(input, startedAt),
      this.#controller.signal
    )
  }

  public async run(): Promise<RuntimeResult> {
    const input = this.#state.input
    if (!hasValidBoundaryInput(input)) {
      return this.#finish(
        result({
          response: 'Runtime identity or execution budget is invalid.',
          stopReason: 'UNSAFE_REQUEST',
          modelCalls: 0,
          toolCalls: 0
        })
      )
    }
    if (input.budget.maxSteps < 1) {
      return this.#finish(
        fromStop(
          stop('MAX_STEPS', 'Execution budget exhausted before the first step.')
        )
      )
    }
    if (input.budget.maxDurationMs < 1) {
      return this.#finish(
        fromStop(
          stop('MAX_DURATION', 'Execution duration budget is not available.')
        )
      )
    }

    const logged = await appendLog(this.#host, {
      type: 'turn/start',
      correlationId: input.correlationId
    })
    if (logged) return this.#finish(fromStop(logged))

    const gate = await runGate(this.#host, 'turn/before-step', this.#state)
    if (gate.kind === 'stop') return this.#finish(fromStop(gate))

    try {
      if (this.#state.signal.aborted) {
        return this.#finish(fromStop(stop('CANCELLED', CANCELLED_RESPONSE)))
      }
      if (this.#state.budget.remainingMs() <= 0) {
        return this.#finish(
          fromStop(
            stop('MAX_DURATION', 'Duration budget exhausted before planning.')
          )
        )
      }
      const decision = await race(this.#state, () =>
        this.#host.get('planner').decideNextStep({
          runtime: input,
          availableTools: this.#availableTools(),
          step: 1
        })
      )
      if (decision === CANCELLED) {
        return this.#finish(fromStop(stop('CANCELLED', CANCELLED_RESPONSE)))
      }
      if (decision === DEADLINE) {
        return this.#finish(
          fromStop(
            stop('MAX_DURATION', 'Duration budget exhausted while planning.')
          )
        )
      }
      switch (decision.action) {
        case 'RESPOND':
          return await this.#respond(decision.response)
        case 'CALL_TOOL':
          return await this.#callTool(decision.toolInvocation)
        case 'ASK_USER':
          return this.#finish(
            fromStop(
              stop(
                'NEEDS_USER_INPUT',
                decision.response ??
                  decision.reason ??
                  'More information is required.'
              )
            )
          )
        case 'REQUEST_APPROVAL':
          return this.#finish(
            fromStop(
              stop(
                'APPROVAL_REQUIRED',
                decision.response ??
                  decision.reason ??
                  'Approval is required before continuing.'
              )
            )
          )
        case 'HANDOFF':
          return this.#finish(
            fromStop(
              stop(
                'HUMAN_TAKEOVER',
                decision.response ??
                  decision.reason ??
                  'Human takeover is required.'
              )
            )
          )
        case 'STOP':
          return this.#finish(
            fromStop(
              stop(
                'INSUFFICIENT_EVIDENCE',
                decision.response ?? decision.reason ?? 'Execution stopped.'
              )
            )
          )
        case 'RETRIEVE':
        case 'VERIFY':
          return this.#finish(
            fromStop(
              stop(
                'INSUFFICIENT_EVIDENCE',
                'This single-pass compatibility runtime does not execute retrieval or verification steps.'
              )
            )
          )
      }
    } catch (error) {
      return this.#finish(
        fromStop(
          stop(
            'INSUFFICIENT_EVIDENCE',
            `Execution could not be planned: ${errorMessage(error)}.`
          )
        )
      )
    }
  }

  async #respond(response: string | undefined): Promise<RuntimeResult> {
    if (response?.trim()) {
      return this.#finish(
        result({
          response,
          stopReason: 'COMPLETED',
          modelCalls: 0,
          toolCalls: 0
        })
      )
    }
    const input = this.#state.input
    const outcome = await runModelCall(this.#host, this.#state, {
      messages: [
        {
          role: 'system',
          content: `${input.agent.objective}\n${input.agent.instructions.join('\n')}`
        },
        { role: 'user', content: input.userMessage }
      ],
      context: input.context,
      budget: input.budget,
      correlationId: input.correlationId
    })
    switch (outcome.kind) {
      case 'stopped':
        return this.#finish(fromStop(outcome.gate))
      case 'cancelled':
        return this.#finish(
          fromStop(stop('CANCELLED', CANCELLED_RESPONSE, { modelCalls: 1 }))
        )
      case 'deadline':
        return this.#finish(
          fromStop(
            stop(
              'MAX_DURATION',
              'Duration budget exhausted during model execution.',
              { modelCalls: 1 }
            )
          )
        )
      case 'failed':
        return this.#finish(
          fromStop(
            stop('MODEL_FAILURE', `Model execution failed: ${outcome.error}.`, {
              modelCalls: 1
            })
          )
        )
      case 'unrecorded':
        return this.#finish(
          fromStop({
            ...outcome.gate,
            modelCalls: 1,
            usage: {
              inputTokens: outcome.result.inputTokens,
              outputTokens: outcome.result.outputTokens,
              costUsd: outcome.result.costUsd
            }
          })
        )
      case 'completed': {
        const model = outcome.result
        const metadata = this.#state.metadata
        metadata.provider = model.provider
        metadata.inputTokens = model.inputTokens
        metadata.outputTokens = model.outputTokens
        metadata.costUsd = model.costUsd
        const exhausted = this.#state.budget.afterModel(model)
        if (exhausted) return this.#finish(fromStop(exhausted))
        return this.#finish(
          result({
            response: model.text,
            stopReason: 'COMPLETED',
            modelCalls: 1,
            toolCalls: 0,
            inputTokens: model.inputTokens,
            outputTokens: model.outputTokens,
            costUsd: model.costUsd
          })
        )
      }
    }
  }

  async #callTool(
    requested: ToolInvocation | undefined
  ): Promise<RuntimeResult> {
    const input = this.#state.input
    const invocation = requested ?? input.requestedTool
    if (!invocation) {
      return this.#finish(
        fromStop(stop('TOOL_FAILURE', 'No tool invocation was supplied.'))
      )
    }
    if (input.budget.maxToolCalls < 1) {
      return this.#finish(
        fromStop(
          stop(
            'MAX_TOOL_CALLS',
            'Tool-call budget exhausted before the tool could run.'
          )
        )
      )
    }
    const tool = this.#host
      .get('tools')
      .resolve(invocation.toolId, invocation.toolVersion)
    this.#state.metadata.tool = invocation.toolId
    if (!tool) {
      return this.#finish(
        fromStop(
          stop('TOOL_FAILURE', `Tool "${invocation.toolId}" is unavailable.`, {
            toolCalls: 1
          })
        )
      )
    }
    if (!exposes(input.agent.tools, tool.id)) {
      return this.#finish(
        fromStop(
          stop(
            'POLICY_DENIED',
            `Tool "${tool.id}" is not exposed to this agent profile.`
          )
        )
      )
    }

    const call: ToolCallState = {
      turn: this.#state,
      tool,
      invocation,
      needsApproval: false
    }

    const pipeline = await runToolCall(this.#host, call)
    if (pipeline.kind === 'stopped') {
      const approvalId = pipeline.gate.approvalId ?? call.grant?.approvalId
      return this.#finish(
        fromStop({
          ...pipeline.gate,
          ...(approvalId !== undefined ? { approvalId } : {})
        })
      )
    }
    const settled = pipeline.outcome
    this.#state.metadata.toolDurationMs =
      'durationMs' in settled ? settled.durationMs : 0
    const toolResult = this.#toolResult(call, settled)
    if (pipeline.logFailure) {
      // F04: the effect fact stays in the result; the turn is not a success.
      return this.#finish({
        ...toolResult,
        response: pipeline.logFailure.response,
        stopReason: 'INSUFFICIENT_EVIDENCE'
      })
    }
    return this.#finish(toolResult)
  }

  #toolResult(call: ToolCallState, outcome: ToolOutcome): RuntimeResult {
    const approvalId = call.grant?.approvalId
    const withApproval = approvalId !== undefined ? { approvalId } : {}
    switch (outcome.kind) {
      case 'not_started':
        return fromStop({ ...outcome.gate, ...withApproval })
      case 'deadline':
        return result({
          response: call.approval
            ? 'unknown_effect: duration budget exhausted during tool execution.'
            : 'Duration budget exhausted during tool execution.',
          stopReason: call.approval ? 'TOOL_FAILURE' : 'MAX_DURATION',
          ...withApproval,
          modelCalls: 0,
          toolCalls: 1
        })
      case 'cancelled':
        return result({
          response: call.approval
            ? `unknown_effect: ${CANCELLED_RESPONSE}`
            : CANCELLED_RESPONSE,
          stopReason: call.approval ? 'TOOL_FAILURE' : 'CANCELLED',
          ...withApproval,
          modelCalls: 0,
          toolCalls: 1
        })
      case 'threw': {
        const toolResult: ToolResult = {
          status: 'FAILED',
          error: outcome.error
        }
        return result({
          response: call.approval
            ? `unknown_effect: ${outcome.error}`
            : outcome.error,
          stopReason: 'TOOL_FAILURE',
          ...withApproval,
          modelCalls: 0,
          toolCalls: 1,
          toolResult
        })
      }
      case 'failed':
        return result({
          response: outcome.result.error ?? 'Tool execution failed.',
          stopReason: 'TOOL_FAILURE',
          ...withApproval,
          modelCalls: 0,
          toolCalls: 1,
          toolResult: outcome.result
        })
      case 'confirm_failed':
        return result({
          response: `unknown_effect: approval confirmation failed: ${outcome.error}.`,
          stopReason: 'TOOL_FAILURE',
          ...withApproval,
          modelCalls: 0,
          toolCalls: 1,
          toolResult: outcome.result
        })
      case 'succeeded':
        if (
          Date.now() - this.#state.startedAt >
          this.#state.input.budget.maxDurationMs
        ) {
          return result({
            response: 'Duration budget exhausted after tool execution.',
            stopReason: 'MAX_DURATION',
            modelCalls: 0,
            toolCalls: 1,
            toolResult: outcome.result
          })
        }
        return result({
          response: stringifyOutput(
            outcome.result.output ?? 'Tool completed successfully.'
          ),
          stopReason: 'COMPLETED',
          ...(this.#state.metadata.approval
            ? { approvalId: this.#state.metadata.approval }
            : {}),
          modelCalls: 0,
          toolCalls: 1,
          toolResult: outcome.result
        })
    }
  }

  #availableTools(): readonly ToolDescriptor[] {
    const allowed = this.#state.input.agent.tools
    return this.#host
      .get('tools')
      .list()
      .filter((tool) => exposes(allowed, tool.id))
      .map(describe)
  }

  async #finish(initial: RuntimeResult): Promise<RuntimeResult> {
    let current = initial
    for (const entry of this.#host.listeners('turn/end')) {
      try {
        current = await entry.fn(this.#state, current)
      } catch (error) {
        if (entry.kind === 'control') {
          current = {
            ...current,
            response: `Execution could not be completed because ${entry.plugin} failed: ${errorMessage(error)}.`,
            stopReason: 'INSUFFICIENT_EVIDENCE'
          }
        }
      }
    }
    const unrecorded = await appendLog(this.#host, {
      type: 'turn/end',
      correlationId: this.#state.input.correlationId,
      stopReason: current.stopReason
    })
    if (unrecorded) {
      // F04: a turn whose closing record failed is never reported as done.
      return {
        ...current,
        response: unrecorded.response,
        stopReason: 'INSUFFICIENT_EVIDENCE'
      }
    }
    return current
  }
}
