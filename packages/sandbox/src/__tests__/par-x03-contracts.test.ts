import { describe, expect, it, vi } from 'vitest'
import {
  ownerContainment,
  containmentMirrors,
  processCounter,
  processIoctlDev,
  validProcessResourceLimits,
  verifiedProcessOutcome
} from '../process-service/containment.ts'
import type {
  ProcessContainmentV1,
  ProcessResourceLimits
} from '../process-service/containment.ts'
import type {
  ProcessOutcome,
  ProcessLaunchRequest
} from '../process-service/types.ts'
import { ProcessAdmissionError } from '../process-service/errors.ts'
import { createProcessService } from '../process-service/service.ts'

const limits: ProcessResourceLimits = {
  cpuQuotaUs: 50000,
  cpuPeriodUs: 100000,
  memoryMaxBytes: 67108864,
  swapMaxBytes: 0,
  pidsMax: 16,
  tmpfsMaxBytes: 16777216,
  workspaceQuotaBytes: null
}
const outcome = (
  containment = ownerContainment({ applied: false })
): ProcessOutcome => ({
  cause: 'exit',
  exitCode: 0,
  signal: null,
  truncated: false,
  cleanup: {
    state: 'clean',
    observed: 'proc-pidns',
    leftover: 0,
    unverified: 0
  },
  ...containmentMirrors(containment),
  secondaryErrors: []
})
const applied = {
  applied: true,
  abi: 8,
  handledFs: 0xffff,
  handledNet: 3,
  scoped: 3
} as const
const guardian = (): ProcessContainmentV1 => ({
  version: 1,
  status: 'observed',
  profile: 'cgroup-guardian',
  executor: 'guardian',
  ownerIndependent: true,
  landlock: applied,
  resources: {
    state: 'applied',
    backend: 'cgroup-v2',
    groupId: 'synthetic-only',
    limits,
    events: {
      oomKill: processCounter(0, 'report_missing'),
      pidsMax: processCounter(0, 'report_missing'),
      nrThrottled: processCounter(1, 'report_missing'),
      throttledUsec: processCounter(10, 'report_missing')
    },
    peaks: {
      memoryBytes: processCounter(null, 'kernel_too_old'),
      pids: processCounter(null, 'kernel_too_old')
    }
  },
  seccomp: {
    state: 'applied',
    mode: 2,
    arch: 'x86_64',
    profileId: 'elf-qual-v1',
    policyDigest: 'a'.repeat(64)
  }
})

