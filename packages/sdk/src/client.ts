import type { SessionEvent } from '@cvg/harness-contracts'
import {
  SDK_PROTOCOL_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type SdkHelloResult,
  type SessionOpenResult,
  type SdkMethod,
  type SessionListParams,
  type SessionListResult,
  type SessionTraceParams,
  type SessionTraceResult,
  type TurnSendResult
} from './protocol.ts'
import type { SdkServer } from './server.ts'
import { validateCorrelatedResponse, validateResult } from './validators.ts'

/** Host-owned transport; this package never opens a socket itself. */
export interface SdkTransport {
  request(request: JsonRpcRequest): Promise<JsonRpcResponse>
}

export class SdkClientError extends Error {
  readonly code: number
  readonly data: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'SdkClientError'
    this.code = code
    this.data = data
  }
}

export interface SdkReadEventsOptions {
  readonly afterSequence?: number
  readonly limit?: number
}

export interface SdkClient {
  readonly protocolVersion: number
  hello(): Promise<SdkHelloResult>
  openSession(sessionId: string): Promise<SessionOpenResult>
  sendTurn(userMessage: string, sessionId?: string): Promise<TurnSendResult>
  readEvents(
    sessionId: string,
    options?: SdkReadEventsOptions
  ): Promise<readonly SessionEvent[]>
  /** SPEC 0295: only when `hello()` advertises `session.list`. */
  listSessions(params?: SessionListParams): Promise<SessionListResult>
  /** SPEC 0295: exactly one of `approvalId` and `operationKey`. */
  traceSession(params: SessionTraceParams): Promise<SessionTraceResult>
}

export function createInProcessTransport(server: SdkServer): SdkTransport {
  return { request: (request) => server.dispatch(request) }
}

export function createSdkClient(transport: SdkTransport): SdkClient {
  let nextRequestId = 1
  async function call<M extends SdkMethod>(method: M, params?: unknown) {
    const request: JsonRpcRequest & { readonly method: M } = {
      jsonrpc: '2.0',
      id: nextRequestId++,
      method,
      ...(params !== undefined ? { params } : {})
    }
    const response = await transport.request(request)
    try {
      validateCorrelatedResponse(request, response)
    } catch {
      throw new SdkClientError(-32085, 'Invalid SDK response')
    }
    if ('error' in response) {
      throw new SdkClientError(
        response.error.code,
        response.error.message,
        response.error.data
      )
    }
    return validateResult(request, response.result)
  }
  return {
    protocolVersion: SDK_PROTOCOL_VERSION,
    hello: async () =>
      await call('sdk.hello', {
        protocolVersion: SDK_PROTOCOL_VERSION
      }),
    openSession: async (sessionId) => await call('session.open', { sessionId }),
    sendTurn: async (userMessage, sessionId) =>
      await call('turn.send', {
        ...(sessionId !== undefined ? { sessionId } : {}),
        userMessage
      }),
    readEvents: async (sessionId, options = {}) => {
      const result = await call('session.events', {
        sessionId,
        ...options
      })
      return result.events
    },
    listSessions: async (params = {}) => await call('session.list', params),
    traceSession: async (params) => await call('session.trace', params)
  }
}
