import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

// The verifier's negative suite is the proof that forged evidence is refused.
// It lives here so a broken fixture fails the unit gate instead of going unseen.
describe('certification verifier self-test', () => {
  it('rejects every forged evidence case for its own reason', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cvg-negative-'))
    const report = path.join(dir, 'negative-validation.json')
    try {
      const run = spawnSync(
        process.execPath,
        ['scripts/phase10-verify.mjs', '--self-test'],
        {
          encoding: 'utf8',
          env: { ...process.env, CVG_NEGATIVE_VALIDATION_PATH: report }
        }
      )
      expect(run.stderr).toContain('self-test verdict PASS')
      expect(run.status).toBe(0)
      const output = JSON.parse(fs.readFileSync(report, 'utf8'))
      expect(output.verdict).toBe('PASS')
      expect(output.checks.length).toBeGreaterThanOrEqual(43)
      expect(output.checks.every((check) => check.verdict === 'PASS')).toBe(
        true
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }, 120000)
})
