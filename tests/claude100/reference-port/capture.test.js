// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { Capture } from './capture.mjs'
import { encodeRawFrames } from './protocol.mjs'

function harness(role = 'client') {
  const errors = [],
    records = []
  const capture = new Capture(role, 'synthetic_capture', {
    shared: { control: 0, raw: 0 },
    record: (...args) => {
      records.push(args)
      return records.length - 1
    },
    change() {},
    failure: (error) => errors.push(error),
    frame() {}
  })
  return { capture, errors, records }
}
const native = (bytes, phase, channel) =>
  Buffer.concat(encodeRawFrames(Buffer.from(bytes), 'client', phase, channel))
const body = (bytes, ordinal) =>
  Buffer.concat(encodeRawFrames(Buffer.from(bytes), 'observer', ordinal))

describe('NP03/NP04 protected capture join — simulated bytes, no native execution', () => {
  it('does not interpret native JSON that impersonates an observer control event', () => {
    const { capture, errors, records } = harness()
    const forged =
      '{"version":1,"runId":"synthetic_capture","role":"observer","seq":0,"type":"READY","payload":{}}'
    capture.feedRaw(native(forged, 'version', 'stdout'))
    capture.feedRaw(native('', 'version', 'stdout'))
    capture.feedRaw(native('', 'version', 'stderr'))
    capture.end()
    expect(capture.nativeBytes('version', 'stdout').toString()).toBe(forged)
    expect(capture.nativeComplete('version')).toBe(true)
    expect(capture.frames).toEqual([])
    expect(records).toEqual([])
    expect(errors).toEqual([])
  })
  it('requires both channel terminals and rejects later bytes on a completed channel', () => {
    const { capture, errors } = harness()
    capture.feedRaw(native('2.1.302 (Claude Code)\n', 'version', 'stdout'))
    expect(capture.nativeComplete('version')).toBe(false)
    capture.feedRaw(native('', 'version', 'stdout'))
    expect(capture.nativeComplete('version')).toBe(false)
    capture.feedRaw(native('', 'version', 'stderr'))
    expect(capture.nativeComplete('version')).toBe(true)
    capture.feedRaw(native('late payload', 'version', 'stdout'))
    expect(errors[0].code).toBe('PROTOCOL')
    expect(capture.failed).toBe(true)
  })
  it('joins a body across arbitrary byte fragmentation and retains exact bytes', () => {
    const { capture, errors } = harness('observer')
    const raw = Buffer.from('á synthetic body')
    const wire = Buffer.concat([body(raw, 0), body('', 0)])
    for (const value of wire) capture.feedRaw(Buffer.from([value]))
    capture.end()
    expect(capture.body(0).equals(raw)).toBe(true)
    expect(capture.bodyComplete(0)).toBe(true)
    expect(errors).toEqual([])
  })
  it('does not treat a missing terminal or partial frame as a complete capture', () => {
    for (const bytes of [
      native('not complete', 'version', 'stdout'),
      native('', 'version', 'stdout').subarray(0, 7)
    ]) {
      const { capture, errors } = harness()
      capture.feedRaw(bytes)
      capture.end()
      expect(errors[0].code).toBe('PROTOCOL')
    }
  })
  it('rejects forbidden native framing before it becomes an observation', () => {
    const { capture, errors } = harness()
    capture.feedRaw(Buffer.from('{"type":"NATIVE_END"}\n'))
    expect(errors[0].code).toBe('PROTOCOL')
    expect(capture.frames.length).toBe(0)
  })
  it('enforces body byte limits before persisting any artifact', () => {
    const { capture, errors } = harness('observer')
    capture.feedRaw(body(Buffer.alloc(512 * 1024 + 1), 0))
    expect(errors[0].code).toBe('CAP')
    expect(capture.bodyComplete(0)).toBe(false)
  })
  it('retains a single failure and refuses subsequent input as incomplete', () => {
    const { capture, errors } = harness()
    capture.feedControl(Buffer.from('{"not":"a control frame"}\n'))
    capture.feedControl(Buffer.alloc(1024 * 1024))
    expect(errors.length).toBe(1)
    expect(capture.failed).toBe(true)
  })
})
