// SPEC 0225 (migration 0033, note 0225b): the additive, closed expansion of
// operational_effect_journal. Version 1 is open to nobody; legacy rows keep
// their bytes; the guard cannot be shadowed through pg_temp. J05 (minimum).
import { randomBytes } from 'node:crypto'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runPostgresMigrations } from '../postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const itWithPostgres = testDatabaseUrl ? it : it.skip
const tenant = 'tenant_00000000-0000-4000-8000-000000000225'
const migrationDir = resolve(process.cwd(), 'packages/persistence/migrations')
// Everything the default run applies before 0033 (0028 is opt-in).
const before0033 = readdirSync(migrationDir)
  .filter((f) => /^00\d\d_.*\.sql$/.test(f) && f < '0033')
  .map((f) => f.replace(/\.sql$/, ''))
  .filter((v) => v !== '0028_session_events')
  .sort()

let admin: Client
const schemas: string[] = []

async function freshSchema(
  options: { through0033: boolean } = { through0033: true }
): Promise<string> {
  const schemaName = `cvg_k03_${Date.now()}_${randomBytes(3).toString('hex')}`
  schemas.push(schemaName)
  if (options.through0033) {
    await runPostgresMigrations(admin, { schemaName })
  } else {
    await runPostgresMigrations(admin, {
      schemaName,
      migrations: before0033
    })
  }
  await admin.query(`SET search_path TO "${schemaName}"`)
  return schemaName
}

let counter = 0
async function insertJournal(
  fields: Partial<{
    state: string
    result: string | null
    error: string | null
    version: number
    payload: unknown
  }> = {}
): Promise<string> {
  counter += 1
  const key = `op_k03_${counter}`
  const columns = [
    'tenant_id',
    'operation_key',
    'proposal_hash',
    'state',
    'attempt_id',
    'result',
    'error'
  ]
  const values: unknown[] = [
    tenant,
    key,
    'a'.repeat(64),
    fields.state ?? 'RESERVED',
    `attempt_${counter}`,
    fields.result ?? null,
    fields.error ?? null
  ]
  if (fields.version !== undefined) {
    columns.push('result_storage_version')
    values.push(fields.version)
  }
  if (fields.payload !== undefined) {
    columns.push('result_storage_payload')
    values.push(JSON.stringify(fields.payload))
  }
  await admin.query(
    `INSERT INTO operational_effect_journal (${columns.join(',')})
     VALUES (${values.map((_, i) => `$${i + 1}`).join(',')})`,
    values
  )
  return key
}

const envelope = (bytes = 3, data = 'e30=') => ({
  encoding: 'base64',
  decodedBytes: bytes,
  decodedSha256: 'b'.repeat(64),
  data
})

async function code(run: Promise<unknown>): Promise<string | undefined> {
  try {
    await run
    return undefined
  } catch (error) {
    return (error as { code?: string }).code
  }
}

