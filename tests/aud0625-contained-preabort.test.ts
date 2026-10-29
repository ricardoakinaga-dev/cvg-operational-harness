// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runContained } from '../packages/sandbox/src/run.ts'

let root: string, marker: string, backend: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'aud0625-preabort-'))
  marker = join(root, 'launched')
  backend = join(root, 'owned-backend')
  // A trusted test-only backend records launch. It is not a containment proof.
  writeFileSync(
    backend,
    '#!' +
      process.execPath +
      '\n' +
      'require("node:fs").writeFileSync(' +
      JSON.stringify(marker) +
      ',"OWNED-LAUNCH");process.stdout.write("OWNED-BACKEND");\n',
    { mode: 0o700 }
  )
})
afterEach(() => rmSync(root, { recursive: true, force: true }))
function request(signal?: AbortSignal) {
  return {
    argv: ['controlled-no-payload'],
    bwrapPath: backend,
    handle: {
      mode: 'PROCESS' as const,
      workspaceRoot: root,
      allowNetwork: false,
      allowSubprocess: true
    },
    timeoutMs: 1000,
    ...(signal ? { signal } : {})
  }
}
describe('F05 backend pre-abort admission, owned launch marker only', () => {
  it('positive control: the owned test backend records a real launch', async () => {
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
