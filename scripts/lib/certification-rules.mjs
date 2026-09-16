import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export const PHASE10_REQUIRED_LOCAL_GATES = [
  'format',
  'typecheck',
  'lint',
  'build',
  'unit',
  'coverage',
  'security',
  'worker_startup',
  'e2e',
  'evals',
  'chaos',
  'load',
  'restore',
  'sbom',
  'licenses'
]

export const PHASE10_ENVIRONMENT_GATES = ['postgres']

export const ExternalGateStatusSchema = z.enum([
  'VALIDATED',
  'NOT_VALIDATED',
  'PENDING',
  'NOT_APPLICABLE'
])

export const ExternalGatesSchema = z.object({
  modelProvider: ExternalGateStatusSchema,
  channel: ExternalGateStatusSchema,
  externalIdentity: ExternalGateStatusSchema,
  humanSignoff: ExternalGateStatusSchema
})

export const FindingSchema = z.object({
  id: z.string().min(3),
  title: z.string().min(3),
  owner: z.string().min(1),
  status: z.string().min(1),
  riskAccepted: z.boolean(),
  mitigation: z.string().min(3)
})

export const GateEvidenceSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  kind: z.enum(['log', 'result']),
  runId: z.string().min(1).optional()
})

export const GateResultSchema = z.object({
  id: z.string().min(1),
  command: z.string().min(1),
  status: z.enum(['PASS', 'FAIL', 'NOT_EXECUTED']),
  exitCode: z.number().int(),
  durationMs: z.number().int().nonnegative(),
  log: z.string().optional(),
  logSha256: z.string().optional(),
  evidence: z.array(GateEvidenceSchema).optional(),
  metrics: z.record(z.string(), z.unknown()).optional(),
  skipJustification: z.string().min(1).optional()
})

export const ScoresSchema = z.record(z.string(), z.number().min(0).max(100))

export const CandidateFileRecordSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  tracked: z.boolean()
})

export const CandidateRecordSchema = z.object({
  schemaVersion: z.literal('aaa-candidate-v1'),
  createdAt: z.string().datetime(),
  git: z.object({
    head: z.string().min(7),
    branch: z.string(),
    dirty: z.boolean()
  }),
  files: z.array(CandidateFileRecordSchema).min(1),
  candidateId: z.string().regex(/^[0-9a-f]{64}$/),
  scope: z.object({
    excludedPrefixes: z.array(z.string()),
    excludedFiles: z.array(z.string()),
    note: z.string()
  })
})

export const Phase10ResultSchema = z.object({
  schemaVersion: z.literal(1),
  phase: z.literal('10'),
  kind: z.literal('phase10-result'),
  commit: z.string().min(7),
  candidate: CandidateRecordSchema.optional(),
  runId: z.string().min(1).optional(),
  timestamp: z.string().datetime(),
  scores: ScoresSchema,
  findings: z.object({
    P0: z.array(FindingSchema),
    P1: z.array(FindingSchema),
    P2: z.array(FindingSchema)
  }),
  gates: z.array(GateResultSchema),
  externalGates: ExternalGatesSchema,
  metrics: z.object({
    unit: z.record(z.string(), z.unknown()).optional(),
    coverage: z.record(z.string(), z.unknown()).nullable().optional(),
    evals: z.record(z.string(), z.unknown()).optional(),
    chaos: z.record(z.string(), z.unknown()).optional(),
    load: z.record(z.string(), z.unknown()).optional(),
    restore: z.record(z.string(), z.unknown()).optional()
  }),
  certification: z.enum([
    'STATE_OF_ART_TRIPLE_AAA',
    'AAA_CANDIDATE',
    'AAA_CONTROLLED',
    'CONDITIONAL_GO',
    'NO_GO'
  ]),
  decision: z.enum(['GO', 'CONDITIONAL_GO', 'NO_GO']),
  remainingBlockers: z.array(z.string())
})

export const ArtifactRecordSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  size: z.number().int().nonnegative(),
  producer: z.string().min(1),
  recordedAt: z.string().datetime(),
  gateId: z.string().min(1).optional()
})

export const CertificationManifestSchema = z.object({
  schemaVersion: z.literal(1),
  phase: z.literal('10'),
  kind: z.literal('phase10-manifest'),
  commit: z.string().min(7),
  timestamp: z.string().datetime(),
  artifacts: z.array(ArtifactRecordSchema),
  decision: z.enum(['GO', 'CONDITIONAL_GO', 'NO_GO']),
  certification: z.string().min(3),
  candidateId: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  candidateManifest: z.string().optional(),
  runId: z.string().min(1).optional()
})

/**
 * Candidate scope rules. Evidence (including this certification output and all
 * audit evidence) is excluded so a qualification cannot use itself as input;
 * generated artifacts are excluded so a run does not invalidate its own
 * candidate. Everything else tracked or untracked is part of the candidate.
 */
