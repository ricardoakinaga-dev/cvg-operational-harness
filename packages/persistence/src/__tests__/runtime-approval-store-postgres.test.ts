import { createHash, randomBytes } from 'node:crypto'
import { Client, Pool, type QueryResultRow } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApprovalError } from '@cvg/approval-engine'
import { readPostgresMigrationSql, runPostgresMigrations } from '../postgres.ts'
import { PostgresApprovalAuthority } from '../runtime-approval-store.ts'
import {
  withTenantTransaction,
  type PostgresPoolClient,
  type PostgresPoolLike
} from '../tenant-scoped-postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

const tenantA = 'tenant_00000000-0000-4000-8000-000000000a11'
const tenantPending = 'tenant_00000000-0000-4000-8000-000000000a13'
const tenantRls = 'tenant_00000000-0000-4000-8000-000000000a14'
const tenantRlsOther = 'tenant_00000000-0000-4000-8000-000000000a15'
const tenantCrashMissing = 'tenant_00000000-0000-4000-8000-000000000a16'
const tenantCrashPossibly = 'tenant_00000000-0000-4000-8000-000000000a17'

const migrationsThrough0014 = [
  '0000_initial',
  '0001_tenant_isolation',
  '0002_capability_approvals',
  '0003_test_suite_catalog',
  '0004_plugin_manifest_catalog',
  '0005_knowledge_source_catalog',
  '0006_release_candidate_evidence',
  '0007_audit_evidence_checkpoint',
  '0008_session_agent_version_pin',
  '0009_release_candidate_validator_integrity',
  '0010_outbox_durability',
  '0011_outbox_payload_redaction',
  '0012_channel_effect_journal',
  '0013_runtime_effect_journal',
  '0014_journeys'
]

function proposalHashFor(hint: string): string {
  return createHash('sha256').update(`proposal:${hint}`, 'utf8').digest('hex')
}

function syntheticPayload(hint: string): unknown {
  return {
    kind: 'synthetic_appointment_draft',
    draftId: `draft_${hint}`,
    note: 'synthetic fixture only'
  }
}

function requestInput(tenantId: string, hint: string) {
  return {
    tenantId,
    operatorId: 'op_operator_1',
    agentId: 'agent_secretary',
    agentVersion: '1.0.0',
    action: 'appointment.confirm',
    resource: { type: 'appointment', id: `apt_${hint}` },
    payload: syntheticPayload(hint),
    policyVersion: 'policy-v1',
    correlationId: `corr:${hint}`,
    proposalId: `proposal_${hint}`,
    proposalHash: proposalHashFor(hint),
    capability: 'appointments.manage',
    dataClassification: 'synthetic',
    proposalPayload: syntheticPayload(hint)
  }
}

function reserveInput(
  tenantId: string,
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
    payload: syntheticPayload(hint),
    proposalHash: proposalHashFor(hint),
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

async function createApproved(
  authority: PostgresApprovalAuthority,
  tenantId: string,
  hint: string
) {
  const record = await authority.request(requestInput(tenantId, hint))
  await authority.submit(tenantId, record.approvalId, 'op_operator_1')
  return await authority.approve(tenantId, record.approvalId, {
    approverId: 'op_approver_1'
  })
}

/**
 * Records every statement forwarded to a checked-out connection so a test can
 * assert the compare-and-set predicate actually shipped in the UPDATE text.
 */
class RecordingPool implements PostgresPoolLike {
  readonly statements: string[] = []

  constructor(private readonly inner: Pool) {}

  async connect(): Promise<PostgresPoolClient> {
    const client = await this.inner.connect()
    const statements = this.statements
    return {
      query: async <T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ) => {
        statements.push(text)
        return client.query<T>(text, values)
      },
      release: (error?: Error) => client.release(error)
    }
  }
}

