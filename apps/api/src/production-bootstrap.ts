import { randomBytes } from 'node:crypto'
import { createCorrelationId, fail } from '@cvg/shared'
import type { PoolClient, QueryConfig } from 'pg'
import {
  createPostgresOperatorSessionPool,
  PostgresOperatorSessionStore
} from './operator-session-postgres.ts'
import { assertPostgresOperatorSessionBoundary } from './operator-session-preflight.ts'
import { discoverOidcOperatorAuthority } from './oidc-authority.ts'
import {
  OPERATOR_LOGIN_ENV,
  parseOperatorLoginConfig,
  type OidcLoginConfig
} from './oidc-config.ts'
import { PostgresOidcLoginStateStore } from './oidc-state-postgres.ts'
import type { OperatorLoginComposition } from './oidc-routes.ts'
import type { ReadinessProbe } from './readiness.ts'
import { requiresOperatorSessionBoundary } from './operator-session-route-boundary.ts'
import { buildServerFromEnv, type BuildServerFromEnvOptions } from './server.ts'

const HEALTH_QUERY_TIMEOUT_MS = 1_000

// pg supports a per-query timeout at runtime; @types/pg only declares the
// pool/client default. Keep the supported extension local to this bootstrap.
function healthQuery(
  text: string,
  values: unknown[] = []
): QueryConfig & { query_timeout: number } {
  return { text, values, query_timeout: HEALTH_QUERY_TIMEOUT_MS }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (!value) throw new Error(`${name} is required for production bootstrap`)
  return value
}

function databaseRole(value: string): string {
  try {
    const url = new URL(value)
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.username ||
      url.searchParams.has('user')
    ) {
      throw new Error()
    }
    return decodeURIComponent(url.username)
  } catch {
    throw new Error('Production bootstrap requires explicit PostgreSQL roles')
  }
}

/**
 * Serving never migrates auth, grants privileges or substitutes memory.
 * Composed in production and, with the same preflight and readiness, for the
 * OIDC login (SPEC0254 §4.8 step 2), which also gets the PG login state store
 * on the same bounded pool.
 */
export async function createProductionOperatorSessionBootstrap(
  env: NodeJS.ProcessEnv
) {
  const oidcLogin = env[OPERATOR_LOGIN_ENV] === 'oidc'
  if (env.NODE_ENV !== 'production' && !oidcLogin) return undefined
  // SPEC 0144: migrations run in a separate job; production serving never
  // holds DDL. The OIDC test mode receives it (SPEC0254 P6, test only).
  if (
    env.NODE_ENV === 'production' &&
    env.DATABASE_MIGRATION_URL !== undefined
  ) {
    throw new Error(
      'Production serving must not receive DATABASE_MIGRATION_URL'
    )
  }
  const connectionString = required(env, 'CVG_OPERATOR_SESSION_DATABASE_URL')
  const authSchemaName = required(env, 'CVG_OPERATOR_AUTH_SCHEMA')
  const expectedSessionRole = required(env, 'CVG_OPERATOR_SESSION_ROLE')
  const productSchemaName = env.POSTGRES_SCHEMA?.trim() || 'public'
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(authSchemaName) ||
    authSchemaName === 'public' ||
    authSchemaName.startsWith('pg_') ||
    authSchemaName === productSchemaName
  ) {
    throw new Error(
      'Production operator-auth schema must be private and separate'
    )
  }
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(expectedSessionRole) ||
    databaseRole(connectionString) !== expectedSessionRole ||
    databaseRole(required(env, 'DATABASE_URL')) === expectedSessionRole
  ) {
    throw new Error('Production operator-session role must be dedicated')
  }
  const sessionUrl = new URL(connectionString)
  if (
    [
      'query_timeout',
      'statement_timeout',
      'connectionTimeoutMillis',
      'connect_timeout',
      'options',
      'replication'
    ].some((name) => sessionUrl.searchParams.has(name))
  ) {
    throw new Error('Operator-session URL must preserve bounded pool settings')
  }

  // The pool keeps idle and checked-out client errors handled; pg discards
  // failed clients, so the next real probe/request verifies a fresh connection.
  const pool = createPostgresOperatorSessionPool(connectionString)
  let closed = false
  let closing: Promise<void> | undefined
  const close = (): Promise<void> => {
    closed = true
    closing ??= pool.end().catch(() => {
      throw new Error('Operator session pool shutdown failed')
    })
    return closing
  }
  const probeDigest = randomBytes(32)
  let checking: Promise<void> | undefined
  const readHealth = async (): Promise<void> => {
    let client: PoolClient | undefined
    let failed = true
    try {
      if (closed) throw new Error()
      client = await pool.connect()
      await client.query(
        healthQuery('BEGIN READ ONLY; SET LOCAL statement_timeout = 1000')
      )
      // Exercise the canonical read function and its tables, not SELECT 1.
      // A random digest never creates/revokes a session or exposes its data.
      await client.query(
        healthQuery(
          `SELECT * FROM "${authSchemaName}".operator_session_get_v2($1)`,
          [probeDigest]
        )
      )
      await client.query(healthQuery('COMMIT'))
      failed = false
    } catch {
      throw new Error('Operator session health check failed')
    } finally {
      // Destroy a failed/timed-out transaction, including its socket. No
      // abandoned query or aborted transaction returns to the serving pool.
      client?.release(failed)
    }
  }
  const readinessProbe: ReadinessProbe = {
    name: 'operator-session-store',
    // 1s acquisition + three 1s query budgets; the outer bound allows overhead.
    timeoutMs: 5_000,
    check: () => {
      if (closed)
        return Promise.reject(new Error('Operator session pool closed'))
      // Concurrent probes share a bounded read instead of filling the pool.
      checking ??= readHealth().finally(() => {
        checking = undefined
      })
      return checking
    }
  }
  try {
    await assertPostgresOperatorSessionBoundary(pool, {
      authSchemaName,
      expectedSessionRole,
      productSchemaName
    })
    // The existing boundary covers memberships/ownership/RLS and DDL grants.
    // Also refuse replication authority, which is irrelevant to serving auth.
    const replication = await pool.query<{ replication: boolean }>(
      'SELECT rolreplication AS replication FROM pg_roles WHERE rolname = current_user'
    )
    if (replication.rows[0]?.replication !== false) throw new Error()
    await readinessProbe.check()
    return {
      operatorSessionStore: new PostgresOperatorSessionStore(
        pool,
        authSchemaName
      ),
      ...(oidcLogin
        ? {
            oidcStateStore: new PostgresOidcLoginStateStore(
              pool,
              authSchemaName
            )
          }
        : {}),
      readinessProbe,
      close
    }
  } catch {
    await close()
    throw new Error('Production operator-session bootstrap failed')
  }
}

