import { describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import { InMemoryRateLimiter } from '../rate-limit.ts'
import { ControlledRequestMetrics } from '../request-metrics.ts'
import {
  CORRELATION_RESPONSE_HEADER,
  installResponseCorrelationHook,
  readResponseCorrelationId
} from '../response-correlation.ts'
import { classifyHttpRequestTarget } from '../http-target-boundary.ts'
import { classifyHttpRequestError } from '../http-request-boundary.ts'
import {
  HmacWebhookVerifier,
  PostgresWebhookReplayStore,
  createWebhookSignature
} from '../webhook-security.ts'
import { buildServer } from '../server.ts'

describe('small module boundaries', () => {
  it('rejects non-finite rate limit clocks and non-string keys', () => {
    const brokenClock = new InMemoryRateLimiter(() => Number.NaN)
    expect(() =>
      brokenClock.check('client-a', { max: 1, windowMs: 1_000 })
    ).toThrow(/finite/i)

    const limiter = new InMemoryRateLimiter(() => 1_000)
    expect(() =>
      limiter.check(42 as unknown as string, { max: 1, windowMs: 1_000 })
    ).toThrow(/key/i)
  })

  it('validates request metrics options and buckets unusual status codes', () => {
    expect(() => new ControlledRequestMetrics({ maxRoutes: 0 })).toThrow(
      /maxRoutes/
    )
    expect(() => new ControlledRequestMetrics({ now: () => '' })).toThrow(
      /timestamp/
    )

    const metrics = new ControlledRequestMetrics({
      now: () => '2026-09-13T00:00:00.000Z'
    })
    metrics.record({
      method: 'GET',
      routeTemplate: '/health',
      statusCode: 199,
      latencyMs: 1
    })
    metrics.record({
      method: 'GET',
      routeTemplate: '/health',
      statusCode: 600,
      latencyMs: 2
    })
    metrics.record({
      method: 'x-custom',
      routeTemplate: '/health',
      statusCode: 301,
      latencyMs: 3
    })
    metrics.record({
      method: 42 as unknown as string,
      routeTemplate: '/health',
      statusCode: 200.5,
      latencyMs: 4
    })
    expect(metrics.snapshot().statusBuckets).toMatchObject({
      other: 3,
      '2xx': 0,
      '3xx': 1
    })
    expect(metrics.snapshot().methods).toMatchObject({
      OTHER: 2,
      GET: 2
    })
    expect(() =>
      metrics.record({
        method: 'GET',
        routeTemplate: '/health',
        statusCode: 200,
        latencyMs: Number.POSITIVE_INFINITY
      })
    ).toThrow(/latencyMs/)
  })

  it('reads correlation identifiers only from well-formed envelopes', () => {
    expect(readResponseCorrelationId(null)).toBeNull()
    expect(readResponseCorrelationId([])).toBeNull()
    expect(readResponseCorrelationId({ meta: [] })).toBeNull()
    expect(
      readResponseCorrelationId({ meta: { correlationId: 'bad' } })
    ).toBeNull()
    const correlationId = readResponseCorrelationId({
      meta: { correlationId: 'corr_123e4567-e89b-12d3-a456-426614174000' }
    })
    expect(correlationId).toBe('corr_123e4567-e89b-12d3-a456-426614174000')
    expect(CORRELATION_RESPONSE_HEADER).toBe('x-correlation-id')
  })

  it('omits the correlation header when a response has no valid envelope', async () => {
    const app = Fastify({ logger: false })
    installResponseCorrelationHook(app)
    app.get('/plain', async () => ({ anything: true }))
    const response = await app.inject({ method: 'GET', url: '/plain' })
    await app.close()

    expect(response.statusCode).toBe(200)
    expect(response.headers[CORRELATION_RESPONSE_HEADER]).toBeUndefined()
  })

  it('fails webhook verification closed when the replay store is unavailable', async () => {
    const now = 1_800_000_000_000
    const input = {
      eventId: 'webhook-edge-1',
      timestampSeconds: now / 1000,
      channel: 'web',
      body: { senderRef: 'fixture', body: 'mensagem fictícia' }
    }
    const headers = {
      'x-cvg-webhook-id': input.eventId,
      'x-cvg-webhook-timestamp': String(input.timestampSeconds),
      'x-cvg-webhook-signature': createWebhookSignature('fixture-secret', input)
    }
    const verifier = new HmacWebhookVerifier({
      secret: 'fixture-secret',
      now: () => now,
      toleranceSeconds: 300,
      replayStore: {
        claim: () => {
          throw new Error('replay store offline')
        },
        reserve: () => {
          throw new Error('replay store offline')
        },
        commit: () => {
          throw new Error('replay store offline')
        },
        release: () => {
          throw new Error('replay store offline')
        }
      }
    })
    const verified = await verifier.verify({
      headers,
      body: input.body,
      channel: 'web'
    })
    const lease = await verifier.verifyWithLease({
      headers,
      body: input.body,
      channel: 'web'
    })

    expect(verified).toBe(false)
    expect(lease).toBeNull()
  })

  it('rejects invalid replay keys and expiries before opening a connection', async () => {
    const store = new PostgresWebhookReplayStore({
      connect: async () => {
        throw new Error('connection must not open')
      }
    })
    await expect(
      store.reserve('valid-key', Date.now() - 1_000)
    ).rejects.toThrow(/expiry/)
    await expect(store.reserve('', Date.now() + 60_000)).rejects.toThrow(/key/)
    await expect(
      store.reserve('k'.repeat(301), Date.now() + 60_000)
    ).rejects.toThrow(/key/)
  })

  it('classifies non-string request targets and malformed error shapes', () => {
    expect(classifyHttpRequestTarget(123)).toBeNull()
    expect(classifyHttpRequestTarget('/health')).toBeNull()
    expect(classifyHttpRequestTarget(`/${'b'.repeat(9 * 1024)}`)).toMatchObject(
      { code: 'request_uri_too_long', statusCode: 414 }
    )

    expect(classifyHttpRequestError('not-an-error')).toMatchObject({
      code: 'internal_error',
      statusCode: 500
    })
    const throwingCode = {}
    Object.defineProperty(throwingCode, 'code', {
      get() {
        throw new Error('unreadable code')
      }
    })
    expect(classifyHttpRequestError(throwingCode)).toMatchObject({
      code: 'internal_error',
      statusCode: 500
    })
  })

  it('correlates a real API response with the stable header', async () => {
    const app = buildServer({
      httpSecurity: { allowedOrigins: ['https://console.example.test'] }
    })
    const response = await app.inject({ method: 'GET', url: '/health' })
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/health',
      headers: {
        origin: 'https://console.example.test',
        'access-control-request-method': 'GET'
      }
    })
    await app.close()

    expect(response.headers['x-correlation-id']).toMatch(/^corr_/)
    expect(preflight.statusCode).toBe(204)
  })
})
