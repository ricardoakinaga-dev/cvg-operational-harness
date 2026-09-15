import { describe, expect, it } from 'vitest'
import { ApprovalEngine, ApprovalError } from '../engine.ts'
import type { EffectEvidence } from '../contracts.ts'

const TENANT = 'tenant_00000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-09-12T12:00:00.000Z')
const CORRELATION = 'corr_00000000-0000-4000-8000-000000000001'
const OP_A = `op:${'a'.repeat(64)}`
const OP_B = `op:${'b'.repeat(64)}`

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
  evidenceRef: 'journal:reserved'
}

function buildEngine(options: { clock?: () => Date } = {}) {
  let counter = 0
  return new ApprovalEngine({
    clock: options.clock ?? (() => NOW),
    idFactory: () => {
      counter += 1
      return `appr_00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`
    },
    reservationTtlMs: 60_000
  })
}

function approvedEngine(options: { clock?: () => Date } = {}) {
  const engine = buildEngine(options)
  const record = engine.request({
    tenantId: TENANT,
    operatorId: 'op_requester',
    agentId: BINDING.agentId,
    agentVersion: BINDING.agentVersion,
    action: BINDING.action,
    resource: BINDING.resource,
    payload: BINDING.payload,
    policyVersion: BINDING.policyVersion,
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

describe('P1-2: approval reservation persists the effective operationKey', () => {
  it('persists the normalized operation key on the record and the reservation', () => {
    const { engine, record } = approvedEngine()

    const reservation = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      operationKey: `  ${OP_A}  `
    })

    expect(reservation.operationKey).toBe(OP_A)
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.operationKey).toBe(OP_A)
  })

  it('keeps the operation key stable across CAS transitions and generations', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      operationKey: OP_A
    })
    engine.markExecuting({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A'
    })
    expect(engine.get(TENANT, record.approvalId).operationKey).toBe(OP_A)

    engine.release({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      evidence: noEffect
    })
    const released = engine.get(TENANT, record.approvalId)
    expect(released.status).toBe('APPROVED')
    expect(released.operationKey).toBe(OP_A)

    // A later generation that omits the key keeps the persisted identity.
    const second = engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_B'
    })
    expect(second.operationKey).toBe(OP_A)
    expect(engine.get(TENANT, record.approvalId).operationKey).toBe(OP_A)
  })

  it('keeps the operation key when a reservation turns UNCERTAIN', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      operationKey: OP_A
    })
    engine.markUncertain({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      reason: 'synthetic ambiguity'
    })

    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('UNCERTAIN')
    expect(stored.operationKey).toBe(OP_A)
  })

  it('rejects a diverging operation key on a later generation without mutating state', () => {
    const { engine, record } = approvedEngine()
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      operationKey: OP_A
    })
    engine.release({
      tenantId: TENANT,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      evidence: noEffect
    })

    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_B',
          operationKey: OP_B
        }),
      'proposal_mismatch'
    )
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('APPROVED')
    expect(stored.operationKey).toBe(OP_A)
    expect(stored.reservationId).toBeUndefined()
  })

  it('rejects an empty or whitespace-only operation key', () => {
    const { engine, record } = approvedEngine()

    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          operationKey: ''
        }),
      'invalid_request'
    )
    expectCode(
      () =>
        engine.reserve({
          ...BINDING,
          approvalId: record.approvalId,
          reservationId: 'rsv_A',
          operationKey: '   '
        }),
      'invalid_request'
    )
    expect(engine.get(TENANT, record.approvalId).status).toBe('APPROVED')
  })

  it('never releases a persisted-key reservation on unknown evidence', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      operationKey: OP_A,
      ttlMs: 5_000
    })
    now = new Date(NOW.getTime() + 6_000)

    const result = engine.releaseExpired({
      tenantId: TENANT,
      now,
      evidenceFor: () => ({ outcome: 'unknown', reason: 'journal gap' })
    })

    expect(result).toEqual({ released: 0, uncertain: 1 })
    const stored = engine.get(TENANT, record.approvalId)
    expect(stored.status).toBe('UNCERTAIN')
    expect(stored.operationKey).toBe(OP_A)
  })

  it('releases to APPROVED with no-effect proof and retains the persisted key', () => {
    let now = NOW
    const { engine, record } = approvedEngine({ clock: () => now })
    engine.reserve({
      ...BINDING,
      approvalId: record.approvalId,
      reservationId: 'rsv_A',
      operationKey: OP_B,
      ttlMs: 5_000
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
    expect(stored.operationKey).toBe(OP_B)
    expect(stored.reservationId).toBeUndefined()
  })
})
