import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

export const SKIP_CATALOG_RELATIVE_PATH = 'scripts/skip-catalog.json'
export const SKIP_STATUSES = new Set(['skipped', 'pending', 'todo'])
export const KNOWN_DEDICATED_GATES = new Set([
  'unit',
  'postgres',
  'chaos',
  'e2e'
])
export const REQUIRED_REPORT_GATES = ['unit', 'postgres', 'chaos', 'e2e']

function normalizePath(filePath) {
  return filePath.split(path.sep).join('/')
}

function sha256Bytes(content) {
  return createHash('sha256').update(content).digest('hex')
}

function sourcePath(root, relativePath) {
  return path.join(root, relativePath)
}

function relativeSourcePath(root, filePath) {
  const absolute = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(root, filePath)
  return normalizePath(path.relative(root, absolute))
}

function stableSkipId(contractId, fullName) {
  return `${contractId}-${sha256Bytes(Buffer.from(fullName)).slice(0, 12)}`
}

function isFutureIsoDate(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.endsWith('Z')) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) && timestamp > now
}

export function loadSkipCatalog(root) {
  const catalogPath = sourcePath(root, SKIP_CATALOG_RELATIVE_PATH)
  const parsed = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
  if (parsed.schemaVersion !== 1 || parsed.kind !== 'aud20-skip-catalog') {
    throw new Error('skip catalog schema mismatch')
  }
  return parsed
}

function validateCatalog(root, catalog) {
  const failures = []
  const ids = new Set()
  const files = new Set()

  for (const entry of catalog.entries ?? []) {
    if (!entry.id || ids.has(entry.id)) {
      failures.push(`skip_catalog_duplicate_id:${entry.id ?? 'missing'}`)
    }
    if (entry.file && files.has(entry.file)) {
      failures.push(`skip_catalog_duplicate_file:${entry.file}`)
    }
    ids.add(entry.id)
    files.add(entry.file)
    if (!entry.file || !entry.sourceSha256) {
      failures.push(`skip_catalog_metadata_missing:${entry.id ?? 'missing'}`)
      continue
    }
    if (!entry.reason || !entry.owner || !entry.dedicatedGate) {
      failures.push(`skip_catalog_metadata_missing:${entry.id}`)
    }
    if (!KNOWN_DEDICATED_GATES.has(entry.dedicatedGate)) {
      failures.push(
        `skip_catalog_unknown_gate:${entry.id}:${entry.dedicatedGate}`
      )
    }
    if (!entry.expiresAt) {
      failures.push(`skip_catalog_expiration_missing:${entry.id}`)
    } else if (!isFutureIsoDate(entry.expiresAt)) {
      const timestamp = Date.parse(entry.expiresAt)
      failures.push(
        Number.isFinite(timestamp) && timestamp <= Date.now()
          ? `skip_catalog_expired:${entry.id}`
          : `skip_catalog_expiration_invalid:${entry.id}`
      )
    }
    const absolute = sourcePath(root, entry.file)
    if (!fs.existsSync(absolute)) {
      failures.push(`skip_catalog_source_missing:${entry.file}`)
      continue
    }
    const actualHash = sha256Bytes(fs.readFileSync(absolute))
    if (actualHash !== entry.sourceSha256) {
      failures.push(`skip_catalog_source_drift:${entry.file}`)
    }
  }

  return failures
}

function parseReport(root, report) {
  if (report.value) return report.value
  const absolute = sourcePath(root, report.path)
  if (!fs.existsSync(absolute)) return null
  return JSON.parse(fs.readFileSync(absolute, 'utf8'))
}

function reportHash(root, report) {
  if (report.content) return sha256Bytes(Buffer.from(report.content))
  const absolute = sourcePath(root, report.path)
  if (!fs.existsSync(absolute)) return null
  return sha256Bytes(fs.readFileSync(absolute))
}

function collectPlaywrightRows(root, report, gate) {
  if (!Array.isArray(report.suites)) return null
  const rows = []

  function visitSuites(suites, parentFile = '', parentTitles = []) {
    for (const suite of suites) {
      const file = suite.file ?? parentFile
      const titles = suite.title ? [...parentTitles, suite.title] : parentTitles
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          const resultStatuses = (test.results ?? []).map(
            (result) => result.status
          )
          const status =
            SKIP_STATUSES.has(test.status) ||
            SKIP_STATUSES.has(test.outcome) ||
            resultStatuses.some((value) => SKIP_STATUSES.has(value))
              ? 'skipped'
              : null
          if (!status) continue
          const project = test.projectName ? ` [${test.projectName}]` : ''
          rows.push({
            file: relativeSourcePath(root, file),
            fullName:
              [...titles, spec.title, test.title ?? '']
                .filter(Boolean)
                .join(' > ') + project,
            status,
            observedGate: gate
          })
        }
      }
      visitSuites(suite.suites ?? [], file, titles)
    }
  }

  visitSuites(report.suites)
  return rows
}

