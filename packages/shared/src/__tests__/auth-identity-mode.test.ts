import { describe, expect, it } from 'vitest'
import {
  IDENTITY_MODE_ENV,
  IdentityModeSchema,
  parseIdentityMode
} from '../auth.ts'

describe('operator identity mode contract', () => {
  it('defaults to simulation only in test mode and fails closed otherwise', () => {
    expect(parseIdentityMode(undefined, 'test')).toBe('simulation')
    expect(parseIdentityMode('', 'test')).toBe('simulation')
    expect(parseIdentityMode(undefined, 'production')).toBe('trusted')
    expect(parseIdentityMode(undefined, 'development')).toBe('trusted')
    expect(parseIdentityMode(undefined, undefined)).toBe('trusted')
  })

  it('accepts explicit modes and trims whitespace', () => {
    expect(parseIdentityMode('simulation', 'production')).toBe('simulation')
    expect(parseIdentityMode(' trusted ', 'test')).toBe('trusted')
    expect(IdentityModeSchema.parse('trusted')).toBe('trusted')
    expect(IDENTITY_MODE_ENV).toBe('CVG_IDENTITY_MODE')
  })

  it('rejects unknown or malformed modes', () => {
    expect(() => parseIdentityMode('trusted-resolver', 'test')).toThrow(
      /CVG_IDENTITY_MODE/
    )
    expect(() => parseIdentityMode('SIMULATION', 'test')).toThrow(
      /CVG_IDENTITY_MODE/
    )
    expect(() => IdentityModeSchema.parse('fake')).toThrow()
  })
})
