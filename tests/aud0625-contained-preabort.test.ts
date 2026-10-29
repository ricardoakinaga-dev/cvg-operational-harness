// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runContained } from '../packages/sandbox/src/run.ts'
import type { ProcessContainmentProfile } from '../packages/sandbox/src/process-profile.ts'
import { reviewedNodeProfile } from './helpers/aud0625-node-process-profile.ts'

let root: string, marker: string, processProfile: ProcessContainmentProfile
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aud0625-preabort-'))
  marker = join(root, 'launched')
  processProfile = reviewedNodeProfile(root)
}, 30000)
afterEach(() => rmSync(root, { recursive: true, force: true }))
function request(signal?: AbortSignal) {
  return {
    argv: [
      process.execPath,
      '-e',
      'require("node:fs").writeFileSync(process.argv[1],"OWNED-LAUNCH");process.stdout.write("OWNED-BACKEND")',
      marker
    ],
    processProfile,
    handle: {
      mode: 'PROCESS' as const,
      workspaceRoot: root,
      allowNetwork: false,
      allowSubprocess: true
    },
    timeoutMs: 2000,
    ...(signal ? { signal } : {})
  }
}
describe('F05 backend pre-abort admission, owned launch marker only', () => {
  it('positive control: the reviewed profile records an owned launch marker', async () => {
    const result = await runContained(request())
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('OWNED-BACKEND')
    expect(existsSync(marker)).toBe(true)
  })
  it('pre-abort refuses before creating any backend process', async () => {
    const controller = new AbortController()
    controller.abort()
    const result = await runContained(request(controller.signal))
    expect(result).toMatchObject({
      exitCode: 'spawn_failed',
      stderr: 'command_cancelled_before_launch'
    })
    expect(existsSync(marker)).toBe(false)
  })
})
