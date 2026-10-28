/**
 * SPEC0176 — PostgreSQL authority (migration 0029): AUTH01/04/05/06/07/11/
 * 12/13 against a disposable database with a least-privilege runtime role.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); a required
 * gate sets CASE0176_PG_REQUIRED=1 and a missing database fails instead.
 */
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  PostgresCaseAuthority,
  TENANT_SCHEMA_TABLES,
  tenantRuntimeGrantPrivileges,
  linkAuditEventToCoreSessionWhenAvailable,
  runPostgresMigrations
} from '@cvg/persistence'
import { buildServer } from '../server.ts'
import { assertCaseAuthorizationSchema } from '../tenant-preflight.ts'
import {
  CONTROLLED_TEST_TENANT,
  findCaseId,
  grantCase,
  managerHeaders,
  provisionPrincipal,
  putAssignment
} from './case-authorization-fixtures.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.CASE0176_PG_REQUIRED === '1'
const pgEnabled = Boolean(testDatabaseUrl)
if (pgRequired && !pgEnabled) {
  throw new Error(
    'CASE0176_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to skip'
  )
}
const describePg = pgEnabled ? describe : describe.skip

const TENANT = CONTROLLED_TEST_TENANT
const OTHER_TENANT = 'tenant_00000000-0000-4000-8000-000000000178'
const suffix = `${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
const schema = `cvg_case0176_${suffix}`
const runtimeRole = `cvg_case0176_rt_${suffix}`
const runtimePassword = `rt_${suffix}`

let admin: Client
let runtimePool: Pool

function runtimeUrl(): string {
  const url = new URL(testDatabaseUrl as string)
  url.username = runtimeRole
  url.password = runtimePassword
  return url.toString()
}

function as(
  operatorId: string,
  role: 'Operator' | 'Approver' | 'Supervisor' | 'Admin',
  tenantId: string = TENANT
): Record<string, string> {
  return {
    'x-operator-id': operatorId,
    'x-operator-role': role,
    'x-tenant-id': tenantId
  }
}

function app(options: Parameters<typeof buildServer>[0] = {}) {
  return buildServer({
    persistence: { kind: 'postgres-pool', pool: runtimePool as never },
    requireAuthenticatedMutations: true,
    ...options
  })
}

type App = ReturnType<typeof app>

async function seedConversation(
  target: App,
  marker: string,
  tenantId = TENANT
) {
  const response = await target.inject({
    method: 'POST',
    url: '/v1/webhooks/channels/whatsapp/messages',
    headers: { 'x-tenant-id': tenantId },
    payload: {
      externalMessageId: `pg-case-${marker}-${Math.random()}`,
      senderRef: `+55119${Math.floor(Math.random() * 10_000_000)}`,
      body: `Synthetic ${marker}`,
      receivedAt: '2026-10-20T12:00:00.000Z'
    }
  })
  expect(response.statusCode).toBe(200)
  return response.json().data as { conversationId: string; sessionId: string }
}

function runtime(conversationId: string, sessionId: string) {
  return {
    agent: {
      id: 'agent.case.pg',
      version: 'v1',
      objective: 'synthetic',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: TENANT,
    conversationId,
    sessionId,
    correlationId: 'correlation_case_pg',
    traceId: 'trace_case_pg',
    userMessage: 'synthetic',
    context: {
      values: {},
      sourceIds: ['synthetic'],
      capturedAt: '2026-10-20T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-10-20T00:00:00.000Z' },
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

async function submit(
  target: App,
  headers: Record<string, string>,
  conversationId: string,
  sessionId: string,
  key = `pg-exec-${Math.random()}`
) {
  return target.inject({
    method: 'POST',
    url: '/v1/executions',
    headers,
    payload: {
      idempotencyKey: key,
      runtime: runtime(conversationId, sessionId)
    }
  })
}

async function count(sql: string, values: unknown[] = []): Promise<number> {
  const result = await admin.query<{ total: string }>(sql, values)
  return Number(result.rows[0]?.total ?? 0)
}

describePg('SPEC0176 PostgreSQL case authority', () => {
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
        `GRANT ${tenantRuntimeGrantPrivileges(table)} ON ${schema}.${table} TO ${runtimeRole}`
      )
    }
    await admin.query(
      `GRANT SELECT ON ${schema}.schema_migrations TO ${runtimeRole}`
    )
    await admin.query(`ALTER ROLE ${runtimeRole} SET search_path TO ${schema}`)
    runtimePool = new Pool({ connectionString: runtimeUrl(), max: 6 })
  }, 120_000)

  afterAll(async () => {
    await runtimePool?.end().catch(() => undefined)
    await admin
      ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin
      ?.query(`DROP ROLE IF EXISTS ${runtimeRole}`)
      .catch(() => undefined)
    await admin?.end().catch(() => undefined)
  })

  it('AUTH01/06 — serves only assigned roots, links executions atomically and refuses forged pairs', async () => {
    const server = app()
    try {
      const caseA = await seedConversation(server, 'PG_MARKER_A')
      const caseB = await seedConversation(server, 'PG_MARKER_B')
      await grantCase(server, {
        kind: 'core_conversation',
        resourceId: caseA.conversationId,
        operatorId: 'operator.pg.a'
      })
      const operator = as('operator.pg.a', 'Operator')
      const list = await server.inject({
        method: 'GET',
        url: '/v1/conversations',
        headers: operator
      })
      expect(
        list.json().data.items.map((item: { id: string }) => item.id)
      ).toEqual([caseA.conversationId])
      expect(list.json().data.pageInfo.total).toBe(1)
      expect(list.body).not.toContain('PG_MARKER_B')
      for (const url of [
        `/v1/conversations/${caseB.conversationId}/timeline`,
        `/v1/audit/sessions/${caseB.sessionId}`
      ]) {
        const denied = await server.inject({
          method: 'GET',
          url,
          headers: operator
        })
        expect(denied.statusCode, url).toBe(404)
      }
      const audit = await server.inject({
        method: 'GET',
        url: `/v1/audit/sessions/${caseA.sessionId}`,
        headers: operator
      })
      expect(audit.statusCode).toBe(200)
      expect(audit.json().data.events.length).toBeGreaterThan(0)
      expect(Object.keys(audit.json().data.events[0]).sort()).toEqual(
        ['actorType', 'createdAt', 'id', 'policyVersion', 'type'].sort()
      )

      const executionsBefore = await count(
        `SELECT COUNT(*) AS total FROM ${schema}.operational_executions`
      )
      const forged = await submit(
        server,
        as('supervisor.pg', 'Supervisor'),
        caseA.conversationId,
        caseB.sessionId
      )
      expect(forged.statusCode).toBe(400)
      expect(
        await count(
          `SELECT COUNT(*) AS total FROM ${schema}.operational_executions`
        )
      ).toBe(executionsBefore)

      const linked = await submit(
        server,
        as('supervisor.pg', 'Supervisor'),
        caseA.conversationId,
        caseA.sessionId,
        'pg-linked-1'
      )
      expect(linked.statusCode).toBe(202)
      const linkedId = linked.json().data.execution.id as string
      expect(linked.json().data.execution.viewVersion).toBe(2)
      const linkRow = await admin.query(
        `SELECT l.validated_by, l.core_session_id, r.core_conversation_id
           FROM ${schema}.case_execution_links l
           JOIN ${schema}.case_roots r ON r.tenant_id = l.tenant_id AND r.case_id = l.case_id
          WHERE l.execution_id = $1`,
        [linkedId]
      )
      expect(linkRow.rows).toEqual([
        {
          validated_by: 'core_parent_pair',
          core_session_id: caseA.sessionId,
          core_conversation_id: caseA.conversationId
        }
      ])
      const duplicate = await submit(
        server,
        as('supervisor.pg', 'Supervisor'),
        caseA.conversationId,
        caseA.sessionId,
        'pg-linked-1'
      )
      expect(duplicate.json().data.created).toBe(false)
      expect(
        (
          await server.inject({
            method: 'GET',
            url: `/v1/executions/${linkedId}`,
            headers: operator
          })
        ).statusCode
      ).toBe(200)
      await provisionPrincipal(server, {
        operatorId: 'operator.pg.b',
        role: 'Operator'
      })
      expect(
        (
          await server.inject({
            method: 'GET',
            url: `/v1/executions/${linkedId}`,
            headers: as('operator.pg.b', 'Operator')
          })
        ).statusCode
      ).toBe(404)

      const independent = await submit(
        server,
        operator,
        'conversation_declared_only',
        'session_declared_only'
      )
      expect(independent.statusCode).toBe(202)
      const independentId = independent.json().data.execution.id as string
      expect(independent.json().data.execution).toEqual({
        id: independentId,
        state: 'QUEUED'
      })
      const root = await admin.query(
        `SELECT kind, execution_id FROM ${schema}.case_roots WHERE execution_id = $1`,
        [independentId]
      )
      expect(root.rows).toEqual([
        { kind: 'independent_execution', execution_id: independentId }
      ])
      expect(
        await count(
          `SELECT COUNT(*) AS total FROM ${schema}.case_assignments a
             JOIN ${schema}.case_roots r ON r.tenant_id = a.tenant_id AND r.case_id = a.case_id
            WHERE r.execution_id = $1`,
          [independentId]
        )
      ).toBe(0)
    } finally {
      await server.close()
    }
  })

  it('AUTH04 — CAS under concurrency and audit atomicity with the state', async () => {
    const server = app()
    try {
      const seeded = await seedConversation(server, 'PG_MARKER_CAS')
      await provisionPrincipal(server, {
        operatorId: 'operator.pg.cas',
        role: 'Operator'
      })
      const caseId = await findCaseId(
        server,
        'core_conversation',
        seeded.conversationId
      )
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          putAssignment(server, caseId, 'operator.pg.cas', {
            status: 'ACTIVE',
            expectedRevision: 0
          })
        )
      )
      expect(results.map((response) => response.statusCode).sort()).toEqual([
        200, 409, 409, 409
      ])
      const auditEvents = () =>
        count(
          `SELECT COUNT(*) AS total FROM ${schema}.audit_events
            WHERE payload->>'event' = 'case_assignment_changed'
              AND payload->>'caseId' = $1`,
          [caseId]
        )
      expect(await auditEvents()).toBe(1)

      // An audit failure rolls the revision back: state and audit are one unit.
      await admin.query(`
        CREATE FUNCTION ${schema}.case0176_fail_audit() RETURNS trigger
        LANGUAGE plpgsql AS $$ BEGIN
          IF NEW.payload->>'event' = 'case_assignment_changed' THEN
            RAISE EXCEPTION 'synthetic audit outage';
          END IF;
          RETURN NEW;
        END $$`)
      await admin.query(
        `CREATE TRIGGER case0176_fail_audit BEFORE INSERT ON ${schema}.audit_events
           FOR EACH ROW EXECUTE FUNCTION ${schema}.case0176_fail_audit()`
      )
      const outage = await putAssignment(server, caseId, 'operator.pg.cas', {
        status: 'REVOKED',
        expectedRevision: 1
      })
      await admin.query(
        `DROP TRIGGER case0176_fail_audit ON ${schema}.audit_events`
      )
      await admin.query(`DROP FUNCTION ${schema}.case0176_fail_audit()`)
      expect(outage.statusCode).toBe(503)
      const row = await admin.query(
        `SELECT status, revision FROM ${schema}.case_assignments WHERE case_id = $1`,
        [caseId]
      )
      expect(row.rows).toEqual([{ status: 'ACTIVE', revision: '1' }])
      expect(await auditEvents()).toBe(1)

      // Reconciliation after a lost response: GET shows the revision; the
      // old CAS replays as a conflict, never as a second effect.
      const revoked = await putAssignment(server, caseId, 'operator.pg.cas', {
        status: 'REVOKED',
        expectedRevision: 1
      })
      expect(revoked.json().data.assignment.revision).toBe(2)
      const replay = await putAssignment(server, caseId, 'operator.pg.cas', {
        status: 'ACTIVE',
        expectedRevision: 1
      })
      expect(replay.statusCode).toBe(409)
      expect(await auditEvents()).toBe(2)
    } finally {
      await server.close()
    }
  })

  it('AUTH05 — a revoke committed before the snapshot refuses; an older snapshot stays consistent', async () => {
    const server = app()
    const authority = new PostgresCaseAuthority(runtimePool as never)
    try {
      const seeded = await seedConversation(server, 'PG_MARKER_SNAPSHOT')
      const caseId = await grantCase(server, {
        kind: 'core_conversation',
        resourceId: seeded.conversationId,
        operatorId: 'operator.pg.snap'
      })
      let entered: () => void = () => undefined
      let release: () => void = () => undefined
      const inside = new Promise<void>((resolve) => {
        entered = resolve
      })
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      const reading = authority.readSnapshot(TENANT, async (snapshot) => {
        const before = await snapshot.hasActiveGrant(caseId, 'operator.pg.snap')
        entered()
        await gate
        const after = await snapshot.hasActiveGrant(caseId, 'operator.pg.snap')
        const timeline = await snapshot.coreTimeline(seeded.conversationId)
        const settings = await snapshot.queryable!.query<{
          statement_timeout: string
        }>(`SHOW statement_timeout`)
        const lock = await snapshot.queryable!.query<{ lock_timeout: string }>(
          `SHOW lock_timeout`
        )
        return {
          before,
          after,
          messages: timeline.messages.length,
          statementTimeout: settings.rows[0]?.statement_timeout,
          lockTimeout: lock.rows[0]?.lock_timeout
        }
      })
      await inside
      const revoke = await putAssignment(server, caseId, 'operator.pg.snap', {
        status: 'REVOKED',
        expectedRevision: 1
      })
      expect(revoke.statusCode).toBe(200)
      release()
      expect(await reading).toEqual({
        before: true,
        after: true,
        messages: 1,
        statementTimeout: '5s',
        lockTimeout: '1s'
      })
      const fresh = await server.inject({
        method: 'GET',
        url: `/v1/conversations/${seeded.conversationId}/timeline`,
        headers: as('operator.pg.snap', 'Operator')
      })
      expect(fresh.statusCode).toBe(404)
      expect(fresh.headers['cache-control']).toBe('no-store')
      expect(fresh.headers.etag).toBeUndefined()
    } finally {
      await server.close()
    }
  })

  it('AUTH07 — fixes the namespace by route and requires the complete harness pair', async () => {
    const server = app()
    try {
      const seeded = await seedConversation(server, 'PG_MARKER_HARNESS')
      // Same textual id in the harness family: a different case.
      await admin.query(
        `INSERT INTO ${schema}.cvg_conversation_sessions
           (tenant_id, conversation_id, session_id, profile_id, profile_version,
            status, working_memory, created_at, updated_at)
         VALUES ($1, $2, $3, 'profile', 'v1', 'ACTIVE', '{}'::jsonb, now(), now())`,
        [TENANT, seeded.conversationId, seeded.sessionId]
      )
      const supervisor = as('supervisor.pg.h', 'Supervisor')
      const harnessUrl = `/v1/cases/harness/conversations/${seeded.conversationId}/sessions/${seeded.sessionId}/audit`
      const harness = await server.inject({
        method: 'GET',
        url: harnessUrl,
        headers: supervisor
      })
      expect(harness.statusCode).toBe(200)
      expect(harness.json().data.events).toEqual([])
      const wrongPair = await server.inject({
        method: 'GET',
        url: `/v1/cases/harness/conversations/${seeded.conversationId}/sessions/sess_other/audit`,
        headers: supervisor
      })
      expect(wrongPair.statusCode).toBe(404)
      const core = await server.inject({
        method: 'GET',
        url: `/v1/audit/sessions/${seeded.sessionId}`,
        headers: supervisor
      })
      expect(core.json().data.events.length).toBeGreaterThan(0)
      // A core grant does not open the harness case with the same id.
      await grantCase(server, {
        kind: 'core_conversation',
        resourceId: seeded.conversationId,
        operatorId: 'operator.pg.h'
      })
      const operatorHarness = await server.inject({
        method: 'GET',
        url: harnessUrl,
        headers: as('operator.pg.h', 'Operator')
      })
      expect(operatorHarness.statusCode).toBe(404)
      // A payload that claims the session never creates a link.
      await admin.query(
        `INSERT INTO ${schema}.audit_events
           (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at)
         VALUES ($1, 'audit_forged_claim', 'integration_event', 'System', 'forger',
                 'corr_forged', 'v1', $2::jsonb, now())`,
        [
          TENANT,
          JSON.stringify({ tenantId: TENANT, sessionId: seeded.sessionId })
        ]
      )
      const afterForge = await server.inject({
        method: 'GET',
        url: `/v1/audit/sessions/${seeded.sessionId}`,
        headers: supervisor
      })
      expect(afterForge.body).not.toContain('audit_forged_claim')
    } finally {
      await server.close()
    }
  })

  it('AUTH11 — RLS, least privilege, lineage triggers and the semantic preflight', async () => {
    const role = await runtimePool.query<{
      rolsuper: boolean
      rolbypassrls: boolean
    }>(
      `SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user`
    )
    expect(role.rows[0]).toEqual({ rolsuper: false, rolbypassrls: false })
    const client = await runtimePool.connect()
    try {
      await assertCaseAuthorizationSchema(client)
      await client.query('BEGIN')
      await client.query(`SELECT set_config('cvg.tenant_id', $1, true)`, [
        OTHER_TENANT
      ])
      const invisible = await client.query(
        `SELECT COUNT(*)::int AS total FROM case_roots`
      )
      expect(invisible.rows[0]).toEqual({ total: 0 })
      await expect(
        client.query(
          `INSERT INTO case_principals (tenant_id, operator_id, role, active, revision,
             identity_source, authority_version, proof_digest, updated_at)
           VALUES ($1, 'operator.cross', 'Operator', true, 1, 'synthetic_fixture',
             'v1', repeat('a', 64), now())`,
          [TENANT]
        )
      ).rejects.toThrow(/row-level security/)
      await client.query('ROLLBACK')
      const noContext = await client.query(
        `SELECT COUNT(*)::int AS total FROM case_assignments`
      )
      expect(noContext.rows[0]).toEqual({ total: 0 })
    } finally {
      client.release()
    }

    const roots = await admin.query<{
      case_id: string
      core_conversation_id: string
    }>(
      `SELECT case_id, core_conversation_id FROM ${schema}.case_roots
        WHERE kind = 'core_conversation' ORDER BY created_at LIMIT 2`
    )
    const [first, second] = roots.rows
    const otherSession = await admin.query<{ id: string }>(
      `SELECT id FROM ${schema}.sessions WHERE conversation_id = $1`,
      [second!.core_conversation_id]
    )
    await admin.query(
      `INSERT INTO ${schema}.audit_events
         (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload, created_at)
       VALUES ($1, 'audit_lineage_probe', 'integration_event', 'System', 'probe',
               'corr_probe', 'v1', $2::jsonb, now())`,
      [TENANT, JSON.stringify({ tenantId: TENANT })]
    )
    await expect(
      admin.query(
        `INSERT INTO ${schema}.case_audit_links
           (tenant_id, audit_event_id, case_id, core_session_id, created_at)
         VALUES ($1, 'audit_lineage_probe', $2, $3, now())`,
        [TENANT, first!.case_id, otherSession.rows[0]!.id]
      )
    ).rejects.toThrow(/lineage mismatch/)
    await expect(
      admin.query(
        `UPDATE ${schema}.case_roots SET created_at = now() WHERE case_id = $1`,
        [first!.case_id]
      )
    ).rejects.toThrow(/immutable/)
    await expect(
      admin.query(`DELETE FROM ${schema}.case_assignments`)
    ).rejects.toThrow(/immutable/)
    await expect(
      admin.query(
        `UPDATE ${schema}.case_assignments SET revision = revision + 2`
      )
    ).rejects.toThrow(/CAS revision/)

    // Weakened catalog → preflight refuses (not only a name lookup).
    const corruptions: Array<[string, string]> = [
      [
        `ALTER TABLE ${schema}.case_assignments DISABLE TRIGGER case_assignments_revision`,
        `ALTER TABLE ${schema}.case_assignments ENABLE TRIGGER case_assignments_revision`
      ],
      [
        `ALTER TABLE ${schema}.case_assignments DROP CONSTRAINT case_assignments_status_check, ADD CONSTRAINT case_assignments_status_check CHECK (status IS NOT NULL)`,
        `ALTER TABLE ${schema}.case_assignments DROP CONSTRAINT case_assignments_status_check, ADD CONSTRAINT case_assignments_status_check CHECK (status IN ('ACTIVE', 'REVOKED'))`
      ],
      [
        `ALTER TABLE ${schema}.case_execution_links DROP CONSTRAINT case_execution_links_root_fk`,
        `ALTER TABLE ${schema}.case_execution_links ADD CONSTRAINT case_execution_links_root_fk FOREIGN KEY (tenant_id, case_id) REFERENCES ${schema}.case_roots (tenant_id, case_id)`
      ]
    ]
    for (const [corrupt, restore] of corruptions) {
      await admin.query(corrupt)
      const check = await runtimePool.connect()
      try {
        await expect(assertCaseAuthorizationSchema(check)).rejects.toThrow(
          /case authorization/
        )
      } finally {
        check.release()
        await admin.query(restore)
      }
    }
    const restored = await runtimePool.connect()
    try {
      await assertCaseAuthorizationSchema(restored)
    } finally {
      restored.release()
    }
  })

  it('AUTH11/AUTH13 — function bodies, trigger timing, pinned search_path and smaller deadlines', async () => {
    const original = await admin.query<{ definition: string }>(
      `SELECT pg_get_functiondef('${schema}.case_audit_link_lineage()'::regprocedure) AS definition`
    )
    const corruptions: Array<[string, string]> = [
      [
        `CREATE OR REPLACE FUNCTION ${schema}.case_audit_link_lineage() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$`,
        original.rows[0]!.definition
      ],
      [
        `ALTER FUNCTION ${schema}.case_execution_link_lineage() RESET search_path`,
        `ALTER FUNCTION ${schema}.case_execution_link_lineage() SET search_path = ${schema}, pg_temp`
      ],
      [
        `DROP TRIGGER case_execution_links_lineage ON ${schema}.case_execution_links; CREATE TRIGGER case_execution_links_lineage AFTER INSERT ON ${schema}.case_execution_links FOR EACH ROW EXECUTE FUNCTION ${schema}.case_execution_link_lineage()`,
        `DROP TRIGGER case_execution_links_lineage ON ${schema}.case_execution_links; CREATE TRIGGER case_execution_links_lineage BEFORE INSERT ON ${schema}.case_execution_links FOR EACH ROW EXECUTE FUNCTION ${schema}.case_execution_link_lineage()`
      ]
    ]
    for (const [corrupt, restore] of corruptions) {
      await admin.query(corrupt)
      const check = await runtimePool.connect()
      try {
        await expect(assertCaseAuthorizationSchema(check)).rejects.toThrow(
          /case authorization/
        )
      } finally {
        check.release()
        await admin.query(restore)
      }
    }
    const restored = await runtimePool.connect()
    try {
      await assertCaseAuthorizationSchema(restored)
    } finally {
      restored.release()
    }

    // A role without the 0029 privileges leaves completion events unlinked
    // instead of aborting the worker transaction.
    const limitedRole = `${runtimeRole}_nolink`
    await admin.query(
      `CREATE ROLE ${limitedRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS`
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${limitedRole}`)
    const limitedUrl = new URL(testDatabaseUrl as string)
    limitedUrl.username = limitedRole
    limitedUrl.password = runtimePassword
    const limited = new Client({
      connectionString: limitedUrl.toString(),
      options: `-c search_path=${schema}`
    })
    await limited.connect()
    try {
      await expect(
        linkAuditEventToCoreSessionWhenAvailable(
          limited,
          TENANT,
          'audit_absent',
          'sess_absent',
          new Date()
        )
      ).resolves.toBe(false)
    } finally {
      await limited.end()
      await admin.query(`DROP OWNED BY ${limitedRole}`)
      await admin.query(`DROP ROLE ${limitedRole}`)
    }

    // A smaller configured statement deadline prevails over the unit budget.
    const strictPool = new Pool({
      connectionString: runtimeUrl(),
      max: 1,
      options: '-c statement_timeout=2s -c lock_timeout=500ms'
    })
    try {
      const strict = new PostgresCaseAuthority(strictPool as never, {
        mode: 'pool'
      })
      const settings = await strict.readSnapshot(TENANT, async (snapshot) => {
        const statement = await snapshot.queryable!.query<{
          statement_timeout: string
        }>('SHOW statement_timeout')
        const lock = await snapshot.queryable!.query<{
          lock_timeout: string
        }>('SHOW lock_timeout')
        return [
          statement.rows[0]?.statement_timeout,
          lock.rows[0]?.lock_timeout
        ]
      })
      expect(settings).toEqual(['2s', '500ms'])
    } finally {
      await strictPool.end()
    }
  })

  it('AUTH12 — additive migration, no historical grant, checkpointed idempotent backfill', async () => {
    const legacySchema = `${schema}_legacy`
    const versions = [
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
    ]
    try {
      await runPostgresMigrations(admin, {
        schemaName: legacySchema,
        migrations: versions
      })
      await admin.query(`SET search_path TO ${legacySchema}`)
      for (const id of ['conv_hist_a', 'conv_hist_b', 'conv_hist_c']) {
        await admin.query(
          `INSERT INTO conversations (tenant_id, id, channel, sender_ref, sender_ref_hash, status, correlation_id)
           VALUES ($1, $2, 'web', 'synthetic', 'hash', 'active', 'corr_hist')`,
          [TENANT, id]
        )
      }
      await admin.query(
        `INSERT INTO audit_events (tenant_id, id, type, actor_type, actor_id, correlation_id, policy_version, payload)
         VALUES ($1, 'audit_hist', 'integration_event', 'System', 'api', 'corr_hist', 'v1', '{"sessionId":"sess_hist"}'::jsonb)`,
        [TENANT]
      )
      const auditBefore = await admin.query(
        `SELECT md5(string_agg(id || payload::text, ',' ORDER BY id)) AS digest FROM audit_events`
      )
      await runPostgresMigrations(admin, { schemaName: legacySchema })
      await runPostgresMigrations(admin, { schemaName: legacySchema })
      await admin.query(`SET search_path TO ${legacySchema}`)
      expect(await count(`SELECT COUNT(*) AS total FROM case_roots`)).toBe(0)
      expect(
        await count(`SELECT COUNT(*) AS total FROM case_assignments`)
      ).toBe(0)
      expect(
        await count(`SELECT COUNT(*) AS total FROM case_audit_links`)
      ).toBe(0)
      const legacyAuthority = new PostgresCaseAuthority(admin)
      const firstBatch = await legacyAuthority.backfillCoreRoots(TENANT, {
        afterConversationId: null,
        limit: 2
      })
      expect(firstBatch).toEqual({
        created: 2,
        lastConversationId: 'conv_hist_b'
      })
      // Restart from the checkpoint and replay the whole range: idempotent.
      const resumed = await legacyAuthority.backfillCoreRoots(TENANT, {
        afterConversationId: firstBatch.lastConversationId,
        limit: 2
      })
      expect(resumed).toEqual({ created: 1, lastConversationId: 'conv_hist_c' })
      const replay = await legacyAuthority.backfillCoreRoots(TENANT, {
        afterConversationId: null,
        limit: 100
      })
      expect(replay.created).toBe(0)
      expect(await count(`SELECT COUNT(*) AS total FROM case_roots`)).toBe(3)
      expect(
        await count(`SELECT COUNT(*) AS total FROM case_assignments`)
      ).toBe(0)
      const auditAfter = await admin.query(
        `SELECT md5(string_agg(id || payload::text, ',' ORDER BY id)) AS digest FROM audit_events`
      )
      expect(auditAfter.rows[0]).toEqual(auditBefore.rows[0])
      await expect(
        legacyAuthority.backfillCoreRoots(TENANT, {
          afterConversationId: null,
          limit: 101
        })
      ).rejects.toThrow(/Backfill batch/)
    } finally {
      await admin.query(`SET search_path TO public`)
      await admin.query(`DROP SCHEMA IF EXISTS ${legacySchema} CASCADE`)
    }
  })

  it('AUTH13 — outage is 503, never 200/404, and logs carry no content', async () => {
    const logs: unknown[] = []
    const brokenPool = {
      connect: async () => {
        throw new Error('synthetic connection outage')
      }
    }
    const server = buildServer({
      persistence: { kind: 'postgres-pool', pool: runtimePool as never },
      caseAuthority: new PostgresCaseAuthority(brokenPool as never),
      runtimeLogger: (entry) => logs.push(entry)
    })
    try {
      for (const url of [
        '/v1/conversations',
        '/v1/conversations/conv_x/timeline',
        '/v1/audit/sessions/sess_x',
        '/v1/executions/exec_x',
        '/v1/cases'
      ]) {
        const response = await server.inject({
          method: 'GET',
          url,
          headers: as('supervisor.pg.outage', 'Supervisor')
        })
        expect(response.statusCode, url).toBe(503)
        expect(response.json().error.code).toBe('configuration_error')
      }
      expect(JSON.stringify(logs)).not.toContain('synthetic connection outage')
    } finally {
      await server.close()
    }
    expect(managerHeaders()['x-operator-role']).toBe('Supervisor')
  })
})
