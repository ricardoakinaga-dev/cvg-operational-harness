#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { CI_BAR_GATES, CI_BAR_VERSION } from './ci-bar-contract.mjs'
import { validateRem21010ProofReport } from './rem21-010-postgres-proof-contract.mjs'
import { validateRem21011ProofReport } from './rem21-011-observability-proof-contract.mjs'
import { validateRem21014BrowserProofReport } from './rem21-014-browser-proof-contract.mjs'
import { validateRuntimeImageManifest } from './runtime-image-contract.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const command = args[0]
const rootArtifactDir = process.env.CI_ARTIFACT_DIR
  ? path.resolve(process.env.CI_ARTIFACT_DIR)
  : path.join(os.tmpdir(), 'cvg-ci', `local-${Date.now()}`)
const statePath = path.join(rootArtifactDir, 'ci-bar-state.json')
const manifestPath = path.join(rootArtifactDir, 'ci-bar-manifest.json')

const EXCLUDED_PREFIXES = [
  '.git/',
  'node_modules/',
  'coverage/',
  'test-results/',
  'playwright-report/',
  'blob-report/',
  '.gauntlet/',
  '.opencode/',
  'docs/04_audit/evidence/',
  'docs/phase4/evidence/',
  'apps/web/dist/',
  'certification/logs/',
  'certification/baseline-logs/',
  'certification/mutation-logs/',
  'certification/historical/'
]
const EXCLUDED_FILES = new Set([
  'certification/manifest.json',
  'certification/phase10-result.json',
  'certification/candidate-manifest.json',
  'certification/findings.json',
  'certification/candidate-qualification.json',
  'certification/sbom.cyclonedx.json',
  'certification/license-report.json',
  'certification/agent-eval-report.json',
  'certification/chaos-report.json',
  'certification/load-report.json',
  'certification/restore-report.json',
  'certification/rem21-010-postgres-proof.json',
  'certification/rem21-011-observability-proof.json',
  'certification/rem21-014-browser-proof.json',
  'certification/critical-coverage.json',
  'certification/mutation-guard.json',
  'certification/candidate-drift.json',
  'certification/unit-test-report.json',
  'certification/postgres-test-report.json',
  'certification/e2e-test-report.json',
  'certification/skip-inventory.json',
  'certification/skip-negative-validation.json',
  'certification/runtime-image.json',
  'certification/negative-validation.json',
  'certification/baseline.json',
  'docs/20_master_execution_log.md',
  'docs/30_backlog_master.md',
  'docs/99_runtime_state.md',
  'docs/03_build/0337_comprehensive_remediation_backlog.md'
])

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function normalizePath(value) {
  return value.split(path.sep).join('/')
}

function gateArtifactSnapshotPath(id, relativePath) {
  return path.join(
    rootArtifactDir,
    'gate-outputs',
    id,
    normalizePath(relativePath)
  )
}

