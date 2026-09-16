import { strict as assert } from 'node:assert'
import type { QueryResultRow } from 'pg'
import {
  createApproved,
  fail,
  newSchema,
  pass,
  requestInput,
  reserveInput,
  tenantId
} from './lib.ts'
import type {
  PostgresPoolClient,
  PostgresPoolLike
} from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/tenant-scoped-postgres.ts'
import { PostgresApprovalAuthority } from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/runtime-approval-store.ts'

class RecordingPool implements PostgresPoolLike {
  readonly statements: string[] = []
  constructor(
    private readonly inner: {
      connect(): Promise<PostgresPoolClient>
    }
  ) {}
  async connect(): Promise<PostgresPoolClient> {
    const client = await this.inner.connect()
    const statements = this.statements
    return {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ) {
        statements.push(text)
        return client.query<T>(text, values)
      },
      release: (error?: Error) => client.release(error)
    }
  }
}

const h = await newSchema('g')
const pools: Array<{ end(): Promise<void> }> = []
try {
  const tenant = tenantId('critic_invariants')
  const hint = 'invariants'
  const pool = h.makePool(3)
  pools.push(pool)
  const inner = new RecordingPool(pool)
  const authority = new PostgresApprovalAuthority(inner)

  const revisionOf = async (approvalId: string): Promise<string> => {
    const result = await pool.query<{ revision: string }>(
      `SELECT revision::text FROM runtime_approvals WHERE tenant_id = $1 AND approval_id = $2`,
      [tenant, approvalId]
    )
    return result.rows[0]?.revision ?? 'missing'
  }
  const changedRevision = async (fn: () => Promise<void>): Promise<string> => {
    await fn()
    return revisionOf(currentId)
  }

  let currentId = ''
  const requested = await authority.request(requestInput(tenant, hint))
  currentId = requested.approvalId
  assert.equal(await revisionOf(currentId), '1', 'insert revision must be 1')

  const submit = await authority.submit(tenant, currentId, 'op_critic')
  assert.equal(submit.status, 'PENDING')
  assert.equal(await revisionOf(currentId), '2')

  const approve = await authority.approve(tenant, currentId, {
    approverId: 'op_approver_critic'
  })
  assert.equal(approve.status, 'APPROVED')
  assert.equal(await revisionOf(currentId), '3')

  const reservation = await authority.reserve(
    reserveInput(tenant, hint, currentId, `rsv_${hint}_1`)
  )
  assert.equal(await revisionOf(currentId), '4')

  await authority.release({
    tenantId: tenant,
    approvalId: currentId,
    reservationId: reservation.reservationId,
    evidence: {
      outcome: 'no_effect',
      source: 'adapter',
      evidenceRef: 'critic:inv'
    }
  })
  assert.equal(await revisionOf(currentId), '5')
  console.log('revision increments on every persisted transition: 1..5')

  const update = inner.statements.find((text) =>
    text.includes('UPDATE runtime_approvals')
  )
  assert.ok(update, 'an UPDATE statement must have been recorded')
  for (const clause of [
    'AND revision = $',
    'AND status = $',
    "AND COALESCE(reservation_id, '') = $",
    'AND reservation_generation = $'
  ]) {
    assert.ok(update?.includes(clause), `CAS predicate missing: ${clause}`)
  }
  console.log(
    'CAS predicate ships all four clauses: revision/status/reservation_id/generation'
  )

  await assert.rejects(
    async () => await authority.expireStale(),
    (error: { code?: string }) => error.code === 'invalid_action'
  )
  console.log('expireStale rejected with invalid_action')

  // releaseExpired must only touch RESERVED/EXECUTING, never UNCERTAIN/FAILED.
  const stuck = await createApproved(authority, tenant, 'invariants_stuck')
  const stuckReservation = await authority.reserve(
    reserveInput(tenant, 'invariants_stuck', stuck.approvalId, `rsv_stuck_1`, {
      ttlMs: 1_000
    })
  )
  await authority.markUncertain({
    tenantId: tenant,
    approvalId: stuck.approvalId,
    reservationId: stuckReservation.reservationId,
    reason: 'critic: explicitly uncertain'
  })
  await pool.query(
    `UPDATE runtime_approvals
       SET reservation_expires_at = now() - interval '1 hour'
     WHERE tenant_id = $1 AND approval_id = $2`,
    [tenant, stuck.approvalId]
  )
  const stuckRevision = await revisionOf(stuck.approvalId)
  const sweep = await authority.releaseExpired({
    tenantId: tenant,
    now: new Date(),
    evidenceFor: () => ({
      outcome: 'no_effect',
      source: 'journal',
      evidenceRef: 'critic:must-not-apply'
    })
  })
  assert.equal(sweep.released, 0, 'UNCERTAIN must never be released')
  assert.equal(sweep.uncertain, 0, 'UNCERTAIN must never be re-marked')
  assert.equal(
    await revisionOf(stuck.approvalId),
    stuckRevision,
    'UNCERTAIN row must not be mutated by the sweep'
  )
  assert.equal(
    (await authority.get(tenant, stuck.approvalId)).status,
    'UNCERTAIN'
  )
  console.log(
    'releaseExpired leaves an expired-reservation UNCERTAIN row untouched'
  )

  await pool.end()
  pass(
    'invariants: revision, CAS predicate, expireStale rejection, sweep selectivity'
  )
} catch (error) {
  console.error(error)
  fail(`probe-g aborted: ${(error as Error).message}`)
} finally {
  await h.drop(...(pools as never[]))
}
