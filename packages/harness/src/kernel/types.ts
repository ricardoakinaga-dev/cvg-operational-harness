import type {
  ApprovalEngine,
  ApprovalId,
  ApprovalExecutionHandle,
  ApprovalExecutionRequest,
  AuditSink,
  ModelGateway,
  ModelRequest,
  ModelResult,
  Orchestrator,
  PolicyDecision,
  PolicyEngine,
  RuntimeInput,
  RuntimeResult,
  TelemetrySink,
  ToolDefinition,
  ToolInvocation,
  ToolRegistry,
  ToolResult
} from '@cvg/harness-contracts'

/**
 * Kernel de plugins (SPEC 0181, ADR-011). Referência de arquitetura: DeepSeek
 * Harness (`docs/cordis-primer.md`, `docs/tool-execution-pipeline.md`).
 */

export type PluginKind = 'control' | 'capability'

/** Disposer returned by every registration; awaiting it reaches quiescence. */
export type Disposer = () => Promise<void>

/** One governed turn: identity, budget clock and the linked cancel signal. */
export interface TurnState {
  readonly input: RuntimeInput
  readonly startedAt: number
  readonly signal: AbortSignal
  readonly budget: TurnBudget
  readonly metadata: TurnMetadata
}

export interface TurnMetadata {
  policy: string | null
  approval: ApprovalId | null
  tool: string | null
  provider: string | null
  inputTokens: number
  outputTokens: number
  costUsd: number
  toolDurationMs: number
}

/** Early stop produced by a control: the turn ends with this result. */
export interface KernelStop {
  readonly kind: 'stop'
  readonly stopReason: RuntimeResult['stopReason']
  readonly response: string
  readonly approvalId?: ApprovalId
  readonly modelCalls?: number
  readonly toolCalls?: number
  readonly usage?: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly costUsd: number
  }
  /** Which control decided, so a loop can record the right step. */
  readonly cause?: StopCause
}

export type StopCause =
  | 'policy_denied'
  | 'policy_handoff'
  | 'policy_unsupported'
  | 'policy_failed'
  | 'approval_pending'
  | 'approval_denied'
  | 'approval_failed'
  | 'approval_unbound'
  | 'operator_paused'

export interface KernelProceed {
  readonly kind: 'proceed'
}

export type KernelGate = KernelProceed | KernelStop

export const PROCEED: KernelProceed = Object.freeze({ kind: 'proceed' })

export function stop(
  stopReason: RuntimeResult['stopReason'],
  response: string,
  extra: Omit<KernelStop, 'kind' | 'stopReason' | 'response'> = {}
): KernelStop {
  return { kind: 'stop', stopReason, response, ...extra }
}

/** Shared, cooperative state of one tool call through the pipeline. */
export interface ToolCallState {
  readonly turn: TurnState
  readonly tool: ToolDefinition
  readonly invocation: ToolInvocation
  /** Set by the policy control; read by the approval control. */
  policyDecision?: PolicyDecision
  /** Set by the policy control when the decision asks for approval. */
  needsApproval: boolean
  /** Granted approval, bound to this call; reserved only at dispatch. */
  grant?: ApprovalExecutionRequest
  /** Execution reference for approvals; defaults to the input's. */
  readonly executionRef?: string
  /** Single-use approval reservation, held until post-execute settles it. */
  approval?: {
    readonly request: ApprovalExecutionRequest
    readonly handle: ApprovalExecutionHandle
  }
}

export type ToolOutcome =
  | { readonly kind: 'not_started'; readonly gate: KernelStop }
  | { readonly kind: 'deadline'; readonly durationMs: number }
  | { readonly kind: 'cancelled'; readonly durationMs: number }
  | {
      readonly kind: 'threw'
      readonly error: string
      readonly durationMs: number
    }
  | {
      readonly kind: 'failed'
      readonly result: ToolResult
      readonly durationMs: number
    }
  | {
      readonly kind: 'succeeded'
      readonly result: ToolResult
      readonly durationMs: number
    }
  | {
      readonly kind: 'confirm_failed'
      readonly result: ToolResult
      readonly error: string
      readonly durationMs: number
    }

export interface ModelCallState {
  readonly turn: TurnState
  readonly request: ModelRequest
}

/**
 * Monotonic guard (dsh `ToolGuard`): returns a denial reason or `undefined`.
 * There is no "allow" result, so no later registration undoes a denial.
 */
export type ToolGuard = (
  call: Readonly<ToolCallState>
) => GuardVerdict | Promise<GuardVerdict>

/** A denial reason, optionally with its stop reason; `undefined` abstains. */
export type GuardVerdict =
  | string
  | {
      readonly reason: string
      readonly stopReason: RuntimeResult['stopReason']
      readonly cause?: StopCause
    }
  | undefined

export type Next<T> = () => Promise<T>

