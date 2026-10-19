// @vitest-environment node
// In-process observer core over real loopback HTTP; no Docker, Claude or network.
import { afterEach, describe, expect, it } from 'vitest'
import http from 'node:http'
import net from 'node:net'
import { API_KEY, MODEL, STDIN_MARKERS, sha256 } from './constants.mjs'
import { createObserver, classifyHeaders, classifyTarget } from './observer.mjs'
import { KeyStore } from './model.mjs'
import { REJECT_SCRIPT, turnScript } from './script.mjs'
import { expectedWorkspaceState } from './workspace.mjs'

const BASE = {
  uid: 1000,
  gid: 1000,
  pid: 1,
  pidNamespace: '1',
  netNamespace: '2',
  interfaces: ['lo'],
  routes: [],
  hostMarkerAbsent: true
}
const open = []
afterEach(async () => {
  for (const o of open.splice(0)) await o.stop()
})
async function harness({ gate } = {}) {
  const frames = [],
    raw = new KeyStore('observer')
  const observer = createObserver({
    send: async (type, payload) => {
      frames.push({ type, payload })
      if (gate) await gate(type, payload)
    },
    raw: async (bytes) => {
      raw.feed(bytes)
    },
    observeState: async () => expectedWorkspaceState()
  })
  open.push(observer)
  await observer.listen()
  await observer.initialState(BASE)
  return { observer, frames, raw, port: observer.port }
}
function request(
  port,
  { path = '/v1/messages', method = 'POST', headers, body = '', destroyAfter }
) {
  return new Promise((resolve) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method, headers, agent: false },
      (res) => {
        const chunks = []
        res.on('data', (c) => {
          chunks.push(c)
          if (destroyAfter) res.destroy()
        })
        const done = (closed) =>
          resolve({
            status: res.statusCode,
            rawHeaders: res.rawHeaders,
            body: Buffer.concat(chunks),
            closed
          })
        res.on('end', () => done(false))
        res.on('close', () => done(true))
      }
    )
    req.on('error', () => resolve({ error: true }))
    req.end(body)
  })
}
const textBody = (marker = STDIN_MARKERS.TEXT) =>
  JSON.stringify({
    model: MODEL,
    stream: true,
    tools: [],
    messages: [{ role: 'user', content: [{ type: 'text', text: marker }] }]
  })
const sentinel = { 'content-type': 'application/json', 'x-api-key': API_KEY }
const types = (frames) => frames.map((f) => f.type)
const settle = (ms = 30) => new Promise((r) => setTimeout(r, ms))
const arm = (observer, caseId = 'TEXT', processOrdinal = 1) =>
  observer.command({ type: 'ARM', payload: { caseId, processOrdinal } })

describe('observer readiness and arming', () => {
  it('emits READY first, then the BEFORE_VERSION state with its raw bytes', async () => {
    const { frames, raw, port } = await harness()
    expect(types(frames)).toEqual(['READY', 'STATE'])
    const state = expectedWorkspaceState()
    expect(frames[0].payload).toMatchObject({
      port,
      workspaceStateSha256: state.sha256,
      workspaceStateBytes: state.bytes.length
    })
    expect(raw.entry('observer/0/255/5/65535').bytes).toEqual(state.bytes)
  })
  it('rejects a candidate POST before ARM as EARLY_PHASE and never advances a script', async () => {
    const { frames, port } = await harness()
    const res = await request(port, { headers: sentinel, body: textBody() })
    expect(res.status).toBe(400)
    await settle()
    expect(frames.find((f) => f.type === 'REJECTED').payload).toEqual({
      caseId: null,
      ordinal: 0,
      reason: 'EARLY_PHASE'
    })
  })
})

