/**
 * SPEC0254 §7 — PostgreSQL environment of O6 (PG), O9 and O10: unique data
 * and auth schemas, a migration owner, a runtime role (NOSUPERUSER
 * NOBYPASSRLS), a dedicated session role and the auth-schema owner, created
 * as in `production-bootstrap-postgres-own.test.ts` (without its production
 * stub). Runs only on a disposable database (`TEST_DATABASE_URL`); it never
 * changes PUBLIC grants or objects of other fixtures.
 */
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import {
  TENANT_SCHEMA_TABLES,
  runPostgresMigrations,
  tenantRuntimeGrantPrivileges
} from '@cvg/persistence'
import {
  grantOperatorSessionFunctions,
  runOperatorSessionMigrations
} from '../../../../../packages/persistence/src/operator-session-migrations.ts'

export interface OidcPostgresFixture {
  /** PG part of the §7 environment (NODE_ENV and OIDC variables excluded). */
  readonly env: NodeJS.ProcessEnv
  readonly admin: Client
  readonly data: string
  readonly auth: string
  readonly roles: {
    readonly migration: string
    readonly runtime: string
    readonly session: string
    readonly owner: string
  }
  readonly password: string
  close(): Promise<void>
}

export async function createOidcPostgresFixture(
  databaseUrl: string
): Promise<OidcPostgresFixture> {
  const suffix = randomBytes(6).toString('hex')
  const data = `cvg_oidc0254_data_${suffix}`
  const auth = `cvg_oidc0254_auth_${suffix}`
  const roles = {
    migration: `cvg_oidc0254_mig_${suffix}`,
    owner: `cvg_oidc0254_owner_${suffix}`,
    runtime: `cvg_oidc0254_rt_${suffix}`,
    session: `cvg_oidc0254_sess_${suffix}`
  }
  const password = `synthetic_${randomBytes(12).toString('hex')}`
  const urlFor = (role: string) => {
    const url = new URL(databaseUrl)
    url.username = role
    url.password = password
    return url.toString()
  }
  const admin = new Client({ connectionString: databaseUrl })
  await admin.connect()
  const close = async () => {
    await admin.query(`DROP SCHEMA IF EXISTS ${auth} CASCADE`).catch(() => {})
    await admin.query(`DROP SCHEMA IF EXISTS ${data} CASCADE`).catch(() => {})
    for (const role of Object.values(roles)) {
      await admin
        .query(
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = $1`,
          [role]
        )
        .catch(() => {})
      await admin.query(`DROP OWNED BY ${role}`).catch(() => {})
      await admin.query(`DROP ROLE IF EXISTS ${role}`).catch(() => {})
    }
    await admin.end().catch(() => {})
  }
  try {
    for (const role of Object.values(roles)) {
      await admin.query(
        `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`
      )
    }
    const database = (
      await admin.query<{ name: string }>('SELECT current_database() AS name')
    ).rows[0]!.name
    const quotedDatabase = `"${database.replaceAll('"', '""')}"`
    await admin.query(`CREATE SCHEMA ${data} AUTHORIZATION ${roles.migration}`)
    await admin.query(`GRANT USAGE ON SCHEMA ${data} TO ${roles.runtime}`)
    await admin.query(`ALTER ROLE ${roles.migration} SET search_path = ${data}`)
    await admin.query(`ALTER ROLE ${roles.runtime} SET search_path = ${data}`)
    const migration = new Client({ connectionString: urlFor(roles.migration) })
    await migration.connect()
    try {
      await runPostgresMigrations(migration, {
        schemaName: data,
        createSchema: false
      })
    } finally {
      await migration.end()
    }
    await admin.query(
      `GRANT CREATE ON DATABASE ${quotedDatabase} TO ${roles.owner}`
    )
    const owner = new Client({ connectionString: urlFor(roles.owner) })
    await owner.connect()
    try {
      await runOperatorSessionMigrations(owner, auth, data)
      await grantOperatorSessionFunctions(owner, auth, roles.session)
    } finally {
      await owner.end()
    }
    await admin.query(
      `REVOKE CREATE ON DATABASE ${quotedDatabase} FROM ${roles.owner}`
    )
    for (const table of TENANT_SCHEMA_TABLES) {
      await admin.query(
        `GRANT ${tenantRuntimeGrantPrivileges(table)} ON ${data}.${table} TO ${roles.runtime}`
      )
    }
    await admin.query(
      `GRANT SELECT ON ${data}.schema_migrations TO ${roles.runtime}`
    )
    await admin.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ${data}.webhook_replay_events,${data}.rate_limit_buckets TO ${roles.runtime}`
    )
  } catch (error) {
    await close()
    throw error
  }
  return {
    env: {
      API_PERSISTENCE_MODE: 'postgres',
      DATABASE_URL: urlFor(roles.runtime),
      DATABASE_MIGRATION_URL: urlFor(roles.migration),
      POSTGRES_SCHEMA: data,
      POSTGRES_RLS_ENFORCEMENT: 'true',
      POSTGRES_AUTO_MIGRATE: 'false',
      CVG_OPERATOR_SESSION_DATABASE_URL: urlFor(roles.session),
      CVG_OPERATOR_AUTH_SCHEMA: auth,
      CVG_OPERATOR_SESSION_ROLE: roles.session,
      CVG_RATE_LIMIT_KEYRING: JSON.stringify({
        budgetSecret: randomBytes(32).toString('base64url'),
        current: {
          keyId: 'oidc0254-rate',
          secret: randomBytes(32).toString('base64url')
        }
      })
    },
    admin,
    data,
    auth,
    roles,
    password,
    close
  }
}
