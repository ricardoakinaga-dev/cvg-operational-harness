import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)))
const evidenceDir = join(repo, 'docs', 'phase4a', 'evidence')
const qualityBarPath = join(repo, 'docs', 'phase4a', 'QUALITY_BAR.json')

const implementationRoots = [
  'packages/conversation',
  'packages/persistence/migrations/0020_conversation_intelligence.sql',
  'packages/persistence/src/__tests__/conversation-intelligence-migration.test.ts',
  'packages/persistence/src/postgres.ts',
  'examples/phase4a',
  'tests/phase4a',
  'scripts/phase4a-demo.ts',
  'scripts/phase4a-verify.mjs',
  'scripts/phase4a-golden-evidence.ts',
  'scripts/phase4a-performance.ts',
  'scripts/phase4a-certify.mjs',
  'docs/phase4a/QUALITY_BAR.json',
  'package.json',
  'package-lock.json',
  'tsconfig.base.json',
  'tsconfig.json'
]

const excludedPhase4aDocs = new Set([
  'GATE_VALIDATION.md',
  'TASK.md',
  'PHASE_4_HANDOFF.md',
  'REQUIREMENTS_TRACEABILITY.md',
  'PHASE_4A_FINAL_CLOSURE.md',
  'INDEPENDENT_REVIEW_PACKET.md'
])

