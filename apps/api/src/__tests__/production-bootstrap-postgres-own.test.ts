// @vitest-environment node
import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TENANT_SCHEMA_TABLES, runPostgresMigrations } from '@cvg/persistence'
import {
  grantOperatorSessionFunctions,
  runOperatorSessionMigrations
} from '../../../../packages/persistence/src/operator-session-migrations.ts'
import {
  buildApiWithProductionSessions,
  createProductionOperatorSessionBootstrap
} from '../production-bootstrap.ts'
import {
  createConfiguredOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'
import { createWebhookSignature } from '../webhook-security.ts'
import { buildServerFromEnv } from '../server.ts'

const databaseUrl = process.env.TEST_DATABASE_URL
if (process.env.CVG_BOOTSTRAP_PG_REQUIRED === '1' && !databaseUrl) {
  throw new Error(
    'CVG_BOOTSTRAP_PG_REQUIRED=1 requires scheduled TEST_DATABASE_URL'
  )
}
const tenant = 'tenant_11111111-1111-4111-8111-111111111111'
const key = {
  keyId: 'bootstrap-synthetic',
  secret: 'bootstrap-synthetic-identity-secret-0123456789'
}
const identity = {
  operatorId: 'bootstrap.synthetic',
  role: 'Admin' as const,
  tenantId: tenant
}
const headers = {
  origin: 'https://bootstrap.test',
  'x-forwarded-proto': 'https'
}

afterEach(() => vi.unstubAllEnvs())

// Run only on the Lead's scheduled disposable database. This fixture creates
// unique schemas/roles, never changes PUBLIC grants or other agents' objects.
async function withDatabase(
  callback: (fixture: {
    env: NodeJS.ProcessEnv
    admin: Client
    auth: string
    data: string
    sessionRole: string
    migrationUrl: string
    open: () => Promise<
      Awaited<ReturnType<typeof buildApiWithProductionSessions>>
    >
  }) => Promise<void>
) {
  const suffix = randomBytes(8).toString('hex')
  const data = `cvg_green_bootstrap_r3_data_${suffix}`
  const auth = `cvg_green_bootstrap_r3_auth_${suffix}`
  const migration = `cvg_green_bootstrap_r3_mig_${suffix}`
  const owner = `cvg_green_bootstrap_r3_owner_${suffix}`
  const runtime = `cvg_green_bootstrap_r3_runtime_${suffix}`
  const sessionRole = `cvg_green_bootstrap_r3_session_${suffix}`
  const roles = [migration, owner, runtime, sessionRole]
  const admin = new Client({ connectionString: databaseUrl! })
  const clients: Client[] = []
  const apps: Awaited<ReturnType<typeof buildApiWithProductionSessions>>[] = []
  const urlFor = (role: string) => {
    const url = new URL(databaseUrl!)
    url.username = role
    url.password = 'bootstrap_synthetic_only'
    return url.toString()
  }
  await admin.connect()
  try {
    for (const role of roles) {
      await admin.query(
        `CREATE ROLE ${role} LOGIN PASSWORD 'bootstrap_synthetic_only' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`
      )
    }
    const database = (
      await admin.query<{ name: string }>('SELECT current_database() AS name')
    ).rows[0]!.name
    const quotedDatabase = `"${database.replaceAll('"', '""')}"`
    await admin.query(`CREATE SCHEMA ${data} AUTHORIZATION ${migration}`)
    await admin.query(`GRANT USAGE ON SCHEMA ${data} TO ${runtime}`)
    await admin.query(`ALTER ROLE ${migration} SET search_path = ${data}`)
    await admin.query(`ALTER ROLE ${runtime} SET search_path = ${data}`)
    for (const [role, prepare] of [
      [
        migration,
        async (client: Client) =>
          runPostgresMigrations(client, {
            schemaName: data,
            createSchema: false
          })
      ],
      [
        owner,
        async (client: Client) => {
          await runOperatorSessionMigrations(client, auth, data)
          await grantOperatorSessionFunctions(client, auth, sessionRole)
        }
      ]
    ] as const) {
      if (role === owner)
        await admin.query(
          `GRANT CREATE ON DATABASE ${quotedDatabase} TO ${owner}`
        )
      const client = new Client({ connectionString: urlFor(role) })
      clients.push(client)
      await client.connect()
      await prepare(client)
      await client.end()
      if (role === owner)
        await admin.query(
          `REVOKE CREATE ON DATABASE ${quotedDatabase} FROM ${owner}`
        )
    }
    for (const table of TENANT_SCHEMA_TABLES) {
      await admin.query(
        `GRANT SELECT,INSERT,UPDATE ON ${data}.${table} TO ${runtime}`
      )
    }
    await admin.query(`GRANT SELECT ON ${data}.schema_migrations TO ${runtime}`)
    await admin.query(
      `GRANT SELECT,INSERT,UPDATE,DELETE ON ${data}.webhook_replay_events,${data}.rate_limit_buckets TO ${runtime}`
    )
    vi.stubEnv('NODE_ENV', 'production')
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'production',
      API_PERSISTENCE_MODE: 'postgres',
      DATABASE_URL: urlFor(runtime),
      POSTGRES_SCHEMA: data,
      POSTGRES_RLS_ENFORCEMENT: 'true',
      POSTGRES_AUTO_MIGRATE: 'false',
      OUTBOX_DURABLE_INBOUND: 'true',
      CVG_IDENTITY_MODE: 'trusted',
      CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({ current: key }),
      CVG_OPERATOR_SESSION_DATABASE_URL: urlFor(sessionRole),
      CVG_OPERATOR_AUTH_SCHEMA: auth,
      CVG_OPERATOR_SESSION_ROLE: sessionRole,
      CVG_RATE_LIMIT_KEYRING: JSON.stringify({
        budgetSecret: 'bootstrap-synthetic-budget-secret-0123456789',
        current: {
          keyId: 'bootstrap-rate',
          secret: 'bootstrap-synthetic-rate-secret-0123456789'
        }
      }),
      INBOUND_TENANT_ID: tenant,
      INBOUND_AGENT_ID: 'agent_22222222-2222-4222-8222-222222222222',
      WEBHOOK_SIGNING_SECRET: 'bootstrap-synthetic-webhook-secret-0123456789',
      API_ALLOWED_ORIGINS: headers.origin,
      API_REQUIRE_HTTPS: 'true',
      API_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      API_TRUSTED_PROXY_HOPS: '0'
    }
    const open = async () => {
      const app = await buildApiWithProductionSessions(env, {
        operatorIdentityResolver: createConfiguredOperatorIdentityResolver(env)!
      })
      apps.push(app)
      return app
    }
    await callback({
      env,
      admin,
      auth,
      data,
      sessionRole,
      migrationUrl: urlFor(migration),
      open
    })
  } finally {
    for (const app of apps) await app.close()
    for (const client of clients) await client.end()
    await admin.query(`DROP SCHEMA IF EXISTS ${auth} CASCADE`)
    await admin.query(`DROP SCHEMA IF EXISTS ${data} CASCADE`)
    for (const role of roles) {
      await admin.query(`DROP OWNED BY ${role}`)
      await admin.query(`DROP ROLE ${role}`)
    }
    await admin.end()
  }
}

