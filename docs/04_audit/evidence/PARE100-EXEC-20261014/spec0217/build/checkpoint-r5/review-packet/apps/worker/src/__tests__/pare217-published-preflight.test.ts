// @vitest-environment node
import { createHash } from 'node:crypto'
import type { QueryResult, QueryResultRow } from 'pg'
import { describe, expect, it, vi } from 'vitest'
import {
  readPostgresMigrationSql,
  type PostgresPoolClient,
  type PostgresPoolLike
} from '@cvg/persistence'
import type { ClaimExecutionRegistry } from '../claimed-execution-lifecycle.ts'
import {
  assertPublishedPostgresWorkerPreflight,
  PUBLISHED_POSTGRES_CRITICAL_TABLES,
  PUBLISHED_POSTGRES_REQUIRED_MIGRATIONS
} from '../postgres-role-preflight.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000217'
const triggers = {
  controlled_published_evidence_append_only: [
    'controlled_published_evidence',
    'cvg_controlled_evidence_append_only',
    58
  ],
  controlled_published_binding_immutable: [
    'controlled_published_bindings',
    'cvg_controlled_binding_immutable',
    27
  ],
  controlled_bound_execution_writer: [
    'operational_executions',
    'cvg_controlled_bound_writer',
    27
  ],
  controlled_bound_queue_writer: [
    'operational_execution_outbox',
    'cvg_controlled_bound_writer',
    31
  ],
  controlled_bound_event_writer: [
    'operational_execution_events',
    'cvg_controlled_bound_writer',
    31
  ],
  controlled_bound_step_writer: [
    'operational_execution_steps',
    'cvg_controlled_bound_writer',
    31
  ],
  controlled_bound_checkpoint_writer: [
    'operational_execution_checkpoints',
    'cvg_controlled_bound_writer',
    31
  ],
  controlled_bound_journal_writer: [
    'operational_effect_journal',
    'cvg_controlled_bound_writer',
    31
  ],
  controlled_bound_binding_writer: [
    'controlled_published_bindings',
    'cvg_controlled_bound_writer',
    19
  ],
  controlled_bound_evidence_writer: [
    'controlled_published_evidence',
    'cvg_controlled_bound_writer',
    7
  ]
} as const

