import { createHash } from 'node:crypto'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import {
  CVG_TENANT_CONTEXT_SETTING,
  readPostgresMigrationSql,
  TENANT_READ_INSERT_TABLES,
  TENANT_SCHEMA_INVENTORY,
  TENANT_SCHEMA_TABLES,
  type PostgresPoolLike,
  type PostgresQueryable
} from '@cvg/persistence'

/**
 * Tables the PostgreSQL worker preflight verifies: every tenant-scoped table
 * of the canonical inventory (`TENANT_SCHEMA_TABLES`, AUD19-005), the same
 * set the API startup preflight checks and the migration job grants. Each one
 * must exist in the runtime schema with RLS + FORCE RLS enabled and exactly
 * its inventory policy, and the runtime role must not own it. Deriving the
 * list keeps a table the worker writes from being skipped by a hand-kept
 * list: the kernel's effect journal and approvals (SPEC0249, AUD-0621 F05;
 * a journal without RLS let one tenant's expiry sweep rewrite another
 * tenant's reservation) and any table a later migration adds to the
 * inventory. PROD-0373's liveness heartbeat and pause switch stay covered: an
 * unreadable switch keeps the worker paused.
 */
export const WORKER_CRITICAL_TABLES: readonly string[] = TENANT_SCHEMA_TABLES

/** Tables of the governed kernel whose isolation the kernel also checks. */
export const KERNEL_DURABLE_TABLES = [
  'effect_journal',
  'runtime_approvals'
] as const

export const OPERATIONAL_HARNESS_CRITICAL_TABLES = [
  'runtime_approvals',
  'operational_executions',
  'operational_execution_outbox',
  'operational_execution_events',
  'operational_effect_journal',
  'operational_execution_steps',
  'operational_execution_checkpoints'
] as const

export const OPERATIONAL_HARNESS_REQUIRED_MIGRATIONS = [
  '0015_runtime_approval_store',
  '0016_operational_execution_spine',
  '0017_runtime_approval_execution_binding',
  '0018_operational_execution_invariants',
  '0019_iterative_execution_steps',
  '0024_approval_decision_causality'
] as const

export interface PostgresWorkerPreflightOptions {
  tenantId: TenantId
  criticalTables?: readonly string[]
  requiredMigrations?: readonly string[]
}

interface RoleRow {
  rolname: string
  rolsuper: boolean
  rolbypassrls: boolean
  rolcreatedb: boolean
  rolcreaterole: boolean
  rolreplication: boolean
}

const ROLE_QUERY = `SELECT rolname, rolsuper, rolbypassrls, rolcreatedb,
                            rolcreaterole, rolreplication
                       FROM pg_roles
                      WHERE rolname = current_user
                      LIMIT 1`

const TENANT_EXPRESSION =
  "tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"

/**
 * The policy each critical table must carry, from the canonical tenant
 * inventory (`TENANT_SCHEMA_INVENTORY`). A table outside the inventory fails
 * closed: the worker never guesses how a table is isolated.
 */
function expectedTenantPolicy(table: string): {
  name: string
  expression: string
} {
  const entry = TENANT_SCHEMA_INVENTORY.find((item) => item.table === table)
  if (!entry) {
    throw new Error(
      'PostgreSQL worker tenant isolation policies are not verified'
    )
  }
  return {
    name: entry.policy,
    expression:
      entry.expression === 'tenant-only'
        ? TENANT_EXPRESSION
        : `tenant_isolation_quarantined = false AND ${TENANT_EXPRESSION}`
  }
}

/**
 * Verifies that every table exists in the current schema with RLS and FORCE
 * RLS enabled, is not owned by `forbiddenOwner` (the runtime role, when
 * given) and carries exactly the inventory policy.
 */
