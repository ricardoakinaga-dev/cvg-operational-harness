import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildSkipInventory,
  loadSkipCatalog,
  validateSkipInventory
} from '../scripts/lib/skip-governance.mjs'

const temporaryRoots = []

function createFixture({ required = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aud20-skips-'))
  temporaryRoots.push(root)
  const file = 'packages/example.test.ts'
  const source = 'export const example = true\n'
  const absolute = path.join(root, file)
  fs.mkdirSync(path.dirname(absolute), { recursive: true })
  fs.writeFileSync(absolute, source)
  const sourceSha256 = createHash('sha256').update(source).digest('hex')
  const report = {
    numPendingTests: 1,
    numTodoTests: 0,
    testResults: [
      {
        name: absolute,
        assertionResults: [
          {
            fullName: 'example conditional test',
            status: 'skipped'
          }
        ]
      }
    ]
  }
  const entry = {
    id: 'SKIP-TEST-001',
    file,
    sourceSha256,
    expectedSkippedTests: 1,
    reason: 'synthetic dependency unavailable',
    owner: 'quality',
    dedicatedGate: 'postgres',
    required,
    expiresAt: '2099-01-01T00:00:00.000Z'
  }
  return { root, report, entry }
}

function fixtureReports(report) {
  const e2eReport = { suites: [{ title: '', specs: [], suites: [] }] }
  return ['unit', 'postgres', 'chaos', 'e2e'].map((gate) => ({
    gate,
    path: `synthetic-${gate}.json`,
    value: gate === 'e2e' ? e2eReport : report
  }))
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('AUD20-003 skip governance', () => {
  it('assigns complete metadata to an allowlisted skipped test', () => {
    const fixture = createFixture()
    const inventory = buildSkipInventory({
      root: fixture.root,
      catalog: {
        schemaVersion: 1,
        kind: 'aud20-skip-catalog',
        entries: [fixture.entry]
      },
      reports: fixtureReports(fixture.report),
      runId: 'run-test',
      candidateId: 'candidate-test'
    })

    expect(inventory.verdict).toBe('PASS')
    expect(inventory.totals).toMatchObject({ skippedTests: 1, skippedFiles: 1 })
    expect(inventory.skips[0]).toMatchObject({
      contractId: 'SKIP-TEST-001',
      reason: 'synthetic dependency unavailable',
      owner: 'quality',
      dedicatedGate: 'postgres'
    })
  })

  it('rejects a skipped test that is absent from the catalog', () => {
    const fixture = createFixture()
    const inventory = buildSkipInventory({
      root: fixture.root,
      catalog: { schemaVersion: 1, kind: 'aud20-skip-catalog', entries: [] },
      reports: [{ gate: 'unit', path: 'synthetic.json', value: fixture.report }]
    })

    expect(inventory.verdict).toBe('FAIL')
    expect(
      inventory.failures.some((failure) => failure.startsWith('skip_unknown:'))
    ).toBe(true)
  })

  it('rejects a catalog entry marked required when it is skipped', () => {
    const fixture = createFixture({ required: true })
    const inventory = buildSkipInventory({
      root: fixture.root,
      catalog: {
        schemaVersion: 1,
        kind: 'aud20-skip-catalog',
        entries: [fixture.entry]
      },
      reports: [{ gate: 'unit', path: 'synthetic.json', value: fixture.report }]
    })

    expect(inventory.verdict).toBe('FAIL')
    expect(inventory.failures).toContain('skip_required:SKIP-TEST-001')
  })

  it('rejects source drift before accepting a skip contract', () => {
    const fixture = createFixture()
    fs.appendFileSync(
      path.join(fixture.root, fixture.entry.file),
      'export const changed = true\n'
    )
    const inventory = buildSkipInventory({
      root: fixture.root,
      catalog: {
        schemaVersion: 1,
        kind: 'aud20-skip-catalog',
        entries: [fixture.entry]
      },
      reports: [{ gate: 'unit', path: 'synthetic.json', value: fixture.report }]
    })

    expect(inventory.verdict).toBe('FAIL')
    expect(inventory.failures).toContain(
      `skip_catalog_source_drift:${fixture.entry.file}`
    )
  })

  it('rejects an expired skip contract', () => {
    const fixture = createFixture()
    fixture.entry.expiresAt = '2020-01-01T00:00:00.000Z'
    const inventory = buildSkipInventory({
      root: fixture.root,
      catalog: {
        schemaVersion: 1,
        kind: 'aud20-skip-catalog',
        entries: [fixture.entry]
      },
      reports: fixtureReports(fixture.report)
    })

    expect(inventory.verdict).toBe('FAIL')
    expect(inventory.failures).toContain('skip_catalog_expired:SKIP-TEST-001')
  })

  it('rejects a skip when its dedicated gate was not executed', () => {
    const fixture = createFixture()
    const inventory = buildSkipInventory({
      root: fixture.root,
      catalog: {
        schemaVersion: 1,
        kind: 'aud20-skip-catalog',
        entries: [fixture.entry]
      },
      reports: [
        { gate: 'unit', path: 'synthetic-unit.json', value: fixture.report }
      ]
    })

    expect(inventory.verdict).toBe('FAIL')
    expect(inventory.failures).toContain(
      'skip_dedicated_gate_not_executed:SKIP-TEST-001:postgres'
    )
  })

  it('rejects a report with an unknown gate', () => {
    const fixture = createFixture()
    const inventory = buildSkipInventory({
      root: fixture.root,
      catalog: { schemaVersion: 1, kind: 'aud20-skip-catalog', entries: [] },
      reports: [
        { gate: 'browser-lab', path: 'synthetic.json', value: fixture.report }
      ]
    })

    expect(inventory.verdict).toBe('FAIL')
    expect(inventory.failures).toContain('skip_report_unknown_gate:browser-lab')
  })

  it('catalogues the continuous worker entrypoint explicitly', () => {
    const catalog = loadSkipCatalog(process.cwd())
    expect(catalog.entries).toContainEqual(
      expect.objectContaining({
        file: 'apps/worker/src/__tests__/continuous-worker-entrypoint.integration.test.ts',
        dedicatedGate: 'postgres',
        expiresAt: '2027-12-31T23:59:59.000Z'
      })
    )
  })

  it('requires a passing, bound inventory artifact', () => {
    expect(
      validateSkipInventory(
        {
          kind: 'aud20-skip-inventory',
          verdict: 'PASS',
          runId: 'run-1',
          candidateId: 'candidate-1',
          reports: [
            { gate: 'unit' },
            { gate: 'postgres' },
            { gate: 'chaos' },
            { gate: 'e2e' }
          ],
          reportCountByGate: { unit: 1, postgres: 1, chaos: 1, e2e: 1 },
          skippedTestsByGate: { unit: 0, postgres: 0, chaos: 0, e2e: 0 },
          totals: { skippedTests: 0 },
          skips: [],
          failures: []
        },
        { runId: 'run-1', candidateId: 'candidate-1' }
      )
    ).toEqual([])
    expect(
      validateSkipInventory(
        {
          kind: 'aud20-skip-inventory',
          verdict: 'FAIL',
          runId: 'run-old',
          candidateId: 'candidate-old',
          reports: [
            { gate: 'unit' },
            { gate: 'postgres' },
            { gate: 'chaos' },
            { gate: 'e2e' }
          ],
          reportCountByGate: { unit: 1, postgres: 1, chaos: 1, e2e: 1 },
          skippedTestsByGate: { unit: 0, postgres: 0, chaos: 0, e2e: 0 },
          skips: [],
          failures: ['skip_unknown:unit'],
          totals: { skippedTests: 0 }
        },
        { runId: 'run-1', candidateId: 'candidate-1' }
      )
    ).toEqual([
      'skip_inventory_candidate_mismatch',
      'skip_inventory_not_pass',
      'skip_inventory_run_mismatch'
    ])
  })
})
