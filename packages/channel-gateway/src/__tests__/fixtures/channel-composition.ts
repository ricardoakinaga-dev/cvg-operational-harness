import { createRealCapabilityGuards } from '@cvg/shared'

/**
 * SPEC 0317 G4: the suite composes adapters the way a host must: a guard
 * issued from flag + T4 reference, and an explicit dispatch decision. Every
 * "real" adapter here still talks to an injected fake transport.
 */
export const realChannelGuard = createRealCapabilityGuards({
  env: { ENABLE_REAL_CHANNELS: 'true' },
  authorizations: {
    channels: {
      decisionId: 'T4-SYNTHETIC-TEST',
      packageSha256: '0'.repeat(64)
    }
  }
}).channels

export const realComposition = {
  kind: 'real',
  guard: realChannelGuard,
  authorizeDispatch: () => true
} as const

export const syntheticComposition = { kind: 'synthetic' } as const