export async function assertTenantIsolatedTables(
  client: Pick<PostgresQueryable, 'query'>,
  criticalTables: readonly string[],
  options: { forbiddenOwner?: string } = {}
): Promise<void> {
  const tables = await client.query<{
    relname: string
    owner: string
    relrowsecurity: boolean
    relforcerowsecurity: boolean
  }>(
    `SELECT c.relname,
            pg_get_userbyid(c.relowner) AS owner,
            c.relrowsecurity,
            c.relforcerowsecurity
       FROM pg_class AS c
       INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = current_schema()
        AND c.relname = ANY($1::text[])`,
    [criticalTables]
  )
  if (tables.rows.length !== criticalTables.length) {
    throw new Error(
      'PostgreSQL worker schema is missing tenant-isolated tables'
    )
  }
  if (
    tables.rows.some(
      (table) =>
        (options.forbiddenOwner !== undefined &&
          table.owner === options.forbiddenOwner) ||
        !table.relrowsecurity ||
        !table.relforcerowsecurity
    )
  ) {
    throw new Error(
      'PostgreSQL worker tables must be tenant-isolated and not owned by the runtime role'
    )
  }

  const policies = await client.query<{
    tablename: string
    policyname: string
    permissive: string
    roles: string
    cmd: string
    qual: string | null
    with_check: string | null
  }>(
    `SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
       FROM pg_policies
      WHERE schemaname = current_schema() AND tablename = ANY($1::text[])`,
    [criticalTables]
  )
  for (const table of criticalTables) {
    const expected = expectedTenantPolicy(table)
    const tablePolicies = policies.rows.filter(
      (policy) => policy.tablename === table
    )
    const policy = tablePolicies[0]
    if (
      tablePolicies.length !== 1 ||
      !policy ||
      policy.policyname !== expected.name ||
      policy.permissive !== 'PERMISSIVE' ||
      policy.roles !== '{public}' ||
      policy.cmd !== 'ALL' ||
      normalizePolicyExpression(policy.qual) !== expected.expression ||
      normalizePolicyExpression(policy.with_check) !== expected.expression
    ) {
      throw new Error(
        'PostgreSQL worker tenant isolation policies are not verified'
      )
    }
  }
}

/**
 * Verifies the effective PostgreSQL role and tenant-isolation schema before the
 * worker claims its first event. Environment flags never replace this query.
 *
 * The preflight borrows one pool connection, sets the tenant context, runs the
 * checks and clears the context before releasing the connection; a connection
 * whose context cannot be cleared is destroyed instead of being reused.
 */
