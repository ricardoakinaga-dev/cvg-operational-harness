import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  createPool,
  poolConfigFor,
  scrubPgEnvironment
} from '../scripts/lib/operator-action-connect.ts'

import {
  artifactSha256,
  INSTALLED_ARTIFACT_FILES,
  OperatorActionRefusal,
  type DatastoreProfile
} from '../scripts/lib/operator-action.ts'

// SPEC 0262 section 6.1 (AUD0625 review of 0262 S3-S5, P2-1): the shell and
// the connection file cannot pick another datastore than the policy profile.
// Synthetic hosts and secrets only; nothing connects.

const profile: DatastoreProfile = {
  host: 'db.internal.synthetic',
  port: 5432,
  database: 'cvg_synthetic',
  user: 'cvg_invalidator'
}
const base =
  'postgres://cvg_invalidator:p%40ss@db.internal.synthetic:5432/cvg_synthetic'

const hostile = (): NodeJS.ProcessEnv => ({
  PGPASSWORD: 'from-shell',
  PGSSLMODE: 'require',
  PGOPTIONS: '-c search_path=evil',
  PGHOST: 'shell-host',
  PGPORT: '6543',
  PGUSER: 'shell-user',
  PGDATABASE: 'shell-db',
  PGSSLROOTCERT: '/tmp/ca.pem',
  DATABASE_URL: 'postgres://x@shell/db',
  HOME: '/root'
})

/** What `pg` would actually dial and send for a config (read-only view). */
function parametersOf(config: object): Record<string, unknown> {
  return (
    new Client(config) as unknown as {
      connectionParameters: Record<string, unknown>
    }
  ).connectionParameters
}

describe('scrubPgEnvironment', () => {
  it('removes every PG* variable, keeps the rest and reports only names', () => {
    const env = hostile()
    const removed = scrubPgEnvironment(env)
    expect(removed.sort()).toEqual(
      Object.keys(hostile())
        .filter((key) => key.startsWith('PG'))
        .sort()
    )
    expect(Object.keys(env).sort()).toEqual(['DATABASE_URL', 'HOME'])
    expect(JSON.stringify(removed)).not.toContain('from-shell')
  })
})

describe('poolConfigFor', () => {
  it('sets every field from the profile and the password from the file', () => {
    expect(poolConfigFor(`${base}\n`, profile)).toMatchObject({
      host: profile.host,
      port: profile.port,
      database: profile.database,
      user: profile.user,
      password: 'p@ss',
      ssl: false
    })
  })

  it.each([
    ['host', `${base}?host=other.example`],
    ['port', `${base}?port=6543`],
    ['dbname', `${base}?dbname=other`],
    ['user', `${base}?user=other`],
    ['options', `${base}?options=-c%20search_path%3Devil`],
    ['sslmode', `${base}?sslmode=disable`],
    ['empty query', `${base}?`],
    ['fragment', `${base}#frag`],
    ['empty fragment', `${base}#`]
  ])('refuses a %s in the connection file', (_name, text) => {
    expect(() => poolConfigFor(text, profile)).toThrow(OperatorActionRefusal)
  })

  it.each([
    ['host', base.replace('db.internal.synthetic', 'other.example')],
    ['port', base.replace(':5432', ':5433')],
    ['database', base.replace('cvg_synthetic', 'other')],
    ['user', base.replace('cvg_invalidator', 'other')],
    ['scheme', base.replace('postgres:', 'mysql:')],
    ['text', 'not a url']
  ])('refuses a different %s than the profile', (_name, text) => {
    expect(() => poolConfigFor(text, profile)).toThrow(OperatorActionRefusal)
  })
})

describe('createPool', () => {
  it('resolves to the profile whatever the shell exports', () => {
    const env = hostile()
    const pool = createPool(
      'postgres://cvg_invalidator@db.internal.synthetic/cvg_synthetic',
      profile,
      env
    )
    const parameters = parametersOf(pool.options)
    expect(parameters).toMatchObject({
      host: profile.host,
      port: profile.port,
      database: profile.database,
      user: profile.user,
      ssl: false
    })
    expect(parameters.password ?? '').toBe('')
    expect(parameters.options ?? '').toBe('')
    expect(Object.keys(env).filter((key) => key.startsWith('PG'))).toEqual([])
    void pool.end()
  })

  it('would have taken password and options from the shell without the scrub', () => {
    // Control: proves the assertions above can fail.
    const env = hostile()
    const config = poolConfigFor(
      'postgres://cvg_invalidator@db.internal.synthetic/cvg_synthetic',
      profile
    )
    const saved = { ...process.env }
    Object.assign(process.env, env)
    try {
      const parameters = parametersOf(config)
      expect(parameters.password).toBe('from-shell')
      expect(parameters.options).toBe('-c search_path=evil')
    } finally {
      for (const key of Object.keys(env)) delete process.env[key]
      Object.assign(process.env, saved)
    }
  })

  it('refuses a query before any connection is opened', () => {
    expect(() =>
      createPool(`${base}?host=other.example`, profile, hostile())
    ).toThrow(OperatorActionRefusal)
  })
})

describe('artifactSha256', () => {
  const files = [
    {
      label: 'scripts/revoke-operator-sessions.ts',
      bytes: Buffer.from('entry')
    },
    { label: 'scripts/lib/operator-action.ts', bytes: Buffer.from('lib') },
    {
      label: 'packages/persistence/src/case-authority-postgres.ts',
      bytes: Buffer.from('persistence')
    }
  ]
  const base = artifactSha256(files)

  it('is stable and independent of the order', () => {
    expect(base).toMatch(/^[0-9a-f]{64}$/)
    expect(artifactSha256([...files].reverse())).toBe(base)
  })

  it.each([0, 1, 2])('changes when file %i changes', (index) => {
    const changed = files.map((file, i) =>
      i === index ? { ...file, bytes: Buffer.from('changed') } : file
    )
    expect(artifactSha256(changed)).not.toBe(base)
  })

  it('changes when a file is removed, added or renamed', () => {
    expect(artifactSha256(files.slice(0, 2))).not.toBe(base)
    expect(
      artifactSha256([...files, { label: 'x.ts', bytes: Buffer.from('x') }])
    ).not.toBe(base)
    expect(
      artifactSha256(
        files.map((file, i) =>
          i === 0 ? { ...file, label: 'renamed.ts' } : file
        )
      )
    ).not.toBe(base)
  })

  it('refuses an empty list', () => {
    expect(() => artifactSha256([])).toThrow()
  })
})

describe('INSTALLED_ARTIFACT_FILES', () => {
  it('lists existing files, the write path of the persistence included', () => {
    for (const label of INSTALLED_ARTIFACT_FILES) {
      expect(existsSync(resolve(process.cwd(), label)), label).toBe(true)
    }
    expect(INSTALLED_ARTIFACT_FILES).toEqual(
      expect.arrayContaining([
        'scripts/revoke-operator-sessions.ts',
        'scripts/lib/operator-action.ts',
        'scripts/lib/operator-action-connect.ts',
        'packages/persistence/src/case-authority.ts',
        'packages/persistence/src/case-authority-postgres.ts'
      ])
    )
    expect(new Set(INSTALLED_ARTIFACT_FILES).size).toBe(
      INSTALLED_ARTIFACT_FILES.length
    )
  })
})
