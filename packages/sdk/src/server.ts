import { randomUUID } from 'node:crypto'
import {
  SessionEventError,
  canonicalSessionFilter,
  createOperationalHarness,
  createSessionKernelLog,
  decodeSessionCursor,
  sessionListLimit
} from '@cvg/harness'
import type {
  AgentProfile,
  ApprovalEngine,
  AuditSink,
  ConversationId,
  CorrelationId,
  ExecutionBudget,
  ModelGateway,
  PolicyEngine,
  RuntimeInput,
  RuntimeResult,
  SessionEvent,
  SessionEventStore,
  SessionId,
  SessionQuery,
  TelemetrySink,
  TenantId,
  ToolRegistry,
  TraceId
} from '@cvg/harness-contracts'
import {
  SDK_ERROR_CODES,
  SDK_METHODS,
  SDK_PROTOCOL_VERSION,
  type JsonRpcFailure,
  type JsonRpcResponse,
  type JsonRpcSuccess,
  type SdkCapabilities
} from './protocol.ts'
import {
  isRequest,
  projectSessionList,
  projectSessionTrace,
  validRpcId
} from './validators.ts'

/** Deterministic fallback budget for one SDK turn. */
export const SDK_DEFAULT_BUDGET: ExecutionBudget = {
  maxSteps: 4,
  maxModelCalls: 2,
  maxToolCalls: 2,
  maxDurationMs: 30_000,
  maxCostUsd: 1,
  maxTokens: 4_000
}

const NOOP_AUDIT: AuditSink = { append: async () => {} }
const NOOP_TELEMETRY: TelemetrySink = { record: () => {} }
const EMPTY_TOOLS: ToolRegistry = { list: () => [], resolve: () => undefined }

const MAX_ID_LENGTH = 200
const MAX_MESSAGE_BYTES = 64 * 1024

export interface SdkServerOptions {
  /** Trusted composition binding; never taken from the request. */
  readonly tenantId: string
  /** Default agent profile; branded fields are completed by the server. */
  readonly agent?: Partial<AgentProfile>
  readonly modelGateway: ModelGateway
  /** Governance stays visible: policy and approvals are required. */
  readonly policy: PolicyEngine
  readonly approvals: ApprovalEngine
  readonly tools?: ToolRegistry
  readonly audit?: AuditSink
  readonly telemetry?: TelemetrySink
  /** Enables `session.open`/`session.events` when provided. */
  readonly sessions?: SessionEventStore
  /**
   * Enables `session.list`/`session.trace` (SPEC 0295). The port is bound to this composition's
   * tenant by the host; it is never exposed to a transport without that decision (D8).
   */
  readonly sessionQuery?: SessionQuery
  readonly budget?: ExecutionBudget
  readonly clock?: () => Date
  readonly newEventId?: () => string
  readonly newCorrelationId?: () => string
  readonly newTraceId?: () => string
}

export interface SdkServer {
  readonly capabilities: SdkCapabilities
  /** Never rejects: every failure becomes a JSON-RPC error response. */
  dispatch(payload: unknown): Promise<JsonRpcResponse>
}

class SdkRequestError extends Error {
  readonly code: number

  constructor(code: number, message: string) {
    super(message)
    this.name = 'SdkRequestError'
    this.code = code
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  return value as Record<string, unknown>
}

function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    !value.includes('\u0000')
  )
}

