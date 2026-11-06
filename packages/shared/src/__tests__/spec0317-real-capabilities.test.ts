import { describe, expect, it } from 'vitest'
import { parseEnv } from '../env.ts'
import {
  assertForbiddenCapabilitiesDisabled,
  assertRealCapabilityOpen,
  classifyForbiddenCapability,
  createRealCapabilityGuards,
  describeRealCapabilityGuards,
  RealCapabilityBlockedError
} from '../real-capabilities.ts'

const authorization = {
  decisionId: 'T4-SYNTHETIC-0317',
  packageSha256: 'a'.repeat(64)
}

function reasonOf(run: () => void): string {
  try {
    run()
  } catch (error) {
    if (error instanceof RealCapabilityBlockedError) return error.reason
    throw error
  }
  return 'open'
}

describe('SPEC 0317 G4 real capability guards', () => {
  it.each([
    ['false', undefined, 'flag_disabled'],
    ['false', authorization, 'flag_disabled'],
    ['true', undefined, 'authorization_missing'],
    [
      'true',
      { decisionId: ' ', packageSha256: 'a'.repeat(64) },
      'authorization_missing'
    ],
    [
      'true',
      { decisionId: 'T4', packageSha256: 'not-a-hash' },
      'authorization_missing'
    ],
    ['true', authorization, 'open']
  ] as const)(
    'flag=%s with authorization %j resolves to %s for every capability',
    (flag, granted, expected) => {
      const guards = createRealCapabilityGuards({
        env: { ENABLE_REAL_CHANNELS: flag, ENABLE_REAL_RAG: flag },
        ...(granted
          ? { authorizations: { channels: granted, rag: granted } }
          : {})
      })
      expect(
        reasonOf(() => assertRealCapabilityOpen(guards.channels, 'channels'))
      ).toBe(expected)
      expect(reasonOf(() => assertRealCapabilityOpen(guards.rag, 'rag'))).toBe(
        expected
      )
    }
  )

  it('refuses absent, forged and cross-capability guards', () => {
    const open = createRealCapabilityGuards({
      env: { ENABLE_REAL_RAG: 'true' },
      authorizations: { rag: authorization }
    }).rag
    for (const forged of [
      undefined,
      null,
      true,
      'open',
      { capability: 'rag', open: true, reason: null, decisionId: 'T4' },
      { ...open },
      Object.create(open)
    ]) {
      expect(reasonOf(() => assertRealCapabilityOpen(forged, 'rag'))).toBe(
        'guard_missing'
      )
    }
    expect(reasonOf(() => assertRealCapabilityOpen(open, 'channels'))).toBe(
      'guard_capability_mismatch'
    )
  })

  it('does not change an issued guard when a live process env changes', () => {
    const env: Record<string, unknown> = { ENABLE_REAL_CHANNELS: 'false' }
    const guards = createRealCapabilityGuards({ env })
    env.ENABLE_REAL_CHANNELS = 'true'
    expect(guards.channels.open).toBe(false)
    expect(Object.isFrozen(guards.channels)).toBe(true)
    expect(() => {
      ;(guards.channels as { open: boolean }).open = true
    }).toThrow()
  })

  it('never opens from the environment alone, whatever it declares', () => {
    const guards = createRealCapabilityGuards({
      env: {
        ENABLE_REAL_CHANNELS: 'true',
        ENABLE_REAL_RAG: 'true',
        T4_DECISION_ID: 'T4-SYNTHETIC',
        decisionId: 'T4-SYNTHETIC'
      }
    })
    expect(guards.channels.open).toBe(false)
    expect(guards.rag.open).toBe(false)
  })

  it('refuses an invalid flag value instead of reading it as false', () => {
    for (const value of ['TRUE', '1', 'yes', '', 1]) {
      expect(() =>
        createRealCapabilityGuards({ env: { ENABLE_REAL_CHANNELS: value } })
      ).toThrow('ENABLE_REAL_CHANNELS must be true or false')
    }
  })

  it.each(['ENABLE_REAL_PAYMENTS', 'ENABLE_REAL_MEDICAL_RECORDS'])(
    '%s=true is a configuration error on every path',
    (flag) => {
      expect(() =>
        assertForbiddenCapabilitiesDisabled({ [flag]: 'true' })
      ).toThrow(`${flag} must stay false`)
      expect(() =>
        assertForbiddenCapabilitiesDisabled({ [flag]: true })
      ).toThrow()
      expect(() =>
        assertForbiddenCapabilitiesDisabled({ [flag]: 'on' })
      ).toThrow()
      expect(() =>
        createRealCapabilityGuards({ env: { [flag]: 'true' } })
      ).toThrow()
      expect(() =>
        parseEnv({ NODE_ENV: 'test', [flag]: 'true' } as NodeJS.ProcessEnv)
      ).toThrow(`${flag} must stay false`)
      expect(() =>
        assertForbiddenCapabilitiesDisabled({ [flag]: 'false' })
      ).not.toThrow()
    }
  )

  it('describes state and safe reason without implying a GO', () => {
    const guards = createRealCapabilityGuards({
      env: { ENABLE_REAL_RAG: 'true' }
    })
    expect(describeRealCapabilityGuards(guards)).toEqual([
      { capability: 'channels', state: 'blocked', reason: 'flag_disabled' },
      { capability: 'rag', state: 'blocked', reason: 'authorization_missing' }
    ])
  })

  it('classifies forbidden categories over declared labels', () => {
    for (const label of [
      'payment.charge',
      'payments:write',
      'pagamento',
      'cobrança',
      'emit_boleto',
      'pix.send',
      'billing:read',
      'invoice.create'
    ]) {
      expect(classifyForbiddenCapability([label])).toBe('payments')
    }
    for (const label of [
      'medical_record.read',
      'medicalRecords',
      'medical-records:write',
      'prontuário',
      'prontuario.update',
      'ehr.read'
    ]) {
      expect(classifyForbiddenCapability([label])).toBe('medical_records')
    }
    for (const label of [
      'scheduling:read',
      'metadata.read',
      'exam.upload',
      'find_available_slots',
      'herdeiro',
      'apixaban',
      'discharge'
    ]) {
      expect(classifyForbiddenCapability([label])).toBeNull()
    }
    expect(classifyForbiddenCapability(['safe', 'pix'])).toBe('payments')
  })
})
