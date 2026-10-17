import { STOP_REASONS } from '@cvg/harness-contracts'
import { validateSessionEvent } from '@cvg/harness'
import {
  SDK_METHODS,
  SDK_PROTOCOL_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type SdkMethod,
  type SdkHelloResult,
  type SessionOpenResult,
  type TurnSendResult,
  type SessionEventsResult
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
          (m: unknown) => typeof m === 'string' && isSdkMethod(m)
        )
      )
        return false
      const methods = new Set(c.methods)
      return (
        methods.size === c.methods.length &&
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
    default:
      return false
  }
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
