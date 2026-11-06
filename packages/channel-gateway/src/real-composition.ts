import {
  assertRealCapabilityOpen,
  RealCapabilityBlockedError,
  type RealCapabilityGuard
} from '@cvg/shared'
import type {
  CanonicalOutboundMessage,
  InboundChannelAdapter,
  OutboundChannelAdapter
} from './contracts.ts'
import { ChannelError } from './errors.ts'

/**
 * SPEC 0317 G4. `synthetic` is a statement by the composition root, the only
 * party allowed to classify adapters. `real` also needs the per-dispatch
 * decision (policy, grant, approval): an open guard alone never sends.
 */
export type ChannelGatewayComposition =
  | { kind: 'synthetic' }
  | {
      kind: 'real'
      guard: RealCapabilityGuard
      authorizeDispatch: (
        message: CanonicalOutboundMessage
      ) => boolean | Promise<boolean>
    }

const realAdapters = new WeakSet<object>()

export function markRealChannelAdapter(adapter: object): void {
  realAdapters.add(adapter)
}

export function assertChannelGuardOpen(guard: unknown): void {
  try {
    assertRealCapabilityOpen(guard, 'channels')
  } catch (error) {
    if (error instanceof RealCapabilityBlockedError) {
      throw new ChannelError('real_capability_blocked', error.reason)
    }
    throw error
  }
}

export function validateChannelComposition(
  composition: ChannelGatewayComposition | undefined,
  adapters: ReadonlyArray<InboundChannelAdapter | OutboundChannelAdapter>
): ChannelGatewayComposition | undefined {
  if (composition === undefined) {
    if (adapters.length > 0) {
      throw new ChannelError('real_capability_blocked', 'guard_missing')
    }
    return undefined
  }
  if (composition.kind === 'real') {
    assertChannelGuardOpen(composition.guard)
    if (typeof composition.authorizeDispatch !== 'function') {
      throw new ChannelError(
        'real_capability_blocked',
        'dispatch_authorization_missing'
      )
    }
    return composition
  }
  if (composition.kind !== 'synthetic') {
    throw new ChannelError('real_capability_blocked', 'guard_missing')
  }
  if (process.env.NODE_ENV === 'production') {
    throw new ChannelError(
      'real_capability_blocked',
      'synthetic_composition_forbidden_in_production'
    )
  }
  if (adapters.some((adapter) => realAdapters.has(adapter))) {
    throw new ChannelError(
      'real_capability_blocked',
      'real_adapter_in_synthetic_composition'
    )
  }
  return composition
}
