/**
 * AUD19-006 — distributed operator-token replay protection.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); any required
 * gate sets AUD19_PG_REQUIRED=1 and a missing database becomes a hard
 * failure instead of a silent skip.
 */
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { runPostgresMigrations } from '@cvg/persistence'
import { buildServer } from '../server.ts'
import { createInMemoryOperatorSessionStore } from '../operator-session.ts'
import {
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'
import { PostgresWebhookReplayStore } from '../webhook-security.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.AUD19_PG_REQUIRED === '1'
const pgEnabled = Boolean(testDatabaseUrl)

if (pgRequired && !pgEnabled) {
  throw new Error(
    'AUD19_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to pass this required gate with a skip'
  )
}

const itWithPostgres = pgEnabled ? it : it.skip

const SECRET = 'distributed-replay-synthetic-secret-0001-abcdef'
const tenantA = 'tenant_00000000-0000-4000-8000-000000000331'
const identity = {
  operatorId: 'operator.replay',
  role: 'Supervisor' as const,
  tenantId: tenantA
}

async function setupDatabase() {
  const admin = new Client({ connectionString: testDatabaseUrl as string })
  await admin.connect()
  const schemaName = `cvg_aud19_006_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
  await runPostgresMigrations(admin, { schemaName })
  const pool = new Pool({
    connectionString: testDatabaseUrl as string,
    options: `-c search_path=${schemaName}`
  })
  return { admin, pool, schemaName }
}

async function teardownDatabase(setup: {
  admin: Client
  pool: Pool
  schemaName: string
}) {
  await setup.pool.end().catch(() => undefined)
  await setup.admin
    .query(`DROP SCHEMA IF EXISTS ${setup.schemaName} CASCADE`)
    .catch(() => undefined)
  await setup.admin.end().catch(() => undefined)
}

function trustedApp(
  pool: Pool,
  store: PostgresWebhookReplayStore,
  secret: string = SECRET
) {
  return buildServer({
    identityMode: 'trusted',
    operatorIdentityResolver: createTrustedOperatorIdentityResolver({
      secret
    }),
    operatorSessionStore: createInMemoryOperatorSessionStore(),
    persistence: { kind: 'postgres', client: pool as never },
    tokenReplayStore: store
  })
}

describe('distributed operator token replay (AUD19-006)', () => {
  itWithPostgres(
    'rejects the same token on a second process and after restart',
    async () => {
      const setup = await setupDatabase()
      try {
        const token = createTrustedOperatorIdentityToken(identity, SECRET)
        const headers = { 'x-cvg-operator-token': token }
        // Process A accepts the token once...
        const appA = trustedApp(
          setup.pool,
          new PostgresWebhookReplayStore(setup.pool as never)
        )
        const first = await appA.inject({
          method: 'GET',
          url: '/v1/conversations?limit=1',
          headers
        })
        await appA.close()
        expect(first.statusCode).toBe(200)
        // ...process B (fresh instance, same database) rejects the replay...
        const appB = trustedApp(
          setup.pool,
          new PostgresWebhookReplayStore(setup.pool as never)
        )
        const replay = await appB.inject({
          method: 'GET',
          url: '/v1/conversations?limit=1',
          headers
        })
        await appB.close()
        expect(replay.statusCode).toBe(401)
        expect(replay.json().error.message).toMatch(/replay/i)
        // ...and a restart (third instance) still rejects it.
        const appC = trustedApp(
          setup.pool,
          new PostgresWebhookReplayStore(setup.pool as never)
        )
        const afterRestart = await appC.inject({
          method: 'GET',
          url: '/v1/conversations?limit=1',
          headers
        })
        await appC.close()
        expect(afterRestart.statusCode).toBe(401)
        // A distinct token still works.
        const appD = trustedApp(
          setup.pool,
          new PostgresWebhookReplayStore(setup.pool as never)
        )
        const fresh = await appD.inject({
          method: 'GET',
          url: '/v1/conversations?limit=1',
          headers: {
            'x-cvg-operator-token': createTrustedOperatorIdentityToken(
              identity,
              SECRET
            )
          }
        })
        await appD.close()
        expect(fresh.statusCode).toBe(200)
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'fails closed when the replay store is unavailable',
    async () => {
      const setup = await setupDatabase()
      try {
        const broken = new PostgresWebhookReplayStore({
          connect: async () => {
            throw new Error('synthetic store outage')
          }
        } as never)
        const app = trustedApp(setup.pool, broken)
        const response = await app.inject({
          method: 'GET',
          url: '/v1/conversations?limit=1',
          headers: {
            'x-cvg-operator-token': createTrustedOperatorIdentityToken(
              identity,
              SECRET
            )
          }
        })
        await app.close()
        // Outage denies; it never admits.
        expect(response.statusCode).toBe(401)
      } finally {
        await teardownDatabase(setup)
      }
    }
  )
})
