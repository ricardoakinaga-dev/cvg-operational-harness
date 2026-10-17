// @vitest-environment node
import { PassThrough, Writable } from 'node:stream'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  InMemorySessionEventStore,
  SessionEventError,
  createOperationalHarness
} from '@cvg/harness'
import type {
  SessionEventStore,
  RuntimeInput,
  ToolDefinition,
  PolicyEngine,
  ApprovalEngine
} from '@cvg/harness-contracts'
import {
  runSdkStdioExample,
  shutdownSdkChild
} from '../../../../examples/consumers/sdk-stdio/index.mts'
import {
  SDK_METHODS,
  SDK_TRANSPORT_ERROR_CODES,
  SdkWireError,
  createSdk,
  createSdkClient,
  createSdkServer,
  createStdioSdkTransport,
  serveStdioSdk,
  type JsonRpcRequest,
  type SdkServer,
  type StdioServerOptions,
  type StdioTransportOptions
} from '../index.ts'

const resources: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const close of resources.splice(0).reverse()) await close()
  vi.useRealTimers()
})
const flush = async () => {
  for (let i = 0; i < 4; i++)
    await new Promise<void>((resolve) => process.nextTick(resolve))
}
const hello = (id: string | number = 1): JsonRpcRequest => ({
  jsonrpc: '2.0',
  id,
  method: 'sdk.hello',
  params: { protocolVersion: 1 }
})
const result = {
  protocolVersion: 1,
  capabilities: { sessions: true, events: true, methods: SDK_METHODS }
}
const frame = (value: unknown, newline = '\n') =>
  Buffer.from(JSON.stringify(value) + newline)
const reply = (id: string | number = 1, value: unknown = result) => ({
  jsonrpc: '2.0' as const,
  id,
  result: value
})
const failureOf = (promise: Promise<unknown>) =>
  promise.catch((failure: unknown) => failure)

function stream() {
  const s = new PassThrough()
  s.on('error', () => {}) // owner survives adapter detach
  resources.push(() => {
    s.destroy()
  })
  return s
}
function client(options: Partial<StdioTransportOptions> = {}) {
  const input = stream(),
    output = stream()
  const writes: Buffer[] = []
  output.on('data', (chunk: Buffer) => writes.push(chunk))
  const transport = createStdioSdkTransport({
    input,
    output,
    expectedTenantId: 't',
    ...options
  })
  resources.push(() => transport.close())
  return { input, output, writes, transport }
}
function server(options: Partial<StdioServerOptions> = {}) {
  const input = stream(),
    output = stream()
  const writes: Buffer[] = []
  output.on('data', (chunk: Buffer) => writes.push(chunk))
  const dispatch = vi.fn(async (request: unknown) =>
    reply((request as JsonRpcRequest).id)
  )
  const errors = vi.fn()
  const serving = serveStdioSdk({
    input,
    output,
    server: { capabilities: result.capabilities, dispatch },
    onError: errors,
    ...options
  })
  resources.push(() => serving.close())
  return { input, output, writes, dispatch, errors, serving }
}
function blockedOutput() {
  const frames: Buffer[] = [],
    callbacks: Array<(error?: Error | null) => void> = []
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, callback) {
      frames.push(Buffer.from(chunk))
      callbacks.push(callback)
    }
  })
  output.on('error', () => {})
  resources.push(() => {
    output.destroy()
  })
  return { output, frames, callbacks }
}
const realOptions = {
  tenantId: 't',
  modelGateway: {
    complete: async () => ({
      text: 'synthetic',
      provider: 'keyless',
      model: 'v1',
      inputTokens: 2,
      outputTokens: 3,
      costUsd: 0
    })
  },
  policy: {
    evaluate: async () => ({
      outcome: 'ALLOW' as const,
      reason: 'synthetic',
      policyVersion: 'v1'
    })
  },
  approvals: {
    request: async () => ({ status: 'DENIED' as const, reason: 'synthetic' })
  }
}