export async function assertPostgresWorkerPreflight(
  pool: PostgresPoolLike,
  options: PostgresWorkerPreflightOptions
): Promise<void> {
  const tenantId = TenantIdSchema.parse(options.tenantId)
  const criticalTables = [...(options.criticalTables ?? WORKER_CRITICAL_TABLES)]
  const client = await pool.connect()
  let contextSet = false
  let failure: Error | undefined

  try {
    await client.query('SELECT set_config($1, $2, false)', [
      CVG_TENANT_CONTEXT_SETTING,
      tenantId
    ])
    contextSet = true

    const roleResult = await client.query<RoleRow>(ROLE_QUERY)
    const role = roleResult.rows[0]
    if (
      !role ||
      role.rolsuper ||
      role.rolbypassrls ||
      role.rolcreatedb ||
      role.rolcreaterole ||
      role.rolreplication
    ) {
      throw new Error(
        'PostgreSQL worker role must be a non-superuser without BYPASSRLS'
      )
    }

    const memberships = await client.query<{ count: number }>(
      `SELECT count(*)::int AS count
         FROM pg_auth_members AS membership
         INNER JOIN pg_roles AS member ON member.oid = membership.member
        WHERE member.rolname = current_user`
    )
    if (Number(memberships.rows[0]?.count ?? 0) > 0) {
      throw new Error('PostgreSQL worker role must not inherit other roles')
    }

    const databaseOwner = await client.query<{ owner: string }>(
      `SELECT pg_get_userbyid(datdba) AS owner
         FROM pg_database
        WHERE datname = current_database()`
    )
    if (databaseOwner.rows[0]?.owner === role.rolname) {
      throw new Error('PostgreSQL worker role must not own the database')
    }

    const schemaPrivilege = await client.query<{ can_create: boolean }>(
      `SELECT has_schema_privilege(current_user, current_schema(), 'CREATE')
         AS can_create`
    )
    if (schemaPrivilege.rows[0]?.can_create) {
      throw new Error('PostgreSQL worker role must not create schema objects')
    }

    await assertTenantIsolatedTables(client, criticalTables, {
      forbiddenOwner: role.rolname
    })

    const tablePrivileges = await client.query<{
      relname: string
      can_select: boolean
      can_insert: boolean
      can_update: boolean
      can_delete: boolean
      can_truncate: boolean
      can_trigger: boolean
      can_references: boolean
    }>(
      `SELECT table_name AS relname,
              has_table_privilege(current_user, format('%I.%I', current_schema(), table_name), 'SELECT') AS can_select,
              has_table_privilege(current_user, format('%I.%I', current_schema(), table_name), 'INSERT') AS can_insert,
              has_table_privilege(current_user, format('%I.%I', current_schema(), table_name), 'UPDATE') AS can_update,
              has_table_privilege(current_user, format('%I.%I', current_schema(), table_name), 'DELETE') AS can_delete,
              has_table_privilege(current_user, format('%I.%I', current_schema(), table_name), 'TRUNCATE') AS can_truncate,
              has_table_privilege(current_user, format('%I.%I', current_schema(), table_name), 'TRIGGER') AS can_trigger,
              has_table_privilege(current_user, format('%I.%I', current_schema(), table_name), 'REFERENCES') AS can_references
         FROM unnest($1::text[]) AS table_name`,
      [criticalTables]
    )
    if (
      tablePrivileges.rows.length !== criticalTables.length ||
      tablePrivileges.rows.some(
        (privileges) =>
          !privileges.can_select ||
          !privileges.can_insert ||
          // SPEC 0257: append-only tables must NOT grant UPDATE.
          (TENANT_READ_INSERT_TABLES.has(privileges.relname)
            ? privileges.can_update
            : !privileges.can_update) ||
          privileges.can_delete ||
          privileges.can_truncate ||
          privileges.can_trigger ||
          privileges.can_references
      )
    ) {
      throw new Error(
        'PostgreSQL worker table privileges must be minimal (select/insert/update only)'
      )
    }

    if (options.requiredMigrations?.length) {
      const migrations = await client.query<{
        version: string
        checksum: string | null
      }>(
        `SELECT version, checksum
           FROM schema_migrations
          WHERE version = ANY($1::text[])`,
        [options.requiredMigrations]
      )
      const applied = new Map(
        migrations.rows.map((migration) => [migration.version, migration])
      )
      for (const version of options.requiredMigrations) {
        const migration = applied.get(version)
        const sql = await readPostgresMigrationSql(version)
        const checksum = createHash('sha256').update(sql).digest('hex')
        if (!migration || migration.checksum !== checksum) {
          throw new Error(
            `PostgreSQL worker migration is not verified: ${version}`
          )
        }
      }
    }
  } catch (error) {
    failure = toError(error)
  }

  let cleanupFailed = false
  if (contextSet) {
    try {
      await client.query('SELECT set_config($1, $2, false)', [
        CVG_TENANT_CONTEXT_SETTING,
        ''
      ])
      const leaked = await client.query<{ tenant_id: string | null }>(
        `SELECT NULLIF(current_setting($1, true), '') AS tenant_id`,
        [CVG_TENANT_CONTEXT_SETTING]
      )
      if (leaked.rows.length !== 1 || leaked.rows[0]?.tenant_id !== null) {
        failure ??= new Error(
          'PostgreSQL tenant context cleanup was not verified'
        )
        cleanupFailed = true
      }
    } catch (cleanupError) {
      client.release(toError(cleanupError))
      throw failure ?? toError(cleanupError)
    }
  }
  if (cleanupFailed && failure) {
    client.release(failure)
  } else {
    client.release()
  }
  if (failure) throw failure
}

function toError(error: unknown): Error {
  return error instanceof Error
    ? error
    : new Error('PostgreSQL worker role preflight failed')
}

// Matches the deparsed expressions installed by the repository migrations.
// Reject unknown policies rather than attempting arbitrary SQL equivalence.
function normalizePolicyExpression(expression: string | null): string {
  return (expression ?? '')
    .replace(/::text/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\((tenant_isolation_quarantined = false)\)/g, '$1')
    .replace(
      /\((tenant_id = NULLIF\(current_setting\('cvg\.tenant_id', true\), ''\))\)/g,
      '$1'
    )
    .replace(/^\((.*)\)$/, '$1')
}
