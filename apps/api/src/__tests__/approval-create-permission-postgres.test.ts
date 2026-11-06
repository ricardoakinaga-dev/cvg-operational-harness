/**
 * SPEC 0317 G5 over PostgreSQL, under a NOSUPERUSER NOBYPASSRLS runtime role:
 * POST /v1/approvals requires `approval:create`; a denial writes no resource,
 * creation audit or receipt, and a revocation racing a creation stays atomic.
 * Synthetic data only.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention).
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { Client, Pool } from 'pg'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi
} from 'vitest'
import {
  runPostgresMigrations,
  tenantRuntimeGrantPrivileges,
  TENANT_SCHEMA_TABLES
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import { buildServer } from '../server.ts'
import type { RateLimiterPort } from '../rate-limit.ts'
import {
  findCaseId,
  grantCase,
  managerHeaders,
  putAssignment
} from './case-authorization-fixtures.ts'

const injected = vi.hoisted(() => ({
  matrix: null as Record<string, readonly string[]> | null
}))

vi.mock('@cvg/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@cvg/shared')>()
  return {
    ...actual,
    roleHasPermission: (role: string, permission: string) => {
      const permissions = injected.matrix?.[role]
      return permissions
        ? permissions.includes(permission)
        : actual.roleHasPermission(role as never, permission)
    }
  }
})

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip
const tenant = 'tenant_00000000-0000-4000-8000-000000000e21' as TenantId
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000e22' as TenantId
const unlimited: RateLimiterPort = {
  check: () => ({ allowed: true, retryAfterSeconds: 0 })
}

const as = (
  operatorId: string,
  role = 'Operator',
  tenantId: string = tenant
) => ({
  'x-operator-id': operatorId,
  'x-operator-role': role,
  'x-tenant-id': tenantId
})

describeWithPostgres('SPEC 0317 G5 — approval:create (HTTP, PG)', () => {
  const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
  const schema = `cvg_g5_${suffix}`
  const runtimeRole = `cvg_g5_rt_${suffix}`
  const runtimePassword = `pw-${randomBytes(12).toString('hex')}`
  let admin: Client
  let runtimePool: Pool
  let app: ReturnType<typeof buildServer>
  let conversationId = ''
  let sessionId = ''

  beforeAll(async () => {
    admin = new Client({ connectionString: testDatabaseUrl as string })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: schema })
    await admin.query(
      `CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE`
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${runtimeRole}`)
    for (const table of TENANT_SCHEMA_TABLES) {
      await admin.query(
        `GRANT ${tenantRuntimeGrantPrivileges(table)} ON ${schema}."${table}" TO ${runtimeRole}`
      )
    }
    await admin.query(
      `GRANT SELECT ON ${schema}.schema_migrations TO ${runtimeRole}`
    )
    const url = new URL(testDatabaseUrl as string)
    url.username = runtimeRole
    url.password = runtimePassword
    runtimePool = new Pool({
      connectionString: url.toString(),
      max: 6,
      options: `-c search_path=${schema}`
    })
    app = buildServer({
      persistence: { kind: 'postgres-pool', pool: runtimePool as never },
      rateLimiter: unlimited,
      requireAuthenticatedMutations: true
    })
    const inbound = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      headers: { 'x-tenant-id': tenant },
      payload: {
        externalMessageId: `g5-pg-${randomUUID()}`,
        senderRef: `+55119${Math.floor(Math.random() * 10_000_000)}`,
        body: 'Mensagem sintetica',
        receivedAt: '2026-11-06T12:00:00.000Z'
      }
    })
    expect(inbound.statusCode).toBe(200)
    conversationId = inbound.json().data.conversationId as string
    sessionId = inbound.json().data.sessionId as string
    await grantCase(app, {
      kind: 'core_conversation',
      resourceId: conversationId,
      operatorId: 'operator.g5',
      tenantId: tenant
    })
  }, 180_000)

  afterEach(() => {
    injected.matrix = null
  })

  afterAll(async () => {
    await app?.close()
    await runtimePool?.end().catch(() => undefined)
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await admin?.query(`DROP ROLE IF EXISTS ${runtimeRole}`)
    await admin?.end().catch(() => undefined)
  })

  function create(
    headers: Record<string, string>,
    options: { key?: string; proposedAction?: string } = {}
  ) {
    return app.inject({
      method: 'POST',
      url: '/v1/approvals',
      headers: {
        ...headers,
        'idempotency-key': options.key ?? `g5-${randomUUID()}`
      },
      payload: {
        sessionId,
        proposedAction: options.proposedAction ?? 'handoff_to_operator',
        summary: 'Resumo sintetico',
        riskLevel: 'high'
      }
    })
  }

  async function counts() {
    const row = await admin.query<{
      approvals: number
      receipts: number
      audits: number
    }>(
      `SELECT
         (SELECT count(*)::int FROM ${schema}.approval_requests) AS approvals,
         (SELECT count(*)::int FROM ${schema}.api_creation_receipts
           WHERE route = '/v1/approvals') AS receipts,
         (SELECT count(*)::int FROM ${schema}.audit_events
           WHERE type = 'approval_decision'
             AND payload->>'approvalRequestId' IS NOT NULL
             AND payload->>'status' = 'pending') AS audits`
    )
    return row.rows[0]
  }

  it('Admin and a view-only identity write nothing; both still read', async () => {
    const before = await counts()
    expect((await create(as('admin.g5', 'Admin'))).statusCode).toBe(403)
    injected.matrix = { Operator: ['approval:view'] }
    expect((await create(as('operator.g5'))).statusCode).toBe(403)
    expect(await counts()).toEqual(before)
    for (const headers of [as('admin.g5', 'Admin'), as('operator.g5')]) {
      const listed = await app.inject({
        method: 'GET',
        url: '/v1/approvals',
        headers
      })
      expect(listed.statusCode).toBe(200)
    }
  })

  it('no grant and another tenant write nothing', async () => {
    const before = await counts()
    expect((await create(as('operator.nogrant'))).statusCode).toBe(404)
    expect(
      (await create(as('operator.g5', 'Operator', otherTenant))).statusCode
    ).toBe(404)
    expect(await counts()).toEqual(before)
  })

  it('Operator creates once, atomically; a replay converges', async () => {
    const before = await counts()
    const key = `g5-pg-replay-${randomUUID()}`
    const first = await create(as('operator.g5'), { key })
    expect(first.statusCode).toBe(200)
    const replay = await create(as('operator.g5'), { key })
    expect(replay.statusCode).toBe(200)
    expect(replay.json().data.id).toBe(first.json().data.id)
    const after = await counts()
    expect(after?.approvals).toBe((before?.approvals ?? 0) + 1)
    expect(after?.receipts).toBe((before?.receipts ?? 0) + 1)
    expect(after?.audits).toBe((before?.audits ?? 0) + 1)
  })

  it('create without decide decides nothing; an export review needs audit:view_full', async () => {
    injected.matrix = { Operator: ['approval:create', 'approval:view'] }
    const created = await create(as('operator.g5'))
    expect(created.statusCode).toBe(200)
    const denied = await app.inject({
      method: 'POST',
      url: `/v1/approvals/${created.json().data.id}/decision`,
      headers: as('operator.g5'),
      payload: { decision: 'approved' }
    })
    expect(denied.statusCode).toBe(403)
    const stored = await admin.query(
      `SELECT status, decided_by FROM ${schema}.approval_requests WHERE id = $1`,
      [created.json().data.id]
    )
    expect(stored.rows[0]).toEqual({ status: 'pending', decided_by: null })

    const before = await counts()
    const review = await create(as('operator.g5'), {
      proposedAction: 'audit_evidence_export_review'
    })
    expect(review.statusCode).toBe(403)
    expect(await counts()).toEqual(before)
  })

  it('a revocation racing a creation leaves all of it or none of it', async () => {
    const operatorId = 'operator.g5.race'
    const caseId = await grantCase(app, {
      kind: 'core_conversation',
      resourceId: conversationId,
      operatorId,
      tenantId: tenant
    })
    expect(caseId).toBe(
      await findCaseId(
        app,
        'core_conversation',
        conversationId,
        managerHeaders('supervisor.case-manager', tenant)
      )
    )
    const before = await counts()
    const [created, revoked] = await Promise.all([
      create(as(operatorId)),
      putAssignment(
        app,
        caseId,
        operatorId,
        { status: 'REVOKED', expectedRevision: 1 },
        managerHeaders('supervisor.case-manager', tenant)
      )
    ])
    expect(revoked.statusCode).toBe(200)
    expect([200, 404]).toContain(created.statusCode)
    const delta = created.statusCode === 200 ? 1 : 0
    const after = await counts()
    expect(after?.approvals).toBe((before?.approvals ?? 0) + delta)
    expect(after?.receipts).toBe((before?.receipts ?? 0) + delta)
    expect(after?.audits).toBe((before?.audits ?? 0) + delta)
    // After the revocation commits, the creation is always denied.
    expect((await create(as(operatorId))).statusCode).toBe(404)
  })
})
