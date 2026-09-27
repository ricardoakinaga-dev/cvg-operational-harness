#!/usr/bin/env node
/**
 * PHASE 10 release gate. Runs every locally executable gate, records evidence
 * with hashes, and derives the certification decision mechanically.
 *
 * Usage: npm run certify
 */
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CertificationManifestSchema,
  GATE_ENVIRONMENT_EVIDENCE_MATRIX,
  GATE_EVIDENCE_MATRIX,
  PHASE10_REQUIRED_LOCAL_GATES,
  Phase10ResultSchema,
  buildCandidateRecord,
  collectCandidateFiles,
  computeCandidateId,
  computeDecision,
  diffCandidateFiles,
  parsePlaywrightSummary,
  parseVitestSummary,
  sha256Bytes
} from './lib/certification-rules.mjs'
import {
  CLOSURE_REGISTRY_PATH,
  computeCurrentFindings,
  issueClosureRegistry
} from './lib/finding-governance.mjs'
import { buildSkipInventory, loadSkipCatalog } from './lib/skip-governance.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const certificationDir = path.join(root, 'certification')
const logDir = path.join(certificationDir, 'logs')
fs.mkdirSync(logDir, { recursive: true })

const commands = [
  { id: 'format', command: 'npm run format:check' },
  { id: 'typecheck', command: 'npm run typecheck' },
  { id: 'lint', command: 'npm run lint' },
  { id: 'build', command: 'npm run build' },
  {
    id: 'unit',
    command:
      'npm test -- --reporter=default --reporter=json --outputFile=certification/unit-test-report.json'
  },
  {
    id: 'coverage',
    command:
      'npm run test:coverage && npm run coverage:critical && npm run mutation:guard'
  },
  { id: 'security', command: 'npm run audit:security' },
  { id: 'worker_startup', command: 'npm run test:worker:startup' },
  {
    id: 'postgres',
    command:
      'npm run test:postgres -- --reporter=default --reporter=json --outputFile=certification/postgres-test-report.json'
  },
  {
    id: 'e2e',
    command: 'node scripts/run-e2e-evidence.mjs'
  },
  { id: 'evals', command: 'npx tsx scripts/phase10-eval-report.ts' },
  {
    id: 'chaos',
    command:
      'npx vitest run packages/chaos --no-file-parallelism --maxWorkers=2 --reporter=json --outputFile=certification/chaos-report.json'
  },
  { id: 'load', command: 'npx tsx scripts/phase10-load.ts --events=10000' },
  { id: 'restore', command: 'npx tsx scripts/phase10-restore-check.ts' },
  { id: 'sbom', command: 'node scripts/generate-sbom.mjs' },
  { id: 'licenses', command: 'node scripts/check-licenses.mjs' }
]

function run(entry, { runId, candidateId }) {
  const startedAt = Date.now()
  // CI provides a disposable PostgreSQL service. Keep it available to every
  // certification subgate so unit/coverage/chaos cannot silently lower their
  // denominator through conditional integration skips.
  const environment = {
    ...process.env,
    CI: process.env.CI ?? 'true',
    CI_RUN_ID: runId,
    CI_CANDIDATE_ID: candidateId
  }
  const result = spawnSync(entry.command, {
    cwd: root,
    shell: true,
    encoding: 'utf8',
    timeout: 3_600_000,
    maxBuffer: 128 * 1024 * 1024,
    env: environment
  })
  const durationMs = Date.now() - startedAt
  const log =
    [
      `$ ${entry.command}`,
      `# runId=${runId} candidateId=${candidateId} gate=${entry.id} command=${entry.command}`,
      `# exitCode=${result.status ?? 1} durationMs=${durationMs}`,
      '',
      result.stdout ?? '',
      result.stderr ?? ''
    ]
      .join('\n')
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trimEnd() + '\n'
  const logPath = path.join(logDir, `${entry.id}.log`)
  fs.writeFileSync(logPath, log)
  const sha256 = createHash('sha256').update(log).digest('hex')
  let status = result.status === 0 ? 'PASS' : 'FAIL'
  if (entry.id === 'postgres' && !process.env.TEST_DATABASE_URL) {
    status = 'NOT_EXECUTED'
  }
  process.stderr.write(
    `[certify] ${status.padEnd(12)} ${entry.id} (exit ${result.status ?? 1}, ${durationMs}ms)\n`
  )
  return {
    id: entry.id,
    command: entry.command,
    status,
    exitCode: result.status ?? 1,
    durationMs,
    log: path.relative(root, logPath),
    logSha256: sha256
  }
}

