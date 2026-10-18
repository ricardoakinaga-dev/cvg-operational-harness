import { Buffer } from 'node:buffer'
import { TextDecoder, types } from 'node:util'
import { QualificationError } from './errors.mjs'

const LIMITS = Object.freeze({
  maxDepth: 64,
  maxStringBytes: 65536,
  maxBytes: 4 * 1024 * 1024
})
const RESERVED_KEYS = new Set(['__proto__', 'constructor', 'prototype'])
const byteLengthOf = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype),
  'byteLength'
).get

function fail(message) {
  throw new QualificationError('INVALID_INPUT', message)
}

function readLimits(options) {
  const limits = { ...LIMITS, numericDomain: 'LEGACY_FINITE' }
  if (options === undefined) return limits
  if (
    options === null ||
    typeof options !== 'object' ||
    types.isProxy(options)
  ) {
    fail('JSON options must be a plain data object')
  }
  const prototype = Object.getPrototypeOf(options)
  if (prototype !== null && prototype !== Object.prototype) {
    fail('JSON options must be a plain data object')
  }
  const descriptors = Object.getOwnPropertyDescriptors(options)
  for (const key of Reflect.ownKeys(descriptors)) {
    if (
      typeof key !== 'string' ||
      (!Object.hasOwn(LIMITS, key) && key !== 'numericDomain')
    ) {
      fail('Unknown JSON limit option')
    }
    const descriptor = descriptors[key]
    if (!Object.hasOwn(descriptor, 'value')) {
      fail('JSON limit options must be data properties')
    }
    const value = descriptor.value
    if (key === 'numericDomain') {
      if (value !== 'LEGACY_FINITE' && value !== 'CODEX_EXACT_DECIMAL')
        fail('Unknown JSON numeric domain')
      limits.numericDomain = value
      continue
    }
    if (!Number.isInteger(value) || value < 0 || value > LIMITS[key]) {
      fail(`JSON ${key} must be an integer from 0 to ${LIMITS[key]}`)
    }
    limits[key] = value
  }
  return limits
}

function readSource(input, maxBytes) {
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > maxBytes) {
      fail('JSON input exceeds maxBytes')
    }
    // Preserve UTF-16 code units, including lone surrogates, as JSON.parse does.
    return input
  }
  if (types.isProxy(input) || !types.isUint8Array(input)) {
    fail('JSON input must be a string or Uint8Array')
  }
  // Use the intrinsic accessor; a Uint8Array subclass may override byteLength.
  if (byteLengthOf.call(input) > maxBytes) fail('JSON input exceeds maxBytes')
  try {
    // Preserve BOM as a code point, so the JSON grammar rejects it explicitly.
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      input
    )
  } catch {
    fail('JSON input is not valid UTF-8')
  }
}

// Tokens have already passed the JSON number grammar. Keep decimal work
// linear in bounded source bytes; never expand a power or parse a giant exponent.
function decimalParts(token, maxBytes) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token)
  const fraction = match[3] ?? ''
  let digits = (match[2] + fraction).replace(/^0+/, '')
  if (!digits) return ['+', '0', 0]
  let exponentToken = match[4] ?? '0'
  const negativeExponent = exponentToken.startsWith('-')
  exponentToken = exponentToken.replace(/^[+-]/, '').replace(/^0+/, '') || '0'
  const bound = String(maxBytes + 400)
  if (
    exponentToken.length > bound.length ||
    (exponentToken.length === bound.length && exponentToken > bound)
  )
    fail('JSON decimal exponent exceeds bounded numeric domain')
  let exponent =
    Number(exponentToken) * (negativeExponent ? -1 : 1) - fraction.length
  let end = digits.length
  while (end > 0 && digits.charCodeAt(end - 1) === 0x30) end--
  exponent += digits.length - end
  digits = digits.slice(0, end)
  return [match[1] || '+', digits, exponent]
}

function assertCodexNumber(token, value, maxBytes) {
  if (
    (Number.isInteger(value) && !Number.isSafeInteger(value)) ||
    Object.is(value, -0)
  )
    fail('JSON number is outside the CodeX safe numeric domain')
  const original = decimalParts(token, maxBytes)
  const serialized = decimalParts(JSON.stringify(value), maxBytes)
  if (original.some((component, index) => component !== serialized[index]))
    fail('JSON number loses exact decimal value on serialization')
}

/**
 * Parse bounded JSON without revivers, coercion or executable user properties.
 * Depth counts containers: a root array/object is 1; a scalar has depth 0.
 * Reserved object keys fail closed rather than being removed or renamed.
 */
