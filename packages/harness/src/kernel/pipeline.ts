import type {
  ModelRequest,
  ModelResult,
  RuntimeInput
} from '@cvg/harness-contracts'
import type { KernelHost } from './host.ts'
import {
  DEADLINE,
  PROCEED,
  stop,
  type GuardVerdict,
  type KernelGate,
  type KernelLogEvent,
  type KernelStop,
  type ToolCallState,
  type ToolOutcome,
  type TurnBudget,
  type TurnState
} from './types.ts'

/**
 * The governed pipelines every loop mode runs through (SPEC 0181 §4). The
 * single-turn loop and the iterative loop both call these functions, so policy,
 * approval, guards, pause, cancellation, the log and the effect ledger live in
 * one implementation.
 */

export const CANCELLED = Symbol('kernel-cancelled')
export const CANCELLED_RESPONSE = 'Execution was cancelled by the caller.'

export type GatePoint =
  | 'turn/before-step'
  | 'model/before-call'
  | 'tool/pre-execute'

/** A fresh turn: identity, budget view and the linked cancel signal. */
export function createTurnState(
  input: RuntimeInput,
  startedAt: number,
  budget: TurnBudget,
  signal: AbortSignal
): TurnState {
  return {
    input,
    startedAt,
    signal,
    budget,
    metadata: {
      policy: null,
      approval: null,
      tool: null,
      provider: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      toolDurationMs: 0
    }
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown failure'
}

/** Waterfall over a gate point; a throwing listener becomes a stop (I7). */
export function runGate<S>(
  host: KernelHost,
  point: GatePoint,
  state: S
): Promise<KernelGate> {
  const listeners = host.listeners(point) as unknown as readonly {
    readonly plugin: string
    readonly fn: (
      state: S,
      next: () => Promise<KernelGate>
    ) => Promise<KernelGate>
  }[]
  const run = (index: number): Promise<KernelGate> => {
    const entry = listeners[index]
    if (!entry) return Promise.resolve(PROCEED)
    return entry
      .fn(state, () => run(index + 1))
      .catch((error: unknown) =>
        stop(
          'INSUFFICIENT_EVIDENCE',
          `${entry.plugin} failed at ${point}: ${errorMessage(error)}.`
        )
      )
  }
  return run(0)
}

/** Appends to the kernel log; a failing log stops the turn (fail-closed). */
export async function appendLog(
  host: KernelHost,
  event: KernelLogEvent
): Promise<KernelStop | undefined> {
  try {
    await host.get('log').append(event)
    return undefined
  } catch (error) {
    return stop(
      'INSUFFICIENT_EVIDENCE',
      `Kernel log could not record the turn: ${errorMessage(error)}.`
    )
  }
}

/** Races an operation against the turn budget and the cancel signal (I8). */
export async function race<T>(
  turn: TurnState,
  operation: () => Promise<T>
): Promise<T | typeof DEADLINE | typeof CANCELLED> {
  const signal = turn.signal
  if (signal.aborted) return CANCELLED
  let onAbort: (() => void) | undefined
  const cancelled = new Promise<typeof CANCELLED>((resolve) => {
    onAbort = () => resolve(CANCELLED)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([turn.budget.withDeadline(operation), cancelled])
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}

/** Monotonic guards: the first denial wins; a throwing guard denies. */
export async function runGuards(
  host: KernelHost,
  call: ToolCallState
): Promise<KernelStop | undefined> {
  for (const guard of host.guards()) {
    let verdict: GuardVerdict
    try {
      verdict = await guard(call)
    } catch (error) {
      verdict = `A guard failed: ${errorMessage(error)}.`
    }
    if (typeof verdict === 'string') return stop('POLICY_DENIED', verdict)
    if (verdict) return stop(verdict.stopReason, verdict.reason)
  }
  return undefined
}

export type ToolPipelineResult =
  /** Nothing ran and nothing is reserved. */
  | { readonly kind: 'stopped'; readonly gate: KernelStop }
  /** Dispatch was attempted; the outcome is already settled. */
  | { readonly kind: 'settled'; readonly outcome: ToolOutcome }

export interface ToolPipelineHooks {
  /**
   * Runs after every control allowed the call and before any reservation or
   * effect; the iterative loop persists its checkpoint here.
   */
  readonly beforeDispatch?: (
    call: ToolCallState
  ) => Promise<KernelStop | undefined>
}

/**
 * log `tool/call` → `tool/pre-execute` → guards → cancellation → hook →
 * `tool/execute` around the body → `tool/post-execute` → log `tool/result`.
 */
export async function runToolCall(
  host: KernelHost,
  call: ToolCallState,
  hooks: ToolPipelineHooks = {}
): Promise<ToolPipelineResult> {
  const { turn, tool, invocation } = call
  const correlationId = turn.input.correlationId
  // I5: the call is on the log before any policy runs or the body starts.
  const logged = await appendLog(host, {
    type: 'tool/call',
    correlationId,
    toolId: tool.id,
    operationKey: invocation.operationKey,
    input: invocation.input
  })
  if (logged) return { kind: 'stopped', gate: logged }

  const gate = await runGate(host, 'tool/pre-execute', call)
  if (gate.kind === 'stop') return { kind: 'stopped', gate }

  const denial =
    (await runGuards(host, call)) ??
    (turn.signal.aborted ? stop('CANCELLED', CANCELLED_RESPONSE) : undefined) ??
    (await hooks.beforeDispatch?.(call))
  if (denial) return { kind: 'stopped', gate: denial }

  const settled = await postExecute(host, call, await dispatch(host, call))
  await appendLog(host, {
    type: 'tool/result',
    correlationId,
    toolId: tool.id,
    outcome: settled.kind
  })
  return { kind: 'settled', outcome: settled }
}

async function dispatch(
  host: KernelHost,
  call: ToolCallState
): Promise<ToolOutcome> {
  const { turn } = call
  const ref = {
    tenantId: turn.input.tenantId,
    correlationId: turn.input.correlationId,
    toolId: call.tool.id,
    operationKey: call.invocation.operationKey
  }
  let started = false
  const terminal = async (): Promise<ToolOutcome> => {
    if (turn.budget.remainingMs() <= 0) {
      return {
        kind: 'not_started',
        gate: stop(
          'MAX_DURATION',
          'Duration budget exhausted before tool execution.'
        )
      }
    }
    await host.get('effects').started(ref)
    started = true
    const startedAt = Date.now()
    const toolController = new AbortController()
    try {
      const value = await race(turn, () =>
        call.tool.execute(call.invocation.input, {
          tenantId: turn.input.tenantId,
          agentId: turn.input.agent.id,
          correlationId: turn.input.correlationId,
          traceId: turn.input.traceId,
          operationKey: call.invocation.operationKey,
          signal: AbortSignal.any([toolController.signal, turn.signal])
        })
      )
      const durationMs = Date.now() - startedAt
      if (value === DEADLINE || value === CANCELLED) {
        toolController.abort()
        return {
          kind: value === DEADLINE ? 'deadline' : 'cancelled',
          durationMs
        }
      }
      return value.status === 'SUCCEEDED'
        ? { kind: 'succeeded', result: value, durationMs }
        : { kind: 'failed', result: value, durationMs }
    } catch (error) {
      return {
        kind: 'threw',
        error: errorMessage(error),
        durationMs: Date.now() - startedAt
      }
    }
  }
  const listeners = host.listeners('tool/execute')
  const run = (index: number): Promise<ToolOutcome> => {
    const entry = listeners[index]
    if (!entry) return terminal()
    return entry
      .fn(call, () => run(index + 1))
      .catch(
        (error: unknown): ToolOutcome =>
          started
            ? {
                kind: 'threw',
                error: `${entry.plugin} failed: ${errorMessage(error)}`,
                durationMs: 0
              }
            : {
                kind: 'not_started',
                gate: stop(
                  'INSUFFICIENT_EVIDENCE',
                  `${entry.plugin} failed before dispatch: ${errorMessage(error)}.`
                )
              }
      )
  }
  const outcome = await run(0)
  if (started) {
    await Promise.resolve(
      host.get('effects').finished(ref, outcome.kind)
    ).catch(() => undefined)
  }
  return outcome
}

async function postExecute(
  host: KernelHost,
  call: ToolCallState,
  outcome: ToolOutcome
): Promise<ToolOutcome> {
  let current = outcome
  for (const entry of host.listeners('tool/post-execute')) {
    try {
      current = await entry.fn(call, current)
    } catch (error) {
      // I7: a failing settlement after an effect never reads as success.
      if (current.kind === 'succeeded') {
        current = {
          kind: 'confirm_failed',
          result: current.result,
          error: `${entry.plugin} failed: ${errorMessage(error)}`,
          durationMs: current.durationMs
        }
      }
    }
  }
  return current
}

export type ModelPipelineResult =
  | { readonly kind: 'stopped'; readonly gate: KernelStop }
  | { readonly kind: 'deadline' }
  | { readonly kind: 'cancelled' }
  | { readonly kind: 'failed'; readonly error: string }
  | { readonly kind: 'completed'; readonly result: ModelResult }

/**
 * `model/before-call` → log `model/request` (I6) → call raced against the
 * budget and the cancel signal → log `model/result`.
 */
export async function runModelCall(
  host: KernelHost,
  turn: TurnState,
  request: Omit<ModelRequest, 'signal'>
): Promise<ModelPipelineResult> {
  const controller = new AbortController()
  const full: ModelRequest = {
    ...request,
    signal: AbortSignal.any([controller.signal, turn.signal])
  }
  const gate = await runGate(host, 'model/before-call', { turn, request: full })
  if (gate.kind === 'stop') return { kind: 'stopped', gate }
  if (turn.signal.aborted) return { kind: 'cancelled' }
  const logged = await appendLog(host, {
    type: 'model/request',
    correlationId: turn.input.correlationId,
    request
  })
  if (logged) return { kind: 'stopped', gate: logged }
  try {
    const outcome = await race(turn, () => host.get('model').complete(full))
    if (outcome === DEADLINE || outcome === CANCELLED) {
      controller.abort()
      return { kind: outcome === DEADLINE ? 'deadline' : 'cancelled' }
    }
    await appendLog(host, {
      type: 'model/result',
      correlationId: turn.input.correlationId,
      provider: outcome.provider,
      inputTokens: outcome.inputTokens,
      outputTokens: outcome.outputTokens
    })
    return { kind: 'completed', result: outcome }
  } catch (error) {
    return { kind: 'failed', error: errorMessage(error) }
  }
}
