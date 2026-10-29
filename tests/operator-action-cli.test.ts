/**
 * SPEC 0262 §6.1 — the real (non-root) launch of the script is refused before
 * reading the policy, the proof or any datastore. This is the only OS-level
 * evidence available without root; the positive root launch and the real
 * datastore profile are NOT_RUN until the T4 environment.
 */
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

const args = [
  'tsx',
  'scripts/revoke-operator-sessions.ts',
  '--tenant',
  'tenant_00000000-0000-4000-8000-000000000262',
  '--operator-id',
  'operator.cli.synthetic',
  '--expected-revision',
  '1',
  '--proof',
  '/srv/none/2f6a9e0c-7c7b-4b57-9a54-0d6f4d3b1a11.json'
]

describe('revoke-operator-sessions.ts (real launch, not root)', () => {
  it.skipIf(process.getuid?.() === 0)(
    'is refused with exit 2 for dry-run and --apply, ignoring DATABASE_URL',
    () => {
      for (const extra of [[], ['--apply']]) {
        const run = spawnSync('npx', [...args, ...extra], {
          encoding: 'utf8',
          env: {
            ...process.env,
            DATABASE_URL: 'postgres://nobody:secret@127.0.0.1:1/none'
          }
        })
        expect(run.status).toBe(2)
        const out = JSON.parse(run.stdout.trim()) as {
          outcome: string
          reason: string
        }
        expect(out).toEqual({
          outcome: 'REFUSED',
          reason: 'a real launch requires euid 0'
        })
        expect(run.stdout + run.stderr).not.toContain('secret')
      }
    },
    60_000
  )

  it('rejects the test and force switches', () => {
    for (const flag of ['--test', '--force', '--policy']) {
      const run = spawnSync('npx', [...args, flag, 'x'], { encoding: 'utf8' })
      expect(run.status).toBe(2)
      expect(run.stdout).toContain('REFUSED')
    }
  }, 60_000)
})
