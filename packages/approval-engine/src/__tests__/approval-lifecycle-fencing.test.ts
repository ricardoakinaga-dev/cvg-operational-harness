import { describe, expect, it } from 'vitest'
import { ApprovalEngine, ApprovalError, type ApprovalEvent } from '../engine.ts'
import type { ApprovalRecord } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-12T12:00:00.000Z')
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'

const BINDING = {
  tenantId: TENANT,
  action: 'appointment.cancel',
  resource: { type: 'appointment', id: 'apt_1' },
  payload: { appointmentId: 'apt_1', reason: 'patient request' },
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentVersion: 'v1',
  policyVersion: 'policy_v1'
}

const noEffect = {
  outcome: 'no_effect' as const,
  source: 'journal' as const,
  evidenceRef: 'journal:reserved'
}

const ambiguous = {
  outcome: 'unknown' as const,
  reason: 'old snapshot unknown'
}

function confirmed(executionRef: string) {
  return {
    outcome: 'effect_confirmed' as const,
    executionRef,
    evidenceRef: `adapter:${executionRef}`
  }
}

function buildEngine(
  options: { clock?: () => Date; events?: ApprovalEvent[] } = {}
) {
  let counter = 0
  return new ApprovalEngine({
    clock: options.clock ?? (() => NOW),
    idFactory: () => {
      counter += 1
      return `appr_00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
    },
    reservationTtlMs: 60_000,
    ...(options.events !== undefined
      ? { onEvent: (event: ApprovalEvent) => options.events?.push(event) }
      : {})
  })
}

function approvedEngine(options: Parameters<typeof buildEngine>[0] = {}) {
  const engine = buildEngine(options)
  const record = engine.request({
    ...BINDING,
    operatorId: 'op_requester',
    correlationId: CORRELATION
  })
  engine.submit(TENANT, record.approvalId, 'op_requester')
  engine.approve(TENANT, record.approvalId, { approverId: 'op_approver' })
  return { engine, record }
}

function expectCode(fn: () => unknown, code: string) {
  try {
    fn()
    throw new Error(`expected ApprovalError ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(ApprovalError)
    expect((error as ApprovalError).code).toBe(code)
  }
}

describe('AAA07-C6-F01/F02 fencing between reservation generations', () => {
  it('stale sweep with no_effect evidence cannot release a newer reservation', () => {
    let now = NOW
    const events: ApprovalEvent[] = []
    const { engine, record } = approvedEngine({ clock: () => now, events })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'old-token',
      ttlMs: 5_000
    })
    now = new Date(NOW.getTime() + 6_000)

    let snapshot: ApprovalRecord | undefined
    let eventsAtCreation = 0
    const result = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => {
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'old-token',
          evidence: noEffect
        })
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'new-token',
          ownerId: 'worker_2'
        })
        snapshot = engine.get(TENANT, record.approvalId)
        eventsAtCreation = events.length
        return noEffect
      }
    })

    expect(result).toEqual({ released: 0, uncertain: 0 })
    const current = engine.get(TENANT, record.approvalId)
    expect(current).toEqual(snapshot)
    expect(current.status).toBe('RESERVED')
    expect(current.reservationId).toBe('new-token')
    expect(current.reservationExpiresAt).toBe(snapshot?.reservationExpiresAt)
    expect(current.reservationOwner).toBe('worker_2')
    expect(events.length).toBe(eventsAtCreation)
    const newTokenEvents = events.filter(
      (event) => event.reservationId === 'new-token'
    )
    expect(newTokenEvents.map((event) => event.type)).toEqual([
      'approval.reserved'
    ])
  })

  it('stale sweep with ambiguous evidence cannot mark a newer reservation UNCERTAIN', () => {
    let now = NOW
    const events: ApprovalEvent[] = []
    const { engine, record } = approvedEngine({ clock: () => now, events })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'old-token',
      ttlMs: 5_000
    })
    now = new Date(NOW.getTime() + 6_000)

    let snapshot: ApprovalRecord | undefined
    let eventsAtCreation = 0
    const result = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => {
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'old-token',
          evidence: noEffect
        })
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'new-token'
        })
        snapshot = engine.get(TENANT, record.approvalId)
        eventsAtCreation = events.length
        return ambiguous
      }
    })

    expect(result).toEqual({ released: 0, uncertain: 0 })
    const current = engine.get(TENANT, record.approvalId)
    expect(current).toEqual(snapshot)
    expect(current.status).toBe('RESERVED')
    expect(current.reservationId).toBe('new-token')
    expect(events.length).toBe(eventsAtCreation)
  })

  it('sweep skips when the callback confirms the expired reservation', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'old-token',
      ttlMs: 5_000
    })
    now = new Date(NOW.getTime() + 6_000)

    const result = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => {
        engine.confirm({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'old-token',
          evidence: confirmed('outbox:evt_stale')
        })
        return noEffect
      }
    })

    expect(result).toEqual({ released: 0, uncertain: 0 })
    const current = engine.get(TENANT, record.approvalId)
    expect(current.status).toBe('EXECUTED')
    expect(current.executionCount).toBe(1)
    expect(current.executionRef).toBe('outbox:evt_stale')
  })

  it('rejects reuse of a spent reservation token in the callback and keeps APPROVED honest', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'old-token',
      ttlMs: 5_000
    })
    now = new Date(NOW.getTime() + 6_000)

    const result = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => {
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'old-token',
          evidence: noEffect
        })
        expectCode(
          () =>
            engine.reserve({
              ...BINDING,
              approvalId: record.approvalId,
              reservationId: 'old-token'
            }),
          'reservation_reused'
        )
        return noEffect
      }
    })

    expect(result).toEqual({ released: 0, uncertain: 0 })
    const current = engine.get(TENANT, record.approvalId)
    expect(current.status).toBe('APPROVED')
    expect(current.reservationId).toBeUndefined()
  })

  it('rejects an explicit spent token and fences every mutation of the old generation', () => {
    const { engine, record } = approvedEngine()
    const first = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'old-token'
    })
    expect(first.generation).toBe(1)
    engine.release({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'old-token',
      evidence: noEffect
    })
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'old-token'
        }),
      'reservation_reused'
    )

    const second = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'new-token'
    })
    expect(second.generation).toBe(2)
    engine.markExecuting({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'new-token'
    })

    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'old-token'
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.confirm({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'old-token',
          evidence: confirmed('outbox:old')
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'old-token',
          evidence: noEffect
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.fail({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'old-token',
          evidence: noEffect
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.markUncertain({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'old-token',
          reason: 'old credential'
        }),
      'reservation_mismatch'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('EXECUTING')
  })

  it('keeps the legitimate replay of the active reservation and fresh auto tokens', () => {
    const { engine, record } = approvedEngine()
    const first = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'active-token'
    })
    const resumed = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'active-token'
    })
    expect(resumed.generation).toBe(first.generation)
    expect(resumed.reservationExpiresAt).toBe(first.reservationExpiresAt)

    engine.release({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'active-token',
      evidence: noEffect
    })
    const auto = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId
    })
    expect(auto.reservationId).not.toBe('active-token')
    expect(auto.generation).toBe(2)
    expect(() => {
      engine.markExecuting({
        tenantId: TENANT,
        approvalId: record.approvalId,
        reservationId: auto.reservationId
      })
    }).not.toThrow()
  })
})
