// @vitest-environment node
// UNIT contract. SPEC 0291, review D9 P3-1: the origin trigger blocks UPDATE only, so the
// guarantee is "trigger + minimum privilege". DELETE followed by INSERT would rewrite the origin;
// it is closed because the worker preflight refuses a role that can DELETE from runtime_approvals.
import { describe, expect, it } from 'vitest'
import {
  TENANT_SCHEMA_INVENTORY,
  type PostgresPoolLike
} from '@cvg/persistence'
import { TenantIdSchema } from '@cvg/platform'
import {
  assertPostgresWorkerPreflight,
  WORKER_CRITICAL_TABLES
} from '../postgres-role-preflight.ts'

const tenant = TenantIdSchema.parse(
  'tenant_00000000-0000-4000-8000-000000000291'
)

function poolWith(deletable: readonly string[]): PostgresPoolLike {
  let current: string | null = null
  const query = async (sql: string, parameters?: unknown[]) => {
    if (sql.includes('set_config')) {
      current = String(parameters?.[1])
      return { rows: [] }
    }
    if (sql.includes('AS tenant_id')) {
      return { rows: [{ tenant_id: current === '' ? null : current }] }
    }
    if (sql.includes('FROM pg_roles')) {
      return {
        rows: [
          {
            rolname: 'synthetic_runtime',
            rolsuper: false,
            rolbypassrls: false,
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false
          }
        ]
      }
    }
    if (sql.includes('pg_auth_members')) return { rows: [{ count: 0 }] }
    if (sql.includes('pg_database')) {
      return { rows: [{ owner: 'synthetic_migration_owner' }] }
    }
    if (sql.includes('has_schema_privilege')) {
      return { rows: [{ can_create: false }] }
    }
    if (sql.includes('FROM pg_class')) {
      return {
        rows: WORKER_CRITICAL_TABLES.map((relname) => ({
          relname,
          owner: 'synthetic_migration_owner',
          relrowsecurity: true,
          relforcerowsecurity: true
        }))
      }
    }
    if (sql.includes('FROM pg_policies')) {
      return {
        rows: WORKER_CRITICAL_TABLES.map((tablename) => {
          const entry = TENANT_SCHEMA_INVENTORY.find(
            (item) => item.table === tablename
          )!
          const guard =
            "tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
          const expression =
            entry.expression === 'tenant-only'
              ? guard
              : `tenant_isolation_quarantined = false AND ${guard}`
          return {
            tablename,
            policyname: entry.policy,
            permissive: 'PERMISSIVE',
            roles: '{public}',
            cmd: 'ALL',
            qual: expression,
            with_check: expression
          }
        })
      }
    }
    if (sql.includes('has_table_privilege')) {
      return {
        rows: WORKER_CRITICAL_TABLES.map((table_name) => ({
          table_name,
          can_select: true,
          can_insert: true,
          can_update: true,
          can_delete: deletable.includes(table_name),
          can_truncate: false,
          can_trigger: false,
          can_references: false
        }))
      }
    }
    return { rows: [] }
  }
  return {
    connect: async () => ({ query, release: () => undefined })
  } as unknown as PostgresPoolLike
}

describe('SPEC 0291 P3-1: DELETE+INSERT cannot rewrite the approval origin', () => {
  it('runtime_approvals is a critical table of the worker preflight', () => {
    expect(WORKER_CRITICAL_TABLES).toContain('runtime_approvals')
  })

  it('control: a role without DELETE passes the preflight', async () => {
    await expect(
      assertPostgresWorkerPreflight(poolWith([]), { tenantId: tenant })
    ).resolves.toBeUndefined()
  })

  it('a role that can DELETE from runtime_approvals is refused before the worker claims anything', async () => {
    await expect(
      assertPostgresWorkerPreflight(poolWith(['runtime_approvals']), {
        tenantId: tenant
      })
    ).rejects.toThrow('table privileges must be minimal')
  })
})
