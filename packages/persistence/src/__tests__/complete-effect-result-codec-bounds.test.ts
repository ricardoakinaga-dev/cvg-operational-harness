// SPEC 0225 f5: oversized or malformed declarations are refused BEFORE any
// buffer is allocated from the untrusted data (mutants C2/C4 of the campaign).
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  decodeJournalResult,
  JOURNAL_RESULT_DATA_MAX_CHARS,
  JOURNAL_RESULT_MAX_BYTES
} from '../operational-effect-result-codec.ts'

const sha = 'a'.repeat(64)
const envelope = (decodedBytes: number, data: string) => ({
  encoding: 'base64',
  decodedBytes,
  decodedSha256: sha,
  data
})

describe('journal result codec — refusal before allocation', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([
    [
      'one byte above the ceiling with a data string of the matching length',
      envelope(
        JOURNAL_RESULT_MAX_BYTES + 1,
        // 1048577 bytes need one '=' pad, so the shape is otherwise valid.
        'A'.repeat(4 * Math.ceil((JOURNAL_RESULT_MAX_BYTES + 1) / 3) - 1) + '='
      )
    ],
    ['data longer than the declared size', envelope(3, 'AAAAAAAA')],
    ['data shorter than the declared size', envelope(6, 'AAAA')],
    [
      'data above the absolute character cap',
      envelope(
        JOURNAL_RESULT_MAX_BYTES,
        'A'.repeat(JOURNAL_RESULT_DATA_MAX_CHARS + 4)
      )
    ],
    ['zero bytes', envelope(0, '')]
  ])('refuses %s without touching the buffer', (_name, payload) => {
    const from = vi.spyOn(Buffer, 'from')
    expect(() => decodeJournalResult(payload)).toThrow('JOURNAL_RESULT_CORRUPT')
    expect(from).not.toHaveBeenCalled()
  })
})
