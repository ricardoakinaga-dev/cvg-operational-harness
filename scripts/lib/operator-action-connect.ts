import { Pool, type PoolConfig } from 'pg'
import {
  OperatorActionRefusal,
  type DatastoreProfile
} from './operator-action.ts'

// SPEC 0262 section 6.1: the datastore is the one the policy names and
// nothing in the shell or in the connection file can say otherwise. `pg`
// fills what a connection leaves out from PG* variables and lets the query
// of a URL override its authority, so both are closed here.

/**
 * Removes every PG* variable (PGPASSWORD, PGSSLMODE, PGOPTIONS, PGHOST, ...)
 * so `pg` has nothing to complete a connection with. Returns the names it
 * removed, never their values.
 */
export function scrubPgEnvironment(env: NodeJS.ProcessEnv): string[] {
  const removed = Object.keys(env).filter((key) => key.startsWith('PG'))
  for (const key of removed) delete env[key]
  return removed
}

/**
 * Pool fields taken only from the profile the policy approved. The URL of
 * the connection file may carry the password and nothing else: a query
 * (`?host=`, `?options=`, `?sslmode=`) or a fragment is refused, and every
 * field `pg` could still complete is set explicitly.
 */
export function poolConfigFor(
  connectionText: string,
  expected: DatastoreProfile
): PoolConfig {
  const text = connectionText.trim()
  if (text.includes('?') || text.includes('#')) {
    throw new OperatorActionRefusal(
      'connection file must not carry a query or a fragment'
    )
  }
  let url: URL
  try {
    url = new URL(text)
  } catch {
    throw new OperatorActionRefusal('connection file is not a PostgreSQL URL')
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== expected.host ||
    Number(url.port || 5432) !== expected.port ||
    decodeURIComponent(url.pathname.slice(1)) !== expected.database ||
    decodeURIComponent(url.username) !== expected.user
  ) {
    throw new OperatorActionRefusal(
      'connection differs from the policy profile'
    )
  }
  return {
    host: expected.host,
    port: expected.port,
    database: expected.database,
    user: expected.user,
    password: decodeURIComponent(url.password),
    // Never completed from PGSSLMODE; the profile carries no TLS setting.
    ssl: false,
    options: '',
    application_name: 'cvg-revoke-operator-sessions'
  }
}

/**
 * The only way the script opens a connection: profile compared, query and
 * fragment refused, PG* variables removed from `env` and every field set from
 * the profile. No connection is made until the first query.
 */
export function createPool(
  connectionText: string,
  expected: DatastoreProfile,
  env: NodeJS.ProcessEnv = process.env
): Pool {
  const config = poolConfigFor(connectionText, expected)
  scrubPgEnvironment(env)
  return new Pool({
    ...config,
    max: 1,
    connectionTimeoutMillis: 3_000,
    query_timeout: 10_000,
    statement_timeout: 10_000
  })
}
