import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { Client } from 'pg'

const version = '0000_operator_session_auth'
const oidcStateVersion = '0001_oidc_login_state'
const migrationPath = resolve(
  process.cwd(),
  'packages/persistence/migrations/operator-session/0000_auth.sql'
)
const oidcStateMigrationPath = resolve(
  process.cwd(),
  'packages/persistence/migrations/operator-session/0001_oidc_state.sql'
)
const functionNames = [
  'operator_session_create',
  'operator_session_get',
  'operator_session_replace',
  'operator_session_revoke'
] as const

export type OperatorSessionFunctionName = (typeof functionNames)[number]

function requirePinnedMigrationClient(client: Client): void {
  if (!(client instanceof Client)) {
    throw new Error(
      'Operator-auth migration requires one pinned PostgreSQL Client'
    )
  }
}

export function assertOperatorAuthSchemaName(schemaName: string): string {
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schemaName)) {
    throw new Error('Invalid PostgreSQL operator-auth schema name')
  }
  if (schemaName === 'public' || schemaName.startsWith('pg_')) {
    throw new Error('Operator-auth schema must be private')
  }
  return schemaName
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`
}

export async function readOperatorSessionMigrationTemplate(): Promise<string> {
  return readFile(migrationPath, 'utf8')
}

export function renderOperatorSessionMigration(
  template: string,
  authSchemaName: string,
  ownerRoleName: string
): string {
  const schemaName = assertOperatorAuthSchemaName(authSchemaName)
  if (!ownerRoleName || ownerRoleName.includes('\0')) {
    throw new Error('Invalid PostgreSQL operator-auth owner role')
  }
  if (
    template.includes('__AUTH_SCHEMA__') === false ||
    template.includes('__OWNER_ROLE__') === false
  ) {
    throw new Error('Operator-auth migration placeholders are missing')
  }
  return template
    .replaceAll('__AUTH_SCHEMA__', quoteIdentifier(schemaName))
    .replaceAll('__OWNER_ROLE__', quoteIdentifier(ownerRoleName))
}

export function extractOperatorSessionFunctionBodies(
  renderedSql: string
): Record<OperatorSessionFunctionName, string> {
  const bodies = {} as Record<OperatorSessionFunctionName, string>
  for (const name of functionNames) {
    const delimiter = `$cvg_${name.replace('operator_session_', '')}$`
    const start = renderedSql.indexOf(`AS ${delimiter}`)
    if (start < 0 || renderedSql.indexOf(`AS ${delimiter}`, start + 1) >= 0) {
      throw new Error(`Operator-auth function body is missing: ${name}`)
    }
    const bodyStart = start + `AS ${delimiter}`.length
    const bodyEnd = renderedSql.indexOf(delimiter, bodyStart)
    if (bodyEnd < 0) {
      throw new Error(`Operator-auth function body is unterminated: ${name}`)
    }
    bodies[name] = renderedSql.slice(bodyStart, bodyEnd)
  }
  return bodies
}

/**
 * A dedicated migration job calls this before the serving API starts. It does
 * not modify the product migration chain or its per-test schema lifecycle.
 */
export async function runOperatorSessionMigrations(
  client: Client,
  authSchemaName: string,
  productSchemaName: string
): Promise<void> {
  const schemaName = assertOperatorAuthSchemaName(authSchemaName)
  requirePinnedMigrationClient(client)
  if (!productSchemaName || productSchemaName === schemaName) {
    throw new Error('Operator-auth schema must differ from the product schema')
  }
  const quotedSchema = quoteIdentifier(schemaName)
  const template = await readOperatorSessionMigrationTemplate()
  const checksum = createHash('sha256').update(template).digest('hex')
  const oidcStateTemplate = await readFile(oidcStateMigrationPath, 'utf8')
  const oidcStateChecksum = createHash('sha256')
    .update(oidcStateTemplate)
    .digest('hex')

  await client.query('BEGIN')
  try {
    const role = await client.query<{ name: string }>(
      'SELECT current_user::text AS name'
    )
    const ownerName = role.rows[0]?.name
    if (!ownerName) throw new Error('PostgreSQL migration role is unavailable')
    const product = await client.query<{ exists: boolean }>(
      'SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS exists',
      [productSchemaName]
    )
    if (!product.rows[0]?.exists) {
      throw new Error('PostgreSQL product schema is unavailable')
    }
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotedSchema}`)
    const schemaOwner = await client.query<{ owner: string }>(
      `SELECT pg_get_userbyid(nspowner) AS owner
       FROM pg_namespace WHERE nspname = $1`,
      [schemaName]
    )
    if (schemaOwner.rows[0]?.owner !== ownerName) {
      throw new Error(
        'Operator-auth schema owner does not match migration role'
      )
    }
    await client.query(`REVOKE ALL ON SCHEMA ${quotedSchema} FROM PUBLIC`)
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${quotedSchema}.schema_migrations (
         version text PRIMARY KEY,
         checksum text NOT NULL,
         applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
       )`
    )
    await client.query(
      `REVOKE ALL ON TABLE ${quotedSchema}.schema_migrations FROM PUBLIC`
    )
    const applied = await client.query<{ checksum: string }>(
      `SELECT checksum FROM ${quotedSchema}.schema_migrations
       WHERE version = $1 FOR UPDATE`,
      [version]
    )
    if (applied.rows.length > 0) {
      if (applied.rows[0]?.checksum !== checksum) {
        throw new Error('Operator-auth migration checksum mismatch')
      }
    } else {
      const rendered = renderOperatorSessionMigration(
        template,
        schemaName,
        ownerName
      )
      extractOperatorSessionFunctionBodies(rendered)
      await client.query(rendered)
      await client.query(
        `INSERT INTO ${quotedSchema}.schema_migrations (version, checksum)
         VALUES ($1, $2)`,
        [version, checksum]
      )
    }
    const oidcStateApplied = await client.query<{ checksum: string }>(
      `SELECT checksum FROM ${quotedSchema}.schema_migrations
       WHERE version = $1 FOR UPDATE`,
      [oidcStateVersion]
    )
    if (oidcStateApplied.rows.length > 0) {
      if (oidcStateApplied.rows[0]?.checksum !== oidcStateChecksum) {
        throw new Error('OIDC state migration checksum mismatch')
      }
    } else {
      const rendered = renderOperatorSessionMigration(
        oidcStateTemplate,
        schemaName,
        ownerName
      )
      await client.query(rendered)
      await client.query(
        `INSERT INTO ${quotedSchema}.schema_migrations (version, checksum)
         VALUES ($1, $2)`,
        [oidcStateVersion, oidcStateChecksum]
      )
    }
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}

/** Grant only the six entry points, after provisioning a separate API role. */
export async function grantOperatorSessionFunctions(
  client: Client,
  authSchemaName: string,
  sessionRoleName: string
): Promise<void> {
  const schemaName = assertOperatorAuthSchemaName(authSchemaName)
  requirePinnedMigrationClient(client)
  if (!sessionRoleName || sessionRoleName.includes('\0')) {
    throw new Error('Invalid PostgreSQL operator-session role')
  }
  const schema = quoteIdentifier(schemaName)
  const role = quoteIdentifier(sessionRoleName)
  await client.query('BEGIN')
  try {
    await client.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`)
    await client.query(
      `GRANT EXECUTE ON FUNCTION ${schema}.operator_session_create(bytea,text,text,text,timestamptz) TO ${role}`
    )
    await client.query(
      `GRANT EXECUTE ON FUNCTION ${schema}.operator_session_get(bytea) TO ${role}`
    )
    await client.query(
      `GRANT EXECUTE ON FUNCTION ${schema}.operator_session_replace(bytea,bytea,text,text,text,timestamptz) TO ${role}`
    )
    await client.query(
      `GRANT EXECUTE ON FUNCTION ${schema}.operator_session_revoke(bytea) TO ${role}`
    )
    await client.query(
      `GRANT EXECUTE ON FUNCTION ${schema}.oidc_state_reserve(bytea,timestamptz) TO ${role}`
    )
    await client.query(
      `GRANT EXECUTE ON FUNCTION ${schema}.oidc_state_consume(bytea) TO ${role}`
    )
    await client.query('COMMIT')
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  }
}
