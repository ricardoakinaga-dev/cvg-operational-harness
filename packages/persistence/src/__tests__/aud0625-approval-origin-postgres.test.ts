import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runPostgresMigrations } from '../postgres.ts'
import { PostgresApprovalAuthority } from '../runtime-approval-store.ts'

// SPEC 0291 slice 2 (AP05): the origin of an approval survives in PostgreSQL, comes back with
// the record, and cannot be changed by anyone, the runtime role included.
const url = process.env.TEST_DATABASE_URL
const describeWithPostgres = url ? describe : describe.skip
const tenant = 'tenant_00000000-0000-4000-8000-000000000b21'

const base = (hint: string) => ({
  tenantId: tenant,
  operatorId: 'op_1',
  agentId: 'agent_x',
  agentVersion: '1.0.0',
  action: 'record.cancel',
  resource: { type: 'record', id: `apt_${hint}` },
  payload: { hint },
  policyVersion: 'policy-v1',
  correlationId: `corr:${hint}`
})

describeWithPostgres('approval origin in PostgreSQL (SPEC 0291, AP05)', () => {
  const schema = `cvg_ao_${Date.now()}_${randomBytes(3).toString('hex')}`
  let admin: Client
  let pool: Pool
  let authority: PostgresApprovalAuthority

  beforeAll(async () => {
    admin = new Client({ connectionString: url })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: schema })
    pool = new Pool({
      connectionString: url,
      max: 4,
      options: `-c search_path=${schema}`
    })
    authority = new PostgresApprovalAuthority(pool)
  }, 120_000)
  afterAll(async () => {
    await pool?.end().catch(() => undefined)
    await admin
      ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin?.end().catch(() => undefined)
  })

  const directUpdate = (set: string, approvalId: string) =>
    admin.query(
      `UPDATE ${schema}.runtime_approvals SET ${set} WHERE tenant_id = $1 AND approval_id = $2`,
      [tenant, approvalId]
    )

  it('control: a request without origin persists and reads back without one', async () => {
    const record = await authority.request(base('legacy'))
    expect((record as { origin?: unknown }).origin).toBeUndefined()
    const loaded = await authority.get(tenant, record.approvalId)
    expect((loaded as { origin?: unknown }).origin).toBeUndefined()
  })

  it('persists the origin with and without a session, and returns it from get and list', async () => {
    const full = await authority.request({
      ...base('full'),
      origin: { conversationId: 'conv_A', sessionId: 'sess_A' }
    } as never)
    const only = await authority.request({
      ...base('only'),
      origin: { conversationId: 'conv_A' }
    } as never)
    expect(
      ((await authority.get(tenant, full.approvalId)) as { origin?: unknown })
        .origin
    ).toEqual({ conversationId: 'conv_A', sessionId: 'sess_A' })
    expect(
      ((await authority.get(tenant, only.approvalId)) as { origin?: unknown })
        .origin
    ).toEqual({ conversationId: 'conv_A' })
    const listed = await authority.list(tenant)
    expect(
      listed.find((r) => r.approvalId === full.approvalId)?.origin
    ).toEqual({ conversationId: 'conv_A', sessionId: 'sess_A' })
    const row = await admin.query(
      `SELECT origin_conversation_id, origin_session_id FROM ${schema}.runtime_approvals WHERE approval_id = $1`,
      [only.approvalId]
    )
    expect(row.rows[0]).toEqual({
      origin_conversation_id: 'conv_A',
      origin_session_id: null
    })
  })

  it('keeps the origin through the whole lifecycle (submit, approve, reserve updates rewrite the row)', async () => {
    const record = await authority.request({
      ...base('life'),
      origin: { conversationId: 'conv_L', sessionId: 'sess_L' }
    } as never)
    await authority.submit(tenant, record.approvalId, 'op_1')
    const approved = await authority.approve(tenant, record.approvalId, {
      approverId: 'op_2'
    })
    expect((approved as { origin?: unknown }).origin).toEqual({
      conversationId: 'conv_L',
      sessionId: 'sess_L'
    })
  })

  it('refuses a direct UPDATE of the origin: other conversation, other session, removal, and appearance on a legacy row', async () => {
    const withOrigin = await authority.request({
      ...base('imm'),
      origin: { conversationId: 'conv_I', sessionId: 'sess_I' }
    } as never)
    for (const set of [
      "origin_conversation_id = 'conv_other'",
      "origin_session_id = 'sess_other'",
      'origin_session_id = NULL',
      'origin_conversation_id = NULL, origin_session_id = NULL'
    ])
      await expect(directUpdate(set, withOrigin.approvalId)).rejects.toThrow(
        /origin is immutable/
      )
    const legacy = await authority.request(base('imm-legacy'))
    await expect(
      directUpdate("origin_conversation_id = 'conv_new'", legacy.approvalId)
    ).rejects.toThrow(/origin is immutable/)
    const row = await admin.query(
      `SELECT origin_conversation_id, origin_session_id FROM ${schema}.runtime_approvals WHERE approval_id = $1`,
      [withOrigin.approvalId]
    )
    expect(row.rows[0]).toEqual({
      origin_conversation_id: 'conv_I',
      origin_session_id: 'sess_I'
    })
  })

  it('refuses a malformed origin at the table: empty ids, a session without a conversation, an oversized id', async () => {
    const insert = (id: string, conversation: unknown, session: unknown) =>
      admin.query(
        `INSERT INTO ${schema}.runtime_approvals
           (tenant_id, approval_id, operator_id, agent_id, agent_version, action, resource_type,
            payload_hash, policy_version, correlation_id, status, single_use, requested_at, expires_at,
            execution_count, origin_conversation_id, origin_session_id)
         VALUES ($1, $2, 'op', 'agent', 'v', 'a', 'r', 'h', 'p', 'c', 'REQUESTED', true, now(), now(), 0, $3, $4)`,
        [tenant, id, conversation, session]
      )
    // A well-formed origin goes in, so the refusals below are about the shape and not the table.
    await insert('appr_good_origin', 'conv_ok', 'sess_ok')
    for (const [conversation, session] of [
      ['', null],
      [null, 'sess_only'],
      ['c'.repeat(201), null],
      ['conv', '']
    ])
      await expect(
        insert(
          `appr_bad_${randomBytes(3).toString('hex')}`,
          conversation,
          session
        )
      ).rejects.toThrow()
  })

  it('the migration is additive over existing rows: they keep working with a null origin', async () => {
    const earlier = `cvg_ao_old_${randomBytes(3).toString('hex')}`
    try {
      const { readdirSync } = await import('node:fs')
      void readdirSync
      await runPostgresMigrations(admin, {
        schemaName: earlier,
        migrations: [
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
          '0014_journeys',
          '0015_runtime_approval_store'
        ]
      })
      await admin.query(`SET search_path TO "${earlier}"`)
      await admin
        .query(
          `INSERT INTO runtime_approvals (tenant_id, approval_id, operator_id, agent_id, agent_version, action,
           resource_type, payload_hash, policy_version, correlation_id, status, single_use, requested_at,
           expires_at, execution_count)
         VALUES ($1, 'appr_old', 'op', 'agent', 'v', 'a', 'r', 'h', 'p', 'c', 'REQUESTED', true, now(), now(), 0)`,
          [tenant]
        )
        .catch(async () => {
          // The tenant GUC is required by RLS in this schema: set it for the session.
          await admin.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
            tenant
          ])
          await admin.query(
            `INSERT INTO runtime_approvals (tenant_id, approval_id, operator_id, agent_id, agent_version, action,
             resource_type, payload_hash, policy_version, correlation_id, status, single_use, requested_at,
             expires_at, execution_count)
           VALUES ($1, 'appr_old', 'op', 'agent', 'v', 'a', 'r', 'h', 'p', 'c', 'REQUESTED', true, now(), now(), 0)`,
            [tenant]
          )
        })
      await runPostgresMigrations(admin, { schemaName: earlier })
      await admin.query(`SET search_path TO "${earlier}"`)
      const row = await admin.query(
        `SELECT origin_conversation_id, origin_session_id FROM runtime_approvals WHERE approval_id = 'appr_old'`
      )
      expect(row.rows[0]).toEqual({
        origin_conversation_id: null,
        origin_session_id: null
      })
    } finally {
      await admin.query('SET search_path TO public')
      await admin.query(`DROP SCHEMA IF EXISTS "${earlier}" CASCADE`)
    }
  })
})