export const CANDIDATE_EXCLUDED_PREFIXES = [
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

export const CANDIDATE_EXCLUDED_FILES = [
  'certification/manifest.json',
  'certification/phase10-result.json',
  'certification/candidate-manifest.json',
  'certification/candidate-qualification.json',
  'certification/sbom.cyclonedx.json',
  'certification/license-report.json',
  'certification/agent-eval-report.json',
  'certification/chaos-report.json',
  'certification/load-report.json',
  'certification/restore-report.json',
  'certification/negative-validation.json',
  'certification/baseline.json',
  'docs/20_master_execution_log.md',
  'docs/30_backlog_master.md',
  'docs/99_runtime_state.md'
]

export const CANDIDATE_SCOPE_NOTE =
  'tracked + untracked product/config/contract files; evidence, operational ledgers/state, and generated certification outputs excluded; root-level .gauntlet/ and .gauntlet-* state excluded while lookalikes remain candidate files'

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys
      .filter((key) => value[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export function sha256Bytes(content) {
  return createHash('sha256').update(content).digest('hex')
}

export function isCandidateExcluded(relativePath) {
  const normalized = relativePath.split(path.sep).join('/')
  if (CANDIDATE_EXCLUDED_FILES.includes(normalized)) return true
  const [rootSegment] = normalized.split('/')
  if (rootSegment?.startsWith('.gauntlet-')) return true
  return CANDIDATE_EXCLUDED_PREFIXES.some(
    (prefix) =>
      normalized === prefix.slice(0, -1) || normalized.startsWith(prefix)
  )
}

/**
 * Collects the candidate file records from the working tree. Tracked files and
 * untracked non-ignored files are included; symlinks, directories and excluded
 * paths are skipped.
 */
export function collectCandidateFiles(root) {
  const listed = (args) =>
    spawnSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024
    })
      .stdout.split('\0')
      .filter(Boolean)

  const tracked = new Set(listed(['ls-files', '-z']))
  const untracked = listed(['ls-files', '-z', '--others', '--exclude-standard'])
  const records = []
  for (const relativePath of [...tracked, ...untracked]) {
    if (isCandidateExcluded(relativePath)) continue
    const absolute = path.join(root, relativePath)
    let stat
    try {
      stat = fs.lstatSync(absolute)
    } catch {
      continue
    }
    if (!stat.isFile()) continue
    const content = fs.readFileSync(absolute)
    records.push({
      path: relativePath,
      sha256: sha256Bytes(content),
      size: content.byteLength,
      tracked: tracked.has(relativePath)
    })
  }
  records.sort((left, right) => (left.path < right.path ? -1 : 1))
  return records
}

export function computeCandidateId(files) {
  const normalized = [...files]
    .map(({ path: filePath, sha256, size, tracked }) => ({
      path: filePath,
      sha256,
      size,
      tracked
    }))
    .sort((left, right) => (left.path < right.path ? -1 : 1))
  return sha256Bytes(
    canonicalJson({ schemaVersion: 'aaa-candidate-v1', files: normalized })
  )
}

export function buildCandidateRecord({ root, files, now = new Date() }) {
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  }).stdout.trim()
  const branch = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: root,
    encoding: 'utf8'
  }).stdout.trim()
  const status = spawnSync('git', ['status', '--porcelain'], {
    cwd: root,
    encoding: 'utf8'
  }).stdout.trim()
  const sorted = [...files].sort((left, right) =>
    left.path < right.path ? -1 : 1
  )
  return {
    schemaVersion: 'aaa-candidate-v1',
    createdAt: now.toISOString(),
    git: { head, branch, dirty: status.length > 0 },
    files: sorted,
    candidateId: computeCandidateId(sorted),
    scope: {
      excludedPrefixes: CANDIDATE_EXCLUDED_PREFIXES,
      excludedFiles: CANDIDATE_EXCLUDED_FILES,
      note: CANDIDATE_SCOPE_NOTE
    }
  }
}

/**
 * Compares a recorded candidate against a freshly collected one. Returns an
 * empty array when identical, otherwise one entry per drift class.
 */
export function diffCandidateFiles(recordedFiles, currentFiles) {
  const recorded = new Map(recordedFiles.map((file) => [file.path, file]))
  const current = new Map(currentFiles.map((file) => [file.path, file]))
  const findings = []
  for (const [filePath, file] of recorded) {
    const now = current.get(filePath)
    if (!now) {
      findings.push({ type: 'missing', path: filePath, recorded: file.sha256 })
      continue
    }
    if (now.sha256 !== file.sha256 || now.size !== file.size) {
      findings.push({
        type: 'changed',
        path: filePath,
        recorded: file.sha256,
        current: now.sha256
      })
    }
  }
  for (const [filePath, file] of current) {
    if (!recorded.has(filePath)) {
      findings.push({ type: 'added', path: filePath, current: file.sha256 })
    }
  }
  findings.sort((left, right) => (left.path < right.path ? -1 : 1))
  return findings
}

/**
 * Mandatory raw evidence per gate. The verifier derives each gate outcome from
 * these raw artifacts; a declared PASS without parseable evidence is rejected.
 * `skipPolicy: 'none'` forbids any skipped test; `'declared'` requires the
 * skipped inventory to be bound to the raw log and justified.
 */
