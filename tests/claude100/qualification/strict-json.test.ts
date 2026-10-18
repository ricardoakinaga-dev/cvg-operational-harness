import { describe, expect, it } from 'vitest'
import { Buffer } from 'node:buffer'
import { parseStrictJson } from './strict-json.mjs'

const MAX_BYTES = 4 * 1024 * 1024
const MAX_STRING_BYTES = 65536

function invalid(input: unknown, options?: unknown, message?: RegExp) {
  let error: unknown
  try {
    parseStrictJson(
      input as Parameters<typeof parseStrictJson>[0],
      options as Parameters<typeof parseStrictJson>[1]
    )
  } catch (caught) {
    error = caught
  }
  expect(error).toBeInstanceOf(Error)
  expect(error).toMatchObject({
    name: 'QualificationError',
    status: 'INVALID_INPUT'
  })
  if (message) expect((error as Error).message).toMatch(message)
}

describe('SPEC0229 strict JSON: normative values', () => {
  it.each([
    'null',
    'true',
    'false',
    '0',
    '-0',
    '42',
    '-17',
    '1.25',
    '1e2',
    '1E-2',
    '1e+2',
    '-0e999',
    '1e-999',
    '9007199254740993',
    '1.7976931348623157e308',
    '-1.7976931348623157e308',
    '[]',
    '{}',
    '[null,true,false,[],{}]',
    '{"a":1,"b":[2,{"c":null}]}',
    ' \r\n\t {"x": [1, 2]} \t\r\n',
    '"\\\"\\\\\\/\\b\\f\\n\\r\\t"',
    '"\\u0041\\u00e9\\ud83d\\ude00"',
    '"\\ud800"',
    '"\\udc00"',
    '"é中😀"',
    '"é"',
    '"\u2028\u2029"',
    '"\ufeff"',
    '{"é":1,"é":2}',
    '{"a":1,"A":2}',
    '{"left":{"x":1},"right":{"x":2}}'
  ])('matches JSON.parse and JSON.stringify for %s', (source) => {
    const expected = JSON.parse(source)
    for (const input of [source, Buffer.from(source)]) {
      const actual = parseStrictJson(input)
      expect(actual).toStrictEqual(expected)
      expect(JSON.stringify(actual)).toBe(JSON.stringify(expected))
    }
  })

  it('retains lone UTF-16 surrogates in string input and escaped JSON', () => {
    for (const text of ['\ud800', '\udc00', '\ud800x', 'x\udc00']) {
      expect(parseStrictJson(`"${text}"`)).toBe(text)
      expect(parseStrictJson(JSON.stringify(text))).toBe(text)
    }
    expect(Object.is(parseStrictJson('-0'), -0)).toBe(true)
  })

  it('returns detached ordinary objects with only data properties', () => {
    const bytes = Buffer.from('{"a":[{"x":1}],"toJSON":"data"}')
    const value = parseStrictJson(bytes) as {
      a: { x: number }[]
      toJSON: string
    }
    bytes.fill(0)
    expect(value).toStrictEqual({ a: [{ x: 1 }], toJSON: 'data' })
    expect(Object.getPrototypeOf(value)).toBe(Object.prototype)
    expect(Object.getOwnPropertyDescriptor(value, 'a')).toEqual({
      value: [{ x: 1 }],
      enumerable: true,
      writable: true,
      configurable: true
    })
    const second = parseStrictJson('{"a":[{"x":1}],"toJSON":"data"}')
    value.a[0]!.x = 2
    expect(second).toStrictEqual({ a: [{ x: 1 }], toJSON: 'data' })
  })

  it('accepts a Uint8Array subview without parsing surrounding bytes', () => {
    const bytes = Buffer.from('garbage[1]trailer')
    expect(parseStrictJson(bytes.subarray(7, 10))).toEqual([1])
    expect(parseStrictJson(new Uint8Array(Buffer.from('true')))).toBe(true)
  })
})

