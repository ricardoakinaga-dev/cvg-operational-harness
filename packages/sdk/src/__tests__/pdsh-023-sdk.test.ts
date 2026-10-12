import { describe, expect, it, vi } from 'vitest'
import { canonicalizeJson } from '@cvg/harness-contracts'
import type {
  ApprovalEngine,
  ModelGateway,
  PolicyEngine
} from '@cvg/harness-contracts'
import {
  SDK_ERROR_CODES,
  SDK_METHODS,
  SDK_PROTOCOL_VERSION,
  SdkClientError,
  createSdk,
  createSdkMinimal,
  createSdkServer
} from '../index.ts'

const TENANT = 'sdk_tenant_synthetic'

function deterministicGateway(
  complete: ModelGateway['complete']
): ModelGateway {
  return { complete }
}

const defaultGateway = deterministicGateway(async () => ({
  text: 'synthetic reply',
  provider: 'deterministic',
  model: 'deterministic-v1',
  inputTokens: 2,
  outputTokens: 3,
  costUsd: 0
}))

const allowPolicy: PolicyEngine = {
  evaluate: async () => ({
    outcome: 'ALLOW',
    reason: 'sdk synthetic policy',
    policyVersion: 'sdk-synthetic-1'
  })
}

const denyApprovals: ApprovalEngine = {
  request: async () => ({
    status: 'DENIED',
    reason: 'sdk synthetic approvals never execute effects'
  })
}

function deterministicIds(prefix: string) {
  let index = 0
  return () => `${prefix}_${(index += 1)}`
}

function fixture() {
  return createSdk({
    tenantId: TENANT,
    modelGateway: defaultGateway,
    policy: allowPolicy,
    approvals: denyApprovals,
    clock: () => new Date('2026-10-12T00:00:00.000Z'),
    newEventId: deterministicIds('event'),
    newCorrelationId: () => 'corr_sdk_synthetic',
    newTraceId: () => 'trace_sdk_synthetic'
  })
}

