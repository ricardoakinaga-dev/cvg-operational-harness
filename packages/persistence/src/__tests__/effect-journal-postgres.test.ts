import { randomBytes } from 'node:crypto'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readPostgresMigrationSql, runPostgresMigrations } from '../postgres.ts'
import { PostgresEffectJournal } from '../effect-journal-postgres.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const itWithPostgres = testDatabaseUrl ? it : it.skip
const tenant = 'tenant_00000000-0000-4000-8000-000000000211'
const otherTenant = 'tenant_00000000-0000-4000-8000-000000000212'

let operationCounter = 0

function uniqueOperationKey(prefix = 'op:cvg-runtime-effect'): string {
  operationCounter += 1
  return `${prefix}:${operationCounter}:${randomBytes(3).toString('hex')}`
}

function reserveInput(
  operationKey: string,
  attemptId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    tenantId: tenant,
    operationKey,
    proposalHash: 'a'.repeat(64),
    attemptId,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides
  }
}

async function connectScoped(
  schema: string,
  tenantId: string
): Promise<Client> {
  const client = new Client({ connectionString: testDatabaseUrl })
  await client.connect()
  await client.query(`SET search_path TO ${schema}`)
  await client.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
    tenantId
  ])
  return client
}

describe('runtime effect journal PostgreSQL adapter', () => {
  it('ships the additive runtime effect journal migration', async () => {
    const migration = await readPostgresMigrationSql(
      '0013_runtime_effect_journal'
    )

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS effect_journal')
    expect(migration).toContain('PRIMARY KEY (tenant_id, operation_key)')
    expect(migration).toContain('proposal_hash text NOT NULL')
    expect(migration).toContain('attempt_id text NOT NULL')
    expect(migration).toContain('execution_ref text')
    expect(migration).toContain('result_digest text')
    expect(migration).toContain('expires_at timestamptz NOT NULL')
    expect(migration).toContain('RESERVED')
    expect(migration).toContain('EFFECT_STARTED')
    expect(migration).toContain('EFFECT_FAILED')
    expect(migration).toContain('ABANDONED')
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY')
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
    expect(migration).toContain("current_setting('cvg.tenant_id', true)")
  })

  describe('with a disposable PostgreSQL schema', () => {
    const schema = `cvg_runtime_eff_${Date.now()}_${randomBytes(3).toString('hex')}`
    let admin: Client
    let first: Client
    let second: Client

    beforeAll(async () => {
      if (!testDatabaseUrl) return
      admin = new Client({ connectionString: testDatabaseUrl })
      await admin.connect()
      await runPostgresMigrations(admin, { schemaName: schema })
      first = await connectScoped(schema, tenant)
      second = await connectScoped(schema, tenant)
    })

    afterAll(async () => {
      if (!testDatabaseUrl) return
      await first?.end().catch(() => undefined)
      await second?.end().catch(() => undefined)
      await admin
        ?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
        .catch(() => undefined)
      await admin?.end().catch(() => undefined)
    })

    itWithPostgres(
      'applies 0012/0013 in order with forced RLS and reserved columns',
      async () => {
        const applied = await admin.query<{ version: string }>(
          `SELECT version FROM schema_migrations
           WHERE version IN ('0012_channel_effect_journal', '0013_runtime_effect_journal')
           ORDER BY version`
        )
        expect(applied.rows.map((row) => row.version)).toEqual([
          '0012_channel_effect_journal',
          '0013_runtime_effect_journal'
        ])
        const rls = await admin.query<{
          relrowsecurity: boolean
          relforcerowsecurity: boolean
        }>(
          `SELECT c.relrowsecurity, c.relforcerowsecurity
           FROM pg_class AS c
           INNER JOIN pg_namespace AS n ON n.oid = c.relnamespace
           WHERE n.nspname = current_schema() AND c.relname = 'effect_journal'`
        )
        expect(rls.rows[0]).toEqual({
          relrowsecurity: true,
          relforcerowsecurity: true
        })
        const columns = await admin.query<{ column_name: string }>(
          `SELECT column_name FROM information_schema.columns
           WHERE table_schema = current_schema() AND table_name = 'effect_journal'`
        )
        const names = new Set(columns.rows.map((row) => row.column_name))
        for (const column of [
          'tenant_id',
          'operation_key',
          'proposal_hash',
          'state',
          'attempt_id',
          'execution_ref',
          'result_digest',
          'expires_at',
          'revision'
        ]) {
          expect(names.has(column)).toBe(true)
        }
      }
    )

    itWithPostgres(
      'reserves, starts, confirms and replays the persisted result digest',
      async () => {
        const operationKey = uniqueOperationKey()
        const journal = new PostgresEffectJournal(first)

        await expect(
          journal.reserve(reserveInput(operationKey, 'attempt-1'))
        ).resolves.toEqual({ outcome: 'reserved' })
        await expect(
          journal.markEffectStarted({
            tenantId: tenant,
            operationKey,
            attemptId: 'attempt-1'
          })
        ).resolves.toMatchObject({ state: 'EFFECT_STARTED' })
        const confirmed = await journal.confirmEffect({
          tenantId: tenant,
          operationKey,
          attemptId: 'attempt-1',
          executionRef: 'execution-ref-1',
          resultDigest: 'b'.repeat(64)
        })
        expect(confirmed).toMatchObject({
          state: 'CONFIRMED',
          executionRef: 'execution-ref-1',
          resultDigest: 'b'.repeat(64),
          revision: 3
        })
        await expect(
          journal.reserve(reserveInput(operationKey, 'attempt-2'))
        ).resolves.toEqual({ outcome: 'replay', record: confirmed })
        await expect(
          journal.confirmEffect({
            tenantId: tenant,
            operationKey,
            attemptId: 'attempt-1',
            executionRef: 'other',
            resultDigest: 'c'.repeat(64)
          })
        ).rejects.toMatchObject({ code: 'invalid_transition' })
      }
    )

    itWithPostgres(
      'reserves atomically under two concurrent clients',
      async () => {
        const operationKey = uniqueOperationKey()
        const firstJournal = new PostgresEffectJournal(first)
        const secondJournal = new PostgresEffectJournal(second)

        const outcomes = await Promise.all([
          firstJournal.reserve(reserveInput(operationKey, 'attempt-1')),
          secondJournal.reserve(reserveInput(operationKey, 'attempt-2'))
        ])

        expect(outcomes.map((outcome) => outcome.outcome).sort()).toEqual([
          'in_progress',
          'reserved'
        ])
        const stored = await admin.query<{ count: string }>(
          `SELECT count(*)::text AS count FROM effect_journal WHERE operation_key = $1`,
          [operationKey]
        )
        expect(stored.rows[0]?.count).toBe('1')
      }
    )

    itWithPostgres(
      'fails closed with idempotency_key_reuse for a different proposal hash',
      async () => {
        const operationKey = uniqueOperationKey()
        const journal = new PostgresEffectJournal(first)
        await journal.reserve(reserveInput(operationKey, 'attempt-1'))

        await expect(
          journal.reserve(
            reserveInput(operationKey, 'attempt-2', {
              proposalHash: 'd'.repeat(64)
            })
          )
        ).rejects.toMatchObject({
          name: 'EffectJournalError',
          code: 'idempotency_key_reuse'
        })
        await expect(journal.get(tenant, operationKey)).resolves.toMatchObject({
          proposalHash: 'a'.repeat(64),
          revision: 1
        })
      }
    )

    itWithPostgres(
      'abandons an expired reservation and re-arms a safe retry',
      async () => {
        const operationKey = uniqueOperationKey()
        const journal = new PostgresEffectJournal(first)
        await journal.reserve(
          reserveInput(operationKey, 'attempt-1', {
            expiresAt: new Date(Date.now() - 1_000).toISOString()
          })
        )

        await expect(journal.releaseExpired(new Date(), 60_000)).resolves.toBe(
          1
        )
        await expect(journal.get(tenant, operationKey)).resolves.toMatchObject({
          state: 'ABANDONED'
        })
        await expect(
          journal.reserve(reserveInput(operationKey, 'attempt-2'))
        ).resolves.toEqual({ outcome: 'reserved' })
        await expect(
          journal.markEffectStarted({
            tenantId: tenant,
            operationKey,
            attemptId: 'attempt-2'
          })
        ).resolves.toMatchObject({ state: 'EFFECT_STARTED' })
      }
    )

    itWithPostgres(
      'marks an expired EFFECT_STARTED reservation uncertain without retrying',
      async () => {
        const operationKey = uniqueOperationKey()
        const journal = new PostgresEffectJournal(first)
        await journal.reserve(
          reserveInput(operationKey, 'attempt-1', {
            expiresAt: new Date(Date.now() - 1_000).toISOString()
          })
        )
        await journal.markEffectStarted({
          tenantId: tenant,
          operationKey,
          attemptId: 'attempt-1'
        })

        await expect(journal.releaseExpired(new Date(), 60_000)).resolves.toBe(
          1
        )
        await expect(journal.get(tenant, operationKey)).resolves.toMatchObject({
          state: 'UNCERTAIN'
        })
        await expect(
          journal.reserve(reserveInput(operationKey, 'attempt-2'))
        ).resolves.toMatchObject({ outcome: 'uncertain' })
      }
    )

    itWithPostgres('fences a stale attempt after a safe takeover', async () => {
      const operationKey = uniqueOperationKey()
      const journal = new PostgresEffectJournal(first)
      await journal.reserve(
        reserveInput(operationKey, 'attempt-1', {
          expiresAt: new Date(Date.now() - 1_000).toISOString()
        })
      )
      await journal.releaseExpired(new Date(), 60_000)
      await journal.reserve(reserveInput(operationKey, 'attempt-2'))
      const before = await journal.get(tenant, operationKey)

      await expect(
        journal.confirmEffect({
          tenantId: tenant,
          operationKey,
          attemptId: 'attempt-1',
          executionRef: 'stale-ref',
          resultDigest: 'e'.repeat(64)
        })
      ).rejects.toMatchObject({ code: 'attempt_mismatch' })
      await expect(
        journal.markEffectStarted({
          tenantId: tenant,
          operationKey,
          attemptId: 'attempt-1'
        })
      ).rejects.toMatchObject({ code: 'attempt_mismatch' })
      await expect(journal.get(tenant, operationKey)).resolves.toEqual(before)
    })

    itWithPostgres(
      'reconciles UNCERTAIN explicitly and audits the actor',
      async () => {
        const confirmedKey = uniqueOperationKey()
        const abandonedKey = uniqueOperationKey()
        const journal = new PostgresEffectJournal(first)

        for (const operationKey of [confirmedKey, abandonedKey]) {
          await journal.reserve(reserveInput(operationKey, 'attempt-1'))
          await journal.markEffectStarted({
            tenantId: tenant,
            operationKey,
            attemptId: 'attempt-1'
          })
          await journal.markUncertain({
            tenantId: tenant,
            operationKey,
            attemptId: 'attempt-1',
            reason: 'ambiguous timeout'
          })
        }

        await expect(
          journal.reconcile({
            tenantId: tenant,
            operationKey: confirmedKey,
            actorId: 'operator-1',
            outcome: 'effect_confirmed',
            evidenceRef: 'evidence://synthetic/runtime-1'
          })
        ).resolves.toMatchObject({
          state: 'CONFIRMED',
          reconciledBy: 'operator-1',
          reconciliationEvidenceRef: 'evidence://synthetic/runtime-1'
        })
        await expect(
          journal.reconcile({
            tenantId: tenant,
            operationKey: abandonedKey,
            actorId: 'operator-1',
            outcome: 'no_effect',
            evidenceRef: 'evidence://synthetic/runtime-2'
          })
        ).resolves.toMatchObject({ state: 'ABANDONED' })
        await expect(
          journal.reconcile({
            tenantId: tenant,
            operationKey: confirmedKey,
            actorId: 'operator-1',
            outcome: 'no_effect',
            evidenceRef: 'evidence://synthetic/runtime-3'
          })
        ).rejects.toMatchObject({ code: 'invalid_transition' })
      }
    )

    itWithPostgres(
      'isolates cross-tenant reads and writes with a non-BYPASSRLS role',
      async () => {
        const roleName = `cvg_eff_role_${Date.now()}_${randomBytes(3).toString('hex')}`
        const password = randomBytes(18).toString('hex')
        const roleUrl = new URL(testDatabaseUrl as string)
        roleUrl.username = roleName
        roleUrl.password = password
        const operationKey = uniqueOperationKey()
        let roleCreated = false
        let roleA: Client | undefined
        let roleB: Client | undefined

        try {
          await admin.query(
            `CREATE ROLE ${roleName} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE`
          )
          roleCreated = true
          await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${roleName}`)
          await admin.query(
            `GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.effect_journal TO ${roleName}`
          )

          roleA = new Client({ connectionString: roleUrl.toString() })
          await roleA.connect()
          await roleA.query(`SET search_path TO ${schema}`)
          await roleA.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
            tenant
          ])
          const journalA = new PostgresEffectJournal(roleA)
          await expect(
            journalA.reserve(reserveInput(operationKey, 'attempt-1'))
          ).resolves.toEqual({ outcome: 'reserved' })

          roleB = new Client({ connectionString: roleUrl.toString() })
          await roleB.connect()
          await roleB.query(`SET search_path TO ${schema}`)
          await roleB.query(`SELECT set_config('cvg.tenant_id', $1, false)`, [
            otherTenant
          ])
          const journalB = new PostgresEffectJournal(roleB)
          await expect(
            journalB.get(otherTenant, operationKey)
          ).resolves.toBeUndefined()
          const visible = await roleB.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM effect_journal`
          )
          expect(visible.rows[0]?.count).toBe('0')
          await expect(
            journalB.reserve({
              ...reserveInput(operationKey, 'attempt-2'),
              tenantId: tenant
            })
          ).rejects.toThrow()
          const stored = await admin.query<{ count: string }>(
            `SELECT count(*)::text AS count FROM effect_journal WHERE operation_key = $1`,
            [operationKey]
          )
          expect(stored.rows[0]?.count).toBe('1')
        } finally {
          await roleA?.end().catch(() => undefined)
          await roleB?.end().catch(() => undefined)
          if (roleCreated) {
            await admin
              .query(`DROP ROLE IF EXISTS ${roleName}`)
              .catch(() => undefined)
          }
        }
      }
    )
  })
})