describeWithPostgres('durable runtime approval authority (PROD-04)', () => {
  const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
  const schema = `cvg_prod04_${suffix}`
  const password = 'synthetic-role-password'
  let admin: Client
  let pool: Pool
  let authority: PostgresApprovalAuthority
  const createdRoles: string[] = []

  const createPool = (max = 4): Pool =>
    new Pool({
      connectionString: testDatabaseUrl,
      max,
      options: `-c search_path=${schema}`
    })

  const roleUrl = (username: string): string => {
    const parsed = new URL(testDatabaseUrl as string)
    parsed.username = username
    parsed.password = password
    return parsed.toString()
  }

  beforeAll(async () => {
    if (!testDatabaseUrl) return
    admin = new Client({ connectionString: testDatabaseUrl })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: schema })
    pool = createPool()
    authority = new PostgresApprovalAuthority(pool)
  })

  afterAll(async () => {
    if (!testDatabaseUrl) return
    for (const role of createdRoles) {
      await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined)
      await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
    }
    await pool?.end().catch(() => undefined)
    await admin
      .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin?.end().catch(() => undefined)
  })

  it('ships the additive runtime approval migration with forced RLS', async () => {
    const migration = await readPostgresMigrationSql(
      '0015_runtime_approval_store'
    )

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS runtime_approvals')
    for (const status of [
      'REQUESTED',
      'PENDING',
      'APPROVED',
      'RESERVED',
      'EXECUTING',
      'REJECTED',
      'EXPIRED',
      'CANCELLED',
      'EXECUTED',
      'FAILED',
      'UNCERTAIN'
    ]) {
      expect(migration).toContain(status)
    }
    expect(migration).toContain('PRIMARY KEY (tenant_id, approval_id)')
    expect(migration).toContain('revision bigint NOT NULL DEFAULT 1')
    expect(migration).toContain('reservation_generation bigint NOT NULL')
    expect(migration).toContain('used_reservation_ids jsonb NOT NULL')
    expect(migration).toContain('proposal_payload jsonb')
    expect(migration).toContain('proposal_hash text')
    expect(migration).toContain('data_classification text')
    expect(migration).toContain(
      'idx_runtime_approvals_status_reservation_expires'
    )
    expect(migration).toContain('idx_runtime_approvals_operation_key')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain("current_setting('cvg.tenant_id', true)")
    expect(migration).toContain('REVOKE ALL ON runtime_approvals FROM PUBLIC')
  })

  it('applies 0015 additively over 0014 with the checksum guard', async () => {
    const additiveSchema = `cvg_prod04_add_${suffix}`
    await admin.query(`CREATE SCHEMA ${additiveSchema}`)
    try {
      await runPostgresMigrations(admin, {
        schemaName: additiveSchema,
        migrations: migrationsThrough0014
      })
      const before = await admin.query<{ version: string }>(
        `SELECT version FROM ${additiveSchema}.schema_migrations ORDER BY version`
      )
      expect(before.rows.map((row) => row.version)).not.toContain(
        '0015_runtime_approval_store'
      )

      await runPostgresMigrations(admin, { schemaName: additiveSchema })
      await expect(
        runPostgresMigrations(admin, { schemaName: additiveSchema })
      ).resolves.toBeUndefined()

      const after = await admin.query<{
        version: string
        checksum: string | null
      }>(
        `SELECT version, checksum
         FROM ${additiveSchema}.schema_migrations
         ORDER BY version`
      )
      const migration = after.rows.find(
        (row) => row.version === '0015_runtime_approval_store'
      )
      expect(migration?.checksum).toMatch(/^[0-9a-f]{64}$/)

      const rls = await admin.query<{
        relrowsecurity: boolean
        relforcerowsecurity: boolean
      }>(
        `SELECT relrowsecurity, relforcerowsecurity
         FROM pg_class
         WHERE oid = '${additiveSchema}.runtime_approvals'::regclass`
      )
      expect(rls.rows[0]).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true
      })
    } finally {
      await admin
        .query(`DROP SCHEMA IF EXISTS ${additiveSchema} CASCADE`)
        .catch(() => undefined)
    }
  })

  it('keeps proposal and reservation across an adapter restart', async () => {
    const hint = `restart_${randomBytes(4).toString('hex')}`
    const record = await authority.request(requestInput(tenantA, hint))
    await authority.submit(tenantA, record.approvalId, 'op_operator_1')
    await authority.approve(tenantA, record.approvalId, {
      approverId: 'op_approver_1'
    })
    const reservation = await authority.reserve(
      reserveInput(tenantA, hint, record.approvalId, `rsv_${hint}_1`)
    )

    await pool.end()
    pool = createPool()
    authority = new PostgresApprovalAuthority(pool)

    const persisted = await authority.get(tenantA, record.approvalId)
    expect(persisted.status).toBe('RESERVED')
    expect(persisted.proposalHash).toBe(proposalHashFor(hint))
    expect(persisted.proposalPayload).toEqual(syntheticPayload(hint))
    expect(persisted.dataClassification).toBe('synthetic')
    expect(persisted.reservationId).toBe(reservation.reservationId)
    expect(persisted.reservationGeneration).toBe(reservation.generation)
    expect(persisted.reservationExpiresAt).toBe(
      reservation.reservationExpiresAt
    )
    expect(persisted.usedReservationIds).toEqual([reservation.reservationId])
  })

  it('serializes a two-connection reserve to exactly one winner', async () => {
    const hint = `race_${randomBytes(4).toString('hex')}`
    const record = await createApproved(authority, tenantA, hint)
    const secondPool = createPool(2)
    try {
      const secondAuthority = new PostgresApprovalAuthority(secondPool)
      const results = await Promise.allSettled([
        authority.reserve(
          reserveInput(tenantA, hint, record.approvalId, `rsv_${hint}_a`)
        ),
        secondAuthority.reserve(
          reserveInput(tenantA, hint, record.approvalId, `rsv_${hint}_b`)
        )
      ])
      const fulfilled = results.filter(
        (result) => result.status === 'fulfilled'
      )
      const rejected = results.filter((result) => result.status === 'rejected')
      expect(fulfilled).toHaveLength(1)
      expect(rejected).toHaveLength(1)
      const reason = (rejected[0] as PromiseRejectedResult).reason
      expect(reason).toBeInstanceOf(ApprovalError)
      expect((reason as ApprovalError).code).toBe('already_reserved')

      const persisted = await authority.get(tenantA, record.approvalId)
      expect(persisted.status).toBe('RESERVED')
      expect(persisted.reservationGeneration).toBe(1)
      expect(persisted.usedReservationIds).toHaveLength(1)
    } finally {
      await secondPool.end().catch(() => undefined)
    }
  })

  it('fences generations and ships the SQL compare-and-set predicate', async () => {
    const hint = `fence_${randomBytes(4).toString('hex')}`
    const record = await createApproved(authority, tenantA, hint)
    const recordingInner = createPool(2)
    const recording = new RecordingPool(recordingInner)
    try {
      const fencing = new PostgresApprovalAuthority(recording)
      const first = await fencing.reserve(
        reserveInput(tenantA, hint, record.approvalId, `rsv_${hint}_g1`)
      )
      await fencing.release({
        tenantId: tenantA,
        approvalId: record.approvalId,
        reservationId: first.reservationId,
        evidence: {
          outcome: 'no_effect',
          source: 'adapter',
          evidenceRef: 'probe:release'
        }
      })
      const afterRelease = await fencing.get(tenantA, record.approvalId)
      expect(afterRelease.status).toBe('APPROVED')
      expect(afterRelease.reservationId).toBeUndefined()
      expect(afterRelease.reservationGeneration).toBe(1)

      const second = await fencing.reserve(
        reserveInput(tenantA, hint, record.approvalId, `rsv_${hint}_g2`)
      )
      expect(second.generation).toBe(2)

      await expect(
        fencing.confirm({
          tenantId: tenantA,
          approvalId: record.approvalId,
          reservationId: first.reservationId,
          evidence: {
            outcome: 'effect_confirmed',
            executionRef: `exec_${hint}_stale`,
            evidenceRef: 'probe:stale'
          }
        })
      ).rejects.toMatchObject({ code: 'reservation_mismatch' })

      const persisted = await fencing.get(tenantA, record.approvalId)
      expect(persisted.status).toBe('RESERVED')
      expect(persisted.reservationId).toBe(second.reservationId)
      expect(persisted.reservationGeneration).toBe(2)
      expect(persisted.usedReservationIds).toEqual([
        first.reservationId,
        second.reservationId
      ])

      const update = recording.statements.find((statement) =>
        statement.includes('UPDATE runtime_approvals')
      )
      expect(update).toBeDefined()
      expect(update).toContain('AND revision = $')
      expect(update).toContain('AND status = $')
      expect(update).toContain("AND COALESCE(reservation_id, '') = $")
      expect(update).toContain('AND reservation_generation = $')
    } finally {
      await recordingInner.end().catch(() => undefined)
    }
  })

  it('releases an expired RESERVED approval with no_effect evidence', async () => {
    const hint = `crash_before_${randomBytes(4).toString('hex')}`
    const record = await createApproved(authority, tenantA, hint)
    const reservation = await authority.reserve(
      reserveInput(tenantA, hint, record.approvalId, `rsv_${hint}_1`, {
        ttlMs: 1_000
      })
    )
    const now = new Date(Date.parse(reservation.reservationExpiresAt) + 1_000)
    const sweep = await authority.releaseExpired({
      tenantId: tenantA,
      now,
      evidenceFor: (candidate) =>
        candidate.approvalId === record.approvalId
          ? {
              outcome: 'no_effect',
              source: 'journal',
              evidenceRef: `journal:${hint}:absent`
            }
          : undefined
    })
    expect(sweep).toEqual({ released: 1, uncertain: 0 })

    const persisted = await authority.get(tenantA, record.approvalId)
    expect(persisted.status).toBe('APPROVED')
    expect(persisted.reservationId).toBeUndefined()
    expect(persisted.reservationGeneration).toBe(1)
    expect(persisted.usedReservationIds).toEqual([reservation.reservationId])
    expect(persisted.releasedAt).toBeDefined()
  })

  it('keeps an EXECUTING approval UNCERTAIN until explicit reconciliation', async () => {
    const missingHint = `crash_after_missing_${randomBytes(4).toString('hex')}`
    const missing = await createApproved(
      authority,
      tenantCrashMissing,
      missingHint
    )
    const missingReservation = await authority.reserve(
      reserveInput(
        tenantCrashMissing,
        missingHint,
        missing.approvalId,
        `rsv_${missingHint}_1`,
        { ttlMs: 1_000 }
      )
    )
    await authority.markExecuting({
      tenantId: tenantCrashMissing,
      approvalId: missing.approvalId,
      reservationId: missingReservation.reservationId
    })
    const missingNow = new Date(
      Date.parse(missingReservation.reservationExpiresAt) + 1_000
    )
    const firstSweep = await authority.releaseExpired({
      tenantId: tenantCrashMissing,
      now: missingNow,
      evidenceFor: () => undefined
    })
    expect(firstSweep).toEqual({ released: 0, uncertain: 1 })

    const secondSweep = await authority.releaseExpired({
      tenantId: tenantCrashMissing,
      now: new Date(missingNow.getTime() + 60_000),
      evidenceFor: () => undefined
    })
    expect(secondSweep).toEqual({ released: 0, uncertain: 0 })
    const stillUncertain = await authority.get(
      tenantCrashMissing,
      missing.approvalId
    )
    expect(stillUncertain.status).toBe('UNCERTAIN')

    const reconciled = await authority.reconcile({
      tenantId: tenantCrashMissing,
      approvalId: missing.approvalId,
      actorId: 'op_reconciler',
      evidence: {
        outcome: 'effect_confirmed',
        executionRef: `exec_${missingHint}`,
        evidenceRef: `journal:${missingHint}:confirmed`
      }
    })
    expect(reconciled.status).toBe('EXECUTED')
    expect(reconciled.executionRef).toBe(`exec_${missingHint}`)
    expect(reconciled.executionCount).toBe(1)

    const possiblyHint = `crash_after_possibly_${randomBytes(4).toString('hex')}`
    const possibly = await createApproved(
      authority,
      tenantCrashPossibly,
      possiblyHint
    )
    const possiblyReservation = await authority.reserve(
      reserveInput(
        tenantCrashPossibly,
        possiblyHint,
        possibly.approvalId,
        `rsv_${possiblyHint}_1`,
        { ttlMs: 1_000 }
      )
    )
    await authority.markExecuting({
      tenantId: tenantCrashPossibly,
      approvalId: possibly.approvalId,
      reservationId: possiblyReservation.reservationId
    })
    const possiblyNow = new Date(
      Date.parse(possiblyReservation.reservationExpiresAt) + 1_000
    )
    const possiblySweep = await authority.releaseExpired({
      tenantId: tenantCrashPossibly,
      now: possiblyNow,
      evidenceFor: () => ({
        outcome: 'effect_possibly_started',
        evidenceRef: `journal:${possiblyHint}:started`
      })
    })
    expect(possiblySweep).toEqual({ released: 0, uncertain: 1 })
    const possiblyPersisted = await authority.get(
      tenantCrashPossibly,
      possibly.approvalId
    )
    expect(possiblyPersisted.status).toBe('UNCERTAIN')
  })

  it('isolates rows for a non-BYPASSRLS runtime role', async () => {
    const hintOwn = `rls_own_${randomBytes(4).toString('hex')}`
    const hintOther = `rls_other_${randomBytes(4).toString('hex')}`
    const role = `cvg_prod04_rls_${suffix}`
    await admin.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS`
    )
    createdRoles.push(role)
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE ON ${schema}.runtime_approvals TO ${role}`
    )
    await admin.query(`ALTER ROLE ${role} SET search_path TO ${schema}`)

    const rolePool = new Pool({ connectionString: roleUrl(role), max: 2 })
    try {
      const roleAuthority = new PostgresApprovalAuthority(rolePool)
      const own = await roleAuthority.request(requestInput(tenantRls, hintOwn))
      await authority.request(requestInput(tenantRlsOther, hintOther))

      const visible = await withTenantTransaction(
        rolePool,
        tenantRls,
        async (client) => {
          const result = await client.query<{ count: number }>(
            `SELECT count(*)::int AS count
             FROM runtime_approvals
             WHERE tenant_id = $1`,
            [tenantRls]
          )
          return result.rows[0]?.count
        }
      )
      expect(visible).toBe(1)

      const leaked = await withTenantTransaction(
        rolePool,
        tenantRls,
        async (client) => {
          const result = await client.query<{ count: number }>(
            `SELECT count(*)::int AS count
             FROM runtime_approvals
             WHERE tenant_id = $1`,
            [tenantRlsOther]
          )
          return result.rows[0]?.count
        }
      )
      expect(leaked).toBe(0)

      const noContext = await rolePool.query<{ count: number }>(
        `SELECT count(*)::int AS count FROM runtime_approvals`
      )
      expect(noContext.rows[0]?.count).toBe(0)

      const persistedOwn = await roleAuthority.get(tenantRls, own.approvalId)
      expect(persistedOwn.approvalId).toBe(own.approvalId)
    } finally {
      await rolePool.end().catch(() => undefined)
    }
  })

  it('returns operation-key candidates and filters pending approvals', async () => {
    const hintA = `opkey_a_${randomBytes(4).toString('hex')}`
    const hintB = `opkey_b_${randomBytes(4).toString('hex')}`
    const hintC = `opkey_c_${randomBytes(4).toString('hex')}`
    const operationKey = `op:${randomBytes(16).toString('hex')}`
    const requested = await authority.request(
      requestInput(tenantPending, hintA)
    )
    const pending = await authority.request(requestInput(tenantPending, hintB))
    await authority.submit(tenantPending, pending.approvalId, 'op_operator_1')
    const approved = await createApproved(authority, tenantPending, hintC)

    const pendingList = await authority.listPending(tenantPending)
    expect(pendingList.map((record) => record.approvalId).sort()).toEqual(
      [requested.approvalId, pending.approvalId].sort()
    )

    await authority.submit(tenantPending, requested.approvalId, 'op_operator_1')
    await authority.approve(tenantPending, requested.approvalId, {
      approverId: 'op_approver_1'
    })
    await authority.approve(tenantPending, pending.approvalId, {
      approverId: 'op_approver_1'
    })
    await authority.reserve(
      reserveInput(tenantPending, hintA, requested.approvalId, `rsv_${hintA}`, {
        operationKey
      })
    )
    await authority.reserve(
      reserveInput(tenantPending, hintB, pending.approvalId, `rsv_${hintB}`, {
        operationKey
      })
    )

    const candidates = await authority.getByOperationKey(
      tenantPending,
      operationKey
    )
    expect(candidates.map((record) => record.approvalId).sort()).toEqual(
      [requested.approvalId, pending.approvalId].sort()
    )
    expect(candidates.every((record) => record.status === 'RESERVED')).toBe(
      true
    )

    const missingCandidates = await authority.getByOperationKey(
      tenantPending,
      `op:${'0'.repeat(32)}`
    )
    expect(missingCandidates).toEqual([])

    const approvedList = await authority.list(tenantPending, 'APPROVED')
    expect(approvedList.map((record) => record.approvalId)).toEqual([
      approved.approvalId
    ])
    expect(await authority.listPending(tenantPending)).toEqual([])
  })

  it('persists the engine expiry transition before rethrowing expired', async () => {
    let now = new Date('2026-09-13T12:00:00.000Z')
    const expiring = new PostgresApprovalAuthority(pool, {
      engine: { clock: () => now }
    })
    const hint = `expiring_${randomBytes(4).toString('hex')}`
    const record = await expiring.request({
      ...requestInput(tenantA, hint),
      expiresInMs: 1_000
    })
    now = new Date(now.getTime() + 5_000)

    await expect(
      expiring.submit(tenantA, record.approvalId, 'op_operator_1')
    ).rejects.toMatchObject({ code: 'expired' })

    const persisted = await authority.get(tenantA, record.approvalId)
    expect(persisted.status).toBe('EXPIRED')
    expect(persisted.expiredAt).toBe(now.toISOString())
  })

  it('rejects the cross-tenant expireStale sweep', async () => {
    await expect(authority.expireStale()).rejects.toMatchObject({
      code: 'invalid_action'
    })
  })
})
