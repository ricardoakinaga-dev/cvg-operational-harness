// @vitest-environment node
import { request } from 'node:http'
import { connect } from 'node:net'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve as resolvePath } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertSyntheticEnvironment,
  CREDENTIAL_NAMES,
  createModelFaultServer,
  expectedSyntheticRequest,
  LIMITS,
  preservePrimaryError,
  SCENARIOS,
  type FaultPlan,
  type ModelFaultServer,
  type Scenario
} from './support/model-fault-server/index.js'
import { canonicalJson, jsonDigest } from './support/governed-test-kit/index.js'
import { ModelGateway } from '../packages/model-gateway/src/gateway.ts'
import { PromptRegistry } from '../packages/model-gateway/src/prompt-registry.ts'
import { OpenAICompatibleProvider } from '../packages/model-gateway/src/providers/openai-compatible.ts'
import type {
  ModelGatewayEvent,
  ProviderRequest
} from '../packages/model-gateway/src/contracts.ts'

const childRoots: string[] = []
const servers: ModelFaultServer[] = []
const planFor = (
  scenario: Scenario = 'ok-json',
  overrides: Partial<FaultPlan> = {}
): FaultPlan => ({
  version: 1,
  suiteId: 'mf-suite',
  caseId: 'mf-case',
  scenario,
  maxRequests: 1,
  chunkDelayMs: 1,
  ...overrides
})
async function start(plan = planFor()) {
  const server = await createModelFaultServer(plan)
  servers.push(server)
  return server
}
afterEach(async () => {
  // An unexpected cleanup failure is a test failure, not silently discarded.
  const results = await Promise.allSettled(
    servers.splice(0).map((server) => server.close())
  )
  const errors = results.filter((result) => result.status === 'rejected')
  await Promise.all(
    childRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true }))
  )
  expect(errors).toEqual([])
})
function provider(server: ModelFaultServer) {
  return new OpenAICompatibleProvider({
    id: 'mf-local',
    baseUrl: server.url,
    model: 'cvg-synthetic-model-v1',
    location: 'local',
    allowHttp: true,
    allowPrivateNetworks: true
  })
}
function providerRequest(plan: FaultPlan, timeoutMs = 300): ProviderRequest {
  return {
    requestId: 'mf_request_001',
    tenantId: 'tenant_00000000-0000-4000-8000-000000000001',
    correlationId: 'mf_correlation_001',
    model: 'cvg-synthetic-model-v1',
    input: {
      messages: [
        {
          role: 'user',
          content: expectedSyntheticRequest(plan).messages[0].content
        }
      ]
    },
    temperature: 0,
    maxTokens: 32,
    promptSha256: 'a'.repeat(64),
    signal: new AbortController().signal,
    timeoutMs
  }
}
function gateway(server: ModelFaultServer, plan: FaultPlan) {
  const prompts = new PromptRegistry()
  const prompt = prompts.register({
    promptId: 'mf-synthetic',
    version: '1',
    owner: 'mf-test',
    approvedBy: 'mf-test',
    content: expectedSyntheticRequest(plan).messages[0].content,
    status: 'approved',
    effectiveFrom: '2020-01-01T00:00:00.000Z',
    classification: 'INTERNAL'
  })
  const events: ModelGatewayEvent[] = []
  const engine = new ModelGateway({
    providers: [provider(server)],
    prompts,
    onEvent: (event) => events.push(event),
    profiles: {
      local: {
        name: 'local',
        providerId: 'mf-local',
        model: 'cvg-synthetic-model-v1',
        location: 'local',
        temperature: 0,
        maxTokens: 32,
        timeoutMs: 150,
        maxRetries: 0,
        maxCostUsd: 0,
        estimatedCostUsd: 0,
        pricing: { inputPer1kUsd: 0, outputPer1kUsd: 0 }
      }
    },
    retry: { maxRetries: 0 }
  })
  return {
    engine,
    events,
    input: {
      requestId: 'mf_gateway_001',
      tenantId: 'tenant_00000000-0000-4000-8000-000000000001',
      correlationId: 'mf_correlation_001',
      modelProfile: 'local' as const,
      dataClassification: 'INTERNAL' as const,
      promptId: prompt.promptId,
      promptVersion: prompt.version,
      promptSha256: prompt.sha256,
      input: providerRequest(plan).input
    }
  }
}
function wire(plan: FaultPlan) {
  const body = expectedSyntheticRequest(plan)
  return JSON.stringify({
    model: body.model,
    messages: body.messages.map(({ role, content }) => ({ role, content })),
    temperature: body.temperature,
    max_tokens: body.max_tokens,
    stream: body.stream
  })
}
async function raw(
  server: ModelFaultServer,
  plan: FaultPlan,
  options: {
    body?: string
    headers?: Record<string, string>
    method?: string
    path?: string
  } = {}
) {
  return new Promise<{ status: number; body: Buffer }>((resolve, reject) => {
    const client = request(
      `${server.url}${options.path ?? '/chat/completions'}`,
      {
        method: options.method ?? 'POST',
        agent: false,
        headers: { 'content-type': 'application/json', ...options.headers }
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk) => chunks.push(chunk))
        response.on('error', reject)
        response.on('end', () =>
          resolve({ status: response.statusCode!, body: Buffer.concat(chunks) })
        )
      }
    )
    client.on('error', reject)
    client.setTimeout(1000, () =>
      client.destroy(new Error('synthetic client deadline'))
    )
    client.end(options.body ?? wire(plan))
  })
}
async function settle(server: ModelFaultServer) {
  for (let i = 0; i < 100 && server.state().active; i++)
    await new Promise((resolve) => setTimeout(resolve, 2))
  expect(server.state().active).toBe(0)
}