describe('SPEC0229 strict JSON: grammar and duplicate keys', () => {
  it.each([
    '',
    ' ',
    '\ufeff{}',
    '\u00a0{}',
    '{}\u00a0',
    '\vnull',
    '\fnull',
    '{} []',
    'truefalse',
    'nullx',
    'false0',
    '[]x',
    '{}\0',
    'undefined',
    'NaN',
    'Infinity',
    '-Infinity',
    '+1',
    '01',
    '-01',
    '.1',
    '-.1',
    '1.',
    '1.e2',
    '1e',
    '1e+',
    '1e-',
    '1e+-2',
    '--1',
    '0x10',
    '1_000',
    '1n',
    '1e309',
    '-1e309',
    '9'.repeat(400),
    'True',
    'False',
    'NULL',
    'tru',
    'nul',
    '[',
    '{',
    '"',
    '[1,]',
    '[,1]',
    '[1,,2]',
    '[1 2]',
    '{"a":1,}',
    '{a:1}',
    "{'a':1}",
    '{"a" 1}',
    '{"a":}',
    '{"a":1 "b":2}',
    '{:1}',
    '//comment\n{}',
    '/*comment*/{}',
    '"\\x41"',
    '"\\v"',
    '"\\u123"',
    '"\\uZZZZ"',
    '"\\u12x4"',
    '"\\',
    '"a\n"'
  ])('rejects malformed input %s', (source) => {
    invalid(source)
    invalid(Buffer.from(source))
  })

  it.each(Array.from({ length: 32 }, (_, code) => code))(
    'rejects unescaped control U+%i',
    (code) => {
      invalid(`"a${String.fromCharCode(code)}b"`)
      invalid(`{"a${String.fromCharCode(code)}b":0}`)
    }
  )

  it.each([
    '{"a":1,"a":2}',
    '{"a":1,"\\u0061":2}',
    '{"a":1,"\\u0061":1}',
    '{"\\u0061":0,"a":1}',
    '{"é":1,"\\u00e9":2}',
    '{"😀":1,"\\ud83d\\ude00":2}',
    '{"\\ud800":1,"\\ud800":2}',
    '{"":1,"":2}',
    '{"a\\nb":1,"a\\u000ab":2}',
    '{"o":{"same":1,"same":2}}',
    '[{"same":1,"same":2}]'
  ])('rejects duplicate decoded keys %s', (source) => {
    invalid(source, undefined, /duplicate/i)
    invalid(Buffer.from(source), undefined, /duplicate/i)
  })

  it('rejects duplicates before consuming their second value', () => {
    invalid('{"a":0,"\\u0061":' + '['.repeat(65), undefined, /duplicate/i)
  })

  it.each([
    '__proto__',
    'constructor',
    'prototype',
    '\\u005f_proto__',
    '\\u0063onstructor',
    '\\u0070rototype'
  ])('fails closed on reserved key %s', (key) => {
    const before = Object.getOwnPropertyDescriptors(Object.prototype)
    invalid(`{"${key}":{"polluted":true}}`, undefined, /reserved/i)
    invalid(`[{"${key}":0}]`, undefined, /reserved/i)
    expect(Object.getOwnPropertyDescriptors(Object.prototype)).toEqual(before)
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })
})

describe('SPEC0229 strict JSON: fatal UTF-8', () => {
  it.each([
    [0x80],
    [0xc0, 0xaf],
    [0xc1, 0xbf],
    [0xc2],
    [0xc2, 0x20],
    [0xe0, 0x80, 0xaf],
    [0xe2, 0x82],
    [0xed, 0xa0, 0x80],
    [0xed, 0xbf, 0xbf],
    [0xf0, 0x80, 0x80, 0xaf],
    [0xf0, 0x9f, 0x98],
    [0xf4, 0x90, 0x80, 0x80],
    [0xf5, 0x80, 0x80, 0x80],
    [0xfe],
    [0xff]
  ])('rejects malformed byte sequence %j', (...bytes) => {
    invalid(new Uint8Array([0x22, ...bytes, 0x22]), undefined, /UTF-8/i)
  })

  it('does not strip a leading BOM or replace invalid bytes outside a string', () => {
    invalid(Buffer.from('\ufeff{}'))
    invalid(new Uint8Array([0x31, 0xff]), undefined, /UTF-8/i)
    expect(parseStrictJson(Buffer.from('"�"'))).toBe('�')
  })
})

