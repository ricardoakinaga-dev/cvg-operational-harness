import { QualificationError } from './errors.mjs'
import { MiB } from './schemas.mjs'

export const MAX_PROJECTION_BYTES = 64 * MiB

/** Resource estimate only: never transforms values or replaces the Q03 kit.
 * The caller has already validated strict JSON and the closed Q03 policy.
 * Finite JSON numbers have at most sixfold canonical expansion relative to
 * their source spelling (1e20 -> 21 bytes from4). Other JSON tokens do not
 * expand beyond that factor. Add whole metadata replacement bounds without
 * subtracting original values: intentionally conservative, never truncating.
 */
export function assertProjectionBudget(rawByteLength, document, policy) {
  let upperBound = rawByteLength * 6
  if (Array.isArray(document) && policy.length) {
    const idFields = policy.filter((rule) => rule.mode === 'id').length
    const ordinalDigits = String(Math.max(1, document.length * idFields)).length
    for (const event of document) {
      if (event === null || typeof event !== 'object' || Array.isArray(event))
        continue
      for (const rule of policy) {
        if (!Object.hasOwn(event, rule.field)) continue
        // Namespaces are already validated IDs <=128ASCII by SPEC0229. Count
        // JSON quotes, id: prefix, namespace, separator and worst ordinal.
        upperBound +=
          rule.mode === 'id'
            ? 2 + 3 + rule.namespace.length + 1 + ordinalDigits
            : 26
      }
    }
  }
  if (!Number.isSafeInteger(upperBound) || upperBound > MAX_PROJECTION_BYTES)
    throw new QualificationError(
      'INFRA_FAILURE',
      'Generated projection exceeds the comparator resource budget'
    )
  return upperBound
}
