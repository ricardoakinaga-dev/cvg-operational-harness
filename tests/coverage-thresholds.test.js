import { afterAll, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import {
  AGGREGATE_THRESHOLDS,
  validateAggregateCoverage
} from '../scripts/coverage-thresholds.mjs'
import { safeVitestArguments } from '../scripts/run-core-coverage.mjs'

const require = createRequire(import.meta.url)
const percent = require('istanbul-lib-coverage/lib/percent.js')
const dimensions = Object.keys(AGGREGATE_THRESHOLDS)
const metric = (total, covered) => ({
  total,
  covered,
  skipped: 0,
  pct: percent(covered, total)
})
const file = (total, covered) =>
  Object.fromEntries(dimensions.map((key) => [key, metric(total, covered)]))
function summaryFor(files) {
  const total = Object.fromEntries(
    dimensions.map((key) => {
      const values = Object.values(files).map((entry) => entry[key])
      return [
        key,
        metric(
          values.reduce((sum, entry) => sum + entry.total, 0),
          values.reduce((sum, entry) => sum + entry.covered, 0)
        )
      ]
    })
  )
  return { total, ...files }
}
function goodSummary() {
  return summaryFor({
    '/synthetic/packages/harness/src/core.ts': file(20, 20),
    '/synthetic/packages/other/src/source.ts': {
      ...file(80, 70),
      branches: metric(80, 65)
    }
  })
}
function belowThreshold(dimension) {
  const summary = goodSummary()
  const outsideCore = summary['/synthetic/packages/other/src/source.ts']
  outsideCore[dimension] = metric(80, outsideCore[dimension].covered - 1)
  return summaryFor(Object.fromEntries(Object.entries(summary).slice(1)))
}

describe('P100-002 aggregate coverage validation', () => {
  it('accepts the exact 90/85/90/90 boundary without mutating the report', () => {
    const summary = goodSummary()
    const before = JSON.stringify(summary)
    const result = validateAggregateCoverage(summary)
    expect(result.pass).toBe(true)
    expect(result.thresholds).toEqual({
      statements: 90,
      branches: 85,
      functions: 90,
      lines: 90
    })
    expect(result.metrics).toEqual(summary.total)
    expect(JSON.stringify(summary)).toBe(before)
  })

  it.each(dimensions)(
    'fails a real count below the %s floor outside the core',
    (key) => {
      const result = validateAggregateCoverage(belowThreshold(key))
      expect(result.pass).toBe(false)
      expect(result.failures).toContain(
        `coverage below threshold: ${key} ${AGGREGATE_THRESHOLDS[key] - 1}% < ${AGGREGATE_THRESHOLDS[key]}%`
      )
    }
  )

  it('uses the installed Istanbul truncation rather than rounding percentages up', () => {
    const summary = summaryFor({ '/synthetic/source.ts': file(3, 2) })
    expect(summary.total.statements.pct).toBe(66.66)
    expect(validateAggregateCoverage(summary).failures).toHaveLength(4)
    summary.total.statements.pct = 66.67
    expect(validateAggregateCoverage(summary).failures).toContain(
      'inconsistent coverage percentage: total:statements'
    )
  })

  it('allows zero branches/functions in nonempty source with Istanbul pct=100', () => {
    const summary = summaryFor({
      '/synthetic/constants.ts': {
        ...file(2, 2),
        functions: metric(0, 0),
        branches: metric(0, 0)
      }
    })
    expect(validateAggregateCoverage(summary).pass).toBe(true)
  })

  it.each(
    [null, [], {}, 100, 'report', { total: null }, { total: [] }].map(
      (summary) => [summary]
    )
  )('rejects a malformed summary %j', (summary) =>
    expect(validateAggregateCoverage(summary).pass).toBe(false)
  )

  it('rejects a total-only or empty report instead of a vacuous 100%', () => {
    expect(validateAggregateCoverage({ total: file(100, 100) }).pass).toBe(
      false
    )
    const empty = summaryFor({ '/synthetic/empty.ts': file(0, 0) })
    expect(validateAggregateCoverage(empty).failures).toContain(
      'coverage report is empty'
    )
  })

  it.each([
    ['missing metric', undefined],
    ['array', []],
    ['missing pct', { total: 100, covered: 100, skipped: 0 }],
    ['missing skipped', { total: 100, covered: 100, pct: 100 }],
    ['negative total', { total: -1, covered: 0, skipped: 0, pct: 100 }],
    ['negative covered', { total: 100, covered: -1, skipped: 0, pct: 0 }],
    ['fractional total', { total: 1.5, covered: 1, skipped: 0, pct: 66.66 }],
    ['unsafe total', { total: 2 ** 53, covered: 1, skipped: 0, pct: 0 }],
    ['covered > total', { total: 100, covered: 101, skipped: 0, pct: 100 }],
    ['skipped > total', { total: 100, covered: 100, skipped: 101, pct: 100 }],
    ['negative skipped', { total: 100, covered: 100, skipped: -1, pct: 100 }],
    ['NaN', { total: 100, covered: 100, skipped: 0, pct: NaN }],
    ['Infinity', { total: 100, covered: 100, skipped: 0, pct: Infinity }],
    ['negative pct', { total: 100, covered: 100, skipped: 0, pct: -1 }],
    ['pct > 100', { total: 100, covered: 100, skipped: 0, pct: 101 }],
    ['numeric string', { total: 100, covered: 100, skipped: 0, pct: '100' }],
    [
      'Istanbul Unknown',
      { total: 100, covered: 100, skipped: 0, pct: 'Unknown' }
    ],
    ['inflated pct', { total: 100, covered: 1, skipped: 0, pct: 100 }]
  ])('rejects %s', (_, invalid) => {
    const summary = goodSummary()
    summary.total.statements = invalid
    expect(validateAggregateCoverage(summary).pass).toBe(false)
  })

  it('rejects malformed file entries and aggregate counts that do not sum', () => {
    const summary = goodSummary()
    summary['/synthetic/packages/other/src/source.ts'].functions = null
    expect(validateAggregateCoverage(summary).pass).toBe(false)
    const inconsistent = goodSummary()
    inconsistent.total.statements = metric(100, 100)
    expect(validateAggregateCoverage(inconsistent).failures).toContain(
      'inconsistent coverage total: statements'
    )
  })
})

describe('safe normal Vitest arguments', () => {
  it('preserves filters/options and keeps option-shaped values and spaces literal', () => {
    expect(
      safeVitestArguments([
        '--',
        'tests/a file.test.ts',
        '-t',
        '--coverage=false',
        '--max-workers',
        '1',
        '--no-file-parallelism',
        '--pool=threads',
        '--testTimeout=30000',
        '--reporter',
        'dot',
        '--exclude=**/postgres*.ts',
        '--silent=false'
      ])
    ).toEqual([
      'tests/a file.test.ts',
      '--testNamePattern=--coverage=false',
      '--maxWorkers=1',
      '--fileParallelism=false',
      '--pool=threads',
      '--testTimeout=30000',
      '--reporter=dot',
      '--exclude=**/postgres*.ts',
      '--silent=false'
    ])
  })

  it.each([
    '--coverage=false',
    '--no-coverage',
    '--coverage.provider=custom',
    '--coverage.thresholds.lines=0',
    '--coverage.thresholds.perFile=false',
    '--coverage.thresholds.autoUpdate=true',
    '--coverage.include=only-one.ts',
    '--coverage.exclude=**/*',
    '--coverage.reportsDirectory=/other-output',
    '--coverage.reporter=json',
    '--config=other.mts',
    '-c',
    '--root=/other-root',
    '--project=other',
    '--watch',
    '-w',
    '--passWithNoTests',
    '--allowOnly',
    '--dangerouslyIgnoreUnhandledErrors',
    '--outputFile=/other-output',
    '--update',
    '--mergeReports',
    '--unknown-option'
  ])('rejects bypass/output/watch option %s', (arg) => {
    expect(() => safeVitestArguments([arg])).toThrow(
      'unsupported Vitest option'
    )
  })

  it.each([
    ['--maxWorkers=0'],
    ['--maxWorkers=101%'],
    ['--testTimeout=oops'],
    ['--pool=custom'],
    ['--reporter=/custom/reporter.mjs'],
    ['--testNamePattern='],
    ['--testNamePattern'],
    ['--fileParallelism=oops'],
    ['--no-fileParallelism=true'],
    ['']
  ])('rejects malformed allowed options %j', (arg) => {
    expect(() => safeVitestArguments([arg])).toThrow()
  })
})

// Fake installed child: validates process orchestration only. It never runs
// tests, instruments code or supplies evidence of actual core coverage.
const fakeChild = `
import { mkdirSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const spec = JSON.parse(readFileSync('fixture.json', 'utf8'))
const args = process.argv.slice(2)
writeFileSync('observed.json', JSON.stringify({args, node: process.version, perFile: process.env.CVG_COVERAGE_PER_FILE}))
console.log('synthetic child stdout')
console.error('synthetic child stderr')
const reportDirectory = args.find(arg => arg.startsWith('--coverage.reportsDirectory=')).split('=').slice(1).join('=')
const path = join(reportDirectory, 'coverage-summary.json')
if (spec.mode !== 'missing') {
  mkdirSync(reportDirectory, { recursive: true })
  if (spec.mode === 'symlink') symlinkSync(join(process.cwd(), 'historical.json'), path)
  else writeFileSync(path, spec.mode === 'malformed' ? '{invalid json' : JSON.stringify(spec.summary))
  if (spec.mode === 'stale') utimesSync(path, new Date('2000-01-01'), new Date('2000-01-01'))
  if (spec.mode === 'future') utimesSync(path, new Date('2100-01-01'), new Date('2100-01-01'))
}
if (spec.mode === 'signal') process.kill(process.pid, 'SIGTERM')
else process.exit(spec.exitCode ?? 0)
`

const temporaryRoot = resolve('coverage')
mkdirSync(temporaryRoot, { recursive: true })
const fixtureRoot = mkdtempSync(join(temporaryRoot, 'threshold-tests-'))
afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }))