describe('PDSH-023 SDK protocol v1', () => {
  it('negotiates the protocol version and advertises capabilities', async () => {
    const sdk = fixture()
    const hello = await sdk.hello()
    expect(hello.protocolVersion).toBe(SDK_PROTOCOL_VERSION)
    expect(hello.capabilities).toEqual({
      sessions: true,
      events: true,
      methods: SDK_METHODS
    })
    expect(sdk.server.capabilities.sessions).toBe(true)
  })

  it('rejects unknown protocol versions with a stable code', async () => {
    const sdk = fixture()
    const response = await sdk.server.dispatch({
      jsonrpc: '2.0',
      id: 1,
      method: 'sdk.hello',
      params: { protocolVersion: 2 }
    })
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: SDK_ERROR_CODES.unsupported_protocol_version,
        message: 'Unsupported protocol version 2'
      }
    })
  })

  it('never rejects and maps malformed envelopes, methods and params', async () => {
    const server = createSdkServer({
      tenantId: TENANT,
      modelGateway: defaultGateway,
      policy: allowPolicy,
      approvals: denyApprovals
    })
    for (const payload of [
      null,
      'text',
      [],
      {},
      { jsonrpc: '1.0', id: 1, method: 'sdk.hello' }
    ]) {
      await expect(server.dispatch(payload)).resolves.toMatchObject({
        error: { code: SDK_ERROR_CODES.invalid_request }
      })
    }
    await expect(
      server.dispatch({ jsonrpc: '2.0', id: 'a', method: 'unknown.method' })
    ).resolves.toMatchObject({
      error: { code: SDK_ERROR_CODES.method_not_found }
    })
    await expect(
      server.dispatch({
        jsonrpc: '2.0',
        id: 2,
        method: 'turn.send',
        params: {}
      })
    ).resolves.toMatchObject({
      error: { code: SDK_ERROR_CODES.invalid_params }
    })
    await expect(
      server.dispatch({
        jsonrpc: '2.0',
        id: 3,
        method: 'turn.send',
        params: { sessionId: 'open', userMessage: '' }
      })
    ).resolves.toMatchObject({
      error: { code: SDK_ERROR_CODES.invalid_params }
    })
  })

  it('opens a session, sends a turn and observes the immutable event sequence', async () => {
    const sdk = fixture()
    await sdk.openSession('session-sdk')
    const turn = await sdk.sendTurn('session-sdk', 'synthetic question')
    expect(turn).toMatchObject({
      stopReason: 'COMPLETED',
      response: 'synthetic reply',
      modelCalls: 1,
      toolCalls: 0,
      sessionId: 'session-sdk'
    })
    const events = await sdk.readEvents('session-sdk')
    expect(events.map((event) => event.type)).toEqual([
      'message/user',
      'turn/start',
      'model/request',
      'model/result',
      'turn/end',
      'message/assistant'
    ])
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6])
    expect(events.every((event) => event.sessionId === 'session-sdk')).toBe(
      true
    )
    expect(events[0]?.payload).toEqual({ text: 'synthetic question' })
    expect(events[5]?.payload).toEqual({ text: 'synthetic reply' })
    const page = await sdk.readEvents('session-sdk', { afterSequence: 4 })
    expect(page.map((event) => event.sequence)).toEqual([5, 6])
  })

  it('fails closed for an unopened session and for the minimal composition', async () => {
    const sdk = fixture()
    await expect(sdk.sendTurn('missing', 'hello')).rejects.toMatchObject({
      code: SDK_ERROR_CODES.session_not_found
    })
    const minimal = createSdkMinimal({
      tenantId: TENANT,
      modelGateway: defaultGateway,
      policy: allowPolicy,
      approvals: denyApprovals
    })
    const hello = await minimal.hello()
    expect(hello.capabilities.sessions).toBe(false)
    expect(hello.capabilities.methods).toEqual(['sdk.hello', 'turn.send'])
    await expect(
      minimal.server.dispatch({
        jsonrpc: '2.0',
        id: 1,
        method: 'session.open',
        params: { sessionId: 'anything' }
      })
    ).resolves.toMatchObject({
      error: { code: SDK_ERROR_CODES.capability_not_available }
    })
    await expect(
      minimal.server.dispatch({
        jsonrpc: '2.0',
        id: 2,
        method: 'session.events',
        params: { sessionId: 'anything' }
      })
    ).resolves.toMatchObject({
      error: { code: SDK_ERROR_CODES.capability_not_available }
    })
    const turn = await minimal.sendTurn('stateless question')
    expect(turn.stopReason).toBe('COMPLETED')
    expect(turn.sessionId).toBeUndefined()
  })

  it('keeps a failing runtime as a fail-closed MODEL_FAILURE result', async () => {
    const sdk = createSdk({
      tenantId: TENANT,
      modelGateway: deterministicGateway(async () => {
        throw new Error('synthetic provider outage')
      }),
      policy: allowPolicy,
      approvals: denyApprovals
    })
    await sdk.openSession('session-failure')
    const turn = await sdk.sendTurn('session-failure', 'will fail')
    expect(turn.stopReason).toBe('MODEL_FAILURE')
    const events = await sdk.readEvents('session-failure')
    expect(events.map((event) => event.type)).toEqual([
      'message/user',
      'turn/start',
      'model/request',
      'turn/end'
    ])
  })

  it('exposes a typed client error for JSON-RPC failures', async () => {
    const transport = {
      request: vi.fn(async () => ({
        jsonrpc: '2.0' as const,
        id: 1,
        error: { code: 42, message: 'synthetic failure', data: { hint: true } }
      }))
    }
    const { createSdkClient } = await import('../client.ts')
    const client = createSdkClient(transport)
    const error = await client.hello().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(SdkClientError)
    expect(error).toMatchObject({ code: 42, data: { hint: true } })
  })

  it('is deterministic with injected clock and identifiers', async () => {
    const first = fixture()
    const second = fixture()
    await first.openSession('session-a')
    await second.openSession('session-b')
    await first.sendTurn('session-a', 'same input')
    await second.sendTurn('session-b', 'same input')
    const firstEvents = await first.readEvents('session-a')
    const secondEvents = await second.readEvents('session-b')
    const canonical = (events: readonly { sessionId: string }[]) =>
      canonicalizeJson(events.map((event) => ({ ...event, sessionId: 'x' })))
    expect(canonical(secondEvents)).toBe(canonical(firstEvents))
  })
})
