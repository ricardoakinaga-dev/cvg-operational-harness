/**
 * AUD19-004 — outbox idempotency bound to content (memory store).
 */
import { describe, expect, it } from 'vitest'
import { DomainError } from '@cvg/shared'
import { InMemoryDatabase } from '../db.ts'
import { OutboxRepository } from '../outbox.ts'
import { computeOutboxContentHash } from '../outbox-content-hash.ts'

const tenantA = 'tenant_00000000-0000-4000-8000-000000000301'

function input(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: tenantA,
    type: 'synthetic.message',
    payload: { channel: 'web', urgent: true },
    idempotencyKey: 'outbox-binding-1',
    envelopeVersion: 1,
    ...overrides
  }
}

describe('outbox content binding (AUD19-004)', () => {
  it('computes a key-order-insensitive canonical hash', () => {
    const a = computeOutboxContentHash({
      tenantId: tenantA,
      type: 't',
      envelopeVersion: 1,
      payload: { b: 2, a: 1 }
    })
    const b = computeOutboxContentHash({
      tenantId: tenantA,
      type: 't',
      envelopeVersion: 1,
      payload: { a: 1, b: 2 }
    })
    expect(a).toBe(b)
    expect(a).toHaveLength(64)
    expect(
      computeOutboxContentHash({
        tenantId: tenantA,
        type: 't',
        envelopeVersion: 1,
        payload: { channel: 'web' }
      })
    ).not.toBe(
      computeOutboxContentHash({
        tenantId: tenantA,
        type: 't',
        envelopeVersion: 1,
        payload: { channel: 'whatsapp' }
      })
    )
  })

  it('returns the same record for an identical replay', () => {
    const outbox = new OutboxRepository(new InMemoryDatabase())
    const first = outbox.enqueue(input())
    const second = outbox.enqueue(input())
    expect(second.id).toBe(first.id)
  })

  it('converges payloads that are identical after privacy redaction', () => {
    // Free-text is redacted by design (outbox-r6); redacted-equivalent
    // payloads must converge, never false-conflict.
    const outbox = new OutboxRepository(new InMemoryDatabase())
    const first = outbox.enqueue(input({ payload: { text: 'hello' } }))
    const second = outbox.enqueue(input({ payload: { text: 'goodbye' } }))
    expect(second.id).toBe(first.id)
  })

  it('rejects a divergent type on the same key without mutating the winner', () => {
    const outbox = new OutboxRepository(new InMemoryDatabase())
    const first = outbox.enqueue(input())
    expect(() =>
      outbox.enqueue(input({ type: 'synthetic.other' }))
    ).toThrowError(DomainError)
    expect(outbox.findById(first.id, tenantA)?.type).toBe('synthetic.message')
  })

  it('rejects a divergent payload on the same key', () => {
    const outbox = new OutboxRepository(new InMemoryDatabase())
    outbox.enqueue(input())
    expect(() =>
      outbox.enqueue(input({ payload: { channel: 'whatsapp', urgent: true } }))
    ).toThrowError(expect.objectContaining({ code: 'conflict' }))
    expect(() =>
      outbox.enqueue(input({ payload: { channel: 'web', urgent: false } }))
    ).toThrowError(expect.objectContaining({ code: 'conflict' }))
  })

  it('rejects a divergent envelope version on the same key', () => {
    const outbox = new OutboxRepository(new InMemoryDatabase())
    outbox.enqueue(input())
    expect(() => outbox.enqueue(input({ envelopeVersion: 2 }))).toThrowError(
      expect.objectContaining({ code: 'conflict' })
    )
  })
})
