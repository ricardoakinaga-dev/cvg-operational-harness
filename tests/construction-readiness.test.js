import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath))
}

function exists(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath))
}

function pendingHighPriorityCorrections() {
  const backlog = readJson(
    'docs/09_debug_corrections/0903_correction_backlog.json'
  )
  return backlog.items.filter(
    (item) =>
      (item.priority === 'P0' || item.priority === 'P1') &&
      item.status !== 'completed'
  )
}

describe('construction readiness 95 gate', () => {
  it('declares a defensive readiness score based on open debug corrections', () => {
    const readiness = readJson(
      'docs/03_build/0310_construction_readiness_95.json'
    )
    const pending = pendingHighPriorityCorrections()
    const totalScore = readiness.score_model.reduce(
      (sum, item) => sum + item.score,
      0
    )
    const totalWeight = readiness.score_model.reduce(
      (sum, item) => sum + item.weight,
      0
    )

    expect([
      'READY_FOR_CONTROLLED_CONSTRUCTION',
      'CONTROLLED_CONSTRUCTION_ACTIVE'
    ]).toContain(readiness.status)
    expect(totalScore).toBe(readiness.current_confidence_percent)
    expect(totalWeight).toBe(100)
    expect(readiness.entry_decision.allowed).toBe(true)
    expect(readiness.entry_decision.allowed_mode).toBe(
      'controlled_construction'
    )
    if (pending.length > 0) {
      expect(readiness.current_confidence_percent).toBeLessThanOrEqual(
        readiness.readiness_policy.max_confidence_while_p0_or_p1_open
      )
    } else {
      expect(readiness.current_confidence_percent).toBe(100)
      expect(
        readiness.score_model.every((item) => item.status === 'PASS')
      ).toBe(true)
    }
  })

  it('requires CI to reproduce local gates', () => {
    const workflow = read('.github/workflows/verify.yml')

    expect(workflow).toContain('node-version-file: .nvmrc')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate install')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate postgres')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate certify')
    expect(workflow).toContain('node scripts/ci-bar.mjs gate e2e')
    expect(workflow).toContain('postgres:16-alpine')
    expect(workflow).toContain('name: REM21 CI bar (Node 22)')
  })

  it('requires a non-placeholder persistence migration for construction entry', () => {
    const migration = read('packages/persistence/migrations/0000_initial.sql')
    const requiredTables = [
      'conversations',
      'messages',
      'sessions',
      'agent_runs',
      'tool_calls',
      'approval_requests',
      'tasks',
      'audit_events',
      'idempotency',
      'outbox_events'
    ]

    expect(migration).not.toMatch(/placeholder/i)
    for (const table of requiredTables) {
      expect(migration, `${table} must be created`).toContain(
        `CREATE TABLE IF NOT EXISTS ${table}`
      )
    }
    expect(migration).toContain('PRIMARY KEY (tenant_id, key)')
    expect(migration).toContain('inbound:<channel>:<externalMessageId>')
    expect(migration).toContain('UNIQUE (session_id, source, idempotency_key)')
  })

  it('keeps readiness evidence files present and linked to package scripts', () => {
    const packageJson = readJson('package.json')

    expect(exists('docs/03_build/0310_construction_readiness_95.md')).toBe(true)
    expect(exists('docs/03_build/0310_construction_readiness_95.json')).toBe(
      true
    )
    expect(packageJson.scripts.readiness).toBe(
      'vitest run tests/construction-readiness.test.js'
    )
    expect(packageJson.scripts.verify).toContain('npm run format:check')
    expect(packageJson.scripts.verify).toContain('npm run test:coverage')
  })
})
