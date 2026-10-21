import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { RuntimeInput } from '@cvg/harness-contracts'
import type { TenantId } from '@cvg/platform'
import {
  PostgresEffectJournal,
  runPostgresMigrations,
  TENANT_ONLY_TABLES,
  TENANT_SCHEMA_TABLES,
  withTenantContext
} from '@cvg/persistence'
import { assertPostgresKernelPrerequisites } from '../kernel-composition.ts'
import { createControlledNoopHandlers } from '../postgres-controlled.ts'
import { createPostgresControlledWorker } from '../postgres-controlled.ts'
import {
  assertPostgresWorkerPreflight,
  OPERATIONAL_HARNESS_CRITICAL_TABLES,
  WORKER_CRITICAL_TABLES
} from '../postgres-role-preflight.ts'
import {
  assertOperationalHarnessPostgresPreflight,
  createOperationalHarnessWorker
} from '../operational-harness-worker.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const describeWithPostgres = testDatabaseUrl ? describe : describe.skip

const tenant = 'tenant_00000000-0000-4000-8000-000000000821' as TenantId

function roleUrl(username: string, password: string): string {
  const parsed = new URL(testDatabaseUrl as string)
  parsed.username = username
  parsed.password = password
  return parsed.toString()
}

function operationalRuntime(): RuntimeInput {
  return {
    agent: {
      id: 'agent.worker.pg.synthetic' as RuntimeInput['agent']['id'],
      version: 'v1' as RuntimeInput['agent']['version'],
      objective: 'operational worker role fixture',
      instructions: ['synthetic only'],
      skills: [],
      tools: [],
      policies: []
    },
    tenantId: tenant as RuntimeInput['tenantId'],
    conversationId:
      'conversation_worker_pg_synthetic' as RuntimeInput['conversationId'],
    sessionId: 'session_worker_pg_synthetic' as RuntimeInput['sessionId'],
    correlationId:
      'correlation_worker_pg_synthetic' as RuntimeInput['correlationId'],
    traceId: 'trace_worker_pg_synthetic' as RuntimeInput['traceId'],
    userMessage: 'operational worker role fixture',
    context: {
      values: { fixture: true },
      sourceIds: ['worker-role-preflight'],
      capturedAt: '2026-09-14T00:00:00.000Z'
    },
    state: { version: 1, values: {}, updatedAt: '2026-09-14T00:00:00.000Z' },
    budget: {
      maxSteps: 1,
      maxModelCalls: 1,
      maxToolCalls: 0,
      maxDurationMs: 10_000,
      maxCostUsd: 1,
      maxTokens: 100
    }
  }
}

