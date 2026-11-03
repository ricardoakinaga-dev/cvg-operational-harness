// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ciProcessDiagnostics } from '../scripts/lib/ci-process-diagnostics.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')

// Exercise the real CLI with a private synthetic npm, not the application
// typechecker. Its import closure stays byte-identical to this checkout.
function copyCliClosure(target) {
  const seen = new Set()
  function copy(relative) {
    if (seen.has(relative)) return
    seen.add(relative)
    const source = fs.readFileSync(path.join(root, relative), 'utf8')
    const destination = path.join(target, relative)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.writeFileSync(destination, source)
    const imports = source.matchAll(
      /(?:import|export)\s[\s\S]*?from\s+['"]([^'"]+)['"]/g
    )
    for (const [, specifier] of imports) {
      if (specifier.startsWith('.'))
        copy(path.join(path.dirname(relative), specifier))
    }
  }
  copy('scripts/ci-bar.mjs')
}

function runSyntheticGate(shim) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'cvg-ci-process-diagnostic-')
  )
  fs.chmodSync(directory, 0o700)
  try {
    copyCliClosure(directory)
    const bin = path.join(directory, 'bin')
    const artifacts = path.join(directory, 'artifacts')
    fs.mkdirSync(bin)
    fs.mkdirSync(artifacts)
    fs.mkdirSync(path.join(artifacts, 'gates'))
    if (shim !== undefined)
      fs.writeFileSync(path.join(bin, 'npm'), `#!/bin/sh\n${shim}\n`, {
        mode: 0o700
      })
    const statePath = path.join(artifacts, 'ci-bar-state.json')
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        runId: 'synthetic-process-run',
        candidateId: 'b'.repeat(64),
        nodeVersion: process.versions.node,
        gates: []
      })
    )
    const observed = spawnSync(
      process.execPath,
      ['scripts/ci-bar.mjs', 'gate', 'typecheck'],
      {
        cwd: directory,
        encoding: 'utf8',
        timeout: 5000,
        env: { PATH: bin, CI_ARTIFACT_DIR: artifacts, LANG: 'C', TZ: 'UTC' }
      }
    )
    expect(observed.error).toBeUndefined()
    expect(observed.signal).toBeNull()
    const entry = JSON.parse(observed.stdout)
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    const log = fs.readFileSync(path.join(artifacts, entry.log), 'utf8')
    expect(state.gates).toEqual([entry])
    expect(sha256(log)).toBe(entry.logSha256)
    expect(entry.runId).toBe('synthetic-process-run')
    expect(entry.candidateId).toBe('b'.repeat(64))
    return { observed, entry, log }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
}

describe('ci-bar native process diagnostics through the CLI', () => {
  it('preserves a successful native status without claiming application validation', () => {
    const { observed, entry, log } = runSyntheticGate('exit 0')
    expect(observed.status).toBe(0)
    expect(entry).toMatchObject({
      status: 'PASS',
      exitCode: 0,
      processExitCode: 0,
      signal: null,
      error: null
    })
    expect(log).toContain('processExitCode=0')
  })

  it('preserves nonzero native status, output and the failing gate result', () => {
    const { observed, entry, log } = runSyntheticGate(
      "printf 'synthetic stdout\\n'; printf 'synthetic stderr\\n' >&2; exit 7"
    )
    expect(observed.status).toBe(7)
    expect(entry).toMatchObject({
      status: 'FAIL',
      exitCode: 7,
      processExitCode: 7,
      signal: null,
      error: null
    })
    expect(log).toContain('synthetic stdout')
    expect(log).toContain('synthetic stderr')
  })

  it('distinguishes a child killed by SIGTERM from a timeout', () => {
    const { observed, entry, log } = runSyntheticGate('kill -TERM $$')
    expect(observed.status).toBe(1)
    expect(entry).toMatchObject({
      status: 'FAIL',
      exitCode: 1,
      processExitCode: null,
      signal: 'SIGTERM',
      error: null
    })
    expect(log).toContain('processSignal=SIGTERM')
    expect(log).not.toContain('ETIMEDOUT')
  })

  it('distinguishes a missing executable from a timeout', () => {
    const { observed, entry, log } = runSyntheticGate(undefined)
    expect(observed.status).toBe(1)
    expect(entry).toMatchObject({
      status: 'FAIL',
      exitCode: 1,
      processExitCode: null,
      signal: null,
      error: { code: 'ENOENT' }
    })
    expect(log).toContain('ENOENT')
    expect(log).not.toContain('ETIMEDOUT')
  })
})

describe('ci-bar process diagnostic projection', () => {
  it('preserves ETIMEDOUT from a real, bounded child process', () => {
    const observed = spawnSync(
      process.execPath,
      ['-e', 'setTimeout(() => {}, 5000)'],
      { timeout: 40, encoding: 'utf8', env: {} }
    )
    expect(observed.status).toBeNull()
    expect(observed.error?.code).toBe('ETIMEDOUT')
    expect(ciProcessDiagnostics(observed)).toMatchObject({
      processExitCode: null,
      signal: observed.signal,
      error: { code: 'ETIMEDOUT' }
    })
  })

  it('bounds error messages and keeps embedded log text inside JSON', () => {
    const message = 'synthetic\nstatus=PASS\n' + 'x'.repeat(9000)
    const diagnostic = ciProcessDiagnostics({
      status: null,
      signal: null,
      error: { code: 'EIO', message }
    })
    expect(diagnostic.error.message).toHaveLength(8192)
    expect(diagnostic.error.message).toBe(message.slice(0, 8192))
    expect(diagnostic.error.code).toBe('EIO')
    expect(JSON.stringify(diagnostic.error).split('\n')).toHaveLength(1)
  })
})
