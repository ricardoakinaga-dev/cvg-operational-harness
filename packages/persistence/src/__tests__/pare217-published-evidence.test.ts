import { describe, expect, it } from 'vitest'
import { sanitizeAuditEvidencePayload } from '@cvg/shared'
import { sanitizeControlledPublishedEvidence } from '../controlled-published-evidence.ts'

describe('SPEC217 bounded evidence redaction preserves existing governance', () => {
  it('matches the original sanitizer for boundary words, numbers and sensitive nested keys', () => {
    for (const data of [
      'x'.repeat(4097),
      'A9_'.repeat(1400),
      '9'.repeat(4097)
    ]) {
      const input = {
        data,
        body: data,
        token: data,
        nested: { email: data, details: [data, { clinicalNote: data }] }
      }
      expect(sanitizeControlledPublishedEvidence(input)).toEqual(
        sanitizeAuditEvidencePayload(input).payload
      )
    }
  })
  it('keeps a200KiB benign word intact without restoring sensitive fields', () => {
    const data = 'x'.repeat(200000)
    const result = sanitizeControlledPublishedEvidence({ data }) as {
      data: string
    }
    const sensitive = sanitizeControlledPublishedEvidence({ body: data }) as {
      body: string
    }
    expect(result.data).toBe(data)
    expect(sensitive.body).not.toBe(data)
  })
  it('redacts a long all-digit word and preserves the JSON cap before sanitization', () => {
    expect(
      sanitizeControlledPublishedEvidence({ data: '9'.repeat(200000) })
    ).toEqual({ data: '[redacted-phone]' })
    expect(() =>
      sanitizeControlledPublishedEvidence({ body: 'x'.repeat(262144) })
    ).toThrow('controlled_state_bounds')
  })
  it('keeps the original rules for normal institutional redaction and rejects executable data', () => {
    const input = {
      details: 'email pessoa@example.com, cpf123.456.789-01, token=synthetic',
      nested: ['Rua sintética,123', 'meu nome é Fulano']
    }
    expect(sanitizeControlledPublishedEvidence(input)).toEqual(
      sanitizeAuditEvidencePayload(input).payload
    )
    expect(() =>
      sanitizeControlledPublishedEvidence({ operation: () => undefined })
    ).toThrow('controlled_state_json')
  })
})
