// @vitest-environment node
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { canonicalizeCompleteJson } from '@cvg/harness-contracts'
import { OperationalExecutionError } from '@cvg/harness'
import {
  JOURNAL_RESULT_MAX_BYTES,
  JOURNAL_RESULT_MAX_DEPTH,
  JOURNAL_RESULT_MAX_NODES,
  JOURNAL_RESULT_DATA_MAX_CHARS,
  JOURNAL_RESULT_STORAGE_MAX_BYTES,
  encodeJournalResult,
  decodeJournalResult,
  scanJournalResultJsonText,
  type JournalResultEnvelope
} from '../operational-effect-result-codec.ts'

const caps = { maxBytes: 1048576, maxDepth: 64, maxNodes: 1000000 }
const fromBytes = (bytes: Buffer): JournalResultEnvelope => ({
  encoding: 'base64',
  decodedBytes: bytes.length,
  decodedSha256: createHash('sha256').update(bytes).digest('hex'),
  data: bytes.toString('base64')
})
const fromText = (text: string): JournalResultEnvelope =>
  fromBytes(Buffer.from(text))
function error(
  action: () => unknown,
  code: 'validation_failed' | 'invalid_action',
  reason: string
): void {
  let caught: unknown
  try {
    action()
  } catch (failure) {
    caught = failure
  }
  expect(caught).toBeInstanceOf(OperationalExecutionError)
  expect(caught).toMatchObject({ code, message: reason })
  expect((caught as Error).cause).toBeUndefined()
}
const corrupt = (payload: unknown): void =>
  error(
    () => decodeJournalResult(payload),
    'invalid_action',
    'JOURNAL_RESULT_CORRUPT'
  )
const invalid = (value: unknown): void =>
  error(
    () => encodeJournalResult(value),
    'validation_failed',
    'JOURNAL_RESULT_INVALID'
  )
const tooLarge = (value: unknown): void =>
  error(
    () => encodeJournalResult(value),
    'validation_failed',
    'JOURNAL_RESULT_TOO_LARGE'
  )
afterEach(() => vi.restoreAllMocks())

