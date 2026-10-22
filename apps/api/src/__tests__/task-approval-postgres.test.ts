/**
 * AUD0621 F15/F16/F23 on durable PostgreSQL (SPEC0250 P2/P4/P5).
 *
 * Runs through the production composition (`postgres-pool`, tenant context
 * per operation). Ad-hoc runs without TEST_DATABASE_URL skip (repo
 * convention); AUD0621_PG_REQUIRED=1 turns a missing database into a hard
 * failure.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  ensureCoreConversationRootInTransaction,
  runPostgresMigrations,
  TENANT_SCHEMA_TABLES,
  withTenantContext
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import { buildServer } from '../server.ts'
import type { RateLimiterPort } from '../rate-limit.ts'
import { grantCase } from './case-authorization-fixtures.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.AUD0621_PG_REQUIRED === '1' && !testDatabaseUrl) {
  throw new Error(
    'AUD0621_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to skip'
  )
}
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

const tenant = 'tenant_00000000-0000-4000-8000-000000000625' as TenantId
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000626' as TenantId
// P5 counts rows, so it owns a tenant that the other cases never write to.
const pageTenant = 'tenant_00000000-0000-4000-8000-000000000631' as TenantId
const unlimited: RateLimiterPort = {
  check: () => ({ allowed: true, retryAfterSeconds: 0 })
}

function headers(role: string, tenantId: TenantId = tenant) {
  return {
    'x-operator-id': `${role.toLowerCase()}.aud0621.pg`,
    'x-operator-role': role,
    'x-tenant-id': tenantId
  }
}

interface PageInfo {
  limit: number
  offset: number
  total: number
  hasNextPage: boolean
}

describeWithPostgres('AUD0621 tasks and approvals over PostgreSQL', () => {
  const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
  const schema = `cvg_aud0621_tasks_${suffix}`
  // The API runs as a least-privilege runtime role (no superuser, no RLS
  // bypass) with the grants of scripts/migrate-job.mjs, so FOR UPDATE, the
  // CAS update and the audit insert are all exercised under RLS.
  const runtimeRole = `cvg_aud0621_rt_${suffix}`
  const runtimePassword = `aud0621-${randomBytes(12).toString('hex')}`
  let admin: Client
  let pool: Pool
  let runtimePool: Pool

  beforeAll(async () => {
    admin = new Client({ connectionString: testDatabaseUrl })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: schema })
    pool = new Pool({
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
        `GRANT SELECT, INSERT, UPDATE ON ${schema}."${table}" TO ${runtimeRole}`
      )
    }
    const runtimeUrl = new URL(testDatabaseUrl as string)
    runtimeUrl.username = runtimeRole
    runtimeUrl.password = runtimePassword
    runtimePool = new Pool({
      connectionString: runtimeUrl.toString(),
      max: 6,
      options: `-c search_path=${schema}`
    })
    const probe = await runtimePool.query<{
      rolsuper: boolean
      rolbypassrls: boolean
    }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    )
    expect(probe.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
  })

  afterAll(async () => {
    await runtimePool?.end().catch(() => undefined)
    await pool?.end().catch(() => undefined)
    await admin
      ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin
      ?.query(`DROP ROLE IF EXISTS ${runtimeRole}`)
      .catch(() => undefined)
    await admin?.end().catch(() => undefined)
  })

  function app() {
    return buildServer({
      persistence: { kind: 'postgres-pool', pool: runtimePool },
      rateLimiter: unlimited
    })
  }

  async function seedSession(tenantId: TenantId, label: string) {
    const conversationId = `conv_${randomUUID()}`
    const sessionId = `sess_${randomUUID()}`
    await withTenantContext(pool, tenantId, async (client) => {
      await client.query(
        `INSERT INTO conversations
           (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
         VALUES ($1, $2, 'web', $3, $4, 'active', $5, $6, $6)`,
        [
          tenantId,
          conversationId,
          `aud0621-${label}`,
          'e'.repeat(64),
          `corr_${randomUUID()}`,
          new Date()
        ]
      )
      await client.query(
        `INSERT INTO sessions
           (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
         VALUES ($1, $2, $3, 'active', 'BOT_ACTIVE', $4, $4)`,
        [tenantId, sessionId, conversationId, new Date()]
      )
      // SPEC0251 (§6 adjustment a, R3-M1/R4-O3): the conversation is seeded
      // directly, so its core case root is created in the same seed before
      // any grant.
      await ensureCoreConversationRootInTransaction(
        client,
        tenantId,
        conversationId,
        new Date()
      )
    })
    return { sessionId, conversationId }
  }

  /**
   * SPEC0251 (§6 adjustment a): Operator/Approver act only on assigned
   * cases. The principal is provisioned on its first grant in the tenant and
   * reused afterwards (`provision: false`, R4-O3).
   */
  async function grantRole(
    server: ReturnType<typeof app>,
    conversationId: string,
    role: 'Operator' | 'Approver',
    tenantId: TenantId = tenant
  ) {
    const operatorId = headers(role, tenantId)['x-operator-id']
    const existing = await server.caseAuthority.readSnapshot(
      tenantId,
      (snapshot) => snapshot.principal(operatorId)
    )
    await grantCase(server, {
      kind: 'core_conversation',
      resourceId: conversationId,
      operatorId,
      role,
      tenantId,
      provision: existing === null
    })
  }

  async function createTask(
    server: ReturnType<typeof app>,
    sessionId: string,
    key: string,
    tenantId: TenantId = tenant
  ): Promise<string> {
    const created = await server.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { 'x-tenant-id': tenantId },
      payload: {
        sessionId,
        title: `Synthetic task ${key}`,
        description: 'Synthetic AUD0621 PostgreSQL task',
        priority: 'medium',
        source: 'aud0621-pg',
        idempotencyKey: key
      }
    })
    expect(created.statusCode).toBe(200)
    return created.json().data.id as string
  }

  async function taskStatus(taskId: string): Promise<string> {
    const result = await admin.query<{ status: string }>(
      `SELECT status FROM ${schema}.tasks WHERE id = $1`,
      [taskId]
    )
    return result.rows[0]!.status
  }

  async function statusEvents(taskId: string) {
    const result = await admin.query<{
      actor_id: string
      payload: { fromStatus: string; toStatus: string; tenantId: string }
    }>(
      `SELECT actor_id, payload FROM ${schema}.audit_events
       WHERE payload->>'taskId' = $1
         AND payload->>'effect' = 'internal_task_state_only'
       ORDER BY created_at ASC`,
      [taskId]
    )
    return result.rows
  }

  async function waitForLockWaiters(expected: number): Promise<void> {
    const deadline = Date.now() + 15_000
    for (;;) {
      const result = await admin.query<{ waiting: number }>(
        `SELECT COUNT(*)::integer AS waiting FROM pg_stat_activity
         WHERE datname = current_database() AND wait_event_type = 'Lock'`
      )
      if (result.rows[0]!.waiting >= expected) return
      if (Date.now() > deadline) {
        throw new Error(
          `expected ${expected} lock waiters, saw ${result.rows[0]!.waiting}`
        )
      }
      await new Promise((resolve) => setTimeout(resolve, 25))
    }
  }

  it('P2: concurrent terminal transitions keep one winner and one audit event', async () => {
    const server = app()
    const holder = new Client({
      connectionString: testDatabaseUrl,
      options: `-c search_path=${schema}`
    })
    await holder.connect()
    try {
      const { sessionId, conversationId } = await seedSession(tenant, 'race')
      await grantRole(server, conversationId, 'Operator')
      const taskId = await createTask(server, sessionId, `race-${randomUUID()}`)
      await holder.query('BEGIN')
      await holder.query('SELECT id FROM tasks WHERE id = $1 FOR UPDATE', [
        taskId
      ])
      const pending = Promise.all(
        ['done', 'canceled'].map((status) =>
          server.inject({
            method: 'PATCH',
            url: `/v1/tasks/${taskId}/status`,
            headers: headers('Operator'),
            payload: { status }
          })
        )
      )
      await waitForLockWaiters(2)
      await holder.query('COMMIT')
      const responses = await pending

      const codes = responses.map((response) => response.statusCode)
      expect(codes.filter((code) => code === 200)).toHaveLength(1)
      const loser = responses.find((response) => response.statusCode !== 200)!
      expect([400, 409]).toContain(loser.statusCode)
      expect(['invalid_action', 'conflict']).toContain(loser.json().error.code)
      const winner = responses.find((response) => response.statusCode === 200)!
      const winnerStatus = winner.json().data.status as string
      expect(await taskStatus(taskId)).toBe(winnerStatus)
      const events = await statusEvents(taskId)
      expect(events).toHaveLength(1)
      expect(events[0]!.payload).toMatchObject({
        fromStatus: 'open',
        toStatus: winnerStatus,
        tenantId: tenant
      })
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined)
      await holder.end().catch(() => undefined)
      await server.close()
    }
  })

  it('P4: an audit insert failure rolls the task transition back', async () => {
    const server = app()
    const fn = `${schema}.aud0621_fail_task_audit`
    try {
      const { sessionId, conversationId } = await seedSession(
        tenant,
        'audit-fault'
      )
      await grantRole(server, conversationId, 'Operator')
      const taskId = await createTask(
        server,
        sessionId,
        `fault-${randomUUID()}`
      )
      await admin.query(`
        CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.payload->>'effect' = 'internal_task_state_only' THEN
            RAISE EXCEPTION 'synthetic task audit failure';
          END IF;
          RETURN NEW;
        END;
        $$`)
      await admin.query(
        `CREATE TRIGGER aud0621_fail_task_audit BEFORE INSERT ON ${schema}.audit_events
         FOR EACH ROW EXECUTE FUNCTION ${fn}()`
      )
      const failed = await server.inject({
        method: 'PATCH',
        url: `/v1/tasks/${taskId}/status`,
        headers: headers('Operator'),
        payload: { status: 'done' }
      })
      expect(failed.statusCode).toBe(500)
      expect(await taskStatus(taskId)).toBe('open')
      expect(await statusEvents(taskId)).toEqual([])

      await admin.query(
        `DROP TRIGGER aud0621_fail_task_audit ON ${schema}.audit_events`
      )
      await admin.query(`DROP FUNCTION ${fn}()`)
      const retried = await server.inject({
        method: 'PATCH',
        url: `/v1/tasks/${taskId}/status`,
        headers: headers('Operator'),
        payload: { status: 'done' }
      })
      expect(retried.statusCode).toBe(200)
      expect(await taskStatus(taskId)).toBe('done')
      const events = await statusEvents(taskId)
      expect(events).toHaveLength(1)
      expect(events[0]).toMatchObject({
        actor_id: 'operator.aud0621.pg',
        payload: { fromStatus: 'open', toStatus: 'done' }
      })
    } finally {
      await admin
        .query(
          `DROP TRIGGER IF EXISTS aud0621_fail_task_audit ON ${schema}.audit_events`
        )
        .catch(() => undefined)
      await admin
        .query(`DROP FUNCTION IF EXISTS ${fn}()`)
        .catch(() => undefined)
      await server.close()
    }
  })

  it('P5: pages 101 tasks and approvals with one-snapshot metadata and filters', async () => {
    const server = app()
    try {
      const { sessionId, conversationId } = await seedSession(
        pageTenant,
        'pages'
      )
      await grantRole(server, conversationId, 'Operator', pageTenant)
      await grantRole(server, conversationId, 'Approver', pageTenant)
      const { sessionId: otherSession } = await seedSession(
        otherTenant,
        'pages-other'
      )
      const taskIds: string[] = []
      for (let index = 0; index < 101; index += 1) {
        taskIds.push(
          await createTask(
            server,
            sessionId,
            `aud0621-page-${index}`,
            pageTenant
          )
        )
      }
      const otherTask = await createTask(
        server,
        otherSession,
        'aud0621-page-other',
        otherTenant
      )
      const crossTenant = await server.inject({
        method: 'PATCH',
        url: `/v1/tasks/${otherTask}/status`,
        headers: headers('Operator', pageTenant),
        payload: { status: 'done' }
      })
      // SPEC0251 I3: another tenant's task is the static 404 (was 400).
      expect(crossTenant.statusCode).toBe(404)
      expect(crossTenant.json().error).toEqual({
        code: 'not_found',
        message: 'Resource not found'
      })
      expect(await taskStatus(otherTask)).toBe('open')
      expect(await statusEvents(otherTask)).toEqual([])
      const approvalIds: string[] = []
      for (let index = 0; index < 101; index += 1) {
        const created = await server.inject({
          method: 'POST',
          url: '/v1/approvals',
          headers: { 'x-tenant-id': pageTenant },
          payload: {
            sessionId,
            proposedAction: 'synthetic_review',
            summary: `Synthetic approval ${index}`,
            riskLevel: 'low'
          }
        })
        expect(created.statusCode).toBe(200)
        approvalIds.push(created.json().data.id as string)
      }
      for (const [index, id] of approvalIds.slice(0, 51).entries()) {
        const decided = await server.inject({
          method: 'POST',
          url: `/v1/approvals/${id}/decision`,
          headers: headers('Approver', pageTenant),
          payload: { decision: index % 2 === 0 ? 'approved' : 'rejected' }
        })
        expect(decided.statusCode).toBe(200)
      }
      for (const id of taskIds.slice(0, 10)) {
        const done = await server.inject({
          method: 'PATCH',
          url: `/v1/tasks/${id}/status`,
          headers: headers('Operator', pageTenant),
          payload: { status: 'done' }
        })
        expect(done.statusCode).toBe(200)
      }

      const get = async (url: string) => {
        const response = await server.inject({
          method: 'GET',
          url,
          headers: headers('Supervisor', pageTenant)
        })
        return {
          status: response.statusCode,
          body: response.json() as {
            data: Array<{ id: string; status: string }> | null
            error: { code: string } | null
            meta: { pageInfo?: PageInfo }
          }
        }
      }

      // created_at has millisecond resolution; ties are ordered by id, so
      // the page order is compared with itself and the set with the inserts.
      const pages = await Promise.all(
        [0, 50, 100].map((offset) => get(`/v1/tasks?limit=50&offset=${offset}`))
      )
      const ordered = pages.flatMap((page) => page.body.data!.map((t) => t.id))
      expect(new Set(ordered).size).toBe(101)
      expect([...ordered].sort()).toEqual([...taskIds].sort())
      const last = await get('/v1/tasks?limit=1&offset=100')
      expect(last.status).toBe(200)
      expect(last.body.data?.map((task) => task.id)).toEqual([ordered[100]])
      expect(last.body.meta.pageInfo).toEqual({
        limit: 1,
        offset: 100,
        total: 101,
        hasNextPage: false
      })
      const first = await get('/v1/tasks')
      expect(first.body.data).toHaveLength(25)
      expect(first.body.meta.pageInfo).toEqual({
        limit: 25,
        offset: 0,
        total: 101,
        hasNextPage: true
      })
      const beyond = await get('/v1/tasks?limit=10&offset=500')
      expect(beyond.body.data).toEqual([])
      expect(beyond.body.meta.pageInfo).toEqual({
        limit: 10,
        offset: 500,
        total: 101,
        hasNextPage: false
      })
      const active = await get('/v1/tasks?status=open,in_progress&limit=100')
      expect(active.body.meta.pageInfo?.total).toBe(91)
      expect(active.body.data).toHaveLength(91)
      expect(active.body.data!.every((t) => t.status === 'open')).toBe(true)

      const queue = await get('/v1/approvals?status=pending&limit=100')
      expect(queue.body.data).toHaveLength(50)
      expect(queue.body.data!.every((a) => a.status === 'pending')).toBe(true)
      expect(queue.body.meta.pageInfo?.total).toBe(50)
      const decided = await get('/v1/approvals?status=approved,rejected')
      expect(decided.body.meta.pageInfo?.total).toBe(51)
      const approvalHead = await get('/v1/approvals?limit=100')
      const approvalTail = await get('/v1/approvals?limit=1&offset=100')
      const tailIds = approvalTail.body.data!.map((a) => a.id)
      expect(tailIds).toHaveLength(1)
      expect(approvalIds).toContain(tailIds[0])
      expect(approvalHead.body.data!.map((a) => a.id)).not.toContain(tailIds[0])
      expect(approvalTail.body.meta.pageInfo?.total).toBe(101)

      expect((await get('/v1/tasks?limit=101')).status).toBe(400)
      expect((await get('/v1/approvals?status=open')).status).toBe(400)
    } finally {
      await server.close()
    }
  })
})
