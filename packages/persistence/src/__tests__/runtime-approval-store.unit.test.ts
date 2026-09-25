import { createHash } from 'node:crypto'
import type { QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  ApprovalError,
  type EffectEvidence,
  type ApprovalRecord,
  type ApprovalStatus
} from '@cvg/approval-engine'
import type { DomainError } from '@cvg/shared'
import {
  mapRuntimeApprovalRow,
  PostgresApprovalAuthority,
  type RuntimeApprovalRow
} from '../runtime-approval-store.ts'
import type {
  PostgresPoolClient,
  PostgresPoolLike
} from '../tenant-scoped-postgres.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000a01'
const baseNow = new Date('2026-09-20T12:00:00.000Z')

const persistedColumns = [
  'tenant_id',
  'approval_id',
  'operator_id',
  'agent_id',
  'agent_version',
  'action',
  'resource_type',
  'resource_id',
  'payload_hash',
  'policy_version',
  'prompt_version',
  'correlation_id',
  'status',
  'single_use',
  'requested_at',
  'expires_at',
  'approved_at',
  'executed_at',
  'rejected_at',
  'cancelled_at',
  'expired_at',
  'approver_id',
  'decision_actor_type',
  'decision_correlation_id',
  'decision_command_key',
  'decision_reason',
  'execution_count',
  'execution_ref',
  'reservation_id',
  'reservation_owner',
  'reservation_expires_at',
  'reservation_generation',
  'used_reservation_ids',
  'reserved_at',
  'executing_at',
  'released_at',
  'failed_at',
  'uncertain_at',
  'confirmed_at',
  'confirmation_evidence_ref',
  'proposal_id',
  'proposal_hash',
  'capability',
  'data_classification',
  'proposal_payload',
  'operation_key'
] as const

type FakeRow = RuntimeApprovalRow

function proposalHash(hint: string): string {
  return createHash('sha256').update(`proposal:${hint}`, 'utf8').digest('hex')
}

function payload(hint: string): Record<string, string> {
  return { kind: 'synthetic', hint }
}

function requestInput(hint: string, overrides: Record<string, unknown> = {}) {
  return {
    tenantId,
    operatorId: 'op_operator_1',
    agentId: 'agent_secretary',
    agentVersion: '1.0.0',
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: `apt_${hint}` },
    payload: payload(hint),
    policyVersion: 'policy-v1',
    correlationId: `corr:${hint}`,
    proposalId: `proposal_${hint}`,
    proposalHash: proposalHash(hint),
    capability: 'appointments.manage',
    dataClassification: 'synthetic',
    proposalPayload: payload(hint),
    ...overrides
  }
}

function reserveInput(
  hint: string,
  approvalId: string,
  reservationId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    tenantId,
    approvalId,
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: `apt_${hint}` },
    payload: payload(hint),
    proposalHash: proposalHash(hint),
    agentId: 'agent_secretary',
    agentVersion: '1.0.0',
    policyVersion: 'policy-v1',
    capability: 'appointments.manage',
    reservationId,
    ownerId: 'op_operator_1',
    ttlMs: 60_000,
    ...overrides
  }
}

function evidence(
  outcome: 'no_effect' | 'effect_confirmed' | 'effect_possibly_started'
): EffectEvidence {
  if (outcome === 'effect_confirmed') {
    return {
      outcome,
      evidenceRef: `evidence:${outcome}`,
      executionRef: 'execution:synthetic'
    }
  }
  if (outcome === 'no_effect') {
    return {
      outcome,
      evidenceRef: `evidence:${outcome}`,
      source: 'adapter'
    }
  }
  return { outcome, evidenceRef: `evidence:${outcome}` }
}

function cloneRow(row: FakeRow): FakeRow {
  return structuredClone(row)
}

class FakeApprovalPool implements PostgresPoolLike {
  readonly rows: FakeRow[] = []
  failCompareAndSet = false