describe('journal result codec — component only, not native J01–J04', () => {
  it('keeps the five frozen caps', () => {
    expect([
      JOURNAL_RESULT_MAX_BYTES,
      JOURNAL_RESULT_MAX_DEPTH,
      JOURNAL_RESULT_MAX_NODES,
      JOURNAL_RESULT_DATA_MAX_CHARS,
      JOURNAL_RESULT_STORAGE_MAX_BYTES
    ]).toEqual([1048576, 64, 1000000, 1398104, 1398616])
  })
  it.each([
    ['null', null],
    ['false', false],
    ['true', true],
    ['zero', 0],
    ['negative', -2.5],
    ['smallest', Number.MIN_VALUE],
    ['largest', Number.MAX_VALUE],
    ['empty string', ''],
    ['JSON-looking number', '42'],
    ['JSON-looking null', 'null'],
    ['JSON-looking object', '{}'],
    ['JSON-looking quoted string', '"x"'],
    ['empty array', []],
    ['empty object', {}],
    ['NUL4096', '\0'.repeat(4096)],
    ['escapes', '"\\\b\f\n\r\t\0'],
    ['Unicode', 'é e\u0301 😀 𐀀 \uffff'],
    ['nested', { z: [null, false, 0, '', [], {}], a: { b: 2 } }],
    [
      'apparent envelope',
      {
        encoding: 'base64',
        decodedBytes: 1,
        decodedSha256: 'fake',
        data: 'MA=='
      }
    ],
    [
      'apparent version',
      { result_storage_version: 1, result: null, storageCodec: 'base64' }
    ]
  ])(
    'roundtrips %s by canonical bytes with independent hash',
    (_label, value) => {
      const envelope = encodeJournalResult(value)
      const text = canonicalizeCompleteJson(value, caps)
      expect(envelope).toEqual(fromText(text))
      expect(Object.isFrozen(envelope)).toBe(true)
      const decoded = decodeJournalResult(envelope)
      expect(decoded).toStrictEqual(value)
      expect(canonicalizeCompleteJson(decoded, caps)).toBe(text)
    }
  )
  it('uses exact UTF-16 key order and preserves reserved/NUL keys without prototype mutation', () => {
    const object = Object.create(null) as Record<string, unknown>
    for (const key of [
      '\ue000',
      '😀',
      '__proto__',
      'constructor',
      'prototype',
      '',
      '\0'
    ]) {
      Object.defineProperty(object, key, {
        value: { null: null },
        enumerable: true
      })
    }
    const text =
      '{"":{"null":null},"\\u0000":{"null":null},"__proto__":{"null":null},"constructor":{"null":null},"prototype":{"null":null},"😀":{"null":null},"\ue000":{"null":null}}'
    expect(encodeJournalResult(object)).toEqual(fromText(text))
    const decoded = decodeJournalResult(encodeJournalResult(object)) as Record<
      string,
      unknown
    >
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
    expect(Object.hasOwn(decoded, '__proto__')).toBe(true)
    expect(
      Object.getOwnPropertyDescriptor(decoded, '__proto__')?.value
    ).toEqual({ null: null })
    expect(Object.hasOwn(decoded, '\0')).toBe(true)
    expect(({} as Record<string, unknown>)['null']).toBeUndefined()
  })
  it('repeats acyclic aliases by value and snapshots without mutation', () => {
    const shared = { n: 1 }
    const input = Object.freeze({ a: shared, b: shared })
    const envelope = encodeJournalResult(input)
    shared.n = 2
    const decoded = decodeJournalResult(envelope) as { a: unknown; b: unknown }
    expect(decoded).toEqual({ a: { n: 1 }, b: { n: 1 } })
    expect(decoded.a).not.toBe(decoded.b)
  })
  it('includes all own data properties as the existing canonicalizer does', () => {
    const input = Object.defineProperty({}, 'hidden', { value: false })
    expect(decodeJournalResult(encodeJournalResult(input))).toEqual({
      hidden: false
    })
    const envelope = Object.create(null)
    for (const [name, value] of Object.entries(fromText('0')))
      Object.defineProperty(envelope, name, { value })
    expect(decodeJournalResult(envelope)).toBe(0)
  })
  it('does not normalize distinct scalar Unicode strings or keys', () => {
    const input = { é: 'é', 'e\u0301': 'e\u0301', bom: '\ufeff' }
    expect(decodeJournalResult(encodeJournalResult(input))).toStrictEqual(input)
    expect(encodeJournalResult('é').data).not.toBe(
      encodeJournalResult('e\u0301').data
    )
  })

  it.each([
    ['undefined', undefined],
    ['BigInt', 1n],
    ['symbol', Symbol('synthetic')],
    ['function', () => 1],
    ['NaN', NaN],
    ['infinity', Infinity],
    ['negative infinity', -Infinity],
    ['negative zero', -0],
    ['Date', new Date(0)],
    ['boxed', new String('synthetic')],
    ['Map', new Map()],
    ['Set', new Set()],
    ['typed array', new Uint8Array(1)],
    ['custom prototype', Object.create({ inherited: 1 })],
    ['hole', new Array(1)],
    ['undefined array member', [undefined]],
    ['undefined member', { x: undefined }],
    ['high surrogate', '\ud800'],
    ['low surrogate', '\udfff'],
    ['key surrogate', { '\ud800': 1 }],
    ['nested surrogate', { x: ['\ud800'] }],
    ['array extra property', Object.assign([1], { extra: 2 })],
    ['symbol key', { [Symbol('synthetic')]: 1 }],
    ['array subclass', Object.setPrototypeOf([1], {})]
  ])('rejects strict-domain violation: %s', (_label, value) => invalid(value))
  it('rejects cycles, including an alias back to an ancestor', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    invalid(cyclic)
    const array: unknown[] = []
    array.push({ back: array })
    invalid(array)
  })
  it('never invokes getter, toJSON or error coercion hooks on encode', () => {
    const hook = vi.fn(() => {
      throw new Error('SYNTHETIC_SECRET')
    })
    invalid(Object.defineProperty({}, 'x', { get: hook }))
    invalid({ toJSON: hook })
    invalid(Object.defineProperty([], '0', { get: hook }))
    invalid(Object.create({ toJSON: hook }))
    expect(hook).not.toHaveBeenCalled()
  })

  const base = fromText('0')
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['primitive', 'MA=='],
    ['array', []],
    ['custom prototype', Object.assign(Object.create({}), base)],
    ['boxed', new String('x')],
    ['missing', { encoding: 'base64', decodedBytes: 1, data: 'MA==' }],
    ['extra', { ...base, extra: 'SYNTHETIC_SECRET' }],
    ['symbol', { ...base, [Symbol()]: 1 }],
    ['encoding', { ...base, encoding: 'BASE64' }],
    ['unknown version', { ...base, version: 1 }],
    ['bytes string', { ...base, decodedBytes: '1' }],
    ['bytes boxed', { ...base, decodedBytes: new Number(1) }],
    ['bytes zero', { ...base, decodedBytes: 0 }],
    ['bytes negative zero', { ...base, decodedBytes: -0 }],
    ['bytes negative', { ...base, decodedBytes: -1 }],
    ['bytes fractional', { ...base, decodedBytes: 1.5 }],
    ['bytes infinite', { ...base, decodedBytes: Infinity }],
    ['bytes NaN', { ...base, decodedBytes: NaN }],
    [
      'hash uppercase',
      { ...base, decodedSha256: base.decodedSha256.toUpperCase() }
    ],
    ['hash prefix', { ...base, decodedSha256: 'sha256:' + base.decodedSha256 }],
    ['hash mismatch', { ...base, decodedSha256: '0'.repeat(64) }],
    ['hash nonhex', { ...base, decodedSha256: 'x'.repeat(64) }],
    [
      'hash newline',
      { ...base, decodedSha256: base.decodedSha256.slice(1) + '\n' }
    ],
    ['hash wrong type', { ...base, decodedSha256: null }],
    ['data wrong type', { ...base, data: 0 }],
    ['data boxed', { ...base, data: new String('MA==') }],
    ['base64 whitespace', { ...base, data: 'MA \n' }],
    ['base64 URL alphabet', { ...base, data: '_A==' }],
    ['base64 Unicode', { ...base, data: 'ＭA==' }],
    ['base64 NUL', { ...base, data: 'M\0==' }],
    ['base64 unpadded', { ...base, data: 'MA' }],
    ['base64 early padding', { ...base, data: 'M=A=' }],
    ['base64 excessive padding', { ...base, data: 'M===' }],
    ['base64 pad bits', { ...base, data: 'MB==' }],
    ['declared length mismatch', { ...base, decodedBytes: 2 }],
    [
      'nonenumerable extra',
      Object.defineProperty({ ...base }, 'hidden', { value: 1 })
    ]
  ])('rejects envelope corruption: %s', (_label, payload) => corrupt(payload))
  it.each(['encoding', 'decodedBytes', 'decodedSha256', 'data'])(
    'does not invoke envelope getter for %s',
    (key) => {
      const hook = vi.fn(() => {
        throw new Error('SYNTHETIC_SECRET')
      })
      corrupt(Object.defineProperty({ ...base }, key, { get: hook }))
      expect(hook).not.toHaveBeenCalled()
    }
  )
  it('never invokes a payload toJSON hook', () => {
    const hook = vi.fn()
    corrupt({ ...base, toJSON: hook })
    expect(hook).not.toHaveBeenCalled()
  })
  it('rejects a single corrupted byte without exposing it', () => {
    const envelope = encodeJournalResult('SYNTHETIC_SECRET')
    corrupt({ ...envelope, data: fromText('SYNTHETIC_SECRET!!').data })
  })
  it.each([
    ['overlong UTF8', [0x22, 0xc0, 0x80, 0x22]],
    ['truncated UTF8', [0x22, 0xe2, 0x82]],
    ['UTF8 surrogate', [0x22, 0xed, 0xa0, 0x80, 0x22]],
    ['invalid continuation', [0x22, 0x80, 0x22]],
    ['out of range', [0x22, 0xf4, 0x90, 0x80, 0x80, 0x22]],
    ['BOM', [0xef, 0xbb, 0xbf, 0x30]]
  ])('rejects %s before JSON.parse', (_label, values) => {
    const payload = fromBytes(Buffer.from(values))
    const parse = vi.spyOn(JSON, 'parse')
    corrupt(payload)
    expect(parse).not.toHaveBeenCalled()
  })

  it.each([
    '',
    '{',
    '[',
    'undefined',
    'NaN',
    'true false',
    '0 1',
    '0x1',
    '01',
    '--1',
    '+1',
    '.1',
    '1.',
    '1e',
    '1e+',
    '[1,]',
    '{"a":1,}',
    '{a:1}',
    '{"a" 1}',
    '"\\x00"',
    '"\\u0"',
    '"unfinished',
    '"\0"',
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"x":{"a":1,"a":1}}',
    '{"__proto__":1,"__proto__":2}',
    '[0]trailing',
    '/*comment*/0'
  ])('rejects malformed/duplicate/trailing JSON before parsing: %j', (text) => {
    const payload = fromText(text)
    const parse = vi.spyOn(JSON, 'parse')
    corrupt(payload)
    expect(parse).not.toHaveBeenCalled()
  })
  it.each([
    ' 0',
    '0\n',
    '{"b":1,"a":2}',
    '{ "a":1}',
    '1.0',
    '1e0',
    '1E+1',
    '-0',
    '1e999',
    '"\\u0061"',
    '"\\/"',
    '"\\u000a"',
    '"\\ud800"',
    '"\\udfff"',
    '{"\\ud800":0}',
    '"\\ud83d\\ude00"'
  ])('rejects valid JSON outside the canonical strict domain: %j', (text) =>
    corrupt(fromText(text))
  )
  it('allows equal keys in separate objects and escaped punctuation inside strings', () => {
    const input = [{ a: '"[{},:]\\' }, { a: false }]
    expect(decodeJournalResult(encodeJournalResult(input))).toEqual(input)
  })

  it('accepts exactly 1MiB and maximum base64 length, rejects +1 before Buffer allocation', () => {
    const input = 'a'.repeat(1048574)
    const envelope = encodeJournalResult(input)
    expect(envelope.decodedBytes).toBe(1048576)
    expect(envelope.data.length).toBe(1398104)
    expect(Buffer.byteLength(JSON.stringify(envelope))).toBeLessThanOrEqual(
      1398616
    )
    expect(decodeJournalResult(envelope)).toBe(input)
    const allocate = vi.spyOn(Buffer, 'from')
    tooLarge(input + 'a')
    expect(allocate).not.toHaveBeenCalled()
  })
  it.each([
    ['escaped NUL', '\0', 6],
    ['three byte Unicode', '界', 3],
    ['scalar pair', '😀', 4]
  ])(
    'bounds escaped UTF8 bytes for %s before large serialization/allocation',
    (_label, unit, width) => {
      const count = Math.floor((1048576 - 2) / Number(width))
      const input = String(unit).repeat(count)
      expect(encodeJournalResult(input).decodedBytes).toBe(
        2 + count * Number(width)
      )
      const stringify = vi.spyOn(JSON, 'stringify')
      const allocate = vi.spyOn(Buffer, 'from')
      tooLarge(input + String(unit))
      expect(stringify).not.toHaveBeenCalled()
      expect(allocate).not.toHaveBeenCalled()
    }
  )
  it('bounds huge keys before escaping', () => {
    const input = { ['\0'.repeat(200000)]: 0 }
    const allocate = vi.spyOn(Buffer, 'from')
    tooLarge(input)
    expect(allocate).not.toHaveBeenCalled()
  })
  it('rejects oversized envelope declarations/data before Buffer or JSON.parse', () => {
    const inputs = [
      { ...base, decodedBytes: 1048577 },
      { ...base, data: 'A'.repeat(1398105) },
      { ...base, data: 'A'.repeat(1398617) },
      { ...base, decodedBytes: Number.MAX_SAFE_INTEGER },
      { ...base, data: 'A'.repeat(1398104), decodedBytes: 1 }
    ]
    const allocate = vi.spyOn(Buffer, 'from'),
      parse = vi.spyOn(JSON, 'parse')
    for (const input of inputs) corrupt(input)
    expect(allocate).not.toHaveBeenCalled()
    expect(parse).not.toHaveBeenCalled()
  })
  it('accepts root depth64, rejects65 before parsing the graph', () => {
    const text64 = '['.repeat(63) + '0' + ']'.repeat(63)
    expect(encodeJournalResult(decodeJournalResult(fromText(text64)))).toEqual(
      fromText(text64)
    )
    const payload65 = fromText('[' + text64 + ']')
    const parse = vi.spyOn(JSON, 'parse')
    corrupt(payload65)
    expect(parse).not.toHaveBeenCalled()
    let value: unknown = 0
    for (let i = 0; i < 64; i++) value = [value]
    tooLarge(value)
  })
  it('enforces byte dominance at the public codec rather than widening the million-node cap', () => {
    const value = new Array(524287).fill(0)
    expect(encodeJournalResult(value).decodedBytes).toBe(1048575)
    tooLarge([...value, 0])
    tooLarge(new Array(999999).fill(0))
  })
})