describe('SPEC0229 strict JSON: bounded consumption', () => {
  it.each(['array', 'object', 'mixed'])(
    'limits %s nesting at 64 containers',
    (kind) => {
      function nest(depth: number) {
        let source = '0'
        for (let index = 0; index < depth; index++) {
          source =
            kind === 'object' || (kind === 'mixed' && index % 2 === 1)
              ? `{"a":${source}}`
              : `[${source}]`
        }
        return source
      }
      expect(parseStrictJson(nest(64))).toStrictEqual(JSON.parse(nest(64)))
      invalid(nest(65), undefined, /depth/i)
      expect(parseStrictJson(nest(2), { maxDepth: 2 })).toEqual(
        JSON.parse(nest(2))
      )
      invalid(nest(3), { maxDepth: 2 }, /depth/i)
    }
  )

  it('counts empty containers, but not scalar children, as nesting', () => {
    expect(parseStrictJson('[]', { maxDepth: 1 })).toEqual([])
    expect(parseStrictJson('{"a":0}', { maxDepth: 1 })).toEqual({ a: 0 })
    invalid('[[]]', { maxDepth: 1 }, /depth/i)
    invalid('{"a":{}}', { maxDepth: 1 }, /depth/i)
    expect(parseStrictJson('0', { maxDepth: 0 })).toBe(0)
    invalid('[]', { maxDepth: 0 }, /depth/i)
    invalid('['.repeat(20000), undefined, /depth/i)
  })

  it.each([
    ['ASCII', 'a'.repeat(MAX_STRING_BYTES)],
    ['two byte', 'é'.repeat(MAX_STRING_BYTES / 2)],
    ['three byte', '中'.repeat(Math.floor(MAX_STRING_BYTES / 3)) + 'a'],
    ['four byte', '😀'.repeat(MAX_STRING_BYTES / 4)]
  ])('enforces decoded string UTF-8 bytes at exact/+1: %s', (_label, value) => {
    expect(Buffer.byteLength(value)).toBe(MAX_STRING_BYTES)
    for (const text of [
      JSON.stringify(value),
      JSON.stringify(value).replaceAll('é', '\\u00e9')
    ]) {
      expect(parseStrictJson(text)).toBe(value)
      expect(parseStrictJson(Buffer.from(text))).toBe(value)
    }
    invalid(JSON.stringify(value + 'a'), undefined, /string/i)
    invalid(JSON.stringify({ [value + 'a']: 0 }), undefined, /string/i)
    expect(parseStrictJson(JSON.stringify({ [value]: 0 }))).toEqual({
      [value]: 0
    })
  })

  it.each([
    ['"\\u00e9"', 2, 'é'],
    ['"中"', 3, '中'],
    ['"\\ud83d\\ude00"', 4, '😀'],
    ['"\\ud800"', 3, '\ud800'],
    ['"\\udc00"', 3, '\udc00'],
    ['"\\ud800x"', 4, '\ud800x'],
    ['"\\ud800\\ud800"', 6, '\ud800\ud800'],
    ['"\\ud83d\ude00"', 4, '😀'],
    ['"\ud83d\\ude00"', 4, '😀'],
    ['"\\n"', 1, '\n']
  ])(
    'measures decoded UTF-8 including split surrogate pairs: %s',
    (source, size, value) => {
      expect(parseStrictJson(source, { maxStringBytes: size })).toBe(value)
      invalid(source, { maxStringBytes: size - 1 }, /string/i)
    }
  )

  it('bounds escaped strings after decoding and stops at the first excess unit', () => {
    const source = '"' + '\\ud83d\\ude00'.repeat(MAX_STRING_BYTES / 4) + '"'
    expect(parseStrictJson(source)).toBe('😀'.repeat(MAX_STRING_BYTES / 4))
    invalid(source.slice(0, -1) + 'a"', undefined, /string/i)
    invalid('"aaaa\\uZZZZ"', { maxStringBytes: 3 }, /string/i)
    expect(parseStrictJson('""', { maxStringBytes: 0 })).toBe('')
    expect(parseStrictJson('{"":0}', { maxStringBytes: 0 })).toEqual({ '': 0 })
    invalid('"a"', { maxStringBytes: 0 }, /string/i)
  })

  it('checks 4MiB input before UTF-8 decoding or parsing, exact/+1', () => {
    const exact = '0' + ' '.repeat(MAX_BYTES - 1)
    expect(parseStrictJson(exact)).toBe(0)
    expect(parseStrictJson(Buffer.from(exact))).toBe(0)
    invalid(exact + ' ', undefined, /bytes/i)
    invalid(Buffer.from(exact + ' '), undefined, /bytes/i)
    invalid(new Uint8Array(MAX_BYTES + 1).fill(0xff), undefined, /bytes/i)
  })

  it('measures source UTF-8 bytes including whitespace and escape spelling', () => {
    for (const source of ['"é"', '"😀"', '"\\u00e9"', ' \n0\t']) {
      const size = Buffer.byteLength(source)
      expect(parseStrictJson(source, { maxBytes: size })).toEqual(
        JSON.parse(source)
      )
      expect(parseStrictJson(Buffer.from(source), { maxBytes: size })).toEqual(
        JSON.parse(source)
      )
      invalid(source, { maxBytes: size - 1 }, /bytes/i)
      invalid(Buffer.from(source), { maxBytes: size - 1 }, /bytes/i)
    }
    invalid('0', { maxBytes: 0 }, /bytes/i)
  })
})

