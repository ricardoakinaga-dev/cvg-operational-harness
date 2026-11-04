import type { SessionEvent } from '@cvg/harness-contracts'

/**
 * PDSH-023 / SPEC 0204: versioned JSON-RPC 2.0 protocol for integrator SDKs.
 * The transport is always supplied by the host; this package only defines the
 * envelope, the method vocabulary and the stable error codes.
 */

export const SDK_PROTOCOL_VERSION = 1

export const SDK_METHODS = [
  'sdk.hello',
  'session.open',
  'turn.send',
  'session.events'
] as const
export type SdkMethod = (typeof SDK_METHODS)[number]

export const SDK_ERROR_CODES = {
  parse_error: -32700,
  invalid_request: -32600,
  method_not_found: -32601,
  invalid_params: -32602,
  internal_error: -32603,
  unsupported_protocol_version: 1001,
  session_not_found: 1002,
  capability_not_available: 1003
} as const
export type SdkErrorCode =
  (typeof SDK_ERROR_CODES)[keyof typeof SDK_ERROR_CODES]

export interface JsonRpcRequest {
  readonly jsonrpc: '2.0'
  readonly id: string | number
  readonly method: string
  readonly params?: unknown
}

export interface JsonRpcSuccess {
  readonly jsonrpc: '2.0'
  readonly id: string | number
  readonly result: unknown
}

export interface JsonRpcFailure {
  readonly jsonrpc: '2.0'
  readonly id: string | number | null
  readonly error: {
    readonly code: number
    readonly message: string
    readonly data?: unknown
  }
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure

/** Method vocabulary this server actually registers in the composition. */
export interface SdkCapabilities {
  readonly sessions: boolean
  readonly events: boolean
  readonly methods: readonly SdkMethod[]
}

export interface SdkHelloParams {
  readonly protocolVersion: number
}

export interface SdkHelloResult {
  readonly protocolVersion: number
  readonly capabilities: SdkCapabilities
}

export interface SessionOpenParams {
  readonly sessionId: string
}

export interface SessionOpenResult {
  readonly sessionId: string
  readonly formatVersion: 1
}

export interface TurnSendParams {
  readonly sessionId?: string
  readonly userMessage: string
}

export interface TurnSendResult {
  readonly stopReason: string
  readonly response: string
  readonly modelCalls: number
  readonly toolCalls: number
  readonly usage: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly costUsd: number
  }
  readonly sessionId?: string
}

export interface SessionEventsParams {
  readonly sessionId: string
  readonly afterSequence?: number
  readonly limit?: number
}

export interface SessionEventsResult {
  readonly events: readonly SessionEvent[]
}
