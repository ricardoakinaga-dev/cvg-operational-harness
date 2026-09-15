import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CorrelationIdSchema,
  createCorrelationId,
  createDomainId,
  DomainIdSchema,
  IdempotencyKeySchema
} from '../ids.ts'

const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('domain id generation fallbacks', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('derives RFC4122 v4 identifiers from getRandomValues when randomUUID is absent', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = index
      }
      return bytes
    })
    vi.stubGlobal('crypto', { getRandomValues })

    const domainId = createDomainId('fixture')
    const correlationId = createCorrelationId()

    expect(getRandomValues).toHaveBeenCalledTimes(2)
    expect(DomainIdSchema.safeParse(domainId).success).toBe(true)
    expect(CorrelationIdSchema.safeParse(correlationId).success).toBe(true)
    const uuid = domainId.slice('fixture_'.length)
    expect(uuid).toMatch(UUID_V4)
    expect(uuid).toBe('00010203-0405-4607-8809-0a0b0c0d0e0f')
  })

  it('fails closed when neither randomUUID nor getRandomValues is available', () => {
    vi.stubGlobal('crypto', {
      randomUUID: undefined,
      getRandomValues: undefined
    })
    expect(() => createDomainId('fixture')).toThrow(
      'Secure UUID generation is unavailable'
    )

    vi.stubGlobal('crypto', undefined)
    expect(() => createCorrelationId()).toThrow(
      'Secure UUID generation is unavailable'
    )
  })

  it('rejects malformed domain ids and out-of-bounds idempotency keys', () => {
    expect(DomainIdSchema.safeParse('fixture_short').success).toBe(false)
    expect(
      DomainIdSchema.safeParse('Fixture_00000000-0000-4000-8000-000000000001')
        .success
    ).toBe(false)
    expect(CorrelationIdSchema.safeParse('corr_not-a-uuid').success).toBe(false)
    expect(IdempotencyKeySchema.safeParse('short').success).toBe(false)
    expect(IdempotencyKeySchema.safeParse('x'.repeat(201)).success).toBe(false)
    expect(IdempotencyKeySchema.safeParse('valid-key-8').success).toBe(true)
  })
})
