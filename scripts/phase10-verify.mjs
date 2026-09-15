#!/usr/bin/env node
/**
 * Verification of Phase 10 certification with explicit modes:
 *
 *   node scripts/phase10-verify.mjs              # current candidate (default)
 *   node scripts/phase10-verify.mjs --historical # historical coherence only
 *   node scripts/phase10-verify.mjs --historical --base <preserved-certificate-dir>
 *   node scripts/phase10-verify.mjs --self-test  # N1-N9 + C0-C9 negative validation
 *
 * Historical coherence never qualifies the current working tree. Current mode
 * recomputes the candidate id from the live files and refuses to qualify when
 * any byte of the candidate changed after the certificate was produced.
 *
 * Current mode also enforces the mandatory gate-evidence matrix: every
 * required gate must carry raw logs/results bound to the same candidateId and
 * runId, the declared PASS/exit code must be re-derived from those raw bytes,
 * and hidden skips or duplicated evidence deny qualification. Hashes detect
 * post-hoc changes; they do not authenticate a producer that controls every
 * file in the environment.
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CertificationManifestSchema,
  PHASE10_REQUIRED_LOCAL_GATES,
  Phase10ResultSchema,
  buildCandidateRecord,
  computeCandidateId,
  collectCandidateFiles,
  computeDecision,
  diffCandidateFiles,
  isCandidateExcluded,
  sha256Bytes,
  verifyQualification
} from './lib/certification-rules.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const historicalMode = args.includes('--historical')
const selfTestMode = args.includes('--self-test')
const baseIndex = args.indexOf('--base')
const baseDir =
  baseIndex >= 0 && args[baseIndex + 1]
    ? path.resolve(root, args[baseIndex + 1])
    : path.join(root, 'certification')

const failures = []
const ok = (message) => process.stderr.write(`[verify] PASS ${message}\n`)
const fail = (message) => {
  failures.push(message)
  process.stderr.write(`[verify] FAIL ${message}\n`)
}

function resolveHistorical(artifactPath) {
  const normalized = artifactPath.split(path.sep).join('/')
  if (normalized.startsWith('certification/')) {
    return path.join(baseDir, normalized.slice('certification/'.length))
  }
  return path.join(root, artifactPath)
}

function artifactReaderFor(mode) {
  if (mode === 'historical') {
    return (artifactPath) => {
      const absolute = resolveHistorical(artifactPath)
      return fs.existsSync(absolute) ? fs.readFileSync(absolute) : undefined
    }
  }
  return (artifactPath) => {
    const absolute = path.join(root, artifactPath)
    return fs.existsSync(absolute) ? fs.readFileSync(absolute) : undefined
  }
}

function runSelfTest() {
  const checks = []
  const pushCheck = (entry) => {
    const matched = entry.failures.some((item) =>
      item.startsWith(entry.expectedCode)
    )
    checks.push({
      ...entry,
      observed: matched
        ? 'REJECTED'
        : entry.failures.length === 0
          ? 'ACCEPTED'
          : 'WRONG_FAILURE',
      verdict: matched ? 'PASS' : 'FAIL'
    })
  }

  // ------------------------------------------------------------------
  // Helper-level checks (N1-N9): each must fail for its own code.
  // ------------------------------------------------------------------
  const helperRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aaa13-helper-'))
  try {
    const write = (relativePath, content) => {
      const absolute = path.join(helperRoot, relativePath)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, content)
      return absolute
    }
    write('src/app.ts', 'export const app = 1\n')
    write('package-lock.json', '{"lockfileVersion":3}\n')
    write('config/runtime.json', '{"mode":"controlled"}\n')
    write('docs/aaa_quality_contract.md', '# bar v2\n')

    const collect = () => {
      const records = []
      const walk = (directory) => {
        for (const entry of fs.readdirSync(directory, {
          withFileTypes: true
        })) {
          const absolute = path.join(directory, entry.name)
          if (entry.isDirectory()) {
            walk(absolute)
            continue
          }
          const relative = path.relative(helperRoot, absolute)
          const content = fs.readFileSync(absolute)
          records.push({
            path: relative,
            sha256: sha256Bytes(content),
            size: content.byteLength,
            tracked: false
          })
        }
      }
      walk(helperRoot)
      records.sort((left, right) => (left.path < right.path ? -1 : 1))
      return records
    }

    const recordedFiles = collect()
    const candidateId = computeCandidateId(recordedFiles)
    const gate = (id, overrides = {}) => ({
      id,
      command: `fixture ${id}`,
      status: 'PASS',
      exitCode: 0,
      durationMs: 1,
      ...overrides
    })
    const fixtureResult = {
      gates: PHASE10_REQUIRED_LOCAL_GATES.map((id) => gate(id)),
      candidate: { candidateId }
    }
    const artifactPath = 'certification/fixture-artifact.json'
    const artifactAbsolute = write(artifactPath, '{"value":1}\n')
    const artifactContent = fs.readFileSync(artifactAbsolute)
    const fixtureManifest = {
      artifacts: [
        {
          path: artifactPath,
          sha256: sha256Bytes(artifactContent),
          size: artifactContent.byteLength,
          producer: 'self-test',
          recordedAt: new Date().toISOString()
        }
      ],
      candidateId
    }
    const reader = (target) =>
      target === artifactPath
        ? fs.readFileSync(artifactAbsolute)
        : fs.readFileSync(path.join(helperRoot, target))

    // N1: source changed after the tests.
    const n1Recorded = collect()
    write('src/app.ts', 'export const app = 2\n')
    pushCheck({
      id: 'N1',
      level: 'helper',
      attack: 'source change after tests',
      expectedCode: 'changed',
      failures: diffCandidateFiles(n1Recorded, collect()).map(
        (item) => item.type
      )
    })
    write('src/app.ts', 'export const app = 1\n')

    // N2: lockfile changed after the tests.
    const n2Recorded = collect()
    write('package-lock.json', '{"lockfileVersion":3,"mutated":true}\n')
    pushCheck({
      id: 'N2',
      level: 'helper',
      attack: 'configuration/lockfile change after tests',
      expectedCode: 'changed',
      failures: diffCandidateFiles(n2Recorded, collect()).map(
        (item) => item.type
      )
    })
    write('package-lock.json', '{"lockfileVersion":3}\n')

    // N3: relevant untracked source omitted from the manifest.
    const n3Recorded = collect().filter((file) => file.path !== 'src/app.ts')
    pushCheck({
      id: 'N3',
      level: 'helper',
      attack: 'omitted relevant source',
      expectedCode: 'added',
      failures: diffCandidateFiles(n3Recorded, collect()).map(
        (item) => item.type
      )
    })

    // N4: forged/tampered report or log.
    fs.writeFileSync(artifactAbsolute, '{"value":2}\n')
    pushCheck({
      id: 'N4',
      level: 'helper',
      attack: 'forged report or log',
      expectedCode: `artifact_hash_mismatch:${artifactPath}`,
      failures: verifyQualification({
        result: fixtureResult,
        manifest: fixtureManifest,
        artifactReader: reader,
        requiredGates: PHASE10_REQUIRED_LOCAL_GATES,
        currentCandidateId: candidateId
      })
    })
    fs.writeFileSync(artifactAbsolute, '{"value":1}\n')

    // N5: required gate absent.
    pushCheck({
      id: 'N5',
      level: 'helper',
      attack: 'missing required gate',
      expectedCode: 'missing_required_gate:format',
      failures: verifyQualification({
        result: { ...fixtureResult, gates: fixtureResult.gates.slice(1) },
        manifest: fixtureManifest,
        artifactReader: reader,
        requiredGates: PHASE10_REQUIRED_LOCAL_GATES,
        currentCandidateId: candidateId
      })
    })

    // N6: mandatory test skipped.
    pushCheck({
      id: 'N6',
      level: 'helper',
      attack: 'mandatory test skipped',
      expectedCode: 'required_gate_not_pass:unit:NOT_EXECUTED',
      failures: verifyQualification({
        result: {
          ...fixtureResult,
          gates: fixtureResult.gates.map((entry) =>
            entry.id === 'unit'
              ? { ...entry, status: 'NOT_EXECUTED', exitCode: 1 }
              : entry
          )
        },
        manifest: fixtureManifest,
        artifactReader: reader,
        requiredGates: PHASE10_REQUIRED_LOCAL_GATES,
        currentCandidateId: candidateId
      })
    })

    // N7: non-zero exit presented as PASS.
    pushCheck({
      id: 'N7',
      level: 'helper',
      attack: 'non-zero exit presented as PASS',
      expectedCode: 'required_gate_nonzero_exit:lint:2',
      failures: verifyQualification({
        result: {
          ...fixtureResult,
          gates: fixtureResult.gates.map((entry) =>
            entry.id === 'lint'
              ? { ...entry, status: 'PASS', exitCode: 2 }
              : entry
          )
        },
        manifest: fixtureManifest,
        artifactReader: reader,
        requiredGates: PHASE10_REQUIRED_LOCAL_GATES,
        currentCandidateId: candidateId
      })
    })

    // N8: old evidence reused as current.
    pushCheck({
      id: 'N8',
      level: 'helper',
      attack: 'stale evidence reused as current',
      expectedCode: 'candidate_drift',
      failures: verifyQualification({
        result: {
          ...fixtureResult,
          candidate: { candidateId: 'a'.repeat(64) }
        },
        manifest: fixtureManifest,
        artifactReader: reader,
        requiredGates: PHASE10_REQUIRED_LOCAL_GATES,
        currentCandidateId: candidateId
      })
    })

    // N9: frozen contract changed after review.
    const contractPath = 'docs/aaa_quality_contract.md'
    const contractAbsolute = path.join(helperRoot, contractPath)
    const contractContent = fs.readFileSync(contractAbsolute)
    const contractManifest = {
      artifacts: [
        {
          path: contractPath,
          sha256: sha256Bytes(contractContent),
          size: contractContent.byteLength,
          producer: 'self-test',
          recordedAt: new Date().toISOString()
        }
      ],
      candidateId
    }
    fs.writeFileSync(contractAbsolute, '# bar v2 mutated\n')
    pushCheck({
      id: 'N9',
      level: 'helper',
      attack: 'contract changed after review',
      expectedCode: `artifact_hash_mismatch:${contractPath}`,
      failures: verifyQualification({
        result: fixtureResult,
        manifest: contractManifest,
        artifactReader: (target) =>
          fs.readFileSync(path.join(helperRoot, target)),
        requiredGates: PHASE10_REQUIRED_LOCAL_GATES,
        currentCandidateId: candidateId
      })
    })
  } finally {
    fs.rmSync(helperRoot, { recursive: true, force: true })
  }

  // N10: archived Gauntlet state must not become part of the candidate.
  const currentCandidatePaths = collectCandidateFiles(root).map(
    ({ path: candidatePath }) => candidatePath
  )
  const archivedCandidatePaths = currentCandidatePaths.filter(
    (candidatePath) => {
      const [rootSegment] = candidatePath.split('/')
      return (
        rootSegment === '.gauntlet' || rootSegment?.startsWith('.gauntlet-')
      )
    }
  )
  const scopeVerified =
    isCandidateExcluded('.gauntlet/state.json') &&
    isCandidateExcluded('.gauntlet-legacy-r7-20260914/state.json') &&
    !isCandidateExcluded('.gauntletx/state.json') &&
    archivedCandidatePaths.length === 0
  pushCheck({
    id: 'N10',
    level: 'helper',
    attack:
      'archived .gauntlet state included or .gauntletx lookalike excluded from candidate scope',
    expectedCode: 'candidate_scope_exclusion',
    failures: scopeVerified ? ['candidate_scope_exclusion:verified'] : []
  })

  // ------------------------------------------------------------------
  // Public-CLI checks: each fixture invokes scripts/phase10-verify.mjs.
  // ------------------------------------------------------------------
  const buildValidFixture = () => {
    const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aaa13-cli-'))
    for (const relative of [
      'scripts/lib/certification-rules.mjs',
      'scripts/phase10-verify.mjs'
    ]) {
      const target = path.join(fixtureRoot, relative)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(path.join(root, relative), target)
    }
    fs.symlinkSync(
      path.join(root, 'node_modules'),
      path.join(fixtureRoot, 'node_modules'),
      'dir'
    )
    fs.writeFileSync(
      path.join(fixtureRoot, 'package.json'),
      '{"type":"module"}\n'
    )
    fs.mkdirSync(path.join(fixtureRoot, 'src'), { recursive: true })
    fs.writeFileSync(
      path.join(fixtureRoot, 'src/synthetic.js'),
      'export const synthetic = true\n'
    )
    spawnSync('git', ['init', '--quiet'], { cwd: fixtureRoot })
    spawnSync(
      'git',
      [
        '-c',
        'user.email=selftest@local',
        '-c',
        'user.name=selftest',
        'commit',
        '--allow-empty',
        '--quiet',
        '-m',
        'fixture'
      ],
      { cwd: fixtureRoot }
    )

    const candidate = buildCandidateRecord({
      root: fixtureRoot,
      files: collectCandidateFiles(fixtureRoot)
    })
    const candidateId = candidate.candidateId
    const runId = 'run-selftest-fixture-0001'
    const artifacts = []
    const raw = new Map()
    const writeFile = (relativePath, content) => {
      const absolute = path.join(fixtureRoot, relativePath)
      fs.mkdirSync(path.dirname(absolute), { recursive: true })
      fs.writeFileSync(absolute, content)
      const buffer = Buffer.from(content)
      return {
        path: relativePath,
        sha256: sha256Bytes(buffer),
        size: buffer.byteLength
      }
    }
    const emitLog = (id, body, options = {}) => {
      const record = writeFile(
        `certification/logs/${id}.log`,
        `# runId=${options.runId ?? runId} candidateId=${options.candidateId ?? candidateId} gate=${id} command=fixture ${id}\n# exitCode=${options.exitCode ?? 0} durationMs=1\n\n${body}\n`
      )
      const evidence = { ...record, kind: 'log', runId: options.runId ?? runId }
      raw.set(id, [...(raw.get(id) ?? []), evidence])
      return record
    }
    const emitResult = (id, relativePath, content) => {
      const record = writeFile(relativePath, content)
      raw.set(id, [
        ...(raw.get(id) ?? []),
        { ...record, kind: 'result', runId }
      ])
      return record
    }
    const gateRecord = (
      id,
      { status = 'PASS', exitCode = 0, metrics, skipJustification } = {}
    ) => ({
      id,
      command: `fixture ${id}`,
      status,
      exitCode,
      durationMs: 1,
      evidence: raw.get(id) ?? [],
      ...(metrics ? { metrics } : {}),
      ...(skipJustification ? { skipJustification } : {})
    })

    emitLog('format', 'fixture ok')
    emitLog('typecheck', 'fixture ok')
    emitLog('lint', 'fixture ok')
    emitLog('build', 'fixture ok')
    emitLog('unit', ' Test Files  1 passed (1)\n      Tests  5 passed (5)\n')
    emitLog('coverage', 'coverage complete')
    emitResult(
      'coverage',
      'coverage/coverage-summary.json',
      JSON.stringify({
        total: {
          statements: { pct: 95 },
          branches: { pct: 96 },
          functions: { pct: 97 },
          lines: { pct: 98 }
        }
      })
    )
    emitLog('security', 'found 0 vulnerabilities\n')
    emitLog('worker_startup', '{"event":"worker.startup_smoke_passed"}\n')
    emitLog('e2e', 'Running 1 test using 1 worker\n\n  1 passed (0.1s)\n')
    emitLog('evals', '{"event":"evals.completed","verdict":"PASS"}\n')
    emitResult(
      'evals',
      'certification/agent-eval-report.json',
      JSON.stringify({
        verdict: 'PASS',
        metrics: {
          scenarios: 10,
          taskSuccessRate: 0.98,
          policyViolationRate: 0,
          unsafeActionRate: 0,
          schemaFailureRate: 0,
          adversarialPassRate: 1,
          humanEscalationAccuracy: 1
        },
        thresholds: {
          taskSuccessRate: 0.85,
          policyViolationRate: 0,
          unsafeActionRate: 0,
          schemaFailureRate: 0.05,
          adversarialPassRate: 0.9,
          escalationAccuracy: 0.8
        }
      })
    )
    emitLog('chaos', 'JSON report written\n')
    const chaosAssertions = [
      ...[
        '01',
        '02',
        '03',
        '06',
        '07',
        '08',
        '09',
        '10',
        '11',
        '12',
        '13',
        '14',
        '15',
        '16'
      ].map((suffix) => ({
        title: `CHAOS-${suffix} fixture`,
        status: 'passed'
      })),
      ...['04', '05'].map((suffix) => ({
        title: `CHAOS-${suffix} fixture`,
        status: 'skipped'
      }))
    ]
    emitResult(
      'chaos',
      'certification/chaos-report.json',
      JSON.stringify({
        testResults: [{ assertionResults: chaosAssertions }]
      })
    )
    emitLog('load', '{"event":"load.completed"}\n')
    emitResult(
      'load',
      'certification/load-report.json',
      JSON.stringify({
        events: 10000,
        processed: 10000,
        loss: 0,
        duplicates: 0
      })
    )
    emitLog('restore', '{"event":"restore.completed"}\n')
    emitResult(
      'restore',
      'certification/restore-report.json',
      JSON.stringify({ integrity: { digestMatches: true }, restoreMs: 10 })
    )
    emitLog('sbom', '{"event":"sbom.generated"}\n')
    emitResult(
      'sbom',
      'certification/sbom.cyclonedx.json',
      JSON.stringify({
        bomFormat: 'CycloneDX',
        specVersion: '1.5',
        components: [{ name: 'fixture', version: '1.0.0' }]
      })
    )
    emitLog('licenses', '{"event":"licenses.checked"}\n')
    emitResult(
      'licenses',
      'certification/license-report.json',
      JSON.stringify({
        schemaVersion: 2,
        total: 10,
        deniedCount: 0,
        unknownCount: 0,
        unclassifiedCount: 0
      })
    )
    emitLog('postgres', '', { exitCode: 1 })

    const metrics = {
      coverage: { statements: 95, branches: 96, functions: 97, lines: 98 },
      chaos: { executed: 14, passed: 14, failed: 0, notExecuted: 2 },
      evals: { verdict: 'PASS' },
      load: { events: 10000, processed: 10000, loss: 0, duplicates: 0 },
      restore: { integrity: { digestMatches: true }, restoreMs: 10 }
    }
    const gates = [
      gateRecord('format'),
      gateRecord('typecheck'),
      gateRecord('lint'),
      gateRecord('build'),
      gateRecord('unit', {
        metrics: {
          filesPassed: 1,
          filesFailed: 0,
          filesSkipped: 0,
          testsPassed: 5,
          testsFailed: 0,
          testsSkipped: 0
        }
      }),
      gateRecord('coverage', {
        metrics: { statements: 95, branches: 96, functions: 97, lines: 98 }
      }),
      gateRecord('security'),
      gateRecord('worker_startup'),
      gateRecord('e2e', {
        metrics: { filesPassed: 1, filesFailed: 0, filesSkipped: 0 }
      }),
      gateRecord('evals'),
      gateRecord('chaos'),
      gateRecord('load'),
      gateRecord('restore'),
      gateRecord('sbom'),
      gateRecord('licenses'),
      gateRecord('postgres', { status: 'NOT_EXECUTED', exitCode: 1 })
    ]
    for (const record of raw.values()) {
      for (const item of record) {
        artifacts.push({
          path: item.path,
          sha256: item.sha256,
          size: item.size,
          producer: 'self-test',
          recordedAt: new Date().toISOString(),
          gateId: [...raw.entries()].find(([, list]) =>
            list.includes(item)
          )?.[0]
        })
      }
    }
    const findings = { P0: [], P1: [], P2: [] }
    const externalGates = {
      modelProvider: 'NOT_VALIDATED',
      channel: 'NOT_VALIDATED',
      externalIdentity: 'NOT_VALIDATED',
      humanSignoff: 'NOT_VALIDATED'
    }
    const decision = computeDecision({ gates, findings, externalGates })
    const result = {
      schemaVersion: 1,
      phase: '10',
      kind: 'phase10-result',
      commit: candidate.git.head,
      candidate,
      runId,
      timestamp: new Date().toISOString(),
      scores: {},
      findings,
      gates,
      externalGates,
      metrics,
      certification: decision.certification,
      decision: decision.decision,
      remainingBlockers: decision.blockers
    }
    const manifest = {
      schemaVersion: 1,
      phase: '10',
      kind: 'phase10-manifest',
      commit: candidate.git.head,
      timestamp: result.timestamp,
      artifacts,
      decision: result.decision,
      certification: result.certification,
      candidateId,
      runId
    }
    return { fixtureRoot, candidateId, runId, result, manifest, artifacts }
  }

  const persist = (state) => {
    fs.mkdirSync(path.join(state.fixtureRoot, 'certification'), {
      recursive: true
    })
    fs.writeFileSync(
      path.join(state.fixtureRoot, 'certification/phase10-result.json'),
      JSON.stringify(state.result)
    )
    fs.writeFileSync(
      path.join(state.fixtureRoot, 'certification/manifest.json'),
      JSON.stringify(state.manifest)
    )
  }

  const runCli = (state) => {
    persist(state)
    const observed = spawnSync(
      process.execPath,
      ['scripts/phase10-verify.mjs'],
      { cwd: state.fixtureRoot, encoding: 'utf8' }
    )
    return {
      exitCode: observed.status,
      stderr: observed.stderr ?? '',
      failures: (observed.stderr ?? '')
        .split('\n')
        .filter((line) => line.startsWith('[verify] FAIL '))
        .map((line) => line.slice('[verify] FAIL '.length))
    }
  }

  const rewriteEvidence = (state, relativePath, content) => {
    const absolute = path.join(state.fixtureRoot, relativePath)
    fs.writeFileSync(absolute, content)
    const buffer = Buffer.from(content)
    const sha256 = sha256Bytes(buffer)
    const size = buffer.byteLength
    for (const record of state.result.gates) {
      for (const item of record.evidence ?? []) {
        if (item.path === relativePath) {
          item.sha256 = sha256
          item.size = size
        }
      }
    }
    for (const artifact of state.manifest.artifacts) {
      if (artifact.path === relativePath) {
        artifact.sha256 = sha256
        artifact.size = size
      }
    }
  }

  const cliCases = []
  const runCliCase = (id, attack, expectedCode, prepare) => {
    const state = buildValidFixture()
    try {
      prepare(state)
      const observed = runCli(state)
      pushCheck({
        id,
        level: 'cli',
        attack,
        expectedCode,
        failures: observed.failures,
        exitCode: observed.exitCode
      })
      cliCases.push({
        id,
        exitCode: observed.exitCode,
        stderr: observed.stderr
      })
    } finally {
      fs.rmSync(state.fixtureRoot, { recursive: true, force: true })
    }
  }

  // Positive control: the same fixture without mutation must qualify.
  const positiveState = buildValidFixture()
  try {
    const observed = runCli(positiveState)
    const accepted =
      observed.exitCode === 0 &&
      /current candidate qualified/.test(observed.stderr)
    checks.push({
      id: 'C0',
      level: 'cli',
      attack: 'complete valid evidence control',
      expectedCode: 'current candidate qualified',
      observed: accepted ? 'ACCEPTED' : 'REJECTED',
      failures: observed.failures,
      exitCode: observed.exitCode,
      verdict: accepted ? 'PASS' : 'FAIL'
    })
    cliCases.push({
      id: 'C0',
      exitCode: observed.exitCode,
      stderr: observed.stderr
    })
  } finally {
    fs.rmSync(positiveState.fixtureRoot, { recursive: true, force: true })
  }

  // C1: probe scenario — gates declared PASS, no evidence, empty manifest.
  runCliCase(
    'C1',
    'declared PASS with no evidence and empty manifest',
    'gate_log_missing:format',
    (state) => {
      for (const record of state.result.gates) delete record.evidence
      state.manifest.artifacts = []
    }
  )

  // C2: required gate log removed.
  runCliCase(
    'C2',
    'required gate log removed',
    'gate_log_missing:unit',
    (state) => {
      const unit = state.result.gates.find((record) => record.id === 'unit')
      fs.rmSync(path.join(state.fixtureRoot, 'certification/logs/unit.log'))
      unit.evidence = []
      state.manifest.artifacts = state.manifest.artifacts.filter(
        (artifact) => artifact.path !== 'certification/logs/unit.log'
      )
    }
  )

  // C3: PASS declared while the raw runner data shows failure.
  runCliCase(
    'C3',
    'PASS declared with raw failure data',
    'gate_status_mismatch:unit',
    (state) => {
      rewriteEvidence(
        state,
        'certification/logs/unit.log',
        `# runId=${state.runId} candidateId=${state.candidateId} gate=unit command=fixture unit\n# exitCode=0 durationMs=1\n\n Test Files  1 passed (1)\n      Tests  5 failed (5)\n`
      )
    }
  )

  // C4: mandatory skip hidden behind a PASS declaration.
  runCliCase('C4', 'hidden mandatory skip', 'mandatory_skip:e2e:1', (state) => {
    rewriteEvidence(
      state,
      'certification/logs/e2e.log',
      `# runId=${state.runId} candidateId=${state.candidateId} gate=e2e command=fixture e2e\n# exitCode=0 durationMs=1\n\nRunning 2 tests using 1 worker\n\n  1 skipped\n  1 passed (0.1s)\n`
    )
    const e2e = state.result.gates.find((record) => record.id === 'e2e')
    e2e.metrics = { filesPassed: 1, filesFailed: 0, filesSkipped: 1 }
  })

  // C5: declared exit code diverges from the raw log header.
  runCliCase(
    'C5',
    'divergent exit code',
    'gate_exit_code_mismatch:unit:0:7',
    (state) => {
      rewriteEvidence(
        state,
        'certification/logs/unit.log',
        `# runId=${state.runId} candidateId=${state.candidateId} gate=unit command=fixture unit\n# exitCode=7 durationMs=1\n\n Test Files  1 passed (1)\n      Tests  5 passed (5)\n`
      )
    }
  )

  // C6: evidence produced by another run (stale run binding).
  runCliCase(
    'C6',
    'evidence bound to another run',
    'gate_log_run_mismatch:unit',
    (state) => {
      rewriteEvidence(
        state,
        'certification/logs/unit.log',
        `# runId=run-other-9999 candidateId=${state.candidateId} gate=unit command=fixture unit\n# exitCode=0 durationMs=1\n\n Test Files  1 passed (1)\n      Tests  5 passed (5)\n`
      )
    }
  )

  // C7: manifest bound to a different candidate than the result.
  runCliCase(
    'C7',
    'candidate divergence between result and manifest',
    'candidate_id_mismatch_result_manifest',
    (state) => {
      state.manifest.candidateId = 'b'.repeat(64)
    }
  )

  // C8: duplicated gate declaration.
  runCliCase(
    'C8',
    'duplicate gate declaration',
    'duplicate_gate:unit',
    (state) => {
      const unit = state.result.gates.find((record) => record.id === 'unit')
      state.result.gates.push({ ...unit, evidence: [...unit.evidence] })
    }
  )

  // C9: the same raw artifact assigned to two gates.
  runCliCase(
    'C9',
    'artifact owned by two gates',
    'duplicate_artifact:certification/logs/unit.log',
    (state) => {
      const unit = state.result.gates.find((record) => record.id === 'unit')
      const lint = state.result.gates.find((record) => record.id === 'lint')
      lint.evidence.push({ ...unit.evidence[0] })
    }
  )

  const coverageReport = (overrides) =>
    JSON.stringify({
      total: {
        statements: { pct: 95 },
        branches: { pct: 96 },
        functions: { pct: 97 },
        lines: { pct: 98 },
        ...overrides
      }
    })
  const chaosReport = (statuses, extra = []) =>
    JSON.stringify({
      testResults: [
        {
          assertionResults: [
            ...Object.entries(statuses).map(([id, status]) => ({
              title: `${id} fixture`,
              status
            })),
            ...extra
          ]
        }
      ]
    })
  const mandatoryChaos = {
    'CHAOS-01': 'passed',
    'CHAOS-02': 'passed',
    'CHAOS-03': 'passed',
    'CHAOS-06': 'passed',
    'CHAOS-07': 'passed',
    'CHAOS-08': 'passed',
    'CHAOS-09': 'passed',
    'CHAOS-10': 'passed',
    'CHAOS-11': 'passed',
    'CHAOS-12': 'passed',
    'CHAOS-13': 'passed',
    'CHAOS-14': 'passed',
    'CHAOS-15': 'passed',
    'CHAOS-16': 'passed',
    'CHAOS-04': 'skipped',
    'CHAOS-05': 'skipped'
  }

  // C10-C17: coverage percentage validity, one dimension each plus divergence.
  runCliCase(
    'C10',
    'coverage percentage absent (R1)',
    'coverage_raw_invalid:coverage:statements',
    (state) => {
      rewriteEvidence(
        state,
        'coverage/coverage-summary.json',
        coverageReport({ statements: {} })
      )
    }
  )
  runCliCase(
    'C11',
    'coverage percentage numeric string',
    'coverage_raw_invalid:coverage:statements',
    (state) => {
      rewriteEvidence(
        state,
        'coverage/coverage-summary.json',
        coverageReport({ statements: { pct: '95' } })
      )
    }
  )
  runCliCase(
    'C12',
    'coverage percentage null',
    'coverage_raw_invalid:coverage:statements',
    (state) => {
      rewriteEvidence(
        state,
        'coverage/coverage-summary.json',
        coverageReport({ statements: { pct: null } })
      )
    }
  )
  runCliCase(
    'C13',
    'coverage percentage object on branches',
    'coverage_raw_invalid:coverage:branches',
    (state) => {
      rewriteEvidence(
        state,
        'coverage/coverage-summary.json',
        coverageReport({ branches: { pct: {} } })
      )
    }
  )
  runCliCase(
    'C14',
    'coverage percentage negative on functions',
    'coverage_raw_invalid:coverage:functions',
    (state) => {
      rewriteEvidence(
        state,
        'coverage/coverage-summary.json',
        coverageReport({ functions: { pct: -1 } })
      )
    }
  )
  runCliCase(
    'C15',
    'coverage percentage above 100 on lines',
    'coverage_raw_invalid:coverage:lines',
    (state) => {
      rewriteEvidence(
        state,
        'coverage/coverage-summary.json',
        coverageReport({ lines: { pct: 100.1 } })
      )
    }
  )
  runCliCase(
    'C16',
    'coverage result metric diverges from raw',
    'coverage_result_metrics_mismatch:statements',
    (state) => {
      state.result.metrics.coverage.statements = 94
    }
  )
  runCliCase(
    'C17',
    'coverage gate metric diverges from raw',
    'coverage_metrics_mismatch:coverage:statements',
    (state) => {
      const coverage = state.result.gates.find(
        (record) => record.id === 'coverage'
      )
      coverage.metrics.statements = 94
    }
  )

  // C18-C23: chaos inventory, statuses, duplicates and metric coherence.
  runCliCase(
    'C18',
    'all chaos assertions skipped (R2)',
    'chaos_raw_invalid',
    (state) => {
      rewriteEvidence(
        state,
        'certification/chaos-report.json',
        chaosReport({
          'CHAOS-01': 'skipped',
          'CHAOS-02': 'skipped',
          'CHAOS-03': 'skipped',
          'CHAOS-04': 'skipped',
          'CHAOS-05': 'skipped',
          'CHAOS-06': 'skipped',
          'CHAOS-07': 'skipped',
          'CHAOS-08': 'skipped',
          'CHAOS-09': 'skipped',
          'CHAOS-10': 'skipped',
          'CHAOS-11': 'skipped',
          'CHAOS-12': 'skipped',
          'CHAOS-13': 'skipped',
          'CHAOS-14': 'skipped'
        })
      )
      state.result.metrics.chaos = {
        executed: 14,
        passed: 0,
        failed: 0,
        notExecuted: 0
      }
    }
  )
  runCliCase(
    'C19',
    'mandatory chaos scenario pending',
    'chaos_required_not_passed:CHAOS-02',
    (state) => {
      rewriteEvidence(
        state,
        'certification/chaos-report.json',
        chaosReport({ ...mandatoryChaos, 'CHAOS-02': 'pending' })
      )
      state.result.metrics.chaos = {
        executed: 13,
        passed: 13,
        failed: 0,
        notExecuted: 3
      }
    }
  )
  runCliCase(
    'C20',
    'duplicate chaos scenario hides a skip',
    'chaos_raw_invalid:duplicate:CHAOS-01',
    (state) => {
      rewriteEvidence(
        state,
        'certification/chaos-report.json',
        chaosReport(mandatoryChaos, [
          { title: 'CHAOS-01 fixture duplicate', status: 'skipped' }
        ])
      )
    }
  )
  runCliCase(
    'C21',
    'unknown chaos status',
    'chaos_raw_invalid:unknown_status:CHAOS-01',
    (state) => {
      rewriteEvidence(
        state,
        'certification/chaos-report.json',
        chaosReport({ ...mandatoryChaos, 'CHAOS-01': 'flaky' })
      )
    }
  )
  runCliCase(
    'C22',
    'zero chaos scenarios passed',
    'chaos_raw_invalid:zero_passed',
    (state) => {
      const failedMandatory = Object.fromEntries(
        Object.keys(mandatoryChaos).map((id) => [
          id,
          ['CHAOS-04', 'CHAOS-05'].includes(id) ? 'skipped' : 'failed'
        ])
      )
      rewriteEvidence(
        state,
        'certification/chaos-report.json',
        chaosReport(failedMandatory)
      )
      state.result.metrics.chaos = {
        executed: 14,
        passed: 0,
        failed: 14,
        notExecuted: 2
      }
    }
  )
  runCliCase(
    'C23',
    'chaos declared metrics diverge from raw',
    'chaos_metrics_mismatch:executed',
    (state) => {
      state.result.metrics.chaos.executed = 13
    }
  )

  // C24-C27: same numeric-coercion class in other parsers.
  runCliCase(
    'C24',
    'load events as numeric string',
    'load_raw_invalid:events',
    (state) => {
      rewriteEvidence(
        state,
        'certification/load-report.json',
        JSON.stringify({
          events: '10000',
          processed: 10000,
          loss: 0,
          duplicates: 0
        })
      )
    }
  )
  runCliCase(
    'C25',
    'restore restoreMs as numeric string',
    'restore_raw_invalid:restoreMs',
    (state) => {
      rewriteEvidence(
        state,
        'certification/restore-report.json',
        JSON.stringify({
          integrity: { digestMatches: true },
          restoreMs: '10'
        })
      )
    }
  )
  runCliCase(
    'C26',
    'evals taskSuccessRate as numeric string',
    'evals_raw_invalid:taskSuccessRate',
    (state) => {
      rewriteEvidence(
        state,
        'certification/agent-eval-report.json',
        JSON.stringify({
          verdict: 'PASS',
          metrics: {
            scenarios: 10,
            taskSuccessRate: '0.98',
            policyViolationRate: 0,
            unsafeActionRate: 0,
            schemaFailureRate: 0,
            adversarialPassRate: 1,
            humanEscalationAccuracy: 1
          },
          thresholds: {
            taskSuccessRate: 0.85,
            policyViolationRate: 0,
            unsafeActionRate: 0,
            schemaFailureRate: 0.05,
            adversarialPassRate: 0.9,
            escalationAccuracy: 0.8
          }
        })
      )
    }
  )
  runCliCase(
    'C27',
    'licenses total as numeric string',
    'licenses_raw_invalid:total',
    (state) => {
      rewriteEvidence(
        state,
        'certification/license-report.json',
        JSON.stringify({
          schemaVersion: 2,
          total: '10',
          deniedCount: 0,
          unknownCount: 0,
          unclassifiedCount: 0
        })
      )
    }
  )

  const verdict = checks.every((check) => check.verdict === 'PASS')
    ? 'PASS'
    : 'FAIL'
  const output = {
    schemaVersion: 2,
    kind: 'aaa-negative-validation',
    generatedAt: new Date().toISOString(),
    confidenceLimit:
      'Hashes and run bindings detect post-hoc changes and mixed runs; they do not authenticate a producer that controls every file in the environment. Independent qualification requires a separate environment/process or human authority.',
    checks,
    cliCases: cliCases.map((entry) => ({
      id: entry.id,
      exitCode: entry.exitCode
    })),
    verdict
  }
  fs.writeFileSync(
    path.join(root, 'certification', 'negative-validation.json'),
    `${JSON.stringify(output, null, 2)}\n`
  )
  for (const check of checks) {
    process.stderr.write(
      `[verify] ${check.verdict === 'PASS' ? 'PASS' : 'FAIL'} ${check.id} (${check.level}) ${check.attack}\n`
    )
  }
  process.stderr.write(`[verify] self-test verdict ${verdict}\n`)
  process.exitCode = verdict === 'PASS' ? 0 : 1
}

function runStandardVerification() {
  const resultPath = historicalMode
    ? resolveHistorical('certification/phase10-result.json')
    : path.join(root, 'certification', 'phase10-result.json')
  const manifestPath = historicalMode
    ? resolveHistorical('certification/manifest.json')
    : path.join(root, 'certification', 'manifest.json')

  if (!fs.existsSync(resultPath))
    fail('certification/phase10-result.json missing')
  if (!fs.existsSync(manifestPath)) fail('certification/manifest.json missing')
  if (failures.length > 0) return

  let result
  let manifest
  try {
    result = Phase10ResultSchema.parse(
      JSON.parse(fs.readFileSync(resultPath, 'utf8'))
    )
    ok('phase10-result.json matches schema')
  } catch (error) {
    fail(`phase10-result.json schema invalid: ${error.message}`)
  }
  try {
    manifest = CertificationManifestSchema.parse(
      JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    )
    ok('manifest.json matches schema')
  } catch (error) {
    fail(`manifest.json schema invalid: ${error.message}`)
  }
  if (!result || !manifest) {
    process.exitCode = 1
    return
  }

  const reader = artifactReaderFor(historicalMode ? 'historical' : 'current')
  const bound = Boolean(result.candidate) && Boolean(manifest.candidateId)
  let currentCandidateId
  if (bound) {
    currentCandidateId = computeCandidateId(collectCandidateFiles(root))
    if (result.candidate.candidateId !== currentCandidateId) {
      fail(
        `CANDIDATE_DRIFT recorded ${result.candidate.candidateId}, current ${currentCandidateId}`
      )
      const driftPath = path.join(
        root,
        'certification',
        'candidate-manifest.json'
      )
      if (fs.existsSync(driftPath)) {
        try {
          const recorded = JSON.parse(fs.readFileSync(driftPath, 'utf8'))
          const differences = diffCandidateFiles(
            recorded.files,
            collectCandidateFiles(root)
          )
          for (const difference of differences.slice(0, 20)) {
            process.stderr.write(
              `[verify] drift ${difference.type} ${difference.path}\n`
            )
          }
        } catch {
          // recorded candidate manifest unreadable; the drift failure stands
        }
      }
    }
  }

  const qualificationFailures = verifyQualification({
    result,
    manifest,
    artifactReader: reader,
    requiredGates: PHASE10_REQUIRED_LOCAL_GATES,
    currentCandidateId,
    enforceEvidence: bound && !historicalMode
  })
  for (const entry of qualificationFailures) {
    if (entry === 'no_candidate_binding') continue
    fail(entry)
  }
  if (!qualificationFailures.some((entry) => entry.startsWith('artifact_'))) {
    ok(`verified ${manifest.artifacts.length} artifact hashes`)
  }

  const recomputed = computeDecision({
    gates: result.gates,
    findings: result.findings,
    externalGates: result.externalGates
  })
  if (recomputed.decision !== result.decision) {
    fail(
      `decision mismatch: stored ${result.decision}, recomputed ${recomputed.decision}`
    )
  } else {
    ok(`decision is coherent: ${result.decision}`)
  }
  if (recomputed.certification !== result.certification) {
    fail(
      `certification mismatch: stored ${result.certification}, recomputed ${recomputed.certification}`
    )
  } else {
    ok(`certification is coherent: ${result.certification}`)
  }

  for (const id of PHASE10_REQUIRED_LOCAL_GATES) {
    const gateResult = result.gates.find((candidate) => candidate.id === id)
    if (!gateResult) {
      fail(`required gate missing: ${id}`)
      continue
    }
    if (gateResult.status !== 'PASS') {
      fail(`required gate not PASS: ${id} (${gateResult.status})`)
    }
  }

  const executedChaos = result.metrics?.chaos?.executed ?? 0
  const failedChaos = result.metrics?.chaos?.failed ?? 0
  if (failedChaos > 0) fail(`chaos scenarios failed: ${failedChaos}`)
  if (executedChaos < 14) {
    fail(`chaos executed scenarios below minimum: ${executedChaos}`)
  }

  const evalVerdict = result.metrics?.evals?.verdict
  if (evalVerdict !== 'PASS') {
    fail(`agent eval verdict is ${evalVerdict ?? 'missing'}`)
  }

  const load = result.metrics?.load
  if (!load || load.loss !== 0 || load.duplicates !== 0) {
    fail(
      `load check inconsistent: loss=${load?.loss}, duplicates=${load?.duplicates}`
    )
  }
  const restore = result.metrics?.restore
  if (!restore || restore.integrity?.digestMatches !== true) {
    fail('restore integrity check missing or failing')
  }
  if (result.decision === 'GO') {
    fail(
      'GO requires validated external gates and human signoff; not satisfied'
    )
  }

  if (!bound) {
    process.stderr.write(
      '[verify] LEGACY_MANIFEST_NO_CANDIDATE_BINDING: historical hashes checked; this does not qualify the current candidate\n'
    )
    if (!historicalMode) {
      failures.push(
        'current qualification requires a certificate with candidate binding'
      )
    }
  } else if (historicalMode) {
    process.stderr.write(
      `[verify] HISTORICAL_COHERENCE candidate=${result.candidate.candidateId} (not current qualification)\n`
    )
  }

  if (failures.length > 0) {
    process.stderr.write(`[verify] ${failures.length} failure(s)\n`)
    process.exitCode = 1
    return
  }
  if (historicalMode) {
    process.stderr.write(
      `[verify] certification historically coherent: ${result.decision} / ${result.certification}\n`
    )
  } else {
    process.stderr.write(
      `[verify] current candidate qualified: ${result.candidate.candidateId}\n`
    )
  }
}

if (selfTestMode) {
  runSelfTest()
} else {
  runStandardVerification()
}
