import { describe, expect, it } from 'vitest'
import { ApprovalEngine, ApprovalError, type ApprovalEvent } from '../engine.ts'
import type { EffectEvidence } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000002'
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

const noEffect: EffectEvidence = {
  outcome: 'no_effect',
  source: 'journal',
  evidenceRef: 'journal:no-effect'
}

const possiblyStarted: EffectEvidence = {
  outcome: 'effect_possibly_started',
  evidenceRef: 'journal:effect-started'
}

function confirmed(executionRef: string): EffectEvidence {
  return {
    outcome: 'effect_confirmed',
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

function requestInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    operatorId: 'op_requester',
    agentId: BINDING.agentId,
    agentVersion: BINDING.agentVersion,
    action: BINDING.action,
    resource: BINDING.resource,
    payload: BINDING.payload,
    policyVersion: BINDING.policyVersion,
    correlationId: CORRELATION,
    ...overrides
  }
}

function approvedEngine(options: Parameters<typeof buildEngine>[0] = {}) {
  const engine = buildEngine(options)
  const record = engine.request(requestInput())
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

describe('AAA-07 coverage closure: reservation CAS and concurrency', () => {
  it('lets exactly one concurrent reserve win and fences the loser', async () => {
    const events: ApprovalEvent[] = []
    const { engine, record } = approvedEngine({ events })
    const reserve = (reservationId: string) =>
      Promise.resolve().then(() =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId
        })
      )
    const results = await Promise.allSettled([
      reserve('rsv_A'),
      reserve('rsv_B')
    ])
    const fulfilled = results.filter((result) => result.status === 'fulfilled')
    const rejected = results.filter((result) => result.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const reason = (rejected[0] as PromiseRejectedResult).reason
    expect(reason).toBeInstanceOf(ApprovalError)
    expect((reason as ApprovalError).code).toBe('already_reserved')

    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('RESERVED')
    expect(stored.reservationGeneration).toBe(1)
    const winner = (
      fulfilled[0] as PromiseFulfilledResult<{ reservationId: string }>
    ).value.reservationId
    expect(stored.reservationId).toBe(winner)
    expect(
      events.filter((event) => event.type === 'approval.reserved')
    ).toHaveLength(1)
  })

  it('replays the active token and rejects a competing token without mutating state', () => {
    const { engine, record } = approvedEngine()
    const first = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    const replay = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    expect(replay.reservationId).toBe(first.reservationId)
    expect(replay.reservationExpiresAt).toBe(first.reservationExpiresAt)
    expect(replay.generation).toBe(first.generation)

    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'already_reserved'
    )
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.reservationId).toBe('rsv_A')
    expect(stored.reservationGeneration).toBe(1)
    expect(stored.reservationOwner).toBe('op_requester')
  })
})

describe('AAA-07 coverage closure: markExecuting token rules', () => {
  it('rejects empty and foreign tokens and refuses a second transition', () => {
    const events: ApprovalEvent[] = []
    const { engine, record } = approvedEngine({ events })
    const reservation = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })

    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: ''
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_other'
        }),
      'reservation_mismatch'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('RESERVED')

    const executing = engine.markExecuting({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: reservation.reservationId
    })
    expect(executing.status).toBe('EXECUTING')
    expect(executing.executingAt).toBe(NOW.toISOString())
    const snapshot = engine.get(TENANT, record.approvalId)

    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: reservation.reservationId
        }),
      'invalid_state'
    )
    expect(engine.get(TENANT, record.approvalId)).toEqual(snapshot)
    expect(
      events.filter((event) => event.type === 'approval.executing')
    ).toHaveLength(1)
  })
})

