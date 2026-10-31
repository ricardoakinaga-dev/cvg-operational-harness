import { STOP_REASONS } from '@cvg/harness-contracts'
import {
  canonicalSessionFilter,
  sessionListLimit,
  validateSessionEvent
} from '@cvg/harness'
import {
  SDK_METHODS,
  SDK_PROTOCOL_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type SdkMethod,
  type SdkHelloResult,
  type SessionOpenResult,
  type TurnSendResult,
  type SessionEventsResult,
  type SessionListResult,
  type SessionTraceResult
} from './protocol.ts'

export function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function validIdentifier(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= 200 &&
    !value.includes('\u0000')
  )
}

export function validRpcId(value: unknown): value is string | number {
  return (
    validIdentifier(value) ||
    (typeof value === 'number' && Number.isSafeInteger(value))
  )
}

/** Shape of a method name in `sdk.hello`: dotted identifiers, bounded. */
const METHOD_NAME = /^[A-Za-z][A-Za-z0-9]*(\.[A-Za-z][A-Za-z0-9]*)*$/

export function isSdkMethod(value: string): value is SdkMethod {
  return SDK_METHODS.some((method) => method === value)
}

const natural = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

export function isRequest(value: unknown): value is JsonRpcRequest {
  const r = record(value)
  return (
    !!r &&
    Object.hasOwn(r, 'id') &&
    validRpcId(r.id) &&
    r.jsonrpc === '2.0' &&
    typeof r.method === 'string' &&
    r.method.length > 0 &&
    (r.params === undefined || !!record(r.params) || Array.isArray(r.params))
  )
}

/** Matches the v1 server's params; unknown methods remain method_not_found. */
export function validParams(request: JsonRpcRequest): boolean {
  if (!isSdkMethod(request.method)) return true
  const p = record(request.params)
  if (!p) return false
  switch (request.method) {
    case 'sdk.hello':
      return (
        typeof p.protocolVersion === 'number' &&
        Number.isFinite(p.protocolVersion)
      )
    case 'session.open':
      return validIdentifier(p.sessionId)
    case 'turn.send':
      return (
        typeof p.userMessage === 'string' &&
        p.userMessage.trim().length > 0 &&
        Buffer.byteLength(p.userMessage) <= 64 * 1024 &&
        (p.sessionId === undefined || validIdentifier(p.sessionId))
      )
    case 'session.events':
      return (
        validIdentifier(p.sessionId) &&
        natural(p.afterSequence ?? 0) &&
        natural(p.limit ?? 100) &&
        ((p.limit ?? 100) as number) >= 1 &&
        ((p.limit ?? 100) as number) <= 500
      )
    case 'session.list':
      return (
        onlyKeys(p, ['filter', 'cursor', 'limit']) &&
        (p.cursor === undefined ||
          (typeof p.cursor === 'string' &&
            p.cursor.length >= 1 &&
            p.cursor.length <= 512)) &&
        refusesNothing(() => {
          sessionListLimit(p.limit)
          canonicalSessionFilter(p.filter)
        })
      )
    case 'session.trace': {
      const roots = [p.approvalId, p.operationKey].filter(
        (v) => v !== undefined
      )
      return (
        onlyKeys(p, ['approvalId', 'operationKey']) &&
        roots.length === 1 &&
        typeof roots[0] === 'string' &&
        roots[0].length >= 1 &&
        roots[0].length <= 4096 &&
        !roots[0].includes('\u0000')
      )
    }
  }
}

function onlyKeys(p: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(p).every((key) => allowed.includes(key))
}

/** True when the pure rules of the harness accept; they throw on a refusal. */
function refusesNothing(check: () => void): boolean {
  try {
    check()
    return true
  } catch {
    return false
  }
}

export function isResponse(value: unknown): value is JsonRpcResponse {
  const r = record(value)
  if (!r || r.jsonrpc !== '2.0' || !Object.hasOwn(r, 'id') || !validRpcId(r.id))
    return false
  const hasResult = Object.hasOwn(r, 'result')
  const hasError = Object.hasOwn(r, 'error')
  if (hasResult === hasError) return false
  if (hasResult) return true
  const e = record(r.error)
  return (
    !!e &&
    typeof e.code === 'number' &&
    Number.isSafeInteger(e.code) &&
    typeof e.message === 'string' &&
    Buffer.byteLength(e.message) >= 1 &&
    Buffer.byteLength(e.message) <= 1024
  )
}