function collectReportRows(root, report, failures) {
  let parsed
  try {
    parsed = parseReport(root, report)
  } catch {
    failures.push(`skip_report_invalid:${report.gate}`)
    return { parsed: null, rows: [] }
  }
  if (!parsed) {
    failures.push(`skip_report_invalid:${report.gate}`)
    return { parsed: null, rows: [] }
  }

  if (report.gate === 'e2e') {
    const rows = collectPlaywrightRows(root, parsed, report.gate)
    if (!rows) {
      failures.push(`skip_report_invalid:${report.gate}`)
      return { parsed: null, rows: [] }
    }
    return { parsed, rows, kind: 'playwright' }
  }

  if (!Array.isArray(parsed.testResults)) {
    failures.push(`skip_report_invalid:${report.gate}`)
    return { parsed: null, rows: [] }
  }

  const rows = []
  for (const suite of parsed.testResults) {
    const file = relativeSourcePath(root, suite.name ?? '')
    for (const test of suite.assertionResults ?? []) {
      if (!SKIP_STATUSES.has(test.status)) continue
      rows.push({
        file,
        fullName: test.fullName ?? test.title ?? '<unnamed test>',
        status: test.status,
        observedGate: report.gate
      })
    }
  }

  const expectedCount =
    Number(parsed.numPendingTests ?? 0) + Number(parsed.numTodoTests ?? 0)
  if (expectedCount !== rows.length) {
    failures.push(
      `skip_report_count_mismatch:${report.gate}:${expectedCount}:${rows.length}`
    )
  }
  return { parsed, rows }
}

