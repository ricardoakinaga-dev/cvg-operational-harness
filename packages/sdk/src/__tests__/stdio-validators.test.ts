// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { materializeSessionEvent } from '@cvg/harness'
import {
  SDK_METHODS,
  SdkClientError,
  createSdkClient,
  type JsonRpcRequest
} from '../index.ts'
import { validateCorrelatedResponse } from '../validators.ts'

const hello: JsonRpcRequest = {
  jsonrpc: '2.0',
  id: 1,
  method: 'sdk.hello',
  params: { protocolVersion: 1 }
}
const helloResult = {
  protocolVersion: 1,
  capabilities: { sessions: true, events: true, methods: [...SDK_METHODS] }
}
const turn: JsonRpcRequest = {
  jsonrpc: '2.0',
  id: 2,
  method: 'turn.send',
  params: { sessionId: 's', userMessage: 'synthetic' }
}
const turnResult = {
  stopReason: 'COMPLETED',
  response: 'Olá 🌿',
  modelCalls: 1,
  toolCalls: 0,
  usage: { inputTokens: 3, outputTokens: 4, costUsd: 0 },
  sessionId: 's'
}
const read: JsonRpcRequest = {
  jsonrpc: '2.0',
  id: 3,
  method: 'session.events',
  params: { sessionId: 's', afterSequence: 2, limit: 2 }
}
const event = (sequence = 3, eventId = 'e') =>
  materializeSessionEvent(
    {
      tenantId: 't',
      sessionId: 's',
      formatVersion: 1,
      eventId,
      timestamp: '2026-10-14T00:00:00.000Z',
      correlationId: 'c',
      traceId: 'trace',
      type: 'message/user',
      payload: { text: 'synthetic' }
    },
    sequence
  )
const success = (request: JsonRpcRequest, result: unknown) => ({
  jsonrpc: '2.0',
  id: request.id,
  result
})

