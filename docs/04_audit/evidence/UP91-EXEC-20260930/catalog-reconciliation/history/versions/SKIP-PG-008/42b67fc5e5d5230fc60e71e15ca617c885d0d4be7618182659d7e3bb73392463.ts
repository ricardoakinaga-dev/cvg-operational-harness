import { afterEach, describe, expect, it, vi } from 'vitest'
import { Client, Pool } from 'pg'
import {
  HmacWebhookVerifier,
  InMemoryWebhookReplayStore,
  PostgresWebhookReplayStore,
  buildWebhookSigningPayload,
  createWebhookSignature,
  type WebhookSigningInput
} from '../webhook-security.ts'
import { buildServer, buildServerFromEnv } from '../server.ts'
import type { PostgresPoolLike } from '@cvg/persistence'

const secret = 'fixture-webhook-secret'
const channel = 'whatsapp'
const testDatabaseUrl = process.env.TEST_DATABASE_URL
const body = {
  body: 'Mensagem fictícia',
  externalMessageId: 'webhook-security-1',
  receivedAt: '2026-08-24T12:00:00.000Z',
  senderRef: '+5511000000000'
}

function signingInput(
  overrides: Partial<WebhookSigningInput> = {}
): WebhookSigningInput {
  return {
    eventId: 'event-security-1',
    timestampSeconds: 1_787_583_600,
    channel,
    body,
    ...overrides
  }
}

