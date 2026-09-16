import pg from '/home/ricardo/cvg-agent-secretary-v2/node_modules/pg/lib/index.js'
import {
  runPostgresMigrations,
  withTenantContext,
  type PostgresPoolLike
} from '/home/ricardo/cvg-agent-secretary-v2/packages/persistence/src/index.ts'
import {
  assertPostgresWorkerPreflight,
  WORKER_CRITICAL_TABLES
} from '/home/ricardo/cvg-agent-secretary-v2/apps/worker/src/postgres-role-preflight.ts'

const { Client, Pool } = pg
const DATABASE_URL = 'postgres://cvg_prod@127.0.0.1:55481/critic3_preflight'
const schema = 'critic3_preflight'
const tenantA = 'tenant_00000000-0000-4000-8000-000000000911'
const tenantB = 'tenant_00000000-0000-4000-8000-000000000912'
const suffix = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`
const roleName = `critic3_worker_${suffix}`
const results: Record<string, unknown>[] = []
const errors: string[] = []

async function expectReject(pool: unknown, label: string, pattern: RegExp) {
  try {
    await assertPostgresWorkerPreflight(pool as never, {
      tenantId: tenantA as never
    })
    results.push({
      case: label,
      rejected: false,
      detail: 'ACCEPTED (unexpected)'
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    results.push({
      case: label,
      rejected: true,
      patternMatched: pattern.test(message),
      message
    })
  }
}

async function main(): Promise<void> {
  const admin = new Client({ connectionString: DATABASE_URL })
  await admin.connect()
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await admin.query(`DROP ROLE IF EXISTS ${roleName}`)
  await runPostgresMigrations(admin, { schemaName: schema })
  await admin.query(
    `INSERT INTO outbox_events(id,type,payload,status,tenant_id,idempotency_key,correlation_id,available_at)
     VALUES('ob_critic3_b','synthetic','{}','pending',$1,'critic3-b','corr_00000000-0000-4000-8000-000000000912',now())`,
    [tenantB]
  )
  await admin.query(
    `CREATE ROLE ${roleName} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
  )
  await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${roleName}`)
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON ${WORKER_CRITICAL_TABLES.map((t) => `${schema}.${t}`).join(', ')} TO ${roleName}`
  )
  const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 2,
    options: `-c search_path=${schema},public`
  })
  const rolePool = {
    connect: async () => {
      const client = await pool.connect()
      return {
        query: async (sql: string, args?: unknown[]) => {
          if (sql.includes('current_user')) {
            await client.query(
              `SELECT set_config('role', '${roleName}', false)`
            )
          }
          return client.query(sql, args)
        },
        release: (error?: Error) => client.release(error)
      }
    }
  } as unknown as PostgresPoolLike

  // role-based connection instead of SET ROLE (closer to runtime)
  const directRolePool = new Pool({
    connectionString: `postgres://${roleName}@127.0.0.1:55481/critic3_preflight`,
    max: 2,
    options: `-c search_path=${schema},public`
  })

  // 1) minimal valid role passes
  try {
    await assertPostgresWorkerPreflight(
      directRolePool as unknown as PostgresPoolLike,
      { tenantId: tenantA as never }
    )
    results.push({
      case: 'minimal valid role passes',
      rejected: false,
      accepted: true
    })
  } catch (error) {
    results.push({
      case: 'minimal valid role passes',
      rejected: true,
      message: error instanceof Error ? error.message : String(error)
    })
  }

  // 2) demonstrate the unsafe policy would have allowed cross-tenant read
  await admin.query(
    `CREATE POLICY synthetic_allow_all ON ${schema}.outbox_events FOR ALL USING (true) WITH CHECK (true)`
  )
  const crossTenant = await withTenantContext(
    directRolePool as unknown as PostgresPoolLike,
    tenantA as never,
    async (client) => {
      const rows = await client.query<{ tenant_id: string }>(
        `SELECT tenant_id FROM outbox_events WHERE id = 'ob_critic3_b'`
      )
      return rows.rows
    }
  )
  results.push({
    case: 'extra permissive policy really enables cross-tenant read',
    tenantAReadsTenantBEvent: crossTenant.length === 1
  })
  // 3) preflight rejects that extra permissive policy
  await expectReject(
    directRolePool,
    'extra permissive policy rejected',
    /policies/
  )
  // 4) context is clean after the rejected preflight on the same pool
  const leaked = await directRolePool.query(
    `SELECT NULLIF(current_setting('cvg.tenant_id', true), '') AS tenant_id`
  )
  results.push({
    case: 'tenant context empty after rejected preflight',
    tenantId: leaked.rows[0]?.tenant_id
  })
  await admin.query(
    `DROP POLICY synthetic_allow_all ON ${schema}.outbox_events`
  )

  // 5) replace expected policy expression with permissive one -> reject
  await admin.query(
    `ALTER POLICY outbox_events_tenant_isolation ON ${schema}.outbox_events USING (true) WITH CHECK (true)`
  )
  await expectReject(
    directRolePool,
    'single policy with wrong expression rejected',
    /policies/
  )
  await admin.query(
    `ALTER POLICY outbox_events_tenant_isolation ON ${schema}.outbox_events USING (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')) WITH CHECK (tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), ''))`
  )

  // 6) revoke a required privilege on outbox_effects -> reject
  await admin.query(
    `REVOKE INSERT ON ${schema}.outbox_effects FROM ${roleName}`
  )
  await expectReject(
    directRolePool,
    'revoked INSERT on outbox_effects rejected',
    /privileges/
  )
  await admin.query(`GRANT INSERT ON ${schema}.outbox_effects TO ${roleName}`)

  // 7) forbidden privilege on tasks -> reject
  await admin.query(`GRANT DELETE ON ${schema}.tasks TO ${roleName}`)
  await expectReject(
    directRolePool,
    'forbidden DELETE on tasks rejected',
    /privileges|minimal/
  )
  await admin.query(`REVOKE DELETE ON ${schema}.tasks FROM ${roleName}`)

  // 8) missing RLS/FORCE: disable FORCE on sessions -> reject
  await admin.query(
    `ALTER TABLE ${schema}.sessions NO FORCE ROW LEVEL SECURITY`
  )
  await expectReject(
    directRolePool,
    'missing FORCE RLS rejected',
    /tenant-isolated|owned/
  )
  await admin.query(`ALTER TABLE ${schema}.sessions FORCE ROW LEVEL SECURITY`)

  // 9) role owns a critical table by grant of ownership -> reject
  await admin.query(`ALTER TABLE ${schema}.outbox_effects OWNER TO ${roleName}`)
  await expectReject(
    directRolePool,
    'role owning a critical table rejected',
    /tenant-isolated|owned/
  )
  await admin.query(`ALTER TABLE ${schema}.outbox_effects OWNER TO cvg_prod`)
  // Ownership roundtrip drops the role's explicit grants (observed PostgreSQL
  // behavior, checked separately) — re-grant the minimal set before the final check.
  await admin.query(
    `GRANT SELECT, INSERT, UPDATE ON ${WORKER_CRITICAL_TABLES.map((t) => `${schema}.${t}`).join(', ')} TO ${roleName}`
  )

  // 10) minimal role passes again after all mutations reverted
  try {
    await assertPostgresWorkerPreflight(
      directRolePool as unknown as PostgresPoolLike,
      { tenantId: tenantA as never }
    )
    results.push({ case: 'minimal role passes after reverts', accepted: true })
  } catch (error) {
    results.push({
      case: 'minimal role passes after reverts',
      accepted: false,
      message: error instanceof Error ? error.message : String(error)
    })
  }

  // 11) cleanup verification missing -> client destroyed (fake client, release gets Error)
  {
    let releaseArg: Error | undefined
    let verificationSeen = false
    const criticalRows = WORKER_CRITICAL_TABLES.map((table) => ({
      relname: table,
      owner: 'someone_else',
      relrowsecurity: true,
      relforcerowsecurity: true
    }))
    const fake = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('set_config')) return { rows: [] }
        if (sql.includes('current_setting')) {
          verificationSeen = true
          return { rows: [] }
        }
        if (sql.includes('FROM pg_roles')) {
          return {
            rows: [
              {
                rolname: 'fake_role',
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
        if (sql.includes('pg_database'))
          return { rows: [{ owner: 'someone_else' }] }
        if (sql.includes('has_schema_privilege'))
          return { rows: [{ can_create: false }] }
        if (sql.includes('FROM pg_class')) return { rows: criticalRows }
        if (sql.includes('FROM pg_policies')) {
          const tenantExpression =
            "tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
          return {
            rows: WORKER_CRITICAL_TABLES.map((table) => ({
              tablename: table,
              policyname: `${table}_tenant_isolation`,
              permissive: 'PERMISSIVE',
              roles: '{public}',
              cmd: 'ALL',
              qual: ['outbox_effects', 'outbox_attempts'].includes(table)
                ? tenantExpression
                : `tenant_isolation_quarantined = false AND ${tenantExpression}`,
              with_check: ['outbox_effects', 'outbox_attempts'].includes(table)
                ? tenantExpression
                : `tenant_isolation_quarantined = false AND ${tenantExpression}`
            }))
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
        void params
        return { rows: [] }
      },
      release: (error?: Error) => {
        releaseArg = error
      }
    }
    try {
      await assertPostgresWorkerPreflight(
        { connect: async () => fake } as never,
        { tenantId: tenantA as never }
      )
      results.push({ case: 'cleanup verification missing', rejected: false })
    } catch (error) {
      results.push({
        case: 'cleanup verification missing',
        rejected: true,
        verificationSeen,
        message: error instanceof Error ? error.message : String(error),
        clientDestroyed: releaseArg instanceof Error
      })
    }
  }

  await directRolePool.end()
  await pool.end()
  await admin.query(`DROP OWNED BY ${roleName} CASCADE`).catch(() => undefined)
  await admin.query(`DROP ROLE IF EXISTS ${roleName}`).catch(() => undefined)
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
  await admin.end()
  console.log(JSON.stringify({ results, errors }, null, 1))
}

main().catch((error) => {
  errors.push(
    error instanceof Error ? (error.stack ?? error.message) : String(error)
  )
  console.log(JSON.stringify({ results, errors }, null, 1))
  process.exit(1)
})
