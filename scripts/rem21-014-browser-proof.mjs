#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import {
  DECLARED_BROWSERS,
  REM21_014_CONTRACT,
  validateRem21014BrowserProofReport
} from './rem21-014-browser-proof-contract.mjs'

const root = process.cwd()
const reportPath = path.resolve(
  process.env.REM21_014_REPORT_PATH ??
    path.join(root, 'certification/rem21-014-browser-proof.json')
)

function resolveBinding() {
  const artifactDir = process.env.CI_ARTIFACT_DIR
  if (artifactDir) {
    const statePath = path.join(artifactDir, 'ci-bar-state.json')
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
      if (
        typeof state.runId === 'string' &&
        typeof state.candidateId === 'string'
      ) {
        return { runId: state.runId, candidateId: state.candidateId }
      }
    }
  }
  return {
    runId:
      process.env.CI_RUN_ID?.trim() ||
      process.env.REM21_014_RUN_ID?.trim() ||
      `run-rem21-014-local-${Date.now()}`,
    candidateId: process.env.CI_CANDIDATE_ID?.trim() || null
  }
}

function collectTests(rawReport) {
  const tests = []
  const axe = { blockingViolations: 0, minorViolations: 0, checkedTests: 0 }

  function visit(suites) {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const project =
            typeof test.projectName === 'string' ? test.projectName : null
          const status =
            typeof test.status === 'string' ? test.status : 'unknown'
          tests.push({ project, title: spec.title, status })
          for (const annotation of test.annotations ?? []) {
            if (annotation.type !== 'axe') continue
            axe.checkedTests += 1
            try {
              const details = JSON.parse(annotation.description ?? '{}')
              for (const violation of details.violations ?? []) {
                if (
                  ['moderate', 'serious', 'critical'].includes(violation.impact)
                ) {
                  axe.blockingViolations += 1
                } else if (violation.impact === 'minor') {
                  axe.minorViolations += 1
                }
              }
            } catch {
              axe.blockingViolations += 1
            }
          }
        }
      }
      visit(suite.suites)
    }
  }

  visit(rawReport?.suites)
  return { tests, axe }
}

function summarize(rawReport, exitCode) {
  const { tests, axe } = collectTests(rawReport)
  const byProject = Object.fromEntries(
    DECLARED_BROWSERS.map((project) => [
      project,
      { passed: 0, failed: 0, skipped: 0, flaky: 0, total: 0 }
    ])
  )
  for (const test of tests) {
    if (!test.project || !byProject[test.project]) continue
    const project = byProject[test.project]
    project.total += 1
    if (test.status === 'expected') project.passed += 1
    else if (test.status === 'skipped') project.skipped += 1
    else if (test.status === 'flaky') project.flaky += 1
    else project.failed += 1
  }
  const stats = rawReport?.stats ?? {}
  const testsSummary = {
    total: tests.length,
    passed: tests.filter((test) => test.status === 'expected').length,
    failed: tests.filter((test) => test.status === 'unexpected').length,
    skipped: tests.filter((test) => test.status === 'skipped').length,
    flaky: tests.filter((test) => test.status === 'flaky').length
  }
  const executed = DECLARED_BROWSERS.filter(
    (project) => byProject[project].total > 0
  )
  return {
    byProject,
    executed,
    tests: testsSummary,
    axe,
    playwright: {
      exitCode,
      rawReportPresent: Boolean(rawReport),
      stats: {
        expected: Number(stats.expected ?? 0),
        skipped: Number(stats.skipped ?? 0),
        unexpected: Number(stats.unexpected ?? 0),
        flaky: Number(stats.flaky ?? 0)
      }
    }
  }
}

function main() {
  const binding = resolveBinding()
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rem21-014-browser-'))
  const rawPath = path.join(tempDir, 'playwright.json')
  const command = path.join(root, 'node_modules/@playwright/test/cli.js')
  const result = spawnSync(
    process.execPath,
    [command, 'test', '--config=playwright.rem21-014.config.ts'],
    {
      cwd: root,
      env: {
        ...process.env,
        PLAYWRIGHT_JSON_OUTPUT_NAME: rawPath
      },
      encoding: 'utf8',
      maxBuffer: 128 * 1024 * 1024,
      timeout: 3_600_000
    }
  )
  const exitCode = result.status ?? 1
  let rawReport = null
  if (fs.existsSync(rawPath)) {
    try {
      rawReport = JSON.parse(fs.readFileSync(rawPath, 'utf8'))
    } catch {
      rawReport = null
    }
  }
  const summary = summarize(rawReport, exitCode)
  const report = {
    schemaVersion: 1,
    kind: 'rem21-014-browser-proof',
    contract: REM21_014_CONTRACT,
    runId: binding.runId,
    candidateId: binding.candidateId,
    node: process.version,
    verdict: 'PASS',
    scope: {
      production: false,
      realData: false,
      externalServices: false,
      identityMode: 'trusted'
    },
    browsers: {
      declared: DECLARED_BROWSERS,
      executed: summary.executed,
      byProject: summary.byProject
    },
    tests: summary.tests,
    axe: summary.axe,
    playwright: summary.playwright,
    limitations: [
      'browser binaries and session store are local/ephemeral fixtures',
      'no IdP, provider, channel, device, real data or production claim'
    ]
  }
  try {
    validateRem21014BrowserProofReport(report, {
      runId: binding.runId,
      ...(binding.candidateId ? { candidateId: binding.candidateId } : {})
    })
  } catch (error) {
    report.verdict = 'FAIL'
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    )
    process.exitCode = 1
    return
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(
    `${JSON.stringify({ ...report, stdout: result.stdout, stderr: result.stderr })}\n`
  )
  if (exitCode !== 0) process.exitCode = exitCode
  fs.rmSync(tempDir, { recursive: true, force: true })
}

main()