describe('0294 S1 report contract, synthetic shapes are not native proof', () => {
  it('A keeps exact mirrors and explicitly lacks resources, seccomp and independence', () => {
    const o = outcome(ownerContainment(applied))
    expect(o.containment).toEqual({
      version: 1,
      status: 'observed',
      profile: 'namespace-observed',
      executor: 'owner',
      ownerIndependent: false,
      resources: { state: 'not_required' },
      seccomp: { state: 'not_required' },
      landlock: applied
    })
    expect(o.landlock).toBe(o.containment.landlock)
    expect(Object.isFrozen(o.containment)).toBe(true)
    expect(Object.isFrozen(o.landlock)).toBe(true)
    expect(verifiedProcessOutcome(o)).toBe(true)
    expect(verifiedProcessOutcome({ ...o, landlock: { ...applied } })).toBe(
      true
    )
  })
  it.each(['abi', 'handledFs', 'handledNet', 'scoped'] as const)(
    'refuses a divergent %s mirror',
    (key) => {
      const o = outcome(ownerContainment(applied))
      expect(
        verifiedProcessOutcome({
          ...o,
          landlock: { ...applied, [key]: applied[key] + 1 }
        })
      ).toBe(false)
    }
  )
  it('refuses unknown versions, missing/unverified observations, dirty cleanup and changed profile mirrors', () => {
    const o = outcome()
    for (const patch of [
      { containment: undefined },
      { containment: { ...o.containment, version: 2 } },
      {
        containment: {
          ...o.containment,
          status: 'unverified',
          profile: 'unverified'
        }
      },
      { profile: 'unverified' },
      { ownerIndependent: true },
      { cleanup: { ...o.cleanup, state: 'cleanup_failed' } },
      { cleanup: { ...o.cleanup, leftover: 1 } },
      { cleanup: { ...o.cleanup, unverified: 1 } },
      { landlock: applied },
      { landlock: { applied: false, error: 'missing' } }
    ])
      expect(verifiedProcessOutcome({ ...o, ...patch } as never)).toBe(false)
    expect(verifiedProcessOutcome({ ...o, landlock: { applied: false } })).toBe(
      true
    )
    expect(
      verifiedProcessOutcome(
        outcome({ ...o.containment, executor: 'guardian' } as never)
      )
    ).toBe(true)
    expect(
      verifiedProcessOutcome(
        outcome({ ...o.containment, executor: 'unknown' } as never)
      )
    ).toBe(false)
  })
  it('distinguishes a coherent future B shape from incomplete B reports without qualifying a launch', () => {
    const c = guardian()
    expect(verifiedProcessOutcome(outcome(c))).toBe(true)
    for (const patch of [
      { ownerIndependent: false },
      { executor: 'owner' },
      { profile: 'unknown' },
      { landlock: { applied: false } },
      { resources: { state: 'unknown' } },
      { resources: { ...c.resources, backend: 'other' } },
      { resources: { ...c.resources, limits: { ...limits, swapMaxBytes: 1 } } },
      { seccomp: { state: 'unknown' } },
      { seccomp: { ...c.seccomp, mode: 1 } },
      { seccomp: { ...c.seccomp, arch: 'i386' } },
      { seccomp: { ...c.seccomp, policyDigest: 'not-a-digest' } }
    ])
      expect(verifiedProcessOutcome(outcome({ ...c, ...patch } as never))).toBe(
        false
      )
  })
  it('CODE-R1-F01: checks applied limits and every counter before accepting either profile', () => {
    const b = guardian()
    if (b.resources.state !== 'applied') throw new Error('test shape')
    const resources = b.resources
    for (const profile of ['namespace-observed', 'cgroup-guardian'] as const) {
      const c = {
        ...b,
        profile,
        ownerIndependent: profile === 'cgroup-guardian'
      }
      expect(verifiedProcessOutcome(outcome(c as never))).toBe(true)
      for (const limit of [
        'cpuQuotaUs',
        'cpuPeriodUs',
        'memoryMaxBytes',
        'pidsMax',
        'tmpfsMaxBytes',
        'workspaceQuotaBytes'
      ])
        for (const value of [-1, 0, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
          expect(
            verifiedProcessOutcome(
              outcome({
                ...c,
                resources: {
                  ...resources,
                  limits: { ...limits, [limit]: value }
                }
              } as never)
            )
          ).toBe(false)
      for (const [section, keys] of [
        ['events', ['oomKill', 'pidsMax', 'nrThrottled', 'throttledUsec']],
        ['peaks', ['memoryBytes', 'pids']]
      ] as const)
        for (const key of keys)
          for (const counter of [
            { value: -1, reason: null },
            { value: 0.5, reason: null },
            { value: Infinity, reason: null },
            { value: Number.MAX_SAFE_INTEGER + 1, reason: null },
            { value: null, reason: null },
            { value: null, reason: 'invented' },
            { value: 0, reason: 'read_failed' },
            null
          ]) {
            const block = resources[section]
            expect(
              verifiedProcessOutcome(
                outcome({
                  ...c,
                  resources: {
                    ...resources,
                    [section]: { ...block, [key]: counter }
                  }
                } as never)
              )
            ).toBe(false)
          }
    }
  })
  it('CODE-R1-F01: rejects unknown seccomp profiles in both outcome lanes', () => {
    const b = guardian()
    for (const profile of ['namespace-observed', 'cgroup-guardian'] as const)
      expect(
        verifiedProcessOutcome(
          outcome({
            ...b,
            profile,
            ownerIndependent: profile === 'cgroup-guardian',
            seccomp: { ...b.seccomp, profileId: 'not-approved' }
          } as never)
        )
      ).toBe(false)
  })
  it('validates degraded A reports as closed shapes and keeps reasoned unknowns', () => {
    const b = guardian()
    const a = { ...b, profile: 'namespace-observed', ownerIndependent: false }
    const valid = [
      { state: 'not_required' },
      { state: 'not_applied', reason: 'qualification_missing' },
      { state: 'unknown', reason: 'guardian_report_missing' },
      { state: 'unknown', reason: 'guardian_died' },
      { state: 'unknown', reason: 'read_failed' }
    ]
    for (const resources of valid)
      expect(
        verifiedProcessOutcome(outcome({ ...a, resources } as never))
      ).toBe(true)
    for (const seccomp of [
      { state: 'not_required' },
      { state: 'unknown', reason: 'report_missing' },
      { state: 'unknown', reason: 'proof_invalid' },
      { ...b.seccomp, profileId: 'elf-sentinel-deny-v1' }
    ])
      expect(verifiedProcessOutcome(outcome({ ...a, seccomp } as never))).toBe(
        true
      )
    for (const resources of [
      undefined,
      null,
      [],
      { state: 'other' },
      { state: 'not_applied' },
      { state: 'not_applied', reason: 'invented' },
      { state: 'unknown', reason: 'invented' },
      { ...b.resources, groupId: '' },
      { ...b.resources, groupId: 3 },
      { ...b.resources, limits: null },
      { ...b.resources, events: null },
      { ...b.resources, peaks: null }
    ])
      expect(
        verifiedProcessOutcome(outcome({ ...a, resources } as never))
      ).toBe(false)
    for (const seccomp of [
      undefined,
      null,
      [],
      { state: 'other' },
      { state: 'unknown', reason: 'invented' },
      { ...b.seccomp, policyDigest: 3 },
      { ...b.seccomp, mode: 1 },
      { ...b.seccomp, arch: 'i386' },
      { ...b.seccomp, policyDigest: 'bad' }
    ])
      expect(verifiedProcessOutcome(outcome({ ...a, seccomp } as never))).toBe(
        false
      )
    for (const patch of [
      { cleanup: undefined },
      { landlock: null },
      { containment: { ...a, landlock: null } }
    ])
      expect(
        verifiedProcessOutcome({ ...outcome(a as never), ...patch } as never)
      ).toBe(false)
  })
  it('preserves every closed counter reason and nonnegative safe integer boundaries', () => {
    const b = guardian()
    if (b.resources.state !== 'applied') throw new Error('test shape')
    for (const reason of [
      'controller_missing',
      'kernel_too_old',
      'read_failed',
      'report_missing',
      'counter_out_of_range',
      'not_required',
      'quota_unavailable'
    ]) {
      const resources = {
        ...b.resources,
        peaks: { ...b.resources.peaks, pids: { value: null, reason } }
      }
      expect(
        verifiedProcessOutcome(outcome({ ...b, resources } as never))
      ).toBe(true)
    }
    for (const counter of [
      { value: 0, reason: null },
      { value: Number.MAX_SAFE_INTEGER, reason: null }
    ])
      expect(
        verifiedProcessOutcome(
          outcome({
            ...b,
            resources: {
              ...b.resources,
              peaks: { ...b.resources.peaks, pids: counter }
            }
          } as never)
        )
      ).toBe(true)
    for (const counter of [
      { value: NaN, reason: null },
      { value: null, reason: 3 },
      {},
      []
    ])
      expect(
        verifiedProcessOutcome(
          outcome({
            ...b,
            resources: {
              ...b.resources,
              peaks: { ...b.resources.peaks, pids: counter }
            }
          } as never)
        )
      ).toBe(false)
  })
  it('preserves null counters and rejects invalid numeric readings', () => {
    expect(processCounter(null, 'report_missing')).toEqual({
      value: null,
      reason: 'report_missing'
    })
    for (const n of [-1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
      expect(processCounter(n, 'read_failed')).toEqual({
        value: null,
        reason: 'counter_out_of_range'
      })
    expect(processCounter(0, 'read_failed')).toEqual({ value: 0, reason: null })
  })
  it('requires known finite positive limits, swap0 and a nullable positive workspace quota', () => {
    expect(validProcessResourceLimits(limits)).toBe(true)
    expect(
      validProcessResourceLimits({ ...limits, workspaceQuotaBytes: 1 })
    ).toBe(true)
    for (const key of [
      'cpuQuotaUs',
      'cpuPeriodUs',
      'memoryMaxBytes',
      'pidsMax',
      'tmpfsMaxBytes',
      'workspaceQuotaBytes'
    ] as const)
      for (const n of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1])
        expect(validProcessResourceLimits({ ...limits, [key]: n })).toBe(false)
    expect(
      validProcessResourceLimits({ ...limits, swapMaxBytes: 1 } as never)
    ).toBe(false)
  })
  it('never grants IOCTL_DEV and never claims handling on ABI3/4 or without its bit', () => {
    expect(processIoctlDev({ applied: false })).toEqual({
      handled: false,
      granted: false
    })
    expect(processIoctlDev({ ...applied, abi: 4 })).toEqual({
      handled: false,
      granted: false
    })
    expect(processIoctlDev({ ...applied, handledFs: 1 })).toEqual({
      handled: false,
      granted: false
    })
    expect(processIoctlDev(applied)).toEqual({ handled: true, granted: false })
  })
})

describe('0294 S1 service admission, no profile probe or payload', () => {
  const request = (signal?: AbortSignal): ProcessLaunchRequest => ({
    consumer: 'shell',
    profile: {} as never,
    handle: { mode: 'PROCESS', allowNetwork: false, allowSubprocess: true },
    argv: ['/synthetic-never-executed'],
    mode: 'oneshot',
    limits: {
      startupMs: 1000,
      lifetimeMs: 1000,
      cleanupMs: 1000,
      graceMs: 0,
      maxOutputBytes: 100,
      maxStdinBytes: 0
    },
    ...(signal ? { signal } : {})
  })
  it('refuses B before preparation/spawn and never consumes the only slot', async () => {
    const spawn = vi.fn()
    const service = createProcessService({
      spawn: spawn as never,
      maxConcurrent: 1
    })
    await expect(
      service.launch({ ...request(), requiredContainment: 'cgroup-guardian' })
    ).rejects.toMatchObject({
      code: 'admission_refused',
      reason: 'qualification_missing'
    })
    try {
      await service.launch({
        ...request(),
        requiredContainment: 'cgroup-guardian'
      })
    } catch (e) {
      expect(e).toBeInstanceOf(ProcessAdmissionError)
      expect((e as Error).message).not.toContain('/synthetic')
    }
    const abort = new AbortController()
    abort.abort()
    const a = await service.launch({
      ...request(abort.signal),
      requiredContainment: 'namespace-observed'
    })
    const o = await a.wait()
    expect(o.cause).toBe('cancelled')
    expect(o.containment.ownerIndependent).toBe(false)
    expect(verifiedProcessOutcome(o)).toBe(true)
    const again = await service.launch(request(abort.signal))
    expect((await again.wait()).cleanup.state).toBe('clean')
    expect(spawn).not.toHaveBeenCalled()
    await service.dispose()
  })
  it('rejects unknown requirements as invalid_request instead of silently falling back', async () => {
    const spawn = vi.fn()
    const service = createProcessService({ spawn: spawn as never })
    await expect(
      service.launch({ ...request(), requiredContainment: 'unknown' as never })
    ).rejects.toMatchObject({ code: 'invalid_request' })
    expect(spawn).not.toHaveBeenCalled()
    await service.dispose()
  })
})