export function parseStrictJson(input, options) {
  const limits = readLimits(options)
  const source = readSource(input, limits.maxBytes)
  let offset = 0

  function syntax(message) {
    fail(`${message} at JSON offset ${offset}`)
  }

  function whitespace() {
    while (offset < source.length) {
      const code = source.charCodeAt(offset)
      if (code !== 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d)
        break
      offset++
    }
  }

  function string() {
    offset++ // Opening quote is checked by the caller.
    let value = ''
    let bytes = 0
    let previousHighSurrogate = false
    while (offset < source.length) {
      let code = source.charCodeAt(offset++)
      if (code === 0x22) return value
      if (code < 0x20) syntax('Unescaped control character')
      if (code === 0x5c) {
        const escape = source[offset++]
        switch (escape) {
          case '"':
            code = 0x22
            break
          case '\\':
            code = 0x5c
            break
          case '/':
            code = 0x2f
            break
          case 'b':
            code = 0x08
            break
          case 'f':
            code = 0x0c
            break
          case 'n':
            code = 0x0a
            break
          case 'r':
            code = 0x0d
            break
          case 't':
            code = 0x09
            break
          case 'u': {
            code = 0
            for (let index = 0; index < 4; index++) {
              const hex = source.charCodeAt(offset++)
              let digit
              if (hex >= 0x30 && hex <= 0x39) digit = hex - 0x30
              else if (hex >= 0x41 && hex <= 0x46) digit = hex - 0x41 + 10
              else if (hex >= 0x61 && hex <= 0x66) digit = hex - 0x61 + 10
              else syntax('Invalid Unicode escape')
              code = code * 16 + digit
            }
            break
          }
          default:
            syntax('Invalid string escape')
        }
      }
      // A high surrogate initially counts as a lone surrogate (3 UTF-8 bytes).
      // A following low surrogate adds 1, giving 4 bytes for the decoded pair.
      const lowSurrogate = code >= 0xdc00 && code <= 0xdfff
      bytes +=
        code <= 0x7f
          ? 1
          : code <= 0x7ff
            ? 2
            : lowSurrogate && previousHighSurrogate
              ? 1
              : 3
      if (bytes > limits.maxStringBytes)
        syntax('JSON string exceeds maxStringBytes')
      previousHighSurrogate = code >= 0xd800 && code <= 0xdbff
      value += String.fromCharCode(code)
    }
    syntax('Unterminated JSON string')
  }

  function digit() {
    const code = source.charCodeAt(offset)
    return code >= 0x30 && code <= 0x39
  }

  function number() {
    const start = offset
    if (source[offset] === '-') offset++
    if (source[offset] === '0') {
      offset++
      if (digit()) syntax('Leading zero in JSON number')
    } else {
      const code = source.charCodeAt(offset)
      if (!(code >= 0x31 && code <= 0x39)) syntax('Invalid JSON number')
      while (digit()) offset++
    }
    if (source[offset] === '.') {
      offset++
      if (!digit()) syntax('Missing fractional digit')
      while (digit()) offset++
    }
    if (source[offset] === 'e' || source[offset] === 'E') {
      offset++
      if (source[offset] === '+' || source[offset] === '-') offset++
      if (!digit()) syntax('Missing exponent digit')
      while (digit()) offset++
    }
    const token = source.slice(start, offset)
    const value = Number(token)
    if (!Number.isFinite(value)) syntax('Non-finite JSON number')
    if (limits.numericDomain === 'CODEX_EXACT_DECIMAL')
      assertCodexNumber(token, value, limits.maxBytes)
    return value
  }

  function container(depth, object) {
    if (depth > limits.maxDepth) syntax('JSON depth exceeds maxDepth')
    offset++
    const result = object ? {} : []
    const seen = object ? new Set() : null
    const end = object ? '}' : ']'
    whitespace()
    if (source[offset] === end) {
      offset++
      return result
    }
    while (true) {
      if (object) {
        if (source[offset] !== '"') syntax('Expected JSON object key')
        const key = string()
        if (RESERVED_KEYS.has(key)) syntax('Reserved JSON object key')
        if (seen.has(key)) syntax('Duplicate JSON object key')
        seen.add(key)
        whitespace()
        if (source[offset++] !== ':') syntax('Expected colon after JSON key')
        const child = value(depth)
        Object.defineProperty(result, key, {
          value: child,
          enumerable: true,
          writable: true,
          configurable: true
        })
      } else {
        result.push(value(depth))
      }
      whitespace()
      const next = source[offset++]
      if (next === end) return result
      if (next !== ',') syntax('Expected comma or end of JSON container')
      whitespace()
    }
  }

  function value(depth) {
    whitespace()
    const next = source[offset]
    if (next === '"') return string()
    if (next === '{') return container(depth + 1, true)
    if (next === '[') return container(depth + 1, false)
    if (next === '-' || digit()) return number()
    for (const [literal, scalar] of [
      ['true', true],
      ['false', false],
      ['null', null]
    ]) {
      if (source.startsWith(literal, offset)) {
        offset += literal.length
        return scalar
      }
    }
    syntax('Expected JSON value')
  }

  const result = value(0)
  whitespace()
  if (offset !== source.length) syntax('Content after end of JSON value')
  return result
}
