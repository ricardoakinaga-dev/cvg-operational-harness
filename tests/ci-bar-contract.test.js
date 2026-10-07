import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CI_BAR_GATES,
  CI_BAR_SCOPE,
  ciBarScopeFailures,
  runCiBarContractSelfTest,
  validateCiBarContract
} from '../scripts/ci-bar-contract.mjs'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function currentContract() {
  return validateCiBarContract({
    workflow: read('.github/workflows/verify.yml'),
    nvmrc: read('.nvmrc'),
    packageJson: JSON.parse(read('package.json')),
    dockerfile: read('Dockerfile')
  })
}

describe('REM21-008 CI bar contract', () => {
  it('enumerates the complete blocking bar in Node 22', () => {
    expect(CI_BAR_GATES.map((gate) => gate.id)).toEqual([
      'runtime',
      'install',
      'readiness',
      'format',
      'typecheck',
      'lint',
      'build',
      'unit',
      'coverage',
      'coverage-critical',
      'mutation',
      'skip',
      'worker-startup',
      'postgres',
      'postgres-proof',
      'observability-proof',
      'phase2',
      'phase3',
      'phase4a',
      'phase4a-identity',
      'chaos',
      'evals',
      'load',
      'restore',
      'docs',
      'e2e',
      'browser-proof',
      'image',
      'sbom',
      'licenses',
      'security',
      'certify',
      'certification-verify',
      'diff',
      'artifacts'
    ])
    expect(currentContract()).toEqual({ pass: true, failures: [] })
  })

  it('rejects a workflow that silently drops one required gate', () => {
    const workflow = read('.github/workflows/verify.yml').replace(
      'node scripts/ci-bar.mjs gate mutation',
      'node scripts/ci-bar.mjs gate mutation-disabled'
    )
    const result = validateCiBarContract({
      workflow,
      nvmrc: read('.nvmrc'),
      packageJson: JSON.parse(read('package.json')),
      dockerfile: read('Dockerfile')
    })

    expect(result.pass).toBe(false)
    expect(result.failures).toContain('missing_gate:mutation')
  })

  it('rejects non-22 runtime, opaque aggregation and unbound artifacts', () => {
    const workflow = read('.github/workflows/verify.yml')
      .replace('node-version-file: .nvmrc', 'node-version: 24')
      .replaceAll(/node scripts\/ci-bar\.mjs gate [^\n]+/g, 'npm run verify')
      .replace('if-no-files-found: error', 'if-no-files-found: warn')
    const result = validateCiBarContract({
      workflow,
      nvmrc: '24.0.0\n',
      packageJson: JSON.parse(read('package.json')),
      dockerfile: read('Dockerfile')
    })

    expect(result.pass).toBe(false)
    expect(result.failures).toEqual(
      expect.arrayContaining([
        'runtime_not_node22',
        'aggregator_only',
        'artifacts_not_fail_closed'
      ])
    )
  })

  it('executes the contract self-tests with independent negative cases', () => {
    const result = runCiBarContractSelfTest()
    expect(result.verdict).toBe('PASS')
    expect(result.checks).toHaveLength(CI_BAR_GATES.length + 5)
    expect(result.checks.every((check) => check.verdict === 'PASS')).toBe(true)
  })
})

describe('HISO-010 harness bar scope', () => {
  const command = (id) =>
    CI_BAR_GATES.find((gate) => gate.id === id)?.command?.[1] ?? []

  it('runs unit and coverage through the core-only suite', () => {
    expect(CI_BAR_SCOPE).toEqual({
      owner: 'harness',
      testScope: 'core',
      excludedTestRoots: ['products/']
    })
    expect(command('unit').slice(0, 3)).toEqual(['run', 'test:core', '--'])
    expect(command('coverage')).toEqual([
      'run',
      'test:core',
      '--',
      '--coverage'
    ])
    expect(JSON.parse(read('package.json')).scripts['test:core']).toContain(
      '--exclude "products/**"'
    )
  })

  it('rejects a harness workflow that builds or tests the product', () => {
    for (const injected of [
      'npm run test:shift-assistant',
      'npm run build:shift-assistant',
      'npm test --workspace @cvg/shift-assistant',
      'npx vitest run products/shift-assistant/src/__tests__'
    ]) {
      const result = validateCiBarContract({
        workflow: `${read('.github/workflows/verify.yml')}\n        run: ${injected}\n`,
        nvmrc: read('.nvmrc'),
        packageJson: JSON.parse(read('package.json')),
        dockerfile: read('Dockerfile')
      })
      expect(result.failures).toContain('harness_bar_runs_product')
    }
  })

  it('rejects a core suite script that stops excluding products', () => {
    const packageJson = JSON.parse(read('package.json'))
    packageJson.scripts['test:core'] =
      'vitest run --no-file-parallelism --maxWorkers=2'
    const result = validateCiBarContract({
      workflow: read('.github/workflows/verify.yml'),
      nvmrc: read('.nvmrc'),
      packageJson,
      dockerfile: read('Dockerfile')
    })
    expect(result.failures).toEqual(['core_suite_includes_products'])
  })

  it('fails closed when product tests or sources reach the harness denominators', () => {
    const core = path.join(rootDir, 'packages/harness/src/__tests__/a.test.ts')
    const product = path.join(
      rootDir,
      'products/shift-assistant/src/__tests__/shift-assistant.test.ts'
    )
    const check = (input) =>
      ciBarScopeFailures('unit', { root: rootDir, ...input })
    expect(check({ unitReport: { testResults: [{ name: core }] } })).toEqual([])
    expect(
      check({
        unitReport: { testResults: [{ name: core }, { name: product }] }
      })
    ).toEqual(['out_of_scope_tests:unit:1'])
    expect(check({ unitReport: null })).toEqual(['unit_report_empty:unit'])
    expect(check({ unitReport: { testResults: [] } })).toEqual([
      'unit_report_empty:unit'
    ])
    expect(
      check({
        coverageSummary: {
          total: {},
          [path.join(rootDir, 'packages/harness/src/index.ts')]: {},
          [path.join(rootDir, 'products/shift-assistant/src/store.ts')]: {}
        }
      })
    ).toEqual(['out_of_scope_coverage:unit:1'])
    expect(check({ coverageSummary: null })).toEqual([])
  })
})
