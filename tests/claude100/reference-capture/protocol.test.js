// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { Readable } from 'node:stream'
import { LIMITS, canonical } from './constants.mjs'
import {
  KINDS,
  RawDecoder,
  clientFrame,
  clientFrames,
  encodeCommand,
  encodeFrame,
  hostCommands,
  observerBlock,
  observerFrame,
  parseControlLine,
  parseHostCommand,
  validObserverKey,
  wrapperArguments
} from './protocol.mjs'
import { ControlStream, KeyStore, Sequencer } from './model.mjs'

const RUN = 'run_1'
const D = 'a'.repeat(64)
const base = {
  uid: 1000,
  gid: 1000,
  pid: 1,
  pidNamespace: '1',
  netNamespace: '2',
  interfaces: ['lo'],
  routes: ['::1/128'],
  hostMarkerAbsent: true
}
const line = (value) => Buffer.from(canonical(value) + '\n')

describe('control envelope v3', () => {
  it('round-trips canonical frames and commands with fixed producers', () => {
    const ready = encodeFrame(RUN, 'observer', 0, 'READY', {
      ...base,
      port: 1234,
      workspaceStateSha256: D,
      workspaceStateBytes: 10
    })
    expect(parseControlLine(ready, 'observer', RUN, 0).type).toBe('READY')
    expect(() => parseControlLine(ready, 'client', RUN, 0)).toThrow()
    expect(() => parseControlLine(ready, 'observer', RUN, 1)).toThrow()
    expect(() => parseControlLine(ready, 'observer', 'other', 0)).toThrow()
    const start = encodeCommand(RUN, 'client', 3, 'START_NATIVE', {
      processOrdinal: 2,
      caseId: 'READ'
    })
    expect(parseHostCommand(start, 'client', RUN, 3).payload.caseId).toBe(
      'READ'
    )
    expect(() => parseHostCommand(start, 'observer', RUN, 3)).toThrow()
  })
  it.each([
    [
      'non-canonical key order',
      Buffer.from(
        '{"version":3,"runId":"run_1","role":"client","seq":0,"type":"CLOSED","payload":{}}\n'
      )
    ],
    [
      'CR inside',
      Buffer.from(
        canonical({
          version: 3,
          runId: RUN,
          role: 'client',
          seq: 0,
          type: 'CLOSED',
          payload: {}
        }) + '\r\n'
      )
    ],
    [
      'missing LF',
      Buffer.from(
        canonical({
          version: 3,
          runId: RUN,
          role: 'client',
          seq: 0,
          type: 'CLOSED',
          payload: {}
        })
      )
    ],
    [
      'extra field',
      line({
        version: 3,
        runId: RUN,
        role: 'client',
        seq: 0,
        type: 'CLOSED',
        payload: {},
        x: 1
      })
    ],
    [
      'version 2 (wire of run r1)',
      line({
        version: 2,
        runId: RUN,
        role: 'client',
        seq: 0,
        type: 'CLOSED',
        payload: {}
      })
    ],
    [
      'version 1',
      line({
        version: 1,
        runId: RUN,
        role: 'client',
        seq: 0,
        type: 'CLOSED',
        payload: {}
      })
    ],
    [
      'unknown type',
      line({
        version: 3,
        runId: RUN,
        role: 'client',
        seq: 0,
        type: 'ARMED',
        payload: {}
      })
    ],
    [
      'payload extra',
      line({
        version: 3,
        runId: RUN,
        role: 'client',
        seq: 0,
        type: 'CLOSED',
        payload: { a: 1 }
      })
    ],
    ['oversized frame', Buffer.alloc(LIMITS.controlFrameBytes + 1, 32)]
  ])('rejects %s as PROTOCOL', (_name, bytes) => {
    expect(() => parseControlLine(bytes, 'client', RUN, 0)).toThrow(
      expect.objectContaining({ code: 'PROTOCOL' })
    )
  })
  it('enforces I/K correspondence, closed REQUEST and RESPONSE domains', () => {
    const frame = (type, payload, role = 'client') =>
      line({ version: 3, runId: RUN, role, seq: 0, type, payload })
    const start = {
      processOrdinal: 1,
      caseId: 'READ',
      pid: 5,
      ppid: 1,
      startedAt: '2026-10-18T00:00:00.000Z',
      executableSha256: D,
      argvSha256: D,
      envSha256: D,
      stdinSha256: D
    }
    expect(() =>
      parseControlLine(frame('NATIVE_START', start), 'client', RUN, 0)
    ).toThrow()
    expect(
      parseControlLine(
        frame('NATIVE_START', { ...start, caseId: 'TEXT' }),
        'client',
        RUN,
        0
      ).type
    ).toBe('NATIVE_START')
    expect(() =>
      parseControlLine(
        frame('NATIVE_START', { ...start, caseId: 'TEXT', pid: 1 }),
        'client',
        RUN,
        0
      )
    ).toThrow()
    const request = {
      caseId: 'TEXT',
      ordinal: 0,
      turn: 1,
      method: 'POST',
      path: '/v1/messages',
      queryClass: 'BETA_TRUE',
      bodySha256: D,
      bytes: 3,
      markerVerified: false,
      contentType: 'JSON',
      contentEncoding: 'ABSENT',
      scriptAccepted: true
    }
    expect(() =>
      parseControlLine(
        frame('REQUEST', request, 'observer'),
        'observer',
        RUN,
        0
      )
    ).toThrow()
    expect(() =>
      parseControlLine(
        frame('REQUEST', { ...request, ordinal: 12 }, 'observer'),
        'observer',
        RUN,
        0
      )
    ).toThrow()
    expect(() =>
      parseControlLine(
        frame(
          'RESPONSE',
          {
            caseId: null,
            ordinal: 1,
            status: 503,
            headersSha256: D,
            bodySha256: D,
            bytes: 1,
            segmentCount: 1,
            outcome: 'FINISHED',
            coverage: 'COMPLETE'
          },
          'observer'
        ),
        'observer',
        RUN,
        0
      )
    ).toThrow()
    expect(() =>
      parseControlLine(
        frame(
          'STATE',
          { caseId: 'TEXT', phase: 'BEFORE_VERSION', sha256: D, bytes: 1 },
          'observer'
        ),
        'observer',
        RUN,
        0
      )
    ).toThrow()
    // END_CASE is a host command only; CASE_ENDED only an observer frame.
    expect(() =>
      parseControlLine(
        frame('END_CASE', { caseId: 'TEXT', processOrdinal: 1 }, 'observer'),
        'observer',
        RUN,
        0
      )
    ).toThrow()
    expect(() =>
      encodeCommand(RUN, 'client', 0, 'END_CASE', {
        caseId: 'TEXT',
        processOrdinal: 1
      })
    ).toThrow()
  })
  it('never accepts EOF as STOP and rejects bytes after STOP', async () => {
    const stop = encodeCommand(RUN, 'observer', 0, 'STOP', {})
    const read = async (chunks) => {
      const out = []
      try {
        for await (const c of hostCommands(
          Readable.from(chunks),
          'observer',
          RUN
        ))
          out.push(c.type)
      } catch (error) {
        return { out, error: error.code }
      }
      return { out }
    }
    expect(await read([stop])).toEqual({ out: ['STOP'], error: 'PROTOCOL' })
    expect(await read([Buffer.concat([stop, stop])])).toEqual({
      out: [],
      error: 'PROTOCOL'
    })
    expect(await read([])).toEqual({ out: [], error: 'PROTOCOL' })
  })
  it('accepts only the literal marker path as wrapper argument', () => {
    const marker = `/tmp/cvg-claude100-exec-20261017/ref-capture-markers/${'b'.repeat(32)}`
    expect(wrapperArguments([RUN, marker])).toEqual({
      runId: RUN,
      hostMarkerPath: marker
    })
    for (const args of [
      [RUN, marker.replace('ref-capture', 'ref-port')],
      [RUN, `${marker}/x`],
      ['bad id', marker],
      [RUN]
    ])
      expect(() => wrapperArguments(args)).toThrow()
  })
})