describe('AAA-07 coverage closure: TTL sweep and effect-started guard', () => {
  it('returns an expired EXECUTING reservation to UNCERTAIN when the effect may have started', () => {
    let now = NOW
    let evidence: EffectEvidence = possiblyStarted
    const { engine, record } = approvedEngine({ clock: () => now })
    const reservation = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      ttlMs: 5_000
    })
    engine.markExecuting({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: reservation.reservationId
    })
    now = new Date(NOW.getTime() + 6_000)

    const result = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => evidence
    })
    expect(result).toEqual({ released: 0, uncertain: 1 })
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('UNCERTAIN')
    expect(stored.decisionReason).toBe(
      'reservation expired without explicit no-effect proof'
    )
    expect(stored.reservationId).toBe('rsv_A')
    expect(stored.executionCount).toBe(0)
    expect(stored.executedAt).toBeUndefined()
    expect(stored.executionRef).toBeUndefined()

    evidence = noEffect
    expect(
      engine.releaseExpired({
        tenantId: TENANT,
        now,
        evidenceFor: () => evidence
      })
    ).toEqual({ released: 0, uncertain: 0 })
    expect(engine.get(TENANT, record.approvalId).status).toBe('UNCERTAIN')
  })

  it('never turns confirmed evidence into EXECUTED during the sweep', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    const reservation = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      ttlMs: 5_000
    })
    engine.markExecuting({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: reservation.reservationId
    })
    now = new Date(NOW.getTime() + 6_000)

    const result = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => confirmed('outbox:late')
    })
    expect(result).toEqual({ released: 0, uncertain: 1 })
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('UNCERTAIN')
    expect(stored.executionCount).toBe(0)
    expect(stored.executionRef).toBeUndefined()
    expect(stored.decisionReason).toBe(
      'reservation expired without explicit no-effect proof'
    )
  })

  it('releases an EXECUTING reservation once absence of effect is proven', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    const reservation = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      ttlMs: 5_000
    })
    engine.markExecuting({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: reservation.reservationId
    })
    now = new Date(NOW.getTime() + 6_000)

    const result = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => noEffect
    })
    expect(result).toEqual({ released: 1, uncertain: 0 })
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('APPROVED')
    expect(stored.reservationId).toBeUndefined()
    expect(stored.executionCount).toBe(0)
    expect(stored.executedAt).toBeUndefined()
  })

  it('treats malformed evidence as unknown and keeps the fallback reason', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      ttlMs: 5_000
    })
    now = new Date(NOW.getTime() + 6_000)

    const result = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => ({ outcome: 'no_effect' }) as unknown as EffectEvidence
    })
    expect(result).toEqual({ released: 0, uncertain: 1 })
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('UNCERTAIN')
    expect(stored.decisionReason).toBe(
      'reservation expired without explicit no-effect proof'
    )
  })

  it('leaves expired non-reservation records to expireStale', () => {
    let now = NOW
    const engine = buildEngine({ clock: () => now })
    const record = engine.request(requestInput({ expiresInMs: 1_000 }))
    now = new Date(NOW.getTime() + 2_000)

    expect(
      engine.releaseExpired({
        tenantId: TENANT,
        now,
        evidenceFor: () => noEffect
      })
    ).toEqual({ released: 0, uncertain: 0 })
    expect(engine.get(TENANT, record.approvalId).status).toBe('REQUESTED')
    expect(engine.expireStale(now)).toBe(1)
    expect(engine.get(TENANT, record.approvalId).status).toBe('EXPIRED')
  })
})

describe('AAA-07 coverage closure: generation fencing across renewal', () => {
  it('rejects a sweep-released token in the next generation everywhere', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      ttlMs: 5_000
    })
    now = new Date(NOW.getTime() + 6_000)
    expect(
      engine.releaseExpired({
        tenantId: TENANT,
        now,
        evidenceFor: () => noEffect
      })
    ).toEqual({ released: 1, uncertain: 0 })

    const renewed = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId
    })
    expect(renewed.reservationId).not.toBe('rsv_A')
    expect(renewed.generation).toBe(2)

    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'already_reserved'
    )
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.confirm({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: confirmed('outbox:stale')
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: noEffect
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.fail({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: noEffect
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.markUncertain({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          reason: 'stale credential'
        }),
      'reservation_mismatch'
    )
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('RESERVED')
    expect(stored.reservationId).toBe(renewed.reservationId)
    expect(stored.reservationGeneration).toBe(2)

    engine.release({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: renewed.reservationId,
      evidence: noEffect
    })
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'reservation_reused'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')
  })
})

describe('AAA-07 coverage closure: terminal immutability', () => {
  it('keeps EXECUTED closed to every further transition', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    engine.markExecuting({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    engine.confirm({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      evidence: confirmed('outbox:evt_1')
    })
    const snapshot = engine.get(TENANT, record.approvalId)

    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: noEffect
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.fail({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: noEffect
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.markUncertain({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          reason: 'late ambiguity'
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.confirm({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: confirmed('outbox:evt_other')
        }),
      'already_executed'
    )
    expectCode(
      () =>
        engine.reconcile({
          tenantId: TENANT,
          approvalId: record.approvalId,
          actorId: 'op_supervisor',
          evidence: noEffect
        }),
      'invalid_state'
    )
    expect(engine.get(TENANT, record.approvalId)).toEqual(snapshot)
  })

  it('keeps FAILED closed to every further transition', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    engine.fail({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      evidence: noEffect
    })
    const snapshot = engine.get(TENANT, record.approvalId)

    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: noEffect
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.confirm({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: confirmed('outbox:evt_1')
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.reconcile({
          tenantId: TENANT,
          approvalId: record.approvalId,
          actorId: 'op_supervisor',
          evidence: confirmed('outbox:evt_1')
        }),
      'invalid_state'
    )
    expect(engine.get(TENANT, record.approvalId)).toEqual(snapshot)
    expect(snapshot.confirmationEvidenceRef).toBe('journal:no-effect')
  })

  it('keeps UNCERTAIN closed until an explicit reconciliation', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    engine.markUncertain({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      reason: 'timeout after send'
    })
    const snapshot = engine.get(TENANT, record.approvalId)

    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'uncertain'
    )
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.release({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: noEffect
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.fail({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: noEffect
        }),
      'invalid_state'
    )
    expectCode(
      () =>
        engine.confirm({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: confirmed('outbox:evt_1')
        }),
      'invalid_state'
    )
    expect(
      engine.releaseExpired({
        tenantId: TENANT,
        now: NOW,
        evidenceFor: () => noEffect
      })
    ).toEqual({ released: 0, uncertain: 0 })
    expect(engine.get(TENANT, record.approvalId)).toEqual(snapshot)

    const failed = engine.reconcile({
      tenantId: TENANT,
      approvalId: record.approvalId,
      actorId: 'op_supervisor',
      evidence: noEffect
    })
    expect(failed.status).toBe('FAILED')
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_C'
        }),
      'invalid_state'
    )
  })
})

