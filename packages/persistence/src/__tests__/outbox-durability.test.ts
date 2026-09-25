import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  OUTBOX_MAX_ATTEMPTS,
  PostgresRuntimeRepository,
  readPostgresMigrationSql,
  runPostgresMigrations
} from '../postgres.ts'

const databaseUrl = process.env.TEST_DATABASE_URL
const tenantA = 'tenant_00000000-0000-4000-8000-000000000101'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000102'
const correlationId = 'corr_00000000-0000-4000-8000-000000000101'

describe('durable PostgreSQL outbox', () => {
  it('ships the additive tenant, journal, attempt and quarantine migration', async () => {
    const migration = await readPostgresMigrationSql('0010_outbox_durability')

    expect(migration).toContain('ALTER TABLE outbox_events')
    expect(migration).toContain('envelope_version')
    expect(migration).toContain('idempotency_key')
    expect(migration).toContain('available_at')
    expect(migration).toContain('lease_owner')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS outbox_effects')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS outbox_attempts')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS outbox_quarantine')
    expect(migration).toContain('outbox_events_tenant_id_idempotency_key_key')
    expect(migration).toContain('outbox_effects_tenant_event_fk')
    expect(migration).toContain('outbox_attempts_tenant_event_fk')
    expect(migration).toContain('legacy_terminalization')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain('legacy_processed_without_effect_journal')
  })

  it('ships the additive legacy payload/result redaction migration', async () => {
    const migration = await readPostgresMigrationSql(
      '0011_outbox_payload_redaction'
    )

    expect(migration).toContain('payload_protection_version')
    expect(migration).toContain('result_protection_version')
    expect(migration).toContain("'outbox-r6'")
    expect(migration).toContain("'legacyEventId'")
    expect(migration).toContain('legacy_inbound_missing_runtime_identifiers')
    expect(migration).toContain('outbox_events_tenant_id_not_null')
    expect(migration).toContain('legacy_error_redacted')
    expect(migration).toContain('tenant_isolation_quarantined = true')
  })

  it.skipIf(!databaseUrl)(
    'backfills a legacy processed row while RLS is already forced',
    async () => {
      const schema = `cvg_outbox_legacy_${Date.now()}_${randomBytes(3).toString('hex')}`
      const client = new Client({ connectionString: databaseUrl })
      const migrations = [
        '0000_initial',
        '0001_tenant_isolation',
        '0002_capability_approvals',
        '0003_test_suite_catalog',
        '0004_plugin_manifest_catalog',
        '0005_knowledge_source_catalog',
        '0006_release_candidate_evidence',
        '0007_audit_evidence_checkpoint',
        '0008_session_agent_version_pin',
        '0009_release_candidate_validator_integrity'
      ] as const
      await client.connect()
      try {
        await runPostgresMigrations(client, {
          schemaName: schema,
          migrations: [...migrations]
        })
        await client.query(
          `ALTER TABLE outbox_events NO FORCE ROW LEVEL SECURITY`
        )
        await client.query(
          `INSERT INTO outbox_events (id, type, payload, status, created_at, tenant_id)
           VALUES ($1, 'legacy.synthetic', '{}'::jsonb, 'processed', $2, $3)`,
          [
            'outbox_legacy_processed',
            new Date('2026-01-01T00:00:00.000Z'),
            tenantA
          ]
        )
        await client.query(`ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY`)

        await runPostgresMigrations(client, {
          schemaName: schema,
          migrations: ['0010_outbox_durability']
        })
        const state = await client.query<{
          status: string
          reason: string | null
        }>(
          `SELECT status, last_error AS reason FROM outbox_events WHERE id = $1`,
          ['outbox_legacy_processed']
        )
        expect(state.rows[0]).toMatchObject({
          status: 'dead_letter',
          reason: 'legacy_processed_without_effect_journal'
        })
        const quarantine = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM outbox_quarantine WHERE event_id = $1`,
          ['outbox_legacy_processed']
        )
        expect(quarantine.rows[0]?.count).toBe('1')
        const audit = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM audit_events
           WHERE tenant_id = $1 AND payload->>'eventId' = $2`,
          [tenantA, 'outbox_legacy_processed']
        )
        expect(audit.rows[0]?.count).toBe('1')
      } finally {
        await client
          .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
          .catch(() => undefined)
        await client.end()
      }
    }
  )

  it.skipIf(!databaseUrl)(
    'redacts legacy rows without making routable pending work disappear',
    async () => {
      const schema = `cvg_outbox_redaction_${Date.now()}_${randomBytes(3).toString('hex')}`
      const client = new Client({ connectionString: databaseUrl })
      const migrations = [
        '0000_initial',
        '0001_tenant_isolation',
        '0002_capability_approvals',
        '0003_test_suite_catalog',
        '0004_plugin_manifest_catalog',
        '0005_knowledge_source_catalog',
        '0006_release_candidate_evidence',
        '0007_audit_evidence_checkpoint',
        '0008_session_agent_version_pin',
        '0009_release_candidate_validator_integrity'
      ] as const
      await client.connect()
      try {
        await runPostgresMigrations(client, {
          schemaName: schema,
          migrations: ['0000_initial']
        })
        await client.query(
          `INSERT INTO outbox_events (id, type, payload, status, created_at)
           VALUES
             ('outbox_legacy_null_tenant', 'legacy.synthetic', '{"body":"diagnosis Ana Silva secret=raw-secret"}'::jsonb, 'pending', now()),
             ('outbox_legacy_pending_without_route', 'inbound.process', '{"body":"diagnosis asma"}'::jsonb, 'pending', now())`
        )
        await runPostgresMigrations(client, {
          schemaName: schema,
          migrations: [...migrations.slice(1)]
        })
        await client.query(
          `UPDATE outbox_events
           SET tenant_id = $1
           WHERE id = $2`,
          [tenantA, 'outbox_legacy_pending_without_route']
        )
        await runPostgresMigrations(client, {
          schemaName: schema,
          migrations: ['0010_outbox_durability']
        })
        await client.query(
          `ALTER TABLE outbox_events NO FORCE ROW LEVEL SECURITY`
        )
        await client.query(
          `INSERT INTO outbox_events
             (id, type, payload, status, created_at, tenant_id,
              envelope_version, correlation_id, idempotency_key,
              conversation_id, session_id, inbound_message_id,
              available_at, attempts, tenant_isolation_quarantined)
           VALUES ($1, 'inbound.process', $2::jsonb, 'pending', now(), $3,
                   1, $4, $5, $6, $7, $8, now(), 0, false)`,
          [
            'outbox_legacy_routable_pending',
            JSON.stringify({
              body: 'diagnosis hipertensão; email ana@example.test',
              secret: 'raw-secret'
            }),
            tenantA,
            'corr_00000000-0000-4000-8000-000000000175',
            'legacy-routable-175',
            'conv_legacy_175',
            'sess_legacy_175',
            'msg_legacy_175'
          ]
        )
        await client.query(`ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY`)

        await runPostgresMigrations(client, {
          schemaName: schema,
          migrations: ['0011_outbox_payload_redaction']
        })

        const state = await client.query<{
          id: string
          status: string
          tenant_isolation_quarantined: boolean
          last_error: string | null
          payload: Record<string, unknown>
        }>(
          `SELECT id, status, tenant_isolation_quarantined, last_error, payload
           FROM outbox_events
           WHERE id IN ($1, $2, $3)
           ORDER BY id`,
          [
            'outbox_legacy_null_tenant',
            'outbox_legacy_pending_without_route',
            'outbox_legacy_routable_pending'
          ]
        )
        const nullTenant = state.rows.find(
          (row) => row.id === 'outbox_legacy_null_tenant'
        )
        const missingRoute = state.rows.find(
          (row) => row.id === 'outbox_legacy_pending_without_route'
        )
        const routable = state.rows.find(
          (row) => row.id === 'outbox_legacy_routable_pending'
        )
        expect(nullTenant).toMatchObject({
          status: 'dead_letter',
          tenant_isolation_quarantined: true,
          last_error: 'legacy_outbox_missing_tenant'
        })
        expect(missingRoute).toMatchObject({
          status: 'dead_letter',
          tenant_isolation_quarantined: true,
          last_error: 'legacy_inbound_missing_runtime_identifiers'
        })
        expect(routable).toMatchObject({
          status: 'pending',
          tenant_isolation_quarantined: false,
          payload: expect.objectContaining({
            redacted: true,
            conversationId: 'conv_legacy_175',
            sessionId: 'sess_legacy_175',
            inboundMessageId: 'msg_legacy_175'
          })
        })
        expect(JSON.stringify(state.rows)).not.toContain('raw-secret')
        expect(JSON.stringify(state.rows)).not.toContain('diagnosis')
      } finally {
        await client
          .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
          .catch(() => undefined)
        await client.end()
      }
    },
    30_000
  )

  it.skipIf(!databaseUrl)(
    'claims once across two connections, journals at-least-once ack, retries and requeues in-place',
    async () => {
      const schema = `cvg_outbox_${Date.now()}_${randomBytes(3).toString('hex')}`
      const first = new Client({ connectionString: databaseUrl })
      const second = new Client({ connectionString: databaseUrl })
      let clockNow = new Date('2026-01-01T00:00:00.000Z')
      await first.connect()
      await second.connect()
      try {
        await runPostgresMigrations(first, { schemaName: schema })
        await second.query(`SET search_path TO ${schema}`)
        await first.query("SELECT set_config('cvg.tenant_id', $1, false)", [
          tenantA
        ])
        await second.query("SELECT set_config('cvg.tenant_id', $1, false)", [
          tenantA
        ])
        const a = new PostgresRuntimeRepository(first, {
          tenantIsolation: true,
          clock: () => clockNow
        })
        const b = new PostgresRuntimeRepository(second, {
          tenantIsolation: true,
          clock: () => clockNow
        })
        const created = await a.enqueue({
          tenantId: tenantA,
          type: 'synthetic.outbox',
          payload: { fixture: true },
          correlationId,
          idempotencyKey: 'synthetic-outbox-key-101',
          createdAt: clockNow,
          availableAt: clockNow
        })
        // AUD19-004: an identical replay converges on the winner...
        const identical = await b.enqueue({
          tenantId: tenantA,
          type: 'synthetic.outbox',
          payload: { fixture: true },
          correlationId,
          idempotencyKey: 'synthetic-outbox-key-101',
          createdAt: clockNow,
          availableAt: clockNow
        })
        expect(identical.id).toBe(created.id)
        // ...while a divergent replay on the same key fails closed instead
        // of being silently ignored.
        await expect(
          b.enqueue({
            tenantId: tenantA,
            type: 'synthetic.outbox',
            payload: { fixture: 'divergent-content-rejected' },
            correlationId,
            idempotencyKey: 'synthetic-outbox-key-101',
            createdAt: clockNow,
            availableAt: clockNow
          })
        ).rejects.toMatchObject({ code: 'conflict' })

        const claims = await Promise.all([
          a.claimNext({
            tenantId: tenantA,
            workerId: 'worker-a',
            leaseMs: 30_000
          }),
          b.claimNext({
            tenantId: tenantA,
            workerId: 'worker-b',
            leaseMs: 30_000
          })
        ])
        expect(claims.filter(Boolean)).toHaveLength(1)
        const claimed = claims.find(Boolean)
        if (!claimed) throw new Error('expected one claimed event')
        const owner = claimed.leaseOwner
        const ownerRepository = owner === 'worker-a' ? a : b
        const ownerWorkerId = owner ?? 'worker-a'

        await expect(b.findOutboxById(tenantB, created.id)).resolves.toBeNull()
        await expect(
          b.ack({
            tenantId: tenantB,
            eventId: created.id,
            workerId: 'worker-b',
            result: { mustNot: 'cross-tenant' }
          })
        ).rejects.toMatchObject({ code: 'invalid_action' })

        const triggerName = 'reject_outbox_audit'
        await first.query(
          `CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic outbox audit failure'; END $$`
        )
        await first.query(
          `CREATE TRIGGER ${triggerName} BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`
        )
        await expect(
          ownerRepository.ack({
            tenantId: tenantA,
            eventId: claimed.id,
            workerId: owner ?? 'worker-a',
            effect: () => ({ synthetic: true }),
            now: new Date(claimed.leaseUntil!.getTime() - 1)
          })
        ).rejects.toThrow('synthetic outbox audit failure')
        await first.query(`DROP TRIGGER ${triggerName} ON audit_events`)
        await first.query(`DROP FUNCTION ${triggerName}()`)
        const afterRollback = await ownerRepository.findOutboxById(
          tenantA,
          claimed.id
        )
        expect(afterRollback).toMatchObject({
          status: 'processing',
          attempts: 1,
          processedAt: null
        })
        const effectsAfterRollback = await first.query(
          `SELECT count(*)::int AS count FROM outbox_effects WHERE tenant_id = $1`,
          [tenantA]
        )
        expect(effectsAfterRollback.rows[0]?.count).toBe(0)

        let current = claimed
        for (let attempt = 1; attempt <= OUTBOX_MAX_ATTEMPTS; attempt += 1) {
          if (current.status === 'processing') {
            clockNow = new Date(current.leaseUntil!.getTime() - 1)
          } else {
            clockNow = new Date(current.availableAt!.getTime())
            const retried = await ownerRepository.claimNext({
              tenantId: tenantA,
              workerId: ownerWorkerId,
              leaseMs: 30_000
            })
            if (retried) current = retried
          }
          current = await ownerRepository.fail({
            tenantId: tenantA,
            eventId: current.id,
            workerId: ownerWorkerId,
            error: new Error('synthetic transient failure')
          })
        }
        expect(current.status).toBe('dead_letter')
        expect(current.attempts).toBe(OUTBOX_MAX_ATTEMPTS)

        clockNow = new Date('2026-01-01T01:00:00.000Z')
        const requeued = await ownerRepository.requeueDeadLetter({
          tenantId: tenantA,
          eventId: current.id,
          operatorId: 'operator-synthetic',
          correlationId
        })
        expect(requeued).toMatchObject({
          id: created.id,
          status: 'pending',
          attempts: 0,
          idempotencyKey: created.idempotencyKey
        })

        const attempts = await first.query(
          `SELECT count(*)::int AS count FROM outbox_attempts WHERE tenant_id = $1 AND event_id = $2`,
          [tenantA, created.id]
        )
        expect(attempts.rows[0]?.count).toBeGreaterThanOrEqual(
          OUTBOX_MAX_ATTEMPTS
        )
        const journal = await first.query(
          `SELECT count(*)::int AS count FROM outbox_effects WHERE tenant_id = $1 AND idempotency_key = $2`,
          [tenantA, created.idempotencyKey]
        )
        expect(journal.rows[0]?.count).toBe(0)
      } finally {
        await first.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await Promise.all([first.end(), second.end()])
      }
    },
    30_000
  )

  it.skipIf(!databaseUrl)(
    'commits inbound message and durable intent together',
    async () => {
      const schema = `cvg_outbox_atomic_${Date.now()}_${randomBytes(3).toString('hex')}`
      const client = new Client({ connectionString: databaseUrl })
      await client.connect()
      try {
        await runPostgresMigrations(client, { schemaName: schema })
        await client.query(`SET search_path TO ${schema}`)
        await client.query("SELECT set_config('cvg.tenant_id', $1, false)", [
          tenantA
        ])
        const repository = new PostgresRuntimeRepository(client, {
          tenantIsolation: true
        })
        const created = await repository.createWithSessionAndOutbox(
          {
            tenantId: tenantA,
            channel: 'web',
            senderRef: 'atomic-tutor-101',
            externalMessageId: 'atomic-inbound-101',
            body: 'Mensagem sintética'
          },
          {
            tenantId: tenantA,
            type: 'inbound.process',
            payload: { fixture: true },
            idempotencyKey: 'atomic-inbound-key-101',
            correlationId,
            inboundMessageId: null
          }
        )
        expect(created.outbox).toMatchObject({
          tenantId: tenantA,
          status: 'pending',
          inboundMessageId: created.message.id
        })
        const counts = await client.query<{ messages: string; events: string }>(
          `SELECT
             (SELECT count(*) FROM messages WHERE id = $1)::text AS messages,
             (SELECT count(*) FROM outbox_events WHERE idempotency_key = $2)::text AS events`,
          [created.message.id, 'atomic-inbound-key-101']
        )
        expect(counts.rows[0]).toEqual({ messages: '1', events: '1' })

        const triggerName = `reject_atomic_outbox_${Date.now()}`
        await client.query(
          `CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic atomic outbox failure'; END $$`
        )
        await client.query(
          `CREATE TRIGGER ${triggerName} BEFORE INSERT ON outbox_events FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`
        )
        await expect(
          repository.createWithSessionAndOutbox(
            {
              tenantId: tenantA,
              channel: 'web',
              senderRef: 'atomic-tutor-102',
              externalMessageId: 'atomic-inbound-102',
              body: 'Mensagem que deve sofrer rollback'
            },
            {
              tenantId: tenantA,
              type: 'inbound.process',
              payload: { fixture: true },
              idempotencyKey: 'atomic-inbound-key-102',
              correlationId,
              inboundMessageId: null
            }
          )
        ).rejects.toThrow('synthetic atomic outbox failure')
        await client.query(`DROP TRIGGER ${triggerName} ON outbox_events`)
        await client.query(`DROP FUNCTION ${triggerName}()`)
        const rollback = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM messages
           WHERE external_message_id = $1`,
          ['atomic-inbound-102']
        )
        const rollbackEvents = await client.query<{ count: string }>(
          `SELECT count(*)::text AS count
           FROM outbox_events
           WHERE idempotency_key = $1`,
          ['atomic-inbound-key-102']
        )
        expect(rollback.rows[0]?.count).toBe('0')
        expect(rollbackEvents.rows[0]?.count).toBe('0')
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        await client.end()
      }
    },
    30_000
  )
})
