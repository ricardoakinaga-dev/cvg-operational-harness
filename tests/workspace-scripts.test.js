import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(rootDir, relativePath), 'utf8'))
}

describe('workspace quality scripts', () => {
  it('defines deterministic enterprise quality gates', () => {
    const packageJson = readJson('package.json')

    expect(packageJson.private).toBe(true)
    expect(packageJson.workspaces).toEqual([
      'apps/*',
      'packages/*',
      'legacy/packages/*'
    ])
    expect(packageJson.scripts.typecheck).toBe(
      'tsc -p tsconfig.typecheck.json --noEmit'
    )
    expect(packageJson.scripts['dev:api']).toBe('tsx apps/api/src/main.ts')
    expect(packageJson.scripts.build).toBe(
      'npm run typecheck && npm run build:web'
    )
    expect(packageJson.scripts['build:web']).toBe(
      'vite --config vite.config.mts build apps/web'
    )
    expect(packageJson.scripts['dev:web']).toBe(
      'vite --config vite.config.mts apps/web --host 0.0.0.0'
    )
    expect(packageJson.scripts['dev:worker']).toBe(
      'tsx apps/worker/src/main.ts'
    )
    expect(packageJson.scripts.lint).toBe('eslint .')
    expect(packageJson.scripts.test).toBe(
      'vitest run --no-file-parallelism --maxWorkers=2'
    )
    expect(packageJson.scripts['test:coverage']).toBe(
      'vitest run --coverage --no-file-parallelism --maxWorkers=2'
    )
    expect(packageJson.scripts['test:postgres']).toContain(
      'packages/persistence/src/__tests__/postgres-migration-smoke.test.ts'
    )
    expect(packageJson.scripts['test:postgres']).toContain(
      'apps/api/src/__tests__/postgres-persistence-mode.test.ts'
    )
    expect(packageJson.scripts['test:postgres']).toContain(
      'packages/persistence/src/__tests__/platform-postgres-smoke.test.ts'
    )
    expect(packageJson.scripts['audit:security']).toBe(
      'npm audit --audit-level=high'
    )
    expect(packageJson.scripts.readiness).toBe(
      'vitest run tests/construction-readiness.test.js'
    )
    expect(packageJson.scripts.verify).toContain('npm run format:check')
    expect(packageJson.scripts.verify).toContain('npm run build')
    expect(packageJson.scripts.verify).toContain('npm run audit:security')
  })

  it('keeps runtime environment switches fail-closed by default', () => {
    const envExample = fs.readFileSync(
      path.join(rootDir, '.env.example'),
      'utf8'
    )

    expect(envExample).toContain('ENABLE_REAL_CHANNELS=false')
    expect(envExample).toContain('ENABLE_REAL_RAG=false')
    expect(envExample).toContain('ENABLE_REAL_PAYMENTS=false')
    expect(envExample).toContain('ENABLE_REAL_MEDICAL_RECORDS=false')
  })
})
