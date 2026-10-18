// Trusted synthetic test composition; imports only public compiled CVG roots.
import { PassThrough, Writable } from 'node:stream'
import {
  createSdk,
  createSdkMinimal,
  createSdkClient,
  createStdioSdkTransport,
  serveStdioSdk,
  SDK_METHODS,
  SDK_PROTOCOL_VERSION,
  SDK_ERROR_CODES,
  SDK_TRANSPORT_ERROR_CODES
} from '@cvg/sdk'
import {
  InMemorySessionEventStore,
  createOperationalHarness,
  sessionEventFingerprint,
  materializeSessionEvent,
  validateSessionEvent
} from '@cvg/harness'
import {
  SESSION_EVENT_CATALOG_V1,
  STOP_REASONS,
  canonicalizeJson
} from '@cvg/harness-contracts'

const modes = new Set([
  'full',
  'minimal',
  'model-failure',
  'append-failure',
  'oversized',
  'deny',
  'approval',
  'oracle',
  'ts-journey',
  'server-probes',
  'stubborn',
  'no-ready',
  'stderr-flood',
  'queue-limit',
  'byte-limit',
  'lifetime-limit'
])
const mode = process.argv[2]
if (!modes.has(mode)) throw new Error('Invalid synthetic fixture mode')
const tenant = 'sdk_stdio_synthetic'
const stats = {
  modelCalls: 0,
  toolBodies: 0,
  policyCalls: 0,
  approvalCalls: 0,
  dispatches: 0
}
let event = 0
const store = new InMemorySessionEventStore()
const options = {
  tenantId: tenant,
  modelGateway: {
    complete: async () => {
      stats.modelCalls++
      if (mode === 'model-failure') throw new Error('synthetic failure')
      return {
        text:
          mode === 'oversized'
            ? '🌿'.repeat(300)
            : 'Resposta sintética stdio: olá 🌿.',
        provider: 'deterministic',
        model: 'keyless-v1',
        inputTokens: 3,
        outputTokens: 4,
        costUsd: 0
      }
    }
  },
  policy: {
    evaluate: async () => {
      stats.policyCalls++
      return {
        outcome: 'ALLOW',
        reason: 'synthetic',
        policyVersion: 'v1'
      }
    }
  },
  approvals: {
    request: async () => {
      stats.approvalCalls++
      return {
        status: 'DENIED',
        reason: 'synthetic effects disabled'
      }
    }
  },
  sessions:
    mode === 'append-failure'
      ? {
          openSession: (r) => store.openSession(r),
          read: (r) => store.read(r),
          append: (r) => {
            if (r.type === 'message/assistant')
              throw new Error('synthetic append failure')
            return store.append(r)
          }
        }
      : store,
  clock: () => new Date('2026-10-14T00:00:00.000Z'),
  newEventId: () => `stdio_event_${++event}`,
  newCorrelationId: () => 'stdio_correlation',
  newTraceId: () => 'stdio_trace'
}
if (mode === 'oracle') {
  const budget = {
    maxSteps: 4,
    maxModelCalls: 2,
    maxToolCalls: 2,
    maxDurationMs: 30000,
    maxCostUsd: 1,
    maxTokens: 4000
  }
  const context = {
    values: { '🌿': 1e-7, z: -0 },
    sourceIds: [],
    capturedAt: 'synthetic'
  }
  const payloads = {
    'turn/start': { correlationId: 'c' },
    'model/request': {
      correlationId: 'c',
      request: {
        messages: [{ role: 'user', content: 'Olá 🌿' }],
        context,
        budget,
        correlationId: 'c'
      }
    },
    'model/result': {
      correlationId: 'c',
      provider: 'deterministic',
      inputTokens: 3,
      outputTokens: 4
    },
    'tool/call': {
      correlationId: 'c',
      toolId: 'synthetic',
      operationKey: 'op',
      input: { '🌿': -0, n: 1e20 }
    },
    'tool/result': {
      correlationId: 'c',
      toolId: 'synthetic',
      outcome: 'not_started'
    },
    'turn/end': { correlationId: 'c', stopReason: 'COMPLETED' },
    'message/user': { text: 'Olá 🌿' },
    'message/assistant': { text: 'synthetic' },
    'context/compacted': {
      throughSequence: 1,
      summary: 'synthetic',
      sourceDigest: '0'.repeat(64),
      strategyVersion: 'v1'
    }
  }
  const events = Object.entries(payloads).map(([type, payload], i) =>
    materializeSessionEvent(
      {
        tenantId: tenant,
        sessionId: 's',
        formatVersion: 1,
        eventId: `e${i}`,
        timestamp: '0000-02-29T00:00:00.000Z',
        correlationId: 'c',
        traceId: 'trace',
        type,
        payload
      },
      i + 3
    )
  )
  const near = structuredClone(events.find((e) => e.type === 'tool/call'))
  near.payload.input = { text: '' }
  const textLength = 1048576 - Buffer.byteLength(canonicalizeJson(near)) - 1
  near.payload.input.text = 'x'.repeat(textLength)
  validateSessionEvent(near)
  console.log(
    JSON.stringify({
      protocol_version: SDK_PROTOCOL_VERSION,
      methods: SDK_METHODS,
      error_codes: SDK_ERROR_CODES,
      transport_error_codes: SDK_TRANSPORT_ERROR_CODES,
      stop_reasons: STOP_REASONS,
      catalog: SESSION_EVENT_CATALOG_V1,
      event_fingerprints: Object.fromEntries(
        Object.keys(SESSION_EVENT_CATALOG_V1.events).map((type) => [
          type,
          sessionEventFingerprint(type)
        ])
      ),
      events,
      canonical_sizes: events.map((e) =>
        Buffer.byteLength(canonicalizeJson(e))
      ),
      canonical_limit_probe: {
        textLength,
        canonicalBytes: Buffer.byteLength(canonicalizeJson(near)),
        tsAccepted: true
      },
      public_resolution: [
        import.meta.resolve('@cvg/sdk'),
        import.meta.resolve('@cvg/harness'),
        import.meta.resolve('@cvg/harness-contracts')
      ]
    })
  )
} else if (mode === 'server-probes') {
  // Actual Node writer must observe BOTH callback and drain before dispatch2.
  const input = new PassThrough(),
    callbacks = [],
    writes = []
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, _enc, cb) {
      writes.push(Buffer.from(chunk))
      callbacks.push(cb)
    }
  })
  for (const s of [input, output]) s.on('error', () => {})
  let dispatches = 0
  const serving = serveStdioSdk({
    input,
    output,
    server: {
      capabilities: {},
      dispatch: async (r) => {
        dispatches++
        return {
          jsonrpc: '2.0',
          id: r.id,
          error: { code: -32601, message: 'Unknown method' }
        }
      }
    }
  })
  input.write(
    [1, 2]
      .map(
        (id) => JSON.stringify({ jsonrpc: '2.0', id, method: 'unknown' }) + '\n'
      )
      .join('')
  )
  await new Promise(setImmediate)
  const before = dispatches
  output.emit('drain')
  await new Promise(setImmediate)
  const drainOnly = dispatches
  callbacks[0]()
  await new Promise(setImmediate)
  const afterBoth = dispatches
  await serving.close()
  input.destroy()
  output.destroy()
  console.log(
    JSON.stringify({ before, drainOnly, afterBoth, writes: writes.length })
  )
} else if (mode === 'stubborn' || mode === 'no-ready') {
  process.on('SIGTERM', () => {})
  if (mode === 'stubborn') process.stderr.write('sdk-stdio-ready\n')
  setInterval(() => {}, 1000)
} else {
  const minimalOptions = { ...options }
  delete minimalOptions.sessions
  const sdk =
    mode === 'minimal' ? createSdkMinimal(minimalOptions) : createSdk(options)
  let server = sdk.server
  if (mode === 'deny' || mode === 'approval') {
    const tool = {
      id: 'synthetic.neutral',
      version: 'v1',
      description: 'synthetic only',
      inputSchema: { type: 'object' },
      outputSchema: { type: 'object' },
      risk: 'LOW',
      sideEffect: 'NONE',
      idempotent: true,
      requiresApproval: mode === 'approval',
      execute: async () => {
        stats.toolBodies++
        return { status: 'SUCCEEDED', output: {} }
      }
    }
    const harness = createOperationalHarness({
      ...minimalOptions,
      tools: {
        list: () => [tool],
        resolve: (id) => (id === tool.id ? tool : undefined)
      },
      policy: {
        evaluate: async () => {
          stats.policyCalls++
          return {
            outcome: mode === 'deny' ? 'DENY' : 'REQUIRE_APPROVAL',
            reason: 'synthetic',
            policyVersion: 'v1'
          }
        }
      },
      approvals: {
        request: async () => {
          stats.approvalCalls++
          return { status: 'PENDING', reason: 'no approval' }
        }
      },
      audit: { append: async () => {} },
      telemetry: { record: () => {} }
    })
    server = {
      capabilities: sdk.server.capabilities,
      dispatch: async (r) => {
        if (r.method !== 'turn.send') return sdk.server.dispatch(r)
        // Test-only host fixes tool/authority, never accepts a requestedTool wire API.
        const v = await harness.execute({
          tenantId: tenant,
          conversationId: 'c',
          sessionId: 's',
          correlationId: 'corr',
          traceId: 'trace',
          userMessage: 'synthetic',
          agent: {
            id: 'a',
            version: 'v1',
            objective: 'synthetic',
            instructions: [],
            skills: [],
            tools: [tool.id],
            policies: []
          },
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
        })
        return {
          jsonrpc: '2.0',
          id: r.id,
          result: {
            stopReason: v.stopReason,
            response: v.response,
            modelCalls: v.modelCalls,
            toolCalls: v.toolCalls,
            usage: v.usage
          }
        }
      }
    }
  }
  const realServer = server
  server = {
    capabilities: realServer.capabilities,
    dispatch: (r) => {
      stats.dispatches++
      return realServer.dispatch(r)
    }
  }
  if (mode === 'ts-journey') {
    const input = new PassThrough(),
      output = new PassThrough(),
      requests = [],
      responses = []
    input.on('data', (b) => requests.push(Buffer.from(b)))
    output.on('data', (b) => responses.push(Buffer.from(b)))
    for (const s of [input, output]) s.on('error', () => {})
    const serving = serveStdioSdk({ input, output, server })
    const transport = createStdioSdkTransport({
      input: output,
      output: input,
      expectedTenantId: tenant
    })
    try {
      const client = createSdkClient(transport)
      const hello = await client.hello(),
        session = await client.openSession('stdio_session')
      const turn = await client.sendTurn('Olá 🌿', session.sessionId)
      const events = await client.readEvents(session.sessionId, {
        afterSequence: 0,
        limit: 100
      })
      const page = await client.readEvents(session.sessionId, {
        afterSequence: 4,
        limit: 100
      })
      console.log(
        JSON.stringify({
          hello,
          session,
          turn,
          events,
          page,
          requests: Buffer.concat(requests).toString('base64'),
          responses: Buffer.concat(responses).toString('base64')
        })
      )
    } finally {
      await transport.close()
      await serving.close()
      input.destroy()
      output.destroy()
    }
  } else {
    for (const s of [process.stdin, process.stdout, process.stderr])
      s.on('error', () => {})
    const serving = serveStdioSdk({
      input: process.stdin,
      output: process.stdout,
      server,
      ...(mode === 'oversized' ? { maxFrameBytes: 512 } : {}),
      ...(mode === 'queue-limit'
        ? { maxQueuedRequests: 1, maxBufferedBytes: 1024, maxFrameBytes: 512 }
        : {}),
      ...(mode === 'byte-limit'
        ? { maxQueuedRequests: 64, maxBufferedBytes: 512, maxFrameBytes: 512 }
        : {}),
      ...(mode === 'lifetime-limit' ? { maxLifetimeRequests: 1 } : {}),
      onError: ({ kind, code }) =>
        process.stderr.write(`sdk-stdio:${kind}:${code}\n`)
    })
    if (mode === 'stderr-flood') process.stderr.write('x'.repeat(65536) + '\n')
    process.stderr.write('sdk-stdio-ready\n')
    const terminate = () => {
      void serving.close()
    }
    process.on('SIGTERM', terminate)
    await serving.closed
    process.off('SIGTERM', terminate)
    const events = await store
      .read({ tenantId: tenant, sessionId: 'stdio_session' })
      .catch(() => [])
    stats.eventTypes = events.map((e) => e.type)
    stats.assistantLength = events
      .filter((e) => e.type === 'message/assistant')
      .map((e) => Buffer.byteLength(e.payload.text))
    process.stderr.write(`sdk-stats:${JSON.stringify(stats)}\n`)
    process.stdin.destroy()
    process.stdout.end()
  }
}