function runnerFixture(spec = {}) {
  const root = mkdtempSync(join(fixtureRoot, 'case-'))
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'node_modules/vitest'), { recursive: true })
  mkdirSync(join(root, 'coverage'))
  for (const name of ['run-core-coverage.mjs', 'coverage-thresholds.mjs']) {
    copyFileSync(resolve('scripts', name), join(root, 'scripts', name))
  }
  writeFileSync(join(root, 'node_modules/vitest/vitest.mjs'), fakeChild)
  writeFileSync(
    join(root, 'vitest.config.mts'),
    '// synthetic orchestration fixture\n'
  )
  writeFileSync(
    join(root, 'fixture.json'),
    JSON.stringify({ summary: goodSummary(), ...spec })
  )
  const historical = JSON.stringify(goodSummary())
  writeFileSync(join(root, 'historical.json'), historical)
  writeFileSync(join(root, 'coverage/coverage-summary.json'), historical)
  writeFileSync(join(root, 'coverage/unrelated-output.txt'), 'preserve me')
  return root
}
function executeRunner(root, args = []) {
  const result = spawnSync(
    process.execPath,
    [join(root, 'scripts/run-core-coverage.mjs'), ...args],
    {
      cwd: root,
      env: { ...process.env, CVG_COVERAGE_PER_FILE: '0' },
      encoding: 'utf8',
      shell: false
    }
  )
  expect(result.error).toBeUndefined()
  return result
}

