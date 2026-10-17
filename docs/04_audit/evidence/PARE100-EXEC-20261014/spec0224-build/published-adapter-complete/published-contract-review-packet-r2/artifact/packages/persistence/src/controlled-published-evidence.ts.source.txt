import { randomUUID } from 'node:crypto'
import { controlledCanonicalJson } from '@cvg/platform'
import { sanitizeAuditEvidencePayload } from '@cvg/shared'

/** Private profile boundary. The normative JSON cap is checked before redaction.
 * The legacy email regex scans a long word quadratically even without '@'.
 * An ASCII word longer than4096 contains none of the redaction delimiters:
 * it is unchanged, except an all-digit word is exactly one redacted phone.
 * Short opaque markers let the existing governance still redact sensitive keys.
 * Restore only markers that survive that governance; never restore a redacted key.
 */
export function sanitizeControlledPublishedEvidence(value: unknown): unknown {
  const original = controlledCanonicalJson(value)
  let prefix: string
  do {
    prefix = `__cvg_word_${randomUUID()}_`
  } while (original.includes(prefix))
  const replacements = new Map<string, string>()
  const mask = (v: unknown): unknown => {
    if (typeof v === 'string' && v.length > 4096 && /^[A-Za-z0-9_]+$/.test(v)) {
      const marker = `${prefix}${replacements.size}__`
      replacements.set(marker, /^\d+$/.test(v) ? '[redacted-phone]' : v)
      return marker
    }
    if (Array.isArray(v)) return v.map(mask)
    if (v !== null && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, child]) => [k, mask(child)])
      )
    return v
  }
  const restore = (v: unknown): unknown => {
    if (typeof v === 'string') return replacements.get(v) ?? v
    if (Array.isArray(v)) return v.map(restore)
    if (v !== null && typeof v === 'object')
      return Object.fromEntries(
        Object.entries(v).map(([k, child]) => [k, restore(child)])
      )
    return v
  }
  return restore(sanitizeAuditEvidencePayload(mask(value)).payload)
}