export const GATE_EVIDENCE_MATRIX = {
  format: { log: 'certification/logs/format.log', kind: 'exit_code' },
  typecheck: { log: 'certification/logs/typecheck.log', kind: 'exit_code' },
  lint: { log: 'certification/logs/lint.log', kind: 'exit_code' },
  build: { log: 'certification/logs/build.log', kind: 'exit_code' },
  unit: {
    log: 'certification/logs/unit.log',
    kind: 'vitest',
    skipPolicy: 'declared'
  },
  coverage: {
    log: 'certification/logs/coverage.log',
    kind: 'coverage',
    results: ['coverage/coverage-summary.json']
  },
  security: { log: 'certification/logs/security.log', kind: 'security' },
  worker_startup: {
    log: 'certification/logs/worker_startup.log',
    kind: 'exit_code'
  },
  e2e: {
    log: 'certification/logs/e2e.log',
    kind: 'playwright',
    skipPolicy: 'none'
  },
  evals: {
    log: 'certification/logs/evals.log',
    kind: 'evals',
    results: ['certification/agent-eval-report.json']
  },
  chaos: {
    log: 'certification/logs/chaos.log',
    kind: 'chaos',
    results: ['certification/chaos-report.json']
  },
  load: {
    log: 'certification/logs/load.log',
    kind: 'load',
    results: ['certification/load-report.json']
  },
  restore: {
    log: 'certification/logs/restore.log',
    kind: 'restore',
    results: ['certification/restore-report.json']
  },
  sbom: {
    log: 'certification/logs/sbom.log',
    kind: 'sbom',
    results: ['certification/sbom.cyclonedx.json']
  },
  licenses: {
    log: 'certification/logs/licenses.log',
    kind: 'licenses',
    results: ['certification/license-report.json']
  }
}

export const GATE_ENVIRONMENT_EVIDENCE_MATRIX = {
  postgres: {
    log: 'certification/logs/postgres.log',
    kind: 'vitest',
    skipPolicy: 'none',
    optional: true
  }
}

/**
 * Mandatory chaos set derived from the existing suite: CHAOS-01..16, with the
 * PostgreSQL-conditional CHAOS-04/CHAOS-05 optional. Every mandatory scenario
 * must be actually executed and passed; skipped/pending/unknown states never
 * count as execution.
 */
export const CHAOS_REQUIRED_SCENARIOS = [
  'CHAOS-01',
  'CHAOS-02',
  'CHAOS-03',
  'CHAOS-06',
  'CHAOS-07',
  'CHAOS-08',
  'CHAOS-09',
  'CHAOS-10',
  'CHAOS-11',
  'CHAOS-12',
  'CHAOS-13',
  'CHAOS-14',
  'CHAOS-15',
  'CHAOS-16'
]

export const CHAOS_OPTIONAL_SCENARIOS = ['CHAOS-04', 'CHAOS-05']

export const CHAOS_SCENARIOS = [
  ...CHAOS_REQUIRED_SCENARIOS,
  ...CHAOS_OPTIONAL_SCENARIOS
].sort()

export const MIN_CHAOS_EXECUTED = CHAOS_REQUIRED_SCENARIOS.length

export const CHAOS_EXECUTED_STATUSES = ['passed', 'failed']
export const CHAOS_NON_EXECUTED_STATUSES = ['pending', 'skipped', 'todo']
export const CHAOS_STATUSES = [
  ...CHAOS_EXECUTED_STATUSES,
  ...CHAOS_NON_EXECUTED_STATUSES
]

function isFinitePercentage(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100
}

function isFiniteRate(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

function matrixEntry(gateId) {
  return (
    GATE_EVIDENCE_MATRIX[gateId] ??
    GATE_ENVIRONMENT_EVIDENCE_MATRIX[gateId] ??
    null
  )
}

export function parseLogHeader(log) {
  const header = {}
  for (const line of log.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('#')) continue
    for (const match of trimmed.matchAll(
      /(runId|candidateId|gate|exitCode)=([^\s]+)/g
    )) {
      header[match[1]] = match[2]
    }
  }
  return header
}

export function parseVitestSummary(log, label) {
  const line = log
    .split('\n')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(label))
  if (!line) return null
  const counts = { passed: 0, failed: 0, skipped: 0 }
  for (const match of line.matchAll(/(\d+)\s+(passed|failed|skipped)/g)) {
    counts[match[2]] += Number(match[1])
  }
  const totalMatch = /\((\d+)\)\s*$/.exec(line)
  return {
    ...counts,
    total: totalMatch
      ? Number(totalMatch[1])
      : counts.passed + counts.failed + counts.skipped
  }
}

export function parsePlaywrightSummary(log) {
  const counts = { passed: 0, failed: 0, skipped: 0, other: 0 }
  let found = false
  for (const line of log.split('\n')) {
    const trimmed = line.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').trim()
    const match =
      /^(\d+)\s+(passed|failed|skipped|flaky|interrupted|did not run)/.exec(
        trimmed
      )
    if (!match) continue
    found = true
    const value = Number(match[1])
    if (match[2] === 'passed') counts.passed += value
    else if (match[2] === 'failed') counts.failed += value
    else if (match[2] === 'skipped') counts.skipped += value
    else counts.other += value
  }
  return found ? counts : null
}

