#!/usr/bin/env node
// SPEC0259 §4.11 — runner of the three-host browser proof (Q8 and Q9): runs
// Playwright with playwright.oidc-hosts.config.ts, summarizes the JSON
// report and writes the report after the contract check (DB7). The report
// lives under certification/logs/, which the candidate inventory, the
// candidate drift check and prettier already exclude as generated output.
// Outside test:core, coverage and certify (O6).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'
import {
  OIDC_HOSTS_CONTRACT,
  validateOidcHostsBrowserProofReport
} from './oidc-hosts-browser-proof-contract.mjs'

const root = process.cwd()
const reportPath = path.resolve(
  process.env.OIDC_HOSTS_REPORT_PATH ??
    path.join(root, 'certification/logs/oidc-hosts-browser-proof.json')
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
      process.env.OIDC_HOSTS_RUN_ID?.trim() ||
      `run-oidc-hosts-local-${Date.now()}`,
    candidateId: process.env.CI_CANDIDATE_ID?.trim() || null
  }
}

function summarize(rawReport, exitCode) {
  const tests = []
  const axe = { blockingViolations: 0, minorViolations: 0, states: [] }
  let s0 = null
  let pacer = null
  const visit = (suites) => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          tests.push({
            title: spec.title,
            status: typeof test.status === 'string' ? test.status : 'unknown'
          })
          for (const annotation of test.annotations ?? []) {
            let details
            try {
              details = JSON.parse(annotation.description ?? '{}')
            } catch {
              details = null
            }
            if (annotation.type === 'axe') {
              if (!details) {
                axe.blockingViolations += 1
                continue
              }
              axe.states.push(details.state)
              for (const violation of details.violations ?? []) {
                if (['serious', 'critical'].includes(violation.impact)) {
                  axe.blockingViolations += 1
                } else {
                  axe.minorViolations += 1
                }
              }
            }
            if (annotation.type === 's0') s0 = details
            if (annotation.type === 'pacer') pacer = details
          }
        }
      }
      visit(suite.suites)
    }
  }
  visit(rawReport?.suites)
  const stats = rawReport?.stats ?? {}
  return {
    tests: {
      total: tests.length,
      passed: tests.filter((test) => test.status === 'expected').length,
      failed: tests.filter((test) => test.status === 'unexpected').length,
      skipped: tests.filter((test) => test.status === 'skipped').length,
      flaky: tests.filter((test) => test.status === 'flaky').length,
      titles: tests.map((test) => test.title)
    },
    axe,
    s0,
    pacer,
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
  if (process.env.CVG_OIDC_HOSTS_REUSE) {
    process.stderr.write(
      'CVG_OIDC_HOSTS_REUSE is for local iteration only; the proof always starts a fresh environment\n'
    )
    process.exitCode = 2
    return
  }
  const binding = resolveBinding()
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oidc-hosts-browser-'))
  const rawPath = path.join(tempDir, 'playwright.json')
  const command = path.join(root, 'node_modules/@playwright/test/cli.js')
  const env = { ...process.env, PLAYWRIGHT_JSON_OUTPUT_NAME: rawPath }
  delete env.CVG_OIDC_HOSTS_STATE
  const result = spawnSync(
    process.execPath,
    [command, 'test', '--config=playwright.oidc-hosts.config.ts'],
    {
      cwd: root,
      env,
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
    kind: 'oidc-hosts-browser-proof',
    contract: OIDC_HOSTS_CONTRACT,
    spec: 'docs/02_spec/0259_oidc_console_distinct_hosts.md',
    runId: binding.runId,
    candidateId: binding.candidateId,
    node: process.version,
    verdict: 'PASS',
    scope: {
      production: false,
      realData: false,
      externalServices: false,
      identityMode: 'trusted',
      idp: 'synthetic',
      browsers: ['chromium']
    },
    tlsTrust: 'spki-list',
    tests: summary.tests,
    axe: summary.axe,
    s0: summary.s0,
    pacer: summary.pacer,
    playwright: summary.playwright,
    limitations: [
      'synthetic hosts (.test and localhost), ephemeral CA and synthetic IdP',
      'Chromium only; Firefox, WebKit, viewports and UAT belong to UP91-043',
      'the panel 403 comes from the edge: no panel route answers 403 to a role of the synthetic matrix',
      'no real IdP, account, data, deployment or production claim'
    ]
  }
  let valid = true
  try {
    validateOidcHostsBrowserProofReport(report, {
      runId: binding.runId,
      ...(binding.candidateId ? { candidateId: binding.candidateId } : {})
    })
  } catch (error) {
    valid = false
    report.verdict = 'FAIL'
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
    )
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${result.stdout}${result.stderr}`)
  process.stdout.write(
    `${JSON.stringify({ verdict: report.verdict, tests: report.tests.total, passed: report.tests.passed })}\n`
  )
  fs.rmSync(tempDir, { recursive: true, force: true })
  if (!valid) process.exitCode = 1
  else if (exitCode !== 0) process.exitCode = exitCode
}

main()