describe('P100-002 current-run coverage orchestration (synthetic child only)', () => {
  it('defaults to exactly two workers when no explicit worker option is supplied', () => {
    const root = runnerFixture()
    const result = executeRunner(root)
    expect(result.status).toBe(0)
    const observed = JSON.parse(
      readFileSync(join(root, 'observed.json'), 'utf8')
    )
    expect(
      observed.args.filter((arg) => arg.startsWith('--maxWorkers='))
    ).toEqual(['--maxWorkers=2'])
  })

  it.each([
    [['--maxWorkers=1'], '1'],
    [['--maxWorkers', '3'], '3'],
    [['--max-workers=1'], '1'],
    [['--max-workers', '3'], '3'],
    [['--maxWorkers=50%'], '50%'],
    [['--maxWorkers', '100%'], '100%'],
    [['--max-workers=50%'], '50%'],
    [['--max-workers', '100%'], '100%']
  ])('forwards exactly one explicit worker option for %j', (args, value) => {
    const root = runnerFixture()
    const result = executeRunner(root, args)
    expect(result.status).toBe(0)
    const observed = JSON.parse(
      readFileSync(join(root, 'observed.json'), 'utf8')
    )
    expect(
      observed.args.filter((arg) => arg.startsWith('--maxWorkers='))
    ).toEqual([`--maxWorkers=${value}`])
  })

  it.each(
    [
      ['--maxWorkers=0'],
      ['--max-workers', '-1'],
      ['--maxWorkers=101%'],
      ['--max-workers=1.5'],
      ['--maxWorkers='],
      ['--max-workers'],
      ['--maxWorkers', '--coverage=false']
    ].map((args) => [args])
  )('rejects invalid worker arguments %j before launching a child', (args) => {
    const root = runnerFixture()
    const result = executeRunner(root, args)
    expect(result.status).toBe(1)
    expect(existsSync(join(root, 'observed.json'))).toBe(false)
    expect(readdirSync(join(root, 'coverage'))).toEqual([
      'coverage-summary.json',
      'unrelated-output.txt'
    ])
  })

  it('runs with the protected config/per-file env and safely forwards normal filters', () => {
    const root = runnerFixture()
    const result = executeRunner(root, [
      'tests/a file.test.ts',
      '-t',
      'literal $(no-shell)',
      '--maxWorkers=1',
      '--pool=threads',
      '--reporter=dot'
    ])
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('synthetic child stdout')
    expect(result.stderr).toContain('synthetic child stderr')
    expect(result.stdout).toContain(
      'PASS aggregate statements=90% branches=85% functions=90% lines=90%'
    )
    const observed = JSON.parse(
      readFileSync(join(root, 'observed.json'), 'utf8')
    )
    expect(observed.node).toMatch(/^v22\./)
    expect(observed.perFile).toBe('1')
    expect(observed.args).toContain(
      `--config=${join(root, 'vitest.config.mts')}`
    )
    expect(observed.args).toContain(`--root=${root}`)
    expect(observed.args).toContain('--coverage')
    expect(observed.args).toContain('--coverage.reporter=json-summary')
    expect(observed.args).toContain('--passWithNoTests=false')
    expect(observed.args).toContain('--allowOnly=false')
    expect(observed.args).toContain('--dangerouslyIgnoreUnhandledErrors=false')
    expect(observed.args.slice(-5)).toEqual([
      'tests/a file.test.ts',
      '--testNamePattern=literal $(no-shell)',
      '--maxWorkers=1',
      '--pool=threads',
      '--reporter=dot'
    ])
    const ownPath = observed.args.find((arg) =>
      arg.startsWith('--coverage.reportsDirectory=')
    )
    expect(ownPath).toMatch(/coverage\/core-[^/]+\/reports$/)
    expect(ownPath).not.toContain('coverage/reports')
  })

  it.each(['missing', 'malformed', 'stale', 'future', 'symlink'])(
    'fails closed for a %s report despite historical good reports',
    (mode) => {
      const root = runnerFixture({ mode })
      const result = executeRunner(root)
      expect(result.status).toBe(1)
      expect(result.stdout).not.toContain('PASS aggregate')
      expect(result.stderr).toContain('[core-coverage] FAIL')
      expect(
        readFileSync(join(root, 'coverage/coverage-summary.json'), 'utf8')
      ).toBe(JSON.stringify(goodSummary()))
      expect(
        readFileSync(join(root, 'coverage/unrelated-output.txt'), 'utf8')
      ).toBe('preserve me')
    }
  )

  it('fails on a well-formed known-bad aggregate from a successful child', () => {
    const root = runnerFixture({ summary: belowThreshold('branches') })
    const result = executeRunner(root)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'coverage below threshold: branches 84% < 85%'
    )
  })

  it.each(['good', 'malformed', 'missing'])(
    'preserves the child exit 23 with a %s report',
    (mode) => {
      const root = runnerFixture({ mode, exitCode: 23 })
      const result = executeRunner(root)
      expect(result.status).toBe(23)
      expect(result.stdout).toContain('synthetic child stdout')
      expect(result.stderr).toContain('synthetic child stderr')
      expect(result.stderr).toContain('child failed: 23')
      expect(result.stdout).not.toContain('PASS aggregate')
      expect(result.stderr).not.toContain('[core-coverage] FAIL')
    }
  )

  it('preserves a terminating child signal instead of accepting its good report', () => {
    const root = runnerFixture({ mode: 'signal' })
    const result = executeRunner(root)
    expect(result.status).toBeNull()
    expect(result.signal).toBe('SIGTERM')
    expect(result.stderr).toContain('child terminated by SIGTERM')
    expect(result.stdout).not.toContain('PASS aggregate')
  })

  it('allocates a new owned report directory each time and preserves other output', () => {
    const root = runnerFixture()
    expect(executeRunner(root).status).toBe(0)
    const first = JSON.parse(
      readFileSync(join(root, 'observed.json'), 'utf8')
    ).args
    expect(executeRunner(root).status).toBe(0)
    const second = JSON.parse(
      readFileSync(join(root, 'observed.json'), 'utf8')
    ).args
    const reportOption = (args) =>
      args.find((arg) => arg.startsWith('--coverage.reportsDirectory='))
    expect(reportOption(first)).not.toBe(reportOption(second))
    expect(
      readdirSync(join(root, 'coverage')).filter((name) =>
        name.startsWith('core-')
      )
    ).toHaveLength(2)
    expect(
      readFileSync(join(root, 'coverage/unrelated-output.txt'), 'utf8')
    ).toBe('preserve me')
  })

  it('rejects a bypass before launching the child or creating any report directory', () => {
    const root = runnerFixture()
    const result = executeRunner(root, [
      '--coverage.reportsDirectory=../unowned'
    ])
    expect(result.status).toBe(1)
    expect(existsSync(join(root, 'observed.json'))).toBe(false)
    expect(
      readdirSync(join(root, 'coverage')).filter((name) =>
        name.startsWith('core-')
      )
    ).toHaveLength(0)
  })
})
