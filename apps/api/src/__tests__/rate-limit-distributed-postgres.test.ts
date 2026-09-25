/**
 * AUD19-006 — distributed rate limiting on PostgreSQL.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); any required
 * gate sets AUD19_PG_REQUIRED=1 and a missing database becomes a hard
 * failure instead of a silent skip.
 */
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import { runPostgresMigrations } from '@cvg/persistence'
import { buildServer } from '../server.ts'
import {
  createControlledRateLimitKeyRing,
  createRateLimitKeyRing,
  InMemoryRateLimiter,
  PostgresRateLimiter
} from '../rate-limit.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.AUD19_PG_REQUIRED === '1'
const pgEnabled = Boolean(testDatabaseUrl)

if (pgRequired && !pgEnabled) {
  throw new Error(
    'AUD19_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to pass this required gate with a skip'
  )
}

const itWithPostgres = pgEnabled ? it : it.skip

async function setupDatabase() {
  const admin = new Client({ connectionString: testDatabaseUrl as string })
  await admin.connect()
  const schemaName = `cvg_aud19_006_rl_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
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

describe('distributed rate limiting (AUD19-006)', () => {
  itWithPostgres(
    'shares one budget across instances and restarts',
    async () => {
      const setup = await setupDatabase()
      try {
        const policy = { max: 3, windowMs: 60_000 }
        const keyRing = createControlledRateLimitKeyRing()
        const first = new PostgresRateLimiter(setup.pool as never, { keyRing })
        expect(await first.check('tenant:t:sub:s', policy)).toMatchObject({
          allowed: true
        })
        expect(await first.check('tenant:t:sub:s', policy)).toMatchObject({
          allowed: true
        })
        // Second process continues the same budget...
        const second = new PostgresRateLimiter(setup.pool as never, { keyRing })
        expect(await second.check('tenant:t:sub:s', policy)).toMatchObject({
          allowed: true
        })
        const denied = await second.check('tenant:t:sub:s', policy)
        expect(denied.allowed).toBe(false)
        expect(denied.retryAfterSeconds).toBeGreaterThan(0)
        // ...a restart still sees the exhausted budget...
        const restarted = new PostgresRateLimiter(setup.pool as never, {
          keyRing
        })
        expect((await restarted.check('tenant:t:sub:s', policy)).allowed).toBe(
          false
        )
        // ...while an independent scoped key is unaffected.
        expect(
          (await restarted.check('tenant:other:sub:s', policy)).allowed
        ).toBe(true)
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres('resets the budget when the window expires', async () => {
    const setup = await setupDatabase()
    try {
      const limiter = new PostgresRateLimiter(setup.pool as never, {
        keyRing: createControlledRateLimitKeyRing()
      })
      const policy = { max: 1, windowMs: 300 }
      expect((await limiter.check('expiry-key', policy)).allowed).toBe(true)
      expect((await limiter.check('expiry-key', policy)).allowed).toBe(false)
      await new Promise((resolve) => setTimeout(resolve, 350))
      expect((await limiter.check('expiry-key', policy)).allowed).toBe(true)
    } finally {
      await teardownDatabase(setup)
    }
  })

  itWithPostgres(
    'serializes concurrent first checks for one logical budget',
    async () => {
      const setup = await setupDatabase()
      try {
        const keyRing = createControlledRateLimitKeyRing()
        const limiters = [
          new PostgresRateLimiter(setup.pool as never, { keyRing }),
          new PostgresRateLimiter(setup.pool as never, { keyRing })
        ]
        const results = await Promise.all(
          Array.from({ length: 8 }, (_, index) =>
            limiters[index % limiters.length]!.check('concurrent-key', {
              max: 4,
              windowMs: 60_000
            })
          )
        )
        expect(results.filter((result) => result.allowed)).toHaveLength(4)
        expect(results.filter((result) => !result.allowed)).toHaveLength(4)
        const rows = await setup.pool.query<{ total: string; count: number }>(
          'SELECT COUNT(*) AS total, MAX(count) AS count FROM rate_limit_buckets'
        )
        expect(rows.rows[0]).toMatchObject({ total: '1', count: 8 })
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'fails closed at active capacity without evicting an existing budget',
    async () => {
      const setup = await setupDatabase()
      try {
        const limiter = new PostgresRateLimiter(setup.pool as never, {
          maxBuckets: 2,
          keyRing: createControlledRateLimitKeyRing()
        })
        const policy = { max: 1, windowMs: 60_000 }
        expect((await limiter.check('active-a', policy)).allowed).toBe(true)
        expect((await limiter.check('active-b', policy)).allowed).toBe(true)
        await expect(limiter.check('active-c', policy)).rejects.toThrow(
          /capacity/i
        )
        expect((await limiter.check('active-a', policy)).allowed).toBe(false)
        const rows = await setup.pool.query<{ total: string }>(
          'SELECT COUNT(*) AS total FROM rate_limit_buckets'
        )
        expect(rows.rows[0]?.total).toBe('2')
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  itWithPostgres(
    'denies when the store is unavailable (fail-closed)',
    async () => {
      const broken = new PostgresRateLimiter(
        {
          query: async () => {
            throw new Error('synthetic store outage')
          }
        },
        { keyRing: createControlledRateLimitKeyRing() }
      )
      await expect(
        broken.check('any-key', { max: 10, windowMs: 60_000 })
      ).rejects.toThrow('synthetic store outage')
    }
  )

  it('keeps the process-local limiter behavior unchanged', () => {
    const limiter = new InMemoryRateLimiter()
    const policy = { max: 2, windowMs: 60_000 }
    expect(limiter.check('k', policy).allowed).toBe(true)
    expect(limiter.check('k', policy).allowed).toBe(true)
    expect(limiter.check('k', policy).allowed).toBe(false)
  })

  it('keeps one budget across a signing-key rotation', async () => {
    const budgetSecret =
      'synthetic-rate-limit-budget-namespace-secret-2026-09-21-0001'
    const oldKeyRing = createRateLimitKeyRing({
      budgetSecret,
      current: {
        keyId: 'rl-previous-v1',
        secret: 'synthetic-rate-limit-previous-hmac-secret-2026-09-21-0001'
      }
    })
    const rotatedKeyRing = createRateLimitKeyRing({
      budgetSecret,
      current: {
        keyId: 'rl-current-v2',
        secret: 'synthetic-rate-limit-current-hmac-secret-2026-09-21-0001'
      },
      previous: [oldKeyRing.current]
    })
    const rows = new Map<
      string,
      { count: number; reset_at: Date; key_version: string; key_digest: string }
    >()
    const valuesSeen: unknown[] = []
    const db = {
      query: async (text: string, values?: unknown[]) => {
        valuesSeen.push(...(values ?? []))
        if (!text.includes('INSERT INTO rate_limit_buckets')) {
          return { rows: [] }
        }
        const [budgetKey, keyVersion, keyDigest, maxBuckets, windowMs] =
          values ?? []
        const existing = rows.get(String(budgetKey))
        if (!existing && rows.size >= Number(maxBuckets)) return { rows: [] }
        const resetAt =
          existing?.reset_at ?? new Date(Date.now() + Number(windowMs))
        const next = {
          count:
            existing && existing.reset_at.getTime() > Date.now()
              ? existing.count + 1
              : 1,
          reset_at: resetAt,
          key_version: String(keyVersion),
          key_digest: String(keyDigest)
        }
        rows.set(String(budgetKey), next)
        return { rows: [{ count: next.count, reset_at: next.reset_at }] }
      }
    }
    const policy = { max: 2, windowMs: 60_000 }
    const oldLimiter = new PostgresRateLimiter(db as never, {
      cleanupSampleRate: 1,
      keyRing: oldKeyRing
    })
    const rotatedLimiter = new PostgresRateLimiter(db as never, {
      cleanupSampleRate: 1,
      keyRing: rotatedKeyRing
    })

    expect((await oldLimiter.check('synthetic-client', policy)).allowed).toBe(
      true
    )
    expect(
      (await rotatedLimiter.check('synthetic-client', policy)).allowed
    ).toBe(true)
    expect(
      (await rotatedLimiter.check('synthetic-client', policy)).allowed
    ).toBe(false)
    expect(rows.size).toBe(1)
    expect([...rows.values()][0]).toMatchObject({
      key_version: 'rl-current-v2'
    })
    expect(valuesSeen).not.toContain('synthetic-client')
    expect([...rows.values()][0]?.key_digest).toMatch(/^[0-9a-f]{64}$/)
  })

  itWithPostgres(
    'enforces the shared budget at the HTTP boundary',
    async () => {
      const setup = await setupDatabase()
      try {
        const app = buildServer({
          persistence: { kind: 'postgres', client: setup.pool as never },
          rateLimiter: new PostgresRateLimiter(setup.pool as never, {
            maxBuckets: 10,
            keyRing: createControlledRateLimitKeyRing()
          })
        })
        let denied = 0
        // 301 sequential requests: the first 300 pass the 300/min IP budget.
        for (let index = 0; index < 301; index += 1) {
          const response = await app.inject({
            method: 'GET',
            url: '/v1/conversations?limit=1',
            headers: {
              'x-operator-id': 'operator.synthetic',
              'x-operator-role': 'Operator'
            }
          })
          if (response.statusCode === 429) denied += 1
        }
        await app.close()
        expect(denied).toBe(1)
      } finally {
        await teardownDatabase(setup)
      }
    }
  )

  it('covers synthetic distributed cleanup, denial, and validation paths', async () => {
    const statements: Array<{ text: string; values?: unknown[] }> = []
    let count = 0
    const db = {
      query: async (text: string, values?: unknown[]) => {
        statements.push(values === undefined ? { text } : { text, values })
        if (text.includes('INSERT INTO rate_limit_buckets')) {
          count += 1
          return {
            rows: [{ count, reset_at: new Date(Date.now() + 5_000) }]
          }
        }
        if (text.includes('SELECT COUNT(*) AS total')) {
          return { rows: [{ total: '12' }] }
        }
        return { rows: [] }
      }
    }
    const limiter = new PostgresRateLimiter(db as never, {
      maxBuckets: 10,
      cleanupSampleRate: 1,
      keyRing: createControlledRateLimitKeyRing()
    })

    await expect(
      limiter.check('distributed-key', { max: 1, windowMs: 1_000 })
    ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 })
    await expect(
      limiter.check('distributed-key', { max: 1, windowMs: 1_000 })
    ).resolves.toMatchObject({ allowed: false })
    expect(
      statements.some(({ text }) => text.includes('reset_at <= now()'))
    ).toBe(true)
    expect(
      statements.some(({ text }) => text.includes('ORDER BY reset_at ASC'))
    ).toBe(false)
    expect(statements.flatMap(({ values }) => values ?? [])).not.toContain(
      'distributed-key'
    )

    const missingRow = new PostgresRateLimiter(
      {
        query: async () => ({ rows: [] })
      } as never,
      { keyRing: createControlledRateLimitKeyRing() }
    )
    await expect(
      missingRow.check('missing-row', { max: 1, windowMs: 1_000 })
    ).rejects.toThrow(/capacity/i)

    expect(
      () =>
        new PostgresRateLimiter(db as never, {
          cleanupSampleRate: 0,
          keyRing: createControlledRateLimitKeyRing()
        })
    ).toThrow(/cleanupSampleRate/i)
    await expect(
      limiter.check('', { max: 1, windowMs: 1_000 })
    ).rejects.toThrow(/rate limit key/i)
    await expect(
      limiter.check('valid-key', { max: 0, windowMs: 1_000 })
    ).rejects.toThrow(/rate limit policy/i)
  })
})
