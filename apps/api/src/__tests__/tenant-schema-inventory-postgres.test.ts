/**
 * AUD19-005 — tenant-schema inventory closed world + preflight negatives.
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); any required
 * gate sets AUD19_PG_REQUIRED=1 and a missing database becomes a hard
 * failure instead of a silent skip.
 */
import { Client } from 'pg'
import { describe, expect, it } from 'vitest'
import { TENANT_SCHEMA_TABLES, runPostgresMigrations } from '@cvg/persistence'
import {
  assertRuntimeRoleIsLeastPrivilege,
  assertTenantIsolationMigrationState,
  assertTenantIsolationSchema
} from '../server.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const pgRequired = process.env.AUD19_PG_REQUIRED === '1'
const pgEnabled = Boolean(testDatabaseUrl)

if (pgRequired && !pgEnabled) {
  throw new Error(
    'AUD19_PG_REQUIRED=1 but TEST_DATABASE_URL is absent; refusing to pass this required gate with a skip'
  )
}

const itWithPostgres = pgEnabled ? it : it.skip

async function migratedSchema(suffix: string) {
  const admin = new Client({ connectionString: testDatabaseUrl as string })
  await admin.connect()
  const schemaName = `cvg_aud19_005_${suffix}_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`
  await runPostgresMigrations(admin, { schemaName })
  await admin.query(`SET search_path TO ${schemaName}`)
  return { admin, schemaName }
}

async function dropSchema(setup: { admin: Client; schemaName: string }) {
  await setup.admin
    .query(`DROP SCHEMA IF EXISTS ${setup.schemaName} CASCADE`)
    .catch(() => undefined)
  await setup.admin.end().catch(() => undefined)
}

describe('tenant schema inventory closed world (AUD19-005)', () => {
  itWithPostgres(
    'every tenant_id table in the catalog is inventoried and verified',
    async () => {
      const setup = await migratedSchema('closed')
      try {
        const catalog = await setup.admin.query<{ table_name: string }>(
          `SELECT table_name FROM information_schema.columns
           WHERE table_schema = current_schema()
             AND column_name = 'tenant_id'
           ORDER BY 1`
        )
        const catalogTables = catalog.rows.map((row) => row.table_name)
        // Closed world both ways: no invisible tenant table, no phantom
        // entry. `outbox_quarantine` carries tenant_id but is a quarantine
        // table with its own deny-all preflight branch (never readable), so
        // it stays out of the data-plane inventory by design.
        expect(new Set(catalogTables)).toEqual(
          new Set([...TENANT_SCHEMA_TABLES, 'outbox_quarantine'])
        )
        // The full preflight passes on the complete catalog.
        await expect(
          assertTenantIsolationMigrationState(setup.admin)
        ).resolves.toBeUndefined()
        await expect(
          assertTenantIsolationSchema(setup.admin)
        ).resolves.toBeUndefined()
      } finally {
        await dropSchema(setup)
      }
    }
  )

  itWithPostgres('fails when a tenant-scoped table is removed', async () => {
    const setup = await migratedSchema('drop')
    try {
      await setup.admin.query(
        'DROP TABLE journey_owner_drafts, operational_execution_steps CASCADE'
      )
      await expect(assertTenantIsolationSchema(setup.admin)).rejects.toThrow(
        /policies|columns|constraints|indexes/
      )
    } finally {
      await dropSchema(setup)
    }
  })

  itWithPostgres('fails when migration 0022 is not applied', async () => {
    const setup = await migratedSchema('version')
    try {
      await setup.admin.query(
        `DELETE FROM schema_migrations WHERE version = '0022_conversation_policy_standardization'`
      )
      await expect(
        assertTenantIsolationMigrationState(setup.admin)
      ).rejects.toThrow('tenant-isolation migration state is not verified')
    } finally {
      await dropSchema(setup)
    }
  })

  itWithPostgres(
    'fails a least-privilege role without grants on new tables',
    async () => {
      const setup = await migratedSchema('role')
      const role = `cvg_aud19_005_role_${Date.now()}`
      try {
        await setup.admin.query(
          `CREATE ROLE ${role} LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
        )
        await setup.admin.query(
          `GRANT USAGE ON SCHEMA ${setup.schemaName} TO ${role}`
        )
        const parsed = new URL(testDatabaseUrl as string)
        parsed.username = role
        parsed.password = 'synthetic'
        const { Pool } = await import('pg')
        const pool = new Pool({
          connectionString: parsed.toString(),
          options: `-c search_path=${setup.schemaName}`
        })
        try {
          await expect(
            assertRuntimeRoleIsLeastPrivilege(pool as never)
          ).rejects.toThrow('least-privilege')
        } finally {
          await pool.end().catch(() => undefined)
        }
      } finally {
        await setup.admin
          .query(`DROP OWNED BY ${role} CASCADE`)
          .catch(() => undefined)
        await setup.admin
          .query(`DROP ROLE IF EXISTS ${role}`)
          .catch(() => undefined)
        await dropSchema(setup)
      }
    }
  )
})