export function createSdkServer(options: SdkServerOptions): SdkServer {
  if (!validId(options.tenantId)) {
    throw new Error('SDK composition requires a tenantId (1..200 chars)')
  }
  const clock = options.clock ?? (() => new Date())
  const newEventId = options.newEventId ?? randomUUID
  const newCorrelationId =
    options.newCorrelationId ?? (() => `sdk_correlation_${randomUUID()}`)
  const newTraceId = options.newTraceId ?? (() => `sdk_trace_${randomUUID()}`)
  const sessions = options.sessions
  const sessionQuery = options.sessionQuery
  const budget = options.budget ?? SDK_DEFAULT_BUDGET
  const tools = options.tools ?? EMPTY_TOOLS
  const audit = options.audit ?? NOOP_AUDIT
  const telemetry = options.telemetry ?? NOOP_TELEMETRY
  const agent = {
    id: 'sdk-agent',
    version: 'v1',
    objective: 'Answer the caller through the governed harness.',
    instructions: [],
    skills: [],
    tools: [],
    policies: [],
    ...options.agent
  } as AgentProfile
  const capabilities: SdkCapabilities = {
    sessions: sessions !== undefined,
    events: sessions !== undefined,
    methods: SDK_METHODS.filter((method) => {
      if (method === 'sdk.hello' || method === 'turn.send') return true
      if (method === 'session.list' || method === 'session.trace')
        return sessionQuery !== undefined
      return sessions !== undefined
    })
  }

  function requestError(code: number, message: string): SdkRequestError {
    return new SdkRequestError(code, message)
  }

  function mapSessionError(error: unknown): SdkRequestError {
    if (error instanceof SessionEventError) {
      switch (error.code) {
        case 'session_not_open':
          return requestError(
            SDK_ERROR_CODES.session_not_found,
            'Session is not open'
          )
        case 'invalid_session_event':
          return requestError(
            SDK_ERROR_CODES.invalid_params,
            'Invalid session event'
          )
        default:
          return requestError(
            SDK_ERROR_CODES.internal_error,
            'Session store failed'
          )
      }
    }
    return requestError(SDK_ERROR_CODES.internal_error, 'Session store failed')
  }

  async function handleHello(params: unknown): Promise<unknown> {
    const record = asRecord(params)
    if (!record || typeof record.protocolVersion !== 'number') {
      throw requestError(
        SDK_ERROR_CODES.invalid_params,
        'sdk.hello requires a numeric protocolVersion'
      )
    }
    if (record.protocolVersion !== SDK_PROTOCOL_VERSION) {
      throw requestError(
        SDK_ERROR_CODES.unsupported_protocol_version,
        `Unsupported protocol version ${record.protocolVersion}`
      )
    }
    return { protocolVersion: SDK_PROTOCOL_VERSION, capabilities }
  }

  async function handleOpenSession(params: unknown): Promise<unknown> {
    if (sessions === undefined) {
      throw requestError(
        SDK_ERROR_CODES.capability_not_available,
        'session.open requires a composition with sessions'
      )
    }
    const record = asRecord(params)
    const sessionId = record?.sessionId
    if (!validId(sessionId)) {
      throw requestError(
        SDK_ERROR_CODES.invalid_params,
        'session.open requires sessionId (1..200 chars)'
      )
    }
    try {
      await sessions.openSession({
        tenantId: options.tenantId,
        sessionId,
        formatVersion: 1
      })
    } catch (error) {
      throw mapSessionError(error)
    }
    return { sessionId, formatVersion: 1 }
  }

  async function handleTurnSend(params: unknown): Promise<unknown> {
    const record = asRecord(params)
    const userMessage = record?.userMessage
    if (
      typeof userMessage !== 'string' ||
      userMessage.trim().length === 0 ||
      Buffer.byteLength(userMessage, 'utf8') > MAX_MESSAGE_BYTES
    ) {
      throw requestError(
        SDK_ERROR_CODES.invalid_params,
        'turn.send requires userMessage (up to 64 KiB)'
      )
    }
    const rawSessionId = record?.sessionId
    if (rawSessionId !== undefined && !validId(rawSessionId)) {
      throw requestError(
        SDK_ERROR_CODES.invalid_params,
        'turn.send sessionId must be a non-empty string'
      )
    }
    if (sessions !== undefined && rawSessionId === undefined) {
      throw requestError(
        SDK_ERROR_CODES.invalid_params,
        'turn.send requires sessionId when sessions are enabled'
      )
    }
    const sessionId =
      typeof rawSessionId === 'string' ? rawSessionId : undefined
    const correlationId = newCorrelationId()
    const traceId = newTraceId()
    const timestamp = clock().toISOString()
    if (sessions !== undefined && sessionId !== undefined) {
      try {
        await sessions.append({
          tenantId: options.tenantId,
          sessionId,
          formatVersion: 1,
          eventId: newEventId(),
          timestamp,
          correlationId,
          traceId,
          type: 'message/user',
          payload: { text: userMessage }
        })
      } catch (error) {
        throw mapSessionError(error)
      }
    }
    const log =
      sessions !== undefined && sessionId !== undefined
        ? createSessionKernelLog({
            store: sessions,
            tenantId: options.tenantId,
            sessionId,
            formatVersion: 1,
            traceId,
            correlationId,
            eventId: newEventId,
            clock
          })
        : undefined
    const harness = createOperationalHarness({
      modelGateway: options.modelGateway,
      policy: options.policy,
      approvals: options.approvals,
      tools,
      audit,
      telemetry,
      ...(log !== undefined ? { log } : {})
    })
    const input: RuntimeInput = {
      agent,
      tenantId: options.tenantId as TenantId,
      conversationId: (sessionId ??
        `sdk_conversation_${correlationId}`) as ConversationId,
      sessionId: (sessionId ?? `sdk_session_${correlationId}`) as SessionId,
      correlationId: correlationId as CorrelationId,
      traceId: traceId as TraceId,
      userMessage,
      context: { values: {}, sourceIds: [], capturedAt: timestamp },
      state: { version: 0, values: {}, updatedAt: timestamp },
      budget,
      runtimeProfile: 'single_pass'
    }
    let result: RuntimeResult
    try {
      result = await harness.execute(input)
    } catch {
      throw requestError(SDK_ERROR_CODES.internal_error, 'Runtime failed')
    }
    if (
      sessions !== undefined &&
      sessionId !== undefined &&
      result.stopReason === 'COMPLETED'
    ) {
      try {
        await sessions.append({
          tenantId: options.tenantId,
          sessionId,
          formatVersion: 1,
          eventId: newEventId(),
          timestamp: clock().toISOString(),
          correlationId,
          traceId,
          type: 'message/assistant',
          payload: { text: result.response }
        })
      } catch (error) {
        throw mapSessionError(error)
      }
    }
    return {
      stopReason: result.stopReason,
      response: result.response,
      modelCalls: result.modelCalls,
      toolCalls: result.toolCalls,
      usage: result.usage,
      ...(sessionId !== undefined ? { sessionId } : {})
    }
  }

  async function handleSessionEvents(params: unknown): Promise<unknown> {
    if (sessions === undefined) {
      throw requestError(
        SDK_ERROR_CODES.capability_not_available,
        'session.events requires a composition with sessions'
      )
    }
    const record = asRecord(params)
    const sessionId = record?.sessionId
    if (!validId(sessionId)) {
      throw requestError(
        SDK_ERROR_CODES.invalid_params,
        'session.events requires sessionId (1..200 chars)'
      )
    }
    const afterSequence = record?.afterSequence ?? 0
    const limit = record?.limit ?? 100
    if (
      typeof afterSequence !== 'number' ||
      !Number.isSafeInteger(afterSequence) ||
      afterSequence < 0 ||
      typeof limit !== 'number' ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 500
    ) {
      throw requestError(
        SDK_ERROR_CODES.invalid_params,
        'session.events accepts afterSequence >= 0 and limit 1..500'
      )
    }
    let events: readonly SessionEvent[]
    try {
      events = await sessions.read({
        tenantId: options.tenantId,
        sessionId,
        afterSequence,
        limit
      })
    } catch (error) {
      throw mapSessionError(error)
    }
    return { events }
  }

  /** The ports throw their own error class or a plain one; only the code is read, never the text. */
  function mapQueryError(error: unknown): SdkRequestError {
    const code = asRecord(error)?.code
    switch (code) {
      case 'invalid_params':
      case 'invalid_cursor':
        return requestError(
          SDK_ERROR_CODES.invalid_params,
          'Invalid session query parameters'
        )
      case 'not_found':
        return requestError(SDK_ERROR_CODES.session_not_found, 'Not found')
      case 'unsupported':
        return requestError(
          SDK_ERROR_CODES.capability_not_available,
          'Session query is not available'
        )
      default:
        return requestError(
          SDK_ERROR_CODES.internal_error,
          'Session query failed'
        )
    }
  }

  function queryPort(method: string): SessionQuery {
    if (sessionQuery === undefined) {
      throw requestError(
        SDK_ERROR_CODES.capability_not_available,
        `${method} requires a composition with a session query port`
      )
    }
    return sessionQuery
  }

  /** Strict object: no key outside `allowed`; a refusal never reaches the port. */
  function queryParams(
    method: string,
    params: unknown,
    allowed: readonly string[]
  ): Record<string, unknown> {
    const record = asRecord(params)
    if (
      record === undefined ||
      Object.keys(record).some((k) => !allowed.includes(k))
    ) {
      throw requestError(
        SDK_ERROR_CODES.invalid_params,
        `${method} accepts only ${allowed.join(', ')}`
      )
    }
    return record
  }

  async function handleSessionList(params: unknown): Promise<unknown> {
    const port = queryPort('session.list')
    const record = queryParams('session.list', params, [
      'filter',
      'cursor',
      'limit'
    ])
    let input
    try {
      const filter = canonicalSessionFilter(record.filter)
      const limit = sessionListLimit(record.limit)
      if (record.cursor !== undefined) {
        if (typeof record.cursor !== 'string')
          throw requestError(SDK_ERROR_CODES.invalid_params, 'cursor')
        decodeSessionCursor(record.cursor, filter, options.tenantId)
      }
      input = {
        filter,
        limit,
        ...(record.cursor !== undefined ? { cursor: record.cursor } : {})
      }
    } catch (error) {
      throw error instanceof SdkRequestError ? error : mapQueryError(error)
    }
    try {
      return projectSessionList(await port.list(input))
    } catch (error) {
      throw mapQueryError(error)
    }
  }

  async function handleSessionTrace(params: unknown): Promise<unknown> {
    const port = queryPort('session.trace')
    const record = queryParams('session.trace', params, [
      'approvalId',
      'operationKey'
    ])
    const roots = [record.approvalId, record.operationKey].filter(
      (v) => v !== undefined
    )
    const root = roots[0]
    if (
      roots.length !== 1 ||
      typeof root !== 'string' ||
      root.length < 1 ||
      root.length > 4096 ||
      root.includes('\u0000')
    ) {
      throw requestError(
        SDK_ERROR_CODES.invalid_params,
        'session.trace needs exactly one of approvalId and operationKey'
      )
    }
    try {
      return projectSessionTrace(
        await port.trace(
          record.approvalId !== undefined
            ? { approvalId: root }
            : { operationKey: root }
        )
      )
    } catch (error) {
      throw mapQueryError(error)
    }
  }

  function success(id: string | number, result: unknown): JsonRpcSuccess {
    return { jsonrpc: '2.0', id, result }
  }

  function failure(
    id: string | number | null,
    code: number,
    message: string
  ): JsonRpcFailure {
    return { jsonrpc: '2.0', id, error: { code, message } }
  }

  return {
    capabilities,
    async dispatch(payload: unknown): Promise<JsonRpcResponse> {
      const record = asRecord(payload)
      const id = record && validRpcId(record.id) ? record.id : null
      if (!isRequest(payload)) {
        return failure(
          id,
          SDK_ERROR_CODES.invalid_request,
          'Invalid JSON-RPC request'
        )
      }
      const handlers: Record<string, (params: unknown) => Promise<unknown>> = {
        'sdk.hello': handleHello,
        'session.open': handleOpenSession,
        'turn.send': handleTurnSend,
        'session.events': handleSessionEvents,
        'session.list': handleSessionList,
        'session.trace': handleSessionTrace
      }
      const handler = Object.hasOwn(handlers, payload.method)
        ? handlers[payload.method]
        : undefined
      if (!handler) {
        return failure(id, SDK_ERROR_CODES.method_not_found, 'Unknown method')
      }
      try {
        return success(payload.id, await handler(payload.params))
      } catch (error) {
        if (error instanceof SdkRequestError) {
          return failure(id, error.code, error.message)
        }
        return failure(id, SDK_ERROR_CODES.internal_error, 'Internal error')
      }
    }
  }
}
