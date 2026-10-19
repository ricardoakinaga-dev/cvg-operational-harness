import { redactSensitiveText } from '@cvg/shared'

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /authorization/i,
  /credential/i,
  /private[_-]?key/i,
  /cpf/i,
  /cns/i,
  /medical[_-]?notes?/i,
  /diagnosis/i,
  /prescription/i
]

const MAX_DEPTH = 6
const MAX_ARRAY_ITEMS = 50
const MAX_STRING = 2_000

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[redacted-depth]'
  if (value === null) return null
  if (typeof value === 'string') {
    const text =
      value.length > MAX_STRING
        ? `${value.slice(0, MAX_STRING)}[truncated]`
        : value
    return redactSensitiveText(text)
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (value === undefined) return undefined
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => redactValue(item, depth + 1))
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        result[key] = '[redacted]'
        continue
      }
      result[key] = redactValue(item, depth + 1)
    }
    return result
  }
  return '[unsupported]'
}

/**
 * Centralized redaction for structured logs and telemetry attributes. Never
 * pass raw medical notes, credentials or full personal identifiers to sinks.
 */
export function redactFields(
  fields: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (!fields) return {}
  const redacted = redactValue(fields)
  return redacted && typeof redacted === 'object' && !Array.isArray(redacted)
    ? (redacted as Record<string, unknown>)
    : {}
}

export function redactAttributeValue(value: string): string {
  return redactSensitiveText(value)
}

export function assertNoSensitiveKeys(
  fields: Record<string, unknown>
): string[] {
  return Object.keys(fields).filter(isSensitiveKey)
}
