#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildCoverageReport,
  readCoverageSummary
} from './lib/coverage-gate.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const summaryPath = path.join(root, 'coverage', 'coverage-summary.json')
const manifestPath = path.join(
  root,
  'scripts',
  'critical-coverage-manifest.json'
)
const outputPath = path.join(root, 'certification', 'critical-coverage.json')

const summary = readCoverageSummary(summaryPath)
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
const report = buildCoverageReport(summary, manifest, {
  generatedAt: new Date().toISOString(),
  source: 'coverage/coverage-summary.json',
  manifest: 'scripts/critical-coverage-manifest.json'
})

fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`)
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exitCode = report.verdict === 'PASS' ? 0 : 1