describe('SPEC0211 stdio framing and bounds', () => {
  it('example owner escalates only its stubborn child, verifies exit and stdio closure', async () => {
    const home = mkdtempSync(join(tmpdir(), 'cvg-sdk-stubborn-'))
    resources.push(() => rmSync(home, { recursive: true, force: true }))
    const child = spawn(
      process.execPath,
      [
        '-e',
        'process.on("SIGTERM",()=>{});setInterval(()=>{},1000);process.stderr.write("synthetic-ready\\n")'
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: home,
        env: {
          HOME: home,
          XDG_CONFIG_HOME: home,
          TMPDIR: home,
          NODE_ENV: 'test'
        }
      }
    )
    for (const s of [child.stdin, child.stdout, child.stderr])
      s.on('error', () => {})
    child.on('error', () => {})
    resources.push(() => shutdownSdkChild(child))
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        clearTimeout(timer)
        child.stderr.off('data', ready)
        child.off('error', failed)
        child.off('close', closed)
        if (error) reject(error)
        else resolve()
      }
      const ready = () => finish()
      const failed = () => finish(new Error('Synthetic child startup failed'))
      const closed = () =>
        finish(new Error('Synthetic child exited before readiness'))
      const timer = setTimeout(
        () => finish(new Error('Synthetic child readiness timeout')),
        2000
      )
      child.stderr.once('data', ready)
      child.once('error', failed)
      child.once('close', closed)
    })
    const kill = vi.spyOn(child, 'kill')
    await shutdownSdkChild(child)
    expect(kill.mock.calls).toEqual([['SIGTERM'], ['SIGKILL']])
    expect(child.signalCode).toBe('SIGKILL')
    expect([
      child.stdin.closed,
      child.stdout.closed,
      child.stderr.closed
    ]).toEqual([true, true, true])
    expect(child.listenerCount('close')).toBe(0)
  })
  it('real child runs hello/open/send/read through createSdk, kernel and SessionEventStore', async () => {
    const journey = await runSdkStdioExample()
    expect(journey.hello.protocolVersion).toBe(1)
    expect(journey.session).toEqual({
      sessionId: 'stdio_session',
      formatVersion: 1
    })
    expect(journey.turn).toEqual({
      stopReason: 'COMPLETED',
      response: 'Resposta sintética stdio: olá 🌿.',
      modelCalls: 1,
      toolCalls: 0,
      usage: { inputTokens: 3, outputTokens: 4, costUsd: 0 },
      sessionId: 'stdio_session'
    })
    expect(journey.events.map((e) => e.type)).toEqual([
      'message/user',
      'turn/start',
      'model/request',
      'model/result',
      'turn/end',
      'message/assistant'
    ])
    expect(journey.events.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6])
    expect(
      journey.events.every(
        (e) =>
          e.tenantId === 'sdk_stdio_synthetic' &&
          e.sessionId === 'stdio_session'
      )
    ).toBe(true)
    expect(journey.events[0]?.payload).toEqual({ text: 'Olá 🌿' })
    expect(journey.events[5]?.payload).toEqual({ text: journey.turn.response })
    expect(journey.stderr).toBe('sdk-stdio-ready\nsdk-stdio:transport:-32083\n')
  })

  it('fixed synthetic child ignores inherited Node startup options', async () => {
    const previous = process.env.NODE_OPTIONS
    process.env.NODE_OPTIONS = '--cvg-synthetic-invalid-node-option'
    try {
      const journey = await runSdkStdioExample()
      expect(journey.turn.stopReason).toBe('COMPLETED')
      expect(journey.turn.modelCalls).toBe(1)
      expect(journey.turn.toolCalls).toBe(0)
    } finally {
      if (previous === undefined) delete process.env.NODE_OPTIONS
      else process.env.NODE_OPTIONS = previous
    }
  })

  it('fragmented multibyte UTF-8, CRLF and coalesced frames preserve order', async () => {
    const s = server()
    const requests = [hello('🌿'), hello('á')]
    const wire = Buffer.concat(requests.map((r) => frame(r, '\r\n')))
    for (const byte of wire) s.input.write(Buffer.from([byte]))
    await flush()
    expect(
      s.dispatch.mock.calls.map(([r]) => (r as JsonRpcRequest).id)
    ).toEqual(['🌿', 'á'])
    expect(s.writes.map((b) => JSON.parse(b.toString()).id)).toEqual([
      '🌿',
      'á'
    ])
  })

  it.each([
    ['invalid UTF-8', Buffer.from([0xc3, 0x28, 0x0a])],
    ['JSON', Buffer.from('{broken}\n')],
    ['batch', frame([hello()])],
    [
      'notification',
      frame({
        jsonrpc: '2.0',
        method: 'sdk.hello',
        params: { protocolVersion: 1 }
      })
    ],
    ['version', frame({ ...hello(), jsonrpc: '1.0' })],
    ['invalid params', frame({ ...hello(), params: {} })],
    ['unsafe id', frame({ ...hello(), id: Number.MAX_SAFE_INTEGER + 1 })],
    ['empty id', frame({ ...hello(), id: '' })],
    ['long id', frame(hello('x'.repeat(201)))],
    ['oversized', Buffer.from(' '.repeat(128) + '\n')]
  ])('rejects %s before dispatch', async (_label, wire) => {
    const s = server({ maxFrameBytes: 128 })
    s.input.write(wire)
    await s.serving.closed
    expect(s.dispatch).not.toHaveBeenCalled()
    expect(s.errors).toHaveBeenCalledWith({ kind: 'frame', code: -32080 })
  })

  it('EOF with partial valid JSON/UTF-8 never dispatches', async () => {
    const s = server()
    s.input.end(
      Buffer.concat([frame(hello()).subarray(0, -1), Buffer.from([0xf0, 0x9f])])
    )
    await s.serving.closed
    expect(s.dispatch).not.toHaveBeenCalled()
    expect(s.errors).toHaveBeenCalledWith({ kind: 'frame', code: -32080 })
  })

  it.each([false, true])(
    'duplicate id pending/resolved rejects without repeat dispatch (%s)',
    async (settled) => {
      const s = server()
      s.input.write(frame(hello()))
      if (settled) await flush()
      s.input.write(frame(hello()))
      await s.serving.closed
      expect(s.dispatch).toHaveBeenCalledTimes(1)
      expect(s.errors).toHaveBeenCalledWith({ kind: 'limit', code: -32084 })
    }
  )

  it('string and numeric IDs are distinct, but each cannot be reused after settlement', async () => {
    const c = client()
    const one = c.transport.request(hello(1)),
      stringOne = c.transport.request(hello('1'))
    await flush()
    c.input.write(Buffer.concat([frame(reply(1)), frame(reply('1'))]))
    await Promise.all([one, stringOne])
    await expect(c.transport.request(hello(1))).rejects.toMatchObject({
      kind: 'limit',
      outcome: 'not_dispatched',
      retrySafe: true
    })
    expect(c.writes).toHaveLength(2)
  })

  it('client pending/lifetime/frame/byte caps refuse new work and preserve accepted pending', async () => {
    const c = client({
      maxFrameBytes: 128,
      maxBufferedBytes: 128,
      maxPendingRequests: 1,
      maxLifetimeRequests: 1
    })
    const pending = c.transport.request(hello(1))
    await expect(c.transport.request(hello(2))).rejects.toMatchObject({
      kind: 'limit',
      retrySafe: true
    })
    c.input.write(
      frame(
        reply(1, {
          protocolVersion: 1,
          capabilities: {
            sessions: false,
            events: false,
            methods: ['sdk.hello', 'turn.send']
          }
        })
      )
    )
    // This valid response is larger than the tiny frame cap, so use a second roomy fixture for lifetime proof.
    await expect(pending).rejects.toMatchObject({
      kind: 'frame',
      retrySafe: false
    })
    const roomy = client({ maxLifetimeRequests: 1 })
    const first = roomy.transport.request(hello(1))
    roomy.input.write(frame(reply(1)))
    await first
    await expect(roomy.transport.request(hello(2))).rejects.toMatchObject({
      kind: 'limit',
      retrySafe: true
    })
    expect(roomy.writes).toHaveLength(1)
  })

  it('client byte cap is charged until settlement, with no extra write', async () => {
    const c = client({ maxFrameBytes: 128, maxBufferedBytes: 128 })
    const first = failureOf(c.transport.request(hello(1)))
    await expect(c.transport.request(hello(2))).rejects.toMatchObject({
      kind: 'limit',
      retrySafe: true
    })
    await c.transport.close()
    expect(await first).toMatchObject({ outcome: 'unknown' })
    expect(c.writes).toHaveLength(1)
  })

  it.each(['count', 'bytes'])(
    'server inbound %s bound closes without second dispatch',
    async (limit) => {
      let complete!: (response: ReturnType<typeof reply>) => void
      const dispatch = vi.fn(
        () =>
          new Promise<ReturnType<typeof reply>>((resolve) => {
            complete = resolve
          })
      )
      const s = server({
        maxQueuedRequests: limit === 'count' ? 1 : 64,
        maxFrameBytes: 128,
        maxBufferedBytes: limit === 'bytes' ? 128 : 1024,
        closeTimeoutMs: 10,
        server: { capabilities: result.capabilities, dispatch }
      })
      s.input.write(
        Buffer.concat([frame(hello(1)), frame(hello(2)), frame(hello(3))])
      )
      expect(dispatch).toHaveBeenCalledTimes(1)
      complete(reply(1))
      await s.serving.closed
      expect(s.writes).toHaveLength(0)
      expect(s.errors).toHaveBeenCalledWith({ kind: 'limit', code: -32084 })
    }
  )

  it('server lifetime limit preserves accepted work and refuses extra before dispatch', async () => {
    const s = server({ maxLifetimeRequests: 1 })
    s.input.write(Buffer.concat([frame(hello(1)), frame(hello(2))]))
    await s.serving.closed
    expect(s.dispatch).toHaveBeenCalledTimes(1)
    expect(s.writes.map((b) => JSON.parse(b.toString()).id)).toEqual([1])
  })

  it('lifetime exhaustion drains slow accepted work beyond the explicit close timeout', async () => {
    vi.useFakeTimers()
    let complete!: (response: ReturnType<typeof reply>) => void
    const dispatch = vi.fn((request: JsonRpcRequest) =>
      request.id === 1
        ? new Promise<ReturnType<typeof reply>>((resolve) => {
            complete = resolve
          })
        : Promise.resolve(reply(request.id))
    )
    const s = server({
      maxLifetimeRequests: 2,
      closeTimeoutMs: 15,
      server: { capabilities: result.capabilities, dispatch }
    })
    let closed = false
    void s.serving.closed.then(() => {
      closed = true
    })
    s.input.write(Buffer.concat([1, 2, 3, 4].map((id) => frame(hello(id)))))
    await vi.advanceTimersByTimeAsync(16)
    expect(closed).toBe(false)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(s.input.listenerCount('data')).toBe(0)
    complete(reply(1))
    await s.serving.closed
    expect(dispatch.mock.calls.map(([request]) => request.id)).toEqual([1, 2])
    expect(s.writes.map((b) => JSON.parse(b.toString()).id)).toEqual([1, 2])
    expect(s.errors).toHaveBeenCalledTimes(1)
    expect(s.errors).toHaveBeenCalledWith({ kind: 'limit', code: -32084 })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('explicit close bounds a stuck dispatch after lifetime exhaustion', async () => {
    vi.useFakeTimers()
    const s = server({
      maxLifetimeRequests: 1,
      server: {
        capabilities: result.capabilities,
        dispatch: () => new Promise(() => {})
      },
      closeTimeoutMs: 15
    })
    s.input.write(Buffer.concat([frame(hello(1)), frame(hello(2))]))
    expect(vi.getTimerCount()).toBe(0)
    const closing = s.serving.close()
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(15)
    await closing
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['end', 'error', 'close'] as const)(
    'lifetime exhaustion still observes input %s and discards queued work',
    async (fault) => {
      let complete!: (response: ReturnType<typeof reply>) => void
      const dispatch = vi.fn((request: JsonRpcRequest) =>
        request.id === 1
          ? new Promise<ReturnType<typeof reply>>((resolve) => {
              complete = resolve
            })
          : Promise.resolve(reply(request.id))
      )
      const s = server({
        maxLifetimeRequests: 2,
        server: { capabilities: result.capabilities, dispatch }
      })
      s.input.write(Buffer.concat([1, 2, 3].map((id) => frame(hello(id)))))
      expect(s.input.listenerCount('data')).toBe(0)
      if (fault === 'end') s.input.end()
      else if (fault === 'error')
        s.input.emit('error', new Error('synthetic input fault'))
      else s.input.emit('close')
      await flush()
      complete(reply(1))
      await flush()
      const closing = s.serving.close()
      await closing
      expect(dispatch.mock.calls.map(([request]) => request.id)).toEqual([1])
      expect(s.writes).toHaveLength(0)
      expect(s.errors).toHaveBeenCalledWith({ kind: 'transport', code: -32083 })
      expect(s.input.listenerCount('end')).toBe(0)
      expect(s.input.listenerCount('close')).toBe(0)
    }
  )

  it.each(['in-process', 'stdio'])(
    'unexpected host hook failure is bounded and fixed over %s',
    async (mode) => {
      const secret = 'SYNTHETIC_HOST_SECRET_' + 'x'.repeat(5000)
      const model = vi.fn(realOptions.modelGateway.complete)
      const sdkServer = createSdkServer({
        ...realOptions,
        modelGateway: { complete: model },
        newCorrelationId: () => {
          throw new Error(secret)
        }
      })
      const request: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'turn.send',
        params: { userMessage: 'synthetic' }
      }
      if (mode === 'in-process') {
        const response = await sdkServer.dispatch(request)
        expect(response).toEqual({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32603, message: 'Internal error' }
        })
      } else {
        const c2s = stream(),
          s2c = stream()
        const serving = serveStdioSdk({
          input: c2s,
          output: s2c,
          server: sdkServer
        })
        const transport = createStdioSdkTransport({
          input: s2c,
          output: c2s,
          expectedTenantId: 't'
        })
        resources.push(
          () => serving.close(),
          () => transport.close()
        )
        await expect(transport.request(request)).rejects.toMatchObject({
          kind: 'remote_error',
          code: -32603,
          message: 'Internal error',
          outcome: 'unknown',
          retrySafe: false
        })
      }
      expect(model).not.toHaveBeenCalled()
    }
  )

  it.each([
    ['invalid_session_event', -32602, 'Invalid session event'],
    ['session_event_conflict', -32603, 'Session store failed']
  ] as const)(
    'session store %s does not expose local exception text',
    async (code, expectedCode, message) => {
      const secret = 'SYNTHETIC_STORE_SECRET_' + 'x'.repeat(5000)
      const sdkServer = createSdkServer({
        ...realOptions,
        sessions: {
          openSession: async () => {
            throw new SessionEventError(code, secret)
          },
          append: async () => {
            throw new Error('unexpected append')
          },
          read: async () => []
        }
      })
      expect(
        await sdkServer.dispatch({
          jsonrpc: '2.0',
          id: 1,
          method: 'session.open',
          params: { sessionId: 's' }
        })
      ).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: { code: expectedCode, message }
      })
    }
  )

  it.each(['toString', 'constructor', '__proto__'])(
    'prototype method %s maps to method_not_found',
    async (method) => {
      const s = server({ server: createSdkServer(realOptions) })
      s.input.write(frame({ ...hello(), method }))
      await flush()
      expect(JSON.parse(s.writes[0]!.toString())).toMatchObject({
        error: { code: -32601, message: 'Unknown method' }
      })
    }
  )

  it.each([
    { maxFrameBytes: 127 },
    { maxFrameBytes: 4 * 1024 * 1024 + 1 },
    { maxPendingRequests: 0 },
    { maxLifetimeRequests: 65537 },
    { requestTimeoutMs: 0 },
    { maxBufferedBytes: 16 * 1024 * 1024 + 1 },
    { expectedTenantId: '' }
  ])('invalid client options %j fail before attaching listeners', (options) => {
    const input = stream(),
      output = stream()
    expect(() =>
      createStdioSdkTransport({
        input,
        output,
        expectedTenantId: 't',
        ...options
      })
    ).toThrow()
    expect(input.listenerCount('data')).toBe(0)
    expect(output.listenerCount('drain')).toBe(0)
  })
})

