#!/usr/bin/env node
/**
 * Migration job (SPEC 0144): the only process that holds DDL credentials.
 * It runs to completion before serving starts; the production API refuses
 * DATABASE_MIGRATION_URL and auto-migration.
 *
 *   DATABASE_MIGRATION_URL + POSTGRES_SCHEMA   product migrations, run by the
 *                                              owner of the (pre-provisioned)
 *                                              data schema
 *   CVG_RUNTIME_ROLE                           optional: the owner grants the
 *                                              runtime role its table set
 *   CVG_OPERATOR_AUTH_MIGRATION_URL            optional: operator-auth schema
 *     + CVG_OPERATOR_AUTH_SCHEMA               migrations and EXECUTE on the
 *     + CVG_OPERATOR_SESSION_ROLE              four session functions
 *
 * Run from the image: `node scripts/migrate-job.mjs`. Errors never echo
 * connection strings.
 */
import pg from 'pg'
import { TENANT_SCHEMA_TABLES, runPostgresMigrations } from '@cvg/persistence'

const ROLE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for the migration job`)
  return value
}

function roleName(name) {
  const value = required(name)
  if (!ROLE_PATTERN.test(value)) throw new Error(`${name} is not a valid role`)
  return value
}

async function withClient(connectionString, run) {
  const client = new pg.Client({ connectionString })
  client.on('error', () => undefined)
  await client.connect()
  try {
    return await run(client)
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function main() {
  const schema = required('POSTGRES_SCHEMA')
  const migrationUrl = required('DATABASE_MIGRATION_URL')
  const runtimeRole = process.env.CVG_RUNTIME_ROLE?.trim()
    ? roleName('CVG_RUNTIME_ROLE')
    : undefined
  const authUrl = process.env.CVG_OPERATOR_AUTH_MIGRATION_URL?.trim()
  const auth = authUrl
    ? {
        schema: required('CVG_OPERATOR_AUTH_SCHEMA'),
        sessionRole: roleName('CVG_OPERATOR_SESSION_ROLE')
      }
    : undefined

  await withClient(migrationUrl, async (client) => {
    await runPostgresMigrations(client, {
      schemaName: schema,
      createSchema: false
    })
    if (!runtimeRole) return
    // runPostgresMigrations validated the schema name; quote both anyway.
    const data = `"${schema}"`
    const runtime = `"${runtimeRole}"`
    await client.query('BEGIN')
    try {
      await client.query(`GRANT USAGE ON SCHEMA ${data} TO ${runtime}`)
      for (const table of TENANT_SCHEMA_TABLES) {
        await client.query(
          `GRANT SELECT, INSERT, UPDATE ON ${data}."${table}" TO ${runtime}`
        )
      }
      await client.query(
        `GRANT SELECT ON ${data}.schema_migrations TO ${runtime}`
      )
      await client.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON ${data}.webhook_replay_events, ${data}.rate_limit_buckets TO ${runtime}`
      )
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    }
  })
  process.stdout.write(
    `${JSON.stringify({ event: 'migration.product_applied', schema, runtimeGrants: Boolean(runtimeRole) })}\n`
  )

  if (auth && authUrl) {
    const { grantOperatorSessionFunctions, runOperatorSessionMigrations } =
      await import(
        new URL(
          '../packages/persistence/dist/operator-session-migrations.js',
          import.meta.url
        ).href
      )
    await withClient(authUrl, async (client) => {
      await runOperatorSessionMigrations(client, auth.schema, schema)
      await grantOperatorSessionFunctions(client, auth.schema, auth.sessionRole)
    })
    process.stdout.write(
      `${JSON.stringify({ event: 'migration.operator_auth_applied', schema: auth.schema })}\n`
    )
  }
}

main().catch((error) => {
  const message =
    error instanceof Error
      ? error.message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]')
      : 'unknown error'
  process.stderr.write(
    `${JSON.stringify({ event: 'migration.failed', message })}\n`
  )
  process.exitCode = 1
})