describe('binary pipes CVGN2/CVGO2', () => {
  it('uses 11/14-byte headers, 4096-byte chunks and one terminator per key', () => {
    const frames = clientFrames(Buffer.alloc(4097, 1), 2, 1)
    expect(frames.map((f) => f.length)).toEqual([11 + 4096, 11 + 1])
    expect(frames[0].subarray(0, 7)).toEqual(
      Buffer.from([0x43, 0x56, 0x47, 0x4e, 0x32, 2, 1])
    )
    const block = observerBlock(
      {
        caseTag: 2,
        requestTag: 3,
        kind: KINDS.RESPONSE_SEGMENT,
        segmentTag: 4
      },
      Buffer.from('xyz')
    )
    expect(block.length).toBe(14 + 3 + 14)
    expect(block.subarray(0, 5).toString()).toBe('CVGO2')
    expect(block.readUInt16BE(8)).toBe(4)
  })
  it('accepts only the closed observer key combinations', () => {
    const ok = [
      [1, 0, 1, 65535],
      [0, 11, 2, 65535],
      [0, 3, 3, 255],
      [3, 0, 4, 65535],
      [0, 255, 5, 65535]
    ]
    for (const [caseTag, requestTag, kind, segmentTag] of ok)
      expect(validObserverKey({ caseTag, requestTag, kind, segmentTag })).toBe(
        true
      )
    for (const [caseTag, requestTag, kind, segmentTag] of [
      [0, 0, 1, 65535],
      [1, 255, 1, 65535],
      [1, 0, 1, 0],
      [1, 0, 3, 65535],
      [1, 0, 5, 65535],
      [4, 0, 2, 65535],
      [1, 12, 2, 65535],
      [1, 0, 6, 65535]
    ])
      expect(validObserverKey({ caseTag, requestTag, kind, segmentTag })).toBe(
        false
      )
  })
  it('keeps observer keys contiguous and never reused after the terminator', () => {
    const a = { caseTag: 1, requestTag: 0, kind: 2, segmentTag: 65535 }
    const b = { caseTag: 1, requestTag: 0, kind: 4, segmentTag: 65535 }
    const interleaved = new RawDecoder('observer')
    interleaved.feed(
      Buffer.concat([
        observerFrame(a, Buffer.from('1')),
        observerFrame(b, Buffer.from('2'))
      ])
    )
    expect(interleaved.error.code).toBe('PROTOCOL')
    const reused = new RawDecoder('observer')
    reused.feed(
      Buffer.concat([
        observerBlock(a, Buffer.from('1')),
        observerBlock(a, Buffer.from('1'))
      ])
    )
    expect(reused.error.code).toBe('PROTOCOL')
    const state = { caseTag: 0, requestTag: 255, kind: 5, segmentTag: 65535 }
    const twice = new RawDecoder('observer')
    twice.feed(
      Buffer.concat([
        observerBlock(state, Buffer.from('s')),
        observerBlock(state, Buffer.from('s'))
      ])
    )
    expect(twice.error.code).toBe('PROTOCOL')
  })
  it('requires both terminators of a started child before the next ordinal', () => {
    const ok = new RawDecoder('client')
    const frames = ok.feed(
      Buffer.concat([
        clientFrame(0, 1, Buffer.from('v')),
        clientFrame(0, 2, Buffer.alloc(0)),
        clientFrame(0, 1, Buffer.alloc(0)),
        clientFrame(1, 2, Buffer.from('e'))
      ])
    )
    expect(ok.error).toBeUndefined()
    expect(frames.map((f) => f.offset)).toEqual([0, 12, 23, 34])
    const bad = new RawDecoder('client')
    bad.feed(
      Buffer.concat([
        clientFrame(0, 1, Buffer.from('v')),
        clientFrame(0, 1, Buffer.alloc(0)),
        clientFrame(1, 1, Buffer.from('x'))
      ])
    )
    expect(bad.error.code).toBe('PROTOCOL')
    const backwards = new RawDecoder('client')
    backwards.feed(
      Buffer.concat([
        clientFrame(1, 1, Buffer.from('x')),
        clientFrame(0, 1, Buffer.from('y'))
      ])
    )
    expect(backwards.error.code).toBe('PROTOCOL')
    const after = new RawDecoder('client')
    after.feed(
      Buffer.concat([
        clientFrame(0, 1, Buffer.alloc(0)),
        clientFrame(0, 1, Buffer.from('late'))
      ])
    )
    expect(after.error.code).toBe('PROTOCOL')
  })
  it('keeps an incomplete header/payload pending and rejects >4096 before allocation', () => {
    const store = new KeyStore('client')
    const frame = clientFrame(0, 1, Buffer.from('abc'))
    expect(store.feed(frame.subarray(0, 5))).toEqual([])
    expect(store.feed(frame.subarray(5, 13))).toEqual([])
    expect(store.tail().length).toBe(13)
    expect(store.feed(frame.subarray(13))).toHaveLength(1)
    expect(store.tail().length).toBe(0)
    const huge = Buffer.alloc(11)
    Buffer.from('CVGN2').copy(huge)
    huge[5] = 0
    huge[6] = 1
    huge.writeUInt32BE(4097, 7)
    const capped = new KeyStore('client')
    capped.feed(huge)
    expect(capped.error.code).toBe('CAP')
    expect(capped.tail()).toEqual(huge)
    const magic = new KeyStore('observer')
    magic.feed(clientFrame(0, 1, Buffer.from('abcdef')))
    expect(magic.error.code).toBe('PROTOCOL')
  })
  it('treats payload text that looks like control or magic as data', () => {
    const store = new KeyStore('client')
    const fake = Buffer.from(
      canonical({
        version: 3,
        runId: RUN,
        role: 'client',
        seq: 0,
        type: 'CLOSED',
        payload: {}
      }) + '\nCVGO2'
    )
    store.feed(
      Buffer.concat([
        clientFrame(1, 1, fake),
        clientFrame(1, 1, Buffer.alloc(0))
      ])
    )
    expect(store.entry('client/1/1').bytes).toEqual(fake)
  })
})