describe('isolated scanner/canonicalizer component complexity seam — no native or adapter credit', () => {
  it('discriminates exactly 1000000 and 1000001 value nodes independently of the byte cap', () => {
    const values = new Array(999999).fill(0)
    const text = '[' + values.join(',') + ']'
    expect(() => scanJournalResultJsonText(text)).not.toThrow()
    expect(() => scanJournalResultJsonText(text.slice(0, -1) + ',0]')).toThrow(
      'JOURNAL_RESULT_CORRUPT'
    )
    expect(
      canonicalizeCompleteJson(values, { ...caps, maxBytes: 2000001 })
    ).toBe(text)
    expect(() =>
      canonicalizeCompleteJson([...values, 0], { ...caps, maxBytes: 2000001 })
    ).toThrow('JSON complexity limit exceeded')
  })
  it('counts values, not keys; root counts once; repeats aliases per occurrence', () => {
    expect(() =>
      scanJournalResultJsonText('{"a":0,"b":0}', { maxNodes: 3 })
    ).not.toThrow()
    expect(() =>
      scanJournalResultJsonText('{"a":0,"b":0}', { maxNodes: 2 })
    ).toThrow()
    expect(() =>
      scanJournalResultJsonText('0', { maxDepth: 1, maxNodes: 1 })
    ).not.toThrow()
    expect(() => scanJournalResultJsonText('[0]', { maxDepth: 1 })).toThrow()
    const shared = { x: 0 }
    expect(() =>
      canonicalizeCompleteJson([shared, shared], { ...caps, maxNodes: 5 })
    ).not.toThrow()
    expect(() =>
      canonicalizeCompleteJson([shared, shared], { ...caps, maxNodes: 4 })
    ).toThrow()
  })
  it.each([
    { maxDepth: 0 },
    { maxDepth: 65 },
    { maxDepth: NaN },
    { maxDepth: 1.5 },
    { maxNodes: 0 },
    { maxNodes: Infinity },
    { maxNodes: -1 },
    { maxNodes: 1.5 }
  ])('rejects invalid scanner limits %j', (options) => {
    expect(() => scanJournalResultJsonText('0', options)).toThrow(
      'JOURNAL_RESULT_CORRUPT'
    )
  })
  it('scans a grammar corpus without constructing the JSON graph', () => {
    const parse = vi.spyOn(JSON, 'parse')
    for (const text of [
      '0',
      'true',
      'false',
      'null',
      '[]',
      '{}',
      '[1,-2.5e+3]',
      '{"a":"\\u0000\\t\\b\\f\\r\\n\\/\\\\\\\""}'
    ]) {
      scanJournalResultJsonText(text)
    }
    expect(parse).not.toHaveBeenCalled()
  })
})
