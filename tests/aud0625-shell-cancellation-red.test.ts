// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ToolExecutionContext } from '@cvg/harness-contracts'
import {
  createShellTool,
  type ShellRunRequest
} from '../packages/sandbox/src/shell-tool.ts'
import { phase3RuntimeInput } from '../packages/harness/src/__tests__/fixtures/phase3-fixtures.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})
async function callShell(preAborted = false) {
  const root = mkdtempSync(join(tmpdir(), 'aud0625-shell-'))
  roots.push(root)
  const controller = new AbortController()
  if (preAborted) controller.abort(new Error('owned synthetic cancellation'))
  const captured: ShellRunRequest[] = []
  const shell = createShellTool({
    workspaceRoot: root,
    run: async (request) => {
      captured.push(request)
      return {
        exitCode: 0,
        stdout: 'CVG-OWN-NO-SUBPROCESS',
        stderr: '',
        truncated: false
      }
    }
  })
  const input = phase3RuntimeInput()
  const context: ToolExecutionContext = {
    tenantId: input.tenantId,
    agentId: input.agent.id,
    correlationId: input.correlationId,
    traceId: input.traceId,
    signal: controller.signal,
    sandboxHandle: {
      mode: 'PROCESS',
      workspaceRoot: root,
      allowNetwork: false,
      allowSubprocess: true,
      deadlineMs: 2000
    }
  }
  const result = await shell.execute(
    {
      argv: ['synthetic-no-exec'],
      intent: 'owned cancellation seam probe',
      timeoutMs: 1000
    },
    context
  )
  return { captured, controller, result }
}

describe('AUD0625 F05 — caller cancellation reaches the shell runner seam', () => {
  it('positive control: a valid grant reaches the injected runner exactly once', async () => {
    const actual = await callShell()
    expect(actual.result.status).toBe('SUCCEEDED')
    expect(actual.captured).toHaveLength(1)
    expect(actual.captured[0]?.handle.mode).toBe('PROCESS')
    expect(actual.captured[0]?.timeoutMs).toBe(1000)
  })
  it.fails(
    'F05 shell forwards the identical caller AbortSignal to its runner',
    async () => {
      const actual = await callShell()
      expect(actual.captured).toHaveLength(1)
      expect(
        (actual.captured[0] as ShellRunRequest & { signal?: AbortSignal })
          .signal
      ).toBe(actual.controller.signal)
    }
  )
  it.fails(
    'F05 an already-cancelled caller never starts a runner',
    async () => {
      const actual = await callShell(true)
      expect(actual.captured).toHaveLength(0)
    }
  )
})
