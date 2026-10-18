import { createHash } from 'node:crypto'
import { TextDecoder } from 'node:util'
import {
  canonicalizeCompleteJson,
  CompleteJsonError
} from '@cvg/harness-contracts'
import { OperationalExecutionError } from '@cvg/harness'

export const JOURNAL_RESULT_MAX_BYTES = 1048576
export const JOURNAL_RESULT_MAX_DEPTH = 64
export const JOURNAL_RESULT_MAX_NODES = 1000000
export const JOURNAL_RESULT_DATA_MAX_CHARS = 1398104
export const JOURNAL_RESULT_STORAGE_MAX_BYTES = 1398616

export interface JournalResultEnvelope {
  readonly encoding: 'base64'
  readonly decodedBytes: number
  readonly decodedSha256: string
  readonly data: string
}

const limits = {
  maxBytes: JOURNAL_RESULT_MAX_BYTES,
  maxDepth: JOURNAL_RESULT_MAX_DEPTH,
  maxNodes: JOURNAL_RESULT_MAX_NODES
}

function corrupt(): never {
  throw new OperationalExecutionError(
    'invalid_action',
    'JOURNAL_RESULT_CORRUPT'
  )
}

export function encodeJournalResult(value: unknown): JournalResultEnvelope {
  try {
    // The existing canonicalizer bounds escaped UTF-8 before growing chunks.
    const text = canonicalizeCompleteJson(value, limits)
    const bytes = Buffer.from(text, 'utf8')
    return Object.freeze({
      encoding: 'base64',
      decodedBytes: bytes.length,
      decodedSha256: createHash('sha256').update(bytes).digest('hex'),
      data: bytes.toString('base64')
    })
  } catch (error) {
    const tooLarge =
      error instanceof CompleteJsonError &&
      (error.code === 'RESULT_TOO_LARGE' || error.code === 'RESULT_COMPLEXITY')
    throw new OperationalExecutionError(
      'validation_failed',
      tooLarge ? 'JOURNAL_RESULT_TOO_LARGE' : 'JOURNAL_RESULT_INVALID'
    )
  }
}

export function decodeJournalResult(payload: unknown): unknown {
  try {
    if (payload === null || typeof payload !== 'object') corrupt()
    const prototype = Object.getPrototypeOf(payload)
    if (prototype !== Object.prototype && prototype !== null) corrupt()
    const keys = Reflect.ownKeys(payload)
    const names = ['encoding', 'decodedBytes', 'decodedSha256', 'data'] as const
    if (
      keys.length !== names.length ||
      keys.some((key) => !names.includes(key as (typeof names)[number]))
    )
      corrupt()
    const fields = names.map((name) => {
      const descriptor = Object.getOwnPropertyDescriptor(payload, name)
      if (!descriptor || !('value' in descriptor)) corrupt()
      return descriptor.value as unknown
    })
    const [encoding, decodedBytes, decodedSha256, data] = fields
    if (
      encoding !== 'base64' ||
      typeof decodedBytes !== 'number' ||
      !Number.isSafeInteger(decodedBytes) ||
      decodedBytes < 1 ||
      decodedBytes > JOURNAL_RESULT_MAX_BYTES ||
      typeof decodedSha256 !== 'string' ||
      decodedSha256.length !== 64 ||
      !/^[0-9a-f]{64}$/.test(decodedSha256) ||
      typeof data !== 'string' ||
      data.length > JOURNAL_RESULT_DATA_MAX_CHARS ||
      data.length !== 4 * Math.ceil(decodedBytes / 3)
    )
      corrupt()
    // Four fixed fields and bounded numeric/hash/encoding values use <512
    // expanded JSONB bytes beyond data. No serialization or hooks are needed.
    if (data.length + 512 > JOURNAL_RESULT_STORAGE_MAX_BYTES) corrupt()
    const padding = (3 - (decodedBytes % 3)) % 3
    const contentLength = data.length - padding
    for (let i = 0; i < data.length; i++) {
      const unit = data.charCodeAt(i)
      const alphabet =
        (unit >= 65 && unit <= 90) ||
        (unit >= 97 && unit <= 122) ||
        (unit >= 48 && unit <= 57) ||
        unit === 43 ||
        unit === 47
      if (i < contentLength ? !alphabet : unit !== 61) corrupt()
    }
    const bytes = Buffer.from(data, 'base64')
    if (
      bytes.length !== decodedBytes ||
      bytes.toString('base64') !== data ||
      createHash('sha256').update(bytes).digest('hex') !== decodedSha256
    )
      corrupt()
    // TextDecoder normally strips a BOM, so reject it in bytes first.
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) corrupt()
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    scanJournalResultJsonText(text)
    const value: unknown = JSON.parse(text)
    if (canonicalizeCompleteJson(value, limits) !== text) corrupt()
    return value
  } catch {
    // Never surface parser messages, hook errors, content or base64.
    corrupt()
  }
}

