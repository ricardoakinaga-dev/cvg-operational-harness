import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CI_BAR_GATES,
  CI_BAR_SCOPE,
  CI_BAR_VERSION
} from '../scripts/ci-bar-contract.mjs'
import {
  artifactInventory,
  createGateSeal,
  decodeGateSeal,
  encodeGateSeal,
  gateStepId,
  runnerIdentity,
  verifyArtifactInventory,
  verifyGateSeals
} from '../scripts/ci-bar-provenance.mjs'

const directories = []
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function attestationPython() {
  const workflow = fs.readFileSync(
    path.join(root, '.github/workflows/verify.yml'),
    'utf8'
  )
  const job = workflow.split('  attest:')[1]?.split('  provenance-verify:')[0]
  const block = job?.match(
    /          python3 - <<'PY'\n([\s\S]*?)          PY\n/
  )
  if (!block) throw new Error('attestation verifier is missing')
  return block[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n')
}

function writeAttestationFixture(input) {
  const statePath = path.join(input.artifactDir, 'ci-bar-state.json')
  fs.writeFileSync(statePath, JSON.stringify(input.state))
  const provenance = verifyGateSeals(input)
  expect(provenance.failures).toEqual([])
  const files = []
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(file)
      else
        files.push(
          path.relative(input.artifactDir, file).split(path.sep).join('/')
        )
    }
  }
  visit(input.artifactDir)
  files.sort()
  const manifest = {
    contract: CI_BAR_VERSION,
    scope: input.state.scope,
    verdict: 'PASS',
    runId: input.state.runId,
    candidateId: input.state.candidateId,
    provenance,
    gates: [...input.state.gates, { id: 'artifacts', status: 'PASS' }],
    artifactFiles: files,
    artifactHashes: artifactInventory(input.artifactDir, files)
  }
  const bytes = Buffer.from(JSON.stringify(manifest))
  fs.writeFileSync(path.join(input.artifactDir, 'ci-bar-manifest.json'), bytes)
  const env = {
    ...process.env,
    EXPECTED_SHA256: sha256(bytes),
    EXPECTED_CANDIDATE: input.state.candidateId,
    EXPECTED_RUN: input.state.runId,
    GITHUB_RUN_ID: input.github.runId,
    GITHUB_RUN_ATTEMPT: input.github.attempt,
    GITHUB_SHA: input.github.sha,
    GITHUB_REPOSITORY: input.github.repository,
    GITHUB_WORKFLOW: input.github.workflow
  }
  return { manifest, env }
}

function fixture({ runId = '123', attempt = '2', sha = 'a'.repeat(40) } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-seal-test-'))
  directories.push(directory)
  const artifactDir = path.join(directory, 'ci-artifacts')
  fs.mkdirSync(artifactDir)
  const github = runnerIdentity({
    GITHUB_RUN_ID: runId,
    GITHUB_RUN_ATTEMPT: attempt,
    GITHUB_SHA: sha,
    GITHUB_REPOSITORY: 'example/cvg',
    GITHUB_WORKFLOW: 'Verify'
  })
  const state = {
    contract: CI_BAR_VERSION,
    scope: CI_BAR_SCOPE,
    runId: `run-${runId}-${attempt}`,
    candidateId: 'b'.repeat(64),
    nodeVersion: '22.23.2',
    npmVersion: '10.0.0',
    startedAt: '2026-09-27T00:00:00.000Z',
    candidateFiles: [],
    gates: []
  }
  fs.writeFileSync(
    path.join(artifactDir, 'runtime.txt'),
    `run ${state.runId};candidate ${state.candidateId}`
  )
  for (const gate of CI_BAR_GATES) {
    if (gate.id === 'artifacts') continue
    const entry = { id: gate.id, status: 'PASS', exitCode: 0 }
    if (gate.id !== 'runtime') {
      const log = Buffer.from(`runId=${state.runId}\ngate=${gate.id}\n`)
      const logPath = path.join(artifactDir, 'gates', `${gate.id}.log`)
      fs.mkdirSync(path.dirname(logPath), { recursive: true })
      fs.writeFileSync(logPath, log)
      Object.assign(entry, {
        runId: state.runId,
        candidateId: state.candidateId,
        nodeVersion: state.nodeVersion,
        outputFailures: [],
        log: `gates/${gate.id}.log`,
        logSha256: sha256(log)
      })
    }
    const artifactSha256 = {}
    for (const relativePath of gate.artifacts ?? []) {
      const output = path.join(
        artifactDir,
        'gate-outputs',
        gate.id,
        relativePath
      )
      const bytes = Buffer.from(`run=${state.runId};gate=${gate.id}`)
      fs.mkdirSync(path.dirname(output), { recursive: true })
      fs.writeFileSync(output, bytes)
      artifactSha256[relativePath] = sha256(bytes)
    }
    if (gate.id === 'e2e') {
      entry.executionId = 'synthetic-execution'
      entry.testCount = 12
      entry.testInventorySha256 = 'c'.repeat(64)
      entry.artifactSha256 = artifactSha256
    }
    state.gates.push(entry)
  }
  const steps = {}
  for (const entry of state.gates) {
    steps[gateStepId(entry.id)] = {
      outcome: 'success',
      conclusion: 'success',
      outputs: {
        seal: encodeGateSeal(
          createGateSeal({ id: entry.id, state, artifactDir, github })
        )
      }
    }
  }
  return { artifactDir, github, state, steps }
}