interface Results {
  'sdk.hello': SdkHelloResult
  'session.open': SessionOpenResult
  'turn.send': TurnSendResult
  'session.events': SessionEventsResult
  'session.list': SessionListResult
  'session.trace': SessionTraceResult
}

function validResult(
  request: JsonRpcRequest,
  value: unknown,
  expectedTenantId?: string
): boolean {
  const r = record(value)
  const p = record(request.params)
  if (!r || !p) return false
  switch (request.method) {
    case 'sdk.hello': {
      const c = record(r.capabilities)
      if (
        r.protocolVersion !== SDK_PROTOCOL_VERSION ||
        !c ||
        typeof c.sessions !== 'boolean' ||
        typeof c.events !== 'boolean' ||
        !Array.isArray(c.methods) ||
        !c.methods.every(
          (m: unknown) => typeof m === 'string' && METHOD_NAME.test(m)
        )
      )
        return false
      // a well-formed name this client does not know is ignored and never called: v1 is additive
      const methods = new Set<string>(c.methods)
      return (
        methods.size === c.methods.length &&
        methods.has('session.list') === methods.has('session.trace') &&
        methods.has('sdk.hello') &&
        methods.has('turn.send') &&
        methods.has('session.open') === c.sessions &&
        methods.has('session.events') === c.events &&
        (!c.events || c.sessions)
      )
    }
    case 'session.open':
      return (
        r.formatVersion === 1 &&
        r.sessionId === p.sessionId &&
        validIdentifier(r.sessionId)
      )
    case 'turn.send': {
      const u = record(r.usage)
      return (
        typeof r.stopReason === 'string' &&
        STOP_REASONS.some((s) => s === r.stopReason) &&
        typeof r.response === 'string' &&
        natural(r.modelCalls) &&
        natural(r.toolCalls) &&
        !!u &&
        natural(u.inputTokens) &&
        natural(u.outputTokens) &&
        typeof u.costUsd === 'number' &&
        Number.isFinite(u.costUsd) &&
        u.costUsd >= 0 &&
        (p.sessionId === undefined
          ? !Object.hasOwn(r, 'sessionId')
          : r.sessionId === p.sessionId)
      )
    }
    case 'session.events': {
      if (
        !Array.isArray(r.events) ||
        r.events.length > ((p.limit ?? 100) as number)
      )
        return false
      let sequence = (p.afterSequence ?? 0) as number
      const ids = new Set<string>()
      try {
        for (const value of r.events) {
          const event = validateSessionEvent(value)
          if (
            event.formatVersion !== 1 ||
            event.sessionId !== p.sessionId ||
            (expectedTenantId !== undefined &&
              event.tenantId !== expectedTenantId) ||
            event.sequence <= sequence ||
            ids.has(event.eventId)
          )
            return false
          sequence = event.sequence
          ids.add(event.eventId)
        }
      } catch {
        return false
      }
      return true
    }
    case 'session.list':
      return validList(r, p)
    case 'session.trace':
      return validTrace(r, p)
    default:
      return false
  }
}

const GAP_REASONS = new Set([
  'approval_not_found',
  'ambiguous_approval',
  'candidates_capped',
  'effect_absent',
  'execution_ref_mismatch',
  'origin_unbound',
  'event_not_found',
  'multiple_event_candidates',
  'tool_result_ambiguous',
  'source_conflict',
  'source_unavailable',
  'budget_exhausted'
])
const text = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const optionalText = (v: unknown): boolean => v === undefined || text(v)