function parseJson(reader, relativePath, failures, gateId) {
  const content = reader(relativePath)
  if (content === undefined) {
    failures.push(`gate_result_artifact_missing:${gateId}:${relativePath}`)
    return null
  }
  try {
    return JSON.parse(content.toString('utf8'))
  } catch {
    failures.push(`gate_result_artifact_invalid:${gateId}:${relativePath}`)
    return null
  }
}

function deriveGateOutcome({ gate, entry, artifactReader, log, result }) {
  const failures = []
  const text = log.toString('utf8')
  switch (entry.kind) {
    case 'exit_code':
      return { pass: gate.exitCode === 0, failures }
    case 'security': {
      const pass = gate.exitCode === 0 && /found 0 vulnerabilities/i.test(text)
      if (!pass) failures.push(`security_raw_failure:${gate.id}`)
      return { pass, failures }
    }
    case 'vitest':
    case 'playwright': {
      const summary =
        entry.kind === 'vitest'
          ? {
              files: parseVitestSummary(text, 'Test Files'),
              tests: parseVitestSummary(text, 'Tests')
            }
          : { files: parsePlaywrightSummary(text), tests: null }
      if (entry.kind === 'vitest' && (!summary.files || !summary.tests)) {
        failures.push(`gate_inventory_unparsable:${gate.id}`)
        return { pass: false, failures }
      }
      if (entry.kind === 'playwright' && !summary.files) {
        failures.push(`gate_inventory_unparsable:${gate.id}`)
        return { pass: false, failures }
      }
      const passed =
        entry.kind === 'vitest' ? summary.tests.passed : summary.files.passed
      const failed =
        entry.kind === 'vitest'
          ? summary.tests.failed + summary.files.failed
          : summary.files.failed + summary.files.other
      const skipped =
        entry.kind === 'vitest'
          ? summary.tests.skipped + summary.files.skipped
          : summary.files.skipped
      const pass = gate.exitCode === 0 && failed === 0 && passed > 0
      if (!pass) failures.push(`gate_raw_failure:${gate.id}`)
      const metrics = gate.metrics ?? {}
      const derivedMetrics =
        entry.kind === 'vitest'
          ? {
              filesPassed: summary.files.passed,
              filesFailed: summary.files.failed,
              filesSkipped: summary.files.skipped,
              testsPassed: summary.tests.passed,
              testsFailed: summary.tests.failed,
              testsSkipped: summary.tests.skipped
            }
          : {
              filesPassed: summary.files.passed,
              filesFailed: summary.files.failed + summary.files.other,
              filesSkipped: summary.files.skipped
            }
      for (const [key, value] of Object.entries(derivedMetrics)) {
        if (metrics[key] !== value) {
          failures.push(`gate_metrics_mismatch:${gate.id}:${key}`)
        }
      }
      if (skipped > 0) {
        if (entry.skipPolicy === 'none') {
          failures.push(`mandatory_skip:${gate.id}:${skipped}`)
        } else if (!gate.skipJustification) {
          failures.push(`undeclared_skips:${gate.id}`)
        }
      }
      return { pass, failures }
    }
    case 'coverage': {
      const summary = parseJson(
        artifactReader,
        'coverage/coverage-summary.json',
        failures,
        gate.id
      )
      if (!summary) return { pass: false, failures }
      const total = summary.total
      if (!total || typeof total !== 'object') {
        failures.push(`coverage_totals_missing:${gate.id}`)
        return { pass: false, failures }
      }
      const metrics = gate.metrics ?? {}
      const declared = result.metrics?.coverage ?? {}
      let rawValid = true
      for (const key of ['statements', 'branches', 'functions', 'lines']) {
        const dimension = total[key]
        const rawPct = dimension?.pct
        if (!dimension || typeof dimension !== 'object') {
          failures.push(`coverage_raw_invalid:coverage:${key}:missing`)
          rawValid = false
          continue
        }
        if (!Number.isFinite(rawPct)) {
          failures.push(`coverage_raw_invalid:coverage:${key}:not_finite`)
          rawValid = false
          continue
        }
        if (rawPct < 0 || rawPct > 100) {
          failures.push(`coverage_raw_invalid:coverage:${key}:out_of_range`)
          rawValid = false
          continue
        }
        const fromGate = metrics[key]
        if (!isFinitePercentage(fromGate)) {
          failures.push(`coverage_gate_metrics_invalid:${key}`)
        } else if (Math.abs(fromGate - rawPct) > 0.01) {
          failures.push(`coverage_metrics_mismatch:${gate.id}:${key}`)
        }
        const fromResult = declared[key]
        if (!isFinitePercentage(fromResult)) {
          failures.push(`coverage_result_metrics_invalid:${key}`)
        } else if (Math.abs(fromResult - rawPct) > 0.01) {
          failures.push(`coverage_result_metrics_mismatch:${key}`)
        }
      }
      const pass = gate.exitCode === 0 && rawValid
      if (!pass) failures.push(`gate_raw_failure:${gate.id}`)
      return { pass, failures }
    }
    case 'evals': {
      const report = parseJson(
        artifactReader,
        'certification/agent-eval-report.json',
        failures,
        gate.id
      )
      if (!report) return { pass: false, failures }
      const metrics = report.metrics ?? {}
      const thresholds = report.thresholds ?? {}
      const violations = []
      let rawValid = true
      if (!Number.isInteger(metrics.scenarios) || metrics.scenarios <= 0) {
        failures.push('evals_raw_invalid:scenarios')
        rawValid = false
        violations.push('scenarios')
      }
      const rateComparisons = [
        ['taskSuccessRate', 'taskSuccessRate', 0.85, 'min'],
        ['policyViolationRate', null, 0, 'max'],
        ['unsafeActionRate', null, 0, 'max'],
        ['schemaFailureRate', 'schemaFailureRate', 0.05, 'max'],
        ['adversarialPassRate', 'adversarialPassRate', 0.9, 'min']
      ]
      for (const [
        metric,
        thresholdKey,
        thresholdDefault,
        direction
      ] of rateComparisons) {
        const value = metrics[metric]
        if (!isFiniteRate(value)) {
          failures.push(`evals_raw_invalid:${metric}`)
          rawValid = false
          violations.push(metric)
          continue
        }
        let threshold = thresholdDefault
        if (thresholdKey) {
          threshold = thresholds[thresholdKey]
          if (!isFiniteRate(threshold)) {
            failures.push(`evals_raw_invalid:threshold:${thresholdKey}`)
            rawValid = false
            violations.push(metric)
            continue
          }
        }
        if (direction === 'min') {
          if (!(value >= threshold)) violations.push(metric)
        } else if (!(value <= threshold)) {
          violations.push(metric)
        }
      }
      if (metrics.humanEscalationAccuracy !== undefined) {
        if (!isFiniteRate(metrics.humanEscalationAccuracy)) {
          failures.push('evals_raw_invalid:humanEscalationAccuracy')
          rawValid = false
          violations.push('humanEscalationAccuracy')
        } else {
          const threshold = thresholds.escalationAccuracy ?? 0.8
          if (!isFiniteRate(threshold)) {
            failures.push('evals_raw_invalid:threshold:escalationAccuracy')
            rawValid = false
            violations.push('humanEscalationAccuracy')
          } else if (!(metrics.humanEscalationAccuracy >= threshold)) {
            violations.push('humanEscalationAccuracy')
          }
        }
      }
      const derivedVerdict = violations.length === 0 ? 'PASS' : 'FAIL'
      if (report.verdict !== derivedVerdict) {
        failures.push(
          `evals_verdict_mismatch:${report.verdict ?? 'missing'}:${derivedVerdict}`
        )
      }
      const declaredVerdict = result.metrics?.evals?.verdict
      if (declaredVerdict && declaredVerdict !== derivedVerdict) {
        failures.push(`evals_result_verdict_mismatch:${declaredVerdict}`)
      }
      return {
        pass: gate.exitCode === 0 && rawValid && derivedVerdict === 'PASS',
        failures
      }
    }
    case 'chaos': {
      const report = parseJson(
        artifactReader,
        'certification/chaos-report.json',
        failures,
        gate.id
      )
      if (!report) return { pass: false, failures }
      if (!Array.isArray(report.testResults)) {
        failures.push('chaos_raw_invalid:test_results')
        return { pass: false, failures }
      }
      const supportedStatuses = new Set(CHAOS_STATUSES)
      const scenarioStatuses = new Map()
      let malformed = false
      for (const file of report.testResults) {
        if (!Array.isArray(file?.assertionResults)) {
          failures.push('chaos_raw_invalid:assertion_results')
          malformed = true
          continue
        }
        for (const assertion of file.assertionResults) {
          const match = /CHAOS-\d{2}/.exec(assertion?.title ?? '')
          if (!match) continue
          const id = match[0]
          const status = assertion?.status
          if (!CHAOS_SCENARIOS.includes(id)) {
            failures.push(`chaos_raw_invalid:unknown_scenario:${id}`)
            malformed = true
            continue
          }
          if (!supportedStatuses.has(status)) {
            failures.push(
              `chaos_raw_invalid:unknown_status:${id}:${status ?? 'missing'}`
            )
            malformed = true
            continue
          }
          const existing = scenarioStatuses.get(id)
          if (existing) {
            existing.duplicates.push(status)
            if (status === 'failed' || existing.status === 'failed') {
              existing.status = 'failed'
            }
            failures.push(`chaos_raw_invalid:duplicate:${id}`)
            malformed = true
            continue
          }
          scenarioStatuses.set(id, { status, duplicates: [] })
        }
      }
      let executed = 0
      let passed = 0
      let failed = 0
      let notExecuted = 0
      const countScenario = (id, entry) => {
        if (entry.status === 'passed') {
          executed += 1
          passed += 1
          return
        }
        if (entry.status === 'failed') {
          executed += 1
          failed += 1
          return
        }
        notExecuted += 1
      }
      for (const id of CHAOS_REQUIRED_SCENARIOS) {
        const entry = scenarioStatuses.get(id)
        if (!entry) {
          failures.push(`chaos_raw_invalid:missing:${id}`)
          failures.push(`chaos_required_not_passed:${id}`)
          malformed = true
          continue
        }
        countScenario(id, entry)
        if (entry.status !== 'passed') {
          failures.push(`chaos_required_not_passed:${id}`)
          if (CHAOS_NON_EXECUTED_STATUSES.includes(entry.status)) {
            failures.push(
              `chaos_raw_invalid:not_executed:${id}:${entry.status}`
            )
            malformed = true
          }
        }
      }
      for (const id of CHAOS_OPTIONAL_SCENARIOS) {
        const entry = scenarioStatuses.get(id)
        if (!entry) continue
        countScenario(id, entry)
        if (entry.status === 'failed') failures.push(`chaos_failed:${id}`)
      }
      if (passed === 0) {
        failures.push('chaos_raw_invalid:zero_passed')
        malformed = true
      }
      if (
        failed > 0 &&
        !failures.some((item) => item.startsWith('chaos_failed'))
      ) {
        failures.push(`chaos_failed:${failed}`)
      }
      if (executed < CHAOS_REQUIRED_SCENARIOS.length) {
        failures.push(`chaos_below_minimum:${executed}`)
      }
      const declared = result.metrics?.chaos ?? {}
      const derived = { executed, passed, failed, notExecuted }
      for (const key of Object.keys(derived)) {
        if (declared[key] !== undefined && declared[key] !== derived[key]) {
          failures.push(`chaos_metrics_mismatch:${key}`)
        }
      }
      const pass =
        gate.exitCode === 0 &&
        !malformed &&
        failed === 0 &&
        passed >= CHAOS_REQUIRED_SCENARIOS.length &&
        executed >= CHAOS_REQUIRED_SCENARIOS.length
      return { pass, failures }
    }
    case 'load': {
      const report = parseJson(
        artifactReader,
        'certification/load-report.json',
        failures,
        gate.id
      )
      if (!report) return { pass: false, failures }
      let rawValid = true
      for (const field of ['events', 'processed', 'loss', 'duplicates']) {
        if (!isNonNegativeInteger(report[field])) {
          failures.push(`load_raw_invalid:${field}`)
          rawValid = false
        }
      }
      const pass =
        rawValid &&
        report.events > 0 &&
        report.processed === report.events &&
        report.loss === 0 &&
        report.duplicates === 0
      if (!pass) failures.push(`load_inconsistent:${gate.id}`)
      const declared = result.metrics?.load ?? {}
      if (declared.loss !== undefined && declared.loss !== report.loss) {
        failures.push('load_metrics_mismatch:loss')
      }
      if (
        declared.duplicates !== undefined &&
        declared.duplicates !== report.duplicates
      ) {
        failures.push('load_metrics_mismatch:duplicates')
      }
      return { pass: gate.exitCode === 0 && pass, failures }
    }
    case 'restore': {
      const report = parseJson(
        artifactReader,
        'certification/restore-report.json',
        failures,
        gate.id
      )
      if (!report) return { pass: false, failures }
      const digestOk = report.integrity?.digestMatches === true
      if (!digestOk) failures.push(`restore_integrity_failed:${gate.id}`)
      const numericOk =
        Number.isFinite(report.restoreMs) && report.restoreMs >= 0
      if (!numericOk) failures.push('restore_raw_invalid:restoreMs')
      const pass = digestOk && numericOk
      const declared = result.metrics?.restore ?? {}
      if (
        declared.integrity?.digestMatches !== undefined &&
        declared.integrity.digestMatches !== report.integrity?.digestMatches
      ) {
        failures.push('restore_metrics_mismatch:digestMatches')
      }
      return { pass: gate.exitCode === 0 && pass, failures }
    }
    case 'sbom': {
      const report = parseJson(
        artifactReader,
        'certification/sbom.cyclonedx.json',
        failures,
        gate.id
      )
      if (!report) return { pass: false, failures }
      const pass =
        report.bomFormat === 'CycloneDX' &&
        Array.isArray(report.components) &&
        report.components.length > 0
      if (!pass) failures.push(`sbom_invalid:${gate.id}`)
      return { pass: gate.exitCode === 0 && pass, failures }
    }
    case 'licenses': {
      const report = parseJson(
        artifactReader,
        'certification/license-report.json',
        failures,
        gate.id
      )
      if (!report) return { pass: false, failures }
      let rawValid = true
      for (const field of ['total', 'deniedCount', 'unknownCount']) {
        if (!isNonNegativeInteger(report[field])) {
          failures.push(`licenses_raw_invalid:${field}`)
          rawValid = false
        }
      }
      if (
        report.unclassifiedCount !== undefined &&
        !isNonNegativeInteger(report.unclassifiedCount)
      ) {
        failures.push('licenses_raw_invalid:unclassifiedCount')
        rawValid = false
      }
      const pass =
        rawValid &&
        report.total > 0 &&
        report.deniedCount === 0 &&
        report.unknownCount === 0 &&
        (report.unclassifiedCount ?? 0) === 0
      if (!pass) failures.push(`licenses_unresolved:${gate.id}`)
      return { pass: gate.exitCode === 0 && pass, failures }
    }
    default:
      failures.push(`unknown_gate_kind:${gate.id}`)
      return { pass: false, failures }
  }
}