describe('AAA-07 coverage closure: tenant and expiry denial', () => {
  it('rejects every stateful operation from a foreign tenant', () => {
    const { engine, record } = approvedEngine()
    const reservation = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    engine.markExecuting({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: reservation.reservationId
    })
    const before = engine.get(TENANT, record.approvalId)

    expectCode(
      () => engine.submit(OTHER_TENANT, record.approvalId, 'op_requester'),
      'not_found'
    )
    expectCode(
      () =>
        engine.approve(OTHER_TENANT, record.approvalId, {
          approverId: 'op_approver'
        }),
      'not_found'
    )
    expectCode(
      () =>
        engine.reject(OTHER_TENANT, record.approvalId, {
          approverId: 'op_approver'
        }),
      'not_found'
    )
    expectCode(
      () => engine.cancel(OTHER_TENANT, record.approvalId, 'op_requester'),
      'not_found'
    )
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          tenantId: OTHER_TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'not_found'
    )
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: OTHER_TENANT,
          approvalId: record.approvalId,
          reservationId: reservation.reservationId
        }),
      'not_found'
    )
    expectCode(
      () =>
        engine.confirm({
          tenantId: OTHER_TENANT,
          approvalId: record.approvalId,
          reservationId: reservation.reservationId,
          evidence: confirmed('outbox:foreign')
        }),
      'not_found'
    )
    expectCode(
      () =>
        engine.release({
          tenantId: OTHER_TENANT,
          approvalId: record.approvalId,
          reservationId: reservation.reservationId,
          evidence: noEffect
        }),
      'not_found'
    )
    expectCode(
      () =>
        engine.fail({
          tenantId: OTHER_TENANT,
          approvalId: record.approvalId,
          reservationId: reservation.reservationId,
          evidence: noEffect
        }),
      'not_found'
    )
    expectCode(
      () =>
        engine.markUncertain({
          tenantId: OTHER_TENANT,
          approvalId: record.approvalId,
          reservationId: reservation.reservationId,
          reason: 'foreign tenant'
        }),
      'not_found'
    )
    expectCode(
      () =>
        engine.reconcile({
          tenantId: OTHER_TENANT,
          approvalId: record.approvalId,
          actorId: 'op_foreign',
          evidence: noEffect
        }),
      'not_found'
    )
    expectCode(() => engine.get(OTHER_TENANT, record.approvalId), 'not_found')
    expect(engine.list(OTHER_TENANT)).toEqual([])
    expect(
      engine.releaseExpired({
        tenantId: OTHER_TENANT,
        now: NOW,
        evidenceFor: () => noEffect
      })
    ).toEqual({ released: 0, uncertain: 0 })
    expect(engine.get(TENANT, record.approvalId)).toEqual(before)
  })

  it('denies submit and approve after approval expiry and records EXPIRED', () => {
    let now = NOW
    const engine = buildEngine({ clock: () => now })
    const requested = engine.request(
      requestInput({
        expiresInMs: 1_000,
        correlationId: 'corr_00000000-0000-4000-8000-000000000011'
      })
    )
    const pending = engine.request(
      requestInput({
        expiresInMs: 1_000,
        correlationId: 'corr_00000000-0000-4000-8000-000000000012'
      })
    )
    engine.submit(TENANT, pending.approvalId, 'op_requester')
    now = new Date(NOW.getTime() + 2_000)

    expectCode(
      () => engine.submit(TENANT, requested.approvalId, 'op_requester'),
      'expired'
    )
    expect(engine.get(TENANT, requested.approvalId).status).toBe('EXPIRED')
    expectCode(
      () =>
        engine.approve(TENANT, pending.approvalId, {
          approverId: 'op_approver'
        }),
      'expired'
    )
    expect(engine.get(TENANT, pending.approvalId).status).toBe('EXPIRED')
  })
})
