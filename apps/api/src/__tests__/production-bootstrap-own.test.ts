// @vitest-environment node
import { EventEmitter } from 'node:events'
import Fastify from 'fastify'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guardPostgresPoolErrors } from '@cvg/persistence'
import { PostgresOperatorSessionStore } from '../operator-session-postgres.ts'
import {
  buildApiWithProductionSessions,
  createProductionOperatorSessionBootstrap
} from '../production-bootstrap.ts'
import { evaluateReadinessWithProbes } from '../readiness.ts'

const mocks = vi.hoisted(() => ({
  pool: vi.fn(),
  boundary: vi.fn(),
  build: vi.fn()
}))
vi.mock('../operator-session-postgres.ts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../operator-session-postgres.ts')>()),
  createPostgresOperatorSessionPool: mocks.pool
}))
vi.mock('../operator-session-preflight.ts', () => ({
  assertPostgresOperatorSessionBoundary: mocks.boundary
}))
vi.mock('../server.ts', () => ({ buildServerFromEnv: mocks.build }))

const env = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgresql://data:synthetic@127.0.0.1/db',
  POSTGRES_SCHEMA: 'data',
  CVG_OPERATOR_SESSION_DATABASE_URL:
    'postgresql://sessions:synthetic@127.0.0.1/db',
  CVG_OPERATOR_AUTH_SCHEMA: 'auth',
  CVG_OPERATOR_SESSION_ROLE: 'sessions'
}

