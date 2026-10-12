import type { SessionEvent } from '@cvg/harness-contracts'
import {
  SDK_PROTOCOL_VERSION,
  type JsonRpcRequest,
  type JsonRpcResponse,
  type SdkHelloResult,
  type SessionEventsResult,
  type SessionOpenResult,
  type TurnSendResult
} from './protocol.ts'
import type { SdkServer } from './server.ts'

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
}

export function createInProcessTransport(server: SdkServer): SdkTransport {
  return { request: (request) => server.dispatch(request) }
}

export function createSdkClient(transport: SdkTransport): SdkClient {
  let nextRequestId = 1
  async function call(method: string, params?: unknown): Promise<unknown> {
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: nextRequestId++,
      method,
      ...(params !== undefined ? { params } : {})
    }
    const response = await transport.request(request)
    if ('error' in response) {
      throw new SdkClientError(
        response.error.code,
        response.error.message,
        response.error.data
      )
    }
    return response.result
  }
  return {
    protocolVersion: SDK_PROTOCOL_VERSION,
    hello: async () =>
      (await call('sdk.hello', {
        protocolVersion: SDK_PROTOCOL_VERSION
      })) as SdkHelloResult,
    openSession: async (sessionId) =>
      (await call('session.open', { sessionId })) as SessionOpenResult,
    sendTurn: async (userMessage, sessionId) =>
      (await call('turn.send', {
        ...(sessionId !== undefined ? { sessionId } : {}),
        userMessage
      })) as TurnSendResult,
    readEvents: async (sessionId, options = {}) => {
      const result = (await call('session.events', {
        sessionId,
        ...options
      })) as SessionEventsResult
      return result.events
    }
  }
}
