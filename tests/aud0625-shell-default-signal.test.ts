// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolExecutionContext } from '@cvg/harness-contracts'
import { phase3RuntimeInput } from '../packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'

// This double observes only the shell -> default-backend seam, not process cleanup.
const backend = vi.hoisted(() => ({
  calls: [] as unknown[],
  onCall: undefined as (() => void) | undefined
}))
vi.mock('../packages/sandbox/src/run.ts', () => ({
  runContained: async (request: unknown) => {
    backend.calls.push(request)
    backend.onCall?.()
    return {
      exitCode: 0,
      stdout: 'CONTROLLED-DEFAULT-BACKEND',
      stderr: '',
      truncated: false
    }
  }
}))
import { createShellTool } from '../packages/sandbox/src/shell-tool.ts'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aud0625-default-'))
  backend.calls.length = 0
  backend.onCall = undefined
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
function context(signal?: AbortSignal): ToolExecutionContext {
  const input = phase3RuntimeInput()
  return {
    tenantId: input.tenantId,
    agentId: input.agent.id,
    correlationId: input.correlationId,
    traceId: input.traceId,
    ...(signal ? { signal } : {}),
    sandboxHandle: {
      mode: 'PROCESS',
      workspaceRoot: root,
      allowNetwork: false,
      allowSubprocess: true,
      deadlineMs: 2000
    }
  }
}
const command = {
  argv: ['controlled-no-process'],
  intent: 'owned default backend signal seam',
  timeoutMs: 1000
}
describe('F05 default backend wiring, no native supervision claim', () => {
  it('forwards the exact live signal through the default wrapper', async () => {
    const controller = new AbortController()
    const result = await createShellTool({ workspaceRoot: root }).execute(
      command,
      context(controller.signal)
    )
    expect(result.status).toBe('SUCCEEDED')
    expect(backend.calls).toHaveLength(1)
    expect(backend.calls[0]).toMatchObject({
      signal: controller.signal,
      timeoutMs: 1000
    })
    expect((backend.calls[0] as { signal?: AbortSignal }).signal).toBe(
      controller.signal
    )
  })
  it('refuses pre-abort before the default backend is called', async () => {
    const controller = new AbortController()
    controller.abort(new Error('synthetic reason must not be echoed'))
    const result = await createShellTool({ workspaceRoot: root }).execute(
      command,
      context(controller.signal)
    )
    expect(backend.calls).toHaveLength(0)
    expect(result).toMatchObject({
      status: 'REJECTED',
      error: 'command_cancelled_before_launch'
    })
  })
  it('does not announce success when the default backend aborts before returning', async () => {
    const controller = new AbortController()
    backend.onCall = () => controller.abort()
    const result = await createShellTool({ workspaceRoot: root }).execute(
      command,
      context(controller.signal)
    )
    expect(backend.calls).toHaveLength(1)
    expect(result).toMatchObject({
      status: 'FAILED',
      error: 'effect_uncertain: cleanup_incomplete after cancellation'
    })
  })
})