  async connect(): Promise<PostgresPoolClient> {
    return {
      query: (async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ) => this.query<T>(text, values ?? [])) as PostgresPoolClient['query'],
      release: () => undefined
    }
  }

  private async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: unknown[]
  ): Promise<{ rows: T[]; rowCount?: number }> {
    if (
      text === 'BEGIN' ||
      text === 'COMMIT' ||
      text === 'ROLLBACK' ||
      text.startsWith('SELECT set_config')
    ) {
      return { rows: [] as T[] }
    }
    if (text.includes('SELECT NULLIF(current_setting')) {
      return { rows: [{ tenant_id: null } as unknown as T] }
    }
    if (text === 'SHOW search_path') {
      return { rows: [{ search_path: 'public' } as unknown as T] }
    }
    if (text.includes('INSERT INTO runtime_approvals')) {
      this.insert(values)
      return { rows: [] as T[], rowCount: 1 }
    }
    if (text.includes('UPDATE runtime_approvals')) {
      return this.compareAndSet<T>(values)
    }
    if (text.includes('FROM runtime_approvals')) {
      return {
        rows: this.select(text, values).map(cloneRow) as unknown as T[]
      }
    }
    throw new Error(`Unexpected synthetic SQL: ${text}`)
  }

  private insert(values: unknown[]): void {
    const row = {} as FakeRow
    const mutableRow = row as unknown as Record<string, unknown>
    for (const [index, column] of persistedColumns.entries()) {
      const value = values[index]
      mutableRow[column] =
        column === 'used_reservation_ids'
          ? JSON.parse(String(value))
          : column === 'proposal_payload' && value !== null
            ? JSON.parse(String(value))
            : value
    }
    row.revision = 1
    row.created_at = values[persistedColumns.length] as never
    row.updated_at = values[persistedColumns.length] as never
    this.rows.push(row)
  }

  private select(text: string, values: unknown[]): FakeRow[] {
    const tenant = String(values[0])
    let rows = this.rows.filter((row) => row.tenant_id === tenant)
    if (text.includes('approval_id = $2')) {
      rows = rows.filter((row) => row.approval_id === String(values[1]))
    } else if (text.includes('status = $2')) {
      rows = rows.filter((row) => row.status === values[1])
    } else if (text.includes('operation_key = $2')) {
      rows = rows.filter((row) => row.operation_key === values[1])
    } else if (text.includes("status IN ('REQUESTED', 'PENDING')")) {
      rows = rows.filter(
        (row) => row.status === 'REQUESTED' || row.status === 'PENDING'
      )
    } else if (text.includes("status IN ('RESERVED', 'EXECUTING')")) {
      const now = new Date(String(values[1])).getTime()
      rows = rows.filter(
        (row) =>
          (row.status === 'RESERVED' || row.status === 'EXECUTING') &&
          row.reservation_expires_at !== null &&
          new Date(String(row.reservation_expires_at)).getTime() <= now
      )
    }
    return rows.sort((left, right) =>
      String(left.requested_at).localeCompare(String(right.requested_at))
    )
  }

  private compareAndSet<T extends QueryResultRow>(
    values: unknown[]
  ): { rows: T[]; rowCount?: number } {
    const mutableColumns = persistedColumns.slice(2)
    const revisionIndex = mutableColumns.length + 3
    const statusIndex = mutableColumns.length + 4
    const reservationIndex = mutableColumns.length + 5
    const generationIndex = mutableColumns.length + 6
    const row = this.rows.find(
      (candidate) =>
        candidate.tenant_id === values[0] && candidate.approval_id === values[1]
    )
    if (
      this.failCompareAndSet ||
      !row ||
      Number(row.revision) !== Number(values[revisionIndex]) ||
      row.status !== values[statusIndex] ||
      (row.reservation_id ?? '') !== values[reservationIndex] ||
      Number(row.reservation_generation) !== Number(values[generationIndex])
    ) {
      return { rows: [] as T[], rowCount: 0 }
    }
    const mutableRow = row as unknown as Record<string, unknown>
    for (const [index, column] of mutableColumns.entries()) {
      const value = values[index + 2]
      mutableRow[column] =
        column === 'used_reservation_ids'
          ? JSON.parse(String(value))
          : column === 'proposal_payload' && value !== null
            ? JSON.parse(String(value))
            : value
    }
    row.revision = Number(row.revision) + 1
    row.updated_at = values[mutableColumns.length + 2] as never
    return {
      rows: [{ revision: row.revision } as unknown as T],
      rowCount: 1
    }
  }
}

async function approved(
  authority: PostgresApprovalAuthority,
  hint: string
): Promise<ApprovalRecord> {
  const requested = await authority.request(requestInput(hint))
  await authority.submit(tenantId, requested.approvalId, 'op_operator_1')
  return authority.approve(tenantId, requested.approvalId, {
    approverId: 'op_approver_1'
  })
}

