import { describe, expect, it } from 'vitest'
import {
  createConfiguredRateLimitKeyRing,
  InMemoryRateLimiter,
  RATE_LIMIT_KEYRING_ENV
} from '../rate-limit.ts'
import { buildServer } from '../server.ts'

describe('in-memory API rate limiter', () => {
  it('allows a bounded number of requests and exposes retry timing', () => {
    const limiter = new InMemoryRateLimiter(() => 1_000)

    expect(limiter.check('client-a', { max: 2, windowMs: 60_000 })).toEqual({
      allowed: true,
      retryAfterSeconds: 0
    })
    expect(limiter.check('client-a', { max: 2, windowMs: 60_000 })).toEqual({
      allowed: true,
      retryAfterSeconds: 0
    })
    expect(limiter.check('client-a', { max: 2, windowMs: 60_000 })).toEqual({
      allowed: false,
      retryAfterSeconds: 60
    })
  })

  it('expires buckets without sharing limits across keys', () => {
    let now = 1_000
    const limiter = new InMemoryRateLimiter(() => now)

    expect(limiter.check('client-a', { max: 1, windowMs: 1_000 }).allowed).toBe(
      true
    )
    expect(limiter.check('client-b', { max: 1, windowMs: 1_000 }).allowed).toBe(
      true
    )
    expect(limiter.check('client-a', { max: 1, windowMs: 1_000 }).allowed).toBe(
      false
    )
    now = 2_001
    expect(limiter.check('client-a', { max: 1, windowMs: 1_000 })).toEqual({
      allowed: true,
      retryAfterSeconds: 0
    })
  })

  it('does not evict an active budget when capacity is full', () => {
    const limiter = new InMemoryRateLimiter({
      now: () => 1_000,
      maxBuckets: 2
    })

    limiter.check('client-a', { max: 1, windowMs: 10_000 })
    limiter.check('client-b', { max: 1, windowMs: 20_000 })
    const beforeEviction = limiter.snapshot()

    expect(() =>
      limiter.check('client-c', { max: 1, windowMs: 10_000 })
    ).toThrow(/capacity/i)
    expect(limiter.snapshot()).toEqual({ bucketCount: 2, maxBuckets: 2 })
    expect(beforeEviction).toEqual({ bucketCount: 2, maxBuckets: 2 })
    expect(
      limiter.check('client-b', { max: 1, windowMs: 20_000 }).allowed
    ).toBe(false)
    expect(
      limiter.check('client-a', { max: 1, windowMs: 10_000 }).allowed
    ).toBe(false)
  })

  it('rejects invalid policies and keys without exposing bucket keys', () => {
    expect(() => new InMemoryRateLimiter({ maxBuckets: 0 })).toThrow(
      /maxBuckets/i
    )
    expect(() => new InMemoryRateLimiter({ maxBuckets: 65_537 })).toThrow(
      /maxBuckets/i
    )

    const limiter = new InMemoryRateLimiter(() => 1_000)

    expect(() =>
      limiter.check('client-a', { max: 0, windowMs: 1_000 })
    ).toThrow(/rate limit policy/i)
    expect(() => limiter.check('client-a', { max: 1, windowMs: 0 })).toThrow(
      /rate limit policy/i
    )
    expect(() =>
      limiter.check('client-a', { max: 1, windowMs: 86_400_001 })
    ).toThrow(/rate limit policy/i)
    expect(() => limiter.check('', { max: 1, windowMs: 1_000 })).toThrow(
      /rate limit key/i
    )
    expect(() =>
      limiter.check('x'.repeat(257), { max: 1, windowMs: 1_000 })
    ).toThrow(/rate limit key/i)

    limiter.check('secret-client-key', { max: 1, windowMs: 1_000 })
    const snapshot = limiter.snapshot()
    expect(JSON.stringify(snapshot)).not.toContain('secret-client-key')
    expect(snapshot).toEqual({ bucketCount: 1, maxBuckets: 4_096 })
    snapshot.bucketCount = 999
    expect(limiter.snapshot()).toEqual({ bucketCount: 1, maxBuckets: 4_096 })
  })

  it('requires explicit key material outside the controlled test profile', () => {
    expect(
      createConfiguredRateLimitKeyRing({ NODE_ENV: 'development' })
    ).toBeUndefined()
    expect(() =>
      createConfiguredRateLimitKeyRing({
        NODE_ENV: 'production',
        [RATE_LIMIT_KEYRING_ENV]: JSON.stringify({})
      })
    ).toThrow(/CVG_RATE_LIMIT_KEYRING is invalid/)
  })

  it('returns a stable 429 envelope after the API window is exhausted', async () => {
    const app = buildServer()
    let response
    // AUD19-006: infrastructure probes (/health, /live, /ready) are never
    // rate-billed; exercise the billed API surface instead.
    for (let index = 0; index <= 300; index += 1) {
      response = await app.inject({
        method: 'GET',
        url: '/v1/conversations?limit=1'
      })
    }
    await app.close()

    expect(response?.statusCode).toBe(429)
    expect(response?.headers['retry-after']).toBeDefined()
    expect(response?.headers['cache-control']).toBe('no-store')
    expect(response?.json()).toMatchObject({
      success: false,
      error: { code: 'rate_limited' }
    })
  })
})
