import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  SandboxGate,
  SandboxGateOutcome,
  ToolDescriptor
} from '@cvg/harness-contracts'
import {
  createLocalSandboxGate,
  detectSandboxCapabilities,
  LANDLOCK_MIN_ABI,
  type SandboxCapabilities,
  type SandboxProbe
} from '../packages/sandbox/src/index.ts'

/**
 * PAR-X02 / SPEC 0288 phase 1 (RED). Today `landlock` is inferred from the
 * kernel release and no ruleset is ever applied, so `requireLandlock` promises
 * a defense that does not exist. The `it.fails` cases are the target; the
 * controls keep passing. Synthetic data only; no native helper exists yet.
 */

const caps = (
  over: Partial<SandboxCapabilities> = {}
): SandboxCapabilities => ({
  bubblewrap: true,
  landlock: true,
  mode: 'PROCESS',
  partial: [],
  ...over
})

const descriptor = (over: Partial<ToolDescriptor> = {}): ToolDescriptor => ({
  id: 'synthetic.x02.tool',
  version: 'v1',
  description: 'Synthetic X02 tool',
  inputSchema: { type: 'object' },
  outputSchema: { type: 'object' },
  risk: 'LOW',
  sideEffect: 'NONE',
  idempotent: true,
  requiresApproval: false,
  ...over
})

const context = {
  tenantId: 'tenant-synthetic' as never,
  agentId: 'agent-synthetic' as never,
  correlationId: 'correlation-synthetic' as never,
  traceId: 'trace-synthetic' as never
}

const evaluate = (
  gate: SandboxGate,
  tool: ToolDescriptor
): Promise<SandboxGateOutcome> =>
  Promise.resolve(gate.evaluate({ descriptor: tool, context }))

const dirs: string[] = []
const workspace = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-x02-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true })
})

describe('PAR-X02 controls (pass before and after the BUILD)', () => {
  it('without requireLandlock, WORKSPACE is still granted with the allowlist as the defense', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({
        capabilities: caps({ landlock: false }),
        workspaceBase: workspace()
      }),
      descriptor({ sandbox: 'WORKSPACE' })
    )
    expect(outcome.kind).toBe('allowed')
  })

  it('requireLandlock with Landlock reported absent refuses IN_PROCESS', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({
        capabilities: caps({ landlock: false, partial: ['IN_PROCESS'] }),
        requireLandlock: true
      }),
      descriptor({ sandbox: 'IN_PROCESS' })
    )
    expect(outcome.kind).toBe('unavailable')
  })
})

describe('PAR-X02 targets (RED in phase 1, GREEN after slice 2)', () => {
  it('a kernel release alone is not Landlock: without a helper-confirmed ABI the capability is false', () => {
    const kernelOnly: SandboxProbe = {
      probeBubblewrap: () => true,
      probeLandlock: () => true
    }
    const detected = detectSandboxCapabilities(kernelOnly)
    expect(detected.landlock).toBe(false)
    expect(detected.landlockAbi).toBeUndefined()
  })

  it('a helper-confirmed ABI below the floor is reported but is not Landlock', () => {
    const detected = detectSandboxCapabilities({
      probeBubblewrap: () => true,
      probeLandlock: () => true,
      probeLandlockAbi: () => LANDLOCK_MIN_ABI - 1
    })
    expect(detected.landlockAbi).toBe(LANDLOCK_MIN_ABI - 1)
    expect(detected.landlock).toBe(false)
  })

  it('a helper-confirmed ABI at the floor is Landlock', () => {
    const detected = detectSandboxCapabilities({
      probeBubblewrap: () => true,
      probeLandlock: () => false,
      probeLandlockAbi: () => LANDLOCK_MIN_ABI
    })
    expect(detected).toMatchObject({
      landlock: true,
      landlockAbi: LANDLOCK_MIN_ABI
    })
  })

  it('a probe that throws or answers garbage is never Landlock', () => {
    for (const probeLandlockAbi of [
      () => {
        throw new Error('probe failed')
      },
      () => Number.NaN,
      () => 0,
      () => 2.5
    ]) {
      const detected = detectSandboxCapabilities({
        probeBubblewrap: () => true,
        probeLandlock: () => true,
        probeLandlockAbi: probeLandlockAbi as () => number
      })
      expect(detected.landlock).toBe(false)
    }
  })

  it('requireLandlock cannot be honoured in-process: IN_PROCESS is refused even when Landlock is reported', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({
        capabilities: caps({ landlock: true, landlockAbi: 8 }),
        requireLandlock: true
      }),
      descriptor({ sandbox: 'IN_PROCESS' })
    )
    expect(outcome.kind).toBe('unavailable')
  })

  it('requireLandlock cannot be honoured for in-process workspace tools: WORKSPACE is refused', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({
        capabilities: caps({ landlock: true, landlockAbi: 8 }),
        requireLandlock: true,
        workspaceBase: workspace()
      }),
      descriptor({ sandbox: 'WORKSPACE' })
    )
    expect(outcome.kind).toBe('unavailable')
  })

  it('PROCESS with requireLandlock is granted only with Landlock confirmed', async () => {
    const granted = await evaluate(
      createLocalSandboxGate({
        capabilities: caps({ landlock: true, landlockAbi: 8 }),
        requireLandlock: true
      }),
      descriptor({ sandbox: 'PROCESS' })
    )
    expect(granted.kind).toBe('allowed')
    const refused = await evaluate(
      createLocalSandboxGate({
        capabilities: caps({ landlock: false }),
        requireLandlock: true
      }),
      descriptor({ sandbox: 'PROCESS' })
    )
    expect(refused).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('Landlock ausente')
    })
  })

  it('the journal note never claims Landlock for an in-process tool', async () => {
    const notes: unknown[] = []
    const outcome = await evaluate(
      createLocalSandboxGate({
        capabilities: caps({ landlock: true, landlockAbi: 8 }),
        workspaceBase: workspace(),
        journal: (entry) => notes.push(entry)
      }),
      descriptor({ sandbox: 'WORKSPACE' })
    )
    expect(outcome.kind).toBe('allowed')
    expect(JSON.stringify(notes)).toContain(
      'Landlock não se aplica em processo'
    )
  })
})
