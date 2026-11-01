import type { ProcessLandlockReport, ProcessOutcome } from './types.ts'

export type ProcessReadReason =
  | 'controller_missing'
  | 'kernel_too_old'
  | 'read_failed'
  | 'report_missing'
  | 'counter_out_of_range'
  | 'not_required'
  | 'quota_unavailable'
export type ProcessAdmissionReason =
  | 'cgroup_unavailable'
  | 'controller_missing'
  | 'delegation_invalid'
  | 'kernel_feature_missing'
  | 'limits_unconfirmed'
  | 'swap_unavailable'
  | 'seccomp_profile_unavailable'
  | 'architecture_unsupported'
  | 'qualification_missing'
export type ProcessCounter =
  | { readonly value: number; readonly reason: null }
  | { readonly value: null; readonly reason: ProcessReadReason }
export interface ProcessResourceLimits {
  readonly cpuQuotaUs: number
  readonly cpuPeriodUs: number
  readonly memoryMaxBytes: number
  readonly swapMaxBytes: 0
  readonly pidsMax: number
  readonly tmpfsMaxBytes: number
  readonly workspaceQuotaBytes: number | null
}
export type ProcessResources =
  | { readonly state: 'not_required' }
  | { readonly state: 'not_applied'; readonly reason: ProcessAdmissionReason }
  | {
      readonly state: 'unknown'
      readonly reason:
        | 'guardian_report_missing'
        | 'guardian_died'
        | 'read_failed'
    }
  | {
      readonly state: 'applied'
      readonly backend: 'cgroup-v2'
      readonly groupId: string
      readonly limits: ProcessResourceLimits
      readonly events: {
        readonly oomKill: ProcessCounter
        readonly pidsMax: ProcessCounter
        readonly nrThrottled: ProcessCounter
        readonly throttledUsec: ProcessCounter
      }
      readonly peaks: {
        readonly memoryBytes: ProcessCounter
        readonly pids: ProcessCounter
      }
    }
export type ProcessSeccompReport =
  | { readonly state: 'not_required' }
  | {
      readonly state: 'unknown'
      readonly reason: 'report_missing' | 'proof_invalid'
    }
  | {
      readonly state: 'applied'
      readonly mode: 2
      readonly arch: 'x86_64'
      readonly profileId: 'elf-qual-v1' | 'elf-sentinel-deny-v1'
      readonly policyDigest: string
    }
export type ProcessContainmentV1 =
  | {
      readonly version: 1
      readonly status: 'observed'
      readonly profile: 'namespace-observed'
      readonly executor: 'owner' | 'guardian'
      readonly ownerIndependent: false
      readonly resources: ProcessResources
      readonly seccomp: ProcessSeccompReport
      readonly landlock: ProcessLandlockReport
    }
  | {
      readonly version: 1
      readonly status: 'observed'
      readonly profile: 'cgroup-guardian'
      readonly executor: 'guardian'
      readonly ownerIndependent: true
      readonly resources: Extract<ProcessResources, { state: 'applied' }>
      readonly seccomp: Extract<ProcessSeccompReport, { state: 'applied' }>
      readonly landlock: ProcessLandlockReport
    }
  | {
      readonly version: 1
      readonly status: 'unverified'
      readonly profile: 'unverified'
      readonly executor: 'owner' | 'guardian'
      readonly ownerIndependent: false
      readonly requestedProfile: 'namespace-observed' | 'cgroup-guardian'
      readonly reason:
        | 'guardian_report_missing'
        | 'guardian_died'
        | 'proof_invalid'
      readonly resources: Extract<ProcessResources, { state: 'unknown' }>
      readonly seccomp: ProcessSeccompReport
      readonly landlock: ProcessLandlockReport
    }

/** Only the existing owner path is implemented. This does not construct a B capability. */
export function ownerContainment(
  landlock: ProcessLandlockReport
): ProcessContainmentV1 {
  return Object.freeze({
    version: 1,
    status: 'observed',
    profile: 'namespace-observed',
    executor: 'owner',
    ownerIndependent: false,
    resources: Object.freeze({ state: 'not_required' }),
    seccomp: Object.freeze({ state: 'not_required' }),
    landlock: Object.freeze({ ...landlock })
  })
}

/** Legacy fields are projections of the same observation, never independently selected. */
export function containmentMirrors(containment: ProcessContainmentV1) {
  return {
    containment,
    profile: containment.profile,
    ownerIndependent: containment.ownerIndependent,
    landlock: containment.landlock
  }
}

/** Unknown counters stay unknown; callers cannot turn missing evidence into zero. */
export function processCounter(
  value: number | null,
  reason: ProcessReadReason
): ProcessCounter {
  if (value === null) return Object.freeze({ value: null, reason })
  if (!Number.isSafeInteger(value) || value < 0)
    return Object.freeze({ value: null, reason: 'counter_out_of_range' })
  return Object.freeze({ value, reason: null })
}