describe('control stream caps', () => {
  it('admits exactly 1024 frames and fails the 1025th', () => {
    const stream = new ControlStream('observer', RUN)
    const frames = []
    for (let seq = 0; seq < 1025; seq++)
      frames.push(
        encodeFrame(RUN, 'observer', Math.min(seq, 1023), 'CLOSED', {})
      )
    // seq 1024 cannot be encoded; emulate a 1025th line with the next seq.
    const last = Buffer.from(
      canonical({
        version: 3,
        runId: RUN,
        role: 'observer',
        seq: 1024,
        type: 'CLOSED',
        payload: {}
      }) + '\n'
    )
    const items = stream.feed(Buffer.concat([...frames.slice(0, 1024), last]))
    expect(items).toHaveLength(1024)
    expect(stream.error.code).toBe('CAP')
  })
  it('preserves an incomplete control tail without inventing a frame', () => {
    const stream = new ControlStream('client', RUN)
    const frame = encodeFrame(RUN, 'client', 0, 'CLOSED', {})
    expect(stream.feed(frame.subarray(0, 10))).toEqual([])
    expect(stream.tail()).toEqual(frame.subarray(0, 10))
  })
})

describe('admission sequencer', () => {
  const D2 = 'b'.repeat(64)
  function setup() {
    const seq = new Sequencer()
    let ordinal = 0
    const f = (role, type, payload) =>
      seq.frame(role, { type, payload }, ordinal++)
    const c = (to, type, payload) => seq.command(to, type, payload, ordinal++)
    return { seq, f, c }
  }
  it('rejects END/START out of window, replay and wrong caller/case', () => {
    const { seq, f, c } = setup()
    expect(f('observer', 'READY', { ...base, port: 9 })).toBeNull()
    expect(
      f('observer', 'STATE', {
        caseId: null,
        phase: 'BEFORE_VERSION',
        sha256: D,
        bytes: 1
      })
    ).toBeNull()
    expect(f('client', 'READY', base)).toBe('PROTOCOL')
    c('client', 'CONFIGURE', { port: 9 })
    expect(f('client', 'READY', base)).toBe('PROTOCOL') // replayed READY
    const fresh = setup()
    fresh.f('observer', 'READY', { ...base, port: 9 })
    fresh.c('client', 'CONFIGURE', { port: 9 })
    expect(fresh.f('client', 'READY', base)).toBeNull()
    expect(
      fresh.f('client', 'NATIVE_START', { processOrdinal: 0, pid: 5 })
    ).toBe('PROTOCOL')
    fresh.c('client', 'START_NATIVE', { processOrdinal: 0, caseId: null })
    expect(
      fresh.f('client', 'NATIVE_START', { processOrdinal: 0, pid: 5 })
    ).toBeNull()
    expect(fresh.f('client', 'NATIVE_END', { processOrdinal: 0, pid: 6 })).toBe(
      'PROTOCOL'
    )
    expect(
      fresh.f('client', 'NATIVE_END', { processOrdinal: 0, pid: 5 })
    ).toBeNull()
    expect(fresh.f('client', 'NATIVE_END', { processOrdinal: 0, pid: 5 })).toBe(
      'PROTOCOL'
    )
    expect(fresh.f('client', 'CLOSED', {})).toBe('PROTOCOL')
    expect(seq.cli.ready).toBeNull()
    void D2
  })
  it('binds BEGIN to the armed case, contiguous ordinals and one decision', () => {
    const { seq, f, c } = setup()
    f('observer', 'READY', { ...base, port: 9 })
    f('observer', 'STATE', {
      caseId: null,
      phase: 'BEFORE_VERSION',
      sha256: D,
      bytes: 1
    })
    expect(
      f('observer', 'REQUEST_BEGIN', {
        caseId: 'TEXT',
        ordinal: 0,
        methodClass: 'POST',
        pathClass: 'MESSAGES',
        queryClass: 'EMPTY',
        expectClass: 'NONE',
        authClass: 'SENTINEL'
      })
    ).toBe('PROTOCOL')
    c('observer', 'ARM', { caseId: 'TEXT', processOrdinal: 1 })
    expect(
      f('observer', 'ARMED', { caseId: 'TEXT', processOrdinal: 1, port: 10 })
    ).toBe('PROTOCOL')
    expect(
      f('observer', 'ARMED', { caseId: 'TEXT', processOrdinal: 1, port: 9 })
    ).toBeNull()
    expect(
      f('observer', 'REQUEST_BEGIN', {
        caseId: 'TEXT',
        ordinal: 2,
        methodClass: 'POST',
        pathClass: 'MESSAGES',
        queryClass: 'EMPTY',
        expectClass: 'NONE',
        authClass: 'SENTINEL'
      })
    ).toBe('PROTOCOL')
    expect(
      f('observer', 'REQUEST_BEGIN', {
        caseId: 'TEXT',
        ordinal: 1,
        methodClass: 'POST',
        pathClass: 'MESSAGES',
        queryClass: 'OTHER',
        expectClass: 'NONE',
        authClass: 'SENTINEL'
      })
    ).toBeNull()
    expect(
      f('observer', 'REJECTED', {
        caseId: 'TEXT',
        ordinal: 1,
        reason: 'UNSUPPORTED_ROUTE'
      })
    ).toBeNull()
    expect(
      f('observer', 'REQUEST', {
        caseId: 'TEXT',
        ordinal: 1,
        scriptAccepted: true
      })
    ).toBe('PROTOCOL')
    expect(
      f('observer', 'RESPONSE', {
        caseId: 'TEXT',
        ordinal: 1,
        status: 200,
        segmentCount: 0
      })
    ).toBe('PROTOCOL')
    expect(seq.obs.requests.size).toBe(2)
  })
  // SPEC0238 rev.1 RC08 mutants: REQUEST/REJECTED must match the BEGIN enums.
  const CANDIDATE = {
    methodClass: 'POST',
    pathClass: 'MESSAGES',
    queryClass: 'BETA_TRUE',
    expectClass: 'NONE',
    authClass: 'SENTINEL'
  }
  function admission(armCase) {
    const s = setup()
    s.f('observer', 'READY', { ...base, port: 9 })
    s.f('observer', 'STATE', {
      caseId: null,
      phase: 'BEFORE_VERSION',
      sha256: D,
      bytes: 1
    })
    if (armCase) {
      s.c('observer', 'ARM', { caseId: 'TEXT', processOrdinal: 1 })
      s.f('observer', 'ARMED', { caseId: 'TEXT', processOrdinal: 1, port: 9 })
    }
    const caseId = armCase ? 'TEXT' : null
    let next = 0
    s.decide = (begin, type, payload) => {
      const ordinal = next++
      const opened = s.f('observer', 'REQUEST_BEGIN', {
        caseId,
        ordinal,
        ...CANDIDATE,
        ...begin
      })
      if (opened) return `BEGIN_${opened}`
      return s.f('observer', type, { caseId, ordinal, ...payload })
    }
    return s
  }
  const request = (queryClass) => ({ queryClass, scriptAccepted: true })
  it.each([
    [
      'REQUEST equal to a BETA_TRUE BEGIN',
      {},
      'REQUEST',
      request('BETA_TRUE'),
      null
    ],
    [
      'REQUEST equal to an EMPTY BEGIN',
      { queryClass: 'EMPTY' },
      'REQUEST',
      request('EMPTY'),
      null
    ],
    [
      'REQUEST with a queryClass other than the BEGIN',
      {},
      'REQUEST',
      request('EMPTY'),
      'PROTOCOL'
    ],
    [
      'REQUEST after a queryClass OTHER BEGIN',
      { queryClass: 'OTHER' },
      'REQUEST',
      request('OTHER'),
      'PROTOCOL'
    ],
    [
      'REQUEST after an Expect BEGIN',
      { expectClass: 'EXPECT' },
      'REQUEST',
      request('BETA_TRUE'),
      'PROTOCOL'
    ],
    [
      'UNSUPPORTED_ROUTE for a POST candidate',
      {},
      'REJECTED',
      { reason: 'UNSUPPORTED_ROUTE' },
      'PROTOCOL'
    ],
    [
      'UNSUPPORTED_ROUTE for queryClass OTHER',
      { queryClass: 'OTHER' },
      'REJECTED',
      { reason: 'UNSUPPORTED_ROUTE' },
      null
    ],
    [
      'UNSUPPORTED_ROUTE for an Expect header',
      { expectClass: 'EXPECT' },
      'REJECTED',
      { reason: 'UNSUPPORTED_ROUTE' },
      null
    ],
    [
      'UNSUPPORTED_ROUTE for a FORBIDDEN BEGIN',
      { queryClass: 'OTHER', authClass: 'FORBIDDEN' },
      'REJECTED',
      { reason: 'UNSUPPORTED_ROUTE' },
      'PROTOCOL'
    ],
    [
      'FORBIDDEN_AUTH for a FORBIDDEN BEGIN',
      { queryClass: 'OTHER', authClass: 'FORBIDDEN' },
      'REJECTED',
      { reason: 'FORBIDDEN_AUTH' },
      null
    ],
    [
      'FORBIDDEN_AUTH on the trailers path of an armed SENTINEL candidate',
      {},
      'REJECTED',
      { reason: 'FORBIDDEN_AUTH' },
      null
    ],
    [
      'FORBIDDEN_AUTH without FORBIDDEN for an ABSENT candidate',
      { authClass: 'ABSENT' },
      'REJECTED',
      { reason: 'FORBIDDEN_AUTH' },
      'PROTOCOL'
    ],
    [
      'FORBIDDEN_AUTH without FORBIDDEN for a non-candidate',
      { queryClass: 'OTHER' },
      'REJECTED',
      { reason: 'FORBIDDEN_AUTH' },
      'PROTOCOL'
    ],
    [
      'MISSING_SENTINEL for a candidate',
      { authClass: 'ABSENT' },
      'REJECTED',
      { reason: 'MISSING_SENTINEL' },
      null
    ],
    [
      'MISSING_SENTINEL for a non-candidate',
      { authClass: 'ABSENT', expectClass: 'EXPECT' },
      'REJECTED',
      { reason: 'MISSING_SENTINEL' },
      'PROTOCOL'
    ],
    [
      'EARLY_PHASE for an armed case',
      {},
      'REJECTED',
      { reason: 'EARLY_PHASE' },
      'PROTOCOL'
    ],
    [
      'CAP for any BEGIN',
      { queryClass: 'OTHER', authClass: 'FORBIDDEN' },
      'REJECTED',
      { reason: 'CAP' },
      null
    ]
  ])('admits or refuses %s', (_name, begin, type, payload, expected) => {
    expect(admission(true).decide(begin, type, payload)).toBe(expected)
  })
  it('admits EARLY_PHASE only for an unarmed POST candidate', () => {
    const s = admission(false)
    expect(s.decide({}, 'REJECTED', { reason: 'EARLY_PHASE' })).toBeNull()
    expect(
      s.decide({ queryClass: 'OTHER' }, 'REJECTED', { reason: 'EARLY_PHASE' })
    ).toBe('PROTOCOL')
    expect(
      s.decide({ authClass: 'FORBIDDEN' }, 'REJECTED', {
        reason: 'EARLY_PHASE'
      })
    ).toBe('PROTOCOL')
  })
  it('refuses any response to a clientError BEGIN (expectClass null)', () => {
    const s = admission(true)
    const other = {
      methodClass: 'OTHER',
      pathClass: 'OTHER',
      queryClass: 'OTHER',
      authClass: 'ABSENT'
    }
    const response = { status: 400, segmentCount: 0 }
    expect(
      s.decide({ ...other, expectClass: 'NONE' }, 'REJECTED', {
        reason: 'UNSUPPORTED_ROUTE'
      })
    ).toBeNull()
    expect(
      s.f('observer', 'RESPONSE', { caseId: 'TEXT', ordinal: 0, ...response })
    ).toBeNull()
    expect(
      s.decide({ ...other, expectClass: null }, 'REJECTED', {
        reason: 'UNSUPPORTED_ROUTE'
      })
    ).toBeNull()
    expect(
      s.f('observer', 'RESPONSE', { caseId: 'TEXT', ordinal: 1, ...response })
    ).toBe('PROTOCOL')
  })
})