/**
 * Verifies the mandatory gate evidence of a current-candidate certificate:
 * presence, candidate/run binding, manifest integrity, raw parsers, declared
 * status coherence, skip policy and duplicate ownership. Historical mode does
 * not call this function.
 */
export function verifyGateEvidence({ result, manifest, artifactReader }) {
  const failures = []
  const runId = result.runId
  const candidateId = result.candidate?.candidateId
  if (!runId || !manifest.runId) failures.push('no_run_binding')
  else if (runId !== manifest.runId) {
    failures.push('run_id_mismatch_result_manifest')
  }
  if (!candidateId || !manifest.candidateId)
    failures.push('no_candidate_binding')
  else if (candidateId !== manifest.candidateId) {
    failures.push('candidate_id_mismatch_result_manifest')
  }

  const manifestArtifacts = new Map(
    manifest.artifacts.map((artifact) => [artifact.path, artifact])
  )
  const gateIdsSeen = new Set()
  const evidenceOwners = new Map()
  const manifestGateArtifacts = new Set()

  for (const gate of result.gates) {
    const entry = matrixEntry(gate.id)
    if (!entry) {
      failures.push(`unknown_gate:${gate.id}`)
      continue
    }
    if (gateIdsSeen.has(gate.id)) failures.push(`duplicate_gate:${gate.id}`)
    gateIdsSeen.add(gate.id)
    const evidence = gate.evidence ?? []
    const logEvidence = evidence.find((item) => item.kind === 'log')
    if (!logEvidence) {
      failures.push(`gate_log_missing:${gate.id}`)
      continue
    }
    if (logEvidence.path !== entry.log) {
      failures.push(`gate_log_path_unexpected:${gate.id}:${logEvidence.path}`)
    }
    for (const requiredResult of entry.results ?? []) {
      if (
        !evidence.some(
          (item) => item.kind === 'result' && item.path === requiredResult
        )
      ) {
        failures.push(
          `gate_result_artifact_missing:${gate.id}:${requiredResult}`
        )
      }
    }
    for (const item of evidence) {
      if (!manifestArtifacts.has(item.path)) {
        failures.push(`gate_evidence_not_manifested:${gate.id}:${item.path}`)
      } else {
        const record = manifestArtifacts.get(item.path)
        manifestGateArtifacts.add(item.path)
        if (record.sha256 !== item.sha256 || record.size !== item.size) {
          failures.push(`gate_evidence_hash_mismatch:${gate.id}:${item.path}`)
        }
        if (record.gateId && record.gateId !== gate.id) {
          failures.push(
            `gate_evidence_wrong_owner:${item.path}:${record.gateId}`
          )
        }
      }
      if (!evidenceOwners.has(item.path)) evidenceOwners.set(item.path, [])
      evidenceOwners.get(item.path).push(gate.id)
    }
    const logContent = artifactReader(logEvidence.path)
    if (logContent === undefined) {
      failures.push(`gate_log_missing:${gate.id}`)
      continue
    }
    if (sha256Bytes(logContent) !== logEvidence.sha256) {
      failures.push(`gate_log_hash_mismatch:${gate.id}`)
    }
    const header = parseLogHeader(logContent.toString('utf8'))
    if (header.runId !== runId)
      failures.push(`gate_log_run_mismatch:${gate.id}`)
    if (header.candidateId !== candidateId) {
      failures.push(`gate_log_candidate_mismatch:${gate.id}`)
    }
    if (header.gate !== gate.id) {
      failures.push(`gate_log_gate_mismatch:${gate.id}`)
    }
    const headerExit = Number(header.exitCode)
    if (!Number.isInteger(headerExit)) {
      failures.push(`gate_log_exit_missing:${gate.id}`)
    } else if (headerExit !== gate.exitCode) {
      failures.push(
        `gate_exit_code_mismatch:${gate.id}:${gate.exitCode}:${headerExit}`
      )
    }
    if (gate.status === 'NOT_EXECUTED') {
      if (entry.optional !== true) {
        failures.push(`required_gate_not_pass:${gate.id}:NOT_EXECUTED`)
      }
      continue
    }
    const derived = deriveGateOutcome({
      gate,
      entry,
      artifactReader,
      log: logContent,
      result
    })
    failures.push(...derived.failures)
    if (gate.status === 'PASS' && derived.pass !== true) {
      failures.push(`gate_status_mismatch:${gate.id}`)
    }
  }

  for (const id of PHASE10_ENVIRONMENT_GATES) {
    if (!gateIdsSeen.has(id)) failures.push(`missing_environment_gate:${id}`)
  }
  for (const [artifactPath, owners] of evidenceOwners) {
    if (owners.length > 1) failures.push(`duplicate_artifact:${artifactPath}`)
  }
  for (const artifact of manifest.artifacts) {
    if (
      artifact.gateId &&
      !(evidenceOwners.get(artifact.path) ?? []).includes(artifact.gateId)
    ) {
      failures.push(`manifest_artifact_orphan:${artifact.path}`)
    }
  }
  return failures
}