function snapshotGateArtifacts(id, gate) {
  const failures = []
  for (const relativePath of gate?.artifacts ?? []) {
    const source = path.join(root, relativePath)
    if (!fs.existsSync(source)) continue
    const target = gateArtifactSnapshotPath(id, relativePath)
    try {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(source, target)
    } catch (error) {
      failures.push(
        `artifact_snapshot_failed:${relativePath}:${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
  return failures
}

function listFiles(directory, prefix = '') {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    const relative = path.join(prefix, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(absolute, relative))
    else files.push(normalizePath(relative))
  }
  return files
}

function isExcluded(relativePath) {
  const normalized = normalizePath(relativePath)
  const [rootSegment] = normalized.split('/')
  return (
    EXCLUDED_FILES.has(normalized) ||
    rootSegment?.startsWith('.gauntlet-') ||
    EXCLUDED_PREFIXES.some(
      (prefix) =>
        normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)
    )
  )
}

function candidateFiles() {
  const tracked = new Set(
    execFileSync('git', ['ls-files', '-z'], { cwd: root })
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
  )
  const listed = execFileSync(
    'git',
    ['ls-files', '-co', '--exclude-standard', '-z'],
    { cwd: root }
  )
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
  const files = []
  for (const relativePath of listed) {
    if (isExcluded(relativePath)) continue
    const absolutePath = path.join(root, relativePath)
    let stat
    try {
      stat = fs.lstatSync(absolutePath)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    const content = fs.readFileSync(absolutePath)
    files.push({
      path: normalizePath(relativePath),
      sha256: sha256(content),
      size: content.byteLength,
      tracked: tracked.has(relativePath)
    })
  }
  files.sort((left, right) => (left.path < right.path ? -1 : 1))
  return files
}

function candidateId(files) {
  return sha256(canonicalJson({ schemaVersion: 'aaa-candidate-v1', files }))
}

function readState() {
  if (!fs.existsSync(statePath)) {
    throw new Error(`ci_bar_not_initialized:${statePath}`)
  }
  return JSON.parse(fs.readFileSync(statePath, 'utf8'))
}

function writeState(state) {
  fs.mkdirSync(rootArtifactDir, { recursive: true })
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`)
}

function readJson(relativePath) {
  const absolute = path.join(root, relativePath)
  if (!fs.existsSync(absolute)) return undefined
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'))
  } catch {
    return undefined
  }
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`
}

function skippedTests(report) {
  const assertionStatuses = []
  for (const file of report?.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      assertionStatuses.push(assertion.status)
    }
  }
  if (assertionStatuses.length > 0) {
    return assertionStatuses.filter(
      (status) => status === 'skipped' || status === 'todo'
    ).length
  }
  if (Array.isArray(report?.suites)) {
    let count = 0
    const visit = (suites) => {
      for (const suite of suites ?? []) {
        for (const spec of suite.specs ?? []) {
          for (const test of spec.tests ?? []) {
            const resultStatuses = (test.results ?? []).map(
              (result) => result.status
            )
            if (
              ['skipped', 'pending', 'todo'].includes(test.status) ||
              ['skipped', 'pending', 'todo'].includes(test.outcome) ||
              resultStatuses.some((status) =>
                ['skipped', 'pending', 'todo'].includes(status)
              )
            ) {
              count += 1
            }
          }
        }
        visit(suite.suites)
      }
    }
    visit(report.suites)
    return count
  }
  return (
    Number(report?.numPendingTests ?? 0) + Number(report?.numTodoTests ?? 0)
  )
}

function validateGateOutputs(id, gate, startedMs, state) {
  const failures = []
  for (const relativePath of gate?.artifacts ?? []) {
    const absolute = path.join(root, relativePath)
    if (!fs.existsSync(absolute)) {
      failures.push(`missing_artifact:${relativePath}`)
      continue
    }
    const stat = fs.statSync(absolute)
    if (stat.size === 0) failures.push(`empty_artifact:${relativePath}`)
    const snapshot = gateArtifactSnapshotPath(id, relativePath)
    if (!fs.existsSync(snapshot)) {
      failures.push(`missing_run_artifact:${relativePath}`)
    } else {
      const snapshotStat = fs.statSync(snapshot)
      if (snapshotStat.size === 0) {
        failures.push(`empty_run_artifact:${relativePath}`)
      }
      if (snapshotStat.mtimeMs + 2000 < startedMs) {
        failures.push(`stale_run_artifact:${relativePath}`)
      }
    }
  }

  if (gate?.skipPolicy === 'none') {
    const reportPath = gate.artifacts?.find((item) => item.endsWith('.json'))
    const report = reportPath ? readJson(reportPath) : undefined
    if (!report) {
      failures.push(`required_report_missing:${id}`)
    } else if (skippedTests(report) > 0) {
      failures.push(`required_skip:${id}`)
    }
  }

  if (id === 'postgres') {
    const report = readJson('certification/postgres-test-report.json')
    if (
      !Array.isArray(report?.testResults) ||
      report.testResults.length === 0
    ) {
      failures.push('postgres_report_empty')
    }
  }

  if (id === 'postgres-proof') {
    const report = readJson('certification/rem21-010-postgres-proof.json')
    if (!report) {
      failures.push('postgres_proof_report_missing')
    } else {
      try {
        validateRem21010ProofReport(report, {
          runId: state.runId,
          candidateId: state.candidateId
        })
      } catch (error) {
        failures.push(
          `postgres_proof_invalid:${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  if (id === 'observability-proof') {
    const report = readJson('certification/rem21-011-observability-proof.json')
    if (!report) {
      failures.push('observability_proof_report_missing')
    } else {
      try {
        validateRem21011ProofReport(report, {
          runId: state.runId,
          candidateId: state.candidateId
        })
      } catch (error) {
        failures.push(
          `observability_proof_invalid:${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  if (id === 'browser-proof') {
    const report = readJson('certification/rem21-014-browser-proof.json')
    if (!report) {
      failures.push('browser_proof_report_missing')
    } else {
      try {
        validateRem21014BrowserProofReport(report, {
          runId: state.runId,
          candidateId: state.candidateId
        })
      } catch (error) {
        failures.push(
          `browser_proof_invalid:${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  if (id === 'image') {
    const report = readJson('certification/runtime-image.json')
    if (!report) {
      failures.push('runtime_image_report_missing')
    } else {
      try {
        validateRuntimeImageManifest(report, {
          runId: state.runId,
          candidateId: state.candidateId
        })
      } catch (error) {
        failures.push(
          `runtime_image_invalid:${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }

  if (id === 'certify') {
    const result = readJson('certification/phase10-result.json')
    const manifest = readJson('certification/manifest.json')
    const candidateManifest = readJson('certification/candidate-manifest.json')
    if (result?.runId !== state.runId)
      failures.push('certification_run_mismatch')
    if (manifest?.runId !== state.runId)
      failures.push('certification_manifest_run_mismatch')
    if (result?.candidate?.candidateId !== state.candidateId) {
      failures.push('certification_candidate_mismatch')
    }
    if (manifest?.candidateId !== state.candidateId) {
      failures.push('certification_manifest_candidate_mismatch')
    }
    if (candidateManifest?.candidateId !== state.candidateId) {
      failures.push('candidate_manifest_mismatch')
    }
    const certificationGateIds = [
      ['format', 'format'],
      ['typecheck', 'typecheck'],
      ['lint', 'lint'],
      ['build', 'build'],
      ['unit', 'unit'],
      ['coverage', 'coverage'],
      ['postgres', 'postgres'],
      ['worker-startup', 'worker_startup'],
      ['e2e', 'e2e'],
      ['evals', 'evals'],
      ['chaos', 'chaos'],
      ['load', 'load'],
      ['restore', 'restore'],
      ['sbom', 'sbom'],
      ['licenses', 'licenses'],
      ['security', 'security']
    ]
    for (const [barId, certificationId] of certificationGateIds) {
      const entry = result?.gates?.find(
        (candidate) => candidate.id === certificationId
      )
      if (!entry || entry.status !== 'PASS') {
        failures.push(`certification_gate_not_pass:${barId}`)
      }
    }
  }
  return failures
}

function ensureRunId() {
  return (
    process.env.CI_RUN_ID ||
    `run-local-${process.pid}-${Date.now().toString(36)}`
  )
}

function init() {
  fs.mkdirSync(path.join(rootArtifactDir, 'gates'), { recursive: true })
  const nodeVersion = process.versions.node
  const npmVersion = spawnSync('npm', ['--version'], {
    cwd: root,
    encoding: 'utf8'
  }).stdout.trim()
  const files = candidateFiles()
  const runId = ensureRunId()
  const state = {
    schemaVersion: 1,
    kind: 'cvg-ci-bar-run',
    contract: CI_BAR_VERSION,
    runId,
    candidateId: candidateId(files),
    nodeVersion,
    npmVersion,
    root,
    artifactDir: rootArtifactDir,
    startedAt: new Date().toISOString(),
    candidateFiles: files,
    gates: [
      {
        id: 'runtime',
        status: /^22\./.test(nodeVersion) ? 'PASS' : 'FAIL',
        exitCode: /^22\./.test(nodeVersion) ? 0 : 1
      }
    ]
  }
  writeState(state)
  fs.writeFileSync(
    path.join(rootArtifactDir, 'runtime.txt'),
    `node ${nodeVersion}\nnpm ${npmVersion}\nrun ${runId}\ncandidate ${state.candidateId}\n`
  )
  process.stdout.write(
    `${JSON.stringify({ runId, candidateId: state.candidateId, nodeVersion, artifactDir: rootArtifactDir })}\n`
  )
  if (!/^22\./.test(nodeVersion)) process.exitCode = 1
}

function runGate(id) {
  const state = readState()
  const gate = CI_BAR_GATES.find((entry) => entry.id === id)
  const commandEntry = gate?.command
  if (!commandEntry) {
    if (id === 'artifacts') return runArtifacts(state)
    throw new Error(`unknown_ci_bar_gate:${id}`)
  }
  const startedAt = new Date().toISOString()
  const startedMs = Date.now()
  let [bin, commandArgs] = commandEntry
  if (id === 'image') {
    const imageTag = `cvg-operational-harness:ci-${state.runId.replace(
      /[^A-Za-z0-9_.-]/g,
      '-'
    )}`
    bin = 'sh'
    commandArgs = [
      '-c',
      [
        `docker build --pull --target runtime --tag ${shellQuote(imageTag)} .`,
        `docker run --rm --network none --read-only --tmpfs /tmp --cap-drop=ALL --security-opt no-new-privileges ${shellQuote(imageTag)} node scripts/runtime-image-smoke.mjs`,
        `node scripts/runtime-image-record.mjs --tag ${shellQuote(imageTag)} --run-id ${shellQuote(state.runId)} --candidate-id ${shellQuote(state.candidateId)}`
      ].join(' && ')
    ]
  }
  const env = {
    ...process.env,
    CI_RUN_ID: state.runId,
    CI_CANDIDATE_ID: state.candidateId,
    CI_ARTIFACT_DIR: rootArtifactDir
  }
  const result = spawnSync(bin, commandArgs, {
    cwd: root,
    env,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
    timeout: 3_600_000
  })
  let exitCode = result.status ?? 1
  const snapshotFailures = exitCode === 0 ? snapshotGateArtifacts(id, gate) : []
  const outputFailures =
    exitCode === 0
      ? [
          ...snapshotFailures,
          ...validateGateOutputs(id, gate, startedMs, state)
        ]
      : snapshotFailures
  if (outputFailures.length > 0) exitCode = 1
  const log = [
    `$ ${bin} ${commandArgs.join(' ')}`,
    `runId=${state.runId}`,
    `candidateId=${state.candidateId}`,
    `node=${state.nodeVersion}`,
    `startedAt=${startedAt}`,
    `exitCode=${exitCode}`,
    '',
    result.stdout ?? '',
    result.stderr ?? '',
    outputFailures.length > 0
      ? `outputFailures=${outputFailures.join(',')}`
      : ''
  ].join('\n')
  const logPath = path.join(rootArtifactDir, 'gates', `${id}.log`)
  fs.writeFileSync(logPath, log)
  const entry = {
    id,
    command: `${bin} ${commandArgs.join(' ')}`,
    status: exitCode === 0 ? 'PASS' : 'FAIL',
    exitCode,
    durationMs: Date.now() - startedMs,
    startedAt,
    finishedAt: new Date().toISOString(),
    nodeVersion: state.nodeVersion,
    runId: state.runId,
    candidateId: state.candidateId,
    outputFailures,
    log: normalizePath(path.relative(rootArtifactDir, logPath)),
    logSha256: sha256(Buffer.from(log))
  }
  state.gates = [...state.gates.filter((gate) => gate.id !== id), entry]
  writeState(state)
  process.stdout.write(`${JSON.stringify(entry)}\n`)
  process.exitCode = exitCode
}

function runArtifacts(state) {
  const files = candidateFiles()
  const currentCandidateId = candidateId(files)
  const expected = new Set(CI_BAR_GATES.map((gate) => gate.id))
  const observed = new Map(state.gates.map((gate) => [gate.id, gate]))
  const failures = []
  for (const id of expected) {
    if (id === 'artifacts') continue
    const entry = observed.get(id)
    if (!entry) failures.push(`missing_gate:${id}`)
    else if (entry.status !== 'PASS') failures.push(`gate_not_pass:${id}`)
  }
  if (currentCandidateId !== state.candidateId) failures.push('candidate_drift')
  const runtimeFiles = fs.readdirSync(path.join(rootArtifactDir, 'gates'))
  for (const id of CI_BAR_GATES.map((gate) => gate.id).filter(
    (id) => !['runtime', 'artifacts'].includes(id)
  )) {
    if (!runtimeFiles.includes(`${id}.log`)) {
      failures.push(`missing_gate_log:${id}`)
    }
  }
  for (const gate of CI_BAR_GATES) {
    for (const relativePath of gate.artifacts ?? []) {
      if (!fs.existsSync(gateArtifactSnapshotPath(gate.id, relativePath))) {
        failures.push(`missing_run_artifact:${gate.id}:${relativePath}`)
      }
    }
  }
  const artifactEntry = {
    id: 'artifacts',
    command: 'ci-bar finalize',
    status: 'PASS',
    exitCode: 0,
    durationMs: 0,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    nodeVersion: state.nodeVersion,
    runId: state.runId,
    candidateId: state.candidateId,
    log: 'ci-bar-manifest.json'
  }
  state.gates = [
    ...state.gates.filter((gate) => gate.id !== 'artifacts'),
    artifactEntry
  ]
  const manifest = {
    schemaVersion: 1,
    kind: 'cvg-ci-bar-manifest',
    contract: CI_BAR_VERSION,
    runId: state.runId,
    candidateId: state.candidateId,
    currentCandidateId,
    nodeVersion: state.nodeVersion,
    npmVersion: state.npmVersion,
    startedAt: state.startedAt,
    finishedAt: new Date().toISOString(),
    gates: state.gates,
    candidateFileCount: state.candidateFiles.length,
    artifactFiles: listFiles(rootArtifactDir)
      .filter((file) => file !== 'ci-bar-manifest.json')
      .sort(),
    failures,
    verdict: failures.length === 0 ? 'PASS' : 'FAIL'
  }
  if (failures.length > 0) {
    artifactEntry.status = 'FAIL'
    artifactEntry.exitCode = 1
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(manifest)}\n`)
  process.exitCode = failures.length === 0 ? 0 : 1
}

function main() {
  if (command === 'init') return init()
  if (command === 'gate') return runGate(args[1])
  if (command === 'finalize') return runArtifacts(readState())
  throw new Error('usage: ci-bar.mjs init | gate <id> | finalize')
}

try {
  main()
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  )
  process.exitCode = 1
}