describe('SPEC0238 rev.1 request enums (closed payloads)', () => {
  const frame = (type, payload) =>
    line({ version: 3, runId: RUN, role: 'observer', seq: 0, type, payload })
  const parse = (type, payload) =>
    parseControlLine(frame(type, payload), 'observer', RUN, 0).type
  const begin = {
    caseId: 'TEXT',
    ordinal: 0,
    methodClass: 'POST',
    pathClass: 'MESSAGES',
    queryClass: 'BETA_TRUE',
    expectClass: 'NONE',
    authClass: 'SENTINEL'
  }
  it('admits the closed REQUEST_BEGIN domains and refuses anything else', () => {
    for (const queryClass of ['EMPTY', 'BETA_TRUE', 'OTHER'])
      for (const expectClass of ['NONE', 'EXPECT'])
        expect(
          parse('REQUEST_BEGIN', { ...begin, queryClass, expectClass })
        ).toBe('REQUEST_BEGIN')
    for (const bad of [
      { queryClass: 'beta=true' },
      { queryClass: undefined },
      { expectClass: '100-continue' },
      { expectClass: undefined },
      { query: 'EMPTY' }
    ])
      expect(() =>
        parse('REQUEST_BEGIN', JSON.parse(JSON.stringify({ ...begin, ...bad })))
      ).toThrow(expect.objectContaining({ code: 'PROTOCOL' }))
  })
  it('admits expectClass null only with the clientError classes', () => {
    const clientError = {
      ...begin,
      methodClass: 'OTHER',
      pathClass: 'OTHER',
      queryClass: 'OTHER',
      expectClass: null,
      authClass: 'ABSENT'
    }
    expect(parse('REQUEST_BEGIN', clientError)).toBe('REQUEST_BEGIN')
    for (const bad of [
      { methodClass: 'POST' },
      { pathClass: 'MESSAGES' },
      { queryClass: 'EMPTY' },
      { authClass: 'SENTINEL' }
    ])
      expect(() => parse('REQUEST_BEGIN', { ...clientError, ...bad })).toThrow(
        expect.objectContaining({ code: 'PROTOCOL' })
      )
  })
  it('requires queryClass EMPTY or BETA_TRUE in REQUEST', () => {
    const request = {
      caseId: 'TEXT',
      ordinal: 0,
      turn: 1,
      method: 'POST',
      path: '/v1/messages',
      queryClass: 'EMPTY',
      bodySha256: D,
      bytes: 3,
      markerVerified: true,
      contentType: 'JSON',
      contentEncoding: 'ABSENT',
      scriptAccepted: true
    }
    expect(parse('REQUEST', request)).toBe('REQUEST')
    expect(parse('REQUEST', { ...request, queryClass: 'BETA_TRUE' })).toBe(
      'REQUEST'
    )
    for (const queryClass of ['OTHER', null, 'beta=true'])
      expect(() => parse('REQUEST', { ...request, queryClass })).toThrow(
        expect.objectContaining({ code: 'PROTOCOL' })
      )
    const missing = { ...request }
    delete missing.queryClass
    expect(() => parse('REQUEST', missing)).toThrow(
      expect.objectContaining({ code: 'PROTOCOL' })
    )
  })
})