describe('SPEC0229 strict JSON: input and options never execute user code', () => {
  it.each([
    null,
    undefined,
    1,
    false,
    {},
    [],
    new String('null'),
    new ArrayBuffer(4),
    new Uint16Array([0x30]),
    new DataView(new ArrayBuffer(4))
  ])('rejects non-string/non-Uint8Array input %#', (value) => invalid(value))

  it.each([
    null,
    true,
    1,
    'x',
    [],
    new Date(0),
    { unknown: 1 },
    { maxDepth: 65 },
    { maxStringBytes: 65537 },
    { maxBytes: MAX_BYTES + 1 },
    ...['maxDepth', 'maxStringBytes', 'maxBytes'].flatMap((key) =>
      [-1, 0.5, NaN, Infinity, -Infinity, '1', null, undefined, 1n].map(
        (value) => ({ [key]: value })
      )
    )
  ])('rejects invalid options without coercion %#', (options) =>
    invalid('0', options)
  )

  it('accepts empty/frozen/null-prototype data options and all default caps', () => {
    for (const options of [
      {},
      Object.freeze({ maxDepth: 64 }),
      Object.assign(Object.create(null), { maxBytes: 1 }),
      { maxDepth: 64, maxStringBytes: 65536, maxBytes: MAX_BYTES }
    ]) {
      expect(parseStrictJson('0', options)).toBe(0)
    }
    invalid('0', { [Symbol('maxBytes')]: 1 })
    invalid('0', Object.create({ maxBytes: 1 }))
  })

  it('rejects accessors, proxies and coercion hooks without executing them', () => {
    let calls = 0
    const hook = () => {
      calls++
      throw new Error('user code executed')
    }
    invalid({ toString: hook, toJSON: hook, [Symbol.toPrimitive]: hook })
    invalid('0', {
      get maxBytes() {
        return hook()
      }
    })
    invalid('0', { maxBytes: { valueOf: hook } })
    invalid(
      '0',
      new Proxy({}, { ownKeys: hook, getPrototypeOf: hook, get: hook })
    )
    invalid(
      new Proxy(new Uint8Array([0x30]), { get: hook, getPrototypeOf: hook })
    )
    expect(calls).toBe(0)
  })

  it('reads Uint8Array internal bytes without user-defined getters', () => {
    let calls = 0
    class CustomBytes extends Uint8Array {
      get byteLength(): never {
        calls++
        throw new Error('getter')
      }
      get length(): never {
        calls++
        throw new Error('getter')
      }
      toString(): never {
        calls++
        throw new Error('coercion')
      }
    }
    expect(parseStrictJson(new CustomBytes([0x30]))).toBe(0)
    expect(calls).toBe(0)
  })

  it('does not evaluate code embedded in JSON data', () => {
    const source =
      '{"toJSON":"(() => { throw 1 })()","get x()":"process.exit()"}'
    expect(parseStrictJson(source)).toEqual(JSON.parse(source))
    invalid('(() => ({"a":1}))()')
  })
})

describe('SPEC0229 strict JSON: deterministic normative corpus', () => {
  it('matches native JSON on 512 generated documents, retaining complete data', () => {
    let seed = 0x229c100
    function random(max: number) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed % max
    }
    const strings = [
      '',
      'é中😀',
      '\ud800',
      '\udc00',
      '\ud800x\udc00',
      'é',
      'é',
      '\0\n\t\r\b\f',
      '\"\\/',
      '\u2028\u2029',
      '__proto__',
      'constructor',
      'prototype',
      'toJSON'
    ]
    const numbers = [
      0,
      -0,
      1,
      -17,
      0.125,
      1e-40,
      1e100,
      Number.MAX_VALUE,
      Number.MIN_VALUE,
      Number.MAX_SAFE_INTEGER + 1
    ]
    function document(depth: number): unknown {
      switch (random(depth > 0 ? 7 : 5)) {
        case 0:
          return null
        case 1:
          return false
        case 2:
          return true
        case 3:
          return strings[random(strings.length)]!
        case 4:
          return numbers[random(numbers.length)]!
        case 5:
          return Array.from({ length: random(6) }, () => document(depth - 1))
        default:
          return Object.fromEntries(
            Array.from({ length: random(6) }, (_, index) => [
              `key_${index}_${strings[random(10)]}`,
              document(depth - 1)
            ])
          )
      }
    }
    for (let index = 0; index < 512; index++) {
      const source = JSON.stringify(
        document(4),
        null,
        index % 2 ? 2 : undefined
      )
      const expected = JSON.parse(source)
      for (const input of [source, Buffer.from(source)]) {
        expect(parseStrictJson(input)).toStrictEqual(expected)
        expect(JSON.stringify(parseStrictJson(input))).toBe(
          JSON.stringify(expected)
        )
      }
      invalid(source + ' null')
    }
  })
})
