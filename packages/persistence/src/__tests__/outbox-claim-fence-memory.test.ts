import { describe, expect, it } from 'vitest'
import { TenantIdSchema } from '@cvg/platform'
import { InMemoryDatabase } from '../db.ts'
import { OutboxRepository } from '../outbox.ts'

// SPEC0249 §3.2 item 7 and §3.4 item 2 (AUD-0621 F06, F17): the in-memory
// double issues a claim token, refuses a stale token and bounds crash
// recovery by maxAttempts like the PostgreSQL adapter.
const tenantId = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000249'
)
const correlationId = 'corr_00000000-0000-4000-8000-000000000249'

function fixture(maxAttempts = 3) {
  let now = new Date('2026-10-20T12:00:00.000Z')
  const db = new InMemoryDatabase()
  const repository = new OutboxRepository(db, {
    now: () => now,
    leaseMs: 1_000,
    maxAttempts,
    retryBaseMs: 5,
    retryMaxMs: 5
  })
  const event = repository.enqueue({
    tenantId,
    type: 'message.outbound',
    payload: { synthetic: true },
    idempotencyKey: 'memory-p0249-key',
    correlationId
  })
  return {
    db,
    repository,
    event,
    advance(ms: number) {
      now = new Date(now.getTime() + ms)
    }
  }
}

describe('SPEC0249 in-memory outbox claim fencing', () => {
  it('refuses a stale claim token reused by the same worker id', async () => {
    const x = fixture()
    const first = x.repository.claimNext({ tenantId, workerId: 'same' })
    x.advance(2_000)
    const second = x.repository.claimNext({ tenantId, workerId: 'same' })
    expect(first?.claimToken).toEqual(expect.any(String))
    expect(second?.claimToken).toEqual(expect.any(String))
    expect(second?.claimToken).not.toBe(first?.claimToken)

    await expect(
      Promise.resolve().then(() =>
        x.repository.fail({
          tenantId,
          eventId: x.event.id,
          workerId: 'same',
          terminal: true,
          error: 'stale',
          ...(first?.claimToken ? { claimToken: first.claimToken } : {})
        })
      )
    ).rejects.toMatchObject({ code: 'conflict' })
    await expect(
      Promise.resolve().then(() =>
        x.repository.ack({
          tenantId,
          eventId: x.event.id,
          workerId: 'same',
          result: { stale: true },
          ...(first?.claimToken ? { claimToken: first.claimToken } : {})
        })
      )
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(
      x.repository.heartbeatClaim({
        tenantId,
        eventId: x.event.id,
        workerId: 'same',
        leaseMs: 1_000,
        ...(first?.claimToken ? { claimToken: first.claimToken } : {})
      })
    ).toBeNull()
    expect(x.repository.findById(x.event.id, tenantId)).toMatchObject({
      status: 'processing',
      attempts: 2
    })

    x.advance(500)
    const renewed = x.repository.heartbeatClaim({
      tenantId,
      eventId: x.event.id,
      workerId: 'same',
      leaseMs: 1_000,
      ...(second?.claimToken ? { claimToken: second.claimToken } : {})
    })
    expect(renewed?.leaseUntil?.getTime()).toBe(
      second!.leaseUntil!.getTime() + 500
    )
    const acked = await x.repository.ack({
      tenantId,
      eventId: x.event.id,
      workerId: 'same',
      result: { current: true },
      ...(second?.claimToken ? { claimToken: second.claimToken } : {})
    })
    expect(acked.status).toBe('processed')
    expect(acked.claimToken).toBeUndefined()
    expect(x.repository.findById(x.event.id, tenantId)?.claimToken).toBe(
      undefined
    )
  })

  it('refuses to renew an expired claim', () => {
    const x = fixture()
    const claimed = x.repository.claimNext({ tenantId, workerId: 'w' })
    x.advance(1_000)
    expect(
      x.repository.heartbeatClaim({
        tenantId,
        eventId: x.event.id,
        workerId: 'w',
        leaseMs: 1_000,
        ...(claimed?.claimToken ? { claimToken: claimed.claimToken } : {})
      })
    ).toBeNull()
    expect(x.repository.findById(x.event.id, tenantId)?.leaseUntil).toEqual(
      claimed?.leaseUntil
    )
  })

  it('AC11: crash recovery dead-letters an event that exhausted maxAttempts', () => {
    const x = fixture(3)
    const claims = []
    for (let index = 0; index < 5; index += 1) {
      claims.push(
        x.repository.claimNext({ tenantId, workerId: `crash-${index}` })
      )
      x.advance(2_000)
    }
    expect(claims.slice(0, 3).map((claim) => claim?.attempts)).toEqual([
      1, 2, 3
    ])
    expect(claims.slice(3)).toEqual([null, null])
    expect(x.repository.findById(x.event.id, tenantId)).toMatchObject({
      status: 'dead_letter',
      attempts: 3,
      leaseOwner: null,
      leaseUntil: null
    })
    expect(x.db.state.outboxAttempts.map((attempt) => attempt.outcome)).toEqual(
      ['lease_expired', 'lease_expired', 'lease_expired']
    )
    expect(
      x.db.state.auditEvents.filter(
        (audit) =>
          (audit.payload as { status?: string } | undefined)?.status ===
          'dead_letter'
      )
    ).toHaveLength(1)
  })
})
