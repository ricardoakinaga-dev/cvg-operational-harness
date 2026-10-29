// SPEC 0225 f3: the opt-in adapter (resultStorage:{version:1}) against a real
// PostgreSQL with migration 0033 and an owner-installed activation. J01-J04
// (native round trip, codec bounds, integrity refusal) and J08/J12 (atomic
// confirm, idempotent equal, conflict, no demotion). J13 stays deferred.
import { createHash, randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { OperationalExecutionError } from '@cvg/harness'
import { PostgresOperationalEffectJournal } from '../operational-execution-postgres.ts'
import { renderJournalResultActivation } from '../operational-effect-result-guard.ts'
import { runPostgresMigrations } from '../postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const itWithPostgres = testDatabaseUrl ? it : it.skip
const tenant = 'tenant_00000000-0000-4000-8000-000000000225'
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000226'
const hash = 'a'.repeat(64)

let admin: Client
let pool: Pool
let schema = ''
let role = ''
let password = ''
let counter = 0

function serviceUrl(): { host: string; port: number; database: string } {
  const url = new URL(testDatabaseUrl as string)
  return {
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.slice(1)
  }
}
function journal(mode?: 1): PostgresOperationalEffectJournal {
  return new PostgresOperationalEffectJournal(
    pool,
    mode ? { resultStorage: { version: 1 } } : {}
  )
}
async function failure(action: Promise<unknown>): Promise<string> {
  try {
    await action
  } catch (error) {
    expect(error).toBeInstanceOf(OperationalExecutionError)
    return (error as Error).message
  }
  throw new Error('expected a rejection')
}
function key(): string {
  counter += 1
  return `op_j225_${counter}`
}
async function confirmed(value: unknown, tenantId = tenant) {
  const j = journal(1)
  const operationKey = key()
  const attemptId = `attempt_${counter}`
  await j.reserve({ tenantId, operationKey, proposalHash: hash, attemptId })
  await j.markStarted({ tenantId, operationKey, attemptId })
  const record = await j.confirm({
    tenantId,
    operationKey,
    attemptId,
    result: value
  })
  return { j, operationKey, attemptId, record }
}
/** Owner-side tamper with the guard momentarily disabled; re-enabled before any read. */
async function tamper(operationKey: string, payload: unknown): Promise<void> {
  await admin.query(
    'ALTER TABLE operational_effect_journal DISABLE TRIGGER journal_result_storage_guard'
  )
  try {
    await admin.query(
      `UPDATE operational_effect_journal SET result_storage_payload=$2::jsonb
        WHERE operation_key=$1`,
      [operationKey, JSON.stringify(payload)]
    )
  } finally {
    await admin.query(
      'ALTER TABLE operational_effect_journal ENABLE TRIGGER journal_result_storage_guard'
    )
  }
}
const envelopeOf = (text: string, over: Record<string, unknown> = {}) => {
  const bytes = Buffer.from(text)
  return {
    encoding: 'base64',
    decodedBytes: bytes.length,
    decodedSha256: createHash('sha256').update(bytes).digest('hex'),
    data: bytes.toString('base64'),
    ...over
  }
}

describe('SPEC 0225 f3 — journal adapter, storage version 1', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) return
    admin = new Client({ connectionString: testDatabaseUrl })
    await admin.connect()
    schema = `cvg_j225_${Date.now()}_${randomBytes(3).toString('hex')}`
    role = `j225_${randomBytes(4).toString('hex')}`
    password = randomBytes(16).toString('hex')
    await runPostgresMigrations(admin, { schemaName: schema })
    await admin.query(`SET search_path TO "${schema}"`)
    // History written before activation: version 0, never adopted.
    await admin.query(
      `INSERT INTO operational_effect_journal
         (tenant_id,operation_key,proposal_hash,state,attempt_id,result)
       VALUES ($1,'legacy-null',$2,'CONFIRMED','la','null'::jsonb),
              ($1,'legacy-failed',$2,'FAILED','la',NULL),
              ($1,'legacy-unknown',$2,'CONFIRMED','la',NULL)`,
      [tenant, hash]
    )
    await admin.query(
      `CREATE ROLE ${role} LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS
         NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`
    )
    const db = serviceUrl().database
    await admin.query(`REVOKE CREATE,TEMPORARY ON DATABASE "${db}" FROM PUBLIC`)
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO ${role}`)
    await admin.query(
      `GRANT SELECT,INSERT,UPDATE ON "${schema}".operational_effect_journal TO ${role}`
    )
    await admin.query(
      `GRANT SELECT ON "${schema}".schema_migrations TO ${role}`
    )
    await admin.query(renderJournalResultActivation(schema, role).sql)
    pool = new Pool({
      ...serviceUrl(),
      user: role,
      password,
      max: 1,
      options: `-c search_path=${schema}`
    })
  })
  afterAll(async () => {
    if (!testDatabaseUrl) return
    await pool.end()
    await admin.query('RESET search_path')
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    await admin.query(`DROP ROLE IF EXISTS ${role}`)
    await admin.query(
      `GRANT TEMPORARY ON DATABASE "${serviceUrl().database}" TO PUBLIC`
    )
    await admin.end()
  })

  describe('opt-in port', () => {
    it.each([
      [{ resultStorage: { version: 0 } }],
      [{ resultStorage: { version: 2 } }],
      [{ resultStorage: {} }],
      [{ resultStorage: { version: 1, extra: true } }],
      [{ resultStorage: null }],
      [{ resultStorage: [1] }],
      [{ resultStorage: 1 }],
      [
        {
          get resultStorage() {
            return { version: 1 }
          }
        }
      ]
    ])('refuses the malformed opt-in %#', (options) => {
      expect(
        () =>
          new PostgresOperationalEffectJournal({} as never, options as never)
      ).toThrow(/JOURNAL_STORAGE_MODE/)
    })
  })

  describe('J01/J02 round trip through a new adapter instance', () => {
    const values: [string, unknown][] = [
      ['null', null],
      ['false', false],
      ['zero', 0],
      ['negative zero text', -1.5e-7],
      ['empty string', ''],
      ['empty array', []],
      ['empty object', {}],
      ['json-looking string', '{"a":1}'],
      ['the string null', 'null'],
      ['NUL and escapes', 'a\u0000b\n"\\ '],
      ['unicode', 'ação 😀 日本'],
      ['nested', { a: [1, { b: null }], c: { d: [] } }],
      ['NUL, empty and numeric keys', { '': 1, '\u0000': 2, '10': 3, '2': 4 }],
      ['reserved keys', JSON.parse('{"__proto__":1,"constructor":2}')],
      [
        'apparent envelope',
        {
          encoding: 'base64',
          decodedBytes: 1,
          decodedSha256: 'x',
          data: 'AA=='
        }
      ]
    ]
    itWithPostgres.each(values)('preserves %s exactly', async (_n, value) => {
      const { operationKey, record } = await confirmed(value)
      expect(record.state).toBe('CONFIRMED')
      const again = await journal(1).get(tenant, operationKey)
      expect(again?.result).toEqual(value)
      expect(again).toHaveProperty('result')
      const row = (
        await admin.query(
          `SELECT result IS NULL AS legacy_null, result_storage_version AS v,
                  result_storage_payload IS NOT NULL AS has
             FROM operational_effect_journal WHERE operation_key=$1`,
          [operationKey]
        )
      ).rows[0]
      expect(row).toEqual({ legacy_null: true, v: 1, has: true })
    })
    itWithPostgres(
      'keeps tenants apart and answers null for a missing key',
      async () => {
        const { operationKey } = await confirmed({ only: 'mine' })
        expect(await journal(1).get(otherTenant, operationKey)).toBeNull()
      }
    )
  })

  describe('J03 limits at the adapter', () => {
    itWithPostgres(
      'stores a value of exactly 1 MiB and refuses 1 MiB + 1 without demoting',
      async () => {
        const overhead = JSON.stringify('').length
        const exact = 'x'.repeat(1048576 - overhead)
        const big = await confirmed(exact)
        expect((await journal(1).get(tenant, big.operationKey))?.result).toBe(
          exact
        )
        const j = journal(1)
        const operationKey = key()
        const attemptId = 'a_too_large'
        await j.reserve({
          tenantId: tenant,
          operationKey,
          proposalHash: hash,
          attemptId
        })
        await j.markStarted({ tenantId: tenant, operationKey, attemptId })
        expect(
          await failure(
            j.confirm({
              tenantId: tenant,
              operationKey,
              attemptId,
              result: exact + 'y'
            })
          )
        ).toBe('JOURNAL_RESULT_TOO_LARGE')
        expect((await j.get(tenant, operationKey))?.state).toBe(
          'EFFECT_STARTED'
        )
      }
    )
    itWithPostgres('refuses a non-JSON result before any write', async () => {
      const j = journal(1)
      const operationKey = key()
      const attemptId = 'a_invalid'
      await j.reserve({
        tenantId: tenant,
        operationKey,
        proposalHash: hash,
        attemptId
      })
      await j.markStarted({ tenantId: tenant, operationKey, attemptId })
      for (const result of [undefined, () => 1, 1n, Symbol('x'), NaN]) {
        expect(
          await failure(
            j.confirm({ tenantId: tenant, operationKey, attemptId, result })
          )
        ).toBe('JOURNAL_RESULT_INVALID')
      }
      expect((await j.get(tenant, operationKey))?.state).toBe('EFFECT_STARTED')
    })
  })

  describe('J04 integrity refusal on read', () => {
    const text = '{"a":1,"b":[true,null]}'
    const cases: [string, (e: ReturnType<typeof envelopeOf>) => unknown][] = [
      ['wrong sha', (e) => ({ ...e, decodedSha256: '0'.repeat(64) })],
      [
        'flipped byte',
        () =>
          envelopeOf(text, {
            data: Buffer.from(text.replace('1', '2')).toString('base64')
          })
      ],
      ['non canonical order', () => envelopeOf('{"b":1,"a":2}')],
      ['duplicate key', () => envelopeOf('{"a":1,"a":2}')],
      ['trailing data', () => envelopeOf('{"a":1} ')],
      ['whitespace', () => envelopeOf('{"a": 1}')],
      ['BOM', () => envelopeOf('﻿{"a":1}')],
      ['invalid JSON', () => envelopeOf('{"a":')]
    ]
    itWithPostgres.each(cases)('refuses %s', async (_n, build) => {
      const { operationKey } = await confirmed({ ok: true })
      await tamper(operationKey, build(envelopeOf(text)))
      const message = await failure(journal(1).get(tenant, operationKey))
      expect(message).toBe('JOURNAL_RESULT_CORRUPT')
    })
    itWithPostgres('accepts the intact control', async () => {
      const { operationKey } = await confirmed({ ok: true })
      await tamper(operationKey, envelopeOf('{"a":1,"b":[true,null]}'))
      expect((await journal(1).get(tenant, operationKey))?.result).toEqual({
        a: 1,
        b: [true, null]
      })
    })
  })

  describe('J05 (adapter side) legacy rows are never adopted', () => {
    itWithPostgres.each([
      ['legacy-null', 'JOURNAL_STORAGE_MODE'],
      ['legacy-failed', 'JOURNAL_STORAGE_MODE'],
      ['legacy-unknown', 'LEGACY_RESULT_UNKNOWN']
    ])('reserve %s in version 1 is refused', async (operationKey, reason) => {
      const j = journal(1)
      expect(
        await failure(
          j.reserve({
            tenantId: tenant,
            operationKey,
            proposalHash: hash,
            attemptId: 'new'
          })
        )
      ).toBe(reason)
      expect(
        await failure(
          j.markStarted({ tenantId: tenant, operationKey, attemptId: 'la' })
        )
      ).toBe(reason)
    })
  })

  describe('J08/J12 atomic confirm', () => {
    itWithPostgres('confirm is idempotent for an equal value', async () => {
      const first = await confirmed({ n: 1 })
      const again = await first.j.confirm({
        tenantId: tenant,
        operationKey: first.operationKey,
        attemptId: first.attemptId,
        result: { n: 1 }
      })
      expect(again).toEqual(first.record)
    })
    itWithPostgres(
      'confirm with a different value conflicts and keeps the first',
      async () => {
        const first = await confirmed({ n: 1 })
        expect(
          await failure(
            first.j.confirm({
              tenantId: tenant,
              operationKey: first.operationKey,
              attemptId: first.attemptId,
              result: { n: 2 }
            })
          )
        ).toBe('JOURNAL_RESULT_CONFLICT')
        expect(
          (await journal(1).get(tenant, first.operationKey))?.result
        ).toEqual({ n: 1 })
      }
    )
    itWithPostgres(
      'a fenced attempt neither confirms nor overwrites',
      async () => {
        const first = await confirmed({ n: 1 })
        expect(
          await failure(
            first.j.confirm({
              tenantId: tenant,
              operationKey: first.operationKey,
              attemptId: 'someone_else',
              result: { n: 9 }
            })
          )
        ).toBe('Effect attempt is fenced')
      }
    )
    itWithPostgres(
      'a CONFIRMED effect cannot be failed or marked uncertain',
      async () => {
        const first = await confirmed({ n: 1 })
        for (const act of [
          () =>
            first.j.fail({
              tenantId: tenant,
              operationKey: first.operationKey,
              attemptId: first.attemptId,
              error: 'late'
            }),
          () =>
            first.j.markUncertain({
              tenantId: tenant,
              operationKey: first.operationKey,
              attemptId: first.attemptId,
              reason: 'late'
            })
        ]) {
          await failure(act())
        }
        const row = await journal(1).get(tenant, first.operationKey)
        expect(row?.state).toBe('CONFIRMED')
        expect(row?.result).toEqual({ n: 1 })
      }
    )
    itWithPostgres(
      'uncertain and failed stay payload-free; a failed effect can be reserved again',
      async () => {
        const j = journal(1)
        const operationKey = key()
        await j.reserve({
          tenantId: tenant,
          operationKey,
          proposalHash: hash,
          attemptId: 'a1'
        })
        await j.markStarted({ tenantId: tenant, operationKey, attemptId: 'a1' })
        const uncertain = await j.markUncertain({
          tenantId: tenant,
          operationKey,
          attemptId: 'a1',
          reason: 'unknown'
        })
        expect(uncertain.state).toBe('UNCERTAIN')
        expect(uncertain).not.toHaveProperty('result')
        const failedKey = key()
        await j.reserve({
          tenantId: tenant,
          operationKey: failedKey,
          proposalHash: hash,
          attemptId: 'f1'
        })
        await j.markStarted({
          tenantId: tenant,
          operationKey: failedKey,
          attemptId: 'f1'
        })
        await j.fail({
          tenantId: tenant,
          operationKey: failedKey,
          attemptId: 'f1',
          error: 'x'
        })
        const retried = await j.reserve({
          tenantId: tenant,
          operationKey: failedKey,
          proposalHash: hash,
          attemptId: 'f2'
        })
        expect(retried.state).toBe('RESERVED')
        expect(retried).not.toHaveProperty('error')
      }
    )
    itWithPostgres(
      'a different proposal on the same key conflicts',
      async () => {
        const first = await confirmed({ n: 1 })
        expect(
          await failure(
            first.j.reserve({
              tenantId: tenant,
              operationKey: first.operationKey,
              proposalHash: 'b'.repeat(64),
              attemptId: 'x'
            })
          )
        ).toBe('Operation key is bound to a different proposal')
      }
    )
    itWithPostgres(
      'a rolled-back confirm leaves the effect started',
      async () => {
        const j = journal(1)
        const operationKey = key()
        await j.reserve({
          tenantId: tenant,
          operationKey,
          proposalHash: hash,
          attemptId: 'rb'
        })
        await j.markStarted({ tenantId: tenant, operationKey, attemptId: 'rb' })
        // A BEFORE UPDATE failure inside the confirm transaction undoes the whole row change.
        await admin.query(
          `CREATE FUNCTION fail_confirm() RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN IF NEW.state='CONFIRMED' THEN RAISE EXCEPTION 'boom'; END IF; RETURN NEW; END $$`
        )
        await admin.query(
          `CREATE TRIGGER zz_fail_confirm BEFORE UPDATE ON operational_effect_journal
         FOR EACH ROW EXECUTE FUNCTION fail_confirm()`
        )
        try {
          await expect(
            j.confirm({
              tenantId: tenant,
              operationKey,
              attemptId: 'rb',
              result: { n: 1 }
            })
          ).rejects.toThrow(/boom/)
        } finally {
          await admin.query(
            'DROP TRIGGER zz_fail_confirm ON operational_effect_journal'
          )
          await admin.query('DROP FUNCTION fail_confirm()')
        }
        const row = await journal(1).get(tenant, operationKey)
        expect(row?.state).toBe('EFFECT_STARTED')
        expect(row).not.toHaveProperty('result')
      }
    )
  })

  describe('J06/J07 credential cutover', () => {
    const other = () => `j225o_${randomBytes(4).toString('hex')}`
    async function withOtherLogin<T>(
      grant: string,
      run: (name: string, otherPassword: string) => Promise<T>
    ): Promise<T> {
      const name = other()
      const otherPassword = randomBytes(16).toString('hex')
      await admin.query(
        `CREATE ROLE ${name} LOGIN PASSWORD '${otherPassword}' NOSUPERUSER
           NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION NOINHERIT`
      )
      try {
        await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO ${name}`)
        if (grant)
          await admin.query(
            `GRANT ${grant} ON "${schema}".operational_effect_journal TO ${name}`
          )
        return await run(name, otherPassword)
      } finally {
        await admin.query(`DROP OWNED BY ${name}`)
        await admin.query(`DROP ROLE ${name}`)
      }
    }
    const clientAs = async (name: string, otherPassword: string) => {
      const client = new Client({
        ...serviceUrl(),
        user: name,
        password: otherPassword,
        options: `-c search_path=${schema}`
      })
      await client.connect()
      return client
    }
    itWithPostgres(
      'an old credential with no grant is denied before any row is visible',
      async () => {
        await withOtherLogin('', async (name, pw) => {
          const client = await clientAs(name, pw)
          try {
            await expect(
              client.query('SELECT * FROM operational_effect_journal')
            ).rejects.toMatchObject({ code: '42501' })
          } finally {
            await client.end()
          }
        })
      }
    )
    itWithPostgres(
      'an inherited login that can still read the table fails the activation check until revoked',
      async () => {
        await withOtherLogin('SELECT', async () => {
          expect(await failure(journal(1).get(tenant, 'legacy-null'))).toBe(
            'JOURNAL_STORAGE_MODE'
          )
        })
        expect(await journal(1).get(tenant, 'nothing')).toBeNull()
      }
    )
    itWithPostgres(
      'an unqualified principal (superuser) cannot serve version 1',
      async () => {
        const privileged = new Pool({
          connectionString: testDatabaseUrl,
          max: 1,
          options: `-c search_path=${schema}`
        })
        try {
          expect(
            await failure(
              new PostgresOperationalEffectJournal(privileged, {
                resultStorage: { version: 1 }
              }).get(tenant, 'x')
            )
          ).toBe('JOURNAL_STORAGE_MODE')
        } finally {
          await privileged.end()
        }
      }
    )
    itWithPostgres(
      'another role cannot insert version 1 and the bound principal cannot insert version 0',
      async () => {
        await withOtherLogin('SELECT,INSERT,UPDATE', async (name, pw) => {
          const client = await clientAs(name, pw)
          try {
            await client.query('SELECT set_config($1,$2,false)', [
              'cvg.tenant_id',
              tenant
            ])
            await expect(
              client.query(
                `INSERT INTO operational_effect_journal
                   (tenant_id,operation_key,proposal_hash,state,attempt_id,
                    result_storage_version)
                 VALUES ($1,$2,$3,'RESERVED','x',1)`,
                [tenant, key(), hash]
              )
            ).rejects.toMatchObject({ code: '42501' })
            // Forged session settings do not activate anything.
            await client.query("SET cvg.journal_result_storage = 'on'")
            await expect(
              client.query(
                `INSERT INTO operational_effect_journal
                   (tenant_id,operation_key,proposal_hash,state,attempt_id,
                    result_storage_version)
                 VALUES ($1,$2,$3,'RESERVED','x',1)`,
                [tenant, key(), hash]
              )
            ).rejects.toMatchObject({ code: '42501' })
          } finally {
            await client.end()
          }
        })
        const principal = await pool.connect()
        try {
          await principal.query('SELECT set_config($1,$2,false)', [
            'cvg.tenant_id',
            tenant
          ])
          await expect(
            principal.query(
              `INSERT INTO operational_effect_journal
                 (tenant_id,operation_key,proposal_hash,state,attempt_id)
               VALUES ($1,$2,$3,'RESERVED','x')`,
              [tenant, key(), hash]
            )
          ).rejects.toMatchObject({ code: '42501' })
        } finally {
          principal.release()
        }
      }
    )
    itWithPostgres(
      'the owner cannot rewrite or delete a confirmed version-1 row',
      async () => {
        const { operationKey } = await confirmed({ keep: 'me' })
        await expect(
          admin.query(
            `UPDATE operational_effect_journal SET error='x' WHERE operation_key=$1`,
            [operationKey]
          )
        ).rejects.toMatchObject({ code: '23514' })
        await expect(
          admin.query(
            `DELETE FROM operational_effect_journal WHERE operation_key=$1`,
            [operationKey]
          )
        ).rejects.toMatchObject({ code: '42501' })
      }
    )
  })

  describe('readiness refuses an unqualified environment', () => {
    async function scratchSchema(bodyPrincipal: string): Promise<string> {
      const name = `cvg_j225r_${Date.now()}_${randomBytes(3).toString('hex')}`
      await runPostgresMigrations(admin, { schemaName: name })
      await admin.query(`SET search_path TO "${schema}"`)
      await admin.query(`GRANT USAGE ON SCHEMA "${name}" TO ${role}`)
      await admin.query(
        `GRANT SELECT,INSERT,UPDATE ON "${name}".operational_effect_journal TO ${role}`
      )
      await admin.query(
        `GRANT SELECT ON "${name}".schema_migrations TO ${role}`
      )
      await admin.query(renderJournalResultActivation(name, bodyPrincipal).sql)
      return name
    }
    async function asService<T>(
      name: string,
      run: (j: PostgresOperationalEffectJournal) => Promise<T>
    ): Promise<T> {
      const scoped = new Pool({
        ...serviceUrl(),
        user: role,
        password,
        max: 1,
        options: `-c search_path=${name}`
      })
      try {
        return await run(
          new PostgresOperationalEffectJournal(scoped, {
            resultStorage: { version: 1 }
          })
        )
      } finally {
        await scoped.end()
      }
    }
    itWithPostgres(
      'a guard activated for a different principal does not serve this one',
      async () => {
        const name = await scratchSchema('someone_else')
        try {
          expect(
            await asService(name, (j) => failure(j.get(tenant, 'x')))
          ).toBe('JOURNAL_STORAGE_MODE')
        } finally {
          await admin.query(`DROP SCHEMA "${name}" CASCADE`)
        }
      }
    )
    itWithPostgres(
      'a dropped storage constraint reprobates the activation',
      async () => {
        const name = await scratchSchema(role)
        try {
          expect(await asService(name, (j) => j.get(tenant, 'x'))).toBeNull()
          await admin.query(
            `ALTER TABLE "${name}".operational_effect_journal
             DROP CONSTRAINT journal_result_storage_envelope`
          )
          expect(
            await asService(name, (j) => failure(j.get(tenant, 'x')))
          ).toBe('JOURNAL_STORAGE_MODE')
        } finally {
          await admin.query(`DROP SCHEMA "${name}" CASCADE`)
        }
      }
    )
    itWithPostgres(
      'another superuser login makes the table reachable and is refused',
      async () => {
        const name = `j225s_${randomBytes(4).toString('hex')}`
        await admin.query(
          `CREATE ROLE ${name} LOGIN SUPERUSER PASSWORD '${randomBytes(8).toString('hex')}'`
        )
        try {
          expect(await failure(journal(1).get(tenant, 'x'))).toBe(
            'JOURNAL_STORAGE_MODE'
          )
        } finally {
          await admin.query(`DROP ROLE ${name}`)
        }
        expect(await journal(1).get(tenant, 'x')).toBeNull()
      }
    )
    itWithPostgres(
      'a same-named TEMP table in the serving session is refused, not trusted',
      async () => {
        // A temp table that predates the revoke: readiness must not resolve to it.
        const db = serviceUrl().database
        await admin.query(`GRANT TEMPORARY ON DATABASE "${db}" TO ${role}`)
        await pool.query('CREATE TEMP TABLE operational_effect_journal (x int)')
        await admin.query(`REVOKE TEMPORARY ON DATABASE "${db}" FROM ${role}`)
        try {
          expect(await failure(journal(1).get(tenant, 'x'))).toBe(
            'JOURNAL_STORAGE_MODE'
          )
        } finally {
          await pool.query('DROP TABLE pg_temp.operational_effect_journal')
        }
        expect(await journal(1).get(tenant, 'x')).toBeNull()
      }
    )
    itWithPostgres(
      'a foreign session is invisible to the unprivileged principal: exclusion rests on the ACL checks',
      async () => {
        // pg_stat_activity masks datname/backend_type of other users' sessions for a
        // role without pg_read_all_stats, so readiness cannot count them. The
        // operator-side activation procedure must check sessions as the owner.
        const name = `j225c_${randomBytes(4).toString('hex')}`
        const pw = randomBytes(8).toString('hex')
        await admin.query(`CREATE ROLE ${name} LOGIN PASSWORD '${pw}'`)
        const foreign = new Client({
          ...serviceUrl(),
          user: name,
          password: pw
        })
        await foreign.connect()
        try {
          expect(await journal(1).get(tenant, 'x')).toBeNull()
          await expect(
            foreign.query('SELECT * FROM operational_effect_journal')
          ).rejects.toBeDefined()
        } finally {
          await foreign.end()
          await admin.query(`DROP ROLE ${name}`)
        }
      }
    )
  })

  describe('mode/readiness mismatch fails before any write', () => {
    itWithPostgres(
      'the legacy adapter is refused on an activated schema',
      async () => {
        const j = journal()
        const before = (
          await admin.query(
            'SELECT count(*)::int AS n FROM operational_effect_journal'
          )
        ).rows[0].n
        expect(
          await failure(
            j.reserve({
              tenantId: tenant,
              operationKey: key(),
              proposalHash: hash,
              attemptId: 'm0'
            })
          )
        ).toBe('JOURNAL_STORAGE_MODE')
        expect(await failure(j.get(tenant, 'legacy-null'))).toBe(
          'JOURNAL_STORAGE_MODE'
        )
        const after = (
          await admin.query(
            'SELECT count(*)::int AS n FROM operational_effect_journal'
          )
        ).rows[0].n
        expect(after).toBe(before)
      }
    )
    itWithPostgres(
      'the version-1 adapter is refused on a schema that was not activated',
      async () => {
        const plain = `cvg_j225p_${Date.now()}_${randomBytes(3).toString('hex')}`
        await runPostgresMigrations(admin, { schemaName: plain })
        await admin.query(`SET search_path TO "${schema}"`)
        try {
          await admin.query(`GRANT USAGE ON SCHEMA "${plain}" TO ${role}`)
          await admin.query(
            `GRANT SELECT,INSERT,UPDATE ON "${plain}".operational_effect_journal TO ${role}`
          )
          const other = new Pool({
            ...serviceUrl(),
            user: role,
            password,
            max: 1,
            options: `-c search_path=${plain}`
          })
          try {
            const j = new PostgresOperationalEffectJournal(other, {
              resultStorage: { version: 1 }
            })
            expect(await failure(j.get(tenant, 'x'))).toBe(
              'JOURNAL_STORAGE_MODE'
            )
            // The legacy adapter still works there: expanded, inactive guard, version 0.
            const legacy = new PostgresOperationalEffectJournal(other)
            const operationKey = key()
            await legacy.reserve({
              tenantId: tenant,
              operationKey,
              proposalHash: hash,
              attemptId: 'p'
            })
            await legacy.markStarted({
              tenantId: tenant,
              operationKey,
              attemptId: 'p'
            })
            await legacy.confirm({
              tenantId: tenant,
              operationKey,
              attemptId: 'p',
              result: { legacy: 1 }
            })
            expect((await legacy.get(tenant, operationKey))?.result).toEqual({
              legacy: 1
            })
          } finally {
            await other.end()
          }
        } finally {
          await admin.query(`DROP SCHEMA "${plain}" CASCADE`)
        }
      }
    )
  })
})