describe('SPEC0211 pending settlement, backpressure and terminal cleanup', () => {
  it('byte-fragmented multibyte client responses preserve the exact result', async () => {
    const c = client()
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'turn.send',
      params: { userMessage: 'synthetic' }
    }
    const expected = {
      stopReason: 'COMPLETED',
      response: '🌿 ação',
      modelCalls: 1,
      toolCalls: 0,
      usage: { inputTokens: 1, outputTokens: 2, costUsd: 0 }
    }
    const pending = c.transport.request(request)
    for (const byte of frame(reply(1, expected), '\r\n'))
      c.input.write(Buffer.from([byte]))
    await expect(pending).resolves.toEqual(reply(1, expected))
  })

  it('known-bad tenant/session/sequence/fingerprint/payload closes the stdio connection before read settlement', async () => {
    const sdk = createSdk(realOptions)
    await sdk.openSession('s')
    await sdk.sendTurn('s', 'synthetic')
    const events = await sdk.readEvents('s')
    for (const mutation of [
      { tenantId: 'other' },
      { sessionId: 'other' },
      { sequence: 0 },
      { schemaFingerprint: '0'.repeat(64) },
      { payload: { text: 8 } }
    ]) {
      const c = client()
      const pending = failureOf(
        c.transport.request({
          jsonrpc: '2.0',
          id: 1,
          method: 'session.events',
          params: { sessionId: 's' }
        })
      )
      c.input.write(
        frame(reply(1, { events: [{ ...events[0], ...mutation }] }))
      )
      expect(await pending).toMatchObject({
        kind: 'invalid_response',
        outcome: 'unknown',
        retrySafe: false
      })
      expect(c.input.listenerCount('data')).toBe(0)
    }
  })
  it.each([
    reply('wrong'),
    reply(1, { ...result, protocolVersion: 2 }),
    { jsonrpc: '2.0', id: 1, error: { code: 1.1, message: 'invalid' } }
  ])(
    'tampered response rejects all pending before settlement',
    async (response) => {
      const c = client()
      const first = failureOf(c.transport.request(hello(1))),
        second = failureOf(c.transport.request(hello(2)))
      await flush()
      c.input.write(frame(response))
      const failures = await Promise.all([first, second])
      for (const error of failures)
        expect(error).toMatchObject({
          kind: 'invalid_response',
          outcome: 'unknown',
          retrySafe: false
        })
      expect(c.input.listenerCount('data')).toBe(0)
    }
  )

  it('a response for a queued request is rejected and state classifications remain per waiter', async () => {
    const blocked = blockedOutput(),
      c = client({ output: blocked.output })
    const first = failureOf(c.transport.request(hello(1))),
      second = failureOf(c.transport.request(hello(2)))
    c.input.write(frame(reply(2)))
    expect(await first).toMatchObject({
      kind: 'invalid_response',
      outcome: 'unknown',
      retrySafe: false
    })
    expect(await second).toMatchObject({
      kind: 'invalid_response',
      outcome: 'not_dispatched',
      retrySafe: true
    })
    expect(blocked.frames).toHaveLength(1)
  })

  it('timeout is terminal, clears all timers/listeners, discards queued and ignores late response', async () => {
    vi.useFakeTimers()
    const blocked = blockedOutput(),
      c = client({ output: blocked.output, requestTimeoutMs: 10 })
    const first = failureOf(c.transport.request(hello(1))),
      second = failureOf(c.transport.request(hello(2)))
    await vi.advanceTimersByTimeAsync(10)
    expect(await first).toMatchObject({
      kind: 'timeout',
      requestId: 1,
      outcome: 'unknown',
      retrySafe: false
    })
    expect(await second).toMatchObject({
      kind: 'timeout',
      requestId: 2,
      outcome: 'not_dispatched',
      retrySafe: true
    })
    c.input.write(frame(reply(1)))
    blocked.callbacks[0]!()
    await flush()
    expect(blocked.frames).toHaveLength(1)
    expect(c.input.listenerCount('data')).toBe(0)
    expect(c.input.listenerCount('end')).toBe(0)
    expect(c.input.listenerCount('error')).toBe(1)
    expect(blocked.output.listenerCount('drain')).toBe(0)
    expect(blocked.output.listenerCount('error')).toBe(1)
    expect(vi.getTimerCount()).toBe(0)
    await expect(c.transport.request(hello(3))).rejects.toMatchObject({
      kind: 'closed',
      retrySafe: true
    })
  })

  it('queued request timeout after an earlier response still terminates a stalled writer', async () => {
    vi.useFakeTimers()
    const blocked = blockedOutput(),
      c = client({ output: blocked.output, requestTimeoutMs: 10 })
    const first = c.transport.request(hello(1))
    c.input.write(frame(reply(1)))
    await first
    const queued = failureOf(c.transport.request(hello(2)))
    await vi.advanceTimersByTimeAsync(10)
    expect(await queued).toMatchObject({
      kind: 'timeout',
      requestId: 2,
      outcome: 'not_dispatched',
      retrySafe: true
    })
    blocked.callbacks[0]!()
    await flush()
    expect(blocked.frames).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['end', 'error', 'close', 'write-error', 'write-throw', 'explicit'])(
    'client %s closes idempotently with per-state uncertainty and no stream destruction',
    async (mode) => {
      const blocked = blockedOutput(),
        c = client({ output: blocked.output })
      if (mode === 'write-throw')
        vi.spyOn(blocked.output, 'write').mockImplementation(() => {
          throw new Error('secret remote payload')
        })
      const first = failureOf(c.transport.request(hello(1)))
      const second = failureOf(c.transport.request(hello(2)))
      if (mode === 'end') c.input.end()
      if (mode === 'error') c.input.emit('error', new Error('secret'))
      if (mode === 'close') c.input.emit('close')
      if (mode === 'write-error') blocked.callbacks[0]!(new Error('secret'))
      if (mode === 'explicit') await c.transport.close()
      const failures = await Promise.all([first, second])
      expect(failures[0]).toBeInstanceOf(SdkWireError)
      expect(failures[0]).toMatchObject({
        outcome: 'unknown',
        retrySafe: false
      })
      expect(failures[1]).toMatchObject({
        outcome: 'not_dispatched',
        retrySafe: true
      })
      expect((failures[0] as Error).message).not.toContain('secret')
      await c.transport.close()
      await c.transport.close()
      // PassThrough auto-destroys itself on normal end; the adapter never calls destroy.
      if (mode !== 'end') expect(c.input.destroyed).toBe(false)
      expect(c.input.listenerCount('data')).toBe(0)
      expect(blocked.output.listenerCount('drain')).toBe(0)
    }
  )

  it('server waits for write callback and backpressure drain before next dispatch', async () => {
    const blocked = blockedOutput(),
      s = server({ output: blocked.output })
    s.input.write(Buffer.concat([frame(hello(1)), frame(hello(2))]))
    await flush()
    expect(s.dispatch).toHaveBeenCalledTimes(1)
    expect(blocked.frames).toHaveLength(1)
    blocked.output.emit('drain')
    await flush()
    expect(s.dispatch).toHaveBeenCalledTimes(1)
    blocked.callbacks[0]!()
    await flush()
    expect(s.dispatch).toHaveBeenCalledTimes(2)
    blocked.callbacks[1]!()
    await flush()
  })

  it('callback alone cannot release a false write without drain', async () => {
    const output = stream()
    let callback!: (error?: Error | null) => void
    vi.spyOn(output, 'write').mockImplementation((_chunk, cb) => {
      if (typeof cb === 'function') callback = cb
      return false
    })
    const s = server({ output })
    s.input.write(Buffer.concat([frame(hello(1)), frame(hello(2))]))
    await flush()
    callback()
    await flush()
    expect(s.dispatch).toHaveBeenCalledTimes(1)
    output.emit('drain')
    await flush()
    expect(s.dispatch).toHaveBeenCalledTimes(2)
    const closing = s.serving.close()
    output.emit('error', new Error('synthetic'))
    await closing
  })

  it.each(['error', 'throw'])(
    'server write %s discards queued requests without replay',
    async (mode) => {
      const blocked = blockedOutput()
      if (mode === 'throw')
        vi.spyOn(blocked.output, 'write').mockImplementation(() => {
          throw new Error('secret')
        })
      const s = server({ output: blocked.output })
      s.input.write(Buffer.concat([frame(hello(1)), frame(hello(2))]))
      await flush()
      if (mode === 'error') blocked.callbacks[0]!(new Error('secret'))
      await s.serving.closed
      expect(s.dispatch).toHaveBeenCalledTimes(1)
      expect(s.errors).toHaveBeenCalledWith({ kind: 'transport', code: -32083 })
      expect(blocked.output.listenerCount('drain')).toBe(0)
    }
  )

  it('active dispatch resolving before close deadline is discarded and clears timer', async () => {
    vi.useFakeTimers()
    let resolve!: (value: ReturnType<typeof reply>) => void
    const dispatch = vi.fn(
      () =>
        new Promise<ReturnType<typeof reply>>((done) => {
          resolve = done
        })
    )
    const s = server({
      server: { capabilities: result.capabilities, dispatch }
    })
    s.input.write(Buffer.concat([frame(hello(1)), frame(hello(2))]))
    const closing = s.serving.close()
    resolve(reply(1))
    await closing
    expect(s.writes).toHaveLength(0)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('overflow envelope that cannot fit closes without deliberate partial output', async () => {
    const s = server({ maxFrameBytes: 128 })
    s.input.write(frame(hello('a'.repeat(50))))
    await s.serving.closed
    expect(s.dispatch).toHaveBeenCalledTimes(1)
    expect(s.writes).toHaveLength(0)
    expect(s.errors).toHaveBeenCalledWith({ kind: 'limit', code: -32084 })
  })

  it('server close has a deadline for stuck write and discards queued dispatch', async () => {
    vi.useFakeTimers()
    const blocked = blockedOutput(),
      s = server({ output: blocked.output, closeTimeoutMs: 15 })
    s.input.write(Buffer.concat([frame(hello(1)), frame(hello(2))]))
    await flush()
    const close = s.serving.close()
    await vi.advanceTimersByTimeAsync(15)
    await close
    expect(s.dispatch).toHaveBeenCalledTimes(1)
    expect(blocked.output.listenerCount('drain')).toBe(0)
    expect(s.input.listenerCount('data')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    blocked.callbacks[0]!()
    await flush()
    expect(s.dispatch).toHaveBeenCalledTimes(1)
  })

  it('active dispatch late rejection is observed after close deadline, with no writes/redispatch', async () => {
    vi.useFakeTimers()
    let reject!: (failure: Error) => void
    const dispatch = vi.fn(
      () =>
        new Promise<never>((_resolve, fail) => {
          reject = fail
        })
    )
    const s = server({
      server: { capabilities: result.capabilities, dispatch },
      closeTimeoutMs: 15
    })
    s.input.write(Buffer.concat([frame(hello(1)), frame(hello(2))]))
    const close = s.serving.close()
    await vi.advanceTimersByTimeAsync(15)
    await close
    reject(new Error('late secret'))
    await flush()
    expect(s.writes).toHaveLength(0)
    expect(dispatch).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('valid result larger than frame becomes bounded response_too_large with unknown outcome', async () => {
    const s2c = stream(),
      c2s = stream()
    const sdk = createSdk({
      ...realOptions,
      modelGateway: {
        complete: async () => ({
          text: '🌿'.repeat(300),
          provider: 'keyless',
          model: 'v1',
          inputTokens: 2,
          outputTokens: 3,
          costUsd: 0
        })
      }
    })
    const serving = serveStdioSdk({
      input: c2s,
      output: s2c,
      server: sdk.server,
      maxFrameBytes: 512
    })
    const transport = createStdioSdkTransport({
      input: s2c,
      output: c2s,
      expectedTenantId: 't',
      maxFrameBytes: 512
    })
    resources.push(
      () => serving.close(),
      () => transport.close()
    )
    const client = createSdkClient(transport)
    await client.openSession('s')
    await expect(client.sendTurn('synthetic', 's')).rejects.toMatchObject({
      kind: 'remote_error',
      code: SDK_TRANSPORT_ERROR_CODES.response_too_large,
      message: 'response_too_large',
      outcome: 'unknown',
      retrySafe: false
    })
    const events = await sdk.readEvents('s')
    expect(events.at(-1)?.type).toBe('message/assistant')
    expect(events.at(-1)?.payload).toEqual({ text: '🌿'.repeat(300) })
  })

  it('append assistant can fail after model execution and RPC error must remain unknown', async () => {
    const store = new InMemorySessionEventStore(),
      model = vi.fn(realOptions.modelGateway.complete)
    const sessions: SessionEventStore = {
      openSession: (request) => store.openSession(request),
      read: (request) => store.read(request),
      append: async (request) => {
        if (request.type === 'message/assistant')
          throw new Error('synthetic append failure')
        return store.append(request)
      }
    }
    const sdk = createSdk({
      ...realOptions,
      sessions,
      modelGateway: { complete: model }
    })
    const c2s = stream(),
      s2c = stream()
    const serving = serveStdioSdk({
      input: c2s,
      output: s2c,
      server: sdk.server
    })
    const transport = createStdioSdkTransport({
      input: s2c,
      output: c2s,
      expectedTenantId: 't'
    })
    resources.push(
      () => serving.close(),
      () => transport.close()
    )
    const client = createSdkClient(transport)
    await client.openSession('s')
    await expect(client.sendTurn('synthetic', 's')).rejects.toMatchObject({
      kind: 'remote_error',
      code: -32603,
      outcome: 'unknown',
      retrySafe: false
    })
    expect(model).toHaveBeenCalledTimes(1)
    const events = await client.readEvents('s')
    expect(events.at(-1)?.type).toBe('turn/end')
    expect(events.some((e) => e.type === 'model/result')).toBe(true)
    expect(model).toHaveBeenCalledTimes(1)
  })

  it('remote error preserves safe original code/data, never infers non-execution', async () => {
    const c = client(),
      promise = failureOf(c.transport.request(hello()))
    c.input.write(
      frame({
        jsonrpc: '2.0',
        id: 1,
        error: {
          code: -32602,
          message: 'invalid_params',
          data: { synthetic: true }
        }
      })
    )
    expect(await promise).toMatchObject({
      kind: 'remote_error',
      code: -32602,
      data: { synthetic: true },
      outcome: 'unknown',
      retrySafe: false
    })
  })

  it('throwing onError is isolated, closed resolves and late completion is discarded', async () => {
    const s = server({
      onError: () => {
        throw new Error('synthetic callback')
      }
    })
    s.input.write(Buffer.from('{bad}\n'))
    await s.serving.closed
    await s.serving.close()
    expect(s.dispatch).not.toHaveBeenCalled()
    expect(s.input.listenerCount('data')).toBe(0)
    expect(s.output.listenerCount('error')).toBe(1)
  })
})

describe('SPEC0211 host authority through real SDK/kernel', () => {
  it('peer tenant/actor/budget/policy/approval/tool fields cannot replace createSdk composition', async () => {
    const sdk = createSdk(realOptions),
      c2s = stream(),
      s2c = stream()
    const serving = serveStdioSdk({
      input: c2s,
      output: s2c,
      server: sdk.server
    })
    const transport = createStdioSdkTransport({
      input: s2c,
      output: c2s,
      expectedTenantId: 't'
    })
    resources.push(
      () => serving.close(),
      () => transport.close()
    )
    const extra = {
      tenantId: 'other',
      actor: 'administrator',
      policy: 'ALLOW',
      approval: 'APPROVED',
      budget: { maxModelCalls: 999 },
      requestedTool: {
        toolId: 'clinical.real',
        input: {},
        operationKey: 'hostile'
      }
    }
    await transport.request({
      jsonrpc: '2.0',
      id: 1,
      method: 'session.open',
      params: { sessionId: 's', ...extra }
    })
    const response = await transport.request({
      jsonrpc: '2.0',
      id: 2,
      method: 'turn.send',
      params: { sessionId: 's', userMessage: 'synthetic', ...extra }
    })
    expect(response).toMatchObject({
      result: { stopReason: 'COMPLETED', modelCalls: 1, toolCalls: 0 }
    })
    const events = await sdk.readEvents('s')
    expect(events.every((e) => e.tenantId === 't')).toBe(true)
    expect(events.some((e) => e.type === 'model/result')).toBe(true)
  })

  it.each(['DENY', 'REQUIRE_APPROVAL'] as const)(
    'host-composed real kernel %s executes zero tool bodies over stdio',
    async (outcome) => {
      // v1 createSdkServer intentionally cannot accept requestedTool from a peer.
      // This host SdkServer adapter composes a fixed synthetic tool request with the
      // real public kernel, exercising the governance path without adding v1 params.
      const execute = vi.fn(async () => ({
        status: 'SUCCEEDED' as const,
        output: { synthetic: true }
      }))
      const tool: ToolDefinition = {
        id: 'synthetic.neutral',
        version: 'v1',
        description: 'synthetic only',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
        risk: 'LOW',
        sideEffect: 'NONE',
        idempotent: true,
        requiresApproval: outcome === 'REQUIRE_APPROVAL',
        execute
      }
      const policy: PolicyEngine = {
        evaluate: vi.fn(async () => ({
          outcome,
          reason: 'host governance',
          policyVersion: 'v1'
        }))
      }
      const approvals: ApprovalEngine = {
        request: vi.fn(async () => ({
          status: 'PENDING' as const,
          reason: 'no approval'
        }))
      }
      const harness = createOperationalHarness({
        ...realOptions,
        policy,
        approvals,
        tools: {
          list: () => [tool],
          resolve: (id) => (id === tool.id ? tool : undefined)
        },
        audit: { append: async () => {} },
        telemetry: { record: () => {} }
      })
      const input: RuntimeInput = {
        tenantId: 't' as RuntimeInput['tenantId'],
        conversationId: 'c' as RuntimeInput['conversationId'],
        sessionId: 's' as RuntimeInput['sessionId'],
        correlationId: 'corr' as RuntimeInput['correlationId'],
        traceId: 'trace' as RuntimeInput['traceId'],
        agent: {
          id: 'a' as RuntimeInput['agent']['id'],
          version: 'v1' as RuntimeInput['agent']['version'],
          objective: 'synthetic',
          instructions: [],
          skills: [],
          tools: [tool.id],
          policies: []
        },
        userMessage: 'synthetic',
        context: {
          values: {},
          sourceIds: [],
          capturedAt: '2026-10-14T00:00:00.000Z'
        },
        state: {
          version: 0,
          values: {},
          updatedAt: '2026-10-14T00:00:00.000Z'
        },
        budget: {
          maxSteps: 4,
          maxModelCalls: 2,
          maxToolCalls: 2,
          maxCostUsd: 1,
          maxTokens: 100,
          maxDurationMs: 30000
        },
        requestedTool: {
          toolId: tool.id,
          input: {},
          operationKey: 'synthetic-operation'
        }
      }
      const host: SdkServer = {
        capabilities: result.capabilities,
        dispatch: async (request) => {
          const runtime = await harness.execute(input)
          return {
            jsonrpc: '2.0',
            id: (request as JsonRpcRequest).id,
            result: {
              stopReason: runtime.stopReason,
              response: runtime.response,
              modelCalls: runtime.modelCalls,
              toolCalls: runtime.toolCalls,
              usage: runtime.usage
            }
          }
        }
      }
      const c2s = stream(),
        s2c = stream()
      const serving = serveStdioSdk({ input: c2s, output: s2c, server: host })
      const transport = createStdioSdkTransport({
        input: s2c,
        output: c2s,
        expectedTenantId: 't'
      })
      resources.push(
        () => serving.close(),
        () => transport.close()
      )
      const turn = await createSdkClient(transport).sendTurn('synthetic')
      expect(turn).toMatchObject({
        stopReason: outcome === 'DENY' ? 'POLICY_DENIED' : 'APPROVAL_REQUIRED',
        toolCalls: 0
      })
      expect(execute).not.toHaveBeenCalled()
      expect(policy.evaluate).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 't' })
      )
      if (outcome === 'REQUIRE_APPROVAL')
        expect(approvals.request).toHaveBeenCalledWith(
          expect.objectContaining({ tenantId: 't' })
        )
    }
  )
})
