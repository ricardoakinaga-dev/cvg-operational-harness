/**
 * SPEC0251 — PostgreSQL parity of the case scope of tasks and approvals.
 *
 * - S2: lists under a NOSUPERUSER NOBYPASSRLS runtime role with the
 *   migrate-job grants: the S1 matrix, statements per request, EXPLAIN of
 *   the scoped page and DTO parity with the tenant-wide `listTaskPage` /
 *   `listApprovalPage` (R4-O7).
 * - S3/S5: snapshot lookups filtered by the snapshot tenant, also on a
 *   connection that ignores RLS (R4-O5), and the six mutations with
 *   `requireAuthenticatedMutations: true`.
 * - S6: legacy single-connection schemas without 0029 — approval creation by
 *   the Supervisor only on 0000; lists, decisions and the runtime approval on
 *   0000–0027, the last runtime migration before 0029 (0028 is an opt-in
 *   dedicated schema) (R4-O1/R4-O2).
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); a required
 * gate sets CASE0251_PG_REQUIRED=1 (or AUD0621_PG_REQUIRED=1) and a missing
 * database fails instead.
 */
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PostgresCaseAuthority,
  PostgresRuntimeRepository,
  TENANT_SCHEMA_TABLES,
  tenantRuntimeGrantPrivileges,
  runInitialPostgresMigration,
  runPostgresMigrations,
  withTenantContext
} from '@cvg/persistence'
import type { TenantId } from '@cvg/platform'
import { buildServer } from '../server.ts'
import type { RateLimiterPort } from '../rate-limit.ts'
import {
  grantCase,
  provisionPrincipal,
  putAssignment
} from './case-authorization-fixtures.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired =
  process.env.CASE0251_PG_REQUIRED === '1' ||
  process.env.AUD0621_PG_REQUIRED === '1'
if (pgRequired && !testDatabaseUrl) {
  throw new Error(
    'CASE0251_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to skip'
  )
}
const describePg = testDatabaseUrl ? describe : describe.skip

const NOT_FOUND = { code: 'not_found', message: 'Resource not found' }
const unlimited: RateLimiterPort = {
  check: () => ({ allowed: true, retryAfterSeconds: 0 })
}
const evidenceDir = process.env.CASE0251_EVIDENCE_DIR

type Role = 'Operator' | 'Approver' | 'Supervisor' | 'Admin'
type App = ReturnType<typeof buildServer>
type Response = Awaited<ReturnType<App['inject']>>

function tenant(suffix: string): TenantId {
  return `tenant_00000000-0000-4000-8000-${suffix.padStart(12, '0')}` as TenantId
}

function as(
  operatorId: string,
  role: Role,
  tenantId: TenantId
): Record<string, string> {
  return {
    'x-operator-id': operatorId,
    'x-operator-role': role,
    'x-tenant-id': tenantId
  }
}

function headersFor(tenantId: TenantId) {
  return {
    operatorA: as('operator.a', 'Operator', tenantId),
    operatorB: as('operator.b', 'Operator', tenantId),
    approverA: as('approver.a', 'Approver', tenantId),
    approverB: as('approver.b', 'Approver', tenantId),
    supervisor: as('supervisor.scope', 'Supervisor', tenantId),
    admin: as('admin.scope', 'Admin', tenantId)
  }
}

function record(name: string, value: unknown): void {
  if (!evidenceDir) return
  mkdirSync(evidenceDir, { recursive: true })
  writeFileSync(
    path.join(evidenceDir, name),
    `${JSON.stringify(value, null, 2)}\n`
  )
}

function withoutCorrelation(response: Response) {
  const body = response.json() as { meta?: Record<string, unknown> }
  const meta = Object.fromEntries(
    Object.entries(body.meta ?? {}).filter(([key]) => key !== 'correlationId')
  )
  return { ...body, meta }
}

function taskPayload(sessionId: string, key = randomUUID()) {
  return {
    sessionId,
    title: 'Synthetic SPEC0251 PostgreSQL task',
    description: 'Synthetic only, no external effect',
    priority: 'medium',
    source: 'spec0251-pg',
    idempotencyKey: `spec0251-pg-${key}`
  }
}

function journeyPayload(sessionId: string, key = randomUUID()) {
  return {
    sessionId,
    title: 'Synthetic SPEC0251 PostgreSQL journey task',
    description: 'Synthetic only, no external effect',
    priority: 'medium',
    idempotencyKey: `spec0251-pg-journey-${key}`
  }
}

function approvalPayload(sessionId: string) {
  return {
    sessionId,
    proposedAction: 'synthetic_review',
    summary: 'Synthetic SPEC0251 PostgreSQL approval',
    riskLevel: 'low'
  }
}