describe.skipIf(!databaseUrl)(
  'own production bootstrap with scheduled PostgreSQL',
  () => {
    it('rejects missing config, shared schema, reused roles and unavailable auth DB before serving', async () => {
      await withDatabase(async ({ env, data, migrationUrl }) => {
        for (const name of [
          'CVG_OPERATOR_SESSION_DATABASE_URL',
          'CVG_OPERATOR_AUTH_SCHEMA',
          'CVG_OPERATOR_SESSION_ROLE'
        ]) {
          await expect(
            buildApiWithProductionSessions({ ...env, [name]: '' })
          ).rejects.toThrow(/required/)
        }
        await expect(
          createProductionOperatorSessionBootstrap({
            ...env,
            CVG_OPERATOR_AUTH_SCHEMA: data
          })
        ).rejects.toThrow(/private and separate/)
        await expect(
          createProductionOperatorSessionBootstrap({
            ...env,
            CVG_OPERATOR_SESSION_DATABASE_URL: env.DATABASE_URL!,
            CVG_OPERATOR_SESSION_ROLE: new URL(env.DATABASE_URL!).username
          })
        ).rejects.toThrow(/dedicated/)
        // Serving no longer knows the DDL role by URL; the live preflight
        // refuses it as the session role (it owns and uses the data schema).
        await expect(
          createProductionOperatorSessionBootstrap({
            ...env,
            CVG_OPERATOR_SESSION_DATABASE_URL: migrationUrl,
            CVG_OPERATOR_SESSION_ROLE: new URL(migrationUrl).username
          })
        ).rejects.toThrow('Production operator-session bootstrap failed')
        // SPEC 0144: the DDL credential never reaches the serving process.
        await expect(
          buildApiWithProductionSessions({
            ...env,
            DATABASE_MIGRATION_URL: migrationUrl
          })
        ).rejects.toThrow(
          'Production serving must not receive DATABASE_MIGRATION_URL'
        )
        await expect(
          buildServerFromEnv(
            { ...env, DATABASE_MIGRATION_URL: migrationUrl },
            {
              operatorIdentityResolver:
                createConfiguredOperatorIdentityResolver(env)!
            }
          )
        ).rejects.toThrow(
          'Production serving must not receive DATABASE_MIGRATION_URL'
        )
        await expect(
          buildServerFromEnv(
            { ...env, POSTGRES_AUTO_MIGRATE: 'true' },
            {
              operatorIdentityResolver:
                createConfiguredOperatorIdentityResolver(env)!
            }
          )
        ).rejects.toThrow(
          'Production serving must not run PostgreSQL migrations'
        )
        const unavailable = new URL(env.CVG_OPERATOR_SESSION_DATABASE_URL!)
        unavailable.port = '1'
        const started = Date.now()
        await expect(
          createProductionOperatorSessionBootstrap({
            ...env,
            CVG_OPERATOR_SESSION_DATABASE_URL: unavailable.toString()
          })
        ).rejects.toThrow('Production operator-session bootstrap failed')
        expect(Date.now() - started).toBeLessThan(5_000)
      })
    }, 60_000)

    it('uses real production data/auth boundaries and preserves HTTP identity controls', async () => {
      await withDatabase(async ({ env, open }) => {
        // Reproduce the original composition gap through its unchanged builder.
        const baseline = await buildServerFromEnv(env, {
          operatorIdentityResolver:
            createConfiguredOperatorIdentityResolver(env)!
        })
        try {
          expect(
            (await baseline.inject({ url: '/ready', headers })).statusCode
          ).toBe(200)
          expect(
            (await baseline.inject({ url: '/v1/admin/agents', headers }))
              .statusCode
          ).toBe(503)
        } finally {
          await baseline.close()
        }
        const app = await open()
        for (const url of ['/live', '/ready']) {
          expect((await app.inject({ url, headers })).statusCode).toBe(200)
        }
        const url = '/v1/admin/agents'
        expect((await app.inject({ url, headers })).statusCode).toBe(401)
        const token = createTrustedOperatorIdentityToken(identity, key)
        const signedHeaders = { ...headers, 'x-cvg-operator-token': token }
        expect(
          (await app.inject({ url, headers: signedHeaders })).statusCode
        ).toBe(200)
        expect(
          (await app.inject({ url, headers: signedHeaders })).statusCode
        ).toBe(401)
        expect(
          (
            await app.inject({
              url,
              headers: {
                ...headers,
                'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                  identity,
                  key
                ),
                'x-tenant-id': 'tenant_33333333-3333-4333-8333-333333333333'
              }
            })
          ).statusCode
        ).toBe(403)
        expect(
          (
            await app.inject({
              url,
              headers: { ...headers, origin: 'https://unapproved.test' }
            })
          ).statusCode
        ).toBe(403)
        expect(
          (
            await app.inject({
              url,
              headers: { ...headers, 'x-forwarded-proto': 'http' }
            })
          ).statusCode
        ).toBe(426)
      })
    }, 60_000)

    it('creates session through the unchanged route, survives restart, revokes and expires', async () => {
      await withDatabase(async ({ open, admin, auth }) => {
        const app = await open()
        const created = await app.inject({
          url: '/v1/session',
          headers: {
            ...headers,
            'x-cvg-operator-token': createTrustedOperatorIdentityToken(
              identity,
              key
            )
          }
        })
        expect(created.statusCode).toBe(200)
        const cookie = String(created.headers['set-cookie']).split(';')[0]!
        expect(cookie).toMatch(/^cvg_operator_session=opsess_/)
        await app.close()
        const restarted = await open()
        const url = '/v1/admin/agents'
        expect(
          (await restarted.inject({ url, headers: { ...headers, cookie } }))
            .statusCode
        ).toBe(200)
        expect(
          (
            await restarted.inject({
              method: 'POST',
              url: '/v1/session/logout',
              headers: { ...headers, cookie }
            })
          ).statusCode
        ).toBe(200)
        expect(
          (await restarted.inject({ url, headers: { ...headers, cookie } }))
            .statusCode
        ).toBe(401)
        const next = await restarted.inject({
          url: '/v1/session',
          headers: {
            ...headers,
            'x-cvg-operator-token': createTrustedOperatorIdentityToken(
              identity,
              key
            )
          }
        })
        expect(next.statusCode).toBe(200)
        const expiredCookie = String(next.headers['set-cookie']).split(';')[0]!
        await admin.query(
          `UPDATE ${auth}.operator_sessions SET created_at = clock_timestamp() - interval '5 minutes', expires_at = clock_timestamp() - interval '1 second' WHERE revoked_at IS NULL`
        )
        expect(
          (
            await restarted.inject({
              url,
              headers: { ...headers, cookie: expiredCookie }
            })
          ).statusCode
        ).toBe(401)
      })
    }, 60_000)

    it('rotation keeps the family: logout with the predecessor revokes the successor (AUD-0601 F02)', async () => {
      await withDatabase(async ({ open }) => {
        const app = await open()
        const login = (cookie?: string) =>
          app.inject({
            url: '/v1/session',
            headers: {
              ...headers,
              ...(cookie ? { cookie } : {}),
              'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                identity,
                key
              )
            }
          })
        const cookieOf = (response: { headers: Record<string, unknown> }) =>
          String(response.headers['set-cookie']).split(';')[0]!
        const first = await login()
        expect(first.statusCode).toBe(200)
        const a = cookieOf(first)
        const second = await login(a)
        expect(second.statusCode).toBe(200)
        const b = cookieOf(second)
        expect(b).not.toBe(a)
        const url = '/v1/admin/agents'
        // A was rotated out; B is the live session.
        expect(
          (await app.inject({ url, headers: { ...headers, cookie: a } }))
            .statusCode
        ).toBe(401)
        expect(
          (await app.inject({ url, headers: { ...headers, cookie: b } }))
            .statusCode
        ).toBe(200)
        // A delayed logout carrying the predecessor ends the whole lineage.
        const logout = await app.inject({
          method: 'POST',
          url: '/v1/session/logout',
          headers: { ...headers, cookie: a }
        })
        expect(logout.statusCode).toBe(200)
        expect(
          (await app.inject({ url, headers: { ...headers, cookie: b } }))
            .statusCode
        ).toBe(401)
      })
    }, 60_000)

    it('a failed logout keeps the cookie and the session usable for a retry (AUD-0601 F03)', async () => {
      await withDatabase(async ({ open, admin, auth, sessionRole }) => {
        const app = await open()
        const created = await app.inject({
          url: '/v1/session',
          headers: {
            ...headers,
            'x-cvg-operator-token': createTrustedOperatorIdentityToken(
              identity,
              key
            )
          }
        })
        const cookie = String(created.headers['set-cookie']).split(';')[0]!
        await admin.query(
          `REVOKE EXECUTE ON FUNCTION ${auth}.operator_session_revoke(bytea) FROM ${sessionRole}`
        )
        try {
          const failed = await app.inject({
            method: 'POST',
            url: '/v1/session/logout',
            headers: { ...headers, cookie }
          })
          expect(failed.statusCode).toBe(503)
          expect(failed.headers['set-cookie']).toBeUndefined()
        } finally {
          await admin.query(
            `GRANT EXECUTE ON FUNCTION ${auth}.operator_session_revoke(bytea) TO ${sessionRole}`
          )
        }
        const retried = await app.inject({
          method: 'POST',
          url: '/v1/session/logout',
          headers: { ...headers, cookie }
        })
        expect(retried.statusCode).toBe(200)
        expect(String(retried.headers['set-cookie'])).toMatch(
          /cvg_operator_session=;/
        )
        expect(
          (
            await app.inject({
              url: '/v1/admin/agents',
              headers: { ...headers, cookie }
            })
          ).statusCode
        ).toBe(401)
      })
    }, 60_000)

    it('a role change retires the old family first; if that fails no cookie changes (AUD-0602 F02)', async () => {
      await withDatabase(async ({ open, admin, auth, sessionRole }) => {
        const app = await open()
        const login = (
          who: {
            operatorId: string
            role: 'Admin' | 'Supervisor'
            tenantId: string
          },
          cookie?: string
        ) =>
          app.inject({
            url: '/v1/session',
            headers: {
              ...headers,
              ...(cookie ? { cookie } : {}),
              'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                who,
                key
              )
            }
          })
        const first = await login(identity)
        const a = String(first.headers['set-cookie']).split(';')[0]!
        const activeSessions = async () =>
          Number(
            (
              await admin.query<{ count: string }>(
                `SELECT count(*)::text AS count
                   FROM ${auth}.operator_sessions s
                   JOIN ${auth}.operator_session_families f USING (family_id)
                  WHERE s.revoked_at IS NULL AND f.revoked_at IS NULL
                    AND s.expires_at > clock_timestamp()`
              )
            ).rows[0]?.count
          )
        expect(await activeSessions()).toBe(1)
        const supervisor = { ...identity, role: 'Supervisor' as const }
        await admin.query(
          `REVOKE EXECUTE ON FUNCTION ${auth}.operator_session_revoke(bytea) FROM ${sessionRole}`
        )
        try {
          const failed = await login(supervisor, a)
          expect(failed.statusCode).toBe(503)
          expect(failed.headers['set-cookie']).toBeUndefined()
          expect(await activeSessions()).toBe(1)
        } finally {
          await admin.query(
            `GRANT EXECUTE ON FUNCTION ${auth}.operator_session_revoke(bytea) TO ${sessionRole}`
          )
        }
        const url = '/v1/admin/agents'
        expect(
          (await app.inject({ url, headers: { ...headers, cookie: a } }))
            .statusCode
        ).toBe(200)
        const retried = await login(supervisor, a)
        expect(retried.statusCode).toBe(200)
        const b = String(retried.headers['set-cookie']).split(';')[0]!
        expect(b).not.toBe(a)
        expect(await activeSessions()).toBe(1)
        expect(
          (await app.inject({ url, headers: { ...headers, cookie: a } }))
            .statusCode
        ).toBe(401)
      })
    }, 60_000)

    describe('identity switch is atomic and retires the presented lineage (AUD-0603)', () => {
      type Who = {
        operatorId: string
        role: 'Admin' | 'Supervisor'
        tenantId: string
      }
      const supervisor: Who = { ...identity, role: 'Supervisor' }
      const url = '/v1/admin/agents'
      const cookieOf = (response: { headers: Record<string, unknown> }) =>
        String(response.headers['set-cookie']).split(';')[0]!

      it('a failed create rolls the revocation back: previous cookie untouched (F01)', async () => {
        await withDatabase(async ({ open, admin, auth, sessionRole }) => {
          const app = await open()
          const login = (who: Who, cookie?: string) =>
            app.inject({
              url: '/v1/session',
              headers: {
                ...headers,
                ...(cookie ? { cookie } : {}),
                'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                  who,
                  key
                )
              }
            })
          const a = cookieOf(await login(identity))
          await admin.query(
            `REVOKE EXECUTE ON FUNCTION ${auth}.operator_session_create(bytea,text,text,text,timestamptz) FROM ${sessionRole}`
          )
          try {
            const failed = await login(supervisor, a)
            expect(failed.statusCode).toBe(503)
            expect(failed.headers['set-cookie']).toBeUndefined()
          } finally {
            await admin.query(
              `GRANT EXECUTE ON FUNCTION ${auth}.operator_session_create(bytea,text,text,text,timestamptz) TO ${sessionRole}`
            )
          }
          // The revocation was rolled back with the failed create.
          expect(
            (await app.inject({ url, headers: { ...headers, cookie: a } }))
              .statusCode
          ).toBe(200)
          const retried = await login(supervisor, a)
          expect(retried.statusCode).toBe(200)
          expect(
            (await app.inject({ url, headers: { ...headers, cookie: a } }))
              .statusCode
          ).toBe(401)
          // Any role: a live session answers GET /v1/session by cookie.
          expect(
            (
              await app.inject({
                url: '/v1/session',
                headers: { ...headers, cookie: cookieOf(retried) }
              })
            ).statusCode
          ).toBe(200)
        })
      }, 60_000)

      it('switching with a rotated predecessor cookie revokes its successor (F02)', async () => {
        await withDatabase(async ({ open }) => {
          const app = await open()
          const login = (who: Who, cookie?: string) =>
            app.inject({
              url: '/v1/session',
              headers: {
                ...headers,
                ...(cookie ? { cookie } : {}),
                'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                  who,
                  key
                )
              }
            })
          const a1 = cookieOf(await login(identity))
          const a2 = cookieOf(await login(identity, a1))
          expect(
            (await app.inject({ url, headers: { ...headers, cookie: a2 } }))
              .statusCode
          ).toBe(200)
          const switched = await login(supervisor, a1)
          expect(switched.statusCode).toBe(200)
          const c = cookieOf(switched)
          for (const old of [a1, a2]) {
            expect(
              (await app.inject({ url, headers: { ...headers, cookie: old } }))
                .statusCode
            ).toBe(401)
          }
          expect(
            (
              await app.inject({
                url: '/v1/session',
                headers: { ...headers, cookie: c }
              })
            ).statusCode
          ).toBe(200)
        })
      }, 60_000)

      it('a connection lost mid-switch answers 503 and the API stays up (AUD-0604 F01)', async () => {
        await withDatabase(async ({ open, auth, sessionRole }) => {
          const app = await open()
          const login = (who: Who, cookie?: string) =>
            app.inject({
              url: '/v1/session',
              headers: {
                ...headers,
                ...(cookie ? { cookie } : {}),
                'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                  who,
                  key
                )
              }
            })
          const a = cookieOf(await login(identity))
          // Hold the switch inside its transaction, then kill its backend.
          const locker = new Client({ connectionString: databaseUrl! })
          const killer = new Client({ connectionString: databaseUrl! })
          locker.on('error', () => undefined)
          killer.on('error', () => undefined)
          await locker.connect()
          await killer.connect()
          let switching: ReturnType<typeof login> | undefined
          try {
            await locker.query('BEGIN')
            await locker.query(
              `LOCK TABLE ${auth}.operator_sessions IN SHARE MODE`
            )
            switching = login(supervisor, a)
            let pid: number | undefined
            for (let attempt = 0; attempt < 200 && !pid; attempt++) {
              const blocked = await killer.query<{ pid: number }>(
                `SELECT pid FROM pg_stat_activity
                 WHERE usename = $1 AND wait_event_type = 'Lock'
                   AND datname = current_database()`,
                [sessionRole]
              )
              pid = blocked.rows[0]?.pid
              if (!pid) await new Promise((done) => setTimeout(done, 5))
            }
            expect(pid).toBeDefined()
            const terminated = await killer.query<{ ok: boolean }>(
              'SELECT pg_terminate_backend($1) AS ok',
              [pid]
            )
            expect(terminated.rows[0]?.ok).toBe(true)
            const failed = await switching
            expect(failed.statusCode).toBe(503)
            expect(failed.headers['set-cookie']).toBeUndefined()
          } finally {
            await locker.query('ROLLBACK').catch(() => undefined)
            await switching?.catch(() => undefined)
            await locker.end().catch(() => undefined)
            await killer.end().catch(() => undefined)
          }
          // Same process: liveness, readiness and the old session survive.
          for (const probe of ['/live', '/ready']) {
            expect((await app.inject({ url: probe, headers })).statusCode).toBe(
              200
            )
          }
          expect(
            (await app.inject({ url, headers: { ...headers, cookie: a } }))
              .statusCode
          ).toBe(200)
          // A new authentication completes the switch and retires the lineage.
          const retried = await login(supervisor, a)
          expect(retried.statusCode).toBe(200)
          expect(
            (await app.inject({ url, headers: { ...headers, cookie: a } }))
              .statusCode
          ).toBe(401)
          expect(
            (
              await app.inject({
                url: '/v1/session',
                headers: { ...headers, cookie: cookieOf(retried) }
              })
            ).statusCode
          ).toBe(200)
        })
      }, 60_000)
    })

    it('fails readiness, cookie and token-only requests on auth outage, then recovers', async () => {
      await withDatabase(async ({ open, admin, auth, sessionRole }) => {
        const app = await open()
        const created = await app.inject({
          url: '/v1/session',
          headers: {
            ...headers,
            'x-cvg-operator-token': createTrustedOperatorIdentityToken(
              identity,
              key
            )
          }
        })
        expect(created.statusCode).toBe(200)
        const cookie = String(created.headers['set-cookie']).split(';')[0]!
        const count = async () =>
          (
            await admin.query(
              `SELECT count(*)::int AS n FROM ${auth}.operator_sessions`
            )
          ).rows[0].n
        const before = await count()
        await admin.query(
          `REVOKE EXECUTE ON FUNCTION ${auth}.operator_session_get(bytea) FROM ${sessionRole}`
        )
        const failed = await app.inject({ url: '/ready', headers })
        expect(failed.statusCode).toBe(503)
        expect(failed.body).not.toMatch(
          /bootstrap_synthetic_only|postgresql:\/\//
        )
        expect((await app.inject({ url: '/live', headers })).statusCode).toBe(
          200
        )
        expect(
          (
            await app.inject({
              url: '/v1/admin/agents',
              headers: { ...headers, cookie }
            })
          ).statusCode
        ).toBe(503)
        expect(
          (
            await app.inject({
              url: '/v1/admin/agents',
              headers: {
                ...headers,
                'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                  identity,
                  key
                )
              }
            })
          ).statusCode
        ).toBe(503)
        expect(await count()).toBe(before)
        await admin.query(
          `GRANT EXECUTE ON FUNCTION ${auth}.operator_session_get(bytea) TO ${sessionRole}`
        )
        expect((await app.inject({ url: '/ready', headers })).statusCode).toBe(
          200
        )
        expect(
          (
            await app.inject({
              url: '/v1/admin/agents',
              headers: { ...headers, cookie }
            })
          ).statusCode
        ).toBe(200)
        expect(await count()).toBe(before)
      })
    }, 60_000)

    it('queues valid HMAC inbound during auth-only failure while all operator/session routes fail closed', async () => {
      await withDatabase(
        async ({ env, open, admin, auth, data, sessionRole }) => {
          const app = await open()
          const session = await app.inject({
            url: '/v1/session',
            headers: {
              ...headers,
              'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                identity,
                key
              )
            }
          })
          expect(session.statusCode).toBe(200)
          const cookie = String(session.headers['set-cookie']).split(';')[0]!
          await admin.query(
            `REVOKE EXECUTE ON FUNCTION ${auth}.operator_session_get(bytea) FROM ${sessionRole}`
          )
          try {
            const eventId = `bootstrap_r3_${randomBytes(16).toString('hex')}`
            const body = {
              body: 'Synthetic bootstrap R3 inbound',
              externalMessageId: eventId,
              receivedAt: new Date().toISOString(),
              senderRef: 'synthetic_bootstrap_r3'
            }
            const rawBody = JSON.stringify(body)
            const timestampSeconds = Math.floor(Date.now() / 1000)
            const signedHeaders = {
              ...headers,
              'content-type': 'application/json',
              'x-cvg-webhook-id': eventId,
              'x-cvg-webhook-timestamp': String(timestampSeconds),
              'x-cvg-webhook-signature': createWebhookSignature(
                env.WEBHOOK_SIGNING_SECRET!,
                {
                  eventId,
                  timestampSeconds,
                  channel: 'whatsapp',
                  body,
                  rawBody
                }
              )
            }
            const inbound = await app.inject({
              method: 'POST',
              url: '/v1/webhooks/channels/whatsapp/messages?source=bootstrap_r3',
              headers: signedHeaders,
              payload: rawBody
            })
            expect(inbound.statusCode).toBe(200)
            expect(inbound.json().data.outbox).toMatchObject({
              status: 'pending'
            })
            const queued = await admin.query(
              `SELECT * FROM ${data}.outbox_events WHERE id = $1`,
              [inbound.json().data.outbox.id]
            )
            expect(queued.rows).toHaveLength(1)
            expect(queued.rows[0]).toMatchObject({
              status: 'pending',
              tenant_id: tenant
            })
            expect(queued.rows[0]).toMatchObject({
              type: 'inbound.process',
              inbound_message_id: inbound.json().data.messageId,
              idempotency_key: inbound.json().data.outbox.idempotencyKey
            })
            expect(inbound.json().data.processing).toBe('queued')
            expect(
              (
                await app.inject({
                  method: 'POST',
                  url: '/v1/webhooks/channels/whatsapp/messages',
                  headers: { ...headers, 'content-type': 'application/json' },
                  payload: rawBody
                })
              ).statusCode
            ).toBe(401)
            expect(
              (await app.inject({ url: '/ready', headers })).statusCode
            ).toBe(503)
            for (const url of ['/live', '/health'])
              expect(
                (await app.inject({ url, headers: { ...headers, cookie } }))
                  .statusCode
              ).toBe(200)
            const protectedRoutes = [
              ['GET', '/v1/session'],
              ['HEAD', '/v1/session'],
              ['POST', '/v1/session/logout'],
              ['GET', '/v1/admin/agents'],
              ['HEAD', '/v1/admin/agents?source=/v1/webhooks'],
              ['POST', '/v1/admin/agents'],
              ['GET', '/v1/conversations'],
              ['GET', '/v1/tasks'],
              ['POST', '/v1/tasks'],
              ['PATCH', '/v1/tasks/synthetic/status'],
              ['GET', '/v1/approvals'],
              ['POST', '/v1/approvals'],
              ['POST', '/v1/executions'],
              ['GET', '/v1/executions/synthetic'],
              ['GET', '/v1/executions/synthetic/trajectory'],
              ['POST', '/v1/executions/synthetic/input'],
              ['POST', '/v1/executions/synthetic/cancel'],
              ['POST', '/v1/sessions/synthetic/takeover'],
              ['GET', '/v1/audit/sessions/synthetic'],
              ['GET', '/v1/observability/audit-evidence']
            ] as const
            for (const [method, url] of protectedRoutes) {
              for (const credentials of [
                { cookie },
                {
                  'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                    identity,
                    key
                  )
                }
              ]) {
                const response = await app.inject({
                  method,
                  url,
                  headers: { ...headers, ...credentials }
                })
                expect(response.statusCode, `${method} ${url}`).toBe(503)
                if (method === 'HEAD') expect(response.body).toBe('')
                else
                  expect(response.json().error.code).toBe('configuration_error')
              }
            }
            for (const url of [
              '/v1/admin/%61gents',
              '/v1/admin/agents/',
              '/v1//admin/agents',
              '/v1/webhooks/../admin/agents',
              '/v1/admin/agents%3fpublic=1'
            ]) {
              const response = await app.inject({
                url,
                headers: {
                  ...headers,
                  'x-cvg-operator-token': createTrustedOperatorIdentityToken(
                    identity,
                    key
                  )
                }
              })
              expect(response.statusCode, url).toBeGreaterThanOrEqual(400)
              expect(response.statusCode, url).toBeLessThan(600)
            }
          } finally {
            await admin.query(
              `GRANT EXECUTE ON FUNCTION ${auth}.operator_session_get(bytea) TO ${sessionRole}`
            )
          }
          expect(
            (await app.inject({ url: '/ready', headers })).statusCode
          ).toBe(200)
          expect(
            (
              await app.inject({
                url: '/v1/admin/agents',
                headers: { ...headers, cookie }
              })
            ).statusCode
          ).toBe(200)
        }
      )
    }, 60_000)

    it('real preflight rejects excessive role, altered functions/grants and closes partial startup', async () => {
      await withDatabase(async ({ env, admin, auth, sessionRole }) => {
        const reject = async () =>
          expect(createProductionOperatorSessionBootstrap(env)).rejects.toThrow(
            'Production operator-session bootstrap failed'
          )
        await admin.query(`ALTER ROLE ${sessionRole} BYPASSRLS`)
        await reject()
        await admin.query(`ALTER ROLE ${sessionRole} NOBYPASSRLS`)
        await admin.query(`ALTER ROLE ${sessionRole} REPLICATION`)
        await reject()
        await admin.query(`ALTER ROLE ${sessionRole} NOREPLICATION`)
        await admin.query(
          `GRANT SELECT ON ${auth}.operator_sessions TO ${sessionRole}`
        )
        await reject()
        await admin.query(
          `REVOKE SELECT ON ${auth}.operator_sessions FROM ${sessionRole}`
        )
        await admin.query(
          `ALTER FUNCTION ${auth}.operator_session_get(bytea) SET search_path = public`
        )
        await reject()
        await admin.query(
          `ALTER FUNCTION ${auth}.operator_session_get(bytea) SET search_path = pg_catalog, pg_temp`
        )
        const good = await createProductionOperatorSessionBootstrap(env)
        await Promise.all([good!.close(), good!.close()])
        const sessions = await admin.query<{ n: number }>(
          'SELECT count(*)::int AS n FROM pg_stat_activity WHERE usename = $1',
          [sessionRole]
        )
        expect(sessions.rows[0]!.n).toBe(0)
      })
    }, 60_000)
  }
)
