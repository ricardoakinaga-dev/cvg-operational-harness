// @vitest-environment node
// Pure protocol/unit evidence only. No wrapper main, process child or HTTP server runs.
import { describe, it, expect, vi } from 'vitest'
import { Readable, Writable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { canonicalJson } from '../../support/governed-test-kit/index.js'
import {
  PINS,
  LIMITS,
  STDIN_TEXT,
  SETTINGS_TEXT,
  MCP_TEXT,
  RESPONSE_BODY,
  RESPONSE_HEADERS,
  sha256,
  canonical,
  nativeInvocation,
  parseControlLine,
  parseHostCommand,
  encodeCommand,
  decodeRawFrames,
  encodeRawFrames,
  wrapperArguments,
  inspectRequest,
  markerVerified,
  phaseGate,
  versionMatches,
  controlWriter,
  hostCommands,
  fault,
  orderedTurns,
  writeBytes
} from './protocol.mjs'
import { main as clientMain } from './client.mjs'
import { main as observerMain } from './observer.mjs'

const runId = 'unit_synthetic',
  hash = 'a'.repeat(64)
const ready = {
  uid: 1000,
  gid: 1000,
  pid: 1,
  pidNamespace: '100',
  netNamespace: '200',
  interfaces: ['lo'],
  routes: [],
  hostMarkerAbsent: true,
  port: 1234
}
const configured = {
  port: 1234,
  profileSha256: hash,
  envSha256: sha256(canonical(nativeInvocation(1234).env))
}
const control = (role, type, payload, seq = 0) => ({
  version: 1,
  runId,
  role,
  seq,
  type,
  payload
})
const line = (value) => Buffer.from(JSON.stringify(value) + '\n')
const apiKey = ['x-api-key', 'cvg-synthetic-native-probe-v1']
const json = [...apiKey, 'Content-Type', 'application/json']
const good = { contentType: 'JSON', contentEncoding: 'ABSENT' }
const parse = (value, role = value.role, seq = value.seq) =>
  parseControlLine(line(value), role, runId, seq)
const raw = (bytes, role, tag, channel) => {
  const frames = bytes.length ? encodeRawFrames(bytes, role, tag, channel) : []
  if (role === 'client') {
    frames.push(...encodeRawFrames(Buffer.alloc(0), role, tag, channel))
    frames.push(
      ...encodeRawFrames(
        Buffer.alloc(0),
        role,
        tag,
        channel === 'stdout' ? 'stderr' : 'stdout'
      )
    )
  } else frames.push(...encodeRawFrames(Buffer.alloc(0), role, tag))
  return Buffer.concat(frames)
}

describe('frozen invocation and import boundary', () => {
  it('imports wrappers inertly, with no main invocation', () => {
    expect(typeof clientMain).toBe('function')
    expect(typeof observerMain).toBe('function')
  })
  it('reuses the qualified canonical function, fixed bytes and identity', () => {
    expect(canonical).toBe(canonicalJson)
    expect(Object.isFrozen(PINS)).toBe(true)
    expect(Object.isFrozen(LIMITS)).toBe(true)
    expect(PINS.version).toBe('2.1.302')
    expect(PINS.claudeSha256).toBe(
      '60d7eb7f12fbb28a52533fe8be5884097403562aa02dc73991a021c7067e29a5'
    )
    expect(STDIN_TEXT).toBe('CVG_SYNTHETIC_NATIVE_PORT_PROBE_V1')
    expect(SETTINGS_TEXT).toBe('{}')
    expect(MCP_TEXT).toBe('{"mcpServers":{}}')
    expect(RESPONSE_BODY.length).toBe(82)
    expect(RESPONSE_BODY.toString()).toBe(
      '{"type":"error","error":{"type":"overloaded_error","message":"CVG_SYNTHETIC_503"}}'
    )
    expect(RESPONSE_HEADERS).toEqual({
      'content-type': 'application/json',
      'content-length': '82',
      connection: 'close'
    })
    expect(sha256(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
  it('derives only the fixed native profile, with real empty argv and isolated copies', () => {
    const v = nativeInvocation(65535)
    expect(v).toEqual({
      file: '/toolchain/claude',
      versionArgs: ['--version'],
      args: [
        '--bare',
        '--print',
        '--output-format',
        'json',
        '--tools',
        '',
        '--no-session-persistence',
        '--strict-mcp-config',
        '--mcp-config',
        '/workspace/mcp.json',
        '--settings',
        '/workspace/settings.json',
        '--setting-sources',
        ''
      ],
      env: {
        HOME: '/scratch/home',
        CLAUDE_CONFIG_DIR: '/scratch/config',
        PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
        LANG: 'C.UTF-8',
        TZ: 'UTC',
        ANTHROPIC_BASE_URL: 'http://127.0.0.1:65535',
        ANTHROPIC_API_KEY: 'cvg-synthetic-native-probe-v1'
      },
      cwd: '/workspace',
      stdin: Buffer.from(STDIN_TEXT)
    })
    v.args[0] = 'mutant'
    v.env.HOME = '/mutant'
    v.stdin[0] = 0
    expect(nativeInvocation(65535).args[0]).toBe('--bare')
    expect(nativeInvocation(65535).env.HOME).toBe('/scratch/home')
    expect(nativeInvocation(65535).stdin.toString()).toBe(STDIN_TEXT)
  })
  it.each([0, -1, 65536, 1.5, '1234', null, {}, NaN])(
    'denies arbitrary port %s',
    (port) => {
      expect(() => nativeInvocation(port)).toThrowError(
        expect.objectContaining({ code: 'PROTOCOL' })
      )
    }
  )
  it('validates exact wrapper argv and host marker domain', () => {
    const marker =
      '/tmp/cvg-claude100-exec-20261017/ref-port-markers/' + 'b'.repeat(32)
    expect(wrapperArguments([runId, marker])).toEqual({
      runId,
      hostMarkerPath: marker
    })
    for (const args of [
      [runId, marker, 'extra'],
      ['', marker],
      ['a'.repeat(65), marker],
      ['../x', marker],
      [runId, marker + '/..'],
      [runId, '/tmp/marker']
    ]) {
      expect(() => wrapperArguments(args)).toThrowError(
        expect.objectContaining({ code: 'PROTOCOL' })
      )
    }
  })
  it('has only static qualified helper imports and finite directmain guards', async () => {
    for (const file of ['client.mjs', 'observer.mjs']) {
      const text = await readFile(new URL(file, import.meta.url), 'utf8')
      expect(text).toContain('if (isDirectMain(import.meta.url))')
      expect(text).not.toMatch(/\bimport\s*\(/)
      expect(text).not.toContain('process.env')
      expect(text).not.toMatch(/console\.|stderr\.write|execFile\(|exec\(/)
    }
  })
})

describe('closed strict control ABI', () => {
  const cases = [
    control('observer', 'READY', ready),
    control('client', 'READY', { ...ready, ...configured }),
    control('client', 'NATIVE_START', {
      phase: 'version',
      pid: 2,
      ppid: 1,
      argvSha256: hash,
      envSha256: hash,
      stdinSha256: hash
    }),
    control('client', 'NATIVE_END', {
      phase: 'version',
      exitCode: 0,
      signal: null,
      timeout: false
    }),
    control('client', 'NATIVE_END', {
      phase: 'port',
      exitCode: null,
      signal: 'SIGKILL',
      timeout: true
    }),
    control('observer', 'ARMED', { phase: 'port', port: 1234 }),
    control('observer', 'REQUEST', {
      phase: 'port',
      ordinal: 0,
      method: 'POST',
      path: '/v1/messages',
      bodySha256: hash,
      bytes: 0,
      markerVerified: false,
      ...good
    }),
    control('observer', 'RESPONSE', {
      phase: 'port',
      ordinal: 0,
      status: 503,
      headersSha256: hash,
      bodySha256: hash,
      outcome: 'FINISHED'
    }),
    control('observer', 'RESPONSE', {
      phase: 'port',
      ordinal: 3,
      status: 503,
      headersSha256: hash,
      bodySha256: hash,
      outcome: 'FAILED'
    }),
    control('observer', 'REJECTED', { reason: 'FORBIDDEN_AUTH', ordinal: 1 }),
    control('client', 'CLOSED', {}),
    control('observer', 'CLOSED', {})
  ]
  it.each(cases.map((v) => [v.role + '/' + v.type, v]))(
    'accepts %s',
    (_, value) => {
      expect(parse(value)).toEqual(value)
    }
  )
  it.each(cases.map((v) => [v.role + '/' + v.type, v]))(
    'denies extra or missing fields for %s',
    (_, value) => {
      expect(() => parse({ ...value, extra: 1 })).toThrowError(
        expect.objectContaining({ code: 'PROTOCOL' })
      )
      expect(() =>
        parse({ ...value, payload: { ...value.payload, extra: 'secret' } })
      ).toThrow()
      const mutant = { ...value }
      delete mutant.payload
      expect(() => parse(mutant)).toThrow()
      expect(() => parse(value, value.role, 1)).toThrow()
    }
  )
  it('leaves observed preflight mismatch available to host classification', () => {
    const v = control('observer', 'READY', {
      ...ready,
      uid: 0,
      pid: 5,
      interfaces: ['eth0'],
      hostMarkerAbsent: false
    })
    expect(parse(v).payload.uid).toBe(0)
  })
  it('denies duplicate JSON, invalid UTF8/BOM, multiple lines, role/run/seq spoofing and cap+1', () => {
    const value = control('observer', 'CLOSED', {})
    const mutants = [
      Buffer.from('{"version":1,"version":1}'),
      Buffer.from([0xff]),
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), line(value)]),
      Buffer.concat([line(value), line(value)]),
      Buffer.from(JSON.stringify(value) + '\r\n'),
      Buffer.alloc(LIMITS.controlFrameBytes + 1, 32)
    ]
    for (const bytes of mutants)
      expect(() => parseControlLine(bytes, 'observer', runId, 0)).toThrowError(
        expect.objectContaining({ code: 'PROTOCOL' })
      )
    expect(() => parse(value, 'client')).toThrow()
    expect(() =>
      parseControlLine(line(value), 'observer', 'other', 0)
    ).toThrow()
    expect(() =>
      parseControlLine(line({ ...value, seq: 256 }), 'observer', runId, 256)
    ).toThrow()
  })
  it('denies semantic payload mutants and wrong source types', () => {
    const variants = [
      control('observer', 'READY', { ...ready, port: 0 }),
      control('client', 'READY', {
        ...ready,
        ...configured,
        envSha256: 'z'.repeat(64)
      }),
      control('client', 'NATIVE_START', {
        phase: 'other',
        pid: 2,
        ppid: 1,
        argvSha256: hash,
        envSha256: hash,
        stdinSha256: hash
      }),
      control('client', 'NATIVE_END', {
        phase: 'port',
        exitCode: 256,
        signal: null,
        timeout: false
      }),
      control('client', 'NATIVE_END', {
        phase: 'port',
        exitCode: 1,
        signal: 'SIGKILL',
        timeout: false
      }),
      control('client', 'NATIVE_END', {
        phase: 'port',
        exitCode: null,
        signal: 'UNKNOWN',
        timeout: false
      }),
      control('observer', 'REQUEST', {
        ...cases[6].payload,
        bytes: LIMITS.bodyBytes + 1
      }),
      control('observer', 'REQUEST', { ...cases[6].payload, phase: 'version' }),
      control('observer', 'REQUEST', { ...cases[6].payload, ordinal: 4 }),
      control('observer', 'REQUEST', { ...cases[6].payload, path: '/secret' }),
      control('observer', 'RESPONSE', { ...cases[7].payload, outcome: 'SENT' }),
      control('observer', 'REJECTED', { reason: 'secret', ordinal: 0 }),
      control('observer', 'NATIVE_END', cases[3].payload),
      control('client', 'RESPONSE', cases[7].payload)
    ]
    for (const value of variants)
      expect(() => parse(value)).toThrowError(
        expect.objectContaining({ code: 'PROTOCOL' })
      )
  })
  it.each(['CONFIGURE', 'START_NATIVE', 'START_PORT', 'STOP', 'ARM_PORT'])(
    'accepts host %s with its exact role/payload',
    (type) => {
      const bytes = encodeCommand(
        runId,
        0,
        type,
        type === 'CONFIGURE' ? configured : {}
      )
      expect(
        parseHostCommand(
          bytes,
          type === 'ARM_PORT' ? 'observer' : 'client',
          runId,
          0
        ).type
      ).toBe(type)
      if (type === 'STOP')
        expect(parseHostCommand(bytes, 'observer', runId, 0).type).toBe('STOP')
      else
        expect(() =>
          parseHostCommand(
            bytes,
            type === 'ARM_PORT' ? 'client' : 'observer',
            runId,
            0
          )
        ).toThrowError(expect.objectContaining({ code: 'PROTOCOL' }))
    }
  )
  it('denies host arbitrary URL/env and payload-bearing starts', () => {
    for (const v of [
      { type: 'CONFIGURE', payload: { ...configured, env: {} } },
      { type: 'START_NATIVE', payload: { command: '/bin/sh' } },
      { type: 'START_PORT', payload: { port: 42 } },
      { type: 'STOP', payload: { reason: 'x' } },
      { type: 'READY', payload: {} }
    ])
      expect(() =>
        parseHostCommand(
          line({ version: 1, runId, seq: 0, ...v }),
          'client',
          runId,
          0
        )
      ).toThrow()
  })
  it('bounds trusted event writer to256 frames and retains actual IO error cause', async () => {
    const frames = []
    const stream = new Writable({
      write(bytes, _, callback) {
        frames.push(bytes)
        callback()
      }
    })
    const send = controlWriter(stream, 'observer', runId)
    for (let i = 0; i < LIMITS.controlFrames; i++) await send('CLOSED')
    expect(frames.length).toBe(256)
    expect(parseControlLine(frames.at(-1), 'observer', runId, 255).seq).toBe(
      255
    )
    await expect(send('CLOSED')).rejects.toMatchObject({ code: 'PROTOCOL' })
    const cause = new Error('synthetic write failure')
    const broken = new Writable({
      write(_, __, callback) {
        callback(cause)
      }
    })
    broken.on('error', () => {})
    await expect(
      controlWriter(broken, 'client', runId)('CLOSED')
    ).rejects.toMatchObject({ code: 'IO', cause })
  })
  it('parses split host lines, rejects EOF without STOP and partial/capped lines', async () => {
    const bytes = encodeCommand(runId, 0, 'STOP')
    const iterator = hostCommands(
      Readable.from([bytes.subarray(0, 7), bytes.subarray(7)]),
      'client',
      runId
    )
    expect((await iterator.next()).value.type).toBe('STOP')
    await expect(iterator.next()).rejects.toMatchObject({ code: 'PROTOCOL' })
    await expect(
      hostCommands(
        Readable.from([Buffer.alloc(LIMITS.controlFrameBytes, 32)]),
        'client',
        runId
      ).next()
    ).rejects.toMatchObject({ code: 'CAP' })
  })
})

describe('additional finite protocol boundaries', () => {
  it('exposes the fifth-attempt ordinal gap without extending the frozen schema', () => {
    expect(() =>
      parse(control('observer', 'REJECTED', { reason: 'CAP', ordinal: 4 }))
    ).toThrowError(expect.objectContaining({ code: 'PROTOCOL' }))
  })
  it('denies repeated commands and any buffered command after STOP', async () => {
    for (const types of [
      ['STOP', 'STOP'],
      ['STOP', 'START_NATIVE'],
      ['CONFIGURE', 'CONFIGURE']
    ]) {
      const input = Buffer.concat(
        types.map((type, seq) =>
          encodeCommand(
            runId,
            seq,
            type,
            type === 'CONFIGURE' ? configured : {}
          )
        )
      )
      await expect(
        hostCommands(Readable.from([input]), 'client', runId).next()
      ).rejects.toMatchObject({ code: 'PROTOCOL' })
    }
  })
  it('accepts exact8KiB control frame and denies cap+1', () => {
    const base = line(control('observer', 'CLOSED', {}))
    const exact = Buffer.concat([
      Buffer.alloc(LIMITS.controlFrameBytes - base.length, 32),
      base
    ])
    expect(parseControlLine(exact, 'observer', runId, 0).type).toBe('CLOSED')
    expect(() =>
      parseControlLine(
        Buffer.concat([Buffer.from(' '), exact]),
        'observer',
        runId,
        0
      )
    ).toThrowError(expect.objectContaining({ code: 'PROTOCOL' }))
  })
  it('makes a stalled trusted pipe a finite timeout with no data-channel diagnostic', async () => {
    vi.useFakeTimers()
    try {
      const stalled = { write() {} }
      const result = writeBytes(stalled, Buffer.from('synthetic')).catch(
        (error) => error
      )
      await vi.advanceTimersByTimeAsync(LIMITS.cleanupMs)
      expect(await result).toMatchObject({
        code: 'TIMEOUT',
        message: 'Reference port TIMEOUT'
      })
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
  it('orders concurrent body completion by request registration without IO', async () => {
    const takeTurn = orderedTurns(),
      first = takeTurn(),
      second = takeTurn(),
      third = takeTurn()
    const order = []
    const secondBody = second.wait.then(() => {
      order.push(1)
      second.release()
    })
    const thirdBody = third.wait.then(() => {
      order.push(2)
      third.release()
    })
    await Promise.resolve()
    expect(order).toEqual([])
    await first.wait
    order.push(0)
    first.release()
    await Promise.all([secondBody, thirdBody])
    expect(order).toEqual([0, 1, 2])
  })
})

describe('phase admission without spawning anything', () => {
  it('requires configure/version ended/matched before one explicitly requested port spawn', () => {
    const gate = phaseGate('client')
    for (const command of ['START_NATIVE', 'START_PORT', 'ARM_PORT'])
      expect(() => gate.command(command)).toThrow()
    gate.command('CONFIGURE')
    expect(() => gate.command('CONFIGURE')).toThrow()
    gate.command('START_NATIVE')
    expect(() => gate.command('START_NATIVE')).toThrow()
    expect(() => gate.command('START_PORT')).toThrow()
    gate.end('version', true)
    expect(() => gate.end('version', true)).toThrow()
    gate.command('START_PORT')
    expect(() => gate.command('START_PORT')).toThrow()
    gate.end('port')
    gate.command('STOP')
    expect(() => gate.command('STOP')).toThrow()
  })
  it('denies mismatching version and observer repeated arm', () => {
    const client = phaseGate('client')
    client.command('CONFIGURE')
    client.command('START_NATIVE')
    client.end('version', false)
    expect(() => client.command('START_PORT')).toThrow()
    const observer = phaseGate('observer')
    expect(() => observer.command('CONFIGURE')).toThrow()
    observer.command('ARM_PORT')
    expect(() => observer.command('ARM_PORT')).toThrow()
    observer.command('STOP')
    expect(() => observer.command('ARM_PORT')).toThrow()
  })
  it.each([
    '',
    '2.1.302',
    'x2.1.302 (Claude Code)\n',
    '2.1.303 (Claude Code)\n',
    '2.1.302 (Claude Code)\nextra'
  ])('rejects unrecognized version bytes %s', (text) => {
    expect(
      versionMatches(Buffer.from(text), {
        exitCode: 0,
        signal: null,
        timeout: false
      })
    ).toBe(false)
  })
  it('requires exact version output plus actual successful exit', () => {
    const bytes = Buffer.from('2.1.302 (Claude Code)\n')
    expect(
      versionMatches(bytes, { exitCode: 0, signal: null, timeout: false })
    ).toBe(true)
    for (const result of [
      { exitCode: 1, signal: null, timeout: false },
      { exitCode: null, signal: 'SIGTERM', timeout: false },
      { exitCode: 0, signal: null, timeout: true }
    ])
      expect(versionMatches(bytes, result)).toBe(false)
    expect(
      versionMatches(Buffer.from([0xff]), {
        exitCode: 0,
        signal: null,
        timeout: false
      })
    ).toBe(false)
  })
})

describe('binary raw pipes are data only', () => {
  it('roundtrips all byte values, >4096 splitting, phases and channels', () => {
    const bytes = Buffer.from(Array.from({ length: 6000 }, (_, i) => i % 256))
    const frames = decodeRawFrames(
      Buffer.concat([
        raw(bytes, 'client', 'version', 'stdout'),
        raw(Buffer.from('secret'), 'client', 'port', 'stderr')
      ]),
      'client'
    )
    expect(frames.length).toBe(7)
    const payloads = frames.filter((f) => f.bytes.length > 0)
    expect(Buffer.concat(payloads.slice(0, 2).map((f) => f.bytes))).toEqual(
      bytes
    )
    expect(payloads[2]).toEqual({
      phase: 'port',
      channel: 'stderr',
      bytes: Buffer.from('secret')
    })
  })
  it('keeps apparent NDJSON control hostile text opaque', () => {
    const bytes = line(control('observer', 'REQUEST', { forged: true }))
    expect(
      decodeRawFrames(raw(bytes, 'client', 'port', 'stdout'), 'client')[0].bytes
    ).toEqual(bytes)
    expect(() =>
      parseControlLine(
        raw(bytes, 'client', 'port', 'stdout'),
        'client',
        runId,
        0
      )
    ).toThrow()
  })
  it('allows explicit zero-length raw body and preserves ordinal gaps', () => {
    const frames = decodeRawFrames(
      Buffer.concat([
        raw(Buffer.alloc(0), 'observer', 0),
        raw(Buffer.from('b'), 'observer', 3)
      ]),
      'observer'
    )
    expect(frames.map((f) => [f.ordinal, f.bytes.toString()])).toEqual([
      [0, ''],
      [3, 'b'],
      [3, '']
    ])
  })
  it('requires exactly one terminal for every native phase/channel and body ordinal', () => {
    const payload = Buffer.concat(
      encodeRawFrames(Buffer.from('x'), 'client', 'version', 'stdout')
    )
    const endOut = encodeRawFrames(
      Buffer.alloc(0),
      'client',
      'version',
      'stdout'
    )[0]
    const endErr = encodeRawFrames(
      Buffer.alloc(0),
      'client',
      'version',
      'stderr'
    )[0]
    for (const invalid of [
      payload,
      Buffer.concat([payload, endOut]),
      Buffer.concat([payload, endOut, endOut, endErr]),
      Buffer.concat([payload, endOut, endErr, payload])
    ]) {
      expect(() => decodeRawFrames(invalid, 'client')).toThrowError(
        expect.objectContaining({ code: 'PROTOCOL' })
      )
    }
    const bodyPayload = encodeRawFrames(Buffer.from('x'), 'observer', 1)[0]
    const bodyEnd = encodeRawFrames(Buffer.alloc(0), 'observer', 1)[0]
    for (const invalid of [
      bodyPayload,
      Buffer.concat([bodyPayload, bodyEnd, bodyEnd]),
      Buffer.concat([bodyPayload, bodyEnd, bodyPayload])
    ])
      expect(() => decodeRawFrames(invalid, 'observer')).toThrow()
    expect(
      decodeRawFrames(Buffer.concat([payload, endOut, endErr]), 'client')
    ).toHaveLength(3)
    expect(decodeRawFrames(bodyEnd, 'observer')).toEqual([
      { ordinal: 1, bytes: Buffer.alloc(0) }
    ])
  })
  it('rejects every truncated header/payload and cross-role magic', () => {
    const bytes = raw(Buffer.from('abc'), 'client', 'version', 'stdout')
    for (let i = 1; i < bytes.length; i++)
      expect(() => decodeRawFrames(bytes.subarray(0, i), 'client')).toThrow()
    expect(() => decodeRawFrames(bytes, 'observer')).toThrow()
    const highBit = Buffer.from(bytes)
    highBit[0] |= 0x80
    expect(() => decodeRawFrames(highBit, 'client')).toThrow()
    for (const [offset, value] of [
      [5, 2],
      [6, 3]
    ]) {
      const invalid = Buffer.from(bytes)
      invalid[offset] = value
      expect(() => decodeRawFrames(invalid, 'client')).toThrow()
    }
    const oversized = Buffer.from(bytes)
    oversized.writeUInt32BE(4097, 7)
    expect(() => decodeRawFrames(oversized, 'client')).toThrow()
  })
  it('enforces native channel cap exactly, aggregating phases', () => {
    const exact = raw(
      Buffer.alloc(LIMITS.nativeStdoutBytes),
      'client',
      'version',
      'stdout'
    )
    expect(
      decodeRawFrames(exact, 'client').reduce((n, f) => n + f.bytes.length, 0)
    ).toBe(LIMITS.nativeStdoutBytes)
    expect(() =>
      decodeRawFrames(
        Buffer.concat([
          exact,
          raw(Buffer.from('x'), 'client', 'port', 'stdout')
        ]),
        'client'
      )
    ).toThrow()
    const stderr = raw(
      Buffer.alloc(LIMITS.nativeStderrBytes + 1),
      'client',
      'port',
      'stderr'
    )
    expect(() => decodeRawFrames(stderr, 'client')).toThrow()
  })
  it('enforces exact per-body/aggregate caps and invalid ordinal/order', () => {
    const exact = Buffer.concat(
      [0, 1, 2, 3].map((i) =>
        raw(Buffer.alloc(LIMITS.bodyBytes), 'observer', i)
      )
    )
    expect(
      decodeRawFrames(exact, 'observer').reduce((n, f) => n + f.bytes.length, 0)
    ).toBe(LIMITS.totalBodyBytes)
    expect(() =>
      decodeRawFrames(
        raw(Buffer.alloc(LIMITS.bodyBytes + 1), 'observer', 0),
        'observer'
      )
    ).toThrow()
    const badOrdinal = raw(Buffer.from('a'), 'observer', 0)
    badOrdinal[5] = 4
    expect(() => decodeRawFrames(badOrdinal, 'observer')).toThrow()
    expect(() =>
      decodeRawFrames(
        Buffer.concat([
          raw(Buffer.from('b'), 'observer', 1),
          raw(Buffer.from('a'), 'observer', 0)
        ]),
        'observer'
      )
    ).toThrow()
    expect(() =>
      decodeRawFrames(Buffer.alloc(LIMITS.artifactBytes + 1), 'client')
    ).toThrow()
  })
})

describe('HTTP classification privacy without listening on any socket', () => {
  it('accepts only POST fixed route/query and verifies sentinel/classifications', () => {
    expect(inspectRequest('POST', '/v1/messages', json, true)).toEqual(good)
    expect(
      inspectRequest(
        'POST',
        '/v1/messages?beta=true',
        [...json, 'Content-Encoding', 'identity'],
        true
      )
    ).toEqual({ ...good, contentEncoding: 'IDENTITY' })
    expect(inspectRequest('POST', '/v1/messages', apiKey, true)).toEqual({
      contentType: 'ABSENT',
      contentEncoding: 'ABSENT'
    })
    expect(
      inspectRequest(
        'POST',
        '/v1/messages',
        [...apiKey, 'Content-Type', 'text/plain', 'Content-Encoding', 'gzip'],
        true
      )
    ).toEqual({ contentType: 'OTHER', contentEncoding: 'OTHER' })
    for (const path of [
      '/v1/messages?secret=x',
      '/v1/messages?beta=true&x=1',
      'http://127.0.0.1/v1/messages',
      '/v1/%6dessages',
      '/secret'
    ])
      expect(inspectRequest('POST', path, json, true)).toEqual({
        reason: 'UNSUPPORTED_ROUTE'
      })
    expect(inspectRequest('GET', '/v1/messages', json, true)).toEqual({
      reason: 'UNSUPPORTED_ROUTE'
    })
    expect(inspectRequest('POST', '/v1/messages', json, false)).toEqual({
      reason: 'EARLY_PHASE'
    })
    expect(inspectRequest('POST', '/v1/messages', [], true)).toEqual({
      reason: 'MISSING_SENTINEL'
    })
  })
  it.each([
    'authorization',
    'Cookie',
    'Proxy-Authorization',
    'x-auth-token',
    'x-api-key'
  ])('rejects %s without retaining synthetic secret', (key) => {
    const result = inspectRequest(
      'POST',
      '/v1/messages',
      [...apiKey, key, 'invented-secret-value'],
      true
    )
    expect(result).toEqual({ reason: 'FORBIDDEN_AUTH' })
    expect(JSON.stringify(result)).not.toContain('invented-secret-value')
  })
  it('rejects duplicate raw headers, including identical case variants', () => {
    expect(
      inspectRequest('POST', '/v1/messages', [...apiKey, ...apiKey], true)
    ).toEqual({ reason: 'FORBIDDEN_AUTH' })
    expect(
      inspectRequest(
        'POST',
        '/v1/messages',
        [...json, 'content-TYPE', 'application/json'],
        true
      )
    ).toEqual({ reason: 'FORBIDDEN_AUTH' })
  })
  it('enforces exact header byte boundary/+1 including request line and CRLF', () => {
    const headers = [...apiKey, 'x-padding', '']
    const base =
      Buffer.byteLength('POST /v1/messages HTTP/1.1\r\n') +
      2 +
      Buffer.byteLength('x-api-key') +
      Buffer.byteLength(apiKey[1]) +
      4 +
      Buffer.byteLength('x-padding') +
      4
    headers[3] = 'p'.repeat(LIMITS.headerBytes - base)
    expect(
      inspectRequest('POST', '/v1/messages', headers, true).reason
    ).toBeUndefined()
    headers[3] += 'p'
    expect(inspectRequest('POST', '/v1/messages', headers, true)).toEqual({
      reason: 'CAP'
    })
  })
  it('verifies marker only in recognized strict uncompressed user-message shape', () => {
    const bytes = Buffer.from(
      JSON.stringify({
        messages: [
          { role: 'user', content: [{ type: 'text', text: STDIN_TEXT }] }
        ]
      })
    )
    expect(markerVerified(bytes, good)).toBe(true)
    expect(markerVerified(bytes, { ...good, contentEncoding: 'OTHER' })).toBe(
      false
    )
    for (const value of [
      { text: STDIN_TEXT },
      { messages: [{ role: 'assistant', content: STDIN_TEXT }] },
      { messages: [{ role: 'user', content: 'prefix' + STDIN_TEXT }] }
    ])
      expect(markerVerified(Buffer.from(JSON.stringify(value)), good)).toBe(
        false
      )
    expect(
      markerVerified(Buffer.from('{"messages":[],"messages":[]}'), good)
    ).toBe(false)
    expect(markerVerified(Buffer.from([0xff]), good)).toBe(false)
  })
  it('keeps primary errors accessible under fixed safe diagnostics', () => {
    const cause = new Error('invented-secret-value')
    const error = fault('IO', cause)
    expect(error.message).toBe('Reference port IO')
    expect(error.cause).toBe(cause)
  })
})
