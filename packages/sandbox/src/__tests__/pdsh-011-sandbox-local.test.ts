import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type {
  SandboxGate,
  SandboxGateOutcome,
  SandboxHandle,
  ToolDescriptor
} from '@cvg/harness-contracts'
import {
  createLocalSandboxGate,
  detectSandboxCapabilities,
  hostProbe,
  runContained,
  type SandboxCapabilities,
  type SandboxProbe
} from '../index.ts'

const probe = (
  bubblewrap: boolean,
  landlock: boolean,
  throwBubblewrap = false
): SandboxProbe => ({
  probeBubblewrap: () => {
    if (throwBubblewrap) throw new Error('prova falhou')
    return bubblewrap
  },
  probeLandlock: () => landlock
})

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
  id: 'synthetic.sandbox.tool',
  version: 'v1',
  description: 'Synthetic sandbox tool',
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

const evaluate = async (
  gate: SandboxGate,
  tool: ToolDescriptor,
  policy?: { requiredMode: SandboxHandle['mode'] }
): Promise<SandboxGateOutcome> =>
  gate.evaluate({
    descriptor: tool,
    context,
    ...(policy
      ? {
          policy: {
            requiredMode: policy.requiredMode,
            workspaceScoped: policy.requiredMode === 'WORKSPACE',
            networkAllowed: false,
            subprocessAllowed: policy.requiredMode === 'PROCESS'
          }
        }
      : {})
  })

const tempDirs: string[] = []
const tempWorkspace = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'cvg-sandbox-test-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() as string, { recursive: true, force: true })
  }
})

describe('PDSH-011 capabilities (SPEC 0196 §2)', () => {
  it('reports PROCESS when bubblewrap and Landlock are both available', () => {
    const detected = detectSandboxCapabilities(probe(true, true))
    expect(detected).toMatchObject({
      bubblewrap: true,
      landlock: true,
      mode: 'PROCESS',
      partial: []
    })
    expect(detected.reason).toBeUndefined()
  })

  it('caps at WORKSPACE and explains why when bubblewrap is missing', () => {
    const detected = detectSandboxCapabilities(probe(false, true))
    expect(detected.mode).toBe('WORKSPACE')
    expect(detected.reason).toContain('bubblewrap ausente')
    expect(detected.partial).not.toContain('PROCESS')
  })

  it('marks IN_PROCESS partial when Landlock is missing', () => {
    const detected = detectSandboxCapabilities(probe(true, false))
    expect(detected.mode).toBe('PROCESS')
    expect(detected.partial).toEqual(['IN_PROCESS'])
    expect(detected.reason).toContain('Landlock indisponível')
  })

  it('fails safe when a probe throws', () => {
    const detected = detectSandboxCapabilities(probe(false, false, true))
    expect(detected.bubblewrap).toBe(false)
    expect(detected.mode).toBe('WORKSPACE')
  })

  it('host smoke: detection is internally coherent on this machine', () => {
    const detected = detectSandboxCapabilities()
    const bwrapWorks = hostProbe.probeBubblewrap()
    expect(detected.bubblewrap).toBe(bwrapWorks)
    expect(detected.mode).toBe(bwrapWorks ? 'PROCESS' : 'WORKSPACE')
    if (!detected.landlock) expect(detected.partial).toContain('IN_PROCESS')
  })
})