describe('SPEC 0225 migration 0033 — closed expansion of the effect journal', () => {
  beforeAll(async () => {
    if (!testDatabaseUrl) return
    admin = new Client({ connectionString: testDatabaseUrl })
    await admin.connect()
  })
  afterAll(async () => {
    if (!admin) return
    await admin.query('RESET search_path')
    for (const schema of schemas) {
      await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    }
    await admin.end()
  })

  itWithPostgres(
    'keeps every legacy row byte for byte, default version 0, payload NULL',
    async () => {
      await freshSchema({ through0033: false })
      const lookalike = JSON.stringify({
        encoding: 'base64',
        decodedBytes: 3,
        decodedSha256: 'c'.repeat(64),
        data: 'e30='
      })
      const rows = {
        plain: await insertJournal({
          state: 'CONFIRMED',
          result: JSON.stringify({ ok: true })
        }),
        jsonbNull: await insertJournal({ state: 'CONFIRMED', result: 'null' }),
        sqlNull: await insertJournal({ state: 'CONFIRMED', result: null }),
        lookalike: await insertJournal({
          state: 'CONFIRMED',
          result: lookalike
        }),
        failed: await insertJournal({ state: 'FAILED', error: 'boom' })
      }
      const snapshot = async () =>
        (
          await admin.query(
            `SELECT operation_key, state, result::text AS result, result IS NOT NULL AS present, error
               FROM operational_effect_journal ORDER BY operation_key`
          )
        ).rows
      const beforeRows = await snapshot()
      const schemaName = schemas.at(-1)!
      await runPostgresMigrations(admin, {
        schemaName,
        createSchema: false
      })
      await admin.query(`SET search_path TO "${schemaName}"`)
      expect(await snapshot()).toEqual(beforeRows)
      const stored = (
        await admin.query(
          `SELECT operation_key, result_storage_version AS v,
                  result_storage_payload IS NULL AS no_payload
             FROM operational_effect_journal`
        )
      ).rows
      expect(stored).toHaveLength(5)
      for (const row of stored) {
        expect(row.v).toBe(0)
        expect(row.no_payload).toBe(true)
      }
      // JSONB null and SQL NULL stay different; the lookalike is still raw data.
      const byKey = Object.fromEntries(
        (await snapshot()).map((r) => [r.operation_key, r])
      )
      expect(byKey[rows.jsonbNull].present).toBe(true)
      expect(byKey[rows.sqlNull].present).toBe(false)
      expect(JSON.parse(byKey[rows.lookalike].result)).toMatchObject({
        encoding: 'base64'
      })
    }
  )

  itWithPostgres('registers the migration once, in order', async () => {
    const schemaName = await freshSchema()
    const { rows } = await admin.query(
      `SELECT version FROM "${schemaName}".schema_migrations ORDER BY version`
    )
    const versions = rows.map((r) => r.version as string)
    expect(versions).toContain('0033_complete_tool_result_journal')
    // In order: 0033 follows every earlier migration; later ones (0035, SPEC 0291) may follow it.
    expect(versions.indexOf('0033_complete_tool_result_journal')).toBe(
      versions.indexOf('0035_runtime_approval_origin') - 1
    )
    expect(versions.at(-1)).toBe('0035_runtime_approval_origin')
  })

  itWithPostgres(
    'version 1 is closed to everyone, owner included',
    async () => {
      await freshSchema()
      expect(
        await code(
          insertJournal({
            state: 'CONFIRMED',
            version: 1,
            payload: envelope()
          })
        )
      ).toBe('42501')
      const key = await insertJournal({ state: 'RESERVED' })
      expect(
        await code(
          admin.query(
            `UPDATE operational_effect_journal SET result_storage_version = 1 WHERE operation_key = $1`,
            [key]
          )
        )
      ).toBe('23514')
      // A forged setting does not open it either.
      await admin.query(`SET cvg.result_storage = '1'`)
      expect(
        await code(
          insertJournal({
            state: 'CONFIRMED',
            version: 1,
            payload: envelope()
          })
        )
      ).toBe('42501')
      await admin.query('RESET cvg.result_storage')
    }
  )

  itWithPostgres(
    'version 0 cannot carry a payload; legacy writes and deletes still work',
    async () => {
      await freshSchema()
      expect(
        await code(insertJournal({ state: 'CONFIRMED', payload: envelope() }))
      ).toBe('23514')
      const key = await insertJournal({
        state: 'CONFIRMED',
        result: JSON.stringify({ v: 1 })
      })
      await admin.query(
        `UPDATE operational_effect_journal SET result = '{"v":2}'::jsonb WHERE operation_key = $1`,
        [key]
      )
      const { rows } = await admin.query(
        `SELECT result FROM operational_effect_journal WHERE operation_key = $1`,
        [key]
      )
      expect(rows[0].result).toEqual({ v: 2 })
      await admin.query(
        `DELETE FROM operational_effect_journal WHERE operation_key = $1`,
        [key]
      )
    }
  )

  describe('the CHECK constraints, with the guard disabled for the probe', () => {
    async function withGuardOff<T>(run: () => Promise<T>): Promise<T> {
      await admin.query(
        `ALTER TABLE operational_effect_journal DISABLE TRIGGER journal_result_storage_guard`
      )
      try {
        return await run()
      } finally {
        await admin.query(
          `ALTER TABLE operational_effect_journal ENABLE TRIGGER journal_result_storage_guard`
        )
      }
    }

    itWithPostgres(
      'accepts a well-formed version 1 CONFIRMED row',
      async () => {
        await freshSchema()
        await withGuardOff(async () => {
          await insertJournal({
            state: 'CONFIRMED',
            version: 1,
            payload: envelope()
          })
        })
      }
    )

    itWithPostgres('rejects every malformed shape', async () => {
      await freshSchema()
      await withGuardOff(async () => {
        const bad: Array<[string, Parameters<typeof insertJournal>[0]]> = [
          ['unknown version', { version: 2, state: 'RESERVED' }],
          [
            'version 1 with a legacy result',
            {
              state: 'CONFIRMED',
              version: 1,
              result: '{}',
              payload: envelope()
            }
          ],
          [
            'version 1 CONFIRMED without payload',
            { state: 'CONFIRMED', version: 1 }
          ],
          [
            'version 1 CONFIRMED with an error',
            { state: 'CONFIRMED', version: 1, error: 'x', payload: envelope() }
          ],
          [
            'version 1 not CONFIRMED with a payload',
            { state: 'RESERVED', version: 1, payload: envelope() }
          ],
          [
            'extra envelope key',
            {
              state: 'CONFIRMED',
              version: 1,
              payload: { ...envelope(), extra: 1 }
            }
          ],
          [
            'wrong encoding',
            {
              state: 'CONFIRMED',
              version: 1,
              payload: { ...envelope(), encoding: 'hex' }
            }
          ],
          [
            'non-hex digest',
            {
              state: 'CONFIRMED',
              version: 1,
              payload: { ...envelope(), decodedSha256: 'Z'.repeat(64) }
            }
          ],
          [
            'data that is not base64',
            {
              state: 'CONFIRMED',
              version: 1,
              payload: envelope(3, 'e30!')
            }
          ],
          [
            'data length not 4*ceil(bytes/3)',
            {
              state: 'CONFIRMED',
              version: 1,
              payload: envelope(3, 'AAAAAAAA')
            }
          ],
          [
            'zero decodedBytes',
            { state: 'CONFIRMED', version: 1, payload: envelope(0, '') }
          ],
          [
            'decodedBytes above 1 MiB',
            {
              state: 'CONFIRMED',
              version: 1,
              payload: envelope(1048577, 'A'.repeat(4 * Math.ceil(1048577 / 3)))
            }
          ],
          [
            'payload that is not an object',
            { state: 'CONFIRMED', version: 1, payload: 'e30=' }
          ]
        ]
        for (const [name, fields] of bad) {
          expect(await code(insertJournal(fields)), name).toBe('23514')
        }
      })
    })

    itWithPostgres(
      'a version 1 row cannot be updated or deleted once the guard is back',
      async () => {
        await freshSchema()
        const key = await withGuardOff(() =>
          insertJournal({
            state: 'CONFIRMED',
            version: 1,
            payload: envelope()
          })
        )
        expect(
          await code(
            admin.query(
              `UPDATE operational_effect_journal SET updated_at = now() WHERE operation_key = $1`,
              [key]
            )
          )
        ).toBe('42501')
        expect(
          await code(
            admin.query(
              `DELETE FROM operational_effect_journal WHERE operation_key = $1`,
              [key]
            )
          )
        ).toBe('42501')
      }
    )

    itWithPostgres('accepts the exact 1 MiB limits and no more', async () => {
      await freshSchema()
      await withGuardOff(async () => {
        const max = 1048576
        const dataLength = 4 * Math.ceil(max / 3)
        expect(dataLength).toBe(1398104)
        await insertJournal({
          state: 'CONFIRMED',
          version: 1,
          payload: envelope(max, 'A'.repeat(dataLength))
        })
      })
    })
  })

  itWithPostgres(
    'the guard is SECURITY INVOKER with pg_temp last in its search_path',
    async () => {
      await freshSchema()
      const { rows } = await admin.query(
        `SELECT p.proconfig, p.prosecdef
           FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE p.proname = 'cvg_journal_result_storage_guard'
            AND n.nspname = current_schema()`
      )
      expect(rows).toHaveLength(1)
      expect(rows[0].prosecdef).toBe(false)
      expect(rows[0].proconfig).toEqual(['search_path=pg_catalog, pg_temp'])
    }
  )

  itWithPostgres(
    'a second run of the migrations is a no-op and the checksum is stable',
    async () => {
      const schemaName = await freshSchema()
      const read = async () =>
        (
          await admin.query(
            `SELECT checksum FROM "${schemaName}".schema_migrations WHERE version = '0033_complete_tool_result_journal'`
          )
        ).rows[0].checksum as string
      const first = await read()
      await runPostgresMigrations(admin, { schemaName, createSchema: false })
      expect(await read()).toBe(first)
    }
  )
})
