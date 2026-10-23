// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import {
  GATE_ENVIRONMENT_EVIDENCE_MATRIX,
  GATE_EVIDENCE_MATRIX
} from '../scripts/lib/certification-rules.mjs'
import { invalidateGeneratedGateResults } from '../scripts/lib/phase10-generated-results.mjs'

const roots = []
const outputs = [
  'coverage/coverage-summary.json',
  'certification/critical-coverage.json',
  'certification/mutation-guard.json'
]
const staticInput = 'scripts/critical-coverage-manifest.json'
const historical = 'certification/logs/historical/old-critical-coverage.json'

function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase10-output-'))
  roots.push(root)
  fs.mkdirSync(path.join(root, 'certification/logs'), { recursive: true })
  return root
}

function write(root, relativePath, text = 'synthetic previous-run result\n') {
  const target = path.join(root, relativePath)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, text)
}

function seed(root) {
  for (const relativePath of [...outputs, staticInput, historical]) {
    write(root, relativePath)
  }
}

function shellWord(value) {
  return "'" + value.replaceAll("'", "'\\''") + "'"
}

function child(root, name, body) {
  const filename = path.join(root, name + '.cjs')
  fs.writeFileSync(filename, "const fs = require('node:fs');\n" + body)
  return [process.execPath, filename].map(shellWord).join(' ')
}

function nativeRun(root) {
  // Execute the actual native run function without starting the full certify
  // CLI. Its real fs/spawn dependencies remain real; only ambient CI env and
  // stderr are local to this synthetic fixture. This is a lifecycle test, not
  // a claim that the complete certifier or its evidence verifier ran.
  const source = fs.readFileSync(
    path.join(process.cwd(), 'scripts/phase10-certify.mjs'),
    'utf8'
  )
  const start = source.indexOf('function run(')
  const end = source.indexOf('\nfunction sha256File(', start)
  if (start < 0 || end < start) throw new Error('phase10_run_boundary_missing')
  return vm.runInNewContext('(' + source.slice(start, end) + ')', {
    root,
    logDir: path.join(root, 'certification/logs'),
    fs,
    path,
    spawnSync,
    createHash,
    invalidateGeneratedGateResults,
    process: { env: { CI: 'true' }, stderr: { write() {} } }
  })
}

