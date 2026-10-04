import { describe, expect, it } from 'vitest'
import { sanitizeOutboxPayload } from '../audit-governance.ts'

/**
 * ENGINE-PROD-FIX ENG-017: governed-runtime outcomes stay observable in
 * durable outbox results, while free text in the same keys stays redacted.
 */
describe('outbox outcome visibility', () => {
  it('keeps the closed outcome vocabulary readable', () => {
    const { payload } = sanitizeOutboxPayload({
      status: 'approval_required',
      runtimeStatus: 'denied',
      reason: 'resource_mismatch',
      externalEffects: false
    })
    expect(payload).toEqual({
      status: 'approval_required',
      runtimeStatus: 'denied',
      reason: 'resource_mismatch',
      externalEffects: false
    })
  })

  it('redacts anything outside the vocabulary under the same keys', () => {
    const { payload, redactedFields } = sanitizeOutboxPayload({
      status: 'Maria called about her exam',
      runtimeStatus: 'joao_silva',
      reason: 'Synthetic controlled write requires human approval'
    })
    expect(payload).toEqual({
      status: '[redacted-outbox-text]',
      runtimeStatus: '[redacted-outbox-text]',
      reason: '[redacted-outbox-text]'
    })
    expect(redactedFields).toEqual(['status', 'runtimeStatus', 'reason'])
  })
})

describe('audit hash references survive sanitization', () => {
  it('keeps prefixed hashes byte-exact, including the all-zero genesis', async () => {
    const { sanitizeAuditEvidencePayload } =
      await import('../audit-governance.ts')
    const genesis = `sha256-${'0'.repeat(64)}`
    const digits = `sha256-${'1234567890'.repeat(6)}1234`
    const hex = `sha256-${'ab12'.repeat(16)}`
    const { payload } = sanitizeAuditEvidencePayload({
      previousHash: genesis,
      payloadHash: digits,
      eventHash: hex
    })
    expect(payload).toEqual({
      previousHash: genesis,
      payloadHash: digits,
      eventHash: hex
    })
  })
})
