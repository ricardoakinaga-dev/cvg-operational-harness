#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  collectCandidateFiles,
  computeCandidateId
} from './lib/certification-rules.mjs'
import {
  manifestDigest,
  validateMutationManifest
} from './lib/mutation-governance.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = process.env.MUTATION_MANIFEST_PATH
  ? path.resolve(process.env.MUTATION_MANIFEST_PATH)
  : path.join(root, 'scripts', 'mutation-manifest.json')
const outputPath = path.join(root, 'certification', 'mutation-guard.json')

const COPY_EXCLUDED_PREFIXES = [
  '.git/',
  'node_modules/',
  'coverage/',
  'test-results/',
  'playwright-report/',
  'blob-report/',
  '.gauntlet/',
  '.opencode/',
  'certification/',
  'docs/04_audit/evidence/'
]

function normalizePath(value) {
  return value.split(path.sep).join('/')
}

function readManifest() {
  return JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
}

function candidateBinding() {
  const candidateId = computeCandidateId(collectCandidateFiles(root))
  if (
    process.env.CI_CANDIDATE_ID &&
    process.env.CI_CANDIDATE_ID !== candidateId
  ) {
    throw new Error(
      `ci_candidate_mismatch:${process.env.CI_CANDIDATE_ID}:${candidateId}`
    )
  }
  return candidateId
}

function runBinding(candidateId) {
  return (
    process.env.CI_RUN_ID ??
    `run-${candidateId.slice(0, 12)}-${Date.now().toString(36)}`
  )
}

function shouldCopy(source) {
  const relative = normalizePath(path.relative(root, source))
  if (!relative) return true
  const firstSegment = relative.split('/')[0]
  if (firstSegment?.startsWith('.gauntlet-')) return false
  return !COPY_EXCLUDED_PREFIXES.some(
    (prefix) => relative === prefix.slice(0, -1) || relative.startsWith(prefix)
  )
}

function createWorkspace() {
  const temporaryRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), 'rem21-013-mutation-')
  )
  fs.cpSync(root, temporaryRoot, {
    recursive: true,
    filter: shouldCopy
  })
  const nodeModules = path.join(root, 'node_modules')
  if (fs.existsSync(nodeModules)) {
    fs.symlinkSync(nodeModules, path.join(temporaryRoot, 'node_modules'), 'dir')
  }
  fs.mkdirSync(path.join(temporaryRoot, 'certification'), { recursive: true })
  return temporaryRoot
}

function outputFor(result) {
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim()
  return output.length > 12_000 ? output.slice(-12_000) : output
}

function classifyProcess(result) {
  if (result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
    return 'TIMEOUT'
  }
  if (result.error) return 'ERROR'
  return result.status === 0 ? 'SURVIVED' : 'KILLED'
}

function mutationEnvironment() {
  const environment = {
    ...process.env,
    CI: process.env.CI ?? 'true',
    NODE_ENV: 'test'
  }
  delete environment.TEST_DATABASE_URL
  delete environment.CI_CANDIDATE_ID
  delete environment.CI_RUN_ID
  return environment
}

function runMutation(mutation, temporaryRoot, environment) {
  const sourcePath = path.join(temporaryRoot, mutation.source)
  const source = fs.readFileSync(sourcePath, 'utf8')
  fs.writeFileSync(sourcePath, source.replace(mutation.from, mutation.to))
  const startedAt = Date.now()
  let observed
  if (mutation.mode === 'driver') {
    const driver = `import * as gate from ${JSON.stringify(pathToFileURL(sourcePath).href)}\n${mutation.driver}`
    observed = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', driver],
      {
        cwd: temporaryRoot,
        env: environment,
        encoding: 'utf8',
        timeout: mutation.budgetMs,
        maxBuffer: 32 * 1024 * 1024
      }
    )
  } else {
    observed = spawnSync(
      process.execPath,
      [
        path.join(temporaryRoot, 'node_modules', 'vitest', 'vitest.mjs'),
        'run',
        ...mutation.testFiles,
        '--no-file-parallelism',
        '--maxWorkers=1',
        '--reporter=dot'
      ],
      {
        cwd: temporaryRoot,
        env: environment,
        encoding: 'utf8',
        timeout: mutation.budgetMs,
        maxBuffer: 64 * 1024 * 1024
      }
    )
  }
  return {
    id: mutation.id,
    domain: mutation.domain,
    mode: mutation.mode,
    source: mutation.source,
    sourceSha256: mutation.sourceSha256,
    from: mutation.from,
    to: mutation.to,
    testFiles: mutation.testFiles ?? [],
    budgetMs: mutation.budgetMs,
    durationMs: Date.now() - startedAt,
    status: classifyProcess(observed),
    exitCode: observed.status ?? 1,
    signal: observed.signal ?? null,
    output: outputFor(observed)
  }
}

function baseReport({ manifest, candidateId, runId, validation }) {
  return {
    schemaVersion: 2,
    kind: 'aud21-risk-mutation-guard',
    contract: manifest?.contract ?? 'unknown',
    generatedAt: new Date().toISOString(),
    nodeVersion: process.versions.node,
    runId,
    candidateId,
    manifestSha256: manifest ? manifestDigest(manifest) : null,
    domains: validation?.domains ?? [],
    selected: validation?.mutationCount ?? 0,
    killed: 0,
    survived: 0,
    timedOut: 0,
    errors: 0,
    mutations: [],
    verdict: 'FAIL'
  }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

function main() {
  let manifest
  let candidateId
  let runId
  try {
    manifest = readManifest()
    candidateId = candidateBinding()
    runId = runBinding(candidateId)
    const validation = validateMutationManifest(manifest, { root })
    const report = baseReport({ manifest, candidateId, runId, validation })
    const temporaryRoot = createWorkspace()
    try {
      const environment = mutationEnvironment()
      for (const mutation of manifest.mutations) {
        const result = runMutation(mutation, temporaryRoot, environment)
        report.mutations.push(result)
        if (result.status === 'KILLED') report.killed += 1
        if (result.status === 'SURVIVED') report.survived += 1
        if (result.status === 'TIMEOUT') report.timedOut += 1
        if (result.status === 'ERROR') report.errors += 1
        fs.writeFileSync(
          path.join(temporaryRoot, mutation.source),
          fs.readFileSync(path.join(root, mutation.source), 'utf8')
        )
      }
    } finally {
      fs.rmSync(temporaryRoot, { recursive: true, force: true })
    }
    report.verdict =
      report.killed === report.selected &&
      report.survived === 0 &&
      report.timedOut === 0 &&
      report.errors === 0
        ? 'PASS'
        : 'FAIL'
    writeReport(report)
    return report.verdict === 'PASS' ? 0 : 1
  } catch (error) {
    const safeCandidateId = candidateId ?? process.env.CI_CANDIDATE_ID ?? null
    const safeRunId = runId ?? process.env.CI_RUN_ID ?? null
    const report = baseReport({
      manifest,
      candidateId: safeCandidateId,
      runId: safeRunId,
      validation: null
    })
    report.errors = 1
    report.failure = error instanceof Error ? error.message : String(error)
    writeReport(report)
    process.stderr.write(`${report.failure}\n`)
    return 1
  }
}

process.exitCode = main()