function runCoverage(root, command) {
  return nativeRun(root)(
    { id: 'coverage', command },
    { runId: 'run-synthetic-output-freshness', candidateId: 'a'.repeat(64) }
  )
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('phase10 generated result lifecycle', () => {
  for (const [gateId, matrix] of Object.entries({
    ...GATE_EVIDENCE_MATRIX,
    ...GATE_ENVIRONMENT_EVIDENCE_MATRIX
  })) {
    it('invalidates only generated results for native ' + gateId, () => {
      const root = makeRoot()
      const resultPaths = matrix.results ?? []
      for (const relativePath of resultPaths) write(root, relativePath)
      write(root, staticInput)
      write(root, historical)
      invalidateGeneratedGateResults({ root, gateId })
      for (const relativePath of resultPaths) {
        expect(fs.existsSync(path.join(root, relativePath))).toBe(false)
      }
      expect(fs.readFileSync(path.join(root, staticInput), 'utf8')).toBe(
        'synthetic previous-run result\n'
      )
      expect(fs.readFileSync(path.join(root, historical), 'utf8')).toBe(
        'synthetic previous-run result\n'
      )
    })
  }

  it('removes inherited coverage subresults before a real failed producer', () => {
    const root = makeRoot()
    seed(root)
    const command = child(
      root,
      'fail-before-output',
      "fs.writeFileSync('observed.json', JSON.stringify(" +
        JSON.stringify(outputs) +
        '.map(p => fs.existsSync(p)))); process.exit(17)\n'
    )
    const record = runCoverage(root, command)
    expect(record).toMatchObject({ status: 'FAIL', exitCode: 17 })
    expect(
      JSON.parse(fs.readFileSync(path.join(root, 'observed.json')))
    ).toEqual([false, false, false])
    for (const relativePath of outputs) {
      expect(fs.existsSync(path.join(root, relativePath))).toBe(false)
    }
    expect(fs.readFileSync(path.join(root, staticInput), 'utf8')).toBe(
      'synthetic previous-run result\n'
    )
  })

  it('retains new failed critical output while the later && producer never runs', () => {
    const root = makeRoot()
    seed(root)
    const measurement = child(
      root,
      'measurement',
      "fs.writeFileSync('coverage/coverage-summary.json', 'current measurement');\n"
    )
    const critical = child(
      root,
      'critical',
      "fs.writeFileSync('certification/critical-coverage.json', 'current failed critical'); process.exit(8)\n"
    )
    const mutation = child(
      root,
      'mutation',
      "fs.writeFileSync('certification/mutation-guard.json', 'must not run');\n"
    )
    const record = runCoverage(
      root,
      [measurement, critical, mutation].join(' && ')
    )
    expect(record).toMatchObject({ status: 'FAIL', exitCode: 8 })
    expect(fs.readFileSync(path.join(root, outputs[0]), 'utf8')).toBe(
      'current measurement'
    )
    expect(fs.readFileSync(path.join(root, outputs[1]), 'utf8')).toBe(
      'current failed critical'
    )
    expect(fs.existsSync(path.join(root, outputs[2]))).toBe(false)
  })

  it('keeps all newly produced success outputs and invalidates them on the next failure', () => {
    const root = makeRoot()
    seed(root)
    const command = child(
      root,
      'success',
      JSON.stringify(outputs) +
        ".forEach(p => fs.writeFileSync(p, 'current success'));\n"
    )
    const first = runCoverage(root, command)
    expect(first).toMatchObject({ status: 'PASS', exitCode: 0 })
    for (const relativePath of outputs) {
      expect(fs.readFileSync(path.join(root, relativePath), 'utf8')).toBe(
        'current success'
      )
    }
    const second = runCoverage(
      root,
      child(root, 'next-failure', 'process.exit(19)\n')
    )
    expect(second).toMatchObject({ status: 'FAIL', exitCode: 19 })
    for (const relativePath of outputs) {
      expect(fs.existsSync(path.join(root, relativePath))).toBe(false)
    }
  })

  it('refuses an unexpected directory without deleting it or spawning', () => {
    const root = makeRoot()
    const sentinel = outputs[1] + '/keep.txt'
    write(root, sentinel, 'must survive')
    const command = child(
      root,
      'forbidden-spawn',
      "fs.writeFileSync('spawned.txt', 'unexpected');\n"
    )
    expect(() => runCoverage(root, command)).toThrow()
    expect(fs.readFileSync(path.join(root, sentinel), 'utf8')).toBe(
      'must survive'
    )
    expect(fs.existsSync(path.join(root, 'spawned.txt'))).toBe(false)
  })

  it('unlinks a final-component symlink without modifying its target', () => {
    const root = makeRoot()
    const target = path.join(root, 'target.txt')
    fs.writeFileSync(target, 'target must survive')
    fs.symlinkSync(target, path.join(root, outputs[1]))
    invalidateGeneratedGateResults({ root, gateId: 'coverage' })
    expect(fs.existsSync(path.join(root, outputs[1]))).toBe(false)
    expect(fs.readFileSync(target, 'utf8')).toBe('target must survive')
  })

  it('rejects unknown and inherited gate names without changing files', () => {
    const root = makeRoot()
    seed(root)
    for (const gateId of ['unknown', '__proto__', 'constructor']) {
      expect(() => invalidateGeneratedGateResults({ root, gateId })).toThrow(
        'phase10_unknown_gate'
      )
    }
    for (const relativePath of outputs) {
      expect(fs.readFileSync(path.join(root, relativePath), 'utf8')).toBe(
        'synthetic previous-run result\n'
      )
    }
  })
})
