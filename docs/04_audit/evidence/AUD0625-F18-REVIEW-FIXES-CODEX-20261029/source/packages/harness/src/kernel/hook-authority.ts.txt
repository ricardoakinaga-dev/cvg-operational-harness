/** Private kernel adapter wiring. Deliberately not re-exported by the package. */
import { STOP_REASONS, type RuntimeResult } from '@cvg/harness-contracts'
import {
  PROCEED,
  stop,
  type HookMap,
  type HookPoint,
  type KernelGate,
  type ModelCallState,
  type Next,
  type ToolCallState,
  type ToolOutcome,
  type TurnState
} from './types.ts'

type CoreHookMap = {
  'turn/before-step': (
    state: TurnState,
    next: Next<KernelGate>
  ) => Promise<KernelGate>
  'model/before-call': (
    state: ModelCallState,
    next: Next<KernelGate>
  ) => Promise<KernelGate>
  'tool/pre-execute': (
    state: ToolCallState,
    next: Next<KernelGate>
  ) => Promise<KernelGate>
  'tool/execute': (
    state: ToolCallState,
    next: Next<ToolOutcome>
  ) => Promise<ToolOutcome>
  'tool/post-execute': (
    state: ToolCallState,
    outcome: ToolOutcome
  ) => Promise<ToolOutcome>
  'turn/end': (
    state: TurnState,
    result: RuntimeResult
  ) => Promise<RuntimeResult>
}
const adapters = new WeakSet<object>()
export function coreHook<P extends HookPoint>(
  _point: P,
  fn: CoreHookMap[P]
): HookMap[P] {
  adapters.add(fn)
  return fn as unknown as HookMap[P]
}
interface Entry {
  readonly kind: string
  readonly plugin: string
  readonly fn: unknown
}
export function isCoreHook(entry: Entry): boolean {
  return (
    entry.kind === 'control' &&
    typeof entry.fn === 'function' &&
    adapters.has(entry.fn)
  )
}
const OPAQUE = Object.freeze({ opaque: true })
/** Bounded data projection: no getters, prototypes, executors or reference fallback. */
export function observation<T>(input: T): T {
  let nodes = 0
  const seen = new WeakSet<object>()
  const copy = (value: unknown, depth: number): unknown => {
    if (value === OPAQUE) return OPAQUE
    if (
      value === null ||
      ['string', 'number', 'boolean', 'undefined'].includes(typeof value)
    )
      return value
    if (
      typeof value !== 'object' ||
      depth > 16 ||
      ++nodes > 4096 ||
      seen.has(value)
    )
      return OPAQUE
    try {
      const proto = Object.getPrototypeOf(value)
      if (proto !== Object.prototype && proto !== null && !Array.isArray(value))
        return OPAQUE
      const descriptors = Object.getOwnPropertyDescriptors(value)
      const names = Object.keys(descriptors).filter(
        (key) => descriptors[key]!.enumerable
      )
      if (names.length > 512) return OPAQUE
      seen.add(value)
      const result: Record<string, unknown> | unknown[] = Array.isArray(value)
        ? []
        : Object.create(null)
      for (const key of names) {
        const d = descriptors[key]!
        Object.defineProperty(result, key, {
          value: 'value' in d ? copy(d.value, depth + 1) : OPAQUE,
          enumerable: true,
          configurable: false,
          writable: false
        })
      }
      return Object.freeze(result)
    } catch {
      return OPAQUE
    }
  }
  return copy(input, 0) as T
}
function without(value: unknown, omitted: readonly string[]): unknown {
  const projected = observation(value)
  if (!projected || typeof projected !== 'object' || projected === OPAQUE)
    return OPAQUE
  const data = Object.create(null) as Record<string, unknown>
  for (const [key, item] of Object.entries(projected))
    if (!omitted.includes(key)) data[key] = item
  return Object.freeze(data)
}
function turnView(turn: TurnState): unknown {
  return Object.freeze({
    input: without(turn.input, ['signal']),
    startedAt: turn.startedAt,
    signal: Object.freeze({ aborted: turn.signal.aborted }),
    budget: Object.freeze({ remainingMs: () => turn.budget.remainingMs() }),
    metadata: observation(turn.metadata)
  })
}
/** Only credentialed central adapters receive the kernel-owned writer context. */
export function hookState<T>(entry: Entry, state: T): T {
  if (isCoreHook(entry)) return state
  if (state && typeof state === 'object') {
    if ('turn' in state) {
      const call = state as unknown as ToolCallState
      if ('tool' in state) {
        return Object.freeze({
          turn: turnView(call.turn),
          tool: without(call.tool, ['execute']),
          invocation: observation(call.invocation),
          needsApproval: call.needsApproval,
          ...(call.policyDecision
            ? { policyDecision: observation(call.policyDecision) }
            : {}),
          ...(call.executionRef ? { executionRef: call.executionRef } : {})
        }) as T
      }
      const model = state as unknown as ModelCallState
      return Object.freeze({
        turn: turnView(model.turn),
        request: without(model.request, ['signal'])
      }) as T
    }
    if ('budget' in state && 'input' in state && 'signal' in state)
      return turnView(state as unknown as TurnState) as T
  }
  return observation(state)
}
export function hookValue<T>(entry: Entry, value: T): T {
  return isCoreHook(entry) ? value : observation(value)
}
export function reconcileGate(
  before: KernelGate | undefined,
  proposed: unknown
): KernelGate {
  if (before?.kind === 'stop') return before
  const value = observation(proposed) as KernelGate | undefined
  if (value?.kind === 'proceed') return PROCEED
  if (
    value?.kind === 'stop' &&
    value.stopReason !== 'COMPLETED' &&
    STOP_REASONS.includes(value.stopReason) &&
    typeof value.response === 'string'
  )
    return value
  return stop('INSUFFICIENT_EVIDENCE', 'Invalid internal gate result.')
}
/** Only inspect detached projections; internal markers are identity-branded. */
function hasOpaque(value: unknown): boolean {
  return (
    value === OPAQUE ||
    (value !== null &&
      typeof value === 'object' &&
      Object.values(value).some(hasOpaque))
  )
}
function invalidOutcome(
  before: Extract<ToolOutcome, { kind: 'succeeded' }>
): ToolOutcome {
  return {
    kind: 'confirm_failed',
    result: before.result,
    error: 'Invalid internal outcome transformation.',
    durationMs: before.durationMs
  }
}
export function reconcileOutcome(
  before: ToolOutcome,
  proposed: unknown,
  exposed?: ToolOutcome
): ToolOutcome {
  if (proposed === exposed || proposed === before) return before
  // A recorded failure/uncertainty or a proven not-started stop is sticky.
  if (before.kind !== 'succeeded') return before
  const value = observation(proposed) as ToolOutcome | undefined
  if (!value) return invalidOutcome(before)
  if (value.kind === 'succeeded' && value.result?.status === 'SUCCEEDED') {
    // A reconstructed observation cannot turn an omitted/opaque value into data.
    // Identity-returning observers took the safe shortcut above. Refuse lossy
    // copies (including serialized copies) while retaining the physical result.
    if (hasOpaque(value.result) || (exposed && hasOpaque(observation(exposed))))
      return invalidOutcome(before)
    return { ...before, result: value.result }
  }
  if (
    value.kind === 'failed' &&
    ['FAILED', 'REJECTED'].includes(value.result?.status)
  )
    return {
      kind: 'threw',
      error: `unknown_effect: ${
        typeof value.result.error === 'string'
          ? value.result.error
          : 'Internal hook claimed failure after a successful physical effect.'
      }`,
      durationMs: before.durationMs
    }
  if (value.kind === 'confirm_failed' && typeof value.error === 'string')
    return { ...value, result: before.result, durationMs: before.durationMs }
  if (value.kind === 'threw' && typeof value.error === 'string')
    return { ...value, durationMs: before.durationMs }
  if (value.kind === 'deadline' || value.kind === 'cancelled')
    return { ...value, durationMs: before.durationMs }
  // It is too late to claim that a successful physical effect never started.
  return invalidOutcome(before)
}
export function reconcileTurn(
  before: RuntimeResult,
  proposed: unknown,
  exposed?: RuntimeResult,
  core = false
): RuntimeResult {
  if (proposed === exposed || proposed === before) return before
  if (before.stopReason !== 'COMPLETED' && !core) return before
  const value = observation(proposed) as RuntimeResult | undefined
  if (
    !value ||
    !STOP_REASONS.includes(value.stopReason) ||
    typeof value.response !== 'string'
  )
    return {
      ...before,
      stopReason: 'INSUFFICIENT_EVIDENCE',
      response: 'Invalid internal turn result.'
    }
  if (before.stopReason !== 'COMPLETED') {
    if (
      core &&
      value.stopReason === 'INSUFFICIENT_EVIDENCE' &&
      before.stopReason !== value.stopReason
    )
      return {
        ...before,
        stopReason: value.stopReason,
        response: `${value.response} The turn had already stopped (${before.stopReason}): ${before.response}`
      }
    return before
  }
  // Presentation may be redacted/restricted; facts, counters and effect stay owned.
  return { ...before, stopReason: value.stopReason, response: value.response }
}
/** Each wrapper gets one scoped continuation; facts remain outside its return. */
export async function waterfall<S, V>(
  entry: Entry & { readonly fn: (state: S, next: Next<V>) => Promise<V> },
  state: S,
  downstream: Next<V>,
  failure: (reason: string) => V,
  reconcile: (before: V | undefined, proposed: unknown, exposed?: V) => V,
  positive: (value: V) => boolean
): Promise<V> {
  let active = true,
    calls = 0,
    violation = false
  let running: Promise<V> | undefined,
    exposed: V | undefined,
    error: unknown,
    threw = false
  let immediateFailure: V | undefined
  const next = (): Promise<V> => {
    if (!active || calls++ > 0) {
      violation = true
      return Promise.resolve(
        failure('Continuation invoked more than once or after its hook ended.')
      )
    }
    running = Promise.resolve().then(downstream)
    const visible = running.then((value) => {
      exposed = hookValue(entry, value)
      return exposed
    })
    void visible.catch(() => undefined)
    return visible
  }
  let candidate: V | undefined
  try {
    candidate = await entry.fn(hookState(entry, state), next)
  } catch (value) {
    threw = true
    error = value
    immediateFailure = failure(
      error instanceof Error ? error.message : 'unknown failure'
    )
  } finally {
    active = false
  }
  // A wrapper cannot abandon an already delegated effect and report completion.
  let fact: V | undefined
  try {
    fact = running ? await running : undefined
  } catch (value) {
    return failure(value instanceof Error ? value.message : 'unknown failure')
  }
  if (violation)
    return reconcile(
      fact,
      failure('Continuation invoked more than once or after its hook ended.')
    )
  if (threw) return reconcile(fact, immediateFailure)
  const value = reconcile(fact, candidate, exposed)
  if (!running && positive(value))
    return failure('Positive hook result requires exactly one continuation.')
  return value
}
