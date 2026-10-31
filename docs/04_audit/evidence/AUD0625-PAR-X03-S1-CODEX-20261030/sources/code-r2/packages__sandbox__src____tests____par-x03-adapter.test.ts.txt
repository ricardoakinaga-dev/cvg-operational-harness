import { beforeEach, expect, it, vi } from 'vitest'
import {
  ownerContainment,
  containmentMirrors
} from '../process-service/containment.ts'
import { ProcessAdmissionError } from '../process-service/errors.ts'
import type { ProcessOutcome } from '../process-service/types.ts'
const seam = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('../process-service/service.ts', () => ({
  createProcessService: () => ({ launch: seam.launch })
}))
import { runContained } from '../run.ts'
const request = {
  argv: ['/synthetic-not-executed'],
  handle: {
    mode: 'PROCESS' as const,
    allowNetwork: false,
    allowSubprocess: true
  }
}
const out = (): ProcessOutcome => ({
  cause: 'exit',
  exitCode: 0,
  signal: null,
  stdout: 'synthetic',
  stderr: '',
  truncated: false,
  cleanup: {
    state: 'clean',
    observed: 'proc-pidns',
    leftover: 0,
    unverified: 0
  },
  ...containmentMirrors(ownerContainment({ applied: false })),
  secondaryErrors: []
})
beforeEach(() => {
  seam.launch.mockReset()
})
it('projects a coherent A result through the actual adapter with a fake service', async () => {
  const o = out()
  seam.launch.mockResolvedValue({ wait: async () => o })
  expect(await runContained(request)).toMatchObject({
    exitCode: 0,
    cause: 'exit',
    stdout: 'synthetic',
    containment: o.containment
  })
})
it('a cached A service cannot satisfy an explicit B requirement', async () => {
  seam.launch.mockResolvedValue({ wait: async () => out() })
  expect((await runContained(request)).exitCode).toBe(0)
  const result = await runContained({
    ...request,
    requiredContainment: 'cgroup-guardian'
  })
  expect(seam.launch.mock.calls.at(-1)?.[0].requiredContainment).toBe(
    'cgroup-guardian'
  )
  expect(result).toMatchObject({
    exitCode: 'spawn_failed',
    cause: 'exit',
    stderr: 'process_containment_unverified'
  })
})
it('does not return success on unknown version, unverified containment or failed cleanup; keeps cause', async () => {
  const o = out()
  for (const patch of [
    { containment: { ...o.containment, version: 9 } },
    { containment: { ...o.containment, status: 'unverified' } },
    { cleanup: { ...o.cleanup, state: 'cleanup_failed' } }
  ]) {
    seam.launch.mockResolvedValue({ wait: async () => ({ ...o, ...patch }) })
    expect(await runContained(request)).toMatchObject({
      exitCode: 'spawn_failed',
      cause: 'exit',
      stderr: 'process_containment_unverified'
    })
  }
})
it('returns a closed reason on an admission refusal without host paths', async () => {
  seam.launch.mockRejectedValue(
    new ProcessAdmissionError('qualification_missing')
  )
  expect(
    await runContained({ ...request, requiredContainment: 'cgroup-guardian' })
  ).toEqual({
    exitCode: 'spawn_failed',
    stdout: '',
    stderr: 'process profile admission refused',
    truncated: false,
    admissionReason: 'qualification_missing'
  })
})

it('CODE-R1-F01: refuses success when an A outcome reports invalid applied limits', async () => {
  const o = out()
  const containment = {
    ...o.containment,
    resources: {
      state: 'applied',
      backend: 'cgroup-v2',
      groupId: 'synthetic',
      limits: {
        cpuQuotaUs: 50000,
        cpuPeriodUs: 100000,
        memoryMaxBytes: 67108864,
        swapMaxBytes: 0,
        pidsMax: -1,
        tmpfsMaxBytes: 1024,
        workspaceQuotaBytes: null
      },
      events: Object.fromEntries(
        ['oomKill', 'pidsMax', 'nrThrottled', 'throttledUsec'].map((k) => [
          k,
          { value: 0, reason: null }
        ])
      ),
      peaks: {
        memoryBytes: { value: 0, reason: null },
        pids: { value: 0, reason: null }
      }
    }
  }
  seam.launch.mockResolvedValue({
    wait: async () => ({ ...o, ...containmentMirrors(containment as never) })
  })
  expect(await runContained(request)).toMatchObject({
    exitCode: 'spawn_failed',
    cause: 'exit',
    stderr: 'process_containment_unverified'
  })
})