/** Pre-graph grammar/duplicate/complexity scan. Test seam is not an adapter cap. */
export function scanJournalResultJsonText(
  text: string,
  options: { maxDepth?: number; maxNodes?: number } = {}
): void {
  const maxDepth = options.maxDepth ?? JOURNAL_RESULT_MAX_DEPTH
  const maxNodes = options.maxNodes ?? JOURNAL_RESULT_MAX_NODES
  if (
    typeof text !== 'string' ||
    !Number.isSafeInteger(maxDepth) ||
    maxDepth < 1 ||
    maxDepth > JOURNAL_RESULT_MAX_DEPTH ||
    !Number.isSafeInteger(maxNodes) ||
    maxNodes < 1
  )
    corrupt()
  let position = 0
  let nodes = 0
  const whitespace = (): void => {
    while (' \t\r\n'.includes(text[position] ?? '\0')) position++
  }
  const string = (key: boolean): string => {
    if (text[position++] !== '"') corrupt()
    const parts: string[] = []
    while (position < text.length) {
      let char = text[position++]!
      if (char === '"') return key ? parts.join('') : ''
      if (char.charCodeAt(0) < 32) corrupt()
      if (char === '\\') {
        const escape = text[position++]
        if (escape === 'u') {
          const hex = text.slice(position, position + 4)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) corrupt()
          char = String.fromCharCode(Number.parseInt(hex, 16))
          position += 4
        } else {
          const index = '"\\/bfnrt'.indexOf(escape ?? '\0')
          if (index < 0) corrupt()
          char = '"\\/\b\f\n\r\t'[index]!
        }
      }
      if (key) parts.push(char)
    }
    corrupt()
  }
  const digit = (): boolean => {
    const char = text.charCodeAt(position)
    return char >= 48 && char <= 57
  }
  const value = (depth: number): void => {
    if (++nodes > maxNodes || depth > maxDepth) corrupt()
    whitespace()
    const char = text[position]
    if (char === '"') {
      string(false)
      return
    }
    if (char === '[' || char === '{') {
      position++
      whitespace()
      const object = char === '{'
      const close = object ? '}' : ']'
      const keys = new Set<string>()
      if (text[position] === close) {
        position++
        return
      }
      for (;;) {
        if (object) {
          const key = string(true)
          if (keys.has(key)) corrupt()
          keys.add(key)
          whitespace()
          if (text[position++] !== ':') corrupt()
        }
        value(depth + 1)
        whitespace()
        if (text[position] === close) {
          position++
          return
        }
        if (text[position++] !== ',') corrupt()
        whitespace()
      }
    }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, position)) {
        position += literal.length
        return
      }
    }
    if (text[position] === '-') position++
    if (text[position] === '0') position++
    else {
      if (!digit()) corrupt()
      while (digit()) position++
    }
    if (text[position] === '.') {
      position++
      if (!digit()) corrupt()
      while (digit()) position++
    }
    if (text[position] === 'e' || text[position] === 'E') {
      position++
      if (text[position] === '+' || text[position] === '-') position++
      if (!digit()) corrupt()
      while (digit()) position++
    }
  }
  value(1)
  whitespace()
  if (position !== text.length) corrupt()
}
