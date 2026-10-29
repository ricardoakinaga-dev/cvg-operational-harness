// SPEC 0271: the tenant-isolation preflight accepts the recorded checksum of
// the previous 0021 text (databases that already applied it) and still refuses
// any other. The fake client answers for exactly the versions the preflight
// asks for, so the list stays whatever the preflight owns.
import { createHash } from 'node:crypto'
import type { QueryResult, QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  readPostgresMigrationSql,
  supersededMigrationChecksums,
  type PostgresQueryable
} from '@cvg/persistence'
import { assertTenantIsolationMigrationState } from '../tenant-preflight.ts'

const guard = '0021_approval_decision_audit_dedupe'

function fakeClient(overrides: Record<string, string | null>) {
  const client: PostgresQueryable = {
    async query<T extends QueryResultRow = QueryResultRow>(
      _text: string,
      params?: unknown[]
    ): Promise<QueryResult<T>> {
      const versions = (params?.[0] ?? []) as string[]
      const rows = await Promise.all(
        versions.map(async (version, index) => ({
          version,
          checksum:
            version in overrides
              ? overrides[version]
              : createHash('sha256')
                  .update(await readPostgresMigrationSql(version))
                  .digest('hex'),
          applied_at: new Date(2026, 7, 24, 10, 0, index),
          baseline_actor: null,
          baseline_reference: null,
          baseline_at: null
        }))
      )
      return {
        command: 'SELECT',
        fields: [],
        oid: 0,
        rowCount: rows.length,
        rows
      } as unknown as QueryResult<T>
    }
  }
  return client
}

describe('tenant-isolation preflight and the superseded 0021 checksum (SPEC 0271)', () => {
  it('accepts the current checksum of every migration', async () => {
    await expect(
      assertTenantIsolationMigrationState(fakeClient({}))
    ).resolves.toBeUndefined()
  })

  it('accepts a database that recorded the previous 0021 text', async () => {
    const [previous] = supersededMigrationChecksums[guard] ?? []
    expect(previous).toBeDefined()
    await expect(
      assertTenantIsolationMigrationState(
        fakeClient({ [guard]: previous as string })
      )
    ).resolves.toBeUndefined()
  })

  it('still refuses an unknown or missing checksum of the 0021', async () => {
    for (const checksum of ['f'.repeat(64), null]) {
      await expect(
        assertTenantIsolationMigrationState(fakeClient({ [guard]: checksum }))
      ).rejects.toThrow(
        `tenant-isolation migration state is not verified: ${guard}`
      )
    }
  })

  it('does not extend the 0021 exception to another migration', async () => {
    const [previous] = supersededMigrationChecksums[guard] ?? []
    await expect(
      assertTenantIsolationMigrationState(
        fakeClient({
          '0022_conversation_policy_standardization': previous as string
        })
      )
    ).rejects.toThrow('0022_conversation_policy_standardization')
  })
})