export interface HookMap {
  /** waterfall — accept or stop the step; `pause` stops here. */
  'turn/before-step': (
    turn: TurnState,
    next: Next<KernelGate>
  ) => Promise<KernelGate>
  /** waterfall — budget and request checks before the model is called. */
  'model/before-call': (
    call: ModelCallState,
    next: Next<KernelGate>
  ) => Promise<KernelGate>
  /** waterfall — policy and approval decide before dispatch. */
  'tool/pre-execute': (
    call: ToolCallState,
    next: Next<KernelGate>
  ) => Promise<KernelGate>
  /** waterfall around the tool body — timeout, retry, metrics. */
  'tool/execute': (
    call: ToolCallState,
    next: Next<ToolOutcome>
  ) => Promise<ToolOutcome>
  /** serial — settle reservations, inspect or replace the outcome. */
  'tool/post-execute': (
    call: ToolCallState,
    outcome: ToolOutcome
  ) => Promise<ToolOutcome>
  /** serial — finalize the turn result (audit, telemetry). */
  'turn/end': (turn: TurnState, result: RuntimeResult) => Promise<RuntimeResult>
}

export type HookPoint = keyof HookMap

/** Append-only kernel log: the source for reconstructing a turn (I5, I6). */
export type KernelLogEvent =
  | { readonly type: 'turn/start'; readonly correlationId: string }
  | {
      readonly type: 'model/request'
      readonly correlationId: string
      readonly request: Omit<ModelRequest, 'signal'>
    }
  | {
      readonly type: 'model/result'
      readonly correlationId: string
      readonly provider: string
      readonly inputTokens: number
      readonly outputTokens: number
    }
  | {
      readonly type: 'tool/call'
      readonly correlationId: string
      readonly toolId: string
      readonly operationKey: string
      readonly input: unknown
    }
  | {
      readonly type: 'tool/result'
      readonly correlationId: string
      readonly toolId: string
      readonly outcome: ToolOutcome['kind']
    }
  | {
      readonly type: 'turn/end'
      readonly correlationId: string
      readonly stopReason: RuntimeResult['stopReason']
    }

export interface KernelLog {
  append(event: KernelLogEvent): void | Promise<void>
}

/** Pause switch: a paused tenant starts no new step and no new effect. */
export interface PauseSwitch {
  isPaused(tenantId: string): boolean | Promise<boolean>
}

/** Effect ledger: lifecycle of each dispatched effect, before and after. */
export interface EffectLedger {
  started(ref: EffectRef): void | Promise<void>
  finished(ref: EffectRef, outcome: ToolOutcome['kind']): void | Promise<void>
}

export interface EffectRef {
  readonly tenantId: string
  readonly correlationId: string
  readonly toolId: string
  readonly operationKey: string
}

/** Per-turn budget view: the only place that computes budget (I11). */
export interface TurnBudget {
  remainingMs(): number
  /** Computes the window first, then starts `operation`. */
  withDeadline<T>(
    operation: () => Promise<T>,
    ms?: number
  ): Promise<T | typeof DEADLINE>
  afterModel(result: ModelResult): KernelStop | undefined
}

export interface BudgetService {
  begin(input: RuntimeInput, startedAt: number): TurnBudget
}

export const DEADLINE: unique symbol = Symbol('kernel-deadline-exceeded')

export interface Services {
  planner: Orchestrator
  model: ModelGateway
  tools: ToolRegistry
  policy: PolicyEngine
  approvals: ApprovalEngine
  audit: AuditSink
  telemetry: TelemetrySink
  budget: BudgetService
  pause: PauseSwitch
  log: KernelLog
  effects: EffectLedger
}

export type ServiceKey = keyof Services

/** Services only control plugins may provide (SPEC 0181 I1/I2). */
export const CONTROL_SERVICES = [
  'policy',
  'approvals',
  'effects',
  'audit',
  'budget',
  'pause',
  'log'
] as const satisfies readonly ServiceKey[]

/** Capabilities the single-turn loop needs to run. */
export const LOOP_CAPABILITIES = [
  'planner',
  'model',
  'tools',
  'telemetry'
] as const satisfies readonly ServiceKey[]

export interface KernelContext {
  provide<K extends ServiceKey>(key: K, service: Services[K]): Disposer
  get<K extends ServiceKey>(key: K): Services[K]
  on<P extends HookPoint>(point: P, listener: HookMap[P]): Disposer
  /** Control plugins only. */
  guard(guard: ToolGuard): Disposer
  /** Register teardown work for resources the plugin owns. */
  effect(dispose: Disposer): void
}

export interface KernelPlugin {
  readonly name: string
  readonly kind: PluginKind
  readonly provides?: readonly ServiceKey[]
  readonly requires?: readonly ServiceKey[]
  apply(ctx: KernelContext): void | Promise<void>
}
