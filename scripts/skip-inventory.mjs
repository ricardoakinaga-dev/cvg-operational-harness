#!/usr/bin/env node
import {
  buildCandidateRecord,
  collectCandidateFiles
} from './lib/certification-rules.mjs'
import {
  buildSkipInventory,
  loadSkipCatalog,
  runSkipGovernanceSelfTest
} from './lib/skip-governance.mjs'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()

function runVerification() {
  const candidate = buildCandidateRecord({
    root,
    files: collectCandidateFiles(root)
  })
  const reports = [
    ['unit', 'certification/unit-test-report.json'],
    ['postgres', 'certification/postgres-test-report.json'],
    ['chaos', 'certification/chaos-report.json'],
    ['e2e', 'certification/e2e-test-report.json']
  ]
  const missing = reports
    .filter(([, relativePath]) => !fs.existsSync(path.join(root, relativePath)))
    .map(([, relativePath]) => `skip_report_missing_input:${relativePath}`)
  if (missing.length > 0) {
    const result = {
      schemaVersion: 1,
      kind: 'aud20-skip-inventory',
      verdict: 'FAIL',
      failures: missing
    }
    process.stdout.write(`${JSON.stringify(result)}\n`)
    return 1
  }
  const inventory = buildSkipInventory({
    root,
    catalog: loadSkipCatalog(root),
    reports: reports.map(([gate, relativePath]) => ({
      gate,
      path: relativePath
    })),
    runId: process.env.CI_RUN_ID ?? `run-local-${Date.now().toString(36)}`,
    candidateId: process.env.CI_CANDIDATE_ID ?? candidate.candidateId
  })
  fs.writeFileSync(
    path.join(root, 'certification/skip-inventory.json'),
    `${JSON.stringify(inventory, null, 2)}\n`
  )
  process.stdout.write(`${JSON.stringify(inventory)}\n`)
  return inventory.verdict === 'PASS' ? 0 : 1
}

if (process.argv.includes('--self-test')) {
  const result = runSkipGovernanceSelfTest()
  process.stdout.write(`${JSON.stringify(result)}\n`)
  process.exitCode = result.verdict === 'PASS' ? 0 : 1
} else if (process.argv.includes('--verify')) {
  process.exitCode = runVerification()
} else {
  process.stderr.write(
    'usage: node scripts/skip-inventory.mjs --verify|--self-test\n'
  )
  process.exitCode = 2
}
