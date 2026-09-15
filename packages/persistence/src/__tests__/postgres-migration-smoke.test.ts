import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client } from 'pg'
import type { QueryResult, QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  PostgresRuntimeRepository,
  readPostgresMigrationSql,
  runInitialPostgresMigration
} from '../postgres.ts'
import { createSenderRefFingerprint } from '../sender-fingerprint.ts'

const migrationPath = resolve(
  process.cwd(),
  'packages/persistence/migrations/0000_initial.sql'
)
const testDatabaseUrl = process.env.TEST_DATABASE_URL

describe('postgres migration smoke', () => {
  it('ships an additive release-candidate validator integrity migration', async () => {
    const migration = await readPostgresMigrationSql(
      '0009_release_candidate_validator_integrity'
    )

    expect(migration).toContain(
      'DROP CONSTRAINT IF EXISTS platform_release_candidates_validation_actor_check'
    )
    expect(migration).toContain('validated_by IS DISTINCT FROM created_by')
    expect(migration).toContain(
      'ADD CONSTRAINT platform_release_candidates_validation_actor_check'
    )
  })

  it('keeps the initial migration aligned with operational runtime tables and correlation indexes', async () => {
    const migration = await readFile(migrationPath, 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS conversations')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS schema_migrations')
    expect(migration).toContain("VALUES ('0000_initial')")
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS messages')
    expect(migration).toContain('runtime_status')
    expect(migration).toContain('idx_messages_runtime_status')
    expect(migration).toContain('sender_ref_hash')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS sessions')
    expect(migration).toContain('takeover_state')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS audit_events')
    expect(migration).toContain('correlation_id text NOT NULL')
    expect(migration).toContain('idx_audit_events_correlation_id')
    expect(migration).toContain('idx_audit_events_type')
    expect(migration).toContain('idx_audit_events_actor_id')
    expect(migration).toContain('idx_audit_events_payload_session_id')
    expect(migration).toContain('tenant_id text NOT NULL')
    expect(migration).toContain('PRIMARY KEY (tenant_id, key)')
    expect(migration).toContain('inbound:<channel>:<externalMessageId>')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS platform_agents')
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS platform_agent_versions'
    )
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS platform_test_runs')
    expect(migration).toContain('idx_platform_agents_tenant_id')
    expect(migration).toContain('idx_platform_agent_versions_one_published')
  })

  it('keeps PostgreSQL runtime repository queries parameterized and schema-scoped', async () => {
    const queries: Array<{ text: string; values?: unknown[] }> = []
    let fakeTakeoverState:
      | 'BOT_ACTIVE'
      | 'HANDOFF_REQUESTED'
      | 'HUMAN_ACTIVE'
      | 'RESOLVED' = 'BOT_ACTIVE'
    const result = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rowCount: rows.length,
      rows
    })
    const fakeClient = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ) {
        queries.push(values ? { text, values } : { text })
        if (text.includes('INSERT INTO approval_requests'))
          return result([{ id: 'approval_fake' }] as unknown as T[])
        if (text.includes('UPDATE sessions SET takeover_state')) {
          fakeTakeoverState = values?.[1] as typeof fakeTakeoverState
        }
        if (text.includes('conversation_tenant_id')) {
          return result([
            {
              conversation_tenant_id: tenantId,
              conversation_id: 'conv_fake',
              channel: 'whatsapp',
              sender_ref: 'fixture-sender',
              sender_ref_hash: createSenderRefFingerprint(
                tenantId,
                'fixture-sender'
              ),
              conversation_status: 'active',
              correlation_id: 'corr_00000000-0000-4000-8000-000000000078',
              conversation_created_at: new Date('2026-04-29T12:00:00.000Z'),
              conversation_updated_at: new Date('2026-04-29T12:00:00.000Z'),
              session_id: 'sess_fake',
              session_status: 'open',
              session_takeover_state: fakeTakeoverState,
              session_created_at: new Date('2026-04-29T12:00:00.000Z'),
              session_updated_at: new Date('2026-04-29T12:00:00.000Z')
            }
          ] as unknown as T[])
        }
        if (
          text.includes('FOR UPDATE') &&
          text.includes('sessions.takeover_state')
        ) {
          return result([
            {
              id: 'sess_fake',
              conversation_id: 'conv_fake',
              status: 'open',
              takeover_state: fakeTakeoverState,
              created_at: new Date('2026-04-29T12:00:00.000Z'),
              updated_at: new Date('2026-04-29T12:00:00.000Z')
            }
          ] as unknown as T[])
        }
        if (
          text.includes('COUNT(*) OVER') &&
          text.includes('FROM conversations')
        ) {
          return result([] as T[])
        }
        if (text.includes('FROM messages')) {
          return result([
            {
              id: 'msg_fake',
              conversation_id: 'conv_fake',
              external_message_id: 'ext_fake',
              direction: 'inbound',
              body: 'Mensagem fake',
              created_at: new Date('2026-04-29T12:00:00.000Z')
            }
          ] as unknown as T[])
        }
        if (text.includes('INSERT INTO tasks')) {
          return result([{ id: 'task_fake' }] as unknown as T[])
        }
        if (text.includes('FROM audit_events')) {
          return result([
            {
              id: 'audit_fake',
              type: 'integration_event',
              actor_type: 'System',
              actor_id: 'fake',
              correlation_id: 'corr_00000000-0000-4000-8000-000000000001',
              policy_version: 'test',
              payload: { sessionId: 'sess_fake' },
              created_at: new Date('2026-04-29T12:00:00.000Z'),
              total: 1
            }
          ] as unknown as T[])
        }
        return result([] as T[])
      }
    }
    const repository = new PostgresRuntimeRepository(fakeClient)
    const tenantId = 'tenant_00000000-0000-4000-8000-000000000078'

    await runInitialPostgresMigration(fakeClient, {
      schemaName: 'cvg_unit_smoke'
    })
    const created = await repository.createWithSession({
      tenantId,
      channel: 'whatsapp',
      senderRef: 'fixture-sender',
      externalMessageId: 'ext_fake',
      body: 'Mensagem fake'
    })
    const idempotencyInsert = queries.find((query) =>
      query.text.includes('INSERT INTO idempotency')
    )
    expect(idempotencyInsert?.values?.[1]).toMatch(
      /^inbound:whatsapp:sha256:[0-9a-f]{64}$/
    )
    expect(idempotencyInsert?.values?.[1]).not.toContain('ext_fake')
    const continued = await repository.createWithSession({
      tenantId,
      channel: 'whatsapp',
      senderRef: 'fixture-sender',
      externalMessageId: 'ext_fake_continuation',
      body: 'Continuação fake',
      conversationId: 'conv_fake',
      sessionId: 'sess_fake'
    })
    const requested = await repository.transitionTakeover(
      tenantId,
      'sess_fake',
      'request_handoff'
    )
    const active = await repository.transitionTakeover(
      tenantId,
      'sess_fake',
      'accept_handoff'
    )
    const resolved = await repository.transitionTakeover(
      tenantId,
      'sess_fake',
      'resolve_handoff'
    )
    const released = await repository.transitionTakeover(
      tenantId,
      'sess_fake',
      'release_to_bot'
    )
    const found = await repository.findByExternalMessage(
      tenantId,
      'whatsapp',
      'ext_fake'
    )
    const audit = await repository.appendAudit({
      type: 'integration_event',
      actorType: 'System',
      actorId: 'fake',
      correlationId: created.conversation.correlationId,
      policyVersion: 'test',
      payload: { sessionId: created.session.id }
    })
    const auditTrail = await repository.listAuditBySession(created.session.id)
    const evidencePage = await repository.listAuditEvidence({
      sessionId: 'sess_fake',
      correlationId: 'corr_00000000-0000-4000-8000-000000000001',
      type: 'integration_event',
      actorId: 'fake',
      limit: 10,
      offset: 0
    })
    const evidenceSummary = await repository.summarizeAuditEvidence({
      sessionId: 'sess_fake'
    })
    const taskInput = {
      sessionId: 'sess_fake',
      title: 'Tarefa fake',
      description: 'Cobertura do adaptador',
      priority: 'medium' as const,
      source: 'postgres-smoke',
      idempotencyKey: 'postgres-smoke-task'
    }
    const createdTask = await repository.createTask(taskInput)
    const tasks = await repository.listTasks()
    const scopedTasks = await repository.listTasks(tenantId)
    const missingTask = await repository.findTaskById('task_missing', tenantId)
    const updatedMissingTask = await repository.updateTaskStatus(
      'task_missing',
      'done',
      tenantId
    )
    const approval = {
      id: 'approval_fake',
      sessionId: 'sess_fake',
      proposedAction: 'create_appointment_draft',
      summary: 'Aprovação fake',
      riskLevel: 'medium' as const,
      status: 'pending' as const,
      decidedBy: null,
      decidedAt: null,
      createdAt: new Date('2026-04-29T12:00:00.000Z')
    }
    await repository.saveApproval(approval)
    const missingApproval = await repository.findApprovalById(
      'approval_missing',
      tenantId
    )
    const approvals = await repository.listApprovals(tenantId)
    const timeline = await repository.timeline(tenantId, 'conv_fake')
    const conversationPage = await repository.listPage(tenantId, {
      limit: 10,
      offset: 0
    })
    await expect(repository.createTask(taskInput, tenantId)).rejects.toThrow(
      'Session not found'
    )
    await expect(repository.saveApproval(approval, tenantId)).rejects.toThrow(
      'Session not found'
    )

    await expect(
      runInitialPostgresMigration(fakeClient, {
        schemaName: 'unsafe-schema-name'
      })
    ).rejects.toThrow('Invalid PostgreSQL schema name')
    expect(found?.id).toBe('msg_fake')
    expect(continued.session.id).toBe('sess_fake')
    expect(requested?.takeoverState).toBe('HANDOFF_REQUESTED')
    expect(active?.takeoverState).toBe('HUMAN_ACTIVE')
    expect(resolved?.takeoverState).toBe('RESOLVED')
    expect(released?.takeoverState).toBe('BOT_ACTIVE')
    expect(createdTask.status).toBe('open')
    expect(tasks).toEqual([])
    expect(scopedTasks).toEqual([])
    expect(missingTask).toBeNull()
    expect(updatedMissingTask).toBeNull()
    expect(missingApproval).toBeNull()
    expect(approvals).toEqual([])
    expect(timeline.messages).toHaveLength(1)
    expect(conversationPage.pageInfo.total).toBe(0)
    expect(audit.id.startsWith('audit_')).toBe(true)
    expect(auditTrail[0]?.id).toBe('audit_fake')
    expect(evidencePage).toMatchObject({
      items: [expect.objectContaining({ id: 'audit_fake' })],
      pageInfo: { limit: 10, offset: 0, total: 1, hasNextPage: false }
    })
    expect(evidenceSummary).toMatchObject({
      totalEvents: 1,
      byType: { integration_event: 1 },
      byActorType: { System: 1 },
      byCorrelationId: {
        'corr_00000000-0000-4000-8000-000000000001': 1
      },
      bySessionId: { sess_fake: 1 }
    })
    expect(queries.some((query) => query.text === 'BEGIN')).toBe(true)
    expect(queries.some((query) => query.text === 'COMMIT')).toBe(true)
    expect(
      queries.filter((query) => query.values && query.values.length > 0).length
    ).toBeGreaterThanOrEqual(5)
  })

  it('reloads a committed inbound runtime context inside the tenant boundary', async () => {
    const tenantId = 'tenant_00000000-0000-4000-8000-000000000174' as const
    const queries: Array<{ text: string; values?: unknown[] }> = []
    const fakeClient = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> {
        queries.push(values ? { text, values } : { text })
        return {
          command: 'SELECT',
          fields: [],
          oid: 0,
          rowCount: 1,
          rows: [
            {
              message_id: 'msg_runtime_context',
              conversation_id: 'conv_runtime_context',
              external_message_id: 'provider-id-without-pii',
              direction: 'inbound',
              body: 'token=sk-live-not-real',
              runtime_status: 'pending',
              message_created_at: new Date('2026-09-05T12:00:00.000Z'),
              channel: 'web',
              sender_ref: 'sender-runtime-context',
              correlation_id: 'corr_00000000-0000-4000-8000-000000000174',
              session_id: 'sess_runtime_context',
              session_status: 'open',
              session_takeover_state: 'BOT_ACTIVE',
              agent_id: null,
              agent_version_id: null,
              session_created_at: new Date('2026-09-05T12:00:00.000Z'),
              session_updated_at: new Date('2026-09-05T12:00:00.000Z')
            }
          ] as unknown as T[]
        }
      }
    }
    const repository = new PostgresRuntimeRepository(fakeClient, {
      tenantIsolation: true
    })

    const context = await repository.findInboundRuntimeContext(
      tenantId,
      'conv_runtime_context',
      'sess_runtime_context',
      'msg_runtime_context'
    )

    expect(context).toMatchObject({
      message: {
        id: 'msg_runtime_context',
        body: '[redacted-secret]'
      },
      channel: 'web',
      session: {
        id: 'sess_runtime_context',
        takeoverState: 'BOT_ACTIVE'
      }
    })
    expect(queries[0]?.text).toContain('conversations.tenant_id = $4')
    expect(queries[0]?.text).not.toContain('msg_runtime_context')
    expect(queries[0]?.values).toEqual([
      'msg_runtime_context',
      'conv_runtime_context',
      'sess_runtime_context',
      tenantId
    ])
  })

  it('reads the migration marker and does not replay an applied version', async () => {
    let applied = false
    let migrationRuns = 0
    const result = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rowCount: rows.length,
      rows
    })
    const fakeClient = {
      async query<T extends QueryResultRow = QueryResultRow>(text: string) {
        if (text.includes("VALUES ('0000_initial')")) {
          migrationRuns += 1
          applied = true
        }
        if (text.includes('SELECT version FROM schema_migrations')) {
          return result(
            (applied ? [{ version: '0000_initial' }] : []) as unknown as T[]
          )
        }
        return result([] as T[])
      }
    }

    await runInitialPostgresMigration(fakeClient, {
      schemaName: 'cvg_marker_smoke'
    })
    await runInitialPostgresMigration(fakeClient, {
      schemaName: 'cvg_marker_smoke'
    })

    expect(migrationRuns).toBe(1)
  })

  it('commits the PostgreSQL outbox ownership check before invoking the effect', async () => {
    let activeTransaction = false
    let commits = 0
    let journaled = false
    const createdAt = new Date('2026-09-05T12:00:00.000Z')
    const leaseUntil = new Date('2026-09-05T12:01:00.000Z')
    const row = {
      id: 'outbox_ack_boundary_176',
      tenant_id: 'tenant_00000000-0000-4000-8000-000000000176',
      type: 'inbound.process',
      envelope_version: 1,
      correlation_id: 'corr_00000000-0000-4000-8000-000000000176',
      idempotency_key: 'ack-boundary-176',
      conversation_id: null,
      session_id: null,
      agent_id: null,
      agent_version_id: null,
      inbound_message_id: null,
      payload: { fixture: true },
      status: 'processing',
      created_at: createdAt,
      available_at: createdAt,
      attempts: 1,
      lease_owner: 'worker-ack-boundary',
      lease_until: leaseUntil,
      last_error: null,
      processed_at: null,
      dead_lettered_at: null,
      parent_event_id: null
    }
    const result = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rowCount: rows.length,
      rows
    })
    const fakeClient = {
      async query<T extends QueryResultRow = QueryResultRow>(text: string) {
        if (text === 'BEGIN') {
          activeTransaction = true
          return result([] as T[])
        }
        if (text === 'COMMIT') {
          activeTransaction = false
          commits += 1
          return result([] as T[])
        }
        if (text === 'ROLLBACK') {
          activeTransaction = false
          return result([] as T[])
        }
        if (
          text.includes('FROM outbox_events') &&
          text.includes('FOR UPDATE')
        ) {
          return result([
            journaled
              ? {
                  ...row,
                  status: 'processed',
                  lease_owner: null,
                  lease_until: null,
                  processed_at: createdAt
                }
              : row
          ] as unknown as T[])
        }
        if (
          text.includes('FROM outbox_effects') &&
          text.includes('FOR UPDATE')
        ) {
          return result(
            (journaled
              ? [{ result: { status: 'done' }, event_id: row.id }]
              : []) as unknown as T[]
          )
        }
        if (text.includes('INSERT INTO outbox_effects')) {
          journaled = true
          return result([] as T[])
        }
        if (text.includes("SET status = 'processed'")) {
          return result([
            {
              ...row,
              status: 'processed',
              lease_owner: null,
              lease_until: null,
              processed_at: createdAt
            }
          ] as unknown as T[])
        }
        return result([] as T[])
      }
    }
    const repository = new PostgresRuntimeRepository(fakeClient, {
      tenantIsolation: true,
      clock: () => createdAt
    })
    const processed = await repository.ack({
      tenantId: row.tenant_id,
      eventId: row.id,
      workerId: row.lease_owner,
      effect: () => {
        expect(activeTransaction).toBe(false)
        expect(commits).toBe(1)
        return { status: 'done' }
      }
    })

    expect(processed.status).toBe('processed')
    expect(activeTransaction).toBe(false)
    expect(commits).toBe(2)
  })

  it('reconciles a concurrent task idempotency conflict by reading the winner', async () => {
    let taskReads = 0
    const result = <T extends QueryResultRow>(rows: T[]): QueryResult<T> => ({
      command: 'SELECT',
      fields: [],
      oid: 0,
      rowCount: rows.length,
      rows
    })
    const fakeClient = {
      async query<T extends QueryResultRow = QueryResultRow>(text: string) {
        if (text.includes('FROM tasks')) {
          taskReads += 1
          return result(
            (taskReads === 1
              ? []
              : [
                  {
                    id: 'task_race_winner',
                    session_id: 'sess_race',
                    title: 'Tarefa vencedora',
                    description: 'Criada por outra requisição',
                    priority: 'medium',
                    source: 'race-test',
                    status: 'open',
                    idempotency_key: 'race-key',
                    created_at: new Date('2026-08-24T00:00:00.000Z')
                  }
                ]) as unknown as T[]
          )
        }
        if (text.includes('INSERT INTO tasks')) {
          // PostgreSQL reports no inserted row for ON CONFLICT DO NOTHING.
          return result([] as T[])
        }
        return result([] as T[])
      }
    }

    const repository = new PostgresRuntimeRepository(fakeClient)
    await expect(
      repository.createTask({
        sessionId: 'sess_race',
        title: 'Tarefa local',
        description: 'Tentativa concorrente',
        priority: 'medium',
        source: 'race-test',
        idempotencyKey: 'race-key'
      })
    ).resolves.toMatchObject({ id: 'task_race_winner' })
  })

  const itWithPostgres = testDatabaseUrl ? it : it.skip

  itWithPostgres(
    'applies the migration and persists runtime evidence in an isolated PostgreSQL schema',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_smoke_${Date.now()}`

      await client.connect()
      try {
        await runInitialPostgresMigration(client, { schemaName })
        const repository = new PostgresRuntimeRepository(client)
        const tenantId = 'tenant_00000000-0000-4000-8000-000000000079'
        const created = await repository.createWithSession({
          tenantId,
          channel: 'whatsapp',
          senderRef: '+5511999999999',
          externalMessageId: 'ext_pg_smoke',
          body: 'Mensagem ficticia para smoke'
        })
        const otherChannel = await repository.createWithSession({
          tenantId,
          channel: 'web',
          senderRef: 'fixture-web-sender',
          externalMessageId: 'ext_pg_smoke',
          body: 'Mensagem ficticia para outro canal'
        })
        const continued = await repository.createWithSession({
          tenantId,
          channel: 'whatsapp',
          senderRef: '+5511999999999',
          externalMessageId: 'ext_pg_continuation',
          body: 'Continuação fictícia',
          conversationId: created.conversation.id,
          sessionId: created.session.id
        })
        expect(continued.conversation.id).toBe(created.conversation.id)
        expect(continued.session.id).toBe(created.session.id)
        const storedConversation = await client.query<{
          sender_ref: string
          sender_ref_hash: string
        }>(
          `SELECT sender_ref, sender_ref_hash FROM conversations WHERE id = $1`,
          [created.conversation.id]
        )
        expect(storedConversation.rows[0]?.sender_ref).toBe('[redacted-phone]')
        expect(storedConversation.rows[0]?.sender_ref_hash).toMatch(
          /^[0-9a-f]{64}$/
        )
        const outbound = await repository.appendOutboundMessage({
          tenantId,
          conversationId: created.conversation.id,
          externalMessageId: 'runtime:pg-outbound-1',
          body: 'Resposta para ana@example.com'
        })
        expect(outbound.body).toBe('Resposta para [redacted-email]')
        await expect(
          repository.transitionTakeover(
            tenantId,
            created.session.id,
            'request_handoff'
          )
        ).resolves.toMatchObject({ takeoverState: 'HANDOFF_REQUESTED' })
        await expect(
          repository.transitionTakeover(
            tenantId,
            created.session.id,
            'accept_handoff'
          )
        ).resolves.toMatchObject({ takeoverState: 'HUMAN_ACTIVE' })
        await expect(
          repository.transitionTakeover(
            tenantId,
            created.session.id,
            'resolve_handoff'
          )
        ).resolves.toMatchObject({ takeoverState: 'RESOLVED' })
        await expect(
          repository.transitionTakeover(
            tenantId,
            created.session.id,
            'release_to_bot'
          )
        ).resolves.toMatchObject({ takeoverState: 'BOT_ACTIVE' })
        await expect(
          repository.timeline(tenantId, created.conversation.id)
        ).resolves.toMatchObject({
          messages: expect.arrayContaining([
            expect.objectContaining({
              externalMessageId: 'ext_pg_continuation'
            }),
            expect.objectContaining({
              externalMessageId: 'runtime:pg-outbound-1',
              direction: 'outbound'
            })
          ]),
          sessions: [expect.objectContaining({ takeoverState: 'BOT_ACTIVE' })]
        })
        const audit = await repository.appendAudit({
          type: 'integration_event',
          actorType: 'System',
          actorId: 'postgres-smoke',
          correlationId: created.conversation.correlationId,
          policyVersion: 'test-policy',
          payload: {
            sessionId: created.session.id,
            body: 'email ana@example.com não deve ser persistido'
          }
        })

        const result = await client.query<{ count: string }>(
          `SELECT count(*)::text
         FROM audit_events
         WHERE correlation_id = $1`,
          [created.conversation.correlationId]
        )

        expect(result.rows[0]?.count).toBe('1')
        expect(audit.payload).toEqual({ sessionId: created.session.id })
        await expect(
          repository.findByExternalMessage(tenantId, 'whatsapp', 'ext_pg_smoke')
        ).resolves.toMatchObject({ id: created.message.id })
        await expect(
          repository.findByExternalMessage(tenantId, 'web', 'ext_pg_smoke')
        ).resolves.toMatchObject({ id: otherChannel.message.id })
        await expect(
          repository.createWithSession({
            tenantId,
            channel: 'whatsapp',
            senderRef: 'fixture-sender',
            externalMessageId: 'ext_pg_smoke',
            body: 'Duplicada'
          })
        ).rejects.toThrow()
        await expect(
          repository.listAuditBySession(created.session.id)
        ).resolves.toMatchObject([{ id: audit.id }])
        await expect(
          client.query(
            `INSERT INTO messages (id, conversation_id, external_message_id, direction, body)
           VALUES ($1, $2, $3, $4, $5)`,
            [
              'msg_pg_duplicate',
              created.conversation.id,
              'ext_pg_smoke',
              'inbound',
              'Duplicada'
            ]
          )
        ).rejects.toThrow()
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )
})
