#!/usr/bin/env node
/**
 * Reproduces the coordinator's R1 (AAA13-C5-F01, coverage pct absent) and
 * R2 (AAA13-C5-F02, all chaos assertions skipped) against the public CLI,
 * using the same injection pattern as
 * docs/04_audit/evidence/AAA/AAA-13/review-coordinator-rework-r3/reproduce.py
 * but writing only to the rework-r4 evidence directory. The coordinator's own
 * artifacts are never modified.
 *
 * Usage: node docs/04_audit/evidence/AAA/AAA-13/rework-r4/reproduce-r1r2.mjs
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const root = process.cwd()
const outDir = path.join(root, 'docs/04_audit/evidence/AAA/AAA-13/rework-r4')
const injectedCases = `
  runCliCase('R1', 'coverage percentage absent', 'coverage_raw_invalid:coverage:statements', (state) => {
    rewriteEvidence(state, 'coverage/coverage-summary.json', JSON.stringify({total:{statements:{},branches:{pct:96},functions:{pct:97},lines:{pct:98}}}));
  });
  runCliCase('R2', 'all chaos assertions skipped', 'chaos_raw_invalid', (state) => {
    rewriteEvidence(state, 'certification/chaos-report.json', JSON.stringify({testResults:[{assertionResults:Array.from({length:14},(_,i)=>({title:\`CHAOS-\${String(i+1).padStart(2,'0')} fixture\`,status:'skipped'}))}]}));
    state.result.metrics.chaos={executed:14,passed:0,failed:0,notExecuted:0};
  });
`

const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'aaa13-r1r2-'))
try {
  for (const relative of [
    'scripts/lib/certification-rules.mjs',
    'scripts/phase10-verify.mjs'
  ]) {
    const target = path.join(fixture, relative)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.copyFileSync(path.join(root, relative), target)
  }
  fs.symlinkSync(
    path.join(root, 'node_modules'),
    path.join(fixture, 'node_modules'),
    'dir'
  )
  fs.mkdirSync(path.join(fixture, 'certification'), { recursive: true })
  const verifyPath = path.join(fixture, 'scripts/phase10-verify.mjs')
  let source = fs.readFileSync(verifyPath, 'utf8')
  const marker = '  const verdict = checks.every'
  if (!source.includes(marker)) {
    console.error('injection marker not found; harness changed')
    process.exit(2)
  }
  source = source.replace(marker, `${injectedCases}\n${marker}`)
  fs.writeFileSync(verifyPath, source)

  const run = spawnSync(
    process.execPath,
    ['scripts/phase10-verify.mjs', '--self-test'],
    { cwd: fixture, encoding: 'utf8' }
  )
  fs.writeFileSync(path.join(outDir, 'r1r2.stdout.log'), run.stdout ?? '')
  fs.writeFileSync(path.join(outDir, 'r1r2.stderr.log'), run.stderr ?? '')
  fs.copyFileSync(
    path.join(fixture, 'certification/negative-validation.json'),
    path.join(outDir, 'r1r2-results.json')
  )
  const results = JSON.parse(
    fs.readFileSync(path.join(outDir, 'r1r2-results.json'), 'utf8')
  )
  const observed = results.checks.filter((check) =>
    ['R1', 'R2'].includes(check.id)
  )
  for (const check of observed) {
    console.log(
      JSON.stringify({
        id: check.id,
        attack: check.attack,
        expectedCode: check.expectedCode,
        observed: check.observed,
        failures: check.failures,
        verdict: check.verdict
      })
    )
  }
  console.log(
    JSON.stringify({
      adversarialSelfTestExit: run.status,
      verdict: results.verdict
    })
  )
} finally {
  fs.rmSync(fixture, { recursive: true, force: true })
}
