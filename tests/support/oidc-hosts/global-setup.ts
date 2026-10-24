/**
 * SPEC0259 §4.11 — Playwright global setup of the three-host proof: starts
 * the environment process (`tsx environment.ts`) and returns its teardown.
 * Without Docker, PostgreSQL or `openssl` the setup fails: it never skips.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { READY_LINE, STATE_ENV } from './state.ts'

const SETUP_TIMEOUT_MS = 300_000

export default async function globalSetup(): Promise<() => Promise<void>> {
  // Local iteration only: reuse a running environment. The proof runner
  // refuses this variable, so the published report always comes from a
  // fresh environment.
  if (process.env.CVG_OIDC_HOSTS_REUSE === '1' && process.env[STATE_ENV]) {
    return async () => undefined
  }
  const root = process.cwd()
  const directory = mkdtempSync(join(tmpdir(), 'cvg-0259-state-'))
  const statePath = join(directory, 'state.json')
  const child = spawn(
    join(root, 'node_modules/.bin/tsx'),
    ['tests/support/oidc-hosts/environment.ts'],
    {
      cwd: root,
      env: { ...process.env, [STATE_ENV]: statePath },
      stdio: ['ignore', 'pipe', 'pipe']
    }
  )
  let stderr = ''
  child.stderr.on('data', (chunk) => {
    stderr = `${stderr}${String(chunk)}`.slice(-4_000)
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('three-host environment timed out'))
    }, SETUP_TIMEOUT_MS)
    let stdout = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
      if (stdout.includes(READY_LINE)) {
        clearTimeout(timer)
        resolve()
      }
    })
    child.once('exit', (code) => {
      clearTimeout(timer)
      reject(new Error(`three-host environment exited (${code}): ${stderr}`))
    })
  })
  process.env[STATE_ENV] = statePath
  return async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 90_000)
      await new Promise((resolve) => child.once('close', resolve))
      clearTimeout(timer)
    }
    rmSync(directory, { recursive: true, force: true })
  }
}