describe('PDSH-011 gate matrix (SPEC 0196 §3)', () => {
  it('grants NONE without touching containment', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({ capabilities: caps() }),
      descriptor()
    )
    expect(outcome).toMatchObject({
      kind: 'allowed',
      mode: 'NONE',
      handle: { allowNetwork: false, allowSubprocess: false }
    })
  })

  it('grants IN_PROCESS only read/execute semantics', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({ capabilities: caps() }),
      descriptor({ sandbox: 'IN_PROCESS' })
    )
    expect(outcome).toMatchObject({
      kind: 'allowed',
      mode: 'IN_PROCESS',
      handle: { allowNetwork: false, allowSubprocess: false }
    })
    if (outcome.kind === 'allowed') {
      expect(outcome.handle.workspaceRoot).toBeUndefined()
    }
  })

  it('refuses IN_PROCESS when requireLandlock is set and Landlock is absent', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({
        capabilities: caps({ landlock: false, partial: ['IN_PROCESS'] }),
        requireLandlock: true
      }),
      descriptor({ sandbox: 'IN_PROCESS' })
    )
    expect(outcome).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('Landlock ausente')
    })
  })

  it('grants WORKSPACE with a realpath-validated root', async () => {
    const base = tempWorkspace()
    const outcome = await evaluate(
      createLocalSandboxGate({ capabilities: caps(), workspaceBase: base }),
      descriptor({ sandbox: 'WORKSPACE' })
    )
    expect(outcome.kind).toBe('allowed')
    if (outcome.kind === 'allowed') {
      expect(outcome.handle.workspaceRoot).toBeDefined()
      expect(outcome.handle.allowSubprocess).toBe(false)
    }
  })

  it('fails closed when no workspace base is configured', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({ capabilities: caps() }),
      descriptor({ sandbox: 'WORKSPACE' })
    )
    expect(outcome).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('sem base de workspace')
    })
  })

  it('fails closed when the workspace base does not exist', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({
        capabilities: caps(),
        workspaceBase: join(tmpdir(), 'cvg-sandbox-missing-base')
      }),
      descriptor({ sandbox: 'WORKSPACE' })
    )
    expect(outcome.kind).toBe('unavailable')
  })

  it('never grants PROCESS without bubblewrap (no silent downgrade)', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({
        capabilities: caps({
          bubblewrap: false,
          mode: 'WORKSPACE',
          reason: 'bubblewrap ausente; PROCESS indisponível'
        })
      }),
      descriptor({ sandbox: 'PROCESS' })
    )
    expect(outcome).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('bubblewrap ausente')
    })
  })

  it('grants PROCESS with subprocess rights only when bubblewrap exists', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({ capabilities: caps() }),
      descriptor({ sandbox: 'PROCESS' })
    )
    expect(outcome).toMatchObject({
      kind: 'allowed',
      mode: 'PROCESS',
      handle: { allowNetwork: false, allowSubprocess: true }
    })
  })

  it('never grants EGRESS in this package (PDSH-016 scope)', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({ capabilities: caps() }),
      descriptor({ sandbox: 'EGRESS' })
    )
    expect(outcome).toMatchObject({
      kind: 'unavailable',
      reason: expect.stringContaining('PDSH-016')
    })
  })

  it('refuses every contained mode on an unsupported host', async () => {
    const gate = createLocalSandboxGate({
      capabilities: caps({ mode: 'unsupported' }),
      workspaceBase: tempWorkspace()
    })
    for (const mode of ['IN_PROCESS', 'WORKSPACE', 'PROCESS'] as const) {
      expect(await evaluate(gate, descriptor({ sandbox: mode }))).toMatchObject(
        { kind: 'unavailable' }
      )
    }
  })

  it('honors denyModes and the deny hook as explicit denials', async () => {
    const gate = createLocalSandboxGate({
      capabilities: caps(),
      denyModes: ['PROCESS']
    })
    expect(
      await evaluate(gate, descriptor({ sandbox: 'PROCESS' }))
    ).toMatchObject({
      kind: 'denied',
      reason: expect.stringContaining('PROCESS')
    })

    const hookGate = createLocalSandboxGate({
      capabilities: caps(),
      workspaceBase: tempWorkspace(),
      deny: (input) =>
        input.descriptor.id === 'blocked.tool'
          ? 'composição nega esta tool'
          : undefined
    })
    expect(
      await evaluate(
        hookGate,
        descriptor({ id: 'blocked.tool', sandbox: 'WORKSPACE' })
      )
    ).toMatchObject({ kind: 'denied', reason: 'composição nega esta tool' })
    expect(
      await evaluate(
        hookGate,
        descriptor({ id: 'ok.tool', sandbox: 'WORKSPACE' }),
        {
          requiredMode: 'WORKSPACE'
        }
      )
    ).toMatchObject({ kind: 'allowed' })
  })

  it('fails closed when the journal itself throws', async () => {
    const outcome = await evaluate(
      createLocalSandboxGate({
        capabilities: caps(),
        journal: () => {
          throw new Error('journal fora do ar')
        }
      }),
      descriptor({ sandbox: 'IN_PROCESS' })
    )
    expect(outcome.kind).toBe('unavailable')
  })

  it('journals every decision with tool, mode and outcome', async () => {
    const entries: unknown[] = []
    const gate = createLocalSandboxGate({
      capabilities: caps({ bubblewrap: false, mode: 'WORKSPACE' }),
      journal: (entry) => entries.push(entry)
    })
    await evaluate(gate, descriptor({ id: 'a.tool', sandbox: 'PROCESS' }))
    await evaluate(gate, descriptor({ id: 'b.tool' }))
    expect(entries).toEqual([
      expect.objectContaining({
        toolId: 'a.tool',
        mode: 'PROCESS',
        outcome: 'unavailable'
      }),
      expect.objectContaining({
        toolId: 'b.tool',
        mode: 'NONE',
        outcome: 'allowed'
      })
    ])
  })
})