describeWithPostgres('worker PostgreSQL role preflight', () => {
  const suffix = `${Date.now()}_${randomBytes(3).toString('hex')}`
  const schema = `cvg_worker_preflight_${suffix}`
  const emptySchema = `cvg_worker_preflight_empty_${suffix}`
  const password = 'synthetic-role-password'
  let admin: Client
  const createdRoles: string[] = []

  const createRole = async (
    label: string,
    clauses: string
  ): Promise<string> => {
    const name = `cvg_worker_${label}_${suffix}`
    await admin.query(
      `CREATE ROLE ${name} LOGIN PASSWORD '${password}' ${clauses}`
    )
    createdRoles.push(name)
    return name
  }

  const grantValidWorkerPrivileges = async (role: string): Promise<void> => {
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE ON ${WORKER_CRITICAL_TABLES.map(
        (table) => `${schema}.${table}`
      ).join(', ')} TO ${role}`
    )
    await admin.query(`ALTER ROLE ${role} SET search_path TO ${schema}`)
  }

  const grantOperationalHarnessPrivileges = async (
    role: string
  ): Promise<void> => {
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE ON ${OPERATIONAL_HARNESS_CRITICAL_TABLES.map(
        (table) => `${schema}.${table}`
      ).join(', ')} TO ${role}`
    )
    await admin.query(`ALTER ROLE ${role} SET search_path TO ${schema}`)
  }

  beforeAll(async () => {
    if (!testDatabaseUrl) return
    admin = new Client({ connectionString: testDatabaseUrl })
    await admin.connect()
    await runPostgresMigrations(admin, { schemaName: schema })
    await admin.query(`CREATE SCHEMA ${emptySchema}`)
  })

  afterAll(async () => {
    if (!testDatabaseUrl) return
    for (const role of createdRoles) {
      await admin.query(`DROP OWNED BY ${role} CASCADE`).catch(() => undefined)
      await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => undefined)
    }
    await admin
      .query(`DROP SCHEMA IF EXISTS ${emptySchema} CASCADE`)
      .catch(() => undefined)
    await admin
      .query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      .catch(() => undefined)
    await admin?.end().catch(() => undefined)
  })

  const poolFor = (role: string, schemaName = schema, max = 2): Pool =>
    new Pool({
      connectionString: roleUrl(role, password),
      max,
      options: `-c search_path=${schemaName}`
    })

  // SPEC0249 AC01/AC02 (AUD-0621 F05): the kernel's effect journal and
  // approvals belong to the worker's critical inventory, and the expiry sweep
  // never leaves the tenant even when RLS is missing on the journal.
  const grantInventory = async (role: string): Promise<void> => {
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    for (const table of TENANT_SCHEMA_TABLES) {
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE ON ${schema}."${table}" TO ${role}`
      )
    }
    await admin.query(`ALTER ROLE ${role} SET search_path TO ${schema}`)
  }

  const withJournalRlsDisabled = async (
    run: () => Promise<void>
  ): Promise<void> => {
    await admin.query(
      `ALTER TABLE ${schema}.effect_journal DISABLE ROW LEVEL SECURITY`
    )
    try {
      await run()
    } finally {
      await admin.query(
        `ALTER TABLE ${schema}.effect_journal ENABLE ROW LEVEL SECURITY`
      )
    }
  }

  it('SPEC0249 AC01: the worker preflight refuses an effect journal without RLS', async () => {
    const role = await createRole(
      'p0249a',
      'NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantInventory(role)
    const pool = poolFor(role)
    try {
      await assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      await withJournalRlsDisabled(async () => {
        await expect(
          assertPostgresWorkerPreflight(pool, { tenantId: tenant })
        ).rejects.toThrow(/tenant-isolated/)
      })
    } finally {
      await pool.end()
    }
  })

  it('SPEC0249 AC01: the kernel prerequisites refuse an effect journal without RLS', async () => {
    const role = await createRole(
      'p0249b',
      'NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantInventory(role)
    const pool = poolFor(role)
    try {
      await assertPostgresKernelPrerequisites(pool, tenant)
      await withJournalRlsDisabled(async () => {
        await expect(
          assertPostgresKernelPrerequisites(pool, tenant)
        ).rejects.toMatchObject({
          code: 'kernel_runtime_prerequisites_missing'
        })
      })
    } finally {
      await pool.end()
    }
  })

  it('SPEC0249 AC01: the journal expiry sweep stays inside the tenant without RLS', async () => {
    const role = await createRole(
      'p0249c',
      'NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantInventory(role)
    const pool = poolFor(role)
    const foreignTenant = 'tenant_00000000-0000-4000-8000-000000000822'
    const operationKey = `p0249-foreign-reservation-${suffix}`
    try {
      await withJournalRlsDisabled(async () => {
        await admin.query(
          `INSERT INTO ${schema}.effect_journal
             (tenant_id, operation_key, proposal_hash, state, attempt_id, expires_at)
           VALUES ($1, $2, $3, 'RESERVED', 'synthetic-attempt', '2026-10-01T00:00:00Z')`,
          [foreignTenant, operationKey, 'a'.repeat(64)]
        )
        await withTenantContext(pool, tenant, (client) =>
          new PostgresEffectJournal(client).releaseExpired(
            new Date('2026-10-22T12:00:00.000Z'),
            30_000
          )
        )
        const row = await admin.query<{ tenant_id: string; state: string }>(
          `SELECT tenant_id, state FROM ${schema}.effect_journal
            WHERE operation_key = $1`,
          [operationKey]
        )
        expect(row.rows).toEqual([
          { tenant_id: foreignTenant, state: 'RESERVED' }
        ])
      })
    } finally {
      await pool.end()
    }
  })

  it('rejects an additional permissive policy before any claim', async () => {
    const role = await createRole('policy', 'NOSUPERUSER NOBYPASSRLS')
    await grantValidWorkerPrivileges(role)
    const pool = poolFor(role)
    try {
      await assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      await admin.query(
        `CREATE POLICY synthetic_allow_all ON ${schema}.outbox_events FOR ALL USING (true) WITH CHECK (true)`
      )
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/policies/)
    } finally {
      await admin.query(
        `DROP POLICY IF EXISTS synthetic_allow_all ON ${schema}.outbox_events`
      )
      await pool.end()
    }
  })

  it('rejects missing effect privileges and forbidden privileges on any critical table', async () => {
    const role = await createRole('effectpriv', 'NOSUPERUSER NOBYPASSRLS')
    await grantValidWorkerPrivileges(role)
    const pool = poolFor(role)
    try {
      await admin.query(
        `REVOKE INSERT ON ${schema}.outbox_effects FROM ${role}`
      )
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/privileges/)
      await admin.query(`GRANT INSERT ON ${schema}.outbox_effects TO ${role}`)
      await assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      await admin.query(`GRANT DELETE ON ${schema}.tasks TO ${role}`)
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/privileges/)
    } finally {
      await pool.end()
    }
  })

  it('rejects a superuser role', async () => {
    const role = await createRole('super', 'SUPERUSER')
    const pool = poolFor(role)
    try {
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/non-superuser/)
    } finally {
      await pool.end()
    }
  })

  it('rejects a BYPASSRLS role', async () => {
    const role = await createRole(
      'bypass',
      'NOSUPERUSER BYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantValidWorkerPrivileges(role)
    const pool = poolFor(role)
    try {
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/non-superuser/)
    } finally {
      await pool.end()
    }
  })

  it('rejects a role that inherits another role', async () => {
    const role = await createRole(
      'member',
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantValidWorkerPrivileges(role)
    await admin.query(`GRANT pg_read_all_data TO ${role}`)
    const pool = poolFor(role)
    try {
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/must not inherit other roles/)
    } finally {
      await pool.end()
    }
  })

  it('rejects a role that owns a tenant-isolated table', async () => {
    const role = await createRole(
      'owner',
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantValidWorkerPrivileges(role)
    await admin.query(`ALTER TABLE ${schema}.outbox_events OWNER TO ${role}`)
    const pool = poolFor(role)
    try {
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/tenant-isolated and not owned/)
    } finally {
      await pool.end()
      await admin.query(
        `ALTER TABLE ${schema}.outbox_events OWNER TO CURRENT_USER`
      )
    }
  })

  it('rejects a role that can create schema objects', async () => {
    const role = await createRole(
      'ddl',
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantValidWorkerPrivileges(role)
    await admin.query(`GRANT CREATE ON SCHEMA ${schema} TO ${role}`)
    const pool = poolFor(role)
    try {
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/must not create schema objects/)
    } finally {
      await pool.end()
    }
  })

  it('rejects a role without the tenant-isolated schema', async () => {
    const role = await createRole(
      'noschema',
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await admin.query(`GRANT USAGE ON SCHEMA ${emptySchema} TO ${role}`)
    const pool = poolFor(role, emptySchema)
    try {
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/missing tenant-isolated tables/)
    } finally {
      await pool.end()
    }
  })

  it('rejects a role with non-minimal outbox privileges', async () => {
    const role = await createRole(
      'broad',
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantValidWorkerPrivileges(role)
    await admin.query(`GRANT DELETE ON ${schema}.outbox_events TO ${role}`)
    const pool = poolFor(role)
    try {
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/minimal \(select\/insert\/update only\)/)
    } finally {
      await pool.end()
      await admin.query(`REVOKE DELETE ON ${schema}.outbox_events FROM ${role}`)
    }
  })

  it('accepts a minimal role and consumes an event', async () => {
    const role = await createRole(
      'valid',
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantValidWorkerPrivileges(role)
    const pool = poolFor(role)
    try {
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).resolves.toBeUndefined()

      const repositoryPool = new Pool({
        connectionString: testDatabaseUrl,
        options: `-c search_path=${schema}`
      })
      try {
        const { TenantScopedPostgresRuntimeRepository } =
          await import('@cvg/persistence')
        const repository = new TenantScopedPostgresRuntimeRepository(
          repositoryPool
        )
        const seeded = await repository.enqueue({
          tenantId: tenant,
          type: 'message.outbound',
          payload: { fixture: 'worker-preflight-valid-role' },
          idempotencyKey: `worker-preflight-valid-${suffix}`,
          correlationId: 'corr_00000000-0000-4000-8000-000000000821'
        })
        const runtime = createPostgresControlledWorker(
          {
            NODE_ENV: 'test',
            DATABASE_URL: roleUrl(role, password),
            POSTGRES_SCHEMA: schema,
            POSTGRES_RLS_ENFORCEMENT: 'true',
            CVG_WORKER_CONTROLLED_MODE: 'true',
            CVG_WORKER_TENANT_ID: tenant,
            CVG_WORKER_MAX_EVENTS: '5'
          },
          createControlledNoopHandlers()
        )
        try {
          const drained = await runtime.worker.drain(5)
          expect(drained.processed).toBeGreaterThanOrEqual(1)
          const stored = await repository.findOutboxById(tenant, seeded.id)
          expect(stored?.status).toBe('processed')
        } finally {
          await runtime.pool.end()
        }
      } finally {
        await repositoryPool.end()
      }
    } finally {
      await pool.end()
    }
  })

  it('preflights and runs the neutral operational worker with a minimal role', async () => {
    const role = await createRole(
      'operational',
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantOperationalHarnessPrivileges(role)
    const runtime = createOperationalHarnessWorker({
      NODE_ENV: 'test',
      DATABASE_URL: roleUrl(role, password),
      POSTGRES_SCHEMA: schema,
      CVG_WORKER_TENANT_ID: tenant,
      CVG_WORKER_ID: 'worker-operational-role-proof'
    })
    try {
      await expect(
        assertOperationalHarnessPostgresPreflight(runtime)
      ).resolves.toBeUndefined()

      const submitted = await runtime.store.submit({
        tenantId: tenant,
        idempotencyKey: `worker-operational-role-${suffix}`,
        runtime: operationalRuntime()
      })
      const processed = await runtime.worker.processNext()
      expect(processed.kind).toBe('processed')
      if (processed.kind === 'processed') {
        expect(processed.record.state).toBe('SUCCEEDED')
        expect(processed.record.result?.response).toBe('Acknowledged.')
      }
      const stored = await runtime.store.get(tenant, submitted.record.id)
      expect(stored?.state).toBe('SUCCEEDED')
      expect(
        (await runtime.store.listEvents(tenant, submitted.record.id)).map(
          (event) => event.type
        )
      ).toContain('SUCCEEDED')
    } finally {
      await runtime.close()
    }
  })

  it('clears the tenant context of the same pool connection after a rejected preflight', async () => {
    const role = await createRole(
      'cleanup',
      'NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION'
    )
    await grantValidWorkerPrivileges(role)
    await admin.query(`GRANT CREATE ON SCHEMA ${schema} TO ${role}`)
    const pool = poolFor(role, schema, 1)
    try {
      await expect(
        assertPostgresWorkerPreflight(pool, { tenantId: tenant })
      ).rejects.toThrow(/must not create schema objects/)
      const leaked = await pool.query<{ tenant_id: string | null }>(
        `SELECT NULLIF(current_setting('cvg.tenant_id', true), '') AS tenant_id`
      )
      expect(leaked.rows[0]?.tenant_id).toBeNull()
    } finally {
      await pool.end()
    }
  })

  it('destroys a connection whose tenant context cannot be cleared', async () => {
    let releasedWith: Error | undefined
    const criticalTableRows = WORKER_CRITICAL_TABLES.map((table) => ({
      relname: table,
      owner: 'someone_else',
      relrowsecurity: true,
      relforcerowsecurity: true
    }))
    const client = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('set_config')) {
          if (params?.[1] === '') throw new Error('context reset failed')
          return { rows: [] }
        }
        if (sql.includes('FROM pg_roles')) {
          return {
            rows: [
              {
                rolname: 'fake_runtime',
                rolsuper: false,
                rolbypassrls: false,
                rolcreatedb: false,
                rolcreaterole: false,
                rolreplication: false
              }
            ]
          }
        }
        if (sql.includes('pg_auth_members')) return { rows: [{ count: 0 }] }
        if (sql.includes('pg_database')) {
          return { rows: [{ owner: 'someone_else' }] }
        }
        if (sql.includes('has_schema_privilege')) {
          return { rows: [{ can_create: false }] }
        }
        if (sql.includes('FROM pg_class')) return { rows: criticalTableRows }
        if (sql.includes('FROM pg_policies')) {
          return {
            rows: WORKER_CRITICAL_TABLES.map((table) => {
              const tenantExpression =
                "tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
              // SPEC0249: the worker inventory is the canonical tenant
              // inventory, so the policy kind comes from it too.
              const expression = TENANT_ONLY_TABLES.has(table)
                ? tenantExpression
                : `tenant_isolation_quarantined = false AND ${tenantExpression}`
              return {
                tablename: table,
                policyname: `${table}_tenant_isolation`,
                permissive: 'PERMISSIVE',
                roles: '{public}',
                cmd: 'ALL',
                qual: expression,
                with_check: expression
              }
            })
          }
        }
        if (sql.includes('has_table_privilege')) {
          return {
            rows: WORKER_CRITICAL_TABLES.map(() => ({
              can_select: true,
              can_insert: true,
              can_update: true,
              can_delete: false,
              can_truncate: false,
              can_trigger: false,
              can_references: false
            }))
          }
        }
        return { rows: [] }
      },
      release: (error?: Error) => {
        releasedWith = error
      }
    }
    const pool = {
      connect: async () => client
    } as unknown as Parameters<typeof assertPostgresWorkerPreflight>[0]
    await expect(
      assertPostgresWorkerPreflight(pool, { tenantId: tenant })
    ).rejects.toThrow(/context reset failed/)
    expect(releasedWith).toBeInstanceOf(Error)
  })
})
