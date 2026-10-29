/**
 * SPEC 0257 R2 on PostgreSQL: AC01-AC04, AC07, AC08, AC11 (synthetic data).
 *
 * The adapter runs as a least-privilege runtime role (no superuser, no RLS
 * bypass) with the grants of scripts/migrate-job.mjs; counts are read through
 * an independent admin connection, never from the port's return value. Ad-hoc
 * runs without TEST_DATABASE_URL skip (repo convention);
 * API_CREATION_PG_REQUIRED=1 turns a missing database into a failure.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TenantId } from '@cvg/platform'
import {
  PostgresApiCreation,
  runCreationTransaction,
  runPostgresMigrations,
  tenantRuntimeGrantPrivileges,
  TENANT_SCHEMA_TABLES,
  withTenantContext,
  type ApprovalRequestRecord,
  type CreateApprovalWithAuditCommand,
  type CreateTaskWithAuditCommand,
  type PostgresPoolClient,
  type PostgresPoolLike
} from '../index.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.API_CREATION_PG_REQUIRED === '1' && !testDatabaseUrl) {
  throw new Error(
    'API_CREATION_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to skip'
  )
}
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

const tenantA = 'tenant_00000000-0000-4000-8000-0000000025a1' as TenantId
const tenantB = 'tenant_00000000-0000-4000-8000-0000000025b2' as TenantId
const actor = { actorType: 'Operator', actorId: 'operator.synthetic' } as const
const NOW = new Date('2026-10-28T12:00:00.000Z')

// Explicit timeout: migrations, fault injection and concurrency are slow on
// hosted runners (the 15 s default is not enough).
describeWithPostgres(
  'SPEC 0257 creation receipts on PostgreSQL',
  { timeout: 180_000 },
  () => {
    const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
    const schema = `cvg_api_creation_${suffix}`
    const runtimeRole = `cvg_api_creation_rt_${suffix}`
    const runtimePassword = `pw-${randomBytes(12).toString('hex')}`
    let admin: Client
    let ownerPool: Pool
    let runtimePool: Pool
    const sessions: Record<string, string> = {}

    beforeAll(async () => {
      admin = new Client({ connectionString: testDatabaseUrl })
      await admin.connect()
      await runPostgresMigrations(admin, { schemaName: schema })
      ownerPool = new Pool({
        connectionString: testDatabaseUrl,
        max: 2,
        options: `-c search_path=${schema}`
      })
      await admin.query(
        `CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS`
      )
      await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${runtimeRole}`)
      for (const table of TENANT_SCHEMA_TABLES) {
        await admin.query(
          `GRANT ${tenantRuntimeGrantPrivileges(table)} ON ${schema}."${table}" TO ${runtimeRole}`
        )
      }
      const url = new URL(testDatabaseUrl as string)
      url.username = runtimeRole
      url.password = runtimePassword
      runtimePool = new Pool({
        connectionString: url.toString(),
        max: 6,
        options: `-c search_path=${schema}`
      })
      for (const [label, tenantId] of [
        ['a', tenantA],
        ['b', tenantB]
      ] as const) {
        sessions[label] = await seedSession(tenantId, label)
      }
    }, 180_000)

    afterAll(async () => {
      await runtimePool?.end().catch(() => undefined)
      await ownerPool?.end().catch(() => undefined)
      await admin
        ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined)
      await admin
        ?.query(`DROP ROLE IF EXISTS ${runtimeRole}`)
        .catch(() => undefined)
      await admin?.end().catch(() => undefined)
    })

    async function seedSession(tenantId: TenantId, label: string) {
      const conversationId = `conv_${randomUUID()}`
      const sessionId = `sess_${randomUUID()}`
      await withTenantContext(ownerPool, tenantId, async (client) => {
        await client.query(
          `INSERT INTO conversations
           (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
         VALUES ($1, $2, 'web', $3, $4, 'active', $5, $6, $6)`,
          [
            tenantId,
            conversationId,
            `s-${label}`,
            'e'.repeat(64),
            `corr_${randomUUID()}`,
            NOW
          ]
        )
        await client.query(
          `INSERT INTO sessions
           (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', 'BOT_ACTIVE', $4, $4)`,
          [tenantId, sessionId, conversationId, NOW]
        )
      })
      return sessionId
    }

    /** Independent counts through the owner connection (RLS does not bind it). */
    async function counts(tenantId: TenantId, key: string) {
      const digest = await admin.query<{ key_digest: string }>(
        `SELECT key_digest FROM api_creation_receipts WHERE tenant_id = $1`,
        [tenantId]
      )
      void digest
      const tasks = await admin.query(
        `SELECT count(*)::int AS n FROM ${schema}.tasks WHERE tenant_id = $1 AND idempotency_key = $2`,
        [tenantId, key]
      )
      const receipts = await admin.query(
        `SELECT count(*)::int AS n FROM ${schema}.api_creation_receipts WHERE tenant_id = $1`,
        [tenantId]
      )
      const audit = await admin.query(
        `SELECT count(*)::int AS n FROM ${schema}.audit_events WHERE tenant_id = $1 AND type = 'integration_event'`,
        [tenantId]
      )
      return {
        tasks: tasks.rows[0].n as number,
        receipts: receipts.rows[0].n as number,
        audit: audit.rows[0].n as number
      }
    }

    const taskCommand = (
      key: string,
      overrides: Partial<CreateTaskWithAuditCommand['task']> = {},
      sessionId = sessions.a!
    ): CreateTaskWithAuditCommand => ({
      actor,
      correlationId: `corr_${randomUUID()}`,
      task: {
        sessionId,
        title: 'Revisar caso',
        description: 'Descrição sintética',
        priority: 'medium',
        source: 'console',
        idempotencyKey: key,
        ...overrides
      }
    })

    const approvalCommand = (
      key: string,
      overrides: Partial<ApprovalRequestRecord> = {},
      sessionId = sessions.a!
    ): CreateApprovalWithAuditCommand => ({
      actor,
      correlationId: `corr_${randomUUID()}`,
      idempotencyKey: key,
      request: {
        id: `approval_${randomUUID()}`,
        sessionId,
        proposedAction: 'audit_evidence_export_review',
        summary: 'Resumo sintético',
        riskLevel: 'medium',
        status: 'pending',
        decidedBy: null,
        decidedAt: null,
        createdAt: NOW,
        ...overrides
      }
    })

    const port = () => new PostgresApiCreation(runtimePool)
    const unique = (prefix: string) =>
      `${prefix}-${randomBytes(6).toString('hex')}`

    it('AC01/AC02: creates 1 task + 1 audit + 1 receipt together and replays the same task', async () => {
      const key = unique('task-key')
      const before = await counts(tenantA, key)
      const first = await port().createTaskWithAudit(taskCommand(key), tenantA)
      expect(first.outcome).toBe('created')
      const after = await counts(tenantA, key)
      expect(after).toEqual({
        tasks: 1,
        receipts: before.receipts + 1,
        audit: before.audit + 1
      })
      const replay = await port().createTaskWithAudit(taskCommand(key), tenantA)
      expect(replay.outcome).toBe('replayed')
      expect(replay.resource.id).toBe(first.resource.id)
      expect(await counts(tenantA, key)).toEqual(after)
    })

    it('AC02: the same key with another actor, session, source or body is a 409 and writes nothing', async () => {
      const key = unique('task-key')
      await port().createTaskWithAudit(taskCommand(key), tenantA)
      const before = await counts(tenantA, key)
      for (const variant of [
        taskCommand(key, { title: 'outro' }),
        taskCommand(key, { description: 'outra' }),
        taskCommand(key, { priority: 'high' }),
        taskCommand(key, { source: 'api' }),
        {
          ...taskCommand(key),
          actor: { actorType: 'Admin', actorId: 'operator.synthetic' }
        } as CreateTaskWithAuditCommand
      ]) {
        await expect(
          port().createTaskWithAudit(variant, tenantA)
        ).rejects.toMatchObject({
          code: 'conflict'
        })
      }
      expect(await counts(tenantA, key)).toEqual(before)
    })

    it('AC02: tenants and routes are separate namespaces for the same key text', async () => {
      const key = unique('shared-key')
      const a = await port().createTaskWithAudit(taskCommand(key), tenantA)
      const b = await port().createTaskWithAudit(
        taskCommand(key, {}, sessions.b),
        tenantB
      )
      const approval = await port().createApprovalWithAudit(
        approvalCommand(key),
        tenantA
      )
      expect(new Set([a.outcome, b.outcome, approval.outcome])).toEqual(
        new Set(['created'])
      )
    })

    it('AC01: an audit failure leaves 0 of 3 and the retry converges (resource, audit, receipt)', async () => {
      const key = unique('task-key')
      const before = await counts(tenantA, key)
      const fn = `reject_${randomBytes(4).toString('hex')}`
      await admin.query(`
      CREATE FUNCTION ${schema}.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected audit failure'; END $$`)
      await admin.query(
        `CREATE TRIGGER ${fn} BEFORE INSERT ON ${schema}.audit_events
         FOR EACH ROW WHEN (NEW.type = 'integration_event')
         EXECUTE FUNCTION ${schema}.${fn}()`
      )
      try {
        await expect(
          port().createTaskWithAudit(taskCommand(key), tenantA)
        ).rejects.toThrow('injected audit failure')
      } finally {
        await admin.query(`DROP TRIGGER ${fn} ON ${schema}.audit_events`)
        await admin.query(`DROP FUNCTION ${schema}.${fn}()`)
      }
      expect(await counts(tenantA, key)).toEqual({ ...before, tasks: 0 })
      const retry = await port().createTaskWithAudit(taskCommand(key), tenantA)
      expect(retry.outcome).toBe('created')
      expect(await counts(tenantA, key)).toEqual({
        tasks: 1,
        receipts: before.receipts + 1,
        audit: before.audit + 1
      })
    })

    it('(d) a receipt INSERT failure after resource and audit leaves 0 of 3', async () => {
      const key = unique('task-key')
      const before = await counts(tenantA, key)
      await admin.query(
        `ALTER TABLE ${schema}.api_creation_receipts DISABLE TRIGGER api_creation_receipts_no_update_delete`
      )
      const fn = `reject_rcpt_${randomBytes(4).toString('hex')}`
      await admin.query(`
      CREATE FUNCTION ${schema}.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected receipt failure'; END $$`)
      await admin.query(
        `CREATE TRIGGER ${fn} BEFORE INSERT ON ${schema}.api_creation_receipts
         FOR EACH ROW EXECUTE FUNCTION ${schema}.${fn}()`
      )
      try {
        await expect(
          port().createTaskWithAudit(taskCommand(key), tenantA)
        ).rejects.toThrow('injected receipt failure')
      } finally {
        await admin.query(
          `DROP TRIGGER ${fn} ON ${schema}.api_creation_receipts`
        )
        await admin.query(`DROP FUNCTION ${schema}.${fn}()`)
        await admin.query(
          `ALTER TABLE ${schema}.api_creation_receipts ENABLE TRIGGER api_creation_receipts_no_update_delete`
        )
      }
      expect(await counts(tenantA, key)).toEqual({ ...before, tasks: 0 })
    })

    it('AC03/AC09: a legacy task of the same unique key without our receipt is a 409 with zero audit/receipt', async () => {
      const key = unique('legacy-key')
      await withTenantContext(ownerPool, tenantA, (client) =>
        client.query(
          `INSERT INTO tasks (tenant_id, id, session_id, title, description, priority, source, status, idempotency_key, created_at)
         VALUES ($1, $2, $3, 'legado', '', 'medium', 'console', 'open', $4, $5)`,
          [tenantA, `task_${randomUUID()}`, sessions.a, key, NOW]
        )
      )
      const before = await counts(tenantA, key)
      await expect(
        port().createTaskWithAudit(taskCommand(key), tenantA)
      ).rejects.toMatchObject({ code: 'conflict' })
      expect(await counts(tenantA, key)).toEqual(before)
    })

    it('AC03: two simultaneous requests for the same operation converge on one resource', async () => {
      const key = unique('race-key')
      const before = await counts(tenantA, key)
      const results = await Promise.all([
        port().createTaskWithAudit(taskCommand(key), tenantA),
        port().createTaskWithAudit(taskCommand(key), tenantA),
        port().createTaskWithAudit(taskCommand(key), tenantA)
      ])
      expect(results.map((r) => r.outcome).sort()).toEqual([
        'created',
        'replayed',
        'replayed'
      ])
      expect(new Set(results.map((r) => r.resource.id)).size).toBe(1)
      expect(await counts(tenantA, key)).toEqual({
        tasks: 1,
        receipts: before.receipts + 1,
        audit: before.audit + 1
      })
    })

    it('approval: 1 resource + 1 creation audit + 1 receipt, replay returns the same id and never feeds the decision dedupe', async () => {
      const key = unique('approval-key')
      const first = await port().createApprovalWithAudit(
        approvalCommand(key),
        tenantA
      )
      expect(first.outcome).toBe('created')
      const replay = await port().createApprovalWithAudit(
        approvalCommand(key),
        tenantA
      )
      expect(replay.outcome).toBe('replayed')
      expect(replay.resource.id).toBe(first.resource.id)
      const events = await admin.query(
        `SELECT payload FROM ${schema}.audit_events
        WHERE tenant_id = $1 AND type = 'approval_decision'
          AND payload->>'approvalRequestId' = $2`,
        [tenantA, first.resource.id]
      )
      expect(events.rows).toHaveLength(1)
      expect(events.rows[0].payload.approvalId).toBeUndefined()
      await expect(
        port().createApprovalWithAudit(
          approvalCommand(key, { summary: 'outro' }),
          tenantA
        )
      ).rejects.toMatchObject({ code: 'conflict' })
    })

    // AC04/AC11: the fault is injected at the connection, not by mocking the port.
    function faultyPool(
      mode:
        | 'commit-ack-lost'
        | 'commit-fails-before'
        | 'cleanup-fails'
        | 'rollback-fails',
      releases: Array<Error | undefined>
    ): PostgresPoolLike {
      return {
        connect: async () => {
          const real = await runtimePool.connect()
          let cleared = 0
          const client: PostgresPoolClient = {
            query: (async (text: string, params?: unknown[]) => {
              if (text === 'COMMIT' && mode === 'commit-ack-lost') {
                await real.query('COMMIT')
                throw new Error('COMMIT acknowledgement lost')
              }
              if (text === 'ROLLBACK' && mode === 'rollback-fails') {
                throw new Error('ROLLBACK failed')
              }
              if (text === 'COMMIT' && mode === 'commit-fails-before') {
                throw new Error('COMMIT never reached the server')
              }
              if (
                mode === 'cleanup-fails' &&
                text.startsWith('SELECT set_config') &&
                params?.[1] === ''
              ) {
                cleared += 1
                throw new Error('tenant context cleanup failed')
              }
              return real.query(text, params as never)
            }) as PostgresPoolClient['query'],
            release: (error?: Error) => {
              releases.push(error)
              real.release(error)
            }
          }
          void cleared
          return client
        }
      }
    }

    it('AC04(b): COMMIT acknowledgement lost - the client is destroyed, an independent connection sees the commit, a retry on a new connection replays', async () => {
      const key = unique('ack-key')
      const releases: Array<Error | undefined> = []
      const lossy = new PostgresApiCreation(
        faultyPool('commit-ack-lost', releases)
      )
      await expect(
        lossy.createTaskWithAudit(taskCommand(key), tenantA)
      ).rejects.toThrow('acknowledgement lost')
      expect(releases).toHaveLength(1)
      expect(releases[0]).toBeInstanceOf(Error)
      const committed = await counts(tenantA, key)
      expect(committed.tasks).toBe(1)
      const retry = await port().createTaskWithAudit(taskCommand(key), tenantA)
      expect(retry.outcome).toBe('replayed')
      expect((await counts(tenantA, key)).tasks).toBe(1)
    })

    it('AC04(a): a COMMIT that never reached the server leaves nothing and the retry creates', async () => {
      const key = unique('nocommit-key')
      const releases: Array<Error | undefined> = []
      const lossy = new PostgresApiCreation(
        faultyPool('commit-fails-before', releases)
      )
      await expect(
        lossy.createTaskWithAudit(taskCommand(key), tenantA)
      ).rejects.toThrow('never reached')
      expect(releases).toHaveLength(1)
      expect((await counts(tenantA, key)).tasks).toBe(0)
      expect(
        (await port().createTaskWithAudit(taskCommand(key), tenantA)).outcome
      ).toBe('created')
    })

    it('AC11(e): a tenant-context cleanup failure destroys the client, releases exactly once and writes nothing', async () => {
      const key = unique('cleanup-key')
      const releases: Array<Error | undefined> = []
      const broken = new PostgresApiCreation(
        faultyPool('cleanup-fails', releases)
      )
      await expect(
        broken.createTaskWithAudit(taskCommand(key), tenantA)
      ).rejects.toThrow('cleanup failed')
      expect(releases).toHaveLength(1)
      expect(releases[0]).toBeInstanceOf(Error)
      expect((await counts(tenantA, key)).tasks).toBe(0)
    })

    it('AC11: the helper releases exactly once on success and never leaves a tenant context behind', async () => {
      let releases = 0
      const pool: PostgresPoolLike = {
        connect: async () => {
          const real = await runtimePool.connect()
          return {
            query: real.query.bind(real) as PostgresPoolClient['query'],
            release: (error?: Error) => {
              releases += 1
              real.release(error)
            }
          }
        }
      }
      await runCreationTransaction(
        pool,
        tenantA,
        '/v1/tasks',
        'a'.repeat(64),
        async (c) => {
          await c.query('SELECT 1')
        }
      )
      expect(releases).toBe(1)
      const probe = await runtimePool.query(
        `SELECT NULLIF(current_setting('cvg.tenant_id', true), '') AS tenant`
      )
      expect(probe.rows[0].tenant).toBeNull()
    })

    it('AC07: runtime role holds SELECT/INSERT only; UPDATE, DELETE and TRUNCATE are refused; RLS and FKs hold', async () => {
      const privileges = await runtimePool.query(
        `SELECT has_table_privilege(current_user, $1, 'SELECT') AS s,
              has_table_privilege(current_user, $1, 'INSERT') AS i,
              has_table_privilege(current_user, $1, 'UPDATE') AS u,
              has_table_privilege(current_user, $1, 'DELETE') AS d,
              has_table_privilege(current_user, $1, 'TRUNCATE') AS t,
              has_table_privilege(current_user, $1, 'REFERENCES') AS r`,
        [`${schema}.api_creation_receipts`]
      )
      expect(privileges.rows[0]).toEqual({
        s: true,
        i: true,
        u: false,
        d: false,
        t: false,
        r: false
      })
      const catalog = await admin.query(
        `SELECT c.relrowsecurity, c.relforcerowsecurity,
              (SELECT count(*)::int FROM pg_policy p WHERE p.polrelid = c.oid AND p.polname = 'api_creation_receipts_tenant_isolation') AS policies
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1 AND c.relname = 'api_creation_receipts'`,
        [schema]
      )
      expect(catalog.rows[0]).toEqual({
        relrowsecurity: true,
        relforcerowsecurity: true,
        policies: 1
      })
      await expect(
        withTenantContext(runtimePool, tenantA, (client) =>
          client.query(`UPDATE api_creation_receipts SET actor_id = 'x'`)
        )
      ).rejects.toThrow(/permission denied/)
      // Tenant B cannot see or write tenant A receipts.
      const visible = await withTenantContext(runtimePool, tenantB, (client) =>
        client.query(
          `SELECT count(*)::int AS n FROM api_creation_receipts WHERE tenant_id = $1`,
          [tenantA]
        )
      )
      expect(visible.rows[0]?.n).toBe(0)
      await expect(
        withTenantContext(runtimePool, tenantB, (client) =>
          client.query(
            `INSERT INTO api_creation_receipts
             (tenant_id, route, digest_version, key_digest, request_digest, actor_type, actor_id, session_id, task_source, task_id, audit_id, created_at)
           VALUES ($1, '/v1/tasks', 1, $2, $2, 'Operator', 'x', $3, 'console', 'task_x', 'audit_x', now())`,
            [tenantA, 'b'.repeat(64), sessions.a]
          )
        )
      ).rejects.toThrow(/row-level security|violates/)
      // The owner cannot rewrite history either (immutability trigger).
      await expect(
        admin.query(
          `UPDATE ${schema}.api_creation_receipts SET actor_id = actor_id`
        )
      ).rejects.toThrow(/immutable/)
    })

    it('AC07: CHECK constraints reject a wrong digest version, malformed digests and mixed resource shapes', async () => {
      const base = [
        tenantA,
        '/v1/tasks',
        1,
        'c'.repeat(64),
        'd'.repeat(64),
        'Operator',
        'x',
        sessions.a,
        'console',
        'task_none',
        'audit_none',
        NOW
      ]
      const insert = (overrides: Record<number, unknown>) => {
        const values: Array<string | number | Date | undefined> = [...base]
        for (const [index, value] of Object.entries(overrides))
          values[Number(index)] = value as string | number | Date
        return admin.query(
          `INSERT INTO ${schema}.api_creation_receipts
           (tenant_id, route, digest_version, key_digest, request_digest, actor_type, actor_id, session_id, task_source, task_id, audit_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          values
        )
      }
      await expect(insert({ 2: 2 })).rejects.toThrow(/digest_version_check/)
      await expect(insert({ 3: 'NOT-HEX' })).rejects.toThrow(/key_digest_check/)
      await expect(insert({ 4: 'short' })).rejects.toThrow(
        /request_digest_check/
      )
      await expect(insert({ 1: '/v1/other' })).rejects.toThrow(
        /violates check constraint/
      )
      await expect(insert({ 5: 'Stranger' })).rejects.toThrow(
        /actor_type_check/
      )
      // /v1/approvals route with a task id violates the resource shape check.
      await expect(insert({ 1: '/v1/approvals' })).rejects.toThrow(
        /resource_check/
      )
    })

    it('AC08: every created resource has exactly one creation audit event referenced by its receipt', async () => {
      const orphan = await admin.query(
        `SELECT count(*)::int AS n FROM ${schema}.api_creation_receipts r
        WHERE NOT EXISTS (SELECT 1 FROM ${schema}.audit_events a WHERE a.tenant_id = r.tenant_id AND a.id = r.audit_id)`
      )
      expect(orphan.rows[0].n).toBe(0)
      const duplicated = await admin.query(
        `SELECT count(*)::int AS n FROM (
         SELECT tenant_id, audit_id FROM ${schema}.api_creation_receipts
          GROUP BY 1, 2 HAVING count(*) > 1) d`
      )
      expect(duplicated.rows[0].n).toBe(0)
    })
  }
)
