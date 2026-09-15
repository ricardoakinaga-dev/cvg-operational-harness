import { describe, expect, it } from 'vitest'
import { ApprovalEngine, ApprovalError, type ApprovalEvent } from '../engine.ts'
import {
  computeApprovalPayloadHash,
  type ApprovalRecord,
  type EffectEvidence
} from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000002'
const NOW = new Date('2026-09-12T12:00:00.000Z')
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const PROPOSAL_HASH = 'a'.repeat(64)

const BINDING = {
  tenantId: TENANT,
  action: 'appointment.cancel',
  resource: { type: 'appointment', id: 'apt_1' },
  payload: { appointmentId: 'apt_1', reason: 'patient request' },
  agentId: 'agent_00000000-0000-4000-8000-000000000001',
  agentVersion: 'v1',
  policyVersion: 'policy_v1'
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

const noEffect: EffectEvidence = {
  outcome: 'no_effect',
  source: 'journal',
  evidenceRef: 'journal:reserved'
}

function confirmed(executionRef: string): EffectEvidence {
  return {
    outcome: 'effect_confirmed',
    executionRef,
    evidenceRef: `adapter:${executionRef}`
  }
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

describe('AAA-07 approval lifecycle with reservation', () => {
  it('reserve does not mark EXECUTED and keeps executionCount at zero', () => {
    const events: ApprovalEvent[] = []
    const { engine, record } = approvedEngine({ events })
    const reservation = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    expect(reservation.reservationId).toBe('rsv_A')
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('RESERVED')
    expect(stored.executionCount).toBe(0)
    expect(stored.executedAt).toBeUndefined()
    expect(events.map((event) => event.type)).not.toContain('approval.executed')
    expect(events.at(-1)?.type).toBe('approval.reserved')
  })

  it('runs reserve -> executing -> confirm and only confirmation increments use', () => {
    const events: ApprovalEvent[] = []
    const { engine, record } = approvedEngine({ events })
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
    const confirmedRecord = engine.confirm({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      evidence: confirmed('outbox:evt_1')
    })
    expect(confirmedRecord.status).toBe('EXECUTED')
    expect(confirmedRecord.executionRef).toBe('outbox:evt_1')
    expect(confirmedRecord.executionCount).toBe(1)
    expect(events.map((event) => event.type)).toEqual([
      'approval.requested',
      'approval.pending',
      'approval.approved',
      'approval.reserved',
      'approval.executing',
      'approval.executed'
    ])
  })

  it('allows exactly one reservation winner and fences the loser', () => {
    const { engine, record } = approvedEngine()
    const first = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    expect(first.reservationId).toBe('rsv_A')
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'already_reserved'
    )
    expectCode(
      () =>
        engine.markExecuting({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'reservation_mismatch'
    )
    expectCode(
      () =>
        engine.confirm({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_B',
          evidence: confirmed('outbox:evt_loser')
        }),
      'reservation_mismatch'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('RESERVED')
  })

  it('resumes the same reservation idempotently while it is alive', () => {
    const { engine, record } = approvedEngine()
    const first = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    const resumed = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    expect(resumed.reservationExpiresAt).toBe(first.reservationExpiresAt)
    expect(engine.get(TENANT, record.approvalId).status).toBe('RESERVED')
  })

  it('rejects tenant and binding divergence before any reservation', () => {
    const { engine, record } = approvedEngine()
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          tenantId: OTHER_TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'not_found'
    )
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          action: 'appointment.modify',
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'action_mismatch'
    )
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          payload: { appointmentId: 'apt_1', reason: 'mutated' },
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'payload_mismatch'
    )
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          agentVersion: 'v2',
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'proposal_mismatch'
    )
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          policyVersion: 'policy_v2',
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'proposal_mismatch'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')
  })

  it('binds an optional proposal hash and rejects a different one', () => {
    const engine = buildEngine()
    const record = engine.request(
      requestInput({
        proposalHash: PROPOSAL_HASH,
        capability: 'appointment.cancel'
      })
    )
    engine.submit(TENANT, record.approvalId, 'op_requester')
    engine.approve(TENANT, record.approvalId, { approverId: 'op_approver' })
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          proposalHash: 'b'.repeat(64),
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'proposal_mismatch'
    )
    const reservation = engine.reserve({
      ...BINDING,
      proposalHash: PROPOSAL_HASH,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    expect(reservation.proposalHash).toBe(PROPOSAL_HASH)
  })

  it('expires approvals before reservation and reservation TTL releases only with no-effect proof', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    now = new Date(NOW.getTime() + 16 * 60 * 1000)
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_A'
        }),
      'expired'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('EXPIRED')
  })

  it('sweeps expired reservations to APPROVED only with explicit absence proof', () => {
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
      evidenceFor: () => noEffect
    })
    expect(result.released).toBe(1)
    expect(result.uncertain).toBe(0)
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('APPROVED')
    expect(stored.reservationId).toBeUndefined()
    const retry = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_B'
    })
    expect(retry.reservationId).toBe('rsv_B')
  })

  it('sweeps ambiguous or missing proof to UNCERTAIN without blind retry', () => {
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
      evidenceFor: () => ({ outcome: 'unknown', reason: 'journal unavailable' })
    })
    expect(result.uncertain).toBe(1)
    expect(engine.get(TENANT, record.approvalId).status).toBe('UNCERTAIN')
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'uncertain'
    )
  })

  it('treats a throwing evidence provider as unknown, never as release', () => {
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
      evidenceFor: () => {
        throw new Error('journal offline')
      }
    })
    expect(result.uncertain).toBe(1)
    expect(engine.get(TENANT, record.approvalId).status).toBe('UNCERTAIN')
  })

  it('rejects an old reservation token after release and re-reservation', () => {
    const now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    engine.release({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      evidence: noEffect
    })
    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_B'
    })
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
          evidence: confirmed('outbox:evt_old')
        }),
      'reservation_mismatch'
    )
  })

  it('fails terminal only with absence proof and blocks new reservations', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    expectCode(
      () =>
        engine.fail({
          tenantId: TENANT,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          evidence: { outcome: 'unknown', reason: 'no proof' }
        }),
      'invalid_proof'
    )
    const failed = engine.fail({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      evidence: noEffect
    })
    expect(failed.status).toBe('FAILED')
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'invalid_state'
    )
  })

  it('marks uncertain without proof and reconciles only with typed evidence', () => {
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
    const uncertain = engine.markUncertain({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      reason: 'timeout after send'
    })
    expect(uncertain.status).toBe('UNCERTAIN')
    expectCode(
      () =>
        engine.reconcile({
          tenantId: TENANT,
          approvalId: record.approvalId,
          actorId: 'op_operator',
          evidence: { outcome: 'unknown', reason: 'still unknown' }
        }),
      'invalid_proof'
    )
    const reconciled = engine.reconcile({
      tenantId: TENANT,
      approvalId: record.approvalId,
      actorId: 'op_operator',
      evidence: confirmed('provider:external_1')
    })
    expect(reconciled.status).toBe('EXECUTED')
    expect(reconciled.executionRef).toBe('provider:external_1')
    expect(reconciled.executionCount).toBe(1)
  })

  it('reconciles uncertain to FAILED with absence proof', () => {
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
      reason: 'ambiguous'
    })
    const reconciled = engine.reconcile({
      tenantId: TENANT,
      approvalId: record.approvalId,
      actorId: 'op_operator',
      evidence: noEffect
    })
    expect(reconciled.status).toBe('FAILED')
  })

  it('replays the same confirmation without double counting or second reservation', () => {
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
    const evidence = confirmed('outbox:evt_1')
    engine.confirm({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      evidence
    })
    const replay = engine.confirm({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      evidence
    })
    expect(replay.status).toBe('EXECUTED')
    expect(replay.executionCount).toBe(1)
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
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_B'
        }),
      'invalid_state'
    )
  })

  it('never exposes mutable references that change store state', () => {
    const engine = buildEngine()
    const payload = { nested: { value: 1 } }
    const record = engine.request(
      requestInput({ payload, proposalPayload: { nested: { value: 1 } } })
    )
    payload.nested.value = 99
    const returned = engine.get(TENANT, record.approvalId)
    ;(returned as unknown as { status: string }).status = 'EXECUTED'
    ;(returned.resource as { id?: string }).id = 'hacked'
    ;(
      returned as unknown as { proposalPayload: { nested: { value: number } } }
    ).proposalPayload.nested.value = 42
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('REQUESTED')
    expect(stored.resource.id).toBe('apt_1')
    expect(
      (stored as unknown as { proposalPayload: { nested: { value: number } } })
        .proposalPayload.nested.value
    ).toBe(1)
    expect(stored.payloadHash).toBe(
      computeApprovalPayloadHash({
        action: BINDING.action,
        resource: BINDING.resource,
        payload: { nested: { value: 1 } }
      })
    )
  })

  it('runs sweep concurrently with an active turn without double effect', async () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      ttlMs: 5_000
    })
    engine.markExecuting({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    now = new Date(NOW.getTime() + 6_000)
    const turn = Promise.resolve().then(() =>
      engine.confirm({
        tenantId: TENANT,
        approvalId: record.approvalId,
        reservationId: 'rsv_A',
        evidence: confirmed('outbox:evt_concurrent')
      })
    )
    const sweep = Promise.resolve().then(() =>
      engine.releaseExpired({
        tenantId: TENANT,
        now,
        evidenceFor: () => noEffect
      })
    )
    const [, sweepResult] = await Promise.all([turn, sweep])
    const final = engine.get(TENANT, record.approvalId)
    expect(final.status).toBe('EXECUTED')
    expect(final.executionCount).toBe(1)
    expect(sweepResult.released + sweepResult.uncertain).toBeLessThanOrEqual(1)
  })

  it('keeps the legacy verifyAndConsume API working for old consumers', async () => {
    const { engine, record } = await approvedEngine()
    const consumption = engine.verifyAndConsume({
      tenantId: TENANT,
      approvalId: record.approvalId,
      action: BINDING.action,
      resource: BINDING.resource,
      payload: BINDING.payload,
      executionRef: 'outbox:legacy'
    })
    expect(consumption.payloadHash).toBe(record.payloadHash)
    expect(engine.get(TENANT, record.approvalId).status).toBe('EXECUTED')
  })

  it('lists lifecycle statuses for operator review', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    expect(engine.list(TENANT, 'RESERVED')).toHaveLength(1)
    expect(engine.list(TENANT, 'APPROVED')).toHaveLength(0)
    const clone: ApprovalRecord = engine.get(TENANT, record.approvalId)
    expect(clone.reservationId).toBe('rsv_A')
  })
})