const criterionEvidence = {
  'P4A-ARCH-001': [
    'packages/conversation/src/index.ts',
    'docs/phase4a/ARCHITECTURE_SYMBOL_MAP.md',
    'build:harness'
  ],
  'P4A-CONV-001': [
    'packages/conversation/src/contracts.ts',
    'packages/conversation/src/state.ts',
    'packages/conversation/src/__tests__/state.test.ts'
  ],
  'P4A-STATE-001': [
    'packages/conversation/src/state.ts',
    'packages/conversation/src/context-adapter.ts',
    'packages/conversation/src/__tests__/state.test.ts'
  ],
  'P4A-INTERP-001': [
    'packages/conversation/src/interpreter.ts',
    'packages/conversation/src/__tests__/conversation.test.ts',
    'tests/phase4a/conversation-adversarial.test.ts'
  ],
  'P4A-CORRECT-001': [
    'packages/conversation/src/state.ts',
    'packages/conversation/src/dialogue-manager.ts',
    'tests/phase4a/conversation-adversarial.test.ts'
  ],
  'P4A-REF-001': [
    'packages/conversation/src/dialogue-manager.ts',
    'tests/phase4a/conversation-adversarial.test.ts',
    'tests/phase4a/golden-corpus.test.ts'
  ],
  'P4A-SIDE-001': [
    'packages/conversation/src/dialogue-manager.ts',
    'packages/conversation/src/__tests__/service.integration.test.ts'
  ],
  'P4A-ACTION-001': [
    'packages/conversation/src/harness-bridge.ts',
    'tests/phase4a/public-harness-integration.test.ts'
  ],
  'P4A-APPROVAL-001': [
    'packages/conversation/src/memory-store.ts',
    'examples/phase4a/service-desk.ts',
    'tests/phase4a/service-desk-journey.test.ts'
  ],
  'P4A-GROUND-001': [
    'packages/conversation/src/response-composer.ts',
    'packages/conversation/src/conversation-service.ts',
    'packages/conversation/src/__tests__/conversation.test.ts'
  ],
  'P4A-DELIVERY-001': [
    'packages/conversation/src/delivery.ts',
    'packages/conversation/src/__tests__/conversation.test.ts'
  ],
  'P4A-CRASH-001': [
    'packages/conversation/src/postgres-store.ts',
    'packages/conversation/src/delivery.ts',
    'packages/conversation/src/__tests__/postgres-conversation.integration.test.ts'
  ],
  'P4A-TENANT-001': [
    'packages/conversation/src/memory-store.ts',
    'packages/conversation/src/postgres-store.ts',
    'packages/persistence/migrations/0020_conversation_intelligence.sql'
  ],
  'P4A-CONCURRENCY-001': [
    'packages/conversation/src/memory-store.ts',
    'tests/phase4a/conversation-adversarial.test.ts',
    'packages/conversation/src/__tests__/postgres-conversation.integration.test.ts'
  ],
  'P4A-SEC-001': [
    'tests/phase4a/conversation-adversarial.test.ts',
    'docs/phase4a/THREAT_MODEL.md',
    'docs/phase4a/SECURITY_REVIEW.md'
  ],
  'P4A-CONSUMER-001': [
    'examples/phase4a/service-desk.ts',
    'examples/phase4a/knowledge-assistant.ts',
    'tests/phase4a/service-desk-journey.test.ts'
  ],
  'P4A-EVAL-001': [
    'tests/phase4a/golden-corpus.ts',
    'tests/phase4a/golden-trajectories.ts',
    'scripts/phase4a-golden-evidence.ts',
    'scripts/phase4a-performance.ts',
    'scripts/phase4a-verify.mjs',
    'docs/phase4a/QUALITY_BAR.json'
  ]
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function fileHash(path) {
  const bytes = readFileSync(join(repo, path))
  return { path, bytes: bytes.byteLength, sha256: sha256(bytes) }
}

function walk(path) {
  const absolute = join(repo, path)
  if (!existsSync(absolute)) return []
  if (statSync(absolute).isFile()) return [path]
  const result = []
  for (const entry of readdirSync(absolute).sort()) {
    const child = join(path, entry)
    if (statSync(join(repo, child)).isDirectory()) result.push(...walk(child))
    else result.push(child)
  }
  return result
}

function sourceFiles() {
  const paths = new Set()
  for (const root of implementationRoots)
    for (const path of walk(root)) paths.add(path)
  const docsRoot = join(repo, 'docs', 'phase4a')
  for (const entry of readdirSync(docsRoot).sort()) {
    if (
      entry === 'evidence' ||
      entry === 'prompts' ||
      excludedPhase4aDocs.has(entry)
    )
      continue
    const absolute = join(docsRoot, entry)
    if (statSync(absolute).isFile() && entry.endsWith('.md'))
      paths.add(relative(repo, absolute))
  }
  for (const path of walk('docs/phase4a/prompts')) {
    if (path.includes('/AAA-4A-')) continue
    paths.add(path)
  }
  return [...paths].sort().map(fileHash)
}

function canonicalFiles(files) {
  return files
    .map((file) => `${file.path}\0${file.bytes}\0${file.sha256}\n`)
    .join('')
}

function runCheck(label, command, args) {
  const result = spawnSync(command, args, {
    cwd: repo,
    encoding: 'utf8',
    env: { ...process.env, CI: '1' },
    maxBuffer: 8 * 1024 * 1024
  })
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
  return {
    label,
    command: [command, ...args].join(' '),
    exitCode: result.error ? 1 : (result.status ?? 1),
    outputTail:
      `${output}${result.error ? `\nspawn error: ${result.error.message}` : ''}`.slice(
        -4_000
      ),
    ...(result.error ? { errorCode: result.error.code ?? 'SPAWN_ERROR' } : {})
  }
}

function writeJson(name, value) {
  writeFileSync(join(evidenceDir, name), `${JSON.stringify(value, null, 2)}\n`)
}

function parseTestCount(output) {
  const match = output.match(/Tests\s+(\d+) passed(?:\s+\|\s+(\d+) skipped)?/)
  return match
    ? { passed: Number(match[1]), skipped: Number(match[2] ?? 0) }
    : null
}

function candidateBoundEvidence(name, candidateId, candidateDigest) {
  try {
    const value = JSON.parse(readFileSync(join(evidenceDir, name), 'utf8'))
    return (
      value.candidateId === candidateId &&
      value.candidateDigest === candidateDigest &&
      value.candidateBound === true
    )
  } catch {
    return false
  }
}

function currentCritics(expectedCandidateId, expectedCandidateDigest) {
  const criticDir = join(evidenceDir, 'critics')
  const requiredCriticCount = 3
  if (!existsSync(criticDir))
    return {
      status: 'PENDING',
      requiredCount: requiredCriticCount,
      reports: [],
      axisScores: null
    }
  const reports = readdirSync(criticDir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((name) => {
      const path = `docs/phase4a/evidence/critics/${name}`
      const text = readFileSync(join(repo, path), 'utf8')
      const first = text.trim().split(/\r?\n/, 1)[0] ?? ''
      const candidateBound =
        text.includes(expectedCandidateId) &&
        text.includes(expectedCandidateDigest)
      const scoreLine = text
        .split(/\r?\n/)
        .find((line) => line.startsWith('AXIS_SCORES_JSON='))
      let axisScores = null
      if (scoreLine) {
        try {
          const candidate = JSON.parse(
            scoreLine.slice('AXIS_SCORES_JSON='.length)
          )
          if (
            candidate &&
            typeof candidate === 'object' &&
            Object.values(candidate).every(
              (value) => typeof value === 'number' && value >= 0 && value <= 100
            )
          )
            axisScores = candidate
        } catch {
          axisScores = null
        }
      }
      return {
        path,
        verdict: first,
        candidateBound,
        axisScores,
        ...fileHash(path)
      }
    })
  if (reports.some((report) => report.verdict.startsWith('BLOCK')))
    return {
      status: 'BLOCK',
      requiredCount: requiredCriticCount,
      reports,
      axisScores: null
    }
  if (reports.some((report) => !report.candidateBound))
    return {
      status: 'BLOCK',
      reason: 'UNBOUND_CRITIC_REPORT',
      requiredCount: requiredCriticCount,
      reports,
      axisScores: null
    }
  const scoreKeys = [
    'architecture',
    'reliability',
    'grounding',
    'transactionIntegrity',
    'knowledge',
    'security',
    'naturalness',
    'generality'
  ]
  const completeScores = reports.every(
    (report) =>
      report.axisScores &&
      scoreKeys.every((key) => typeof report.axisScores[key] === 'number')
  )
  const axisScores = completeScores
    ? Object.fromEntries(
        scoreKeys.map((key) => [
          key,
          Math.min(...reports.map((report) => report.axisScores[key]))
        ])
      )
    : null
  if (
    reports.length >= requiredCriticCount &&
    reports.every((report) => report.verdict.startsWith('APPROVE'))
  )
    return {
      status: 'APPROVE',
      requiredCount: requiredCriticCount,
      reports,
      axisScores
    }
  return {
    status: 'PENDING',
    requiredCount: requiredCriticCount,
    reports,
    axisScores
  }
}

function certify() {
  mkdirSync(evidenceDir, { recursive: true })
  const qualityBar = JSON.parse(readFileSync(qualityBarPath, 'utf8'))
  const files = sourceFiles()
  const candidateDigest = sha256(canonicalFiles(files))
  const candidateId = `aaa4a-${candidateDigest.slice(0, 16)}`
  const promptCopy = fileHash('docs/phase4a/PROMPT_COPY_2026-09-17.md')
  const pgAvailable =
    Boolean(process.env.TEST_DATABASE_URL) &&
    process.env.PHASE4A_DISPOSABLE_PG === '1'
  // Freeze and publish the candidate identity before evidence-producing
  // commands run. Their JSON must carry the same candidate binding.
  writeJson('CANDIDATE.json', {
    schemaVersion: 1,
    candidateId,
    candidateDigest,
    generatedAt: new Date().toISOString(),
    promptCopySha256: promptCopy.sha256,
    files
  })
  const checks = [
    runCheck('focused-tests', 'npm', ['run', 'test:phase4a']),
    runCheck('structural-and-focused-verifier', 'npm', [
      'run',
      'verify:phase4a'
    ]),
    runCheck('synthetic-demo', 'node', [
      '--import',
      'tsx',
      'scripts/phase4a-demo.ts'
    ]),
    runCheck('repository-typecheck', 'npx', [
      'tsc',
      '-p',
      'tsconfig.typecheck.json',
      '--noEmit'
    ]),
    runCheck('frozen-harness-build', 'npm', ['run', 'build:harness']),
    runCheck('golden-evidence', 'npm', ['run', 'evidence:phase4a:golden']),
    runCheck('performance-evidence', 'npm', [
      'run',
      'evidence:phase4a:performance'
    ])
  ]
  const generatedEvidenceBound =
    candidateBoundEvidence(
      'GOLDEN_RESULTS.json',
      candidateId,
      candidateDigest
    ) &&
    candidateBoundEvidence(
      'PERFORMANCE_RESULTS.json',
      candidateId,
      candidateDigest
    )
  const evidenceBindingCheck = {
    label: 'candidate-bound-evidence',
    command: 'internal candidate binding check',
    exitCode: generatedEvidenceBound ? 0 : 1,
    outputTail: generatedEvidenceBound
      ? 'Golden and performance evidence are bound to the frozen candidate.'
      : 'Generated golden or performance evidence is not bound to the frozen candidate.'
  }
  const checksForEvidence = [...checks, evidenceBindingCheck]
  const checksPass = checksForEvidence.every((check) => check.exitCode === 0)
  const testCount =
    parseTestCount(checks[0].outputTail) ?? parseTestCount(checks[1].outputTail)
  const critics = currentCritics(candidateId, candidateDigest)
  const statuses = Object.fromEntries(
    qualityBar.criteria.map((criterion) => [criterion.id, 'PROVEN_CONTROLLED'])
  )
  if (!checksPass) {
    for (const id of Object.keys(statuses)) statuses[id] = 'FAILED_EXECUTION'
  }
  for (const id of ['P4A-CRASH-001', 'P4A-TENANT-001', 'P4A-CONCURRENCY-001']) {
    if (checksPass && !pgAvailable) statuses[id] = 'PARTIAL_ENVIRONMENT'
  }
  if (checksPass && (!pgAvailable || critics.status !== 'APPROVE'))
    statuses['P4A-EVAL-001'] = 'PARTIAL_ENVIRONMENT'
  if (critics.status === 'BLOCK') statuses['P4A-EVAL-001'] = 'FAILED_CRITIC'
  const axisScores = critics.axisScores
  const axisFloors = Object.fromEntries(
    qualityBar.criteria.length > 0
      ? [
          ['architecture', 90],
          ['reliability', 90],
          ['grounding', 90],
          ['transactionIntegrity', 90],
          ['knowledge', 90],
          ['security', 90],
          ['naturalness', 90],
          ['generality', 90]
        ]
      : []
  )
  const axisFloorFailure =
    axisScores !== null &&
    Object.entries(axisFloors).some(([key, floor]) => axisScores[key] < floor)
  const hasFailure =
    !checksPass || critics.status === 'BLOCK' || axisFloorFailure
  const hasPartial =
    Object.values(statuses).some((status) => status !== 'PROVEN_CONTROLLED') ||
    critics.status !== 'APPROVE' ||
    axisScores === null
  const decision = hasFailure
    ? 'FAIL'
    : hasPartial
      ? 'CONDITIONAL_PASS'
      : 'PASS'
  const generatedAt = new Date().toISOString()
  const evidence = {
    schemaVersion: 1,
    runId: 'AAA-4A-20260917',
    generatedAt,
    candidateId,
    candidateDigest,
    promptCopySha256: promptCopy.sha256,
    controlledScope: 'synthetic-local-only',
    production: 'NO_GO',
    criteria: qualityBar.criteria.map((criterion) => ({
      id: criterion.id,
      status: statuses[criterion.id],
      priority: criterion.priority,
      evidence: criterionEvidence[criterion.id] ?? [],
      required: criterion.required
    })),
    checks: checksForEvidence,
    testCount,
    postgresql: {
      status: pgAvailable ? 'EXECUTED' : 'SKIPPED',
      reason: pgAvailable
        ? 'TEST_DATABASE_URL and PHASE4A_DISPOSABLE_PG=1 were set'
        : 'TEST_DATABASE_URL or PHASE4A_DISPOSABLE_PG=1 was absent'
    },
    critics,
    decision,
    axisScores,
    limitations: [
      'No real data, provider, channel, credential, appointment, clinical or financial action was used.',
      'Production and unrestricted deployment remain NO_GO.',
      ...(pgAvailable
        ? []
        : [
            'Disposable PostgreSQL durability, RLS and cross-process contention were not executed in this environment.'
          ]),
      ...(critics.status === 'APPROVE'
        ? []
        : [
            'Fresh independent critic approval is not yet bound to this candidate.'
          ])
    ]
  }
  writeJson('CANDIDATE.json', {
    schemaVersion: 1,
    candidateId,
    candidateDigest,
    generatedAt,
    promptCopySha256: promptCopy.sha256,
    files
  })
  writeJson('ACCEPTANCE_STATUS.json', evidence)
  writeJson('EVIDENCE_GRAPH.json', {
    schemaVersion: 1,
    candidateId,
    candidateDigest,
    nodes: qualityBar.criteria.map((criterion) => ({
      id: criterion.id,
      status: statuses[criterion.id],
      implementation: criterionEvidence[criterion.id] ?? [],
      proof:
        criterionEvidence[criterion.id]?.filter(
          (item) => item.endsWith('.test.ts') || item.includes(':')
        ) ?? []
    }))
  })
  writeJson('RESULT.json', {
    schemaVersion: 1,
    runId: evidence.runId,
    generatedAt,
    candidateId,
    candidateDigest,
    decision,
    production: 'NO_GO',
    controlledScope: 'synthetic-local-only',
    axisScores,
    criteria: evidence.criteria,
    checks: checksForEvidence.map(({ label, command, exitCode }) => ({
      label,
      command,
      exitCode
    })),
    postgresql: evidence.postgresql,
    critics: evidence.critics,
    limitations: evidence.limitations
  })
  writeJson('PHASE4A_REQUIREMENTS_MANIFEST.json', {
    schemaVersion: 1,
    qualityBar: qualityBar.version,
    promptCopySha256: promptCopy.sha256,
    candidateId,
    candidateDigest,
    criteria: evidence.criteria,
    production: 'NO_GO'
  })
  const evidenceFiles = readdirSync(evidenceDir)
    .filter(
      (name) =>
        name.endsWith('.json') &&
        name !== 'EVIDENCE_MANIFEST.json' &&
        name !== 'SENTINEL.json'
    )
    .sort()
  const criticFiles = existsSync(join(evidenceDir, 'critics'))
    ? walk('docs/phase4a/evidence/critics').map(fileHash)
    : []
  const artifacts = [
    ...evidenceFiles.map((name) => fileHash(`docs/phase4a/evidence/${name}`)),
    ...criticFiles
  ].sort((a, b) => a.path.localeCompare(b.path))
  writeJson('EVIDENCE_MANIFEST.json', {
    schemaVersion: 1,
    generatedAt,
    runId: evidence.runId,
    candidateId,
    candidateDigest,
    artifacts,
    production: 'NO_GO'
  })
  console.log(
    JSON.stringify(
      {
        event: 'phase4a.certify',
        candidateId,
        candidateDigest,
        decision,
        testCount,
        postgresql: evidence.postgresql,
        critics: critics.status
      },
      null,
      2
    )
  )
  if (decision === 'FAIL') process.exitCode = 1
}

function sentinel() {
  const candidate = JSON.parse(
    readFileSync(join(evidenceDir, 'CANDIDATE.json'), 'utf8')
  )
  const recomputed = sourceFiles()
  const recomputedDigest = sha256(canonicalFiles(recomputed))
  const artifactPaths = readdirSync(evidenceDir)
    .filter((name) => name.endsWith('.json') && name !== 'SENTINEL.json')
    .map((name) => `docs/phase4a/evidence/${name}`)
  const criticPaths = existsSync(join(evidenceDir, 'critics'))
    ? walk('docs/phase4a/evidence/critics')
    : []
  const artifactHashes = [...artifactPaths, ...criticPaths].sort().map(fileHash)
  const sentinelDigest = sha256(
    `${candidate.candidateDigest}\n${canonicalFiles(artifactHashes)}`
  )
  writeJson('SENTINEL.json', {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    candidateId: candidate.candidateId,
    candidateDigest: candidate.candidateDigest,
    recomputedCandidateDigest: recomputedDigest,
    sourceCandidateUnchanged: candidate.candidateDigest === recomputedDigest,
    artifacts: artifactHashes,
    sentinelDigest,
    production: 'NO_GO'
  })
  console.log(
    JSON.stringify(
      {
        event: 'phase4a.sentinel',
        candidateId: candidate.candidateId,
        sourceCandidateUnchanged:
          candidate.candidateDigest === recomputedDigest,
        sentinelDigest
      },
      null,
      2
    )
  )
  if (candidate.candidateDigest !== recomputedDigest) process.exitCode = 1
}

if (process.argv.includes('--sentinel')) sentinel()
else certify()