function signedHeaders(input: WebhookSigningInput) {
  return {
    'x-cvg-webhook-id': input.eventId,
    'x-cvg-webhook-timestamp': String(input.timestampSeconds),
    'x-cvg-webhook-signature': createWebhookSignature(secret, input)
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

function replayPool(
  clients: Array<Array<Array<{ event_key: string }>>>
): PostgresPoolLike {
  return {
    connect: vi.fn(async () => {
      const responses = clients.shift() ?? []
      return {
        query: vi.fn(async () => ({
          rows: responses.shift() ?? []
        })),
        release: vi.fn()
      }
    })
  } as unknown as PostgresPoolLike
}

const itWithPostgres = testDatabaseUrl ? it : it.skip

describe('HmacWebhookVerifier', () => {
  it('accepts a valid signature and claims an event only once', async () => {
    const now = Math.floor(Date.now() / 1000) * 1000
    const replayStore = new InMemoryWebhookReplayStore()
    const verifier = new HmacWebhookVerifier({
      secret,
      replayStore,
      now: () => now,
      toleranceSeconds: 300
    })
    const input = signingInput({ timestampSeconds: now / 1000 })
    const request = {
      headers: { ...signedHeaders(input), 'content-type': 'application/json' },
      body: input.body,
      channel: input.channel
    }

    await expect(verifier.verify(request)).resolves.toBe(true)
    await expect(verifier.verify(request)).resolves.toBe(false)
  })

  it('rejects tampering, channel substitution, missing headers and stale timestamps', async () => {
    const now = Math.floor(Date.now() / 1000) * 1000
    const verifier = new HmacWebhookVerifier({
      secret,
      now: () => now,
      toleranceSeconds: 300
    })
    const input = signingInput({ timestampSeconds: now / 1000 })

    await expect(
      verifier.verify({
        headers: signedHeaders(input),
        body: { ...body, body: 'alterada' },
        channel
      })
    ).resolves.toBe(false)
    await expect(
      verifier.verify({
        headers: signedHeaders(input),
        body: input.body,
        channel: 'email'
      })
    ).resolves.toBe(false)
    await expect(
      verifier.verify({ headers: {}, body: input.body, channel })
    ).resolves.toBe(false)
    const stale = signingInput({ timestampSeconds: now / 1000 - 301 })
    await expect(
      verifier.verify({
        headers: signedHeaders(stale),
        body: stale.body,
        channel
      })
    ).resolves.toBe(false)
  })

  it('supports a previous secret during controlled rotation without accepting arbitrary signatures', async () => {
    const now = Math.floor(Date.now() / 1000) * 1000
    const verifier = new HmacWebhookVerifier({
      secret: ['new-secret', 'old-secret'],
      replayStore: new InMemoryWebhookReplayStore(),
      now: () => now
    })
    const input = signingInput({ timestampSeconds: now / 1000 })
    const oldSignature = createWebhookSignature('old-secret', input)

    await expect(
      verifier.verify({
        headers: {
          'x-cvg-webhook-id': input.eventId,
          'x-cvg-webhook-timestamp': String(input.timestampSeconds),
          'x-cvg-webhook-signature': oldSignature
        },
        body: input.body,
        channel
      })
    ).resolves.toBe(true)
    await expect(
      verifier.verify({
        headers: {
          'x-cvg-webhook-id': 'arbitrary-signature-event',
          'x-cvg-webhook-timestamp': String(input.timestampSeconds),
          'x-cvg-webhook-signature': 'sha256=00'
        },
        body: input.body,
        channel
      })
    ).resolves.toBe(false)
  })

  it('fails closed when replay storage cannot claim the event', async () => {
    const now = Math.floor(Date.now() / 1000) * 1000
    const verifier = new HmacWebhookVerifier({
      secret,
      replayStore: { claim: vi.fn(async () => false) },
      now: () => now
    })
    const input = signingInput({ timestampSeconds: now / 1000 })

    await expect(
      verifier.verify({
        headers: signedHeaders(input),
        body: input.body,
        channel
      })
    ).resolves.toBe(false)
  })

  it('leases a valid event and releases it when processing fails before commit', async () => {
    const now = Math.floor(Date.now() / 1000) * 1000
    const verifier = new HmacWebhookVerifier({
      secret,
      replayStore: new InMemoryWebhookReplayStore(),
      now: () => now
    })
    const input = signingInput({ timestampSeconds: now / 1000 })
    const request = {
      headers: signedHeaders(input),
      body: input.body,
      channel
    }

    const firstLease = await verifier.verifyWithLease(request)
    expect(firstLease?.verified).toBe(true)
    await firstLease?.release()
    const retryLease = await verifier.verifyWithLease(request)
    expect(retryLease?.verified).toBe(true)
    await retryLease?.commit()
    await expect(verifier.verifyWithLease(request)).resolves.toBeNull()
  })

  it('supports durable PostgreSQL replay reservation, commit and release paths', async () => {
    const expiresAt = Date.now() + 60_000
    const store = new PostgresWebhookReplayStore(
      replayPool([
        [[], [{ event_key: 'key-1' }]],
        [[{ event_key: 'key-1' }]],
        [[], [], [{ event_key: 'key-2' }]],
        [[{ event_key: 'key-2' }]],
        [[], [{ event_key: 'key-3' }]],
        [[]],
        [[{ event_key: 'key-3' }]],
        [[], [], []],
        [[]]
      ])
    )

    await expect(store.reserve('key-1', expiresAt)).resolves.toBe(true)
    await expect(store.commit('key-1')).resolves.toBe(true)
    await expect(store.reserve('key-2', expiresAt)).resolves.toBe(true)
    await expect(store.release('key-2')).resolves.toBe(true)
    await expect(store.claim('key-3', expiresAt)).resolves.toBe(false)
    await expect(store.claim('key-4', expiresAt)).resolves.toBe(false)
    await expect(store.release('key-5')).resolves.toBe(false)
    await expect(store.reserve('', expiresAt)).rejects.toThrow(
      'Webhook replay key is invalid'
    )
  })

  it('purges expired durable replay rows before reserving a new event', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ event_key: 'expired-key' }] })
    const pool = {
      connect: vi.fn(async () => ({
        query,
        release: vi.fn()
      }))
    } as unknown as PostgresPoolLike
    const store = new PostgresWebhookReplayStore(pool)

    await expect(
      store.reserve('expired-key', Date.now() + 60_000)
    ).resolves.toBe(true)
    expect(query.mock.calls[0]?.[0]).toContain(
      'DELETE FROM webhook_replay_events'
    )
  })

  itWithPostgres(
    'recovers stale PostgreSQL replay leases and preserves committed replay retention',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_webhook_security_${Date.now()}`
      const pool = new Pool({
        connectionString: testDatabaseUrl,
        options: `-c search_path=${schemaName}`
      })
      await client.connect()

      try {
        await client.query(`
          CREATE SCHEMA ${schemaName};
          SET search_path TO ${schemaName};
          CREATE TABLE webhook_replay_events (
            event_key text PRIMARY KEY,
            status text NOT NULL CHECK (status IN ('reserved', 'committed')),
            expires_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
          );
          CREATE INDEX idx_webhook_replay_events_expires
            ON webhook_replay_events (expires_at);
        `)
        const store = new PostgresWebhookReplayStore(pool)
        const expiresAt = Date.now() + 300_000

        await expect(store.reserve('stale-lease', expiresAt)).resolves.toBe(
          true
        )
        await client.query(
          `UPDATE ${schemaName}.webhook_replay_events
           SET created_at = CURRENT_TIMESTAMP - INTERVAL '31 seconds'
           WHERE event_key = $1`,
          ['stale-lease']
        )
        await expect(store.reserve('stale-lease', expiresAt)).resolves.toBe(
          true
        )
        await expect(store.commit('stale-lease')).resolves.toBe(true)
        await expect(store.reserve('stale-lease', expiresAt)).resolves.toBe(
          false
        )

        await client.query(
          `INSERT INTO ${schemaName}.webhook_replay_events
             (event_key, status, expires_at)
           VALUES ($1, 'committed', CURRENT_TIMESTAMP - INTERVAL '1 second')`,
          ['expired-lease']
        )
        await expect(
          store.reserve('purge-after-expiry', expiresAt)
        ).resolves.toBe(true)
        await expect(
          client.query(
            `SELECT count(*)::text AS count
             FROM ${schemaName}.webhook_replay_events
             WHERE event_key = $1`,
            ['expired-lease']
          )
        ).resolves.toMatchObject({ rows: [{ count: '0' }] })

        const concurrentClaims = await Promise.all(
          Array.from({ length: 8 }, () =>
            store.reserve('concurrent-lease', expiresAt)
          )
        )
        expect(concurrentClaims.filter(Boolean)).toHaveLength(1)
      } finally {
        await pool.end()
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )

  it('supports legacy replay stores and fails closed when a lease commit cannot complete', async () => {
    const now = Math.floor(Date.now() / 1000) * 1000
    const input = signingInput({ timestampSeconds: now / 1000 })
    const claim = vi.fn(async () => true)
    const legacyVerifier = new HmacWebhookVerifier({
      secret,
      now: () => now,
      replayStore: { claim }
    })
    const legacyLease = await legacyVerifier.verifyWithLease({
      headers: signedHeaders(input),
      body: input.body,
      channel
    })
    expect(legacyLease?.verified).toBe(true)
    await legacyLease?.commit()
    await legacyLease?.release()
    expect(claim).toHaveBeenCalledTimes(1)

    const rejectedVerifier = new HmacWebhookVerifier({
      secret,
      now: () => now,
      replayStore: { claim: vi.fn(async () => false) }
    })
    await expect(
      rejectedVerifier.verifyWithLease({
        headers: signedHeaders({
          ...input,
          eventId: 'legacy-rejected-event'
        }),
        body: input.body,
        channel
      })
    ).resolves.toBeNull()

    const leaseVerifier = new HmacWebhookVerifier({
      secret,
      now: () => now,
      replayStore: {
        claim: vi.fn(async () => false),
        reserve: vi.fn(async () => true),
        commit: vi.fn(async () => false),
        release: vi.fn(async () => true)
      }
    })
    const lease = await leaseVerifier.verifyWithLease({
      headers: signedHeaders({
        ...input,
        eventId: 'lease-commit-failure'
      }),
      body: input.body,
      channel
    })
    await expect(lease?.commit()).rejects.toThrow('replay commit failed')
    await lease?.release()
  })

  it('keeps replay state immutable across expiry and committed-release attempts', () => {
    let now = 10_000
    const store = new InMemoryWebhookReplayStore(() => now)

    expect(store.reserve('expired', now)).toBe(false)
    expect(store.commit('missing')).toBe(false)
    expect(store.reserve('event', now + 1_000)).toBe(true)
    expect(store.commit('event')).toBe(true)
    expect(store.release('event')).toBe(false)
    now += 2_000
    expect(store.reserve('event', now + 1_000)).toBe(true)
  })

  it('canonicalizes JSON-safe webhook bodies and rejects invalid signing inputs', () => {
    const richInput = signingInput({
      body: {
        empty: null,
        enabled: true,
        count: 2,
        items: ['a', false]
      }
    })
    expect(buildWebhookSigningPayload(richInput)).toContain(
      '{"count":2,"empty":null,"enabled":true,"items":["a",false]}'
    )
    expect(createWebhookSignature(secret, richInput)).toMatch(
      /^sha256=[a-f0-9]{64}$/
    )

    expect(() => createWebhookSignature('', richInput)).toThrow(
      'Webhook signing secret is required'
    )
    expect(() =>
      buildWebhookSigningPayload({ ...richInput, eventId: ' ' })
    ).toThrow('Webhook eventId is required')
    expect(() =>
      buildWebhookSigningPayload({ ...richInput, channel: ' ' })
    ).toThrow('Webhook channel is required')
    expect(() =>
      buildWebhookSigningPayload({ ...richInput, timestampSeconds: -1 })
    ).toThrow('Webhook timestamp must be a non-negative integer')
    expect(() =>
      buildWebhookSigningPayload({ ...richInput, body: Number.NaN })
    ).toThrow('Webhook body is not JSON-safe')
    expect(() =>
      buildWebhookSigningPayload({ ...richInput, body: new Date() })
    ).toThrow('Webhook body must contain plain JSON objects')
    expect(() =>
      buildWebhookSigningPayload({ ...richInput, body: undefined })
    ).toThrow('Webhook body is not JSON-safe')
  })

  it('rejects empty secrets and unsafe replay tolerance configuration', () => {
    expect(() => new HmacWebhookVerifier({ secret: '   ' })).toThrow(
      'At least one webhook signing secret is required'
    )
    expect(
      () => new HmacWebhookVerifier({ secret, toleranceSeconds: 0 })
    ).toThrow('Webhook tolerance must be a positive number of seconds')
    expect(
      () => new HmacWebhookVerifier({ secret, toleranceSeconds: 86_401 })
    ).toThrow('Webhook tolerance must be a positive number of seconds')
    expect(
      () => new HmacWebhookVerifier({ secret, toleranceSeconds: 1.5 })
    ).toThrow('Webhook tolerance must be a positive number of seconds')
  })
})

describe('webhook HMAC API boundary', () => {
  it('constructs the verifier from runtime configuration outside test mode', async () => {
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'development',
        API_PERSISTENCE_MODE: 'memory'
      })
    ).rejects.toThrow('WEBHOOK_SIGNING_SECRET')

    const app = await buildServerFromEnv({
      NODE_ENV: 'development',
      API_PERSISTENCE_MODE: 'memory',
      WEBHOOK_SIGNING_SECRET: secret
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: body
    })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'unauthorized' }
    })
  })

  it('accepts a signed webhook and rejects its replay', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const now = Math.floor(Date.now() / 1000) * 1000
    const input = signingInput({ timestampSeconds: now / 1000 })
    const app = buildServer({
      webhookVerifier: new HmacWebhookVerifier({
        secret,
        now: () => now
      }).verify,
      inboundTenantResolver: () => 'tenant_00000000-0000-4000-8000-000000000061'
    })

    const first = await app.inject({
      method: 'POST',
      url: `/v1/webhooks/channels/${channel}/messages`,
      headers: { ...signedHeaders(input), 'content-type': 'application/json' },
      payload: JSON.stringify(input.body)
    })
    const replay = await app.inject({
      method: 'POST',
      url: `/v1/webhooks/channels/${channel}/messages`,
      headers: { ...signedHeaders(input), 'content-type': 'application/json' },
      payload: JSON.stringify(input.body)
    })
    await app.close()

    expect(first.statusCode).toBe(200)
    expect(replay.statusCode).toBe(401)
    expect(replay.json()).toMatchObject({
      success: false,
      error: { code: 'unauthorized' }
    })
  })

  it('verifies the exact raw JSON bytes supplied by a provider', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const now = Math.floor(Date.now() / 1000) * 1000
    const rawBody = JSON.stringify({
      senderRef: '+5511000000000',
      body: 'Mensagem em ordem não canônica',
      receivedAt: '2026-08-24T12:00:00.000Z',
      externalMessageId: 'raw-body-event'
    })
    const input = signingInput({
      eventId: 'raw-body-event',
      timestampSeconds: now / 1000,
      body: JSON.parse(rawBody),
      rawBody
    })
    await expect(
      new HmacWebhookVerifier({ secret, now: () => now }).verify({
        headers: signedHeaders(input),
        body: input.body,
        rawBody,
        channel
      })
    ).resolves.toBe(true)
    const app = buildServer({
      webhookVerifier: new HmacWebhookVerifier({
        secret,
        now: () => now
      }).verifyWithLease,
      inboundTenantResolver: () => 'tenant_00000000-0000-4000-8000-000000000061'
    })

    const response = await app.inject({
      method: 'POST',
      url: `/v1/webhooks/channels/${channel}/messages`,
      headers: {
        ...signedHeaders(input),
        'content-type': 'application/json'
      },
      payload: rawBody
    })
    await app.close()

    expect(response.statusCode).toBe(200)
  })

  it('releases a HMAC reservation after a downstream failure so the provider can retry', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const now = Math.floor(Date.now() / 1000) * 1000
    const input = signingInput({
      eventId: 'event-retry-after-failure',
      timestampSeconds: now / 1000
    })
    const resolver = vi
      .fn()
      .mockRejectedValueOnce(new Error('fixture downstream failure'))
      .mockResolvedValue('tenant_00000000-0000-4000-8000-000000000061')
    const app = buildServer({
      webhookVerifier: new HmacWebhookVerifier({
        secret,
        now: () => now
      }).verifyWithLease,
      inboundTenantResolver: resolver
    })
    const request = {
      method: 'POST' as const,
      url: `/v1/webhooks/channels/${channel}/messages`,
      headers: { ...signedHeaders(input), 'content-type': 'application/json' },
      payload: JSON.stringify(input.body)
    }

    const failed = await app.inject(request)
    const retry = await app.inject(request)
    await app.close()

    expect(failed.statusCode).toBe(500)
    expect(retry.statusCode).toBe(200)
    expect(resolver).toHaveBeenCalledTimes(2)
  })
})