function validList(
  r: Record<string, unknown>,
  p: Record<string, unknown>
): boolean {
  if (
    !Array.isArray(r.items) ||
    r.items.length > sessionListLimit(p.limit) ||
    !(
      r.nextCursor === null ||
      (text(r.nextCursor) && r.nextCursor.length <= 512)
    ) ||
    !natural(r.examined) ||
    r.examined > 1000 ||
    !natural(r.skippedUnadopted) ||
    r.skippedUnadopted > r.examined
  )
    return false
  const filter = canonicalSessionFilter(p.filter)
  const ids = new Set<string>()
  for (const value of r.items) {
    const item = record(value)
    if (
      !item ||
      !validIdentifier(item.sessionId) ||
      ids.has(item.sessionId) ||
      !natural(item.createdAt) ||
      typeof item.isSeeded !== 'boolean' ||
      !natural(item.inheritedEventCount) ||
      !optionalText(item.parentSession) ||
      !optionalText(item.agentPreset) ||
      !(item.origin === undefined || item.origin === 'subagent') ||
      (filter.parentSession !== undefined &&
        item.parentSession !== filter.parentSession) ||
      (filter.agentPreset !== undefined &&
        item.agentPreset !== filter.agentPreset) ||
      (filter.origin !== undefined && item.origin !== filter.origin) ||
      (filter.isSeeded !== undefined && item.isSeeded !== filter.isSeeded) ||
      (filter.createdAfter !== undefined &&
        item.createdAt < filter.createdAfter) ||
      (filter.createdBefore !== undefined &&
        item.createdAt >= filter.createdBefore)
    )
      return false
    ids.add(item.sessionId)
  }
  return true
}

function validTrace(
  r: Record<string, unknown>,
  p: Record<string, unknown>
): boolean {
  const root = record(r.root)
  const expected =
    p.approvalId !== undefined
      ? { kind: 'approval', id: p.approvalId }
      : { kind: 'operationKey', id: p.operationKey }
  if (
    !root ||
    root.kind !== expected.kind ||
    root.id !== expected.id ||
    !Array.isArray(r.links) ||
    r.links.length > 100 ||
    !Array.isArray(r.gaps) ||
    typeof r.truncated !== 'boolean'
  )
    return false
  const observed = record(r.observed)
  if (
    !observed ||
    !Object.entries(observed).every(
      ([key, value]) =>
        ['approval', 'effect', 'events'].includes(key) &&
        typeof value === 'string' &&
        !Number.isNaN(Date.parse(value))
    )
  )
    return false
  const linksOk = r.links.every((value: unknown) => {
    const link = record(value)
    if (!link) return false
    switch (link.kind) {
      case 'approval':
        return (
          text(link.approvalId) &&
          text(link.status) &&
          optionalText(link.executionRef) &&
          optionalText(link.originSessionId)
        )
      case 'effect':
        return (
          text(link.operationKey) &&
          text(link.state) &&
          optionalText(link.executionRef)
        )
      case 'event':
        return (
          text(link.sessionId) &&
          natural(link.sequence) &&
          link.sequence >= 1 &&
          text(link.eventId) &&
          text(link.type) &&
          text(link.correlationId) &&
          optionalText(link.toolId) &&
          optionalText(link.outcome) &&
          typeof link.inherited === 'boolean'
        )
      default:
        return false
    }
  })
  const gapsOk = r.gaps.every((value: unknown) => {
    const gap = record(value)
    if (!gap || typeof gap.reason !== 'string' || !GAP_REASONS.has(gap.reason))
      return false
    if (gap.subject === undefined) return true
    const subject = record(gap.subject)
    return !!subject && text(subject.kind) && text(subject.id)
  })
  // a truncated trace says which budget; a complete one never claims it
  const exhausted = r.gaps.some(
    (g: unknown) => record(g)?.reason === 'budget_exhausted'
  )
  return linksOk && gapsOk && r.truncated === exhausted
}

/** Validation precedes settlement; returns the unmodified result. */
export function validateResult<M extends SdkMethod>(
  request: JsonRpcRequest & { readonly method: M },
  value: unknown,
  expectedTenantId?: string
): Results[M] {
  if (!validResult(request, value, expectedTenantId))
    throw new Error('Invalid SDK result')
  return value as Results[M]
}

export function validateCorrelatedResponse(
  request: JsonRpcRequest,
  response: unknown,
  expectedTenantId?: string
): asserts response is JsonRpcResponse {
  if (
    !isResponse(response) ||
    response.id !== request.id ||
    typeof response.id !== typeof request.id
  )
    throw new Error('Invalid SDK response')
  if (
    'result' in response &&
    (!isSdkMethod(request.method) ||
      !validResult(request, response.result, expectedTenantId))
  )
    throw new Error('Invalid SDK result')
}