describe('SPEC0211 correlated result validators, unmodified good and tampered bad fixtures', () => {
  it('accepts public v1 results and filtered noncontiguous sequence without normalization', () => {
    for (const [request, result] of [
      [hello, helloResult],
      [turn, turnResult],
      [read, { events: [event(3), event(5, 'e2')] }]
    ] as const) {
      const response = success(request, result)
      expect(() =>
        validateCorrelatedResponse(request, response, 't')
      ).not.toThrow()
      expect(response.result).toBe(result)
    }
  })

  it.each([
    ['version', { ...helloResult, protocolVersion: 2 }],
    [
      'sessions type',
      {
        ...helloResult,
        capabilities: { ...helloResult.capabilities, sessions: 1 }
      }
    ],
    [
      'events implies sessions',
      {
        ...helloResult,
        capabilities: {
          sessions: false,
          events: true,
          methods: ['sdk.hello', 'turn.send', 'session.events']
        }
      }
    ],
    [
      'duplicate methods',
      {
        ...helloResult,
        capabilities: {
          ...helloResult.capabilities,
          methods: [...SDK_METHODS, 'sdk.hello']
        }
      }
    ],
    [
      'unknown method',
      {
        ...helloResult,
        capabilities: {
          ...helloResult.capabilities,
          methods: [...SDK_METHODS, 'toString']
        }
      }
    ],
    [
      'missing turn',
      {
        ...helloResult,
        capabilities: {
          ...helloResult.capabilities,
          methods: ['sdk.hello', 'session.open', 'session.events']
        }
      }
    ],
    [
      'missing session',
      {
        ...helloResult,
        capabilities: {
          ...helloResult.capabilities,
          methods: ['sdk.hello', 'turn.send', 'session.events']
        }
      }
    ],
    [
      'unexpected events',
      {
        ...helloResult,
        capabilities: { ...helloResult.capabilities, events: false }
      }
    ],
    ['array result', []]
  ])('rejects hello %s', (_label, result) => {
    expect(() =>
      validateCorrelatedResponse(hello, success(hello, result), 't')
    ).toThrow()
  })

  it.each([
    ['stop vocabulary', { ...turnResult, stopReason: 'RETRY_ME' }],
    ['response type', { ...turnResult, response: 42 }],
    ['model counter', { ...turnResult, modelCalls: -1 }],
    ['tool counter', { ...turnResult, toolCalls: 1.5 }],
    [
      'unsafe counter',
      { ...turnResult, modelCalls: Number.MAX_SAFE_INTEGER + 1 }
    ],
    [
      'negative tokens',
      { ...turnResult, usage: { ...turnResult.usage, inputTokens: -1 } }
    ],
    [
      'fraction tokens',
      { ...turnResult, usage: { ...turnResult.usage, outputTokens: 1.5 } }
    ],
    [
      'infinite cost',
      { ...turnResult, usage: { ...turnResult.usage, costUsd: Infinity } }
    ],
    [
      'negative cost',
      { ...turnResult, usage: { ...turnResult.usage, costUsd: -1 } }
    ],
    ['missing usage', { ...turnResult, usage: null }],
    ['session substitution', { ...turnResult, sessionId: 'other' }],
    ['missing session', { ...turnResult, sessionId: undefined }]
  ])('rejects turn %s', (_label, result) => {
    expect(() =>
      validateCorrelatedResponse(turn, success(turn, result), 't')
    ).toThrow()
  })

  it('requires session absent when no session was requested', () => {
    const stateless = { ...turn, params: { userMessage: 'synthetic' } }
    expect(() =>
      validateCorrelatedResponse(stateless, success(stateless, turnResult))
    ).toThrow()
    const { sessionId: _sessionId, ...result } = turnResult
    expect(_sessionId).toBe('s')
    expect(() =>
      validateCorrelatedResponse(stateless, success(stateless, result))
    ).not.toThrow()
  })

  it.each([
    ['wrong tenant', () => [{ ...event(), tenantId: 'other' }]],
    ['wrong session', () => [{ ...event(), sessionId: 'other' }]],
    ['format', () => [{ ...event(), formatVersion: 2 }]],
    ['fingerprint', () => [{ ...event(), schemaFingerprint: '0'.repeat(64) }]],
    ['payload', () => [{ ...event(), payload: { text: 7 } }]],
    ['at cursor', () => [event(2)]],
    ['sequence ordering', () => [event(4), event(3, 'e2')]],
    ['duplicate event id', () => [event(3), event(4)]],
    ['limit', () => [event(3), event(4, 'e2'), event(5, 'e3')]],
    [
      'unsafe sequence',
      () => [{ ...event(), sequence: Number.MAX_SAFE_INTEGER + 1 }]
    ],
    ['unknown property', () => [{ ...event(), clinicalPayload: 'forbidden' }]]
  ])('rejects events %s', (_label, events) => {
    expect(() =>
      validateCorrelatedResponse(read, success(read, { events: events() }), 't')
    ).toThrow()
  })

  it('defaults page length to 100 and cursor to zero', () => {
    const request = { ...read, params: { sessionId: 's' } }
    const events = Array.from({ length: 101 }, (_, i) => event(i + 1, `e${i}`))
    expect(() =>
      validateCorrelatedResponse(request, success(request, { events }), 't')
    ).toThrow()
    expect(() =>
      validateCorrelatedResponse(
        request,
        success(request, { events: events.slice(0, 100) }),
        't'
      )
    ).not.toThrow()
  })

  it.each([
    { sessionId: 'other', formatVersion: 1 },
    { sessionId: 's', formatVersion: 2 }
  ])('correlates session.open %j', (result) => {
    const request = {
      ...hello,
      method: 'session.open',
      params: { sessionId: 's' }
    }
    expect(() =>
      validateCorrelatedResponse(request, success(request, result))
    ).toThrow()
  })

  it.each([
    { jsonrpc: '1.0', id: 1, result: helloResult },
    { jsonrpc: '2.0', id: '1', result: helloResult },
    {
      jsonrpc: '2.0',
      id: 1,
      result: helloResult,
      error: { code: 1, message: 'bad' }
    },
    { jsonrpc: '2.0', id: 1, error: { code: 1.1, message: 'bad' } },
    { jsonrpc: '2.0', id: 1, error: { code: 1, message: '' } },
    { jsonrpc: '2.0', id: 1, error: { code: 1, message: '🌿'.repeat(257) } },
    { jsonrpc: '2.0', id: null, result: helloResult }
  ])('rejects malformed response envelope %j', (response) => {
    expect(() => validateCorrelatedResponse(hello, response)).toThrow()
  })

  it('the in-process client also rejects tampered data as a typed client error', async () => {
    const client = createSdkClient({
      request: async () =>
        success(hello, { ...helloResult, protocolVersion: 99 }) as never
    })
    const failure = await client.hello().catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(SdkClientError)
    expect(failure).toMatchObject({ code: -32085 })
  })
})