function sha256File(relativePath) {
  const absolute = path.join(root, relativePath)
  const content = fs.readFileSync(absolute)
  return {
    sha256: createHash('sha256').update(content).digest('hex'),
    size: content.byteLength
  }
}

function deriveGateMetrics(entryId, logContent) {
  const entry =
    GATE_EVIDENCE_MATRIX[entryId] ?? GATE_ENVIRONMENT_EVIDENCE_MATRIX[entryId]
  if (!entry) return undefined
  if (entry.kind === 'vitest') {
    const files = parseVitestSummary(logContent, 'Test Files')
    const tests = parseVitestSummary(logContent, 'Tests')
    if (!files || !tests) return undefined
    return {
      filesPassed: files.passed,
      filesFailed: files.failed,
      filesSkipped: files.skipped,
      testsPassed: tests.passed,
      testsFailed: tests.failed,
      testsSkipped: tests.skipped
    }
  }
  if (entry.kind === 'playwright') {
    const files = parsePlaywrightSummary(logContent)
    if (!files) return undefined
    return {
      filesPassed: files.passed,
      filesFailed: files.failed + files.other,
      filesSkipped: files.skipped
    }
  }
  if (entry.kind === 'coverage') return readCoverage() ?? undefined
  return undefined
}

function skipJustificationFor(entryId, metrics) {
  const entry =
    GATE_EVIDENCE_MATRIX[entryId] ?? GATE_ENVIRONMENT_EVIDENCE_MATRIX[entryId]
  if (!entry || entry.skipPolicy !== 'declared' || !metrics) return undefined
  const skipped = (metrics.testsSkipped ?? 0) + (metrics.filesSkipped ?? 0)
  if (skipped === 0) return undefined
  if (entry.skipPolicy === 'catalogued') {
    return 'certification/skip-inventory.json is bound to the raw Vitest reports'
  }
  return 'conditional skips reported by the raw runner inventory; see certification log'
}

function readCoverage() {
  const summaryPath = path.join(root, 'coverage', 'coverage-summary.json')
  if (!fs.existsSync(summaryPath)) return null
  try {
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8'))
    return {
      statements: summary.total?.statements?.pct ?? null,
      branches: summary.total?.branches?.pct ?? null,
      functions: summary.total?.functions?.pct ?? null,
      lines: summary.total?.lines?.pct ?? null
    }
  } catch {
    return null
  }
}

function readChaosReport() {
  const reportPath = path.join(certificationDir, 'chaos-report.json')
  if (!fs.existsSync(reportPath)) {
    return { executed: 0, passed: 0, failed: 0, notExecuted: 16, records: [] }
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  const records = []
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      const match = /CHAOS-\d{2}/.exec(assertion.title ?? '')
      if (!match) continue
      records.push({
        id: match[0],
        title: assertion.title,
        status:
          assertion.status === 'passed'
            ? 'PASS'
            : assertion.status === 'failed'
              ? 'FAIL'
              : 'NOT_EXECUTED'
      })
    }
  }
  const unique = new Map()
  for (const record of records) {
    const existing = unique.get(record.id)
    if (!existing || record.status === 'FAIL') unique.set(record.id, record)
  }
  const values = [...unique.values()]
  return {
    executed: values.filter((record) => record.status !== 'NOT_EXECUTED')
      .length,
    passed: values.filter((record) => record.status === 'PASS').length,
    failed: values.filter((record) => record.status === 'FAIL').length,
    notExecuted: values.filter((record) => record.status === 'NOT_EXECUTED')
      .length
  }
}

function git(args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  return (result.stdout ?? '').trim()
}

const commit = git(['rev-parse', 'HEAD'])
const startedAt = new Date().toISOString()

const candidate = buildCandidateRecord({
  root,
  files: collectCandidateFiles(root)
})
const candidatePath = path.join(certificationDir, 'candidate-manifest.json')
fs.writeFileSync(candidatePath, `${JSON.stringify(candidate, null, 2)}\n`)
const runId =
  process.env.CI_RUN_ID ??
  `run-${candidate.candidateId.slice(0, 12)}-${Date.now().toString(36)}`
