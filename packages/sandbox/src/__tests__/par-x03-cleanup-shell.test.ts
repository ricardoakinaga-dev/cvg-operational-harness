import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { phase3RuntimeInput } from '../../../harness/src/__tests__/fixtures/phase3-fixtures.ts'
import {
  ownerContainment,
  containmentMirrors
} from '../process-service/containment.ts'
import type { ProcessOutcome } from '../process-service/types.ts'
const seam = vi.hoisted(() => ({ launch: vi.fn() }))
vi.mock('../process-service/service.ts', () => ({
  createProcessService: () => ({ launch: seam.launch })
}))
import { createShellTool } from '../shell-tool.ts'
import { runContained } from '../run.ts'
let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'x03-cleanup-'))
  seam.launch.mockReset()
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
const outcome = (
  cause: ProcessOutcome['cause'],
  exitCode: number | null
): ProcessOutcome => ({
  cause,
  exitCode,
  signal: null,
  stdout: 'command ran',
  stderr: 'original diagnostic',
  truncated: false,
  cleanup: {
    state: 'cleanup_failed',
    observed: 'proc-pidns',
    leftover: 1,
    unverified: 0
  },
  ...containmentMirrors(ownerContainment({ applied: false })),
  secondaryErrors: []
})
const command = {
  argv: ['synthetic-never-spawned'],
  intent: 'cleanup uncertainty',
  timeoutMs: 1000
}
function context() {
  const input = phase3RuntimeInput()
  return {
    tenantId: input.tenantId,
    agentId: input.agent.id,
    correlationId: input.correlationId,
    traceId: input.traceId,
    sandboxHandle: {
      mode: 'PROCESS' as const,
      workspaceRoot: root,
      allowNetwork: false,
      allowSubprocess: true
    }
  }
}
it.each([
  ['exit', 0],
  ['exit', 7],
  ['timeout', null],
  ['cancelled', null]
] as const)(
  'DF34008: real shell and default adapter preserve launched uncertainty (%s/%s)',
  async (cause, exitCode) => {
    seam.launch.mockResolvedValue({
      wait: async () => outcome(cause, exitCode)
    })
    const ctx = context()
    const adapter = await runContained({
      argv: command.argv,
      handle: ctx.sandboxHandle
    })
    expect(adapter).toMatchObject({
      exitCode: 'cleanup_failed',
      cause,
      stdout: 'command ran',
      stderr: 'original diagnostic'
    })
    const tool = createShellTool({ workspaceRoot: root })
    const result = await tool.execute(command, ctx)
    expect(result).toMatchObject({
      status: 'FAILED',
      error: 'effect_uncertain: cleanup_incomplete'
    })
    expect(seam.launch).toHaveBeenCalledTimes(2)
  }
)
it('DF34008: a genuinely refused launch retains the spawn failure message', async () => {
  seam.launch.mockRejectedValue(new Error('synthetic refusal'))
  expect(
    await createShellTool({ workspaceRoot: root }).execute(command, context())
  ).toMatchObject({
    status: 'FAILED',
    error: expect.stringContaining('could not be launched')
  })
})
it('DF34008 P3: rejected containment is not exposed as observed authority', async () => {
  const o = outcome('exit', 0)
  seam.launch.mockResolvedValue({
    wait: async () => ({ ...o, containment: { ...o.containment, version: 9 } })
  })
  const result = await runContained({
    argv: command.argv,
    handle: context().sandboxHandle
  })
  expect(result.exitCode).toBe('spawn_failed')
  expect(result.containment).toBeUndefined()
})
