/**
 * Canonical JSON serialization (RFC 8785 subset) used for deterministic
 * payload hashing, approval binding and evidence digests. Owned by neutral contracts.
 *
 * Rules:
 * - object keys sorted by UTF-16 code units;
 * - arrays keep order, `undefined` becomes `null`;
 * - `undefined` object members are omitted;
 * - numbers must be finite, `-0` serializes as `0`;
 * - only plain objects/null-prototype objects are accepted;
 * - depth and node budgets fail closed.
 */
export const CANONICAL_JSON_MAX_DEPTH = 64
export const CANONICAL_JSON_MAX_NODES = 20_000

export class CanonicalJsonError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'CanonicalJsonError'
    this.code = code
  }
}

function isPlainObject(value: object): boolean {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

export function canonicalizeJson(value: unknown): string {
  let nodes = 0
  const seen = new WeakSet<object>()

  const visit = (input: unknown, depth: number, inArray: boolean): string => {
    nodes += 1
    if (nodes > CANONICAL_JSON_MAX_NODES) {
      throw new CanonicalJsonError(
        'canonical_json_node_limit',
        'Canonical JSON payload exceeded the node budget'
      )
    }
    if (depth > CANONICAL_JSON_MAX_DEPTH) {
      throw new CanonicalJsonError(
        'canonical_json_depth_limit',
        'Canonical JSON payload exceeded the depth budget'
      )
    }

    if (input === null) return 'null'

    switch (typeof input) {
      case 'string':
        return JSON.stringify(input)
      case 'boolean':
        return input ? 'true' : 'false'
      case 'number':
        if (!Number.isFinite(input)) {
          throw new CanonicalJsonError(
            'canonical_json_non_finite_number',
            'Canonical JSON does not allow non-finite numbers'
          )
        }
        return JSON.stringify(input)
      case 'undefined':
        if (inArray) return 'null'
        throw new CanonicalJsonError(
          'canonical_json_unsupported_value',
          'Canonical JSON does not allow top-level undefined'
        )
      case 'bigint':
      case 'function':
      case 'symbol':
        throw new CanonicalJsonError(
          'canonical_json_unsupported_type',
          `Canonical JSON does not support ${typeof input} values`
        )
      case 'object': {
        if (seen.has(input)) {
          throw new CanonicalJsonError(
            'canonical_json_cycle',
            'Canonical JSON does not support cyclic structures'
          )
        }
        seen.add(input)
        try {
          if (Array.isArray(input)) {
            const items = input.map((item) => visit(item, depth + 1, true))
            return `[${items.join(',')}]`
          }
          if (!isPlainObject(input)) {
            throw new CanonicalJsonError(
              'canonical_json_unsupported_object',
              'Canonical JSON only accepts plain objects'
            )
          }
          const record = input as Record<string, unknown>
          const parts: string[] = []
          for (const key of Object.keys(record).sort()) {
            const item = record[key]
            if (item === undefined) continue
            parts.push(
              `${JSON.stringify(key)}:${visit(item, depth + 1, false)}`
            )
          }
          return `{${parts.join(',')}}`
        } finally {
          seen.delete(input)
        }
      }
      // Unreachable: `typeof` is exhausted by the cases above.
      /* v8 ignore start */
      default:
        throw new CanonicalJsonError(
          'canonical_json_unsupported_type',
          'Canonical JSON received an unsupported value'
        )
      /* v8 ignore stop */
    }
  }

  return visit(value, 0, false)
}
