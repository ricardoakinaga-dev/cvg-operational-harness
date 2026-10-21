// @vitest-environment node
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ShiftStore } from '../store.ts'
import { ANA, GESTOR, tempDir } from './support/harness.ts'

// AUD-0621 F18 (PISO-004): an incomplete final line is a write that never
// committed. The valid prefix loads, the original bytes are preserved and
// isolated, and corruption anywhere else still fails closed. SPEC 0179 5.2.

const AT = '2026-09-30T18:00:00.000Z'
const line = (event: unknown) => `${JSON.stringify(event)}\n`

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function received(id: string) {
  return {
    type: 'message_received',
    at: AT,
    message: {
      provider: 'waha',
      messageId: id,
      fromPhone: ANA,
      kind: 'text',
      text: `nota ${id}`,
      receivedAt: AT
    }
  }
}

describe('F18: an incomplete tail does not block startup', () => {
  it('loads the valid prefix and keeps the original bytes intact', () => {
    const dir = tempDir('tail')
    const journal = join(dir, 'events.jsonl')
    writeFileSync(
      journal,
      line({ type: 'paused', at: AT, by: GESTOR }) + line(received('m1'))
    )
    appendFileSync(journal, '{"type":"resu')
    const original = readFileSync(journal)

    const store = new ShiftStore(dir)
    expect(store.paused).toBe(true)
    expect(store.unprocessedMessages().map((m) => m.messageId)).toEqual(['m1'])
    // The original segment is sealed, never truncated or rewritten.
    expect(sha256(readFileSync(journal))).toBe(sha256(original))
    // A verified copy of the original and the isolated tail are kept.
    const recoveries = readdirSync(join(dir, 'recovery'))
    expect(recoveries).toHaveLength(1)
    const folder = join(dir, 'recovery', recoveries[0]!)
    const copies = readdirSync(folder)
    const copy = copies.find((name) => name.startsWith('original-'))!
    expect(sha256(readFileSync(join(folder, copy)))).toBe(sha256(original))
    expect(readFileSync(join(folder, 'tail.bin'), 'utf8')).toBe('{"type":"resu')

    // New events go to a successor segment and survive another restart.
    store.append({ type: 'resumed', at: AT, by: GESTOR })
    const reopened = new ShiftStore(dir)
    expect(reopened.paused).toBe(false)
    expect(reopened.unprocessedMessages()).toHaveLength(1)
    expect(sha256(readFileSync(journal))).toBe(sha256(original))
    expect(readdirSync(join(dir, 'recovery'))).toHaveLength(1)
  })

  it('treats complete JSON without the final newline as uncommitted', () => {
    const dir = tempDir('no-lf')
    const journal = join(dir, 'events.jsonl')
    writeFileSync(
      journal,
      line(received('m1')) +
        JSON.stringify({ type: 'paused', at: AT, by: GESTOR })
    )
    const store = new ShiftStore(dir)
    expect(store.paused).toBe(false)
    expect(store.unprocessedMessages()).toHaveLength(1)
    expect(existsSync(join(dir, 'recovery'))).toBe(true)
  })

  it('fails closed on a corrupted line in the middle, without touching it', () => {
    const dir = tempDir('middle')
    const journal = join(dir, 'events.jsonl')
    writeFileSync(
      journal,
      line(received('m1')) + '{"type":"pau\n' + line(received('m2'))
    )
    const original = readFileSync(journal)
    let error: unknown
    try {
      new ShiftStore(dir)
    } catch (caught) {
      error = caught
    }
    expect(error).toMatchObject({ code: 'JOURNAL_CORRUPT' })
    expect(sha256(readFileSync(journal))).toBe(sha256(original))
    expect(existsSync(join(dir, 'recovery'))).toBe(false)
  })

  it('fails closed on an unknown event instead of skipping it', () => {
    const dir = tempDir('unknown')
    writeFileSync(
      join(dir, 'events.jsonl'),
      line(received('m1')) + line({ type: 'mystery', at: AT })
    )
    expect(() => new ShiftStore(dir)).toThrow(
      expect.objectContaining({ code: 'JOURNAL_CORRUPT' })
    )
  })
})