function poolFixture() {
  const client = {
    query: vi.fn().mockResolvedValue({ rows: [] }),
    release: vi.fn()
  }
  const pool = Object.assign(new EventEmitter(), {
    connect: vi.fn().mockResolvedValue(client),
    query: vi.fn().mockResolvedValue({ rows: [{ replication: false }] }),
    end: vi.fn().mockResolvedValue(undefined)
  })
  // Mirror the real factory, which guards idle and checked-out client errors.
  mocks.pool.mockReturnValue(guardPostgresPoolErrors(pool as never))
  return { pool, client }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.boundary.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe('own production session bootstrap', () => {
  it.each([
    'CVG_OPERATOR_SESSION_DATABASE_URL',
    'CVG_OPERATOR_AUTH_SCHEMA',
    'CVG_OPERATOR_SESSION_ROLE',
    'DATABASE_URL'
  ])('rejects missing %s before allocating any pool/server', async (key) => {
    await expect(
      buildApiWithProductionSessions({ ...env, [key]: '   ' })
    ).rejects.toThrow(/required/)
    expect(mocks.pool).not.toHaveBeenCalled()
    expect(mocks.build).not.toHaveBeenCalled()
  })

  it.each(['postgresql://migration:synthetic@127.0.0.1/db', '', '   '])(
    'rejects any DDL credential in serving (%j) before allocating any pool/server',
    async (value) => {
      await expect(
        buildApiWithProductionSessions({
          ...env,
          DATABASE_MIGRATION_URL: value
        })
      ).rejects.toThrow(
        'Production serving must not receive DATABASE_MIGRATION_URL'
      )
      expect(mocks.pool).not.toHaveBeenCalled()
      expect(mocks.build).not.toHaveBeenCalled()
    }
  )

  it.each(['data', 'public', 'pg_auth', 'bad"schema', 'Auth', ''])(
    'rejects shared or invalid schema %s before connection',
    async (schema) => {
      await expect(
        createProductionOperatorSessionBootstrap({
          ...env,
          CVG_OPERATOR_AUTH_SCHEMA: schema
        })
      ).rejects.toThrow()
      expect(mocks.pool).not.toHaveBeenCalled()
    }
  )

  it.each([
    { CVG_OPERATOR_SESSION_ROLE: 'data' },
    { CVG_OPERATOR_SESSION_ROLE: 'wrong' },
    { CVG_OPERATOR_SESSION_ROLE: 'session;select' },
    {
      CVG_OPERATOR_SESSION_DATABASE_URL:
        'postgresql://data:synthetic@localhost/db',
      CVG_OPERATOR_SESSION_ROLE: 'data'
    },
    {
      CVG_OPERATOR_SESSION_DATABASE_URL:
        'https://sessions:synthetic@localhost/db'
    },
    { CVG_OPERATOR_SESSION_DATABASE_URL: 'not-a-url-secret' }
  ])(
    'rejects non-dedicated/invalid role URLs without echoing values',
    async (patch) => {
      await expect(
        createProductionOperatorSessionBootstrap({ ...env, ...patch })
      ).rejects.toThrow(/dedicated|explicit PostgreSQL/)
      expect(mocks.pool).not.toHaveBeenCalled()
    }
  )

  it('runs the real preflight seam before health/store/server and closes rejection', async () => {
    const { pool, client } = poolFixture()
    mocks.boundary.mockRejectedValue(
      new Error('postgresql://secret:password@host')
    )
    await expect(buildApiWithProductionSessions(env)).rejects.toThrow(
      'Production operator-session bootstrap failed'
    )
    expect(mocks.boundary).toHaveBeenCalledWith(pool, {
      authSchemaName: 'auth',
      expectedSessionRole: 'sessions',
      productSchemaName: 'data'
    })
    expect(client.query).not.toHaveBeenCalled()
    expect(mocks.build).not.toHaveBeenCalled()
    expect(pool.end).toHaveBeenCalledTimes(1)
  })

  it.each([
    'query_timeout',
    'statement_timeout',
    'connectionTimeoutMillis',
    'connect_timeout',
    'options',
    'replication'
  ])(
    'rejects URL override %s of bounded serving settings',
    async (parameter) => {
      await expect(
        createProductionOperatorSessionBootstrap({
          ...env,
          CVG_OPERATOR_SESSION_DATABASE_URL: `${env.CVG_OPERATOR_SESSION_DATABASE_URL}?${parameter}=0`
        })
      ).rejects.toThrow(
        'Operator-session URL must preserve bounded pool settings'
      )
      expect(mocks.pool).not.toHaveBeenCalled()
    }
  )

  it('also rejects replication authority without changing the existing preflight', async () => {
    const { pool, client } = poolFixture()
    pool.query.mockResolvedValueOnce({ rows: [{ replication: true }] })
    await expect(buildApiWithProductionSessions(env)).rejects.toThrow(
      'Production operator-session bootstrap failed'
    )
    expect(mocks.boundary).toHaveBeenCalledTimes(1)
    expect(client.query).not.toHaveBeenCalled()
    expect(pool.end).toHaveBeenCalledTimes(1)
  })

  it('builds the actual PG store only after a bounded READ ONLY health query', async () => {
    const { pool, client } = poolFixture()
    const bootstrap = await createProductionOperatorSessionBootstrap(env)
    expect(bootstrap?.operatorSessionStore).toBeInstanceOf(
      PostgresOperatorSessionStore
    )
    expect(client.query.mock.calls.map(([query]) => query.text)).toEqual([
      'BEGIN READ ONLY; SET LOCAL statement_timeout = 1000',
      'SELECT * FROM "auth".operator_session_get($1)',
      'COMMIT'
    ])
    for (const [query] of client.query.mock.calls)
      expect(query.query_timeout).toBe(1000)
    expect(client.query.mock.calls[1]?.[0].values[0]).toHaveLength(32)
    expect(client.release).toHaveBeenCalledWith(false)
    await Promise.all([bootstrap?.close(), bootstrap?.close()])
    expect(pool.end).toHaveBeenCalledTimes(1)
    await expect(bootstrap?.readinessProbe.check()).rejects.toThrow(/closed/)
  })

  it.each([0, 1, 2])(
    'destroys the transaction and closes partial startup at query %s',
    async (index) => {
      const { pool, client } = poolFixture()
      client.query.mockReset()
      for (let i = 0; i < index; i++)
        client.query.mockResolvedValueOnce({ rows: [] })
      client.query.mockRejectedValueOnce(new Error('secret password=synthetic'))
      await expect(buildApiWithProductionSessions(env)).rejects.toThrow(
        'Production operator-session bootstrap failed'
      )
      expect(client.release).toHaveBeenCalledWith(true)
      expect(pool.end).toHaveBeenCalledTimes(1)
      expect(mocks.build).not.toHaveBeenCalled()
    }
  )

  it('closes an unavailable pool on acquisition failure', async () => {
    const { pool, client } = poolFixture()
    pool.connect.mockRejectedValueOnce(new Error('DB unavailable: secret'))
    await expect(buildApiWithProductionSessions(env)).rejects.toThrow(
      'Production operator-session bootstrap failed'
    )
    expect(client.release).not.toHaveBeenCalled()
    expect(pool.end).toHaveBeenCalledTimes(1)
  })

  it('sanitizes readiness failure, destroys failed client and recovers without memory', async () => {
    const { pool, client } = poolFixture()
    const bootstrap = await createProductionOperatorSessionBootstrap(env)
    client.query.mockRejectedValueOnce(
      new Error('postgresql://username:password@secret')
    )
    const input = {
      persistenceMode: 'postgres-pool' as const,
      durableInbound: true,
      production: true,
      probes: [bootstrap!.readinessProbe]
    }
    const failure = await evaluateReadinessWithProbes(input)
    expect(failure.ready).toBe(false)
    expect(failure.checks.at(-1)).toEqual({
      name: 'operator-session-store',
      status: 'failed',
      detail: 'operator-session-store probe failed'
    })
    expect(JSON.stringify(failure)).not.toMatch(/password|username|secret/)
    expect(client.release).toHaveBeenLastCalledWith(true)
    pool.emit('error', new Error('idle network failure'))
    expect((await evaluateReadinessWithProbes(input)).ready).toBe(true)
    expect(bootstrap!.operatorSessionStore).toBeInstanceOf(
      PostgresOperatorSessionStore
    )
    await bootstrap!.close()
  })

  it('bounds the HTTP readiness wait and coalesces concurrent checks', async () => {
    vi.useFakeTimers()
    const { pool, client } = poolFixture()
    const bootstrap = await createProductionOperatorSessionBootstrap(env)
    let settle!: (value: { rows: never[] }) => void
    client.query.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          settle = resolve
        })
    )
    const input = {
      persistenceMode: 'postgres-pool' as const,
      durableInbound: true,
      production: true,
      probes: [bootstrap!.readinessProbe]
    }
    const checks = [
      evaluateReadinessWithProbes(input),
      evaluateReadinessWithProbes(input)
    ]
    await vi.advanceTimersByTimeAsync(5000)
    expect((await Promise.all(checks)).map((r) => r.ready)).toEqual([
      false,
      false
    ])
    expect(pool.connect).toHaveBeenCalledTimes(2) // startup + shared live check
    settle({ rows: [] })
    await bootstrap!.readinessProbe.check()
    await bootstrap!.close()
  })

  it('composes authoritative store/probe without replacing other readiness probes', async () => {
    const { pool } = poolFixture()
    const addHook = vi.fn()
    mocks.build.mockResolvedValue({ addHook })
    const other = { name: 'consumer', check: vi.fn() }
    await buildApiWithProductionSessions(env, { readinessProbes: [other] })
    const options = mocks.build.mock.calls[0]?.[1]
    expect(options.operatorSessionStore).toBeInstanceOf(
      PostgresOperatorSessionStore
    )
    expect(options.readinessProbes[0]).toBe(other)
    expect(options.readinessProbes[1].name).toBe('operator-session-store')
    expect(addHook.mock.calls[0]?.[0]).toBe('onClose')
    await addHook.mock.calls[0]?.[1]()
    expect(pool.end).toHaveBeenCalledTimes(1)
  })

  it('closes sessions when the data/server composition rejects', async () => {
    const { pool } = poolFixture()
    mocks.build.mockRejectedValueOnce(
      new Error('existing data preflight failed')
    )
    await expect(buildApiWithProductionSessions(env)).rejects.toThrow(
      'existing data preflight failed'
    )
    expect(pool.end).toHaveBeenCalledTimes(1)
  })

  it('keeps development composition independent of production credentials', async () => {
    const app = { addHook: vi.fn() }
    mocks.build.mockResolvedValue(app)
    expect(
      await buildApiWithProductionSessions({ NODE_ENV: 'development' })
    ).toBe(app)
    expect(mocks.pool).not.toHaveBeenCalled()
    expect(mocks.build).toHaveBeenCalledWith({ NODE_ENV: 'development' }, {})
    expect(app.addHook).not.toHaveBeenCalled()
  })

  it('fails cookie-less operator HTTP requests closed during outage while live stays public', async () => {
    const { client } = poolFixture()
    const app = Fastify()
    app.get('/v1/protected', async () => ({ allowed: true }))
    app.get('/live', async () => ({ live: true }))
    mocks.build.mockResolvedValue(app)
    await buildApiWithProductionSessions(env)
    client.query.mockRejectedValueOnce(new Error('auth dependency unavailable'))
    const failed = await app.inject({
      url: '/v1/protected',
      headers: { 'x-cvg-operator-token': 'synthetic-token' }
    })
    expect(failed.statusCode).toBe(503)
    expect(failed.json().error).toEqual({
      code: 'configuration_error',
      message: 'Operator session store is unavailable'
    })
    expect((await app.inject('/live')).statusCode).toBe(200)
    expect((await app.inject('/v1/protected')).statusCode).toBe(200)
    await app.close()
  })

  it('keeps public probes and valid inbound templates independent while rejecting method/template aliases', async () => {
    const { client } = poolFixture()
    const app = Fastify({ exposeHeadRoutes: false })
    const routes = [
      { method: ['GET', 'HEAD'] as const, url: '/health' },
      { method: ['GET', 'HEAD'] as const, url: '/live' },
      { method: ['GET', 'HEAD'] as const, url: '/ready' },
      { method: ['GET', 'HEAD'] as const, url: '/health/metrics' },
      {
        method: 'POST' as const,
        url: '/v1/webhooks/channels/:channel/messages'
      }
    ]
    for (const { method, url } of routes)
      app.route({
        method: typeof method === 'string' ? method : [...method],
        url,
        handler: async () => ({ allowed: true })
      })
    const guarded = [
      {
        method: 'GET' as const,
        url: '/v1/webhooks/channels/:channel/messages'
      },
      {
        method: 'HEAD' as const,
        url: '/v1/webhooks/channels/:channel/messages'
      },
      { method: 'POST' as const, url: '/live' },
      { method: 'POST' as const, url: '/health/metrics' },
      {
        method: 'POST' as const,
        url: '/v1/webhooks/channels/:channel/messages/admin'
      },
      { method: 'GET' as const, url: '/v1/session' },
      { method: 'HEAD' as const, url: '/v1/session' },
      { method: 'POST' as const, url: '/v1/session/logout' },
      { method: 'GET' as const, url: '/operator-future/:id' }
    ]
    for (const { method, url } of guarded)
      app.route({ method, url, handler: async () => ({ allowed: true }) })
    mocks.build.mockResolvedValue(app)
    await buildApiWithProductionSessions(env)
    client.query.mockRejectedValue(new Error('isolated auth fault'))
    try {
      const before = client.query.mock.calls.length
      for (const { method, url } of routes) {
        for (const verb of typeof method === 'string' ? [method] : method) {
          const response = await app.inject({
            method: verb,
            url: url.replace(':channel', 'synthetic') + '?next=/v1/session'
          })
          expect(response.statusCode, `${verb} ${url}`).toBe(200)
        }
      }
      expect(client.query.mock.calls).toHaveLength(before)
      for (const { method, url } of guarded) {
        const response = await app.inject({
          method,
          url:
            url.replace(':channel', 'synthetic').replace(':id', 'live') +
            '?public=/live'
        })
        expect(response.statusCode, `${method} ${url}`).toBe(503)
      }
      expect((await app.inject('/unregistered')).statusCode).toBe(404)
    } finally {
      await app.close()
    }
  })

  it('closes app and session resources when registering composition hooks fails', async () => {
    const { pool } = poolFixture()
    const app = {
      addHook: vi.fn().mockImplementation(() => {
        throw new Error('hook registration failed')
      }),
      close: vi.fn().mockResolvedValue(undefined)
    }
    mocks.build.mockResolvedValue(app)
    await expect(buildApiWithProductionSessions(env)).rejects.toThrow(
      'hook registration failed'
    )
    expect(app.close).toHaveBeenCalledTimes(1)
    expect(pool.end).toHaveBeenCalledTimes(1)
  })
})