export function validProcessResourceLimits(
  limits: ProcessResourceLimits
): boolean {
  if (!record(limits)) return false
  return (
    [
      limits.cpuQuotaUs,
      limits.cpuPeriodUs,
      limits.memoryMaxBytes,
      limits.pidsMax,
      limits.tmpfsMaxBytes
    ].every((n) => Number.isSafeInteger(n) && n > 0) &&
    limits.swapMaxBytes === 0 &&
    (limits.workspaceQuotaBytes === null ||
      (Number.isSafeInteger(limits.workspaceQuotaBytes) &&
        limits.workspaceQuotaBytes > 0))
  )
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const READ_REASONS: readonly string[] = [
  'controller_missing',
  'kernel_too_old',
  'read_failed',
  'report_missing',
  'counter_out_of_range',
  'not_required',
  'quota_unavailable'
]
const ADMISSION_REASONS: readonly string[] = [
  'cgroup_unavailable',
  'controller_missing',
  'delegation_invalid',
  'kernel_feature_missing',
  'limits_unconfirmed',
  'swap_unavailable',
  'seccomp_profile_unavailable',
  'architecture_unsupported',
  'qualification_missing'
]

function validCounter(counter: unknown): boolean {
  if (!record(counter)) return false
  return counter.value === null
    ? typeof counter.reason === 'string' &&
        READ_REASONS.includes(counter.reason)
    : Number.isSafeInteger(counter.value) &&
        (counter.value as number) >= 0 &&
        counter.reason === null
}

function validResources(resources: unknown): boolean {
  if (!record(resources)) return false
  switch (resources.state) {
    case 'not_required':
      return true
    case 'not_applied':
      return (
        typeof resources.reason === 'string' &&
        ADMISSION_REASONS.includes(resources.reason)
      )
    case 'unknown':
      return [
        'guardian_report_missing',
        'guardian_died',
        'read_failed'
      ].includes(resources.reason as string)
    case 'applied':
      return (
        resources.backend === 'cgroup-v2' &&
        typeof resources.groupId === 'string' &&
        resources.groupId.length > 0 &&
        validProcessResourceLimits(resources.limits as ProcessResourceLimits) &&
        record(resources.events) &&
        record(resources.peaks) &&
        ['oomKill', 'pidsMax', 'nrThrottled', 'throttledUsec'].every((key) =>
          validCounter((resources.events as Record<string, unknown>)[key])
        ) &&
        ['memoryBytes', 'pids'].every((key) =>
          validCounter((resources.peaks as Record<string, unknown>)[key])
        )
      )
    default:
      return false
  }
}

function validSeccomp(seccomp: unknown): boolean {
  if (!record(seccomp)) return false
  switch (seccomp.state) {
    case 'not_required':
      return true
    case 'unknown':
      return (
        seccomp.reason === 'report_missing' ||
        seccomp.reason === 'proof_invalid'
      )
    case 'applied':
      return (
        seccomp.mode === 2 &&
        seccomp.arch === 'x86_64' &&
        (seccomp.profileId === 'elf-qual-v1' ||
          seccomp.profileId === 'elf-sentinel-deny-v1') &&
        typeof seccomp.policyDigest === 'string' &&
        /^[a-f0-9]{64}$/.test(seccomp.policyDigest)
      )
    default:
      return false
  }
}

/** IOCTL_DEV is not a granted right; an older ABI must not claim it handled. */
export function processIoctlDev(report: ProcessLandlockReport) {
  return Object.freeze({
    handled:
      report.applied && report.abi >= 5 && (report.handledFs & (1 << 15)) !== 0,
    granted: false as const
  })
}

/** Both coherent containment and proven cleanup are required to accept success. */
export function verifiedProcessOutcome(outcome: ProcessOutcome): boolean {
  return (
    consistentProcessContainment(outcome) &&
    outcome.cleanup?.state === 'clean' &&
    outcome.cleanup.leftover === 0 &&
    outcome.cleanup.unverified === 0
  )
}

/** Internal consistency only, not native proof or evidence of cleanup. */
export function consistentProcessContainment(outcome: ProcessOutcome): boolean {
  const c = outcome.containment
  if (
    !c ||
    c.version !== 1 ||
    c.status !== 'observed' ||
    outcome.profile !== c.profile ||
    outcome.ownerIndependent !== c.ownerIndependent ||
    !validResources(c.resources) ||
    !validSeccomp(c.seccomp)
  )
    return false
  const a = outcome.landlock,
    b = c.landlock
  if (!record(a) || !record(b)) return false
  if (a.applied !== b.applied) return false
  if (a.applied && b.applied) {
    if (
      a.abi !== b.abi ||
      a.handledFs !== b.handledFs ||
      a.handledNet !== b.handledNet ||
      a.scoped !== b.scoped
    )
      return false
  } else if (!a.applied && !b.applied && a.error !== b.error) return false
  if (c.profile === 'namespace-observed')
    return (
      c.ownerIndependent === false &&
      (c.executor === 'owner' || c.executor === 'guardian')
    )
  return (
    c.profile === 'cgroup-guardian' &&
    c.ownerIndependent === true &&
    c.executor === 'guardian' &&
    c.landlock.applied &&
    c.resources.state === 'applied' &&
    c.seccomp.state === 'applied'
  )
}
