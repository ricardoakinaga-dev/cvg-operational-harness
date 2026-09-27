import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CI_BAR_GATES,
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
      'coverage-web',
      'coverage-critical',
      'mutation',
      'skip',
      'worker-startup',
      'postgres',
      'coverage-postgres',
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
    expect(result.checks).toHaveLength(CI_BAR_GATES.length + 3)
    expect(result.checks.every((check) => check.verdict === 'PASS')).toBe(true)
  })
})
