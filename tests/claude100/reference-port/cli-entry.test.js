// @vitest-environment node
// Execute a byte-identical CLI in an exclusive synthetic checkout with an inert
// controller. Never invoke the real valid probe CLI, Docker, HTTP or Claude.
import { it, expect } from 'vitest'
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
  access
} from 'node:fs/promises'
import { watch } from 'node:fs'
import { execFile } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SOURCE_PATHS } from './bootstrap.mjs'

it.each(['SIGINT', 'SIGTERM'])(
  'cancels %s during copied CLI import before the inert controller can start',
  async (signal) => {
    const base = await mkdtemp(path.join(tmpdir(), 'native-port-entry-only-'))
    const checkout = path.join(base, 'synthetic-source'),
      evidence = path.join(base, 'evidence')
    let watcher, child
    try {
      await mkdir(checkout, { mode: 0o700 })
      await mkdir(evidence, { mode: 0o700 })
      for (const relative of SOURCE_PATHS) {
        const filename = path.join(checkout, relative)
        await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 })
        await writeFile(
          filename,
          await readFile(new URL('../../../' + relative, import.meta.url)),
          { mode: 0o600 }
        )
      }
      const ready = path.join(base, 'entry-import-ready'),
        forbidden = path.join(base, 'controller-was-invoked')
      await writeFile(
        path.join(checkout, 'tests/claude100/reference-port/controller.mjs'),
        `
      import { writeFile } from 'node:fs/promises';
      await writeFile(${JSON.stringify(ready)}, 'SYNTHETIC_IMPORT_ONLY');
      await new Promise(resolve => setTimeout(resolve, 500));
      export async function runProbe() {
        await writeFile(${JSON.stringify(forbidden)}, 'MUST_NOT_RUN_AFTER_ENTRY_CANCELLATION');
        throw new Error('Synthetic controller must not be invoked');
      }
    `
      )
      await writeFile(
        path.join(evidence, 'manifest.json'),
        '{"version":1,"runId":"entry_only","fixtureId":"NATIVE_PORT_503_V1"}',
        { mode: 0o600 }
      )
      let sent = false
      watcher = watch(base, (_event, name) => {
        if (!sent && name === 'entry-import-ready') {
          sent = true
          child.kill(signal)
        }
      })
      const failure = await new Promise((resolve) => {
        child = execFile(
          process.execPath,
          [
            path.join(checkout, 'scripts/claude100-reference-port.mjs'),
            '--manifest',
            'manifest.json',
            '--evidence-root',
            evidence,
            '--out',
            'probe'
          ],
          {
            env: { PATH: '/usr/bin:/bin', HOME: base, LANG: 'C.UTF-8' },
            timeout: 3000,
            killSignal: 'SIGKILL'
          },
          (error, stdout, stderr) => resolve({ error, stdout, stderr })
        )
      })
      expect(sent).toBe(true)
      expect(failure.error?.code).toBe(1)
      expect(failure.error?.signal).toBeNull()
      expect(failure.stdout).toBe('')
      expect(failure.stderr).toContain('Native port probe failed')
      await expect(access(forbidden)).rejects.toHaveProperty('code', 'ENOENT')
      expect(
        (await readdir(evidence)).filter((n) =>
          n.startsWith('.native-port-bootstrap-')
        )
      ).toEqual([])
      await expect(access(path.join(evidence, 'probe'))).rejects.toHaveProperty(
        'code',
        'ENOENT'
      )
    } finally {
      watcher?.close()
      if (child && child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL')
      await rm(base, { recursive: true, force: true })
    }
  }
)