export function buildSkipInventory({
  root,
  catalog = loadSkipCatalog(root),
  reports,
  runId = null,
  candidateId = null
}) {
  const failures = validateCatalog(root, catalog)
  const contracts = new Map(
    (catalog.entries ?? []).map((entry) => [entry.file, entry])
  )
  const observed = new Map()
  const reportRecords = []
  const reportGates = new Map()
  const skippedTestsByGate = Object.fromEntries(
    REQUIRED_REPORT_GATES.map((gate) => [gate, 0])
  )

  for (const report of reports) {
    if (!KNOWN_DEDICATED_GATES.has(report.gate)) {
      failures.push(`skip_report_unknown_gate:${report.gate}`)
      continue
    }
    if (reportGates.has(report.gate)) {
      failures.push(`skip_report_duplicate_gate:${report.gate}`)
      continue
    }
    const {
      parsed,
      rows,
      kind = 'vitest'
    } = collectReportRows(root, report, failures)
    reportGates.set(report.gate, { parsed, rows })
    skippedTestsByGate[report.gate] = rows.length
    reportRecords.push({
      gate: report.gate,
      path: report.path,
      sha256: reportHash(root, report),
      kind,
      executed: parsed !== null,
      pendingTests: parsed?.numPendingTests ?? null,
      todoTests: parsed?.numTodoTests ?? null,
      observedSkippedTests: rows.length
    })
    for (const row of rows) {
      const key = `${row.file}\u0000${row.fullName}`
      const current = observed.get(key)
      if (current) {
        current.observedGates = [
          ...new Set([...current.observedGates, row.observedGate])
        ].sort()
        continue
      }
      observed.set(key, {
        ...row,
        observedGates: [row.observedGate]
      })
    }
  }

  for (const gate of REQUIRED_REPORT_GATES) {
    if (!reportGates.has(gate))
      failures.push(`skip_report_missing_gate:${gate}`)
  }

  const skips = []
  for (const row of observed.values()) {
    const contract = contracts.get(row.file)
    if (!contract) {
      failures.push(
        `skip_unknown:${row.observedGate}:${row.file}:${row.fullName}`
      )
      skips.push({
        id: null,
        contractId: null,
        ...row
      })
      continue
    }
    if (contract.required) failures.push(`skip_required:${contract.id}`)
    if (!reportGates.has(contract.dedicatedGate)) {
      failures.push(
        `skip_dedicated_gate_not_executed:${contract.id}:${contract.dedicatedGate}`
      )
    }
    const id = stableSkipId(contract.id, row.fullName)
    skips.push({
      id,
      contractId: contract.id,
      file: row.file,
      test: row.fullName,
      status: row.status,
      observedGates: row.observedGates,
      dedicatedGate: contract.dedicatedGate,
      reason: contract.reason,
      owner: contract.owner,
      sourceSha256: contract.sourceSha256,
      expiresAt: contract.expiresAt
    })
  }

  const observedByFile = new Map()
  for (const row of skips) {
    if (!row.contractId) continue
    observedByFile.set(row.file, (observedByFile.get(row.file) ?? 0) + 1)
  }
  for (const entry of catalog.entries ?? []) {
    const observedCount = observedByFile.get(entry.file) ?? 0
    if (observedCount > 0 && observedCount !== entry.expectedSkippedTests) {
      failures.push(
        `skip_catalog_count_mismatch:${entry.id}:${entry.expectedSkippedTests}:${observedCount}`
      )
    }
  }

  skips.sort((left, right) => {
    const leftKey = `${left.file}:${left.test ?? ''}`
    const rightKey = `${right.file}:${right.test ?? ''}`
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
  const uniqueFailures = [...new Set(failures)].sort()

  return {
    schemaVersion: 1,
    kind: 'aud20-skip-inventory',
    runId,
    candidateId,
    generatedAt: new Date().toISOString(),
    catalog: {
      path: SKIP_CATALOG_RELATIVE_PATH,
      entries: catalog.entries?.length ?? 0
    },
    reports: reportRecords,
    reportCountByGate: Object.fromEntries(
      REQUIRED_REPORT_GATES.map((gate) => [gate, reportGates.has(gate) ? 1 : 0])
    ),
    skippedTestsByGate,
    totals: {
      skippedTests: skips.length,
      skippedFiles: new Set(skips.map((row) => row.file)).size,
      failures: uniqueFailures.length
    },
    skips,
    failures: uniqueFailures,
    verdict: uniqueFailures.length === 0 ? 'PASS' : 'FAIL'
  }
}

export function validateSkipInventory(inventory, { runId, candidateId } = {}) {
  const failures = []
  if (!inventory || inventory.kind !== 'aud20-skip-inventory') {
    failures.push('skip_inventory_invalid')
  } else {
    if (inventory.verdict !== 'PASS') failures.push('skip_inventory_not_pass')
    if (runId && inventory.runId !== runId)
      failures.push('skip_inventory_run_mismatch')
    if (candidateId && inventory.candidateId !== candidateId)
      failures.push('skip_inventory_candidate_mismatch')
    if (!Array.isArray(inventory.skips))
      failures.push('skip_inventory_rows_missing')
    if (!Array.isArray(inventory.failures))
      failures.push('skip_inventory_failures_missing')
    if (!Array.isArray(inventory.reports))
      failures.push('skip_inventory_reports_missing')
    for (const gate of REQUIRED_REPORT_GATES) {
      if (inventory.reportCountByGate?.[gate] !== 1) {
        failures.push(`skip_inventory_report_gate_missing:${gate}`)
      }
      if (typeof inventory.skippedTestsByGate?.[gate] !== 'number') {
        failures.push(`skip_inventory_gate_count_missing:${gate}`)
      }
    }
    const ids = new Set()
    for (const row of inventory.skips ?? []) {
      for (const field of [
        'id',
        'file',
        'test',
        'reason',
        'owner',
        'dedicatedGate'
      ]) {
        if (!row[field])
          failures.push(`skip_inventory_metadata_missing:${field}`)
      }
      if (row.id && ids.has(row.id))
        failures.push(`skip_inventory_duplicate_id:${row.id}`)
      if (row.id) ids.add(row.id)
      if (!Array.isArray(row.observedGates) || row.observedGates.length === 0)
        failures.push(
          `skip_inventory_observed_gate_missing:${row.id ?? 'missing'}`
        )
    }
    if (
      inventory.totals?.skippedTests !== undefined &&
      inventory.totals.skippedTests !== (inventory.skips ?? []).length
    ) {
      failures.push('skip_inventory_total_mismatch')
    }
  }
  return [...new Set(failures)].sort()
}

export function runSkipGovernanceSelfTest() {
  const root = process.cwd()
  const source = 'packages/example.test.ts'
  const report = {
    numPendingTests: 1,
    numTodoTests: 0,
    testResults: [
      {
        name: path.join(root, source),
        assertionResults: [
          {
            fullName: 'example required test',
            status: 'skipped'
          }
        ]
      }
    ]
  }
  const entry = {
    id: 'SKIP-SELFTEST',
    file: source,
    sourceSha256: '0'.repeat(64),
    expectedSkippedTests: 1,
    reason: 'synthetic self-test skip',
    owner: 'quality',
    dedicatedGate: 'postgres',
    required: false,
    expiresAt: '2099-01-01T00:00:00.000Z'
  }
  const reports = REQUIRED_REPORT_GATES.map((gate) => ({
    gate,
    path: `synthetic-${gate}.json`,
    value: report
  }))
  const unknown = buildSkipInventory({
    root,
    catalog: { schemaVersion: 1, kind: 'aud20-skip-catalog', entries: [] },
    reports
  })
  const required = buildSkipInventory({
    root,
    catalog: {
      schemaVersion: 1,
      kind: 'aud20-skip-catalog',
      entries: [{ ...entry, required: true }]
    },
    reports
  })
  return {
    unknownRejected: unknown.failures.some((failure) =>
      failure.startsWith('skip_unknown:')
    ),
    requiredRejected: required.failures.includes('skip_required:SKIP-SELFTEST'),
    verdict:
      unknown.verdict === 'FAIL' && required.verdict === 'FAIL'
        ? 'PASS'
        : 'FAIL'
  }
}
