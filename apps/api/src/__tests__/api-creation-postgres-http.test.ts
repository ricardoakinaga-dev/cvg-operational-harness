/**
 * SPEC 0257 R2 F07 control over HTTP on PostgreSQL (production composition,
 * least-privilege runtime role). A failure injected into the audit insert
 * leaves 0 resources and 0 events, and the retry with the same key converges.
 * Ad-hoc runs without TEST_DATABASE_URL skip; API_CREATION_PG_REQUIRED=1 makes
 * a missing database a failure.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  runPostgresMigrations,
  tenantRuntimeGrantPrivileges,
  TENANT_SCHEMA_TABLES,
  withTenantContext
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import { buildServer } from '../server.ts'
import type { RateLimiterPort } from '../rate-limit.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
if (process.env.API_CREATION_PG_REQUIRED === '1' && !testDatabaseUrl) {
  throw new Error(
    'API_CREATION_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to skip'
  )
}
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip
const tenant = 'tenant_00000000-0000-4000-8000-0000000025f7' as TenantId
const unlimited: RateLimiterPort = {
  check: () => ({ allowed: true, retryAfterSeconds: 0 })
}

describeWithPostgres(
  'SPEC 0257 HTTP creation over PostgreSQL',
  { timeout: 180_000 },
  () => {
    const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
    const schema = `cvg_api_creation_http_${suffix}`
    const runtimeRole = `cvg_api_creation_http_rt_${suffix}`
    const runtimePassword = `pw-${randomBytes(12).toString('hex')}`
    let admin: Client
    let ownerPool: Pool
    let runtimePool: Pool
    let sessionId = ''

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
      const conversationId = `conv_${randomUUID()}`
      sessionId = `sess_${randomUUID()}`
      await withTenantContext(ownerPool, tenant, async (client) => {
        await client.query(
          `INSERT INTO conversations
             (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
           VALUES ($1, $2, 'web', 'http', $3, 'active', $4, now(), now())`,
          [tenant, conversationId, 'e'.repeat(64), `corr_${randomUUID()}`]
        )
        await client.query(
          `INSERT INTO sessions
             (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
           VALUES ($1, $2, $3, 'active', 'BOT_ACTIVE', now(), now())`,
          [tenant, sessionId, conversationId]
        )
      })
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

    const server = () =>
      buildServer({
        persistence: { kind: 'postgres-pool', pool: runtimePool },
        rateLimiter: unlimited
      })

    const counts = async () => {
      const read = async (sql: string) =>
        (await admin.query(sql, [tenant])).rows[0].n as number
      return {
        approvals: await read(
          `SELECT count(*)::int AS n FROM ${schema}.approval_requests WHERE tenant_id = $1`
        ),
        receipts: await read(
          `SELECT count(*)::int AS n FROM ${schema}.api_creation_receipts WHERE tenant_id = $1 AND route = '/v1/approvals'`
        ),
        events: await read(
          `SELECT count(*)::int AS n FROM ${schema}.audit_events WHERE tenant_id = $1 AND type = 'approval_decision'`
        )
      }
    }

    const post = (
      app: ReturnType<typeof buildServer>,
      key: string,
      summary = 'Resumo sintetico'
    ) =>
      app.inject({
        method: 'POST',
        url: '/v1/approvals',
        headers: { 'x-tenant-id': tenant, 'idempotency-key': key },
        payload: {
          sessionId,
          proposedAction: 'handoff_to_operator',
          summary,
          riskLevel: 'high'
        }
      })

    it('F07 control: an audit failure leaves 0 approvals, 0 receipts and 0 events (500); the retry converges (200) and the replay returns the same id', async () => {
      const app = server()
      const before = await counts()
      const fn = `reject_${randomBytes(4).toString('hex')}`
      await admin.query(`
        CREATE FUNCTION ${schema}.${fn}() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'injected audit failure'; END $$`)
      await admin.query(
        `CREATE TRIGGER ${fn} BEFORE INSERT ON ${schema}.audit_events
           FOR EACH ROW WHEN (NEW.type = 'approval_decision')
           EXECUTE FUNCTION ${schema}.${fn}()`
      )
      const key = 'approval-http-pg-key-0001'
      try {
        const failed = await post(app, key)
        expect(failed.statusCode).toBe(500)
        expect(JSON.stringify(failed.json())).not.toContain('injected')
      } finally {
        await admin.query(`DROP TRIGGER ${fn} ON ${schema}.audit_events`)
        await admin.query(`DROP FUNCTION ${schema}.${fn}()`)
      }
      expect(await counts()).toEqual(before)
      const retry = await post(app, key)
      expect(retry.statusCode).toBe(200)
      const id = retry.json().data.id as string
      expect(await counts()).toEqual({
        approvals: before.approvals + 1,
        receipts: before.receipts + 1,
        events: before.events + 1
      })
      const replay = await post(app, key)
      expect(replay.statusCode).toBe(200)
      expect(replay.json().data.id).toBe(id)
      expect(replay.headers['cache-control']).toBe('no-store')
      expect(await counts()).toEqual({
        approvals: before.approvals + 1,
        receipts: before.receipts + 1,
        events: before.events + 1
      })
      const changed = await post(app, key, 'Outro resumo')
      expect(changed.statusCode).toBe(409)
      expect(await counts()).toEqual({
        approvals: before.approvals + 1,
        receipts: before.receipts + 1,
        events: before.events + 1
      })
    })

    it('a retry after a lost response is a replay on a fresh server instance (durable receipt)', async () => {
      const key = 'approval-http-pg-key-0002'
      const first = await post(server(), key)
      expect(first.statusCode).toBe(200)
      const second = await post(server(), key)
      expect(second.statusCode).toBe(200)
      expect(second.json().data.id).toBe(first.json().data.id)
    })
  }
)