describe('SPEC0232 private model fault server', () => {
  it.each(['ok-json', 'chunked-json'] as const)(
    'MF01 actual native provider and gateway: %s',
    async (scenario) => {
      const plan = planFor(scenario, { maxRequests: 2 })
      const server = await start(plan)
      expect(new URL(server.url).hostname).toBe('127.0.0.1')
      expect(Number(new URL(server.url).port)).toBeGreaterThan(0)
      expect(
        await provider(server).execute(providerRequest(plan))
      ).toMatchObject({
        text: 'CVG_SYNTHETIC_OK_á',
        usage: { inputTokens: 3, outputTokens: 2 },
        finishReason: 'stop',
        externalCall: false
      })
      const { engine, events, input } = gateway(server, plan)
      expect(await engine.generate(input)).toMatchObject({
        output: { text: 'CVG_SYNTHETIC_OK_á' },
        usage: { inputTokens: 3, outputTokens: 2 },
        attempts: 1
      })
      expect(events.map((event) => event.type)).toEqual([
        'model.call.started',
        'model.call.completed'
      ])
      expect(events[1]).toMatchObject({ inputTokens: 3, outputTokens: 2 })
      await settle(server)
      expect(server.requestHistory()).toEqual(
        [0, 1].map((ordinal) => ({
          ordinal,
          requestSha256: jsonDigest(expectedSyntheticRequest(plan)),
          status: 200,
          termination: 'complete'
        }))
      )
      const old = server.requestHistory()
      expect(Object.isFrozen(old)).toBe(true)
      expect(Object.isFrozen(old[0])).toBe(true)
      expect(server.state().mode).toBe('replay')
      if (scenario === 'chunked-json') {
        const chunks = server.recording().chunks
        expect(Buffer.from(chunks[0]!.base64, 'base64').at(-1)).toBe(0xc3)
        expect(Buffer.from(chunks[1]!.base64, 'base64')[0]).toBe(0xa1)
      }
    }
  )

  it.each([
    ['rate-limit', 'rate_limited', 'provider_rate_limited'],
    ['timeout', 'timeout', 'cancelled'],
    ['disconnect', 'connection', 'provider_connection_reset'],
    ['invalid-json', 'malformed_response', 'provider_malformed_response']
  ] as const)(
    'MF02 actual public failure %s (preserve current gateway mapping)',
    async (scenario, kind, code) => {
      const plan = planFor(scenario, { maxRequests: 2 })
      const server = await start(plan)
      await expect(
        provider(server).execute(providerRequest(plan, 80))
      ).rejects.toMatchObject({ kind })
      const { engine, events, input } = gateway(server, plan)
      await expect(engine.generate(input)).rejects.toMatchObject({ code })
      expect(events.map((event) => event.type)).toEqual([
        'model.call.started',
        'model.call.failed'
      ])
      expect(events[1]).toMatchObject({ code, attempt: 1 })
      await settle(server)
      expect(server.requestHistory()).toHaveLength(2)
    }
  )

  it('MF03 SSE is finite synthetic protocol bytes only', async () => {
    const plan = planFor('synthetic-sse')
    const server = await start(plan)
    const result = await raw(server, plan)
    expect(result.status).toBe(200)
    expect(result.body.toString()).toBe(
      'data: {"synthetic":"CVG_SYNTHETIC_EVENT_1"}\n\ndata: [DONE]\n\n'
    )
    await settle(server)
    expect(server.recording().chunks.map((chunk) => chunk.ordinal)).toEqual([
      0, 1
    ])
  })

  it.each(CREDENTIAL_NAMES)(
    'MF04 pure injected environment guard: %s',
    (name) => {
      expect(() =>
        assertSyntheticEnvironment({ [name]: 'HOSTILE_FAKE' })
      ).toThrow('credential environment blocked')
      expect(() => assertSyntheticEnvironment({ [name]: '' })).not.toThrow()
      let read = false
      expect(() =>
        assertSyntheticEnvironment(
          Object.defineProperty({}, name, {
            enumerable: true,
            get: () => {
              read = true
              return ''
            }
          })
        )
      ).toThrow()
      expect(read).toBe(false)
    }
  )

  it('MF04 rejects descriptors, prototypes, unknown inputs, free payloads before listen', async () => {
    const plan = planFor()
    let reads = 0
    const hostile = Object.defineProperty({ ...plan }, 'scenario', {
      enumerable: true,
      get: () => {
        reads++
        return 'ok-json'
      }
    })
    for (const value of [
      hostile,
      Object.assign(Object.create({ inherited: 1 }), plan),
      { ...plan, upstream: 'https://synthetic.invalid' },
      { ...plan, scenario: 'unknown' },
      { ...plan, handler: () => {} },
      { ...plan, synthetic: false },
      { ...plan, body: 'HOSTILE_FAKE' },
      { ...plan, caseId: 'a'.repeat(129) },
      { ...plan, caseId: 'á' },
      { ...plan, chunkDelayMs: 101 },
      { ...plan, chunkDelayMs: -1 },
      { ...plan, maxRequests: 33 },
      { ...plan, maxRequests: 0 },
      { ...plan, maxRequests: 1.5 }
    ])
      await expect(createModelFaultServer(value as FaultPlan)).rejects.toThrow()
    expect(reads).toBe(0)
    for (const options of [
      { envSnapshot: {} },
      { mode: 'unknown' },
      { mode: 'record', recording: { synthetic: true } },
      { apiKey: 'HOSTILE_FAKE' }
    ])
      await expect(
        createModelFaultServer(plan, options as never)
      ).rejects.toThrow()
    for (const mode of ['record', 'refresh'] as const)
      await expect(
        createModelFaultServer(planFor('ok-json', { maxRequests: 2 }), { mode })
      ).rejects.toThrow('single exchange')
  })

  it.each([
    { method: 'GET' },
    { path: '/unknown' },
    { headers: { authorization: 'Bearer HOSTILE_FAKE' } },
    { headers: { 'content-type': 'text/plain' } },
    {
      body: '{"synthetic":true,"messages":[{"role":"user","content":"HOSTILE_FAKE"}]}'
    },
    {
      body: wire(planFor()).replace(
        '"messages":',
        '"messages":[{"role":"user","content":"HOSTILE_FAKE"}],"messages":'
      )
    },
    { body: wire(planFor()) + ' ' }
  ])(
    'MF04 rejects hostile request without retaining its content (case %#)',
    async (options) => {
      const plan = planFor()
      const server = await start(plan)
      const result = await raw(server, plan, options)
      expect(result.status).toBe(400)
      expect(result.body.toString()).not.toContain('HOSTILE_FAKE')
      await settle(server)
      expect(server.requestHistory()).toEqual([])
      expect(() => server.recording()).toThrow('no completed recording')
      expect(canonicalJson(server.state())).not.toContain('HOSTILE_FAKE')
    }
  )

  it('MF05 maxRequests exact/+1 and largest plan values; snapshots detached', async () => {
    const plan = planFor('ok-json', {
      maxRequests: 32,
      chunkDelayMs: 100,
      caseId: 'a'.repeat(128)
    })
    const server = await start(plan)
    // 32 concurrent calls consume the exact cap without exceeding the 5s lifetime.
    const results = await Promise.all(
      Array.from({ length: 32 }, () => raw(server, plan))
    )
    expect(results.every((result) => result.status === 200)).toBe(true)
    await settle(server)
    const before = server.requestHistory()
    expect(before).toHaveLength(32)
    expect((await raw(server, plan)).status).toBe(429)
    expect(server.requestHistory()).toEqual(before)
    expect(server.requestHistory()).not.toBe(before)
    expect(LIMITS).toMatchObject({
      requestBytes: 65536,
      responseBytes: 262144,
      chunks: 32,
      stringBytes: 4096
    })
  })

  it.each([65536, 65537])(
    'MF05 input cap exact/+1, invalid bytes never recorded (%d)',
    async (size) => {
      const plan = planFor()
      const server = await start(plan)
      const result = await raw(server, plan, { body: 'x'.repeat(size) })
      expect(result.status).toBe(size === 65536 ? 400 : 413)
      expect(server.requestHistory()).toEqual([])
    }
  )

  it('MF05 enforces the receiving cap on an actual chunked request', async () => {
    const plan = planFor()
    const server = await start(plan)
    expect(
      (
        await raw(server, plan, {
          body: 'x'.repeat(65537),
          headers: { 'transfer-encoding': 'chunked' }
        })
      ).status
    ).toBe(413)
    await settle(server)
    expect(server.requestHistory()).toEqual([])
  })

  it('MF04 admits only the enumerated synthetic auth sentinels', async () => {
    const plan = planFor()
    const server = await start(plan)
    expect(
      (
        await raw(server, plan, {
          headers: {
            authorization: 'Bearer cvg-synthetic-token-v1',
            'x-api-key': 'cvg-synthetic-token-v1',
            cookie: 'cvg_synthetic=1'
          }
        })
      ).status
    ).toBe(200)
    await settle(server)
    expect(server.requestHistory()).toHaveLength(1)
    expect(canonicalJson(server.recording())).not.toContain('Bearer')
  })

  it('MF05 interrupted chunk exchange is refused and close retains the real primary failure', async () => {
    const plan = planFor('chunked-json', { chunkDelayMs: 100 })
    const server = await createModelFaultServer(plan)
    try {
      await new Promise<void>((resolve, reject) => {
        const client = request(
          `${server.url}/chat/completions`,
          {
            method: 'POST',
            agent: false,
            headers: { 'content-type': 'application/json' }
          },
          (response) => {
            response.on('error', () => {})
            response.once('data', () => {
              response.destroy()
              resolve()
            })
          }
        )
        client.on('error', reject)
        client.setTimeout(1000, () =>
          client.destroy(new Error('synthetic client deadline'))
        )
        client.end(wire(plan))
      })
      for (let i = 0; i < 100 && server.state().failure === null; i++)
        await new Promise((resolve) => setTimeout(resolve, 1))
      expect(server.state().failure).toBe(
        'synthetic fault server: exchange interrupted'
      )
      expect(server.requestHistory()).toEqual([])
      expect(() => server.recording()).toThrow('no completed recording')
      const closing = server.close()
      expect(server.close()).toBe(closing)
      await expect(closing).rejects.toThrow('exchange interrupted')
      expect(server.state()).toMatchObject({
        closed: true,
        timers: 0,
        sockets: 0,
        active: 0
      })
    } finally {
      await server.close().catch((error: Error) => {
        expect(error.message).toBe(
          'synthetic fault server: exchange interrupted'
        )
      })
    }
  })

  it('MF05 cancellation and idempotent close destroy owned handles and real listener', async () => {
    const plan = planFor('timeout')
    const server = await start(plan)
    const controller = new AbortController()
    const pending = provider(server).execute({
      ...providerRequest(plan, 1000),
      signal: controller.signal
    })
    const failure = expect(pending).rejects.toMatchObject({ kind: 'cancelled' })
    while (server.state().requests === 0)
      await new Promise((resolve) => setTimeout(resolve, 1))
    controller.abort()
    await failure
    await settle(server)
    const first = server.close()
    expect(server.close()).toBe(first)
    await first
    expect(server.state()).toMatchObject({
      listening: false,
      closed: true,
      timers: 0,
      sockets: 0,
      active: 0
    })
    await expect(
      new Promise((resolve, reject) => {
        const socket = connect(Number(new URL(server.url).port), '127.0.0.1')
        socket.on('connect', () => {
          socket.destroy()
          resolve('connected')
        })
        socket.on('error', reject)
      })
    ).rejects.toMatchObject({ code: 'ECONNREFUSED' })
  })

  it('MF05 partial request lifetime expires autonomously within five seconds plus event-loop allowance', async () => {
    const plan = planFor()
    const started = Date.now()
    const server = await start(plan)
    const socket = connect(Number(new URL(server.url).port), '127.0.0.1')
    socket.on('error', () => {})
    socket.write('POST /chat/completions HTTP/1.1\r\nHost: synthetic\r\n')
    await new Promise((resolve) => socket.once('close', resolve))
    await server.close()
    expect(Date.now() - started).toBeLessThan(5500)
    expect(server.state()).toMatchObject({
      closed: true,
      sockets: 0,
      timers: 0,
      active: 0
    })
  })

  it('MF05 retains primary and cleanup errors in order', () => {
    const primary = new Error('synthetic primary')
    const cleanup = new Error('synthetic cleanup')
    expect(preservePrimaryError(primary, null)).toBe(primary)
    expect(preservePrimaryError(null, cleanup)).toBe(cleanup)
    expect(preservePrimaryError(primary, cleanup)).toMatchObject({
      cause: primary,
      errors: [primary, cleanup]
    })
  })

  it.each(['positive', 'negative'])(
    'MF03/MF04/MF06 actual guarded subprocess: %s',
    async (mode) => {
      const root = await mkdtemp(join(tmpdir(), 'mf-test-child-'))
      childRoots.push(root)
      const home = join(root, 'home')
      const temp = join(root, 'tmp')
      await mkdir(home, { mode: 0o700 })
      await mkdir(temp, { mode: 0o700 })
      // No host environment spread, snapshot or credential values enter this child.
      const env: NodeJS.ProcessEnv = {
        HOME: home,
        TMPDIR: temp,
        LANG: 'C.UTF-8',
        TZ: 'UTC'
      }
      if (mode === 'negative') env.OPENAI_API_KEY = 'HOSTILE_FAKE'
      const output = await new Promise<string>((resolve, reject) => {
        execFile(
          process.execPath,
          [
            resolvePath('tests/support/model-fault-server/record-probe.js'),
            mode
          ],
          { env, cwd: root, timeout: 12000, maxBuffer: 65536 },
          (error, stdout, stderr) => {
            if (error)
              reject(
                new Error(`synthetic child failed: ${stdout}\n${stderr}`, {
                  cause: error
                })
              )
            else if (stderr)
              reject(new Error(`synthetic child stderr: ${stderr}`))
            else resolve(stdout)
          }
        )
      })
      expect(JSON.parse(output)).toMatchObject({ status: 'observed' })
      expect(output).not.toContain('HOSTILE_FAKE')
      const files = await readdir(temp, { recursive: true })
      for (const path of files.filter(
        (path) => path.endsWith('.json') && !path.includes('bad-')
      ))
        expect(await readFile(join(temp, path), 'utf8')).not.toContain(
          'HOSTILE_FAKE'
        )
    }
  )

  it('MF05 preserves native filesystem/HTTP causes and synthetic cleanup after actual close', async () => {
    const root = await mkdtemp(join(tmpdir(), 'mf-cause-child-'))
    childRoots.push(root)
    await mkdir(join(root, 'home'), { mode: 0o700 })
    await mkdir(join(root, 'tmp'), { mode: 0o700 })
    const output = await new Promise<string>((resolve, reject) => {
      execFile(
        process.execPath,
        [resolvePath('tests/support/model-fault-server/cause-probe.js')],
        {
          cwd: root,
          env: {
            HOME: join(root, 'home'),
            TMPDIR: join(root, 'tmp'),
            LANG: 'C.UTF-8',
            TZ: 'UTC'
          },
          timeout: 12000,
          maxBuffer: 65536
        },
        (error, stdout, stderr) => {
          if (error || stderr)
            reject(
              new Error(
                `synthetic cause regression failed: ${stdout}\n${stderr}`,
                { cause: error }
              )
            )
          else resolve(stdout)
        }
      )
    })
    expect(JSON.parse(output)).toEqual({
      status: 'observed',
      nativeFdCodes: ['EBADF', 'EBADF'],
      httpCodes: [
        'ERR_HTTP_INVALID_STATUS_CODE',
        'ERR_HTTP_INVALID_STATUS_CODE'
      ],
      collisionCause: 'EEXIST',
      nativePrimaryAndClosePreserved: true,
      syntheticCleanupAfterNativeClosePreserved: true
    })
  })

  it('inventory is exactly the frozen seven finite scenarios', () => {
    expect(SCENARIOS).toEqual([
      'ok-json',
      'rate-limit',
      'timeout',
      'disconnect',
      'invalid-json',
      'chunked-json',
      'synthetic-sse'
    ])
  })
})