describe('eligible exchange and SSE bytes (RC04)', () => {
  it('serves the exact planned SSE with three fixed headers and per-write callbacks', async () => {
    const { observer, frames, raw, port } = await harness()
    await arm(observer)
    const res = await request(port, { headers: sentinel, body: textBody() })
    const script = turnScript('TEXT', 1)
    expect(res.status).toBe(200)
    expect(res.body).toEqual(script.body)
    const names = res.rawHeaders
      .filter((_, i) => i % 2 === 0)
      .map((h) => h.toLowerCase())
    expect(names.sort()).toEqual([
      'connection',
      'content-length',
      'content-type'
    ])
    await settle()
    expect(types(frames).slice(2)).toEqual([
      'ARMED',
      'REQUEST_BEGIN',
      'REQUEST',
      ...Array(7).fill('RESPONSE_SEGMENT'),
      'RESPONSE'
    ])
    expect(frames.at(-1).payload).toMatchObject({
      status: 200,
      segmentCount: 7,
      outcome: 'FINISHED',
      coverage: 'COMPLETE',
      bodySha256: sha256(script.body),
      headersSha256: sha256(script.headersBytes)
    })
    expect(frames.find((f) => f.type === 'REQUEST').payload).toMatchObject({
      turn: 1,
      markerVerified: true,
      scriptAccepted: true,
      contentType: 'JSON',
      contentEncoding: 'ABSENT'
    })
    expect(raw.entry('observer/1/0/2/65535').bytes).toEqual(script.headersBytes)
    for (let i = 0; i < 7; i++)
      expect(raw.entry(`observer/1/0/3/${i}`).bytes).toEqual(script.segments[i])
    expect(raw.entry('observer/1/0/4/65535').bytes).toEqual(script.body)
    expect(raw.entry('observer/1/0/1/65535').bytes.toString()).toBe(textBody())
  })
  it('keeps only the FINISHED prefix and PARTIAL_UNKNOWN when the client aborts mid-stream', async () => {
    let release
    const blocked = new Promise((r) => (release = r))
    const { observer, frames, raw, port } = await harness({
      gate: async (type, payload) => {
        if (type === 'RESPONSE_SEGMENT' && payload.segmentIndex === 0)
          await blocked
      }
    })
    await arm(observer)
    const result = await request(port, {
      headers: sentinel,
      body: textBody(),
      destroyAfter: true
    })
    expect(result.closed).toBe(true)
    release()
    await settle(300)
    const response = frames.find((f) => f.type === 'RESPONSE').payload
    expect(response.coverage).toBe('PARTIAL_UNKNOWN')
    expect(response.outcome).toBe('FAILED')
    const segments = frames.filter((f) => f.type === 'RESPONSE_SEGMENT')
    const finished = segments.filter((s) => s.payload.outcome === 'FINISHED')
    const body = raw.entry('observer/1/0/4/65535').bytes
    expect(body).toEqual(
      Buffer.concat(turnScript('TEXT', 1).segments.slice(0, finished.length))
    )
    expect(response.bytes).toBe(body.length)
    const failedAt = segments.findIndex((s) => s.payload.outcome === 'FAILED')
    if (failedAt !== -1) expect(segments).toHaveLength(failedAt + 1)
  })
})