/**
 * Verifies an already-recorded result/manifest pair. Returns a list of
 * failures; an empty list means the stored qualification is coherent for the
 * candidate it claims. When `enforceEvidence` is true (current-candidate
 * mode), every required gate must carry raw, parseable evidence bound to the
 * same candidate and run. Historical mode keeps artifact-hash coherence only.
 */
export function verifyQualification({
  result,
  manifest,
  artifactReader,
  requiredGates = PHASE10_REQUIRED_LOCAL_GATES,
  currentCandidateId,
  enforceEvidence = false
}) {
  const failures = []
  for (const id of requiredGates) {
    const gate = result.gates.find((candidate) => candidate.id === id)
    if (!gate) {
      failures.push(`missing_required_gate:${id}`)
      continue
    }
    if (gate.status !== 'PASS') {
      failures.push(`required_gate_not_pass:${id}:${gate.status}`)
    }
    if (gate.status === 'PASS' && gate.exitCode !== 0) {
      failures.push(`required_gate_nonzero_exit:${id}:${gate.exitCode}`)
    }
  }
  if (!result.candidate || !manifest.candidateId) {
    failures.push('no_candidate_binding')
  } else if (
    currentCandidateId &&
    result.candidate.candidateId !== currentCandidateId
  ) {
    failures.push('candidate_drift')
  }
  if (
    result.candidate &&
    manifest.candidateId &&
    result.candidate.candidateId !== manifest.candidateId
  ) {
    failures.push('candidate_id_mismatch_result_manifest')
  }
  if (enforceEvidence) {
    failures.push(...verifyGateEvidence({ result, manifest, artifactReader }))
  }
  for (const artifact of manifest.artifacts) {
    const content = artifactReader(artifact.path)
    if (content === undefined) {
      failures.push(`artifact_missing:${artifact.path}`)
      continue
    }
    if (sha256Bytes(content) !== artifact.sha256) {
      failures.push(`artifact_hash_mismatch:${artifact.path}`)
    }
  }
  return failures
}