if (
  process.env.CI_CANDIDATE_ID &&
  process.env.CI_CANDIDATE_ID !== candidate.candidateId
) {
  throw new Error(
    `ci_candidate_mismatch:${process.env.CI_CANDIDATE_ID}:${candidate.candidateId}`
  )
}
issueClosureRegistry({
  root,
  candidateId: candidate.candidateId,
  runId
})
const computedFindings = computeCurrentFindings({
  root,
  candidateId: candidate.candidateId,
  runId,
  requireClosureRegistry: true
})
fs.writeFileSync(
  path.join(certificationDir, 'findings.json'),
  `${JSON.stringify(computedFindings, null, 2)}\n`
)
for (const generatedPath of [
  'certification/unit-test-report.json',
  'certification/postgres-test-report.json',
  'certification/e2e-test-report.json',
  'playwright-results.xml',
  'certification/skip-inventory.json',
  'certification/skip-negative-validation.json'
]) {
  const absolute = path.join(root, generatedPath)
  if (fs.existsSync(absolute)) fs.rmSync(absolute)
}
process.stderr.write(
  `[certify] candidate=${candidate.candidateId} run=${runId} files=${candidate.files.length} dirty=${candidate.git.dirty}\n`
)

const gates = []
const gateOutputs = new Map()
const gateEvidence = new Map()
const extraResultsByGate = {
  coverage: [
    'certification/critical-coverage.json',
    'certification/mutation-guard.json',
    'scripts/critical-coverage-manifest.json'
  ]
}
for (const entry of commands) {
  const record = run(entry, { runId, candidateId: candidate.candidateId })
  const logContent = fs.readFileSync(path.join(root, record.log), 'utf8')
  const matrix =
    GATE_EVIDENCE_MATRIX[entry.id] ?? GATE_ENVIRONMENT_EVIDENCE_MATRIX[entry.id]
  const evidence = [
    {
      path: record.log.split(path.sep).join('/'),
      sha256: sha256Bytes(Buffer.from(logContent)),
      size: Buffer.byteLength(logContent),
      kind: 'log',
      runId
    }
  ]
  for (const artifactPath of [
    ...(matrix?.results ?? []),
    ...(extraResultsByGate[entry.id] ?? [])
  ]) {
    const absolute = path.join(root, artifactPath)
    if (!fs.existsSync(absolute)) continue
    const content = fs.readFileSync(absolute)
    evidence.push({
      path: artifactPath,
      sha256: sha256Bytes(content),
      size: content.byteLength,
      kind: 'result',
      runId
    })
  }
  const metrics = deriveGateMetrics(entry.id, logContent)
  record.evidence = evidence
  if (metrics) record.metrics = metrics
  const skipJustification = skipJustificationFor(entry.id, metrics)
  if (skipJustification) record.skipJustification = skipJustification
  gates.push(record)
  gateEvidence.set(entry.id, evidence)
  gateOutputs.set(entry.id, logContent)
}

const skipInventory = buildSkipInventory({
  root,
  catalog: loadSkipCatalog(root),
  reports: [
    {
      gate: 'unit',
      path: 'certification/unit-test-report.json'
    },
    {
      gate: 'postgres',
      path: 'certification/postgres-test-report.json'
    },
    {
      gate: 'chaos',
      path: 'certification/chaos-report.json'
    },
    {
      gate: 'e2e',
      path: 'certification/e2e-test-report.json'
    }
  ],
  runId,
  candidateId: candidate.candidateId
})
const skipInventoryPath = 'certification/skip-inventory.json'
fs.writeFileSync(
  path.join(root, skipInventoryPath),
  `${JSON.stringify(skipInventory, null, 2)}\n`
)
const skipInventoryContent = fs.readFileSync(path.join(root, skipInventoryPath))
const unitGate = gates.find((gate) => gate.id === 'unit')
if (unitGate) {
  const evidence = {
    path: skipInventoryPath,
    sha256: sha256Bytes(skipInventoryContent),
    size: skipInventoryContent.byteLength,
    kind: 'result',
    runId
  }
  unitGate.evidence = [...(unitGate.evidence ?? []), evidence]
  gateEvidence.set('unit', [...(gateEvidence.get('unit') ?? []), evidence])
  if (skipInventory.verdict !== 'PASS') {
    unitGate.status = 'FAIL'
    unitGate.skipJustification = `skip inventory rejected: ${skipInventory.failures.join(', ')}`
  }
}