function failures(input) {
  return verifyGateSeals(input).failures
}

describe('CI gate seals outside the mutable artifact directory', () => {
  it('accepts exact gate outputs and binds every gate to the runner', () => {
    const input = fixture()
    const proof = verifyGateSeals(input)
    expect(proof.failures).toEqual([])
    expect(proof.verifiedGateCount).toBe(CI_BAR_GATES.length - 1)
    expect(proof.sealSetSha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('rejects coherent replacement of state, log and snapshots after sealing', () => {
    const input = fixture()
    const gate = input.state.gates.find((item) => item.id === 'e2e')
    gate.executionId = 'replacement-execution'
    const logPath = path.join(input.artifactDir, 'gates/e2e.log')
    const log = Buffer.from('runId=run-123-2;replacement=1')
    fs.writeFileSync(logPath, log)
    gate.logSha256 = sha256(log)
    for (const relativePath of Object.keys(gate.artifactSha256)) {
      const output = path.join(
        input.artifactDir,
        'gate-outputs/e2e',
        relativePath
      )
      const bytes = Buffer.from('replacement-report')
      fs.writeFileSync(output, bytes)
      gate.artifactSha256[relativePath] = sha256(bytes)
    }
    expect(failures(input)).toContain('provenance_seal_mismatch:e2e')
  })

  it('rejects isolated snapshot, log and state mutations', () => {
    for (const mutate of [
      (input) =>
        fs.appendFileSync(
          path.join(
            input.artifactDir,
            'gate-outputs/e2e/playwright-results.xml'
          ),
          'changed'
        ),
      (input) =>
        fs.appendFileSync(
          path.join(input.artifactDir, 'gates/e2e.log'),
          'changed'
        ),
      (input) => {
        input.state.gates.find((item) => item.id === 'e2e').executionId =
          'changed'
      }
    ]) {
      const input = fixture()
      mutate(input)
      expect(failures(input).some((item) => item.includes('e2e'))).toBe(true)
    }
  })

  it('rejects missing, invalid and replayed step outputs', () => {
    const input = fixture()
    delete input.steps.gate_e2e
    expect(failures(input)).toContain('provenance_step_missing_or_failed:e2e')

    const malformed = fixture()
    malformed.steps.gate_e2e.outputs.seal = ''
    expect(failures(malformed).some((item) => item.includes('e2e'))).toBe(true)

    const replay = fixture()
    const different = fixture({
      runId: '999',
      attempt: '4',
      sha: 'f'.repeat(40)
    })
    replay.steps.gate_e2e.outputs.seal = different.steps.gate_e2e.outputs.seal
    expect(failures(replay)).toContain('provenance_seal_mismatch:e2e')
  })

  it('rejects empty and partial runner step maps', () => {
    const input = fixture()
    expect(failures({ ...input, steps: {} })).toHaveLength(
      CI_BAR_GATES.length - 1
    )
    const partial = { gate_runtime: input.steps.gate_runtime }
    expect(failures({ ...input, steps: partial })).toContain(
      'provenance_step_missing_or_failed:e2e'
    )
  })

  it('rejects unregistered or duplicate gates in mutable state', () => {
    const extra = fixture()
    extra.state.gates.push({ id: 'unregistered', status: 'FAIL', exitCode: 1 })
    expect(failures(extra)).toContain('provenance_gate_inventory_mismatch')
    const duplicate = fixture()
    duplicate.state.gates.push({ ...duplicate.state.gates[1] })
    expect(failures(duplicate)).toContain('provenance_gate_inventory_mismatch')
  })

  it('anchors runtime bytes and initialization fields', () => {
    const changedRuntime = fixture()
    fs.appendFileSync(path.join(changedRuntime.artifactDir, 'runtime.txt'), 'x')
    expect(failures(changedRuntime)).toContain(
      'provenance_seal_mismatch:runtime'
    )
    const changedInitialState = fixture()
    changedInitialState.state.npmVersion = 'changed'
    expect(failures(changedInitialState)).toContain(
      'provenance_seal_mismatch:runtime'
    )
  })

  it('rejects changed, missing and extra downloaded evidence after finalization', () => {
    const input = fixture()
    const paths = ['runtime.txt', 'gates/e2e.log']
    const inventory = artifactInventory(input.artifactDir, paths)
    expect(verifyArtifactInventory(input.artifactDir, inventory, paths)).toBe(
      true
    )
    fs.appendFileSync(path.join(input.artifactDir, paths[1]), 'tampered')
    expect(verifyArtifactInventory(input.artifactDir, inventory, paths)).toBe(
      false
    )
    const extra = fixture()
    const original = artifactInventory(extra.artifactDir, paths)
    fs.writeFileSync(path.join(extra.artifactDir, 'extra.txt'), 'new')
    expect(
      verifyArtifactInventory(extra.artifactDir, original, [
        ...paths,
        'extra.txt'
      ])
    ).toBe(false)
    fs.rmSync(path.join(extra.artifactDir, paths[1]))
    expect(verifyArtifactInventory(extra.artifactDir, original, paths)).toBe(
      false
    )
  })

  it('rejects another run, attempt, SHA or candidate', () => {
    for (const mutate of [
      (input) => {
        input.github.runId = '124'
      },
      (input) => {
        input.github.attempt = '3'
      },
      (input) => {
        input.github.sha = 'c'.repeat(40)
      },
      (input) => {
        input.state.candidateId = 'd'.repeat(64)
      }
    ]) {
      const input = fixture()
      mutate(input)
      expect(failures(input).length).toBeGreaterThan(0)
    }
  })

  it('requires canonical bounded seal encoding', () => {
    const input = fixture()
    const seal = input.steps.gate_e2e.outputs.seal
    expect(decodeGateSeal(seal).gateId).toBe('e2e')
    expect(() => decodeGateSeal('')).toThrow()
    expect(() => decodeGateSeal(seal + 'x'.repeat(32_001))).toThrow()
  })

  it('runs the independent attestation verifier against the approved gate contract', () => {
    const input = fixture()
    const { env } = writeAttestationFixture(input)
    const run = () =>
      spawnSync('python3', ['-c', attestationPython()], {
        cwd: path.dirname(input.artifactDir),
        env,
        encoding: 'utf8'
      })
    expect(run().status).toBe(0)
  })

  it('rejects a manifest or state that does not declare the approved core-only scope', () => {
    const run = (input, env) =>
      spawnSync('python3', ['-c', attestationPython()], {
        cwd: path.dirname(input.artifactDir),
        env,
        encoding: 'utf8'
      })
    const widened = { ...CI_BAR_SCOPE, testScope: 'all' }

    const manifestOnly = fixture()
    const first = writeAttestationFixture(manifestOnly)
    first.manifest.scope = widened
    const manifestBytes = Buffer.from(JSON.stringify(first.manifest))
    fs.writeFileSync(
      path.join(manifestOnly.artifactDir, 'ci-bar-manifest.json'),
      manifestBytes
    )
    first.env.EXPECTED_SHA256 = sha256(manifestBytes)
    const manifestResult = run(manifestOnly, first.env)
    expect(manifestResult.status).toBe(1)
    expect(manifestResult.stderr).toContain('scope_mismatch')

    const stateOnly = fixture()
    const second = writeAttestationFixture(stateOnly)
    fs.writeFileSync(
      path.join(stateOnly.artifactDir, 'ci-bar-state.json'),
      JSON.stringify({ ...stateOnly.state, scope: widened })
    )
    second.manifest.artifactHashes = artifactInventory(
      stateOnly.artifactDir,
      second.manifest.artifactFiles
    )
    const stateBytes = Buffer.from(JSON.stringify(second.manifest))
    fs.writeFileSync(
      path.join(stateOnly.artifactDir, 'ci-bar-manifest.json'),
      stateBytes
    )
    second.env.EXPECTED_SHA256 = sha256(stateBytes)
    const stateResult = run(stateOnly, second.env)
    expect(stateResult.status).toBe(1)
    expect(stateResult.stderr).toContain('scope_mismatch')
  })

  it('rejects a coherent downloaded gate substitution against the fixed approved list', () => {
    const input = fixture()
    const { manifest, env } = writeAttestationFixture(input)
    const entry = input.state.gates.find((gate) => gate.id === 'diff')
    entry.id = 'unregistered'
    entry.log = 'gates/unregistered.log'
    fs.renameSync(
      path.join(input.artifactDir, 'gates/diff.log'),
      path.join(input.artifactDir, 'gates/unregistered.log')
    )
    const item = manifest.provenance.gateSeals.find(
      (seal) => seal.gateId === 'diff'
    )
    item.gateId = 'unregistered'
    item.seal.gateId = 'unregistered'
    item.seal.entrySha256 = sha256(canonical(entry))
    item.sealSha256 = sha256(encodeGateSeal(item.seal))
    manifest.provenance.sealSetSha256 = sha256(
      canonical(manifest.provenance.gateSeals)
    )
    fs.writeFileSync(
      path.join(input.artifactDir, 'ci-bar-state.json'),
      JSON.stringify(input.state)
    )
    const paths = manifest.artifactFiles.map((file) =>
      file === 'gates/diff.log' ? 'gates/unregistered.log' : file
    )
    paths.sort()
    manifest.artifactFiles = paths
    manifest.artifactHashes = artifactInventory(input.artifactDir, paths)
    const bytes = Buffer.from(JSON.stringify(manifest))
    fs.writeFileSync(
      path.join(input.artifactDir, 'ci-bar-manifest.json'),
      bytes
    )
    env.EXPECTED_SHA256 = sha256(bytes)
    const result = spawnSync('python3', ['-c', attestationPython()], {
      cwd: path.dirname(input.artifactDir),
      env,
      encoding: 'utf8'
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('seal_inventory_mismatch')
  })
})