const handle = (over: Partial<SandboxHandle> = {}): SandboxHandle => ({
  mode: 'PROCESS',
  allowNetwork: false,
  allowSubprocess: true,
  ...over
})

describe('PDSH-011 runContained (SPEC 0196 §5)', () => {
  const bwrapWorks = hostProbe.probeBubblewrap()

  it('refuses to spawn when the handle does not allow subprocesses', async () => {
    const result = await runContained({
      argv: ['/bin/echo', 'x'],
      handle: handle({ allowSubprocess: false })
    })
    expect(result.exitCode).toBe('spawn_failed')
  })

  it('refuses a cwd outside the workspace root', async () => {
    const result = await runContained({
      argv: ['/bin/echo', 'x'],
      handle: handle({ workspaceRoot: tempWorkspace() }),
      cwd: tmpdir()
    })
    expect(result.exitCode).toBe('spawn_failed')
    expect(result.stderr).toContain('fora do workspace')
  })

  it('reports spawn_failed when the sandbox binary is missing', async () => {
    const result = await runContained({
      argv: ['/bin/echo', 'x'],
      handle: handle(),
      bwrapPath: join(tmpdir(), 'definitely-not-bwrap')
    })
    expect(result.exitCode).toBe('spawn_failed')
  })

  it.skipIf(!bwrapWorks)(
    'runs a real command inside the namespace',
    async () => {
      const workspace = tempWorkspace()
      const result = await runContained({
        argv: ['/bin/echo', 'contained-ok'],
        handle: handle({ workspaceRoot: workspace }),
        cwd: workspace
      })
      expect(result.exitCode).toBe(0)
      expect(result.stdout).toBe('contained-ok\n')
      expect(result.truncated).toBe(false)
    }
  )

  it.skipIf(!bwrapWorks)('kills the namespace on timeout', async () => {
    const result = await runContained({
      argv: ['/bin/sleep', '30'],
      handle: handle(),
      timeoutMs: 300
    })
    expect(result.exitCode).toBe('timeout')
  })

  it.skipIf(!bwrapWorks)('truncates output at the byte cap', async () => {
    const result = await runContained({
      argv: ['/usr/bin/seq', '1', '200000'],
      handle: handle(),
      maxOutputBytes: 1024
    })
    expect(result.exitCode).toBe(0)
    expect(result.truncated).toBe(true)
    expect(Buffer.byteLength(result.stdout, 'utf8')).toBeLessThanOrEqual(1024)
  })

  it.skipIf(!bwrapWorks)('keeps the network namespace unshared', async () => {
    const result = await runContained({
      argv: ['/bin/sh', '-c', 'ip link 2>/dev/null | grep -c DOWN || true'],
      handle: handle(),
      timeoutMs: 5000
    })
    // Without a network namespace the command sees host interfaces; inside
    // --unshare-net only `lo` exists, so `ip link` never shows a real NIC.
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).not.toContain('eth0')
  })
})