const driftFindings = diffCandidateFiles(
  candidate.files,
  collectCandidateFiles(root)
)
const candidateUnchanged = driftFindings.length === 0
if (!candidateUnchanged) {
  fs.writeFileSync(
    path.join(certificationDir, 'candidate-drift.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        kind: 'aaa-candidate-drift',
        candidateId: candidate.candidateId,
        currentCandidateId: computeCandidateId(collectCandidateFiles(root)),
        detectedAt: new Date().toISOString(),
        findings: driftFindings
      },
      null,
      2
    )}\n`
  )
  process.stderr.write(
    `[certify] CANDIDATE_DRIFT files=${driftFindings.length}; qualification denied\n`
  )
}

// findings.json is a materialized output for inspection and artifact hashing;
// the authoritative value is the snapshot computed above from the A21 report.
const findingsFile = computedFindings
const externalGates = JSON.parse(
  fs.readFileSync(path.join(certificationDir, 'external-gates.json'), 'utf8')
)
const evalReport = fs.existsSync(
  path.join(certificationDir, 'agent-eval-report.json')
)
  ? JSON.parse(
      fs.readFileSync(
        path.join(certificationDir, 'agent-eval-report.json'),
        'utf8'
      )
    )
  : null
const chaos = readChaosReport()
const readJsonIfExists = (relativePath) => {
  const absolute = path.join(root, relativePath)
  if (!fs.existsSync(absolute)) return null
  try {
    return JSON.parse(fs.readFileSync(absolute, 'utf8'))
  } catch {
    return null
  }
}
const load = readJsonIfExists('certification/load-report.json')
const restore = readJsonIfExists('certification/restore-report.json')

const { decision, certification, blockers } = computeDecision({
  gates,
  findings: findingsFile.findings,
  externalGates
})

const resultPayload = {
  schemaVersion: 1,
  phase: '10',
  kind: 'phase10-result',
  commit,
  candidate,
  runId,
  timestamp: new Date().toISOString(),
  scores: findingsFile.scores,
  findings: findingsFile.findings,
  gates,
  externalGates,
  metrics: {
    unit:
      gates.find((gate) => gate.id === 'unit')?.metrics ??
      parseVitestSummary(gateOutputs.get('unit') ?? '', 'Tests'),
    coverage: readCoverage(),
    evals: evalReport
      ? { verdict: evalReport.verdict, ...evalReport.metrics }
      : { verdict: 'NOT_EXECUTED' },
    chaos,
    load: load
      ? {
          events: load.events,
          processed: load.processed,
          loss: load.loss,
          duplicates: load.duplicates,
          throughputPerSecond: load.throughputPerSecond,
          latencyMs: load.latencyMs
        }
      : { verdict: 'NOT_EXECUTED' },
    restore: restore
      ? {
          integrity: restore.integrity,
          rpoRtoVerdict: restore.rpoRtoVerdict,
          restoreMs: restore.restoreMs
        }
      : { verdict: 'NOT_EXECUTED' }
  },
  certification,
  decision,
  remainingBlockers: blockers
}
Phase10ResultSchema.parse(resultPayload)

fs.writeFileSync(
  path.join(certificationDir, 'phase10-result.json'),
  `${JSON.stringify(resultPayload, null, 2)}\n`
)

const metadataPaths = [
  'certification/findings.json',
  'certification/external-gates.json',
  'certification/phase10-result.json',
  'certification/baseline.json',
  'certification/negative-validation.json',
  'certification/candidate-manifest.json',
  CLOSURE_REGISTRY_PATH
].filter((relativePath) => fs.existsSync(path.join(root, relativePath)))

const artifacts = metadataPaths.map((relativePath) => ({
  path: relativePath.split(path.sep).join('/'),
  ...sha256File(relativePath),
  producer: 'scripts/phase10-certify.mjs',
  recordedAt: new Date().toISOString()
}))
for (const record of gates) {
  for (const item of record.evidence ?? []) {
    artifacts.push({
      path: item.path,
      sha256: item.sha256,
      size: item.size,
      producer: 'scripts/phase10-certify.mjs',
      recordedAt: new Date().toISOString(),
      gateId: record.id
    })
  }
}

const manifestPayload = {
  schemaVersion: 1,
  phase: '10',
  kind: 'phase10-manifest',
  commit,
  timestamp: new Date().toISOString(),
  artifacts,
  decision,
  certification,
  candidateId: candidate.candidateId,
  candidateManifest: path
    .relative(root, candidatePath)
    .split(path.sep)
    .join('/'),
  runId
}
CertificationManifestSchema.parse(manifestPayload)
fs.writeFileSync(
  path.join(certificationDir, 'manifest.json'),
  `${JSON.stringify(manifestPayload, null, 2)}\n`
)

process.stderr.write(
  `[certify] started=${startedAt} decision=${decision} certification=${certification}\n`
)
for (const gate of gates) {
  process.stderr.write(`[certify] ${gate.status.padEnd(12)} ${gate.id}\n`)
}
if (
  !candidateUnchanged ||
  gates.some((gate) => gate.status === 'FAIL') ||
  PHASE10_REQUIRED_LOCAL_GATES.some(
    (id) => gates.find((gate) => gate.id === id)?.status !== 'PASS'
  )
) {
  process.exitCode = 1
}
