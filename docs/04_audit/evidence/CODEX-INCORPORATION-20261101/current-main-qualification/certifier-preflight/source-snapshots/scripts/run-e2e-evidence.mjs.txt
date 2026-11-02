#!/usr/bin/env node
/** Run one Playwright invocation and bind its JSON/JUnit evidence to one attempt. */
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateE2eReportPair } from './lib/e2e-report-binding.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const jsonPath = path.join(root, 'certification/e2e-test-report.json')
const xmlPath = path.join(root, 'playwright-results.xml')
const runId = process.env.CI_RUN_ID
const candidateId = process.env.CI_CANDIDATE_ID
if (!runId || !/^[0-9a-f]{64}$/.test(candidateId ?? '')) {
  throw new Error('e2e_evidence_binding_missing_or_invalid')
}
const executionId = randomUUID()
for (const report of [jsonPath, xmlPath]) {
  if (fs.existsSync(report)) fs.rmSync(report)
}
const startedMs = Date.now()
const result = spawnSync('npm', ['run', 'test:e2e'], {
  cwd: root,
  env: {
    ...process.env,
    PLAYWRIGHT_JSON_OUTPUT_NAME: 'certification/e2e-test-report.json',
    PLAYWRIGHT_JUNIT_SUITE_ID: runId,
    PLAYWRIGHT_JUNIT_SUITE_NAME: `candidateId=${candidateId};executionId=${executionId}`,
    CVG_E2E_EXECUTION_ID: executionId
  },
  encoding: 'utf8',
  maxBuffer: 128 * 1024 * 1024,
  timeout: 3_600_000
})
if (result.stdout) process.stdout.write(result.stdout)
if (result.stderr) process.stderr.write(result.stderr)
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status ?? 1)
for (const report of [jsonPath, xmlPath]) {
  const stat = fs.existsSync(report) ? fs.statSync(report) : undefined
  if (!stat || stat.size === 0 || stat.mtimeMs + 2000 < startedMs) {
    throw new Error(
      `e2e_evidence_missing_or_stale:${path.relative(root, report)}`
    )
  }
}
const checked = validateE2eReportPair({
  jsonContent: fs.readFileSync(jsonPath),
  xmlContent: fs.readFileSync(xmlPath),
  expectedRunId: runId,
  expectedCandidateId: candidateId
})
if (checked.executionId !== executionId) {
  throw new Error('e2e_evidence_execution_mismatch')
}
process.stdout.write(
  `[e2e-evidence] runId=${runId} candidateId=${candidateId} executionId=${executionId} tests=${checked.testCount} PASS\n`
)
