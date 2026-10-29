// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setImmediate } from 'node:timers/promises'
import { runContained } from '../packages/sandbox/src/run.ts'
import { reviewedNodeProfile } from './helpers/aud0625-node-process-profile.ts'

const roots: string[] = []
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true })
})
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'aud0625-profile-lifecycle-'))
  roots.push(root)
  return {
    root,
    request: {
      processProfile: reviewedNodeProfile(root),
      handle: {
        mode: 'PROCESS' as const,
        workspaceRoot: root,
        allowNetwork: false,
        allowSubprocess: true
      },
      argv: [process.execPath, '-e', 'process.stdout.write("OWNED-COMPLETE")'],
      timeoutMs: 2000
    }
  }
}
async function settledHostFdCount(): Promise<number> {
  // Warmed worker, serial native launches, and child close before each count.
  // No tolerance that could hide a single inherited directory/runtime FD.
  await setImmediate()
  await setImmediate()
  return readdirSync('/proc/self/fd').length
}

describe('AUD0625 F02 P3 — parent descriptor lifetime and network admission', () => {
  it('keeps the host FD count unchanged after three successful native launches', async () => {
    const { request } = fixture()
    const warmup = await runContained(request)
    expect(warmup.exitCode, warmup.stderr).toBe(0)
    expect(warmup.stdout).toBe('OWNED-COMPLETE')
    const before = await settledHostFdCount()
    const counts: number[] = []
    for (let n = 0; n < 3; n++) {
      const actual = await runContained(request)
      // Admission and successful payload execution precede the leak oracle.
      expect(actual.exitCode, actual.stderr).toBe(0)
      expect(actual.stdout).toBe('OWNED-COMPLETE')
      counts.push(await settledHostFdCount())
    }
    console.info(
      'AUD0625-OWN-FD-COUNTS',
      JSON.stringify({ before, after: counts })
    )
    expect(counts).toEqual([before, before, before])
  }, 30000)

  it('refuses an allowNetwork grant before the payload even while network isolation remains enabled', async () => {
    const { root, request } = fixture()
    const marker = join(root, 'launched')
    const argv = [
      process.execPath,
      '-e',
      'require("node:fs").writeFileSync("launched","OWNED")'
    ]
    const positive = await runContained({ ...request, argv })
    expect(positive.exitCode, positive.stderr).toBe(0)
    expect(existsSync(marker)).toBe(true)
    rmSync(marker)
    const actual = await runContained({
      ...request,
      argv,
      handle: { ...request.handle, allowNetwork: true }
    })
    expect(actual).toMatchObject({
      exitCode: 'spawn_failed',
      stdout: '',
      stderr: 'process_profile_invalid_process_grant',
      truncated: false
    })
    expect(existsSync(marker)).toBe(false)
  }, 30000)
})