/** SPEC0254 §4.8 step 3: discovery before listen, with the PG state store. */
async function composeOperatorLogin(
  config: OidcLoginConfig,
  sessions: Awaited<
    ReturnType<typeof createProductionOperatorSessionBootstrap>
  >,
  options: BuildServerFromEnvOptions
): Promise<OperatorLoginComposition> {
  if (!sessions?.oidcStateStore) {
    throw new Error(
      'OIDC login requires the durable operator session and login state stores'
    )
  }
  const authority = await discoverOidcOperatorAuthority(
    config,
    options.oidcTransport ? { transport: options.oidcTransport } : {}
  )
  return {
    kind: 'oidc',
    authorityVersion: config.authorityVersion,
    consoleOrigin: config.consoleOrigin,
    authority,
    stateStore: sessions.oidcStateStore
  }
}

/** Compose only through existing server options; keep routes/hooks unchanged. */
export async function buildApiWithProductionSessions(
  env: NodeJS.ProcessEnv,
  options: BuildServerFromEnvOptions = {}
) {
  // SPEC0254 §4.8 step 1: the login configuration is validated without I/O.
  const loginConfig = parseOperatorLoginConfig(env)
  const sessions = await createProductionOperatorSessionBootstrap(env)
  let app: Awaited<ReturnType<typeof buildServerFromEnv>> | undefined
  try {
    const operatorLogin = loginConfig
      ? await composeOperatorLogin(loginConfig, sessions, options)
      : undefined
    app = await buildServerFromEnv(env, {
      ...options,
      ...(sessions
        ? {
            operatorSessionStore: sessions.operatorSessionStore,
            readinessProbes: [
              ...(options.readinessProbes ?? []),
              sessions.readinessProbe
            ]
          }
        : {}),
      ...(operatorLogin ? { operatorLogin } : {})
    })
    if (sessions) {
      app.addHook('onClose', sessions.close)
      app.addHook('onRequest', async (request, reply) => {
        // Token-only requests do not traverse the cookie store hook. Require
        // the same live auth dependency for all operator/session routes.
        // Independent inbound HMAC and public probes keep their own authority.
        if (
          !requiresOperatorSessionBoundary(
            request.method,
            request.routeOptions.url
          )
        )
          return
        try {
          await sessions.readinessProbe.check()
        } catch {
          reply.code(503).header('cache-control', 'no-store')
          return reply.send(
            fail(
              'configuration_error',
              'Operator session store is unavailable',
              createCorrelationId()
            )
          )
        }
      })
    }
    return app
  } catch (error) {
    try {
      await app?.close()
    } finally {
      await sessions?.close()
    }
    throw error
  }
}
