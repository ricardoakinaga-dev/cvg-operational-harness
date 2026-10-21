import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'
import { Client, Pool, type QueryResult, type QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  baselineLegacyPostgresMigration,
  legacyRequiredColumns,
  legacyRequiredIndexes,
  runInitialPostgresMigration,
  runPostgresMigrations,
  type PostgresQueryable
} from '../postgres.ts'
import {
  CVG_TENANT_CONTEXT_SETTING,
  TenantScopedPostgresControlPlaneRepository,
  TenantScopedPostgresRuntimeRepository,
  withTenantContext,
  type PostgresPoolClient,
  type PostgresPoolLike
} from '../tenant-scoped-postgres.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000091'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000092'
const testDatabaseUrl = process.env.TEST_DATABASE_URL

function result<T extends Record<string, unknown>>(rows: T[] = []) {
  return {
    command: 'SELECT',
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows
  }
}

describe('tenant-scoped PostgreSQL boundary', () => {
  it('runs the versioned migration set and records checksums without changing 0000', async () => {
    const queries: string[] = []
    const client: PostgresQueryable = {
      async query(text) {
        queries.push(text)
        if (text.includes('SELECT version, checksum')) return result()
        return result()
      }
    }

    await runPostgresMigrations(client, {
      migrations: ['0000_initial', '0001_tenant_isolation'],
      schemaName: 'cvg_test_scope'
    })

    expect(
      queries.some((query) => query.includes('0001_tenant_isolation'))
    ).toBe(false)
    expect(
      queries.some(
        (query) =>
          query.includes('FORCE ROW LEVEL SECURITY') &&
          query.includes('cvg.tenant_id')
      )
    ).toBe(true)
    expect(queries.some((query) => query.includes('checksum'))).toBe(true)
  })

  it('fails closed when an applied migration has no trusted checksum', async () => {
    const queries: string[] = []
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        queries.push(text)
        if (text.includes('SELECT version, checksum')) {
          return result([
            { version: '0000_initial', checksum: null }
          ]) as unknown as QueryResult<T>
        }
        return result() as unknown as QueryResult<T>
      }
    }

    await expect(
      runPostgresMigrations(client, { migrations: ['0000_initial'] })
    ).rejects.toThrow('checksum missing')
    expect(queries.at(-1)).toBe('ROLLBACK')
  })

  it('fails closed when an applied migration checksum has drifted', async () => {
    const queries: string[] = []
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        queries.push(text)
        if (text.includes('SELECT version, checksum')) {
          return result([
            { version: '0000_initial', checksum: 'drifted' }
          ]) as unknown as QueryResult<T>
        }
        return result() as unknown as QueryResult<T>
      }
    }

    await expect(
      runPostgresMigrations(client, { migrations: ['0000_initial'] })
    ).rejects.toThrow('checksum mismatch')
    expect(queries.at(-1)).toBe('ROLLBACK')
  })

  it('requires explicit approval metadata before baselining a legacy database', async () => {
    const client: PostgresQueryable = {
      async query() {
        throw new Error('database must not be touched')
      }
    }

    await expect(
      baselineLegacyPostgresMigration(client, {
        approval: { actor: 'x', reference: 'x' }
      })
    ).rejects.toThrow('Baseline actor is required')
  })

  it('records an explicitly approved legacy baseline after validating the schema shape', async () => {
    const queries: string[] = []
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> {
        queries.push(text)
        if (text.includes('FROM pg_class')) {
          return result(
            ((values?.[0] as string[] | undefined) ?? []).map((table_name) => ({
              table_name
            }))
          ) as unknown as QueryResult<T>
        }
        if (text.includes('information_schema.columns')) {
          return result(
            legacyRequiredColumns.map(([table_name, column_name]) => ({
              table_name,
              column_name
            }))
          ) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_indexes')) {
          return result(
            legacyRequiredIndexes.map((indexname) => ({ indexname }))
          ) as unknown as QueryResult<T>
        }
        if (text.includes('SELECT version, checksum')) {
          return result([
            { version: '0000_initial', checksum: null }
          ]) as unknown as QueryResult<T>
        }
        return result() as unknown as QueryResult<T>
      }
    }

    await expect(
      baselineLegacyPostgresMigration(client, {
        approval: {
          actor: 'fixture.operator',
          reference: 'fixture-baseline-2026-08-24'
        }
      })
    ).resolves.toBeUndefined()
    expect(queries.at(-1)).toBe('COMMIT')
    expect(queries.some((query) => query.includes('baseline_actor'))).toBe(true)
  })

  it('keeps tenant context on one acquired connection and resets before release', async () => {
    const calls: Array<{ text: string; values?: unknown[] }> = []
    let released = false
    const client: PostgresQueryable & { release: () => void } = {
      async query(text, values) {
        calls.push({ text, ...(values ? { values } : {}) })
        return result()
      },
      release() {
        released = true
      }
    }
    const pool: PostgresPoolLike = {
      async connect() {
        return client
      }
    }

    await withTenantContext(pool, tenantId, async (scoped) => {
      await scoped.query('SELECT current_setting($1, true)', [
        CVG_TENANT_CONTEXT_SETTING
      ])
    })

    expect(calls).toEqual([
      {
        text: 'SHOW search_path'
      },
      {
        text: 'SELECT set_config($1, $2, false)',
        values: [CVG_TENANT_CONTEXT_SETTING, tenantId]
      },
      {
        text: 'SELECT current_setting($1, true)',
        values: [CVG_TENANT_CONTEXT_SETTING]
      },
      {
        text: 'SELECT set_config($1, $2, false)',
        values: [CVG_TENANT_CONTEXT_SETTING, '']
      }
    ])
    expect(released).toBe(true)
  })

  it('restores and verifies the connection search_path before release', async () => {
    const calls: string[] = []
    const client: PostgresQueryable & { release: () => void } = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        calls.push(text)
        if (text === 'SHOW search_path') {
          return result([
            { search_path: 'cvg_scope, public' }
          ]) as unknown as QueryResult<T>
        }
        return result() as unknown as QueryResult<T>
      },
      release() {}
    }
    const pool: PostgresPoolLike = {
      async connect() {
        return client
      }
    }

    await withTenantContext(pool, tenantId, async () => undefined)

    expect(calls).toEqual([
      'SHOW search_path',
      'SELECT set_config($1, $2, false)',
      'SELECT set_config($1, $2, false)',
      'SELECT set_config($1, $2, false)',
      'SHOW search_path'
    ])
  })

  it('requires an explicit tenant argument for tenant-scoped audit writes', async () => {
    const runtime = new TenantScopedPostgresRuntimeRepository({
      async connect() {
        throw new Error('connection must not be acquired')
      }
    })

    await expect(
      Promise.resolve().then(() =>
        runtime.appendAudit({
          type: 'integration_event',
          actorType: 'System',
          actorId: 'fixture',
          correlationId: 'corr_fixture',
          policyVersion: 'fixture',
          payload: { tenantId }
        })
      )
    ).rejects.toThrow('Tenant scope is required')
  })

  it('rejects an audit payload whose tenant differs from the explicit scope', async () => {
    const runtime = new TenantScopedPostgresRuntimeRepository({
      async connect() {
        throw new Error('connection must not be acquired')
      }
    })

    await expect(
      Promise.resolve().then(() =>
        runtime.appendAudit(
          {
            type: 'integration_event',
            actorType: 'System',
            actorId: 'fixture',
            correlationId: 'corr_fixture',
            policyVersion: 'fixture',
            payload: { tenantId }
          },
          tenantB
        )
      )
    ).rejects.toThrow('does not match the explicit tenant scope')
  })

  it('delegates every runtime and control-plane surface through the tenant scope', async () => {
    const client: PostgresPoolClient = {
      async query(text: string) {
        if (text.includes('SELECT set_config')) return result()
        return result()
      },
      release() {}
    }
    const pool: PostgresPoolLike = {
      async connect() {
        return client
      }
    }
    const runtime = new TenantScopedPostgresRuntimeRepository(pool)
    const platform = new TenantScopedPostgresControlPlaneRepository(pool)
    const agentId = 'agent_00000000-0000-4000-8000-000000000001' as never
    const versionId =
      'agent_version_00000000-0000-4000-8000-000000000001' as never
    const trace = {
      traceId: 'trace_00000000-0000-4000-8000-000000000001',
      tenantId,
      agentId,
      versionId,
      input: { message: 'fixture', historySize: 0 },
      intent: { name: 'unknown', confidence: 0 },
      policy: [],
      knowledge: { status: 'not_requested' },
      tools: [],
      handoff: { requested: false, reason: null },
      response: { text: '', mode: 'blocked' },
      provider: { provider: 'fake', model: 'fixture', externalCall: false },
      configVersion: 'fixture-v1',
      createdAt: new Date()
    } as never

    await expect(
      runtime.findByExternalMessage(tenantId, 'web', 'missing')
    ).resolves.toBeNull()
    await expect(
      runtime.createWithSession({
        tenantId,
        channel: 'web',
        senderRef: 'fixture-sender',
        externalMessageId: 'delegation-message',
        body: 'fixture'
      })
    ).resolves.toMatchObject({
      message: { externalMessageId: 'delegation-message' }
    })
    await expect(
      runtime.appendOutboundMessage({
        tenantId,
        conversationId: 'conv_missing',
        externalMessageId: 'outbound-missing',
        body: 'fixture'
      })
    ).rejects.toThrow('Conversation not found')
    await expect(
      runtime.transitionTakeover(tenantId, 'sess_missing', 'request_handoff')
    ).resolves.toBeNull()
    await expect(
      runtime.appendAudit(
        {
          type: 'integration_event',
          actorType: 'System',
          actorId: 'fixture',
          correlationId: 'corr_fixture',
          policyVersion: 'fixture',
          payload: { tenantId }
        },
        tenantId
      )
    ).resolves.toMatchObject({ type: 'integration_event' })
    await expect(
      runtime.listAuditBySession('sess_missing', tenantId)
    ).resolves.toEqual([])
    await expect(
      runtime.listAuditEvidence({ limit: 10, offset: 0 }, tenantId)
    ).resolves.toMatchObject({ items: [] })
    await expect(
      runtime.summarizeAuditEvidence({}, tenantId)
    ).resolves.toMatchObject({
      totalEvents: 0
    })
    await expect(runtime.timeline(tenantId, 'conv_missing')).resolves.toEqual({
      messages: [],
      sessions: []
    })
    await expect(
      runtime.listPage(tenantId, { limit: 10, offset: 0 })
    ).resolves.toMatchObject({
      items: []
    })
    await expect(
      runtime.createTask(
        {
          sessionId: 'sess_missing',
          title: 'fixture',
          description: 'fixture',
          priority: 'low',
          source: 'fixture',
          idempotencyKey: 'fixture'
        },
        tenantId
      )
    ).rejects.toThrow('Session not found')
    await expect(runtime.listTasks(tenantId)).resolves.toEqual([])
    await expect(
      runtime.findTaskById('task_missing', tenantId)
    ).resolves.toBeNull()
    await expect(
      runtime.updateTaskStatus('task_missing', 'done', tenantId)
    ).resolves.toBeNull()
    await expect(
      runtime.saveApproval(
        {
          id: 'approval_fixture',
          sessionId: 'sess_missing',
          proposedAction: 'fixture',
          summary: 'fixture',
          riskLevel: 'low',
          status: 'pending',
          decidedBy: null,
          decidedAt: null,
          createdAt: new Date()
        },
        tenantId
      )
    ).rejects.toThrow('Session not found')
    await expect(
      runtime.findApprovalById('approval_missing', tenantId)
    ).resolves.toBeNull()
    await expect(runtime.listApprovals(tenantId)).resolves.toEqual([])

    await expect(
      platform.createAgent(
        { tenantId },
        { slug: 'delegation-agent', name: 'Fixture', description: 'Fixture' }
      )
    ).resolves.toMatchObject({ tenantId })
    await expect(platform.getAgent({ tenantId }, agentId)).resolves.toBeNull()
    await expect(platform.listAgents({ tenantId })).resolves.toEqual([])
    await expect(
      platform.createVersion({ tenantId }, agentId, {} as never, 'fixture')
    ).rejects.toThrow()
    await expect(
      platform.getVersion({ tenantId }, versionId)
    ).resolves.toBeNull()
    await expect(platform.listVersions({ tenantId }, agentId)).rejects.toThrow(
      'Agent not found'
    )
    await expect(
      platform.transitionVersion({ tenantId }, versionId, 'TESTING')
    ).rejects.toThrow()
    await expect(
      platform.publishVersion(
        { tenantId },
        versionId,
        'release_candidate_00000000-0000-4000-8000-000000000399'
      )
    ).rejects.toThrow()
    await expect(
      platform.rollback(
        { tenantId },
        agentId,
        versionId,
        'fixture',
        'release_candidate_00000000-0000-4000-8000-000000000399'
      )
    ).rejects.toThrow()
    await expect(
      platform.resolvePublished({ tenantId }, agentId)
    ).resolves.toBeNull()
    await expect(platform.listTestRuns({ tenantId })).resolves.toEqual([])
    await expect(platform.listExecutionTraces({ tenantId })).resolves.toEqual(
      []
    )
    await expect(platform.recordTestRun({ tenantId }, trace)).rejects.toThrow()
    await expect(
      platform.recordExecutionTrace({ tenantId }, trace)
    ).rejects.toThrow()
  })

  it('destroys a connection when context cleanup fails', async () => {
    let releaseArgument: unknown = undefined
    let queryCount = 0
    const client: PostgresQueryable & { release: (error?: Error) => void } = {
      async query(text) {
        queryCount += 1
        if (text.includes('set_config') && queryCount === 3) {
          throw new Error('reset failed')
        }
        return result()
      },
      release(error) {
        releaseArgument = error
      }
    }
    const pool: PostgresPoolLike = {
      async connect() {
        return client
      }
    }

    await expect(
      withTenantContext(pool, tenantId, async () => undefined)
    ).rejects.toThrow('reset failed')
    expect(releaseArgument).toBeInstanceOf(Error)
  })

  it('defines the database contract that hides null tenant rows and protects every legacy table', async () => {
    const migration = await readFile(
      resolve(
        process.cwd(),
        'packages/persistence/migrations/0001_tenant_isolation.sql'
      ),
      'utf8'
    )

    for (const table of [
      'conversations',
      'messages',
      'sessions',
      'agent_runs',
      'tool_calls',
      'approval_requests',
      'tasks',
      'audit_events',
      'idempotency',
      'outbox_events',
      'platform_agents',
      'platform_agent_versions',
      'platform_test_runs',
      'platform_execution_traces'
    ]) {
      expect(migration).toContain(
        `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`
      )
      expect(migration).toContain(
        `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`
      )
    }
    expect(migration).toContain('CHECK (tenant_id IS NOT NULL) NOT VALID')
    expect(migration).toContain('FOREIGN KEY (tenant_id, conversation_id)')
    expect(migration).toContain(
      'CREATE TABLE IF NOT EXISTS tenant_isolation_quarantine'
    )
    expect(migration).toContain('tenant_isolation_quarantined boolean')
    expect(migration).toContain('tenant_mismatch')
    expect(migration).toContain(
      'tenant_isolation_quarantined = false AND tenant_id = NULLIF'
    )
  })

  const itWithPostgres = testDatabaseUrl ? it : it.skip

  itWithPostgres(
    'enforces cross-tenant isolation with a non-BYPASSRLS role and resets pooled context',
    async () => {
      const schemaName = `cvg_rls_${Date.now()}`
      const roleName = `cvg_rls_${Date.now()}_${randomBytes(4).toString('hex')}`
      const password = randomBytes(18).toString('hex')
      const admin = new Client({ connectionString: testDatabaseUrl })
      const roleUrl = new URL(testDatabaseUrl as string)
      roleUrl.username = roleName
      roleUrl.password = password
      const pool = new Pool({ connectionString: roleUrl.toString(), max: 1 })
      let adminConnected = false

      try {
        await admin.connect()
        adminConnected = true
        await admin.query(
          `CREATE ROLE ${roleName} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`
        )
        await runPostgresMigrations(admin, { schemaName })
        await runPostgresMigrations(admin, { schemaName })
        const roleFlags = await admin.query<{ rolbypassrls: boolean }>(
          `SELECT rolbypassrls FROM pg_roles WHERE rolname = $1`,
          [roleName]
        )
        expect(roleFlags.rows[0]?.rolbypassrls).toBe(false)
        await admin.query(`GRANT USAGE ON SCHEMA ${schemaName} TO ${roleName}`)
        await admin.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ${schemaName}.conversations, ${schemaName}.messages, ${schemaName}.sessions, ${schemaName}.agent_runs, ${schemaName}.tool_calls, ${schemaName}.approval_requests, ${schemaName}.tasks, ${schemaName}.audit_events, ${schemaName}.idempotency, ${schemaName}.outbox_events, ${schemaName}.outbox_effects, ${schemaName}.outbox_attempts, ${schemaName}.platform_agents, ${schemaName}.platform_agent_versions, ${schemaName}.platform_test_runs, ${schemaName}.platform_execution_traces, ${schemaName}.platform_capability_approvals, ${schemaName}.platform_test_suites, ${schemaName}.platform_test_suite_runs, ${schemaName}.platform_plugin_catalog, ${schemaName}.platform_knowledge_sources, ${schemaName}.platform_release_candidates, ${schemaName}.audit_evidence_checkpoints TO ${roleName}`
        )
        // SPEC0176: the core case root is born with the conversation, so the
        // runtime role needs the (tenant-only, RLS-forced) case tables too.
        await admin.query(
          `GRANT SELECT, INSERT, UPDATE ON ${schemaName}.case_roots, ${schemaName}.case_principals, ${schemaName}.case_assignments, ${schemaName}.case_execution_links, ${schemaName}.case_audit_links TO ${roleName}`
        )
        await admin.query(
          `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${schemaName} TO ${roleName}`
        )
        await admin.query(
          `ALTER ROLE ${roleName} SET search_path TO ${schemaName}`
        )

        const repository = new TenantScopedPostgresRuntimeRepository(pool)
        const platform = new TenantScopedPostgresControlPlaneRepository(pool)
        const created = await repository.createWithSession({
          tenantId,
          channel: 'web',
          senderRef: 'fixture-rls-sender',
          externalMessageId: 'rls-message-a',
          body: 'Mensagem fictícia A'
        })

        await expect(
          repository.timeline(tenantB, created.conversation.id)
        ).resolves.toEqual({ messages: [], sessions: [] })
        await expect(
          repository.appendOutboundMessage({
            tenantId: tenantB,
            conversationId: created.conversation.id,
            externalMessageId: 'rls-cross-tenant-write',
            body: 'Não deve gravar'
          })
        ).rejects.toThrow('Conversation not found')

        const agent = await platform.createAgent(
          { tenantId },
          {
            slug: 'rls-fixture-agent',
            name: 'RLS Fixture Agent',
            description: 'Fixture only'
          }
        )
        await expect(
          platform.getAgent({ tenantId: tenantB }, agent.id)
        ).resolves.toBe(null)

        const pooledClient = await pool.connect()
        try {
          const context = await pooledClient.query<{ value: string }>(
            `SELECT current_setting($1, true) AS value`,
            [CVG_TENANT_CONTEXT_SETTING]
          )
          expect(context.rows[0]?.value ?? '').toBe('')
          const hidden = await pooledClient.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM conversations`
          )
          expect(hidden.rows[0]?.count).toBe('0')
        } finally {
          pooledClient.release()
        }
      } finally {
        await pool.end()
        if (adminConnected) {
          await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
          await admin.query(`DROP ROLE IF EXISTS ${roleName}`)
          await admin.end()
        }
      }
    }
  )

  itWithPostgres(
    'quarantines legacy tenant mismatches before enabling RLS',
    async () => {
      const schemaName = `cvg_quarantine_${Date.now()}`
      const admin = new Client({ connectionString: testDatabaseUrl })
      const mismatchConversation = 'conv_legacy_mismatch'
      const mismatchSession = 'sess_legacy_mismatch'
      const invalidParentSession = 'sess_legacy_invalid_parent'
      const mismatchMessage = 'msg_legacy_mismatch'
      const mismatchAudit = 'audit_legacy_mismatch'
      const untrustedAudit = 'audit_legacy_untrusted'
      const nullAudit = 'audit_legacy_null'
      const prefilledAudit = 'audit_legacy_prefilled'
      const contradictoryAudit = 'audit_legacy_contradictory'
      const prefilledMappedAudit = 'audit_legacy_prefilled_mapped'
      const invalidParentAudit = 'audit_legacy_invalid_parent'
      const invalidVersionAudit = 'audit_legacy_invalid_version'
      const invalidActiveAudit = 'audit_legacy_invalid_active_agent'
      const untrustedOutbox = 'outbox_legacy_untrusted'
      const outboxClaimMismatch = 'outbox_legacy_claim_mismatch'
      const prefilledOutbox = 'outbox_legacy_prefilled'
      const prefilledMappedOutbox = 'outbox_legacy_prefilled_mapped'
      const invalidParentOutbox = 'outbox_legacy_invalid_parent'
      const outboxAgentMismatch = 'outbox_legacy_agent_version_mismatch'
      const mismatchAgent = 'agent_00000000-0000-4000-8000-000000000099'
      const mismatchVersion =
        'agent_version_00000000-0000-4000-8000-000000000099'
      const invalidActiveAgent = 'agent_00000000-0000-4000-8000-000000000098'
      const roleName = `cvg_quarantine_${Date.now()}_${randomBytes(4).toString('hex')}`
      const password = randomBytes(18).toString('hex')
      const roleUrl = new URL(testDatabaseUrl as string)
      roleUrl.username = roleName
      roleUrl.password = password
      const runtime = new Client({ connectionString: roleUrl.toString() })

      await admin.connect()
      try {
        await runInitialPostgresMigration(admin, { schemaName })
        await admin.query('ALTER TABLE messages ADD COLUMN tenant_id text')
        await admin.query(
          `ALTER TABLE sessions ADD COLUMN tenant_id text;
           ALTER TABLE audit_events ADD COLUMN tenant_id text;
           ALTER TABLE outbox_events ADD COLUMN tenant_id text`
        )
        await admin.query(
          `INSERT INTO conversations
             (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id)
           VALUES ($1, $2, 'web', 'legacy-fixture', $3, 'active', 'corr_legacy_mismatch')`,
          [tenantId, mismatchConversation, 'a'.repeat(64)]
        )
        await admin.query(
          `INSERT INTO sessions (id, conversation_id, status)
           VALUES ($1, $2, 'active')`,
          [mismatchSession, mismatchConversation]
        )
        await admin.query(
          `INSERT INTO conversations
             (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id)
           VALUES ($1, 'conv_legacy_other', 'web', 'legacy-other', $2, 'active', 'corr_legacy_other')`,
          [tenantB, 'b'.repeat(64)]
        )
        await admin.query(
          `INSERT INTO sessions (tenant_id, id, conversation_id, status)
           VALUES ($1, $2, $3, 'active')`,
          [tenantB, invalidParentSession, mismatchConversation]
        )
        await admin.query(
          `INSERT INTO messages
             (tenant_id, id, conversation_id, external_message_id, direction, body)
           VALUES ($1, $2, $3, 'legacy-external', 'inbound', 'fixture')`,
          [tenantB, mismatchMessage, mismatchConversation]
        )
        await admin.query(
          `INSERT INTO audit_events
             (id, type, actor_type, actor_id, correlation_id, policy_version, payload)
           VALUES ($1, 'integration_event', 'System', 'fixture', 'corr_legacy_audit', 'fixture', $2::jsonb)`,
          [
            mismatchAudit,
            JSON.stringify({ tenantId: tenantB, sessionId: mismatchSession })
          ]
        )
        await admin.query(
          `INSERT INTO audit_events
             (id, type, actor_type, actor_id, correlation_id, policy_version, payload)
           VALUES
             ($1, 'integration_event', 'System', 'fixture', 'corr_legacy_untrusted', 'fixture', $2::jsonb),
             ($3, 'integration_event', 'System', 'fixture', 'corr_legacy_null', 'fixture', '{}'::jsonb)`,
          [untrustedAudit, JSON.stringify({ tenantId }), nullAudit]
        )
        await admin.query(
          `INSERT INTO audit_events
             (id, type, actor_type, actor_id, correlation_id, policy_version, payload, tenant_id)
           VALUES
             ($1, 'integration_event', 'System', 'fixture', 'corr_legacy_prefilled', 'fixture', $2::jsonb, $3),
             ($4, 'integration_event', 'System', 'fixture', 'corr_legacy_contradictory', 'fixture', $5::jsonb, $3),
             ($6, 'integration_event', 'System', 'fixture', 'corr_legacy_prefilled_mapped', 'fixture', $7::jsonb, $8)`,
          [
            prefilledAudit,
            JSON.stringify({ tenantId }),
            tenantId,
            contradictoryAudit,
            JSON.stringify({
              tenantId,
              sessionId: mismatchSession,
              conversationId: 'conv_legacy_other'
            }),
            prefilledMappedAudit,
            JSON.stringify({ tenantId, sessionId: mismatchSession }),
            tenantB
          ]
        )
        await admin.query(
          `INSERT INTO audit_events
             (id, type, actor_type, actor_id, correlation_id, policy_version, payload)
           VALUES
             ($1, 'integration_event', 'System', 'fixture', 'corr_legacy_invalid_parent', 'fixture', $2::jsonb),
             ($3, 'integration_event', 'System', 'fixture', 'corr_legacy_invalid_version', 'fixture', $4::jsonb)`,
          [
            invalidParentAudit,
            JSON.stringify({
              tenantId: tenantB,
              sessionId: invalidParentSession
            }),
            invalidVersionAudit,
            JSON.stringify({
              tenantId,
              agentId: mismatchAgent,
              versionId: mismatchVersion
            })
          ]
        )
        await admin.query(
          `INSERT INTO audit_events
             (id, type, actor_type, actor_id, correlation_id, policy_version, payload)
           VALUES ($1, 'integration_event', 'System', 'fixture', 'corr_legacy_invalid_active_agent', 'fixture', $2::jsonb)`,
          [
            invalidActiveAudit,
            JSON.stringify({ tenantId, agentId: invalidActiveAgent })
          ]
        )
        await admin.query(
          `INSERT INTO outbox_events
             (id, type, payload, status)
           VALUES
             ($1, 'legacy_event', $2::jsonb, 'pending'),
             ($3, 'legacy_event', $4::jsonb, 'pending')`,
          [
            untrustedOutbox,
            JSON.stringify({ tenantId: tenantB }),
            outboxClaimMismatch,
            JSON.stringify({ tenantId: tenantB, sessionId: mismatchSession })
          ]
        )
        await admin.query(
          `INSERT INTO outbox_events (id, type, payload, status, tenant_id)
           VALUES
             ($1, 'legacy_event', $2::jsonb, 'pending', $3),
             ($4, 'message.outbound', $5::jsonb, 'pending', $6),
             ($7, 'legacy_event', $8::jsonb, 'pending', $9)`,
          [
            prefilledOutbox,
            JSON.stringify({ tenantId }),
            tenantB,
            prefilledMappedOutbox,
            JSON.stringify({ tenantId, sessionId: mismatchSession }),
            tenantB,
            invalidParentOutbox,
            JSON.stringify({
              tenantId: tenantB,
              sessionId: invalidParentSession
            }),
            tenantB
          ]
        )
        await admin.query(
          `INSERT INTO outbox_events (id, type, payload, status)
           VALUES ($1, 'legacy_event', $2::jsonb, 'pending')`,
          [
            outboxAgentMismatch,
            JSON.stringify({
              tenantId,
              conversationId: mismatchConversation,
              agentId: mismatchAgent,
              versionId: mismatchVersion
            })
          ]
        )
        await admin.query(
          `INSERT INTO platform_agents
             (tenant_id, id, slug, name, description)
           VALUES ($1, $2, 'legacy-mismatch', 'Fixture', 'Fixture'),
                  ($1, $3, 'legacy-invalid-active', 'Fixture', 'Fixture')`,
          [tenantId, mismatchAgent, invalidActiveAgent]
        )
        await admin.query(
          `UPDATE platform_agents
           SET active_version_id = $2
           WHERE tenant_id = $1 AND id = $3`,
          [
            tenantId,
            'agent_version_00000000-0000-4000-8000-000000000098',
            invalidActiveAgent
          ]
        )
        await admin.query(
          `INSERT INTO platform_agent_versions
             (tenant_id, id, agent_id, version, status, config, created_by)
           VALUES ($1, $2, $3, 1, 'DRAFT', '{}'::jsonb, 'fixture')`,
          [tenantB, mismatchVersion, mismatchAgent]
        )

        await baselineLegacyPostgresMigration(admin, {
          schemaName,
          approval: {
            actor: 'fixture.operator',
            reference: 'fixture-baseline-2026-08-24'
          }
        })
        await runPostgresMigrations(admin, { schemaName })
        await runPostgresMigrations(admin, { schemaName })

        const quarantined = await admin.query<{
          table_name: string
          row_id: string
          reason: string
        }>(
          `SELECT table_name, row_id, reason
           FROM tenant_isolation_quarantine
           WHERE row_id = ANY($1::text[])
           ORDER BY table_name`,
          [
            [
              mismatchMessage,
              invalidParentSession,
              mismatchAudit,
              untrustedAudit,
              nullAudit,
              prefilledAudit,
              contradictoryAudit,
              invalidParentAudit,
              invalidVersionAudit,
              invalidActiveAudit,
              untrustedOutbox,
              outboxClaimMismatch,
              prefilledOutbox,
              invalidParentOutbox,
              outboxAgentMismatch,
              mismatchVersion
            ]
          ]
        )
        const flags = await admin.query<{
          table_name: string
          quarantined: boolean
        }>(
          `SELECT 'messages' AS table_name, tenant_isolation_quarantined AS quarantined
             FROM messages WHERE id = $1
           UNION ALL
           SELECT 'sessions', tenant_isolation_quarantined
             FROM sessions WHERE id = $2
           UNION ALL
           SELECT 'audit_events', tenant_isolation_quarantined
             FROM audit_events WHERE id = $3
           UNION ALL
           SELECT 'audit_events', tenant_isolation_quarantined
             FROM audit_events WHERE id = $4
           UNION ALL
           SELECT 'audit_events', tenant_isolation_quarantined
             FROM audit_events WHERE id = $5
           UNION ALL
           SELECT 'audit_events', tenant_isolation_quarantined
             FROM audit_events WHERE id = $6
           UNION ALL
           SELECT 'audit_events', tenant_isolation_quarantined
             FROM audit_events WHERE id = $7
           UNION ALL
           SELECT 'audit_events', tenant_isolation_quarantined
             FROM audit_events WHERE id = $8
           UNION ALL
           SELECT 'audit_events', tenant_isolation_quarantined
             FROM audit_events WHERE id = $9
           UNION ALL
           SELECT 'audit_events', tenant_isolation_quarantined
             FROM audit_events WHERE id = $10
           UNION ALL
           SELECT 'outbox_events', tenant_isolation_quarantined
             FROM outbox_events WHERE id = $11
           UNION ALL
           SELECT 'outbox_events', tenant_isolation_quarantined
             FROM outbox_events WHERE id = $12
           UNION ALL
           SELECT 'outbox_events', tenant_isolation_quarantined
             FROM outbox_events WHERE id = $13
           UNION ALL
           SELECT 'outbox_events', tenant_isolation_quarantined
             FROM outbox_events WHERE id = $14
           UNION ALL
           SELECT 'outbox_events', tenant_isolation_quarantined
             FROM outbox_events WHERE id = $15
           UNION ALL
           SELECT 'platform_agent_versions', tenant_isolation_quarantined
             FROM platform_agent_versions WHERE id = $16`,
          [
            mismatchMessage,
            invalidParentSession,
            mismatchAudit,
            untrustedAudit,
            nullAudit,
            prefilledAudit,
            contradictoryAudit,
            invalidParentAudit,
            invalidVersionAudit,
            invalidActiveAudit,
            untrustedOutbox,
            outboxClaimMismatch,
            prefilledOutbox,
            invalidParentOutbox,
            outboxAgentMismatch,
            mismatchVersion
          ]
        )

        expect(quarantined.rows).toEqual(
          expect.arrayContaining([
            {
              table_name: 'messages',
              row_id: mismatchMessage,
              reason: 'tenant_mismatch'
            },
            {
              table_name: 'sessions',
              row_id: invalidParentSession,
              reason: 'tenant_mismatch'
            },
            {
              table_name: 'audit_events',
              row_id: mismatchAudit,
              reason: 'audit_tenant_claim_mismatch'
            },
            {
              table_name: 'audit_events',
              row_id: untrustedAudit,
              reason: 'audit_tenant_unresolved'
            },
            {
              table_name: 'audit_events',
              row_id: nullAudit,
              reason: 'audit_tenant_unresolved'
            },
            {
              table_name: 'audit_events',
              row_id: prefilledAudit,
              reason: 'audit_tenant_unresolved'
            },
            {
              table_name: 'audit_events',
              row_id: contradictoryAudit,
              reason: 'audit_tenant_unresolved'
            },
            {
              table_name: 'audit_events',
              row_id: invalidParentAudit,
              reason: 'audit_tenant_unresolved'
            },
            {
              table_name: 'audit_events',
              row_id: invalidVersionAudit,
              reason: 'audit_tenant_unresolved'
            },
            {
              table_name: 'audit_events',
              row_id: invalidActiveAudit,
              reason: 'audit_tenant_unresolved'
            },
            {
              table_name: 'outbox_events',
              row_id: outboxClaimMismatch,
              reason: 'outbox_tenant_claim_mismatch'
            },
            {
              table_name: 'outbox_events',
              row_id: untrustedOutbox,
              reason: 'outbox_tenant_unresolved'
            },
            {
              table_name: 'outbox_events',
              row_id: prefilledOutbox,
              reason: 'outbox_tenant_unresolved'
            },
            {
              table_name: 'outbox_events',
              row_id: invalidParentOutbox,
              reason: 'outbox_tenant_unresolved'
            },
            {
              table_name: 'outbox_events',
              row_id: outboxAgentMismatch,
              reason: 'outbox_tenant_unresolved'
            },
            {
              table_name: 'platform_agent_versions',
              row_id: mismatchVersion,
              reason: 'agent_tenant_unresolved'
            }
          ])
        )
        expect(flags.rows).toEqual([
          { table_name: 'messages', quarantined: true },
          { table_name: 'sessions', quarantined: true },
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'outbox_events', quarantined: true },
          { table_name: 'outbox_events', quarantined: true },
          { table_name: 'outbox_events', quarantined: true },
          { table_name: 'outbox_events', quarantined: true },
          { table_name: 'outbox_events', quarantined: true },
          { table_name: 'platform_agent_versions', quarantined: true }
        ])
        const mappedRows = await admin.query<{
          table_name: string
          tenant_id: string
          quarantined: boolean
        }>(
          `SELECT 'audit_events' AS table_name, tenant_id, tenant_isolation_quarantined AS quarantined
             FROM audit_events WHERE id = $1
           UNION ALL
           SELECT 'outbox_events', tenant_id, tenant_isolation_quarantined
             FROM outbox_events WHERE id = $2`,
          [prefilledMappedAudit, prefilledMappedOutbox]
        )
        expect(mappedRows.rows).toEqual([
          {
            table_name: 'audit_events',
            tenant_id: tenantId,
            quarantined: false
          },
          {
            table_name: 'outbox_events',
            tenant_id: tenantId,
            quarantined: false
          }
        ])

        await admin.query(
          `CREATE ROLE ${roleName} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`
        )
        await admin.query(`GRANT USAGE ON SCHEMA ${schemaName} TO ${roleName}`)
        await admin.query(
          `GRANT SELECT, UPDATE ON ${schemaName}.audit_events, ${schemaName}.outbox_events TO ${roleName}`
        )
        await admin.query(
          `ALTER ROLE ${roleName} SET search_path TO ${schemaName}`
        )
        await runtime.connect()
        await runtime.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantId
        ])
        const hiddenAuditAndOutbox = await runtime.query(
          `SELECT id FROM audit_events
           WHERE id = ANY($1::text[])
           UNION ALL
           SELECT id FROM outbox_events
           WHERE id = ANY($1::text[])`,
          [
            [
              mismatchAudit,
              untrustedAudit,
              nullAudit,
              prefilledAudit,
              contradictoryAudit,
              invalidParentAudit,
              invalidVersionAudit,
              invalidActiveAudit,
              untrustedOutbox,
              outboxClaimMismatch,
              prefilledOutbox,
              invalidParentOutbox,
              outboxAgentMismatch
            ]
          ]
        )
        expect(hiddenAuditAndOutbox.rows).toEqual([])
        const visibleMapped = await runtime.query(
          `SELECT id FROM audit_events WHERE id = $1
           UNION ALL
           SELECT id FROM outbox_events WHERE id = $2`,
          [prefilledMappedAudit, prefilledMappedOutbox]
        )
        expect(visibleMapped.rows).toHaveLength(2)
        await runtime.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantB
        ])
        const crossTenantMapped = await runtime.query(
          `SELECT id FROM audit_events WHERE id = $1
           UNION ALL
           SELECT id FROM outbox_events WHERE id = $2`,
          [prefilledMappedAudit, prefilledMappedOutbox]
        )
        expect(crossTenantMapped.rows).toEqual([])
        await runtime.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
          tenantId
        ])
        const attemptedMutation = await runtime.query(
          `UPDATE audit_events
           SET tenant_isolation_quarantined = false
           WHERE id = $1`,
          [untrustedAudit]
        )
        expect(attemptedMutation.rowCount).toBe(0)
        const attemptedOutboxMutation = await runtime.query(
          `UPDATE outbox_events
           SET tenant_isolation_quarantined = false
           WHERE id = $1`,
          [prefilledOutbox]
        )
        expect(attemptedOutboxMutation.rowCount).toBe(0)

        const flagsBeforeRerun = flags.rows
        await runPostgresMigrations(admin, { schemaName })
        const flagsAfterRerun = await admin.query(
          `SELECT 'audit_events' AS table_name, tenant_isolation_quarantined AS quarantined
             FROM audit_events WHERE id = $1
           UNION ALL
           SELECT 'outbox_events', tenant_isolation_quarantined
             FROM outbox_events WHERE id = $2
           UNION ALL
           SELECT 'audit_events', tenant_isolation_quarantined
             FROM audit_events WHERE id = $3
           UNION ALL
           SELECT 'outbox_events', tenant_isolation_quarantined
             FROM outbox_events WHERE id = $4`,
          [untrustedAudit, untrustedOutbox, prefilledAudit, prefilledOutbox]
        )
        expect(flagsBeforeRerun.some((row) => row.quarantined !== true)).toBe(
          false
        )
        expect(flagsAfterRerun.rows).toEqual([
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'outbox_events', quarantined: true },
          { table_name: 'audit_events', quarantined: true },
          { table_name: 'outbox_events', quarantined: true }
        ])
      } finally {
        await runtime.end().catch(() => undefined)
        await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await admin.query(`DROP ROLE IF EXISTS ${roleName}`)
        await admin.end()
      }
    }
  )
})
