import type { ForbiddenCapability } from '@cvg/harness-contracts'

export { classifyForbiddenCapability } from '@cvg/harness-contracts'
export type { ForbiddenCapability } from '@cvg/harness-contracts'

/**
 * SPEC 0317 G4. Explicit guards per capability, read once from the process
 * configuration by the composition. A flag is a necessary condition, never an
 * authorization: nothing in a message, header or plugin can open a guard, and
 * mutating the environment of a live process changes nothing already issued.
 */
export type GuardedRealCapability = 'channels' | 'rag'

export const REAL_CAPABILITY_FLAGS = {
  channels: 'ENABLE_REAL_CHANNELS',
  rag: 'ENABLE_REAL_RAG'
} as const satisfies Record<GuardedRealCapability, string>

export const FORBIDDEN_CAPABILITY_FLAGS = {
  payments: 'ENABLE_REAL_PAYMENTS',
  medical_records: 'ENABLE_REAL_MEDICAL_RECORDS'
} as const satisfies Record<ForbiddenCapability, string>

export type RealCapabilityBlockReason =
  | 'flag_disabled'
  | 'authorization_missing'
  | 'guard_missing'
  | 'guard_capability_mismatch'

/** Reference to the recorded human T4 decision; supplied only by composition. */
export interface RealCapabilityAuthorization {
  decisionId: string
  packageSha256: string
}

export interface RealCapabilityGuard {
  readonly capability: GuardedRealCapability
  readonly open: boolean
  readonly reason: RealCapabilityBlockReason | null
  readonly decisionId: string | null
}

export type RealCapabilityGuards = Readonly<
  Record<GuardedRealCapability, RealCapabilityGuard>
>

/** Safe by construction: carries codes only, never configuration values. */
export class RealCapabilityBlockedError extends Error {
  readonly code = 'real_capability_blocked'
  readonly capability: GuardedRealCapability
  readonly reason: RealCapabilityBlockReason

  constructor(
    capability: GuardedRealCapability,
    reason: RealCapabilityBlockReason
  ) {
    super(`Real ${capability} capability is blocked: ${reason}`)
    this.name = 'RealCapabilityBlockedError'
    this.capability = capability
    this.reason = reason
  }
}

const issuedGuards = new WeakSet<object>()

function readFlag(env: Record<string, unknown>, name: string): boolean {
  const value = env[name]
  if (value === undefined || value === false || value === 'false') return false
  if (value === true || value === 'true') return true
  throw new Error(`${name} must be true or false`)
}

/** Boot-time refusal shared by every host; an invalid value also refuses. */
export function assertForbiddenCapabilitiesDisabled(
  env: Record<string, unknown>
): void {
  for (const name of Object.values(FORBIDDEN_CAPABILITY_FLAGS)) {
    if (readFlag(env, name)) {
      throw new Error(`${name} must stay false: forbidden by the program`)
    }
  }
}

function validAuthorization(
  authorization: RealCapabilityAuthorization | undefined
): authorization is RealCapabilityAuthorization {
  return (
    typeof authorization?.decisionId === 'string' &&
    authorization.decisionId.trim().length > 0 &&
    typeof authorization.packageSha256 === 'string' &&
    /^[0-9a-f]{64}$/.test(authorization.packageSha256)
  )
}

function issueGuard(
  env: Record<string, unknown>,
  capability: GuardedRealCapability,
  authorization: RealCapabilityAuthorization | undefined
): RealCapabilityGuard {
  const enabled = readFlag(env, REAL_CAPABILITY_FLAGS[capability])
  const authorized = validAuthorization(authorization)
  const guard: RealCapabilityGuard = Object.freeze({
    capability,
    open: enabled && authorized,
    reason: !enabled
      ? 'flag_disabled'
      : authorized
        ? null
        : 'authorization_missing',
    decisionId: enabled && authorized ? authorization.decisionId.trim() : null
  })
  issuedGuards.add(guard)
  return guard
}

/**
 * The only issuer of guards. `authorizations` comes from trusted composition
 * code, never from the environment or a request.
 */
export function createRealCapabilityGuards(input: {
  env: Record<string, unknown>
  authorizations?: Partial<
    Record<GuardedRealCapability, RealCapabilityAuthorization>
  >
}): RealCapabilityGuards {
  assertForbiddenCapabilitiesDisabled(input.env)
  return Object.freeze({
    channels: issueGuard(input.env, 'channels', input.authorizations?.channels),
    rag: issueGuard(input.env, 'rag', input.authorizations?.rag)
  })
}

/** Final boundary of a real adapter: call before any I/O. */
export function assertRealCapabilityOpen(
  guard: unknown,
  capability: GuardedRealCapability
): asserts guard is RealCapabilityGuard {
  if (typeof guard !== 'object' || guard === null || !issuedGuards.has(guard)) {
    throw new RealCapabilityBlockedError(capability, 'guard_missing')
  }
  const issued = guard as RealCapabilityGuard
  if (issued.capability !== capability) {
    throw new RealCapabilityBlockedError(
      capability,
      'guard_capability_mismatch'
    )
  }
  if (!issued.open) {
    throw new RealCapabilityBlockedError(
      capability,
      issued.reason ?? 'guard_missing'
    )
  }
}

/** Observability view: state and safe reason, never a GO signal. */
export function describeRealCapabilityGuards(guards: RealCapabilityGuards) {
  return (Object.keys(REAL_CAPABILITY_FLAGS) as GuardedRealCapability[]).map(
    (capability) => ({
      capability,
      state: guards[capability].open ? 'composable' : 'blocked',
      reason: guards[capability].reason
    })
  )
}