describe('route, auth and caps (RC07)', () => {
  it.each([
    [
      'query string other than beta=true',
      { path: '/v1/messages?beta=false', headers: sentinel },
      'UNSUPPORTED_ROUTE'
    ],
    [
      'GET route',
      { method: 'GET', path: '/api/hello', headers: {} },
      'UNSUPPORTED_ROUTE'
    ],
    [
      'missing sentinel',
      { headers: { 'content-type': 'application/json' } },
      'MISSING_SENTINEL'
    ],
    [
      'other key',
      { headers: { ...sentinel, 'x-api-key': 'sk-ant-real-looking' } },
      'FORBIDDEN_AUTH'
    ],
    [
      'authorization',
      { headers: { ...sentinel, authorization: 'Bearer x' } },
      'FORBIDDEN_AUTH'
    ],
    ['cookie', { headers: { ...sentinel, cookie: 'a=b' } }, 'FORBIDDEN_AUTH']
  ])(
    'rejects %s with a fixed 400, no body retained and enums only',
    async (_n, options, reason) => {
      const { observer, frames, raw, port } = await harness()
      await arm(observer)
      const res = await request(port, {
        body: options.method === 'GET' ? '' : textBody(),
        ...options
      })
      expect(res.status).toBe(400)
      expect(res.body).toEqual(REJECT_SCRIPT.body)
      await settle()
      expect(frames.find((f) => f.type === 'REJECTED').payload).toEqual({
        caseId: 'TEXT',
        ordinal: 0,
        reason
      })
      expect(frames.some((f) => f.type === 'REQUEST')).toBe(false)
      expect(raw.entry('observer/1/0/1/65535')).toBeNull()
      const serialized = JSON.stringify(frames)
      expect(serialized).not.toContain('sk-ant')
      expect(serialized).not.toContain('beta=')
      expect(serialized).not.toContain('/api/hello')
    }
  )
  it('classifies a duplicated sentinel or token-like header as forbidden', () => {
    expect(
      classifyHeaders('POST', '/v1/messages', [
        'x-api-key',
        API_KEY,
        'X-Api-Key',
        API_KEY
      ]).authClass
    ).toBe('FORBIDDEN')
    expect(
      classifyHeaders('POST', '/v1/messages', ['x-api-key', API_KEY]).authClass
    ).toBe('SENTINEL')
    expect(classifyHeaders('POST', '/', ['x-token-thing', '1']).authClass).toBe(
      'FORBIDDEN'
    )
  })
  it('accepts a 512KiB body exactly and rejects 512KiB+1 as CAP without retention', async () => {
    for (const extra of [0, 1]) {
      const { observer, frames, raw, port } = await harness()
      await arm(observer)
      const base = Buffer.from(textBody())
      const filler = 512 * 1024 - base.length + extra
      const body = Buffer.concat([
        base.subarray(0, -1),
        Buffer.from(`,"pad":"${'x'.repeat(filler - 9)}"}`)
      ])
      expect(body.length).toBe(512 * 1024 + extra)
      await request(port, { headers: sentinel, body })
      await settle(100)
      if (extra) {
        expect(frames.find((f) => f.type === 'REJECTED').payload.reason).toBe(
          'CAP'
        )
        expect(raw.entry('observer/1/0/1/65535')).toBeNull()
      } else
        expect(frames.find((f) => f.type === 'REQUEST').payload.bytes).toBe(
          512 * 1024
        )
    }
  })
  it('admits twelve requests and fails the thirteenth as CAP without inventing an ordinal', async () => {
    const { frames, port } = await harness()
    for (let i = 0; i < 13; i++)
      await request(port, { method: 'GET', path: '/x', headers: {} })
    await settle()
    expect(
      frames
        .filter((f) => f.type === 'REQUEST_BEGIN')
        .map((f) => f.payload.ordinal)
    ).toEqual([...Array(12).keys()])
    expect(
      frames.filter((f) => f.type === 'ERROR').map((f) => f.payload.code)
    ).toEqual(['CAP'])
  })
  it('turns a divergent eligible POST into a non-advancing 400 and keeps its body', async () => {
    const { observer, frames, raw, port } = await harness()
    await arm(observer)
    const res = await request(port, {
      headers: sentinel,
      body: textBody('WRONG')
    })
    expect(res.status).toBe(400)
    await settle()
    expect(frames.find((f) => f.type === 'REQUEST').payload).toMatchObject({
      markerVerified: false,
      scriptAccepted: false
    })
    expect(raw.entry('observer/1/0/1/65535').bytes.toString()).toBe(
      textBody('WRONG')
    )
    const second = await request(port, { headers: sentinel, body: textBody() })
    expect(second.status).toBe(400)
  })
})

describe('case end and workspace state', () => {
  it('disarms, drains and reports STATE and CASE_ENDED with the case BEGIN ordinals', async () => {
    const { observer, frames, port } = await harness()
    await request(port, { method: 'GET', path: '/before', headers: {} })
    await arm(observer)
    await request(port, { headers: sentinel, body: textBody() })
    await request(port, { method: 'GET', path: '/x', headers: {} })
    await observer.command({
      type: 'END_CASE',
      payload: { caseId: 'TEXT', processOrdinal: 1 }
    })
    expect(
      frames.find((f) => f.type === 'CASE_ENDED').payload.requestOrdinals
    ).toEqual([1, 2])
    expect(frames.filter((f) => f.type === 'STATE')[1].payload).toMatchObject({
      caseId: 'TEXT',
      phase: 'AFTER_CASE'
    })
    await expect(
      observer.command({
        type: 'END_CASE',
        payload: { caseId: 'TEXT', processOrdinal: 1 }
      })
    ).rejects.toMatchObject({ code: 'PROTOCOL' })
    await expect(arm(observer, 'WRITE_DENIED', 3)).rejects.toMatchObject({
      code: 'PROTOCOL'
    })
    await arm(observer, 'READ', 2)
  })
})