function runtime(
  tenantId: TenantId,
  conversationId: string,
  sessionId: string
) {
  return {
    agent: {
      id: 'agent.case.scope.pg',
      version: 'v1',
      objective: 'synthetic SPEC0251',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId,
    conversationId,
    sessionId,
    correlationId: 'correlation_case_scope_pg',
    traceId: 'trace_case_scope_pg',
    userMessage: 'synthetic',
    context: {
      values: {},
      sourceIds: ['synthetic'],
      capturedAt: '2026-10-21T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-10-21T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 1,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 1_000
    }
  }
}

interface WaitingExecution {
  executionId: string
  approvalId: string
}

/** Moves an accepted execution to WAITING_APPROVAL through the app stores. */
async function toWaitingApproval(
  server: App,
  tenantId: TenantId,
  executionId: string
): Promise<WaitingExecution> {
  const store = server.operationalExecution
  const claimed = await store.claimNext(tenantId, 'worker-spec0251-pg')
  expect(claimed?.record.id).toBe(executionId)
  const running = await store.transition({
    tenantId,
    executionId,
    to: 'RUNNING',
    workerId: 'worker-spec0251-pg',
    fenceToken: claimed!.record.attempt
  })
  const requested = await server.operationalApprovalAuthority.request({
    tenantId,
    operatorId: 'agent.case.scope.pg',
    agentId: 'agent.case.scope.pg',
    agentVersion: 'v1',
    action: 'tool.execute',
    resource: { type: 'tool', id: 'synthetic.case.scope.pg.tool' },
    payload: { synthetic: true },
    policyVersion: 'policy-approval-v1',
    correlationId: 'correlation_case_scope_pg',
    operationKey: `operation.spec0251.pg.${randomUUID()}`,
    executionRef: executionId,
    singleUse: true,
    reason: 'synthetic SPEC0251 approval',
    proposalPayload: { synthetic: true }
  })
  await store.transition({
    tenantId,
    executionId,
    to: 'WAITING_APPROVAL',
    workerId: 'worker-spec0251-pg',
    fenceToken: running.attempt,
    approvalId: requested.approvalId,
    reason: 'synthetic approval required'
  })
  return { executionId, approvalId: requested.approvalId }
}

/** Execution created directly in the store: no case link at all. */
async function unlinkedWaitingExecution(
  server: App,
  tenantId: TenantId
): Promise<WaitingExecution> {
  const accepted = await server.operationalExecution.submit({
    tenantId,
    idempotencyKey: `spec0251-pg-exec-${randomUUID()}`,
    runtime: runtime(
      tenantId,
      `conv_none_${randomUUID()}`,
      'sess_none'
    ) as never
  })
  return toWaitingApproval(server, tenantId, accepted.record.id)
}

function decideRuntime(
  server: App,
  execution: WaitingExecution,
  headers: Record<string, string>,
  decision: 'approved' | 'rejected' = 'approved'
) {
  return server.inject({
    method: 'POST',
    url: `/v1/executions/${execution.executionId}/approvals/${execution.approvalId}/decision`,
    headers: { ...headers, 'idempotency-key': `spec0251-pg-${randomUUID()}` },
    payload: { decision }
  })
}

function post(
  server: App,
  url: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
) {
  // SPEC 0257: the approval creation route requires one Idempotency-Key.
  const withKey =
    url === '/v1/approvals'
      ? {
          ...headers,
          'idempotency-key': `approval-key-${Date.now()}-${Math.random().toString(36).slice(2)}`
        }
      : headers
  return server.inject({ method: 'POST', url, headers: withKey, payload })
}

function patchTask(
  server: App,
  taskId: string,
  headers: Record<string, string>,
  status = 'in_progress'
) {
  return server.inject({
    method: 'PATCH',
    url: `/v1/tasks/${taskId}/status`,
    headers,
    payload: { status }
  })
}

async function readList(
  server: App,
  url: string,
  headers: Record<string, string>
) {
  const response = await server.inject({ method: 'GET', url, headers })
  expect(response.statusCode, url).toBe(200)
  const body = response.json() as {
    data: Array<{ id: string }>
    meta: { pageInfo: Record<string, unknown> }
  }
  return {
    data: body.data,
    ids: body.data.map((item) => item.id),
    pageInfo: body.meta.pageInfo,
    raw: response.body,
    cacheControl: response.headers['cache-control']
  }
}

const LEGACY_BEFORE_0029 = [
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
  '0015_runtime_approval_store',
  '0016_operational_execution_spine',
  '0017_runtime_approval_execution_binding',
  '0018_operational_execution_invariants',
  '0019_iterative_execution_steps',
  '0020_conversation_intelligence',
  '0021_approval_decision_audit_dedupe',
  '0022_conversation_policy_standardization',
  '0023_rate_limit_buckets',
  '0024_approval_decision_causality',
  '0025_webhook_replay_fencing',
  '0026_rate_limit_key_hardening',
  '0027_worker_operations'
  // 0028_session_events is an opt-in dedicated schema, never applied to the
  // runtime schema: the legacy runtime schema without 0029 ends at 0027.
]

describePg('SPEC0251 PostgreSQL case scope of tasks and approvals', () => {
  const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
  const schema = `cvg_case0251_${suffix}`
  const runtimeRole = `cvg_case0251_rt_${suffix}`
  const runtimePassword = `rt_${suffix}`
  let admin: Client
  let runtimePool: Pool

  beforeAll(async () => {
    admin = new Client({ connectionString: testDatabaseUrl as string })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: schema })
    await admin.query(`SET search_path TO public`)
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
    const probe = await runtimePool.query<{
      rolsuper: boolean
      rolbypassrls: boolean
    }>(
      'SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
    )
    expect(probe.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
  }, 120_000)

  afterAll(async () => {
    await runtimePool?.end().catch(() => undefined)
    for (const name of [schema, `${schema}_l0`, `${schema}_l28`]) {
      await admin
        ?.query(`DROP SCHEMA IF EXISTS ${name} CASCADE`)
        .catch(() => undefined)
    }
    await admin
      ?.query(`DROP ROLE IF EXISTS ${runtimeRole}`)
      .catch(() => undefined)
    await admin?.end().catch(() => undefined)
  })

  function app(options: Parameters<typeof buildServer>[0] = {}) {
    return buildServer({
      persistence: { kind: 'postgres-pool', pool: runtimePool as never },
      rateLimiter: unlimited,
      ...options
    })
  }

  async function seedConversation(
    server: App,
    marker: string,
    tenantId: TenantId
  ) {
    const response = await server.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      headers: { 'x-tenant-id': tenantId },
      payload: {
        externalMessageId: `spec0251-pg-${marker}-${randomUUID()}`,
        senderRef: `+55119${Math.floor(Math.random() * 10_000_000)}`,
        body: `Synthetic ${marker}`,
        receivedAt: '2026-10-21T12:00:00.000Z'
      }
    })
    expect(response.statusCode).toBe(200)
    return response.json().data as {
      conversationId: string
      sessionId: string
    }
  }

  async function seedRootlessSession(tenantId: TenantId) {
    const id = randomUUID()
    const conversationId = `conv_rootless_${id}`
    const sessionId = `sess_rootless_${id}`
    await admin.query(
      `INSERT INTO ${schema}.conversations
         (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
       VALUES ($1, $2, 'web', 'synthetic-rootless', $3, 'active', $4, now(), now())`,
      [tenantId, conversationId, 'f'.repeat(64), `corr_${id}`]
    )
    await admin.query(
      `INSERT INTO ${schema}.sessions
         (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
       VALUES ($1, $2, $3, 'open', 'BOT_ACTIVE', now(), now())`,
      [tenantId, sessionId, conversationId]
    )
    return { conversationId, sessionId }
  }

  async function world(tenantA: TenantId, tenantB: TenantId) {
    const seed = app()
    const x = await seedConversation(seed, 'PG_CASE_X', tenantA)
    const y = await seedConversation(seed, 'PG_CASE_Y', tenantA)
    const b = await seedConversation(seed, 'PG_CASE_B', tenantB)
    const rootless = await seedRootlessSession(tenantA)
    const caseX = await grantCase(seed, {
      kind: 'core_conversation',
      resourceId: x.conversationId,
      operatorId: 'operator.a',
      tenantId: tenantA
    })
    const caseY = await grantCase(seed, {
      kind: 'core_conversation',
      resourceId: y.conversationId,
      operatorId: 'operator.b',
      tenantId: tenantA
    })
    await grantCase(seed, {
      kind: 'core_conversation',
      resourceId: x.conversationId,
      operatorId: 'approver.a',
      role: 'Approver',
      tenantId: tenantA
    })
    await provisionPrincipal(seed, {
      tenantId: tenantA,
      operatorId: 'approver.b',
      role: 'Approver'
    })
    return { seed, x, y, b, rootless, caseX, caseY }
  }

  async function seedTask(
    seed: App,
    sessionId: string,
    tenantId: TenantId
  ): Promise<string> {
    const response = await post(
      seed,
      '/v1/tasks',
      { 'x-tenant-id': tenantId },
      taskPayload(sessionId)
    )
    expect(response.statusCode).toBe(200)
    return response.json().data.id as string
  }

  async function seedApproval(
    seed: App,
    sessionId: string,
    tenantId: TenantId
  ): Promise<string> {
    const response = await post(
      seed,
      '/v1/approvals',
      { 'x-tenant-id': tenantId },
      approvalPayload(sessionId)
    )
    expect(response.statusCode).toBe(200)
    return response.json().data.id as string
  }

  async function ordered(table: string, ids: string[]): Promise<string[]> {
    const result = await admin.query<{ id: string }>(
      `SELECT id FROM ${schema}.${table} WHERE id = ANY($1::text[])
        ORDER BY created_at ASC, id ASC`,
      [ids]
    )
    return result.rows.map((row) => row.id)
  }

  async function databaseState(): Promise<string> {
    const result = await admin.query(
      `SELECT
         (SELECT COALESCE(string_agg(id || ':' || status, ',' ORDER BY id), '') FROM ${schema}.tasks) AS tasks,
         (SELECT COALESCE(string_agg(id || ':' || status, ',' ORDER BY id), '') FROM ${schema}.approval_requests) AS approvals,
         (SELECT COUNT(*) FROM ${schema}.audit_events) AS audit,
         (SELECT COALESCE(string_agg(approval_id || ':' || status, ',' ORDER BY approval_id), '') FROM ${schema}.runtime_approvals) AS runtime_approvals,
         (SELECT COALESCE(string_agg(id || ':' || state, ',' ORDER BY id), '') FROM ${schema}.operational_executions) AS executions`
    )
    return JSON.stringify(result.rows[0])
  }

  it('S2 — lists filter in one statement before COUNT/offset/limit under RLS, with DTO parity', async () => {
    const tenantA = tenant('2511')
    const tenantB = tenant('2512')
    const w = await world(tenantA, tenantB)
    const h = headersFor(tenantA)
    type Bucket = 'x' | 'y' | 'rootless' | 'b'
    const seeded = {
      tasks: { x: [], y: [], rootless: [], b: [] } as Record<Bucket, string[]>,
      approval_requests: { x: [], y: [], rootless: [], b: [] } as Record<
        Bucket,
        string[]
      >
    }
    const plan: Array<[Bucket, string, TenantId, number]> = [
      ['x', w.x.sessionId, tenantA, 30],
      ['y', w.y.sessionId, tenantA, 30],
      ['rootless', w.rootless.sessionId, tenantA, 5],
      ['b', w.b.sessionId, tenantB, 3]
    ]
    for (let index = 0; index < 30; index += 1) {
      for (const [bucket, sessionId, tenantId, size] of plan) {
        if (index >= size) continue
        seeded.tasks[bucket].push(await seedTask(w.seed, sessionId, tenantId))
        seeded.approval_requests[bucket].push(
          await seedApproval(w.seed, sessionId, tenantId)
        )
      }
    }
    for (const table of ['tasks', 'approval_requests'] as const) {
      for (const bucket of ['x', 'y', 'rootless', 'b'] as const) {
        seeded[table][bucket] = await ordered(table, seeded[table][bucket])
      }
    }
    const movedTasks = new Set(seeded.tasks.x.filter((_, i) => i % 3 === 0))
    const movedApprovals = new Set(
      seeded.approval_requests.x.filter((_, i) => i % 3 === 0)
    )
    await admin.query(
      `UPDATE ${schema}.tasks SET status = 'in_progress' WHERE id = ANY($1::text[])`,
      [[...movedTasks]]
    )
    await admin.query(
      `UPDATE ${schema}.approval_requests
          SET status = 'approved', decided_by = 'supervisor.seed', decided_at = now()
        WHERE id = ANY($1::text[])`,
      [[...movedApprovals]]
    )

    const server = app()
    const resources = [
      {
        path: '/v1/tasks',
        ids: seeded.tasks,
        filter: 'in_progress',
        moved: movedTasks
      },
      {
        path: '/v1/approvals',
        ids: seeded.approval_requests,
        filter: 'approved',
        moved: movedApprovals
      }
    ]
    for (const resource of resources) {
      const tenantWide = new Set([
        ...resource.ids.x,
        ...resource.ids.y,
        ...resource.ids.rootless
      ])
      for (const headers of [h.operatorA, h.approverA]) {
        for (let offset = 0; offset < 35; offset += 7) {
          const page = await readList(
            server,
            `${resource.path}?limit=7&offset=${offset}`,
            headers
          )
          expect(page.pageInfo).toEqual({
            limit: 7,
            offset,
            total: 30,
            hasNextPage: offset + 7 < 30
          })
          expect(page.ids).toEqual(resource.ids.x.slice(offset, offset + 7))
          expect(page.cacheControl).toBe('no-store')
        }
        const byStatus = await readList(
          server,
          `${resource.path}?status=${resource.filter}&limit=100`,
          headers
        )
        expect(byStatus.pageInfo.total).toBe(10)
        expect(byStatus.ids).toEqual(
          resource.ids.x.filter((id) => resource.moved.has(id))
        )
      }
      const operatorB = await readList(
        server,
        `${resource.path}?limit=100`,
        h.operatorB
      )
      expect(operatorB.pageInfo.total).toBe(30)
      expect(operatorB.ids).toEqual(resource.ids.y)
      const approverB = await readList(
        server,
        `${resource.path}?limit=7`,
        h.approverB
      )
      expect(approverB.pageInfo).toEqual({
        limit: 7,
        offset: 0,
        total: 0,
        hasNextPage: false
      })
      expect(approverB.ids).toEqual([])
      for (const headers of [h.supervisor, h.admin]) {
        const page = await readList(
          server,
          `${resource.path}?limit=100`,
          headers
        )
        expect(page.pageInfo.total).toBe(65)
        expect(new Set(page.ids)).toEqual(tenantWide)
        expect(page.cacheControl).toBe('no-store')
        for (const id of resource.ids.b) expect(page.raw).not.toContain(id)
      }
    }

    // R4-O7: the tenant-scoped DTO is the one of the former listPage.
    const parity: Record<string, unknown> = {}
    for (const statuses of [undefined, ['in_progress'] as const]) {
      const expected = await withTenantContext(
        runtimePool as never,
        tenantA,
        (client) =>
          new PostgresRuntimeRepository(client, {
            tenantIsolation: true
          }).listTaskPage(
            { limit: 100, offset: 0, ...(statuses ? { statuses } : {}) },
            tenantA
          )
      )
      const actual = await readList(
        server,
        `/v1/tasks?limit=100${statuses ? `&status=${statuses[0]}` : ''}`,
        h.supervisor
      )
      expect(actual.data).toEqual(JSON.parse(JSON.stringify(expected.items)))
      expect(actual.pageInfo).toEqual(expected.pageInfo)
      parity[`tasks${statuses ? `:${statuses[0]}` : ''}`] = expected.pageInfo
    }
    for (const statuses of [undefined, ['approved'] as const]) {
      const expected = await withTenantContext(
        runtimePool as never,
        tenantA,
        (client) =>
          new PostgresRuntimeRepository(client, {
            tenantIsolation: true
          }).listApprovalPage(
            { limit: 100, offset: 0, ...(statuses ? { statuses } : {}) },
            tenantA
          )
      )
      const actual = await readList(
        server,
        `/v1/approvals?limit=100${statuses ? `&status=${statuses[0]}` : ''}`,
        h.supervisor
      )
      expect(actual.data).toEqual(JSON.parse(JSON.stringify(expected.items)))
      expect(actual.pageInfo).toEqual(expected.pageInfo)
      parity[`approvals${statuses ? `:${statuses[0]}` : ''}`] =
        expected.pageInfo
    }

    // Statements per request: constant, with one list statement (COUNT and
    // page together) whatever the page size or role.
    const spy = vi.spyOn(Client.prototype, 'query')
    const statements: Record<string, string[]> = {}
    let scopedPage: { text: string; values: unknown[] } | null = null
    try {
      for (const [label, url, headers] of [
        ['tasks operatorA limit=7', '/v1/tasks?limit=7', h.operatorA],
        ['tasks operatorA limit=30', '/v1/tasks?limit=30', h.operatorA],
        ['tasks supervisor limit=100', '/v1/tasks?limit=100', h.supervisor],
        ['approvals approverA limit=7', '/v1/approvals?limit=7', h.approverA],
        [
          'approvals supervisor limit=100',
          '/v1/approvals?limit=100',
          h.supervisor
        ]
      ] as const) {
        spy.mockClear()
        await readList(server, url, headers)
        const calls = spy.mock.calls.map((call) => ({
          text:
            typeof call[0] === 'string'
              ? call[0]
              : String((call[0] as { text?: unknown }).text),
          values: (call[1] ?? []) as unknown[]
        }))
        statements[label] = calls.map((call) =>
          call.text.replace(/\s+/g, ' ').trim().slice(0, 80)
        )
        const lists = calls.filter((call) => call.text.includes('COUNT(*)'))
        expect(lists, label).toHaveLength(1)
        if (label === 'tasks operatorA limit=7') scopedPage = lists[0]!
      }
    } finally {
      spy.mockRestore()
    }
    expect(statements['tasks operatorA limit=7']).toEqual(
      statements['tasks operatorA limit=30']
    )
    expect(statements['tasks operatorA limit=7']!.length).toBeLessThanOrEqual(8)
    expect(scopedPage!.text).toContain('EXISTS')
    const explain = await withTenantContext(
      runtimePool as never,
      tenantA,
      (client) =>
        client.query<{ 'QUERY PLAN': string }>(
          `EXPLAIN (COSTS OFF) ${scopedPage!.text}`,
          scopedPage!.values
        )
    )
    const queryPlan = explain.rows.map((row) => row['QUERY PLAN'])
    expect(queryPlan.join('\n')).toMatch(/case_assignments/)
    record('s2-postgres-lists.json', {
      statementsPerRequest: Object.fromEntries(
        Object.entries(statements).map(([label, list]) => [label, list.length])
      ),
      statements,
      scopedPageSql: scopedPage!.text.replace(/\s+/g, ' ').trim(),
      explain: queryPlan,
      dtoParity: parity
    })

    // Same end as S1: a revocation committed before the read empties the
    // scoped lists (the ACTIVE predicate of the page statement).
    const revoked = await putAssignment(
      w.seed,
      w.caseX,
      'operator.a',
      { status: 'REVOKED', expectedRevision: 1 },
      as('supervisor.case-manager', 'Supervisor', tenantA)
    )
    expect(revoked.statusCode).toBe(200)
    for (const path of ['/v1/tasks?limit=7', '/v1/approvals?limit=7']) {
      const page = await readList(server, path, h.operatorA)
      expect(page.pageInfo, path).toEqual({
        limit: 7,
        offset: 0,
        total: 0,
        hasNextPage: false
      })
      expect(page.ids, path).toEqual([])
      expect(page.cacheControl, path).toBe('no-store')
    }
    await server.close()
    await w.seed.close()
  }, 180_000)

  it('S3/S5 — snapshot task and approval lookups stay in the snapshot tenant, with and without RLS', async () => {
    const tenantA = tenant('2521')
    const tenantB = tenant('2522')
    const w = await world(tenantA, tenantB)
    const taskX = await seedTask(w.seed, w.x.sessionId, tenantA)
    const approvalX = await seedApproval(w.seed, w.x.sessionId, tenantA)
    const taskRootless = await seedTask(w.seed, w.rootless.sessionId, tenantA)
    const taskB = await seedTask(w.seed, w.b.sessionId, tenantB)
    const approvalB = await seedApproval(w.seed, w.b.sessionId, tenantB)
    const bypass = new Client({
      connectionString: testDatabaseUrl as string,
      options: `-c search_path=${schema}`
    })
    await bypass.connect()
    try {
      const authorities = {
        rls: new PostgresCaseAuthority(runtimePool as never, { mode: 'pool' }),
        // Superuser single connection: RLS does not apply, so only the
        // explicit tenant filter keeps tenant B out (R4-O5).
        noRls: new PostgresCaseAuthority(bypass, { mode: 'client' })
      }
      for (const [label, authority] of Object.entries(authorities)) {
        const lookups = await authority.readSnapshot(
          tenantA,
          async (snapshot) => [
            await snapshot.taskCase(taskB),
            await snapshot.approvalRequestCase(approvalB),
            await snapshot.taskCase('task_absent_spec0251'),
            await snapshot.approvalRequestCase('approval_absent_spec0251'),
            await snapshot.taskCase(taskX),
            await snapshot.approvalRequestCase(approvalX),
            await snapshot.taskCase(taskRootless)
          ]
        )
        expect(lookups, label).toEqual([
          null,
          null,
          null,
          null,
          { caseId: w.caseX, sessionId: w.x.sessionId },
          { caseId: w.caseX, sessionId: w.x.sessionId },
          { caseId: null, sessionId: w.rootless.sessionId }
        ])
        const lists = await authority.readSnapshot(
          tenantA,
          async (snapshot) => [
            await snapshot.listTasks(
              { kind: 'tenant' },
              { limit: 100, offset: 0 }
            ),
            await snapshot.listApprovalRequests(
              { kind: 'tenant' },
              { limit: 100, offset: 0 }
            ),
            await snapshot.listTasks(
              { kind: 'assigned', operatorId: 'operator.a' },
              { limit: 100, offset: 0 }
            )
          ]
        )
        expect(
          lists[0]!.items.map((item) => item.id),
          label
        ).toEqual([taskX, taskRootless])
        expect(
          lists[1]!.items.map((item) => item.id),
          label
        ).toEqual([approvalX])
        expect(
          lists[2]!.items.map((item) => item.id),
          label
        ).toEqual([taskX])
      }
    } finally {
      await bypass.end()
      await w.seed.close()
    }
  }, 120_000)

  it('S5 — the six mutations require the case under RLS, without row or event on denial', async () => {
    const tenantA = tenant('2531')
    const tenantB = tenant('2532')
    const w = await world(tenantA, tenantB)
    const h = headersFor(tenantA)
    const server = app({ requireAuthenticatedMutations: true })
    try {
      const taskX = await seedTask(w.seed, w.x.sessionId, tenantA)
      const approvalX = await seedApproval(w.seed, w.x.sessionId, tenantA)
      const submitted = await post(server, '/v1/executions', h.supervisor, {
        idempotencyKey: `spec0251-pg-linked-${randomUUID()}`,
        runtime: runtime(tenantA, w.x.conversationId, w.x.sessionId)
      })
      expect(submitted.statusCode).toBe(202)
      const linked = await toWaitingApproval(
        server,
        tenantA,
        submitted.json().data.execution.id as string
      )
      const unlinked = await unlinkedWaitingExecution(server, tenantA)

      const before = await databaseState()
      const missing = await patchTask(
        server,
        'task_absent_spec0251',
        h.operatorA
      )
      const denied: Array<[string, Response]> = [
        ['PATCH', await patchTask(server, taskX, h.operatorB)],
        [
          'POST /v1/tasks',
          await post(
            server,
            '/v1/tasks',
            h.operatorB,
            taskPayload(w.x.sessionId)
          )
        ],
        [
          'POST /v1/tasks rootless',
          await post(
            server,
            '/v1/tasks',
            h.operatorA,
            taskPayload(w.rootless.sessionId)
          )
        ],
        [
          'POST /v1/journeys/tasks',
          await post(
            server,
            '/v1/journeys/tasks',
            h.operatorB,
            journeyPayload(w.x.sessionId)
          )
        ],
        [
          'POST /v1/approvals',
          await post(
            server,
            '/v1/approvals',
            h.approverB,
            approvalPayload(w.x.sessionId)
          )
        ],
        [
          'POST /v1/approvals tenant B',
          await post(
            server,
            '/v1/approvals',
            h.supervisor,
            approvalPayload(w.b.sessionId)
          )
        ],
        [
          'decision',
          await post(
            server,
            `/v1/approvals/${approvalX}/decision`,
            h.approverB,
            {
              decision: 'approved'
            }
          )
        ],
        ['runtime decision', await decideRuntime(server, linked, h.approverB)],
        [
          'runtime decision unlinked',
          await decideRuntime(server, unlinked, h.approverA)
        ]
      ]
      for (const [name, response] of [
        ...denied,
        ['missing', missing]
      ] as const) {
        expect(response.statusCode, name).toBe(404)
        expect(response.json().error, name).toEqual(NOT_FOUND)
        expect(response.headers['cache-control'], name).toBe('no-store')
        expect(withoutCorrelation(response), name).toEqual(
          withoutCorrelation(missing)
        )
      }
      expect(await databaseState()).toBe(before)

      const allowed: Array<[string, Response, number]> = [
        ['PATCH', await patchTask(server, taskX, h.operatorA), 200],
        [
          'POST /v1/tasks',
          await post(
            server,
            '/v1/tasks',
            h.operatorA,
            taskPayload(w.x.sessionId)
          ),
          200
        ],
        [
          'POST /v1/journeys/tasks',
          await post(
            server,
            '/v1/journeys/tasks',
            h.operatorA,
            journeyPayload(w.x.sessionId)
          ),
          200
        ],
        [
          'POST /v1/approvals',
          await post(
            server,
            '/v1/approvals',
            h.approverA,
            approvalPayload(w.x.sessionId)
          ),
          200
        ],
        [
          'decision',
          await post(
            server,
            `/v1/approvals/${approvalX}/decision`,
            h.approverA,
            {
              decision: 'approved'
            }
          ),
          200
        ],
        [
          'runtime decision',
          await decideRuntime(server, linked, h.approverA),
          202
        ],
        [
          'runtime decision unlinked (Supervisor)',
          await decideRuntime(server, unlinked, h.supervisor),
          202
        ]
      ]
      for (const [name, response, status] of allowed) {
        expect(response.statusCode, name).toBe(status)
        expect(response.headers['cache-control'], name).toBe('no-store')
      }
      const persisted = await admin.query<{ status: string }>(
        `SELECT status FROM ${schema}.tasks WHERE id = $1`,
        [taskX]
      )
      expect(persisted.rows[0]?.status).toBe('in_progress')
      const decided = await admin.query<{ status: string }>(
        `SELECT status FROM ${schema}.approval_requests WHERE id = $1`,
        [approvalX]
      )
      expect(decided.rows[0]?.status).toBe('approved')

      // Revocation committed before the request: 404 again.
      const revoked = await putAssignment(
        w.seed,
        w.caseX,
        'operator.a',
        { status: 'REVOKED', expectedRevision: 1 },
        as('supervisor.case-manager', 'Supervisor', tenantA)
      )
      expect(revoked.statusCode).toBe(200)
      const afterRevoke = await patchTask(server, taskX, h.operatorA, 'done')
      expect(afterRevoke.statusCode).toBe(404)
    } finally {
      await server.close()
      await w.seed.close()
    }
  }, 180_000)

  it('S6 — legacy 0000 schema without 0029: Operator/Approver 503, Supervisor creates and decides', async () => {
    const legacySchema = `${schema}_l0`
    const legacyTenant = tenant('2541')
    const client = new Client({ connectionString: testDatabaseUrl as string })
    await client.connect()
    try {
      await runInitialPostgresMigration(client, { schemaName: legacySchema })
      const seedServer = buildServer({
        persistence: { kind: 'postgres', client },
        rateLimiter: unlimited
      })
      const server = buildServer({
        persistence: { kind: 'postgres', client },
        rateLimiter: unlimited,
        requireAuthenticatedMutations: true
      })
      try {
        const inbound = await seedServer.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/whatsapp/messages',
          headers: { 'x-tenant-id': legacyTenant },
          payload: {
            externalMessageId: `spec0251-legacy0-${randomUUID()}`,
            senderRef: 'synthetic-legacy',
            body: 'Synthetic legacy 0000',
            receivedAt: '2026-10-21T12:00:00.000Z'
          }
        })
        expect(inbound.statusCode).toBe(200)
        const sessionId = inbound.json().data.sessionId as string
        // SPEC 0257: the shared-client profile has no exclusive transactional
        // pool, so the creation POSTs answer 503 before any write; the rows
        // are seeded through the repository for the rest of this scenario.
        const refusedTask = await post(
          seedServer,
          '/v1/tasks',
          { 'x-tenant-id': legacyTenant },
          taskPayload(sessionId)
        )
        expect(refusedTask.statusCode).toBe(503)
        const refusedApproval = await post(
          seedServer,
          '/v1/approvals',
          { 'x-tenant-id': legacyTenant },
          approvalPayload(sessionId)
        )
        expect(refusedApproval.statusCode).toBe(503)
        const repository = new PostgresRuntimeRepository(client)
        const seededTask = await repository.createTask(
          {
            sessionId,
            title: 'Tarefa legada',
            description: 'Semeada pelo repositorio',
            priority: 'medium',
            source: 'legacy-seed',
            idempotencyKey: 'legacy-seed-task-0001'
          },
          legacyTenant
        )
        const taskId = seededTask.id
        const seededApproval = await repository.saveApproval(
          {
            id: `approval_${randomUUID()}`,
            sessionId,
            proposedAction: 'create_appointment_draft',
            summary: 'Aprovacao legada semeada',
            riskLevel: 'medium',
            status: 'pending',
            decidedBy: null,
            decidedAt: null,
            createdAt: new Date()
          },
          legacyTenant
        )
        const approvalId = seededApproval.id
        const h = headersFor(legacyTenant)
        const state = async () =>
          JSON.stringify(
            (
              await client.query(
                `SELECT
                   (SELECT string_agg(id || ':' || status, ',' ORDER BY id) FROM tasks) AS tasks,
                   (SELECT string_agg(id || ':' || status, ',' ORDER BY id) FROM approval_requests) AS approvals,
                   (SELECT COUNT(*) FROM audit_events) AS audit`
              )
            ).rows[0]
          )
        const before = await state()
        const refused: Array<[string, Response]> = [
          [
            'GET tasks Operator',
            await server.inject({
              method: 'GET',
              url: '/v1/tasks',
              headers: h.operatorA
            })
          ],
          [
            'GET approvals Operator',
            await server.inject({
              method: 'GET',
              url: '/v1/approvals',
              headers: h.operatorA
            })
          ],
          [
            'GET tasks Approver',
            await server.inject({
              method: 'GET',
              url: '/v1/tasks',
              headers: h.approverA
            })
          ],
          [
            'GET approvals Approver',
            await server.inject({
              method: 'GET',
              url: '/v1/approvals',
              headers: h.approverA
            })
          ],
          ['PATCH Operator', await patchTask(server, taskId, h.operatorA)],
          [
            'POST tasks Operator',
            await post(server, '/v1/tasks', h.operatorA, taskPayload(sessionId))
          ],
          [
            'POST journeys Operator',
            await post(
              server,
              '/v1/journeys/tasks',
              h.operatorA,
              journeyPayload(sessionId)
            )
          ],
          [
            'POST approvals Operator',
            await post(
              server,
              '/v1/approvals',
              h.operatorA,
              approvalPayload(sessionId)
            )
          ],
          [
            'POST approvals Approver',
            await post(
              server,
              '/v1/approvals',
              h.approverA,
              approvalPayload(sessionId)
            )
          ],
          [
            'decision Approver',
            await post(
              server,
              `/v1/approvals/${approvalId}/decision`,
              h.approverA,
              { decision: 'approved' }
            )
          ]
        ]
        for (const [name, response] of refused) {
          expect(response.statusCode, name).toBe(503)
          expect(response.json().error.code, name).toBe('configuration_error')
          expect(response.headers['cache-control'], name).toBe('no-store')
        }
        expect(await state()).toBe(before)

        for (const headers of [h.supervisor, h.admin]) {
          const tasks = await readList(server, '/v1/tasks', headers)
          expect(tasks.ids).toContain(taskId)
          const approvals = await readList(server, '/v1/approvals', headers)
          expect(approvals.ids).toContain(approvalId)
        }
        // SPEC 0257: the shared-client profile refuses creation, Supervisor included.
        const created = await post(
          server,
          '/v1/approvals',
          h.supervisor,
          approvalPayload(sessionId)
        )
        expect(created.statusCode).toBe(503)
        const decided = await post(
          server,
          `/v1/approvals/${approvalId}/decision`,
          h.supervisor,
          { decision: 'approved' }
        )
        expect(decided.statusCode).toBe(200)
        expect(decided.json().data.status).toBe('approved')
      } finally {
        await server.close()
        await seedServer.close()
      }
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${legacySchema} CASCADE`)
      await client.end()
    }
  }, 120_000)

  it('S6 — legacy 0000–0027 schema without 0029: lists, decisions and runtime approval by the Supervisor only', async () => {
    const legacySchema = `${schema}_l28`
    const legacyTenant = tenant('2551')
    const client = new Client({ connectionString: testDatabaseUrl as string })
    await client.connect()
    try {
      await runPostgresMigrations(client, {
        schemaName: legacySchema,
        migrations: LEGACY_BEFORE_0029
      })
      const id = randomUUID()
      const conversationId = `conv_legacy28_${id}`
      const sessionId = `sess_legacy28_${id}`
      const taskId = `task_legacy28_${id}`
      const approvalIds = [
        `approval_legacy28_a_${id}`,
        `approval_legacy28_b_${id}`
      ]
      await client.query(
        `INSERT INTO conversations
           (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id, created_at, updated_at)
         VALUES ($1, $2, 'web', 'synthetic-legacy28', $3, 'active', $4, now(), now())`,
        [legacyTenant, conversationId, 'f'.repeat(64), `corr_${id}`]
      )
      await client.query(
        `INSERT INTO sessions
           (tenant_id, id, conversation_id, status, takeover_state, created_at, updated_at)
         VALUES ($1, $2, $3, 'open', 'BOT_ACTIVE', now(), now())`,
        [legacyTenant, sessionId, conversationId]
      )
      await client.query(
        `INSERT INTO tasks
           (tenant_id, id, session_id, title, description, priority, source, status, idempotency_key, created_at)
         VALUES ($1, $2, $3, 'Synthetic legacy task', 'Synthetic', 'medium', 'spec0251-legacy', 'open', $4, now())`,
        [legacyTenant, taskId, sessionId, `spec0251-legacy-${id}`]
      )
      for (const approvalId of approvalIds) {
        await client.query(
          `INSERT INTO approval_requests
             (tenant_id, id, session_id, proposed_action, summary, risk_level, status, created_at)
           VALUES ($1, $2, $3, 'synthetic_review', 'Synthetic legacy approval', 'low', 'pending', now())`,
          [legacyTenant, approvalId, sessionId]
        )
      }
      // Query-only view of the single connection: every store composed by
      // the legacy mode (execution spine included) shares it.
      const single = {
        query: (text: string, values?: unknown[]) => client.query(text, values)
      }
      const server = buildServer({
        persistence: { kind: 'postgres', client: single as never },
        rateLimiter: unlimited,
        requireAuthenticatedMutations: true
      })
      try {
        const accepted = await server.operationalExecution.submit({
          tenantId: legacyTenant,
          idempotencyKey: `spec0251-legacy28-${id}`,
          runtime: runtime(legacyTenant, conversationId, sessionId) as never
        })
        const execution = await toWaitingApproval(
          server,
          legacyTenant,
          accepted.record.id
        )
        const h = headersFor(legacyTenant)
        const state = async () =>
          JSON.stringify(
            (
              await client.query(
                `SELECT
                   (SELECT string_agg(id || ':' || status, ',' ORDER BY id) FROM tasks) AS tasks,
                   (SELECT string_agg(id || ':' || status, ',' ORDER BY id) FROM approval_requests) AS approvals,
                   (SELECT COUNT(*) FROM audit_events) AS audit,
                   (SELECT string_agg(approval_id || ':' || status, ',') FROM runtime_approvals) AS runtime_approvals`
              )
            ).rows[0]
          )
        const before = await state()
        const refused: Array<[string, Response]> = [
          [
            'GET tasks Operator',
            await server.inject({
              method: 'GET',
              url: '/v1/tasks',
              headers: h.operatorA
            })
          ],
          [
            'GET approvals Approver',
            await server.inject({
              method: 'GET',
              url: '/v1/approvals',
              headers: h.approverA
            })
          ],
          ['PATCH Operator', await patchTask(server, taskId, h.operatorA)],
          [
            'POST tasks Operator',
            await post(server, '/v1/tasks', h.operatorA, taskPayload(sessionId))
          ],
          [
            'POST journeys Operator',
            await post(
              server,
              '/v1/journeys/tasks',
              h.operatorA,
              journeyPayload(sessionId)
            )
          ],
          [
            'POST approvals Approver',
            await post(
              server,
              '/v1/approvals',
              h.approverA,
              approvalPayload(sessionId)
            )
          ],
          [
            'decision Approver',
            await post(
              server,
              `/v1/approvals/${approvalIds[0]}/decision`,
              h.approverA,
              { decision: 'approved' }
            )
          ],
          [
            'runtime decision Approver',
            await decideRuntime(server, execution, h.approverA)
          ]
        ]
        for (const [name, response] of refused) {
          expect(response.statusCode, name).toBe(503)
          expect(response.json().error.code, name).toBe('configuration_error')
          expect(response.headers['cache-control'], name).toBe('no-store')
        }
        expect(await state()).toBe(before)

        const tasks = await readList(server, '/v1/tasks', h.supervisor)
        expect(tasks.ids).toEqual([taskId])
        const approvals = await readList(server, '/v1/approvals', h.supervisor)
        expect(new Set(approvals.ids)).toEqual(new Set(approvalIds))
        const decided = await post(
          server,
          `/v1/approvals/${approvalIds[0]}/decision`,
          h.supervisor,
          { decision: 'rejected' }
        )
        expect(decided.statusCode).toBe(200)
        expect(decided.json().data.status).toBe('rejected')
        const runtimeDecision = await decideRuntime(
          server,
          execution,
          h.supervisor
        )
        expect(runtimeDecision.statusCode).toBe(202)
        expect(runtimeDecision.headers['cache-control']).toBe('no-store')
      } finally {
        await server.close()
      }
    } finally {
      await client.query(`DROP SCHEMA IF EXISTS ${legacySchema} CASCADE`)
      await client.end()
    }
  }, 120_000)
})