async function fixture(fault = '') {
  const migrations = await Promise.all(
    PUBLISHED_POSTGRES_REQUIRED_MIGRATIONS.map(async (version) => ({
      version,
      sql: await readPostgresMigrationSql(version)
    }))
  )
  const sql = migrations.find(
    (migration) => migration.version === '0029_controlled_published_kernel'
  )!.sql
  const statements: string[] = []
  const release = vi.fn()
  const client: PostgresPoolClient = {
    release,
    async query<T extends QueryResultRow>(
      statement: string
    ): Promise<QueryResult<T>> {
      statements.push(statement)
      let rows: unknown[] = []
      if (statement === 'SHOW search_path')
        rows = [{ search_path: 'synthetic217' }]
      else if (
        statement.includes(
          "has_table_privilege(current_user,'schema_migrations'"
        )
      )
        rows = [{ read_only: fault !== 'migration-writer' }]
      else if (statement.includes('FROM pg_roles'))
        rows = [
          {
            rolname: 'serving217',
            rolsuper: fault === 'super',
            rolbypassrls: fault === 'bypass',
            rolcreatedb: false,
            rolcreaterole: false,
            rolreplication: false
          }
        ]
      else if (statement.includes('FROM pg_auth_members')) rows = [{ count: 0 }]
      else if (statement.includes('FROM pg_database'))
        rows = [{ owner: 'migrator217' }]
      else if (statement.includes('has_schema_privilege'))
        rows = [{ can_create: fault === 'ddl' }]
      else if (statement.includes('FROM pg_class'))
        rows = PUBLISHED_POSTGRES_CRITICAL_TABLES.filter(
          (table) =>
            fault !== 'missing-sidecar' ||
            table !== 'controlled_published_bindings'
        ).map((relname) => ({
          relname,
          owner: 'migrator217',
          relrowsecurity: true,
          relforcerowsecurity: true
        }))
      else if (statement.includes('FROM pg_policies'))
        rows = PUBLISHED_POSTGRES_CRITICAL_TABLES.map((tablename) => {
          const tenant =
            "tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
          const qual = [
            'outbox_attempts',
            'outbox_effects',
            'worker_heartbeats',
            'kernel_pause_switches'
          ].includes(tablename)
            ? tenant
            : `tenant_isolation_quarantined = false AND ${tenant}`
          return {
            tablename,
            policyname: `${tablename}_tenant_isolation`,
            permissive: 'PERMISSIVE',
            roles: '{public}',
            cmd: 'ALL',
            qual,
            with_check: qual
          }
        })
      else if (statement.includes('has_table_privilege'))
        rows = PUBLISHED_POSTGRES_CRITICAL_TABLES.map((table_name) => {
          const read = ['platform_agents', 'platform_agent_versions'].includes(
            table_name
          )
          const append = [
            'audit_events',
            'platform_execution_traces',
            'operational_execution_events',
            'controlled_published_evidence'
          ].includes(table_name)
          return {
            table_name,
            can_select: true,
            can_insert: !read && table_name !== 'platform_capability_approvals',
            can_update:
              !read &&
              (!append ||
                (fault === 'evidence-update' &&
                  table_name === 'controlled_published_evidence')),
            can_delete: false,
            can_truncate: false,
            can_trigger: false,
            can_references: false
          }
        })
      else if (statement.includes('FROM schema_migrations'))
        rows = migrations.map(({ version, sql }) => ({
          version,
          checksum:
            fault === 'checksum' && version.startsWith('0029')
              ? 'bad'
              : createHash('sha256').update(sql).digest('hex')
        }))
      else if (statement.includes('FROM pg_trigger'))
        rows = Object.entries(triggers).map(
          ([trigger_name, [table_name, function_name, trigger_type]]) => {
            const definition =
              sql
                .slice(sql.indexOf(`CREATE FUNCTION ${function_name}(`))
                .split('$$;')[0]! + '$$;'
            return {
              trigger_name,
              table_name,
              function_name,
              function_local: fault !== 'foreign-function',
              independent_owner: fault !== 'owned-function',
              function_config:
                fault === 'function-config' ? ['search_path=public'] : null,
              unconditional: fault !== 'conditional-trigger',
              trigger_type: fault === 'event-type' ? 1 : trigger_type,
              enabled: fault === 'disabled-guard' ? 'D' : 'O',
              security_definer: fault === 'security-definer',
              definition:
                fault === 'tampered-function'
                  ? 'CREATE FUNCTION x() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;'
                  : definition
            }
          }
        )
      else if (statement.includes('has_sequence_privilege'))
        rows = [{ permitted: fault !== 'sequence-update' }]
      else if (statement.includes('NULLIF(current_setting'))
        rows = [{ tenant_id: null }]
      else if (statement.startsWith('SELECT set_config')) rows = [{}]
      else
        throw new Error(
          `Unexpected synthetic preflight statement: ${statement}`
        )
      return {
        rows,
        rowCount: rows.length,
        command: 'SELECT',
        fields: [],
        oid: 0
      } as unknown as QueryResult<T>
    }
  }
  const pool: PostgresPoolLike = { connect: vi.fn(async () => client) }
  const registry = {
    claimAdapter: vi.fn()
  } as unknown as ClaimExecutionRegistry
  return {
    runtime: {
      pool,
      tenantId,
      workerId: 'worker217',
      adapter: {} as Parameters<ClaimExecutionRegistry['claimAdapter']>[2],
      claimExecutions: registry
    },
    statements,
    release
  }
}

describe('SPEC217 serving preflight (synthetic metadata; no PostgreSQL)', () => {
  it('checks role/RLS/migration checksums/append-only evidence and actual writer trigger definitions without DDL', async () => {
    const f = await fixture()
    await assertPublishedPostgresWorkerPreflight(f.runtime)
    expect(f.release).toHaveBeenCalledTimes(2)
    expect(
      f.statements.some((statement) =>
        /^\s*(CREATE|ALTER|GRANT|REVOKE|DROP|INSERT|UPDATE|DELETE)\b/i.test(
          statement
        )
      )
    ).toBe(false)
    expect(
      f.statements.some((statement) => statement.includes('pg_get_functiondef'))
    ).toBe(true)
  })
  it.each([
    'super',
    'bypass',
    'ddl',
    'missing-sidecar',
    'evidence-update',
    'checksum',
    'disabled-guard',
    'security-definer',
    'tampered-function',
    'event-type',
    'sequence-update',
    'migration-writer',
    'foreign-function',
    'owned-function',
    'function-config',
    'conditional-trigger'
  ])('fails closed for %s', async (fault) => {
    const f = await fixture(fault)
    await expect(
      assertPublishedPostgresWorkerPreflight(f.runtime)
    ).rejects.toThrow()
    expect(f.release).toHaveBeenCalled()
  })
})
