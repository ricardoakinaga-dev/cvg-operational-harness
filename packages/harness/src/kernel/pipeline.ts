import {
  hookState,
  hookValue,
  observation,
  reconcileGate,
  reconcileOutcome,
  waterfall
} from './hook-authority.ts'
import { isAbsolute } from 'node:path'
import type {
  ModelRequest,
  ModelResult,
  RuntimeInput,
  SandboxGateOutcome,
  SandboxMode,
  ToolDescriptor
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
  type ToolCallView,
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
  | 'model/overflow'
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

/** Detached copy for the log, so later mutation cannot rewrite history. */
function snapshot<T>(value: T): T {
  try {
    return structuredClone(value)
  } catch {
    return value
  }
}

function durationOf(outcome: ToolOutcome | undefined): number {
  return outcome && 'durationMs' in outcome ? outcome.durationMs : 0
}

/** The additive SPEC 0290 D4 signal on a gateway refusal; the code is unchanged. */
function isContextWindowError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { reason?: unknown }).reason === 'context_window'
  )
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
    readonly kind: string
    readonly plugin: string
    readonly fn: (
      state: S,
      next: () => Promise<KernelGate>
    ) => Promise<KernelGate>
  }[]
  const run = (index: number): Promise<KernelGate> => {
    const entry = listeners[index]
    if (!entry) return Promise.resolve(PROCEED)
    return waterfall(
      entry,
      state,
      () => run(index + 1),
      (reason) =>
        stop(
          'INSUFFICIENT_EVIDENCE',
          `${entry.plugin} failed at ${point}: ${reason}.`
        ),
      reconcileGate,
      (value) => value.kind === 'proceed'
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

/**
 * A call that was blocked and whose closing record was then lost: the turn
 * reports the missing evidence without hiding why the call was blocked
 * (AUD-0598 R04, AUD-0599 F01).
 */
export function unrecordedBlock(
  lost: KernelStop,
  blocked: KernelStop
): KernelStop {
  return stop(
    'INSUFFICIENT_EVIDENCE',
    `${lost.response} The call was blocked before it started: ${blocked.response}`,
    blocked.approvalId !== undefined ? { approvalId: blocked.approvalId } : {}
  )
}

/** Races an operation against the turn budget and the cancel signal (I8). */
export async function race<T>(
  turn: TurnState,
  operation: () => Promise<T>
): Promise<T | typeof DEADLINE | typeof CANCELLED> {
  const signal = turn.signal
  if (signal.aborted) return CANCELLED
  let onAbort!: () => void
  const cancelled = new Promise<typeof CANCELLED>((resolve) => {
    onAbort = () => resolve(CANCELLED)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([turn.budget.withDeadline(operation), cancelled])
  } finally {
    signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Like `race`, but always starts the operation first: used once the kernel has
 * committed to dispatch, so the cancel signal is passed to the body instead of
 * skipping it.
 */
async function raceInvoked<T>(
  turn: TurnState,
  operation: () => Promise<T>
): Promise<T | typeof DEADLINE | typeof CANCELLED> {
  const running = operation()
  // The operation may start and then find an exhausted deadline at race time;
  // its later rejection must never surface as an unhandled rejection.
  void running.catch(() => undefined)
  const signal = turn.signal
  let onAbort!: () => void
  const cancelled = new Promise<typeof CANCELLED>((resolve) => {
    if (signal.aborted) resolve(CANCELLED)
    onAbort = () => resolve(CANCELLED)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  try {
    return await Promise.race([
      turn.budget.withDeadline(() => running),
      cancelled
    ])
  } finally {
    signal.removeEventListener('abort', onAbort)
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
      verdict = await guard(
        hookState({ kind: 'observer', plugin: 'guard', fn: guard }, call)
      )
    } catch (error) {
      verdict = `A guard failed: ${errorMessage(error)}.`
    }
    if (typeof verdict === 'string') return stop('POLICY_DENIED', verdict)
    if (verdict) {
      return stop(
        verdict.stopReason,
        verdict.reason,
        verdict.cause ? { cause: verdict.cause } : {}
      )
    }
  }
  return undefined
}

/**
 * Guards and cancellation, re-run at every point where the world may have
 * changed before dispatch: after the loop's checkpoint and after the approval
 * reservation (AUD-0597 F01/F02).
 */
export async function revalidate(
  host: KernelHost,
  call: ToolCallState
): Promise<KernelStop | undefined> {
  return (
    (await runGuards(host, call)) ??
    (call.turn.signal.aborted
      ? stop('CANCELLED', CANCELLED_RESPONSE)
      : undefined)
  )
}

export type ToolPipelineResult =
  /**
   * Nothing ran and nothing is reserved; the call is closed as not started.
   * `blocked` is set when that closing record was lost: `gate` then reports
   * the missing evidence and `blocked` keeps the control's own decision, so
   * the loop can still close its step for the real reason (AUD-0599 F02).
   */
  | {
      readonly kind: 'stopped'
      readonly gate: KernelStop
      readonly blocked?: KernelStop
    }
  /**
   * Dispatch was attempted; the outcome is already settled. `logFailure` is
   * set when the final record could not be written: the outcome stays the
   * fact of what happened, and the loop must not report success (F04).
   */
  | {
      readonly kind: 'settled'
      readonly outcome: ToolOutcome
      readonly logFailure?: KernelStop
    }

export interface ToolPipelineHooks {
  /**
   * Runs after every control allowed the call and before any reservation or
   * effect; the iterative loop persists its checkpoint here.
   */
  readonly beforeDispatch?: (
    call: ToolCallView
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

  // Every call that was logged is closed exactly once (I5, AUD-0597 F06).
  const closeNotStarted = async (
    blocked: KernelStop
  ): Promise<ToolPipelineResult> => {
    const unrecorded = await appendLog(host, {
      type: 'tool/result',
      correlationId,
      toolId: tool.id,
      outcome: 'not_started'
    })
    // A lost closing record is not hidden behind the denial (AUD-0598 R04):
    // the call stays blocked, and the turn reports the missing evidence.
    return unrecorded
      ? { kind: 'stopped', gate: unrecordedBlock(unrecorded, blocked), blocked }
      : { kind: 'stopped', gate: blocked }
  }

  const gate = await runGate(host, 'tool/pre-execute', call)
  if (gate.kind === 'stop') return closeNotStarted(gate)

  const denial = await revalidate(host, call)
  if (denial) return closeNotStarted(denial)

  const sandbox = await enforceSandbox(host, call)
  if (sandbox) return closeNotStarted(sandbox)

  let hooked: KernelStop | undefined
  try {
    hooked = await hooks.beforeDispatch?.(
      hookState(
        { kind: 'observer', plugin: 'checkpoint', fn: hooks.beforeDispatch },
        call
      )
    )
  } catch (error) {
    // The loop's own checkpoint failed: the logged call is still closed once
    // and the original failure reaches the loop unchanged (AUD-0598 R03).
    await appendLog(host, {
      type: 'tool/result',
      correlationId,
      toolId: tool.id,
      outcome: 'not_started'
    })
    throw error
  }
  if (hooked) return closeNotStarted(hooked)

  // The hook may have taken time (checkpoint): re-check before reserving.
  const late = await revalidate(host, call)
  if (late) return closeNotStarted(late)

  const settled = await postExecute(host, call, await dispatch(host, call))
  const logFailure = await appendLog(host, {
    type: 'tool/result',
    correlationId,
    toolId: tool.id,
    outcome: settled.kind
  })
  return logFailure
    ? { kind: 'settled', outcome: settled, logFailure }
    : { kind: 'settled', outcome: settled }
}

/**
 * Derives the containment a tool needs from its descriptor (SPEC 0195 §2/§5).
 * EXTERNAL effects require an EGRESS gate; WRITE effects require WORKSPACE;
 * READ effects require at least IN_PROCESS. A mode-`NONE` capability is pure
 * in-memory and never reaches the sandbox gate.
 */
/**
 * The mode is declared on the descriptor (SPEC 0195 §5). Absent or `'NONE'`
 * means no gate; the harness never infers containment from `sideEffect`, so
 * legacy side-effecting tools keep running until they opt in.
 */
export function requiredSandboxMode(descriptor: ToolDescriptor): SandboxMode {
  return descriptor.sandbox ?? 'NONE'
}

/**
 * Enforcement point between every control decision and the capability body
 * (SPEC 0195 §3/§4). Fails closed: a missing gate, an `unavailable` outcome
 * or a thrown gate stops the call as `UNSAFE_REQUEST` and never downgrades
 * to in-process execution. Pure (`NONE`) tools skip the gate entirely.
 */
async function enforceSandbox(
  host: KernelHost,
  call: ToolCallState
): Promise<KernelStop | undefined> {
  const requiredMode = requiredSandboxMode(call.tool)
  if (requiredMode === 'NONE') return undefined
  if (!host.has('sandbox')) {
    return stop(
      'UNSAFE_REQUEST',
      `Tool "${call.tool.id}" requires sandbox mode ${requiredMode} but no sandbox gate is configured.`
    )
  }
  const gate = host.get('sandbox')
  if (!gate) {
    // host.has was checked; a missing entry here is a host-integrity fault,
    // so fail closed the same way as an unconfigured gate.
    return stop(
      'UNSAFE_REQUEST',
      `Tool "${call.tool.id}" requires sandbox mode ${requiredMode} but no sandbox gate is configured.`
    )
  }
  try {
    const outcome: SandboxGateOutcome = await gate.evaluate({
      descriptor: call.tool,
      context: {
        tenantId: call.turn.input.tenantId,
        agentId: call.turn.input.agent.id,
        correlationId: call.turn.input.correlationId,
        traceId: call.turn.input.traceId,
        operationKey: call.invocation.operationKey
      },
      policy: {
        requiredMode,
        workspaceScoped: requiredMode === 'WORKSPACE',
        networkAllowed: requiredMode === 'EGRESS',
        subprocessAllowed: requiredMode === 'PROCESS'
      }
    })
    if (outcome.kind === 'denied') {
      return stop(
        'UNSAFE_REQUEST',
        `Sandbox denied tool "${call.tool.id}": ${outcome.reason}.`
      )
    }
    if (outcome.kind === 'unavailable') {
      return stop(
        'UNSAFE_REQUEST',
        `Sandbox mode ${requiredMode} unavailable for tool "${call.tool.id}": ${outcome.reason}.`
      )
    }
    const granted = outcome.kind === 'allowed' ? outcome.handle : undefined
    const handle = granted && {
      mode: granted.mode,
      allowNetwork: granted.allowNetwork,
      allowSubprocess: granted.allowSubprocess,
      workspaceRoot: granted.workspaceRoot,
      deadlineMs: granted.deadlineMs
    }
    if (
      outcome.kind !== 'allowed' ||
      outcome.mode !== requiredMode ||
      !handle ||
      handle.mode !== requiredMode ||
      typeof handle.allowNetwork !== 'boolean' ||
      typeof handle.allowSubprocess !== 'boolean' ||
      (handle.deadlineMs !== undefined &&
        (!Number.isFinite(handle.deadlineMs) || handle.deadlineMs <= 0)) ||
      (requiredMode === 'WORKSPACE' && handle.workspaceRoot === undefined) ||
      (handle.workspaceRoot !== undefined &&
        (typeof handle.workspaceRoot !== 'string' ||
          !isAbsolute(handle.workspaceRoot) ||
          handle.workspaceRoot.includes('\0')))
    ) {
      return stop(
        'UNSAFE_REQUEST',
        `Sandbox gate returned an invalid handle for tool "${call.tool.id}".`
      )
    }
    // Copy only validated grants. Neither a later gate mutation nor model
    // JSON can rewrite the authority passed to the capability body.
    call.sandboxHandle = Object.freeze({
      mode: handle.mode,
      allowNetwork: handle.allowNetwork,
      allowSubprocess: handle.allowSubprocess,
      ...(handle.workspaceRoot !== undefined
        ? { workspaceRoot: handle.workspaceRoot }
        : {}),
      ...(handle.deadlineMs !== undefined
        ? { deadlineMs: handle.deadlineMs }
        : {})
    })
    return undefined
  } catch (error) {
    return stop(
      'UNSAFE_REQUEST',
      `Sandbox gate failed for tool "${call.tool.id}": ${errorMessage(error)}.`
    )
  }
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
  let continuationFault = false
  let physical: ToolOutcome | undefined
  const executeBody = async (): Promise<ToolOutcome> => {
    if (turn.budget.remainingMs() <= 0) {
      return {
        kind: 'not_started',
        gate: stop(
          'MAX_DURATION',
          'Duration budget exhausted before tool execution.'
        )
      }
    }
    // Last decision point: after every wrapper (the approval reservation),
    // a pause or a cancellation still prevents the effect (F01/F02).
    const blocked = await revalidate(host, call)
    if (blocked) return { kind: 'not_started', gate: blocked }
    if (continuationFault)
      return {
        kind: 'not_started',
        gate: stop(
          'INSUFFICIENT_EVIDENCE',
          'Internal continuation invalidated before dispatch.'
        )
      }
    try {
      await host.get('effects').started(ref)
    } catch (error) {
      return {
        kind: 'not_started',
        gate: stop(
          'INSUFFICIENT_EVIDENCE',
          `Effect ledger could not record the start: ${errorMessage(error)}.`
        )
      }
    }
    started = true
    const startedAt = Date.now()
    const toolController = new AbortController()
    try {
      // Past the decision point the body is always invoked, so a recorded
      // start never pairs with a body that did not run.
      const value = await raceInvoked(turn, () =>
        call.tool.execute(call.invocation.input, {
          tenantId: turn.input.tenantId,
          agentId: turn.input.agent.id,
          correlationId: turn.input.correlationId,
          traceId: turn.input.traceId,
          operationKey: call.invocation.operationKey,
          sessionId: turn.input.sessionId,
          ...(call.sandboxHandle ? { sandboxHandle: call.sandboxHandle } : {}),
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
  const terminal = async (): Promise<ToolOutcome> => {
    const value = await executeBody()
    if (started) physical = value
    return value
  }
  const listeners = host.listeners('tool/execute')
  const run = (index: number): Promise<ToolOutcome> => {
    const entry = listeners[index]
    if (!entry) return terminal()
    const failure = (reason: string): ToolOutcome => {
      continuationFault = true
      return started
        ? {
            kind: 'threw',
            error: `${entry.plugin} failed: ${reason}`,
            durationMs: durationOf(physical)
          }
        : {
            kind: 'not_started',
            gate: stop(
              'INSUFFICIENT_EVIDENCE',
              `${entry.plugin} failed before dispatch: ${reason}.`
            )
          }
    }
    return waterfall(
      entry,
      call,
      () => run(index + 1),
      failure,
      (before, proposed, exposed) => {
        if (before) return reconcileOutcome(before, proposed, exposed)
        const value = observation(proposed) as ToolOutcome | undefined
        if (value?.kind === 'not_started') {
          const gate = reconcileGate(undefined, value.gate)
          return gate.kind === 'stop'
            ? { kind: 'not_started', gate }
            : failure('Invalid not-started gate.')
        }
        if (value?.kind === 'succeeded' && value.result?.status === 'SUCCEEDED')
          return value
        return failure('Invalid result before dispatch.')
      },
      (value) => value.kind === 'succeeded'
    )
  }
  const outcome = await run(0)
  // `physical` is assigned exactly when the body was started.
  if (physical) {
    try {
      await host.get('effects').finished(ref, physical.kind)
    } catch {
      // The body already ran. A missing settlement is uncertain, never a
      // successful effect or permission to retry the body/ledger.
      return {
        kind: 'threw',
        error: 'unknown_effect: effect_settlement_failed',
        durationMs: durationOf(outcome)
      }
    }
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
      const exposed = hookValue(entry, current)
      const proposed = await entry.fn(hookState(entry, call), exposed)
      current = reconcileOutcome(current, proposed, exposed)
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
  /** The model answered but the result could not be logged (F04). */
  | {
      readonly kind: 'unrecorded'
      readonly result: ModelResult
      readonly gate: KernelStop
    }

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
  const preGate = turn.budget.beginModelRequest()
  if (preGate) return { kind: 'stopped', gate: preGate }
  const gate = await runGate(host, 'model/before-call', { turn, request: full })
  if (gate.kind === 'stop') return { kind: 'stopped', gate }
  if (turn.signal.aborted) return { kind: 'cancelled' }
  // SPEC 0290 §3.4: the model port may report that the request does not fit
  // the context window. The turn gets exactly one more request, and only when
  // a `model/overflow` control changed what is sent.
  let overflowRetried = false
  for (;;) {
    // I6: log the request as it will be sent, after every control adjusted it.
    const { signal: _signal, ...effective } = full
    void _signal
    const logged = await appendLog(host, {
      type: 'model/request',
      correlationId: turn.input.correlationId,
      request: snapshot(effective)
    })
    if (logged) return { kind: 'stopped', gate: logged }
    try {
      const outcome = await race(turn, () => host.get('model').complete(full))
      if (outcome === DEADLINE || outcome === CANCELLED) {
        controller.abort()
        return { kind: outcome === DEADLINE ? 'deadline' : 'cancelled' }
      }
      const unrecorded = await appendLog(host, {
        type: 'model/result',
        correlationId: turn.input.correlationId,
        provider: outcome.provider,
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens
      })
      if (unrecorded) {
        return { kind: 'unrecorded', result: outcome, gate: unrecorded }
      }
      const accounted = turn.budget.recordModelResult({
        inputTokens: outcome.inputTokens,
        outputTokens: outcome.outputTokens,
        costUsd: outcome.costUsd
      })
      if (accounted) return { kind: 'stopped', gate: accounted }
      return { kind: 'completed', result: outcome }
    } catch (error) {
      if (overflowRetried || !isContextWindowError(error)) {
        return { kind: 'failed', error: errorMessage(error) }
      }
      overflowRetried = true
      const sent = full.messages
      const adjusted = await runGate(host, 'model/overflow', {
        turn,
        request: full
      })
      if (adjusted.kind === 'stop') return { kind: 'stopped', gate: adjusted }
      if (turn.signal.aborted) return { kind: 'cancelled' }
      // nothing compacted: the original error is the outcome
      if (full.messages === sent) {
        return { kind: 'failed', error: errorMessage(error) }
      }
      const slot = turn.budget.beginModelRequest()
      if (slot) return { kind: 'stopped', gate: slot }
    }
  }
}