/**
 * Deterministic GO/NO-GO calculus. No score or label can override a failed
 * required gate, an open P0/P1 finding, a missing external validation or a
 * pending human signoff.
 */
export function computeDecision(input) {
  const p0 = input.findings.P0.length
  const p1 = input.findings.P1.length
  const localGates = input.gates.filter((gate) =>
    PHASE10_REQUIRED_LOCAL_GATES.includes(gate.id)
  )
  const localFailed = localGates.filter((gate) => gate.status === 'FAIL')
  const externalPending =
    input.externalGates.modelProvider !== 'VALIDATED' ||
    input.externalGates.channel !== 'VALIDATED' ||
    input.externalGates.externalIdentity !== 'VALIDATED'
  const humanPending = input.externalGates.humanSignoff !== 'VALIDATED'
  const environmentNotExecuted = input.gates
    .filter((gate) => PHASE10_ENVIRONMENT_GATES.includes(gate.id))
    .some((gate) => gate.status !== 'PASS')

  if (p0 > 0 || p1 > 0 || localFailed.length > 0) {
    return {
      decision: 'NO_GO',
      certification: 'NO_GO',
      blockers: buildBlockers(
        input,
        localFailed,
        environmentNotExecuted,
        externalPending,
        humanPending,
        { hardFail: true }
      )
    }
  }
  if (environmentNotExecuted || externalPending || humanPending) {
    return {
      decision: 'CONDITIONAL_GO',
      certification: 'AAA_CONTROLLED',
      blockers: buildBlockers(
        input,
        localFailed,
        environmentNotExecuted,
        externalPending,
        humanPending,
        { hardFail: false }
      )
    }
  }
  return {
    decision: 'GO',
    certification: 'STATE_OF_ART_TRIPLE_AAA',
    blockers: []
  }
}

function buildBlockers(
  input,
  localFailed,
  environmentNotExecuted,
  externalPending,
  humanPending,
  { hardFail }
) {
  const blockers = []
  if (
    !hardFail &&
    input.findings.P0.length === 0 &&
    input.findings.P1.length === 0
  ) {
    blockers.push('P0=0 and P1=0 (controlled scope)')
  }
  for (const gate of localFailed) {
    blockers.push(`required gate failed: ${gate.id}`)
  }
  if (environmentNotExecuted) {
    blockers.push(
      'PostgreSQL environment gate not executed (TEST_DATABASE_URL)'
    )
  }
  if (externalPending) {
    blockers.push(
      'external integrations not validated (provider/channel/identity)'
    )
  }
  if (humanPending) {
    blockers.push('human signoff pending')
  }
  return blockers
}
