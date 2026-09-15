#!/usr/bin/env node
/**
 * Dependency license review for package-lock.json. Denies copyleft licenses
 * that are incompatible with the project distribution model, classifies every
 * workspace package as internal (using the project license) and requires an
 * explicit, unexpired human exception for any third-party package whose
 * license cannot be determined. Records the full report at
 * certification/license-report.json.
 *
 * Idempotence: when the freshly computed report (ignoring volatile fields such
 * as generatedAt/timestamp) matches the existing report, the file is left
 * untouched byte-for-byte; it is only rewritten when missing, unreadable or
 * when the stable content actually changed.
 *
 * Self-check (no workspace writes): node scripts/check-licenses.mjs --self-test
 *
 * Exceptions file (optional): certification/license-exceptions.json
 *   [{ name, version?, license, authority, reason, expiresAt, mitigation }]
 * An exception is only honored when every field is present and expiresAt is a
 * future ISO-8601 timestamp; otherwise the package stays blocked.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const VOLATILE_REPORT_FIELDS = ['generatedAt', 'timestamp']

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function stableReportContent(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
    return null
  const stable = { ...parsed }
  for (const field of VOLATILE_REPORT_FIELDS) delete stable[field]
  return stableJson(stable)
}

function writeReportIfChanged(reportPath, content) {
  if (fs.existsSync(reportPath)) {
    let existing = null
    try {
      existing = fs.readFileSync(reportPath, 'utf8')
    } catch {
      existing = null
    }
    if (existing !== null) {
      const previous = stableReportContent(existing)
      const next = stableReportContent(content)
      if (previous !== null && next !== null && previous === next) {
        return { written: false, reason: 'unchanged' }
      }
    }
  }
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, content)
  return { written: true, reason: 'written' }
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function runSelfTest() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'license-idempotence-'))
  const reportPath = path.join(dir, 'license-report.json')
  const checks = []
  try {
    const serialize = (report) => `${JSON.stringify(report, null, 2)}\n`
    const base = {
      schemaVersion: 2,
      generatedAt: '2026-01-01T00:00:00.000Z',
      total: 2,
      denied: [],
      unknown: [],
      unclassified: []
    }

    const first = writeReportIfChanged(reportPath, serialize(base))
    const firstHash = sha256File(reportPath)
    checks.push({
      id: 'first-run-writes',
      verdict: first.written && fs.existsSync(reportPath) ? 'PASS' : 'FAIL',
      detail: `written=${first.written} sha256=${firstHash}`
    })

    const rerun = writeReportIfChanged(
      reportPath,
      serialize({ ...base, generatedAt: '2026-02-02T00:00:00.000Z' })
    )
    const rerunHash = sha256File(reportPath)
    checks.push({
      id: 'second-run-preserves-bytes',
      verdict: !rerun.written && rerunHash === firstHash ? 'PASS' : 'FAIL',
      detail: `written=${rerun.written} sha256=${rerunHash}`
    })

    const reordered = writeReportIfChanged(
      reportPath,
      serialize({
        unclassified: [],
        unknown: [],
        denied: [],
        total: 2,
        schemaVersion: 2
      })
    )
    const reorderedHash = sha256File(reportPath)
    checks.push({
      id: 'stable-key-order-preserves-bytes',
      verdict:
        !reordered.written && reorderedHash === firstHash ? 'PASS' : 'FAIL',
      detail: `written=${reordered.written} sha256=${reorderedHash}`
    })

    const changed = writeReportIfChanged(
      reportPath,
      serialize({ ...base, generatedAt: '2026-03-03T00:00:00.000Z', total: 3 })
    )
    const changedHash = sha256File(reportPath)
    checks.push({
      id: 'content-change-writes',
      verdict: changed.written && changedHash !== firstHash ? 'PASS' : 'FAIL',
      detail: `written=${changed.written} sha256=${changedHash}`
    })

    fs.writeFileSync(reportPath, '{not json')
    const repaired = writeReportIfChanged(reportPath, serialize(base))
    checks.push({
      id: 'unreadable-repaired',
      verdict: repaired.written ? 'PASS' : 'FAIL',
      detail: `written=${repaired.written}`
    })

    fs.rmSync(reportPath)
    const missing = writeReportIfChanged(reportPath, serialize(base))
    checks.push({
      id: 'missing-writes',
      verdict: missing.written ? 'PASS' : 'FAIL',
      detail: `written=${missing.written}`
    })
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  const verdict = checks.every((check) => check.verdict === 'PASS')
    ? 'PASS'
    : 'FAIL'
  console.log(JSON.stringify({ event: 'licenses.self-test', verdict, checks }))
  if (verdict !== 'PASS') process.exitCode = 1
}

function readWorkspaceLicense(meta) {
  const relative = (meta.resolved ?? '').replace(/^\.\//, '')
  const candidates = [
    path.join(root, relative, 'package.json'),
    path.join(root, relative)
  ]
  for (const file of candidates) {
    if (!file.endsWith('package.json') || !fs.existsSync(file)) continue
    try {
      const workspace = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (typeof workspace.license === 'string' && workspace.license.trim()) {
        return workspace.license.trim()
      }
    } catch {
      return null
    }
  }
  return null
}

function readExceptions(nowMs) {
  const file = path.join(root, 'certification', 'license-exceptions.json')
  if (!fs.existsSync(file)) return { valid: [], invalid: [] }
  let entries
  try {
    entries = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    return { valid: [], invalid: [`unreadable: ${error.message}`] }
  }
  if (!Array.isArray(entries)) {
    return { valid: [], invalid: ['exceptions file must be an array'] }
  }
  const valid = []
  const invalid = []
  for (const entry of entries) {
    const required = [
      'name',
      'license',
      'authority',
      'reason',
      'expiresAt',
      'mitigation'
    ]
    const missing = required.filter(
      (field) => typeof entry?.[field] !== 'string' || !entry[field].trim()
    )
    const expiresAt = Date.parse(entry?.expiresAt ?? '')
    if (missing.length > 0 || Number.isNaN(expiresAt)) {
      invalid.push(`malformed exception for ${entry?.name ?? 'unknown'}`)
      continue
    }
    if (expiresAt <= nowMs) {
      invalid.push(`expired exception for ${entry.name} at ${entry.expiresAt}`)
      continue
    }
    valid.push(entry)
  }
  return { valid, invalid }
}

function main() {
  const lock = JSON.parse(
    fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8')
  )
  const rootPackage = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  )

  const DENIED_PATTERNS = [
    /\bAGPL\b/i,
    /^GPL-/i,
    /^GPL\b/i,
    /SSPL/i,
    /BUSL/i,
    /^CPAL/i,
    /^OSL/i,
    /Commons-Clause/i
  ]

  const now = Date.now()
  const exceptions = readExceptions(now)

  const packages = []
  for (const [packagePath, meta] of Object.entries(lock.packages ?? {})) {
    if (!packagePath.startsWith('node_modules/')) continue
    const name = meta.name ?? packagePath.replace(/^node_modules\//, '')
    const linked = meta.link === true
    const rawLicense =
      typeof meta.license === 'string'
        ? meta.license
        : Array.isArray(meta.licenses)
          ? meta.licenses.join(' OR ')
          : null
    const license = linked
      ? (readWorkspaceLicense(meta) ?? rootPackage.license ?? null)
      : rawLicense
    const category = linked
      ? 'internal-workspace'
      : license
        ? 'third-party-classified'
        : 'third-party-unclassified'
    const denied =
      category !== 'internal-workspace' && license
        ? DENIED_PATTERNS.some((pattern) => pattern.test(license))
        : false
    const exception = exceptions.valid.find(
      (entry) =>
        entry.name === name &&
        (entry.version === undefined || entry.version === meta.version)
    )
    packages.push({
      name,
      version: meta.version ?? '0.0.0',
      license,
      dev: meta.dev === true,
      category,
      denied,
      exception: exception ? exception.authority : null
    })
  }

  const denied = packages.filter((entry) => entry.denied)
  const unclassified = packages.filter(
    (entry) =>
      entry.category === 'third-party-unclassified' && entry.exception === null
  )
  const unknown = packages.filter(
    (entry) => entry.license === null && entry.category !== 'internal-workspace'
  )

  const report = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    total: packages.length,
    internalCount: packages.filter(
      (entry) => entry.category === 'internal-workspace'
    ).length,
    deniedCount: denied.length,
    unknownCount: unknown.length,
    unclassifiedCount: unclassified.length,
    invalidExceptions: exceptions.invalid,
    denied,
    unknown: unknown.map((entry) => `${entry.name}@${entry.version}`),
    unclassified: unclassified.map((entry) => `${entry.name}@${entry.version}`)
  }

  writeReportIfChanged(
    path.join(root, 'certification', 'license-report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  )

  console.log(
    JSON.stringify({
      event: 'licenses.checked',
      total: packages.length,
      internal: report.internalCount,
      denied: denied.length,
      unclassified: unclassified.length,
      invalidExceptions: exceptions.invalid.length
    })
  )
  if (
    denied.length > 0 ||
    unclassified.length > 0 ||
    exceptions.invalid.length > 0
  ) {
    process.exitCode = 1
  }
}

if (process.argv.includes('--self-test')) {
  runSelfTest()
} else {
  main()
}