// SPEC0238 rev.1 RC07: exact/+1 route targets, enums only, no 100/417.
function rawRequest(port, head, body = '') {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    const chunks = []
    socket.on('data', (c) => chunks.push(c))
    socket.on('error', () => {})
    socket.on('close', () => resolve(Buffer.concat(chunks).toString('latin1')))
    socket.end(
      Buffer.concat([
        Buffer.from(head.join('\r\n') + '\r\n\r\n'),
        Buffer.from(body)
      ])
    )
  })
}
const BODY = textBody()
const head = (target, extra = []) => [
  `POST ${target} HTTP/1.1`,
  'Host: 127.0.0.1',
  'Content-Type: application/json',
  `X-Api-Key: ${API_KEY}`,
  `Content-Length: ${Buffer.byteLength(BODY)}`,
  ...extra
]
describe('route target classes (SPEC0238 rev.1 RC07)', () => {
  it.each([
    ['/v1/messages', 'MESSAGES', 'EMPTY'],
    ['/v1/messages?beta=true', 'MESSAGES', 'BETA_TRUE'],
    ['/v1/messages?', 'MESSAGES', 'OTHER'],
    ['/v1/messages?beta=true&x=1', 'MESSAGES', 'OTHER'],
    ['/v1/messages?x=1&beta=true', 'MESSAGES', 'OTHER'],
    ['/v1/messages?beta=false', 'MESSAGES', 'OTHER'],
    ['/v1/messages?BETA=true', 'MESSAGES', 'OTHER'],
    ['/v1/messages?beta%3Dtrue', 'MESSAGES', 'OTHER'],
    ['/v1/messages?beta=true#f', 'MESSAGES', 'OTHER'],
    ['/v1/messages?beta=true&beta=true', 'MESSAGES', 'OTHER'],
    ['/v1/messages#f', 'OTHER', 'EMPTY'],
    ['/v1/messages/?beta=true', 'OTHER', 'BETA_TRUE'],
    ['/V1/messages?beta=true', 'OTHER', 'BETA_TRUE'],
    ['/v1/messages%3Fbeta=true', 'OTHER', 'EMPTY'],
    ['http://127.0.0.1/v1/messages?beta=true', 'OTHER', 'BETA_TRUE']
  ])('classifies %s by raw bytes', (target, pathClass, queryClass) => {
    expect(classifyTarget(target)).toEqual({ pathClass, queryClass })
  })
  it.each([
    ['/v1/messages', 'EMPTY'],
    ['/v1/messages?beta=true', 'BETA_TRUE']
  ])(
    'admits %s as the eligible exchange with its queryClass',
    async (target, queryClass) => {
      const { observer, frames, port } = await harness()
      await arm(observer)
      const res = await rawRequest(port, head(target), BODY)
      expect(res.startsWith('HTTP/1.1 200 ')).toBe(true)
      await settle()
      expect(frames.find((f) => f.type === 'REQUEST_BEGIN').payload).toEqual({
        caseId: 'TEXT',
        ordinal: 0,
        methodClass: 'POST',
        pathClass: 'MESSAGES',
        queryClass,
        expectClass: 'NONE',
        authClass: 'SENTINEL'
      })
      expect(frames.find((f) => f.type === 'REQUEST').payload).toMatchObject({
        path: '/v1/messages',
        queryClass,
        scriptAccepted: true
      })
      expect(JSON.stringify(frames)).not.toContain('beta=')
    }
  )
  const reject = async (lines, begin) => {
    const { observer, frames, raw, port } = await harness()
    await arm(observer)
    const res = await rawRequest(port, lines, BODY)
    await settle(60)
    const opened = frames.find((f) => f.type === 'REQUEST_BEGIN')
    return { res, frames, raw, opened, begin }
  }
  it.each([
    ['/v1/messages?', [], 'MESSAGES', 'OTHER', 'NONE'],
    ['/v1/messages?beta=true&x=1', [], 'MESSAGES', 'OTHER', 'NONE'],
    ['/v1/messages?x=1&beta=true', [], 'MESSAGES', 'OTHER', 'NONE'],
    ['/v1/messages?beta=false', [], 'MESSAGES', 'OTHER', 'NONE'],
    ['/v1/messages?BETA=true', [], 'MESSAGES', 'OTHER', 'NONE'],
    ['/v1/messages?beta%3Dtrue', [], 'MESSAGES', 'OTHER', 'NONE'],
    ['/v1/messages?beta=true#f', [], 'MESSAGES', 'OTHER', 'NONE'],
    ['/v1/messages/?beta=true', [], 'OTHER', 'BETA_TRUE', 'NONE'],
    ['/V1/messages?beta=true', [], 'OTHER', 'BETA_TRUE', 'NONE'],
    ['/v1/messages', ['Expect: 100-continue'], 'MESSAGES', 'EMPTY', 'EXPECT'],
    [
      '/v1/messages?beta=true',
      ['Expect: 100-continue'],
      'MESSAGES',
      'BETA_TRUE',
      'EXPECT'
    ],
    [
      '/v1/messages?beta=true',
      ['Expect: x-other'],
      'MESSAGES',
      'BETA_TRUE',
      'EXPECT'
    ],
    [
      '/v1/messages?beta=true',
      ['Expect: 100-continue', 'Expect: 100-continue'],
      'MESSAGES',
      'BETA_TRUE',
      'EXPECT'
    ]
  ])(
    'refuses %s %j with the fixed 400, enums only and no 100/417',
    async (target, extra, pathClass, queryClass, expectClass) => {
      const { res, frames, raw, opened } = await reject(head(target, extra))
      expect(res.startsWith('HTTP/1.1 400 ')).toBe(true)
      expect(res).not.toMatch(/HTTP\/1\.1 (100|417) /)
      expect(res.endsWith(REJECT_SCRIPT.body.toString('latin1'))).toBe(true)
      expect(opened.payload).toEqual({
        caseId: 'TEXT',
        ordinal: 0,
        methodClass: 'POST',
        pathClass,
        queryClass,
        expectClass,
        authClass: 'SENTINEL'
      })
      expect(frames.find((f) => f.type === 'REJECTED').payload).toEqual({
        caseId: 'TEXT',
        ordinal: 0,
        reason: 'UNSUPPORTED_ROUTE'
      })
      expect(frames.some((f) => f.type === 'REQUEST')).toBe(false)
      expect(raw.entry('observer/1/0/1/65535')).toBeNull()
      const serialized = JSON.stringify(frames)
      for (const text of [
        'beta=',
        'BETA=',
        'x=1',
        '#f',
        '100-continue',
        'x-other'
      ])
        expect(serialized).not.toContain(text)
    }
  )
  it('refuses a SENTINEL candidate with trailers as FORBIDDEN_AUTH after the body, without response or retention', async () => {
    const { observer, frames, raw, port } = await harness()
    await arm(observer)
    const chunk = Buffer.byteLength(BODY).toString(16)
    const res = await rawRequest(
      port,
      [
        'POST /v1/messages?beta=true HTTP/1.1',
        'Host: 127.0.0.1',
        'Content-Type: application/json',
        `X-Api-Key: ${API_KEY}`,
        'Transfer-Encoding: chunked',
        'Trailer: X-Trail'
      ],
      `${chunk}\r\n${BODY}\r\n0\r\nX-Trail: 1\r\n\r\n`
    )
    await settle(60)
    expect(res).toBe('')
    expect(
      frames.find((f) => f.type === 'REQUEST_BEGIN').payload
    ).toMatchObject({
      queryClass: 'BETA_TRUE',
      expectClass: 'NONE',
      authClass: 'SENTINEL'
    })
    expect(frames.find((f) => f.type === 'REJECTED').payload.reason).toBe(
      'FORBIDDEN_AUTH'
    )
    expect(frames.some((f) => f.type === 'REQUEST')).toBe(false)
    expect(frames.some((f) => f.type === 'RESPONSE')).toBe(false)
    expect(raw.entry('observer/1/0/1/65535')).toBeNull()
  })
  it('classifies CONNECT/upgrade as OTHER/OTHER with Expect from headers and clientError with expectClass null', async () => {
    const { observer, frames, port } = await harness()
    await arm(observer)
    await rawRequest(port, [
      'GET /v1/messages?beta=true HTTP/1.1',
      'Host: 127.0.0.1',
      'Connection: Upgrade',
      'Upgrade: websocket',
      'Expect: 100-continue'
    ])
    await rawRequest(port, ['BROKEN REQUEST LINE'])
    await settle(60)
    const begins = frames.filter((f) => f.type === 'REQUEST_BEGIN')
    expect(begins.map((f) => f.payload)).toEqual([
      {
        caseId: 'TEXT',
        ordinal: 0,
        methodClass: 'OTHER',
        pathClass: 'OTHER',
        queryClass: 'OTHER',
        expectClass: 'EXPECT',
        authClass: 'ABSENT'
      },
      {
        caseId: 'TEXT',
        ordinal: 1,
        methodClass: 'OTHER',
        pathClass: 'OTHER',
        queryClass: 'OTHER',
        expectClass: null,
        authClass: 'ABSENT'
      }
    ])
    expect(
      frames.filter((f) => f.type === 'REJECTED').map((f) => f.payload.reason)
    ).toEqual(['UNSUPPORTED_ROUTE', 'UNSUPPORTED_ROUTE'])
    expect(frames.some((f) => f.type === 'RESPONSE')).toBe(false)
  })
})