describe('synthetic PostgreSQL runtime approval authority', () => {
  it('persists the approval state machine and exposes tenant-scoped reads', async () => {
    const pool = new FakeApprovalPool()
    const authority = new PostgresApprovalAuthority(pool, {
      clock: () => baseNow
    })
    const requested = await authority.request(requestInput('lifecycle'))
    expect(
      (await authority.listPending(tenantId)).map((item) => item.approvalId)
    ).toEqual([requested.approvalId])
    await authority.submit(tenantId, requested.approvalId, 'op_operator_1')
    const approvedRecord = await authority.approve(
      tenantId,
      requested.approvalId,
      {
        approverId: 'op_approver_1',
        reason: 'synthetic approval'
      }
    )
    expect(approvedRecord.status).toBe('APPROVED')
    const reservation = await authority.reserve(
      reserveInput('lifecycle', requested.approvalId, 'reservation-lifecycle')
    )
    expect(reservation.generation).toBe(1)
    await authority.markExecuting({
      tenantId,
      approvalId: requested.approvalId,
      reservationId: reservation.reservationId
    })
    const executed = await authority.confirm({
      tenantId,
      approvalId: requested.approvalId,
      reservationId: reservation.reservationId,
      evidence: evidence('effect_confirmed')
    })
    expect(executed.status).toBe('EXECUTED')
    expect(executed.executionCount).toBe(1)
    expect((await authority.get(tenantId, requested.approvalId)).status).toBe(
      'EXECUTED'
    )
    expect(await authority.list(tenantId, 'EXECUTED')).toHaveLength(1)
    expect(
      await authority.getByOperationKey(tenantId, 'missing-operation')
    ).toEqual([])
    await expect(
      authority.get(tenantId, 'missing-approval')
    ).rejects.toBeInstanceOf(ApprovalError)
    await expect(authority.expireStale()).rejects.toMatchObject({
      code: 'invalid_action'
    })
  })

  it('covers reject, cancel, single-use consume, release, failure, and uncertainty', async () => {
    const pool = new FakeApprovalPool()
    const authority = new PostgresApprovalAuthority(pool, {
      clock: () => baseNow
    })

    const rejected = await authority.request(requestInput('reject'))
    await authority.submit(tenantId, rejected.approvalId, 'op_operator_1')
    expect(
      await authority.reject(tenantId, rejected.approvalId, {
        approverId: 'op_approver_1',
        reason: 'synthetic rejection'
      })
    ).toMatchObject({ status: 'REJECTED' })

    const cancelled = await authority.request(requestInput('cancel'))
    expect(
      await authority.cancel(tenantId, cancelled.approvalId, 'op_operator_1')
    ).toMatchObject({
      status: 'CANCELLED'
    })

    const consumed = await authority.request(
      requestInput('consume', { singleUse: true })
    )
    await authority.submit(tenantId, consumed.approvalId, 'op_operator_1')
    await authority.approve(tenantId, consumed.approvalId, {
      approverId: 'op_approver_1'
    })
    expect(
      await authority.verifyAndConsume({
        tenantId,
        approvalId: consumed.approvalId,
        action: 'appointment.confirm',
        resource: { type: 'appointment', id: 'apt_consume' },
        payload: payload('consume'),
        executionRef: 'execution:consume'
      })
    ).toMatchObject({
      approvalId: consumed.approvalId,
      executionRef: 'execution:consume'
    })
    await expect(
      authority.get(tenantId, consumed.approvalId)
    ).resolves.toMatchObject({
      status: 'EXECUTED'
    })

    const releaseRecord = await approved(authority, 'release')
    const releaseReservation = await authority.reserve(
      reserveInput('release', releaseRecord.approvalId, 'reservation-release')
    )
    expect(
      await authority.release({
        tenantId,
        approvalId: releaseRecord.approvalId,
        reservationId: releaseReservation.reservationId,
        evidence: evidence('no_effect')
      })
    ).toMatchObject({ status: 'APPROVED' })

    const failedRecord = await approved(authority, 'fail')
    const failedReservation = await authority.reserve(
      reserveInput('fail', failedRecord.approvalId, 'reservation-fail')
    )
    expect(
      await authority.fail({
        tenantId,
        approvalId: failedRecord.approvalId,
        reservationId: failedReservation.reservationId,
        evidence: evidence('no_effect')
      })
    ).toMatchObject({ status: 'FAILED' })

    const uncertainRecord = await approved(authority, 'uncertain')
    const uncertainReservation = await authority.reserve(
      reserveInput(
        'uncertain',
        uncertainRecord.approvalId,
        'reservation-uncertain'
      )
    )
    await authority.markExecuting({
      tenantId,
      approvalId: uncertainRecord.approvalId,
      reservationId: uncertainReservation.reservationId
    })
    await authority.markUncertain({
      tenantId,
      approvalId: uncertainRecord.approvalId,
      reservationId: uncertainReservation.reservationId,
      reason: 'synthetic crash',
      evidence: evidence('effect_possibly_started')
    })
    expect(
      await authority.reconcile({
        tenantId,
        approvalId: uncertainRecord.approvalId,
        actorId: 'op_reconciler',
        evidence: evidence('effect_confirmed')
      })
    ).toMatchObject({ status: 'EXECUTED' })
  })

  it('sweeps expired reservations, preserves uncertain effects, and fences CAS conflicts', async () => {
    const pool = new FakeApprovalPool()
    const authority = new PostgresApprovalAuthority(pool, {
      clock: () => baseNow
    })
    const releasedRecord = await approved(authority, 'expired-release')
    const releasedReservation = await authority.reserve(
      reserveInput(
        'expired-release',
        releasedRecord.approvalId,
        'reservation-expired-release',
        { ttlMs: 1_000 }
      )
    )
    await expect(
      authority.releaseExpired({
        tenantId,
        now: new Date(Date.parse(releasedReservation.reservationExpiresAt) + 1),
        evidenceFor: () => evidence('no_effect')
      })
    ).resolves.toEqual({ released: 1, uncertain: 0 })

    const uncertainRecord = await approved(authority, 'expired-uncertain')
    const uncertainReservation = await authority.reserve(
      reserveInput(
        'expired-uncertain',
        uncertainRecord.approvalId,
        'reservation-expired-uncertain',
        { ttlMs: 1_000 }
      )
    )
    await authority.markExecuting({
      tenantId,
      approvalId: uncertainRecord.approvalId,
      reservationId: uncertainReservation.reservationId
    })
    await expect(
      authority.releaseExpired({
        tenantId,
        now: new Date(
          Date.parse(uncertainReservation.reservationExpiresAt) + 1
        ),
        evidenceFor: () => undefined
      })
    ).resolves.toEqual({ released: 0, uncertain: 1 })

    const conflictRecord = await authority.request(requestInput('cas-conflict'))
    pool.failCompareAndSet = true
    await expect(
      authority.cancel(tenantId, conflictRecord.approvalId, 'op_operator_1')
    ).rejects.toMatchObject({ code: 'conflict' } satisfies Partial<DomainError>)
    pool.failCompareAndSet = false
  })

  it('rejects malformed durable row values before they enter the engine', () => {
    const row = {
      tenant_id: tenantId,
      approval_id: 'approval-malformed',
      operator_id: 'operator',
      agent_id: 'agent',
      agent_version: '1.0.0',
      action: 'action',
      resource_type: 'resource',
      resource_id: null,
      payload_hash: 'hash',
      policy_version: 'policy',
      prompt_version: null,
      correlation_id: 'correlation',
      status: 'REQUESTED' as ApprovalStatus,
      single_use: false,
      requested_at: baseNow,
      expires_at: new Date(baseNow.getTime() + 1_000),
      approved_at: null,
      executed_at: null,
      rejected_at: null,
      cancelled_at: null,
      expired_at: null,
      approver_id: null,
      decision_actor_type: null,
      decision_correlation_id: null,
      decision_command_key: null,
      decision_reason: null,
      execution_count: 0,
      execution_ref: null,
      reservation_id: null,
      reservation_owner: null,
      reservation_expires_at: null,
      reservation_generation: 0,
      used_reservation_ids: ['ok'],
      reserved_at: null,
      executing_at: null,
      released_at: null,
      failed_at: null,
      uncertain_at: null,
      confirmed_at: null,
      confirmation_evidence_ref: null,
      proposal_id: null,
      proposal_hash: null,
      capability: null,
      data_classification: null,
      proposal_payload: null,
      operation_key: null,
      revision: 1,
      created_at: baseNow,
      updated_at: baseNow
    } satisfies RuntimeApprovalRow
    expect(mapRuntimeApprovalRow(row)).toMatchObject({
      approvalId: 'approval-malformed',
      usedReservationIds: ['ok']
    })
    expect(() =>
      mapRuntimeApprovalRow({ ...row, used_reservation_ids: 'not-an-array' })
    ).toThrow(/JSON array/)
    expect(() =>
      mapRuntimeApprovalRow({ ...row, used_reservation_ids: [1] })
    ).toThrow(/non-string/)
  })
})
