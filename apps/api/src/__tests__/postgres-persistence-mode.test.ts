import { createHash, randomBytes } from 'node:crypto'
import { Client, type QueryResult, type QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  assertApprovalDecisionAuditDedupe,
  assertTenantIsolationSchema,
  assertTenantIsolationMigrationState,
  assertMigrationRoleIsLeastPrivilege,
  assertMigrationRoleSecurityBoundary,
  assertRateLimitSchema,
  assertRuntimeRoleIsNotRlsBypass,
  assertRuntimeRoleIsLeastPrivilege,
  assertWebhookReplaySchema,
  buildServer,
  buildServerFromEnv,
  readCurrentDatabaseRole
} from '../server.ts'
import {
  runInitialPostgresMigration,
  readPostgresMigrationSql,
  runPostgresMigrations,
  TENANT_ONLY_TABLES,
  TENANT_SCHEMA_TABLES,
  PostgresControlPlaneRepository,
  TenantScopedPostgresRuntimeRepository,
  type PostgresPoolLike,
  type PostgresQueryable
} from '@cvg/persistence'
import {
  AgentConfigSchema,
  createValidatedControlledReleaseCandidate,
  InMemoryControlPlaneStore,
  createTraceId,
  type AgentId,
  type AgentVersionId,
  type TestRunTrace,
  type TenantId
} from '@cvg/platform'
import { createCorrelationId } from '@cvg/shared'
import { PostgresWebhookReplayStore } from '../webhook-security.ts'
import { createInMemoryOperatorSessionStore } from '../operator-session.ts'

interface Envelope<T> {
  success: boolean
  data: T
  error: { code: string; message: string } | null
  meta: { correlationId: string }
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const postgresTenantA = 'tenant_00000000-0000-4000-8000-000000000081'
const postgresTenantB = 'tenant_00000000-0000-4000-8000-000000000082'
const postgresInboundAgent = 'agent_00000000-0000-4000-8000-000000000081'
const rateLimitKeyRingEnv = JSON.stringify({
  budgetSecret:
    'synthetic-rate-limit-budget-secret-for-postgres-tests-2026-09-21-0001',
  current: {
    keyId: 'rl-postgres-test-v1',
    secret: 'synthetic-rate-limit-hmac-secret-for-postgres-tests-2026-09-21-01'
  },
  previous: []
})

const trustedProductionIdentity = () => ({
  operatorId: 'fixture.production',
  role: 'Supervisor' as const,
  tenantId: postgresTenantA
})

function queryResult<T extends QueryResultRow>(rows: T[]): QueryResult<T> {
  return {
    command: 'SELECT',
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows
  }
}

function atomicTrace(
  tenantId: TenantId,
  agentId: AgentId,
  versionId: AgentVersionId,
  conversationId: string,
  sessionId: string
): TestRunTrace {
  return {
    traceId: createTraceId(),
    tenantId,
    agentId,
    versionId,
    input: { message: 'Mensagem de teste atomico', historySize: 0 },
    intent: { name: 'respond', confidence: 1 },
    policy: [],
    knowledge: { status: 'not_requested' },
    tools: [],
    handoff: {
      requested: false,
      reason: null,
      state: 'BOT_ACTIVE'
    },
    response: {
      text: 'Resposta atomica ficticia',
      mode: 'answer'
    },
    provider: {
      provider: 'fake',
      model: 'deterministic-v1',
      externalCall: false
    },
    configVersion: 'atomic-runtime-v1',
    executionMode: 'CONTROLLED_RUNTIME',
    conversationId,
    sessionId,
    createdAt: new Date()
  }
}

function tenantIsolationSchemaClient(
  missing?: 'tenant-columns' | 'outbox-columns' | 'constraints' | 'indexes'
): PostgresQueryable {
  return {
    async query<T extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[]
    ): Promise<QueryResult<T>> {
      const names = (values?.[0] as string[] | undefined) ?? []
      if (text.includes('FROM pg_class') && !text.includes('pg_attribute')) {
        return queryResult(
          names.map((relname) => ({
            relname,
            relrowsecurity: true,
            relforcerowsecurity: true
          }))
        ) as unknown as QueryResult<T>
      }
      if (text.includes('FROM pg_policies')) {
        return queryResult(
          names.map((tablename) => {
            const expression =
              TENANT_ONLY_TABLES.has(tablename) ||
              tablename === 'outbox_quarantine'
                ? "tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
                : "tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
            return {
              tablename,
              policyname: `${tablename}_tenant_isolation`,
              permissive: 'PERMISSIVE',
              roles: '{public}',
              cmd: 'ALL',
              qual: expression,
              with_check: expression
            }
          })
        ) as unknown as QueryResult<T>
      }
      if (text.includes('pg_attribute')) {
        return queryResult(
          names.flatMap((table_name) => [
            ...(missing === 'tenant-columns' && table_name === 'sessions'
              ? []
              : [{ table_name, column_name: 'tenant_id' }]),
            ...(TENANT_ONLY_TABLES.has(table_name) ||
            table_name === 'outbox_quarantine'
              ? []
              : [{ table_name, column_name: 'tenant_isolation_quarantined' }]),
            ...(table_name === 'sessions'
              ? [
                  { table_name, column_name: 'agent_id' },
                  { table_name, column_name: 'agent_version_id' }
                ]
              : []),
            ...(missing === 'outbox-columns' && table_name === 'outbox_events'
              ? []
              : table_name === 'outbox_events'
                ? [{ table_name, column_name: 'payload_protection_version' }]
                : []),
            ...(missing === 'outbox-columns' && table_name === 'outbox_effects'
              ? []
              : table_name === 'outbox_effects'
                ? [{ table_name, column_name: 'result_protection_version' }]
                : [])
          ])
        ) as unknown as QueryResult<T>
      }
      if (text.includes('FROM pg_constraint')) {
        const selected = missing === 'constraints' ? names.slice(1) : names
        return queryResult(
          selected.map((conname) => ({ conname }))
        ) as unknown as QueryResult<T>
      }
      if (text.includes('FROM pg_index AS')) {
        const selected = missing === 'indexes' ? [] : names
        return queryResult(
          selected.map((index_name) => ({
            index_name,
            table_name: 'audit_events',
            indisunique: true,
            indisvalid: true,
            indisready: true,
            indnkeyatts: 3,
            indnatts: 3,
            expressions:
              "COALESCE(tenant_id, ''::text), (payload ->> 'approvalId'::text), (payload ->> 'decision'::text)",
            predicate: "(type = 'approval_decision'::text)"
          }))
        ) as unknown as QueryResult<T>
      }
      if (text.includes('FROM pg_indexes')) {
        const selected = missing === 'indexes' ? names.slice(1) : names
        return queryResult(
          selected.map((indexname) => ({ indexname }))
        ) as unknown as QueryResult<T>
      }
      return queryResult([]) as unknown as QueryResult<T>
    }
  }
}

async function createPostgresHandoffAgent(
  platform: InMemoryControlPlaneStore,
  tenantId: string
) {
  const agent = await platform.createAgent(
    { tenantId },
    {
      slug: 'postgres-handoff-agent',
      name: 'Postgres Handoff Agent',
      description: 'Fixture'
    }
  )
  const draft = await platform.createVersion(
    { tenantId },
    agent.id,
    AgentConfigSchema.parse({
      persona: { name: 'Luna', role: 'secretary', tone: 'calm' },
      greeting: 'Greeting fictícia.',
      promptBlocks: [
        {
          id: 'safety',
          kind: 'safety',
          content: 'Use somente dados fictícios.',
          priority: 1,
          enabled: true
        }
      ],
      responseTemplates: { institutional_question: 'Resposta fictícia.' },
      model: {
        provider: 'fake',
        model: 'deterministic-v1',
        temperature: 0,
        maxTokens: 128,
        timeoutMs: 1000,
        retries: 0,
        secretRef: 'secret://controlled/postgres-test'
      },
      policies: {
        version: 'postgres-handoff-v1',
        minConfidence: 0.7,
        lowConfidence: 'handoff',
        maxClarifications: 2,
        enabledActions: ['respond', 'institutional_question'],
        approvalActions: [],
        blockedActions: []
      },
      plugins: [],
      knowledge: [
        {
          source: 'controlled://postgres-test',
          version: 'postgres-knowledge-v1',
          enabled: true,
          requiresApprovedSource: true
        }
      ],
      handoff: {
        lowConfidenceDestination: 'controlled-reception',
        destinations: ['controlled-reception'],
        maxClarifications: 2
      }
    }),
    'postgres.test'
  )
  const testing = await platform.transitionVersion(
    { tenantId },
    draft.id,
    'TESTING'
  )
  const approved = await platform.transitionVersion(
    { tenantId },
    testing.id,
    'APPROVED'
  )
  const releaseCandidate = await createValidatedControlledReleaseCandidate(
    platform,
    tenantId,
    agent.id,
    approved.id,
    'postgres.test'
  )
  await platform.publishVersion({ tenantId }, approved.id, releaseCandidate.id)
  return agent
}

describe('api PostgreSQL persistence mode', () => {
  it('fails closed when the tenant-isolation migration marker is absent', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(): Promise<
        QueryResult<T>
      > {
        return queryResult([]) as unknown as QueryResult<T>
      }
    }

    await expect(assertTenantIsolationMigrationState(client)).rejects.toThrow(
      'tenant-isolation migration state is not verified'
    )
  })

  it('accepts migration markers whose checksums match the checked-in SQL', async () => {
    const versions = [
      '0000_initial',
      '0001_tenant_isolation',
      '0002_capability_approvals',
      '0003_test_suite_catalog',
      '0004_plugin_manifest_catalog',
      '0005_knowledge_source_catalog',
      '0006_release_candidate_evidence',
      '0007_audit_evidence_checkpoint',
      '0008_session_agent_version_pin',
      '0009_release_candidate_validator_integrity',
      '0010_outbox_durability',
      '0011_outbox_payload_redaction',
      '0012_channel_effect_journal',
      '0013_runtime_effect_journal',
      '0014_journeys',
      '0015_runtime_approval_store',
      '0016_operational_execution_spine',
      '0017_runtime_approval_execution_binding',
      '0018_operational_execution_invariants',
      '0019_iterative_execution_steps',
      '0020_conversation_intelligence',
      '0021_approval_decision_audit_dedupe',
      '0022_conversation_policy_standardization',
      '0023_rate_limit_buckets',
      '0024_approval_decision_causality',
      '0025_webhook_replay_fencing',
      '0026_rate_limit_key_hardening',
      '0027_worker_operations'
    ] as const
    const rows: Array<{
      version: string
      checksum: string
      applied_at: Date
      baseline_actor: null
      baseline_reference: null
      baseline_at: null
    }> = []
    for (const [index, version] of versions.entries()) {
      const sql = await readPostgresMigrationSql(version)
      rows.push({
        version,
        checksum: createHash('sha256').update(sql).digest('hex'),
        applied_at: new Date(2026, 7, 24, 10, index),
        baseline_actor: null,
        baseline_reference: null,
        baseline_at: null
      })
    }
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(): Promise<
        QueryResult<T>
      > {
        return queryResult(rows) as unknown as QueryResult<T>
      }
    }

    await expect(
      assertTenantIsolationMigrationState(client)
    ).resolves.toBeUndefined()
  })

  it('rejects migration markers applied out of order', async () => {
    const versions = [
      '0000_initial',
      '0001_tenant_isolation',
      '0002_capability_approvals',
      '0003_test_suite_catalog',
      '0004_plugin_manifest_catalog',
      '0005_knowledge_source_catalog',
      '0006_release_candidate_evidence',
      '0007_audit_evidence_checkpoint',
      '0008_session_agent_version_pin',
      '0009_release_candidate_validator_integrity'
    ] as const
    const rows = await Promise.all(
      versions.map(async (version, index) => ({
        version,
        checksum: createHash('sha256')
          .update(await readPostgresMigrationSql(version))
          .digest('hex'),
        applied_at: new Date(2026, 7, 24, 10, index === 1 ? 0 : index + 1),
        baseline_actor: null,
        baseline_reference: null,
        baseline_at: null
      }))
    )
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(): Promise<
        QueryResult<T>
      > {
        return queryResult(rows) as unknown as QueryResult<T>
      }
    }

    await expect(assertTenantIsolationMigrationState(client)).rejects.toThrow(
      'tenant-isolation migration state is not verified'
    )
  })

  it('rejects a runtime role that owns a tenant-scoped table', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        if (text.includes('FROM pg_roles')) {
          return queryResult([
            {
              rolname: 'runtime_user',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false
            }
          ]) as unknown as QueryResult<T>
        }
        return queryResult([
          {
            relname: 'conversations',
            owner: 'runtime_user',
            canDelete: false,
            canTruncate: false
          }
        ]) as unknown as QueryResult<T>
      }
    }

    await expect(assertRuntimeRoleIsLeastPrivilege(client)).rejects.toThrow(
      'least-privilege'
    )
  })

  it('accepts a least-privileged runtime role with DML-only grants', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> {
        if (text.includes('FROM pg_auth_members'))
          return queryResult([]) as unknown as QueryResult<T>
        if (text.includes('FROM pg_roles')) {
          return queryResult([
            {
              rolname: 'runtime_user',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false
            }
          ]) as unknown as QueryResult<T>
        }
        if (
          text.includes("'SELECT'") &&
          text.includes("'INSERT'") &&
          text.includes("'UPDATE'") &&
          text.includes("'DELETE'") &&
          !((values?.[0] as string[] | undefined) ?? []).includes(
            'tenant_isolation_quarantine'
          )
        ) {
          const relationNames = (values?.[0] as string[] | undefined) ?? []
          return queryResult(
            relationNames.map(() => ({
              owner: 'migration_user',
              can_select: true,
              can_insert: true,
              can_update: true,
              can_delete:
                relationNames.includes('webhook_replay_events') ||
                relationNames.includes('rate_limit_buckets'),
              can_truncate: false,
              can_trigger: false,
              can_references: false
            }))
          ) as unknown as QueryResult<T>
        }
        if (
          text.includes('FROM pg_class') &&
          ((values?.[0] as string[] | undefined) ?? []).includes(
            'tenant_isolation_quarantine'
          )
        ) {
          return queryResult(
            ((values?.[0] as string[] | undefined) ?? []).map(() => ({
              owner: 'migration_user',
              can_select: false,
              can_insert: false,
              can_update: false,
              can_delete: false,
              can_truncate: false
            }))
          ) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_class') && !text.includes('pg_attribute')) {
          return queryResult(
            ((values?.[0] as string[] | undefined) ?? []).map((relname) => ({
              relname,
              owner: 'migration_user',
              can_select: true,
              can_insert: true,
              can_update: true,
              can_delete: false,
              can_truncate: false,
              can_trigger: false,
              can_references: false
            }))
          ) as unknown as QueryResult<T>
        }
        return queryResult([{ can_create: false }]) as unknown as QueryResult<T>
      }
    }

    await expect(
      assertRuntimeRoleIsLeastPrivilege(client, 'migration_user')
    ).resolves.toBeUndefined()
  })

  it('rejects a runtime role that inherits another PostgreSQL role', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        if (text.includes('FROM pg_auth_members')) {
          return queryResult([
            { granted_role: 'migration_user' }
          ]) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_roles')) {
          return queryResult([
            {
              rolname: 'runtime_user',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false
            }
          ]) as unknown as QueryResult<T>
        }
        return queryResult([]) as unknown as QueryResult<T>
      }
    }

    await expect(assertRuntimeRoleIsLeastPrivilege(client)).rejects.toThrow(
      'least-privilege'
    )
  })

  it.each([
    ['table', []],
    ['index', ['rate_limit_buckets_pkey']]
  ] as const)(
    'rejects an incomplete rate-limit %s catalog',
    async (_kind, indexes) => {
      const client: PostgresQueryable = {
        async query<T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> {
          if (text.includes('FROM pg_class')) {
            return queryResult(
              _kind === 'table'
                ? []
                : [
                    {
                      relname: 'rate_limit_buckets',
                      relkind: 'r',
                      relrowsecurity: false,
                      relforcerowsecurity: false
                    }
                  ]
            ) as unknown as QueryResult<T>
          }
          if (text.includes('pg_attribute')) {
            return queryResult(
              [
                'budget_key',
                'key_version',
                'key_digest',
                'count',
                'reset_at'
              ].map((column_name) => ({
                table_name: 'rate_limit_buckets',
                column_name
              }))
            ) as unknown as QueryResult<T>
          }
          if (text.includes('FROM pg_constraint')) {
            return queryResult([
              { conname: 'rate_limit_buckets_pkey' },
              { conname: 'rate_limit_buckets_count_check' },
              { conname: 'rate_limit_buckets_key_version_check' },
              { conname: 'rate_limit_buckets_key_digest_check' }
            ]) as unknown as QueryResult<T>
          }
          return queryResult(
            indexes.map((indexname) => ({ indexname }))
          ) as unknown as QueryResult<T>
        }
      }

      await expect(assertRateLimitSchema(client)).rejects.toThrow(
        'rate-limit storage'
      )
    }
  )

  it('accepts a complete rate-limit catalog and rejects each structural defect', async () => {
    type RateLimitCatalog = {
      relation: Array<{
        relname: string
        relkind: string
        relrowsecurity: boolean
        relforcerowsecurity: boolean
      }>
      columns: string[]
      constraints: string[]
      indexes: string[]
    }

    const complete: RateLimitCatalog = {
      relation: [
        {
          relname: 'rate_limit_buckets',
          relkind: 'r',
          relrowsecurity: false,
          relforcerowsecurity: false
        }
      ],
      columns: ['budget_key', 'key_version', 'key_digest', 'count', 'reset_at'],
      constraints: [
        'rate_limit_buckets_pkey',
        'rate_limit_buckets_count_check',
        'rate_limit_buckets_key_version_check',
        'rate_limit_buckets_key_digest_check'
      ],
      indexes: ['rate_limit_buckets_pkey', 'idx_rate_limit_buckets_reset_at']
    }

    const clientFor = (catalog: RateLimitCatalog): PostgresQueryable => ({
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        if (text.includes('pg_attribute')) {
          return queryResult(
            catalog.columns.map((column_name) => ({
              table_name: 'rate_limit_buckets',
              column_name
            }))
          ) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_class')) {
          return queryResult(catalog.relation) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_constraint')) {
          return queryResult(
            catalog.constraints.map((conname) => ({ conname }))
          ) as unknown as QueryResult<T>
        }
        return queryResult(
          catalog.indexes.map((indexname) => ({ indexname }))
        ) as unknown as QueryResult<T>
      }
    })

    await expect(
      assertRateLimitSchema(clientFor(complete))
    ).resolves.toBeUndefined()

    const defects: RateLimitCatalog[] = [
      { ...complete, relation: [] },
      {
        ...complete,
        relation: [{ ...complete.relation[0]!, relkind: 'v' }]
      },
      {
        ...complete,
        relation: [{ ...complete.relation[0]!, relrowsecurity: true }]
      },
      {
        ...complete,
        columns: [
          'budget_key',
          'key_version',
          'key_digest',
          'count',
          'reset_at',
          'key'
        ]
      },
      { ...complete, columns: ['budget_key', 'count'] },
      {
        ...complete,
        constraints: ['rate_limit_buckets_pkey']
      },
      {
        ...complete,
        indexes: ['rate_limit_buckets_pkey']
      }
    ]

    for (const defect of defects) {
      await expect(assertRateLimitSchema(clientFor(defect))).rejects.toThrow(
        'rate-limit storage'
      )
    }
  })

  it('rejects runtime table trigger or reference privileges', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> {
        if (text.includes('FROM pg_auth_members'))
          return queryResult([]) as unknown as QueryResult<T>
        if (text.includes('FROM pg_roles')) {
          return queryResult([
            {
              rolname: 'runtime_user',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false
            }
          ]) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_class')) {
          return queryResult(
            ((values?.[0] as string[] | undefined) ?? []).map((relname) => ({
              relname,
              owner: 'migration_user',
              can_select: true,
              can_insert: true,
              can_update: true,
              can_delete: false,
              can_truncate: false,
              can_trigger: relname === 'conversations',
              can_references: false
            }))
          ) as unknown as QueryResult<T>
        }
        return queryResult([{ can_create: false }]) as unknown as QueryResult<T>
      }
    }

    await expect(
      assertRuntimeRoleIsLeastPrivilege(client, 'migration_user')
    ).rejects.toThrow('least-privilege')
  })

  it('requires the migration role to be a separate non-privileged DDL owner', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> {
        if (text.includes('FROM pg_roles')) {
          return queryResult([
            {
              rolname: 'migration_user',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false
            }
          ]) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_auth_members'))
          return queryResult([]) as unknown as QueryResult<T>
        if (text.includes('has_schema_privilege')) {
          return queryResult([
            { can_usage: true, can_create: true }
          ]) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_class')) {
          return queryResult(
            ((values?.[0] as string[] | undefined) ?? []).map((relname) => ({
              relname,
              owner: 'migration_user'
            }))
          ) as unknown as QueryResult<T>
        }
        return queryResult([]) as unknown as QueryResult<T>
      }
    }

    await expect(
      assertMigrationRoleIsLeastPrivilege(client, 'runtime_user')
    ).resolves.toBeUndefined()
    await expect(
      assertMigrationRoleIsLeastPrivilege(client, 'migration_user')
    ).rejects.toThrow('separate non-privileged DDL owner')
  })

  it('rejects migration-role security violations before any migration runs', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        if (text.includes('FROM pg_roles')) {
          return queryResult([
            {
              rolname: 'migration_user',
              rolsuper: true,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false
            }
          ]) as unknown as QueryResult<T>
        }
        return queryResult([]) as unknown as QueryResult<T>
      }
    }
    await expect(
      assertMigrationRoleSecurityBoundary(client, 'runtime_user')
    ).rejects.toThrow('separate non-privileged DDL owner')
  })

  it('accepts a clean migration-role identity before checking managed ownership', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        if (text.includes('FROM pg_roles')) {
          return queryResult([
            {
              rolname: 'migration_user',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false
            }
          ]) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_auth_members'))
          return queryResult([]) as unknown as QueryResult<T>
        if (text.includes('FROM pg_database')) {
          return queryResult([
            { owner: 'postgres' }
          ]) as unknown as QueryResult<T>
        }
        return queryResult([]) as unknown as QueryResult<T>
      }
    }
    await expect(
      assertMigrationRoleSecurityBoundary(client, 'runtime_user')
    ).resolves.toBeUndefined()
  })

  it('fails closed when the migration role owns an incomplete managed catalog', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> {
        if (text.includes('FROM pg_roles')) {
          return queryResult([
            {
              rolname: 'migration_user',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false
            }
          ]) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_auth_members'))
          return queryResult([]) as unknown as QueryResult<T>
        if (text.includes('FROM pg_database'))
          return queryResult([
            { owner: 'postgres' }
          ]) as unknown as QueryResult<T>
        if (text.includes('has_schema_privilege'))
          return queryResult([
            { can_usage: true, can_create: true }
          ]) as unknown as QueryResult<T>
        if (text.includes('FROM pg_class')) {
          const names = (values?.[0] as string[] | undefined) ?? []
          return queryResult(
            names
              .slice(1)
              .map((relname) => ({ relname, owner: 'migration_user' }))
          ) as unknown as QueryResult<T>
        }
        return queryResult([]) as unknown as QueryResult<T>
      }
    }

    await expect(
      assertMigrationRoleIsLeastPrivilege(client, 'runtime_user')
    ).rejects.toThrow('separate non-privileged DDL owner')
  })

  it('identifies the current role and rejects RLS bypass identities', async () => {
    const cleanClient: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        if (text.includes('current_user::text')) {
          return queryResult([
            { role_name: 'runtime_user' }
          ]) as unknown as QueryResult<T>
        }
        return queryResult([
          { rolsuper: false, rolbypassrls: false }
        ]) as unknown as QueryResult<T>
      }
    }

    await expect(readCurrentDatabaseRole(cleanClient)).resolves.toBe(
      'runtime_user'
    )
    await expect(
      assertRuntimeRoleIsNotRlsBypass(cleanClient)
    ).resolves.toBeUndefined()

    const bypassClient: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        if (text.includes('current_user::text')) {
          return queryResult([]) as unknown as QueryResult<T>
        }
        return queryResult([
          { rolsuper: false, rolbypassrls: true }
        ]) as unknown as QueryResult<T>
      }
    }

    await expect(readCurrentDatabaseRole(bypassClient)).rejects.toThrow(
      'current role could not be identified'
    )
    await expect(assertRuntimeRoleIsNotRlsBypass(bypassClient)).rejects.toThrow(
      'without BYPASSRLS'
    )
  })

  it('fails closed when the runtime database is missing the complete RLS catalog contract', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(): Promise<
        QueryResult<T>
      > {
        return queryResult([]) as unknown as QueryResult<T>
      }
    }

    await expect(assertTenantIsolationSchema(client)).rejects.toThrow(
      'tenant isolation policies are not fully installed'
    )
  })

  it('accepts a complete RLS catalog contract for all tenant-scoped tables', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> {
        const names = (values?.[0] as string[] | undefined) ?? []
        if (text.includes('FROM pg_class') && !text.includes('pg_attribute')) {
          return queryResult(
            names.map((relname) => ({
              relname,
              relrowsecurity: true,
              relforcerowsecurity: true
            }))
          ) as unknown as QueryResult<T>
        }
        if (
          text.includes('information_schema.columns') ||
          text.includes('pg_attribute')
        ) {
          return queryResult(
            names.flatMap((table_name) => [
              { table_name, column_name: 'tenant_id' },
              // AUD19-005: tenant-only tables carry no quarantine column
              // (mirrors TENANT_ONLY_TABLES in @cvg/persistence tenant-schema).
              ...(table_name === 'runtime_approvals' ||
              table_name === 'outbox_effects' ||
              table_name === 'outbox_attempts' ||
              table_name === 'outbox_quarantine' ||
              table_name === 'channel_effect_journal' ||
              table_name === 'effect_journal' ||
              table_name === 'journey_owner_drafts' ||
              table_name === 'journey_patient_drafts' ||
              table_name === 'journey_appointment_drafts' ||
              table_name === 'worker_heartbeats' ||
              table_name === 'kernel_pause_switches'
                ? []
                : [
                    { table_name, column_name: 'tenant_isolation_quarantined' }
                  ]),
              ...(table_name === 'sessions'
                ? [
                    { table_name, column_name: 'agent_id' },
                    { table_name, column_name: 'agent_version_id' }
                  ]
                : []),
              ...(table_name === 'outbox_events'
                ? [{ table_name, column_name: 'payload_protection_version' }]
                : []),
              ...(table_name === 'outbox_effects'
                ? [{ table_name, column_name: 'result_protection_version' }]
                : [])
            ])
          ) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_constraint')) {
          return queryResult(
            names.map((conname) => ({ conname }))
          ) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_index AS')) {
          return queryResult(
            names.map((index_name) => ({
              index_name,
              table_name: 'audit_events',
              indisunique: true,
              indisvalid: true,
              indisready: true,
              indnkeyatts: 3,
              indnatts: 3,
              expressions:
                "COALESCE(tenant_id, ''::text), (payload ->> 'approvalId'::text), (payload ->> 'decision'::text)",
              predicate: "(type = 'approval_decision'::text)"
            }))
          ) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_indexes')) {
          return queryResult(
            names.map((indexname) => ({ indexname }))
          ) as unknown as QueryResult<T>
        }
        const tableNames = text.includes('tablename = ANY')
          ? names
          : names.map((name) => name.replace(/_tenant_isolation$/, ''))
        return queryResult(
          tableNames.map((tablename) => ({
            tablename,
            policyname: `${tablename}_tenant_isolation`,
            permissive: 'PERMISSIVE',
            roles: '{public}',
            cmd: 'ALL',
            // AUD19-005: tenant-only set mirrors TENANT_ONLY_TABLES.
            qual:
              tablename === 'runtime_approvals' ||
              tablename === 'outbox_effects' ||
              tablename === 'outbox_attempts' ||
              tablename === 'outbox_quarantine' ||
              tablename === 'channel_effect_journal' ||
              tablename === 'effect_journal' ||
              tablename === 'journey_owner_drafts' ||
              tablename === 'journey_patient_drafts' ||
              tablename === 'journey_appointment_drafts' ||
              tablename === 'worker_heartbeats' ||
              tablename === 'kernel_pause_switches'
                ? "tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
                : "tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')",
            with_check:
              tablename === 'runtime_approvals' ||
              tablename === 'outbox_effects' ||
              tablename === 'outbox_attempts' ||
              tablename === 'outbox_quarantine' ||
              tablename === 'channel_effect_journal' ||
              tablename === 'effect_journal' ||
              tablename === 'journey_owner_drafts' ||
              tablename === 'journey_patient_drafts' ||
              tablename === 'journey_appointment_drafts' ||
              tablename === 'worker_heartbeats' ||
              tablename === 'kernel_pause_switches'
                ? "tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
                : "tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
          }))
        ) as unknown as QueryResult<T>
      }
    }

    await expect(assertTenantIsolationSchema(client)).resolves.toBeUndefined()
  })

  it.each([
    ['missing', null],
    ['wrong table', { table_name: 'other_events' }],
    ['not unique', { indisunique: false }],
    ['not valid', { indisvalid: false }],
    ['not ready', { indisready: false }],
    ['wrong key count', { indnkeyatts: 2 }],
    ['wrong attribute count', { indnatts: 2 }],
    [
      'wrong expressions',
      { expressions: "COALESCE(tenant_id, ''), (payload ->> 'other')" }
    ],
    ['wrong predicate', { predicate: "type = 'other'" }]
  ] as const)(
    'rejects approval dedupe catalog when %s',
    async (_name, change) => {
      const base = {
        index_name: 'uq_audit_approval_decision',
        table_name: 'audit_events',
        indisunique: true,
        indisvalid: true,
        indisready: true,
        indnkeyatts: 3,
        indnatts: 3,
        expressions:
          "COALESCE(tenant_id, ''::text), (payload ->> 'approvalId'::text), (payload ->> 'decision'::text)",
        predicate: "(type = 'approval_decision'::text)"
      }
      const client: PostgresQueryable = {
        async query<T extends QueryResultRow = QueryResultRow>(
          text: string
        ): Promise<QueryResult<T>> {
          if (!text.includes('FROM pg_index AS')) {
            return queryResult([]) as unknown as QueryResult<T>
          }
          const row = change === null ? [] : [{ ...base, ...change }]
          return queryResult(row) as unknown as QueryResult<T>
        }
      }

      await expect(assertApprovalDecisionAuditDedupe(client)).rejects.toThrow(
        'approval decision dedupe index'
      )
    }
  )

  it.each([
    ['tenant-columns', 'tenant isolation columns are incomplete'],
    ['outbox-columns', 'outbox payload protection columns are incomplete'],
    ['constraints', 'tenant isolation constraints are incomplete'],
    ['indexes', 'tenant isolation indexes are incomplete']
  ] as const)(
    'rejects an incomplete RLS %s catalog',
    async (missing, message) => {
      await expect(
        assertTenantIsolationSchema(tenantIsolationSchemaClient(missing))
      ).rejects.toThrow(message)
    }
  )

  it('rejects a runtime role that is also configured as the migration role', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string
      ): Promise<QueryResult<T>> {
        if (text.includes('FROM pg_roles')) {
          return queryResult([
            {
              rolname: 'runtime_user',
              rolsuper: false,
              rolbypassrls: false,
              rolcreatedb: false,
              rolcreaterole: false,
              rolreplication: false
            }
          ]) as unknown as QueryResult<T>
        }
        return queryResult([]) as unknown as QueryResult<T>
      }
    }

    await expect(
      assertRuntimeRoleIsLeastPrivilege(client, 'runtime_user')
    ).rejects.toThrow('least-privilege')
  })

  it('rejects incomplete webhook replay catalog results', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(): Promise<
        QueryResult<T>
      > {
        return queryResult([]) as unknown as QueryResult<T>
      }
    }
    await expect(assertWebhookReplaySchema(client)).rejects.toThrow(
      'webhook replay storage is not fully installed'
    )
  })

  it('rejects a policy that mentions the tenant setting but is semantically permissive', async () => {
    const client: PostgresQueryable = {
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> {
        const names = (values?.[0] as string[] | undefined) ?? []
        if (text.includes('FROM pg_class')) {
          return queryResult(
            names.map((relname) => ({
              relname,
              relrowsecurity: true,
              relforcerowsecurity: true
            }))
          ) as unknown as QueryResult<T>
        }
        const tableNames = text.includes('tablename = ANY')
          ? names
          : names.map((name) => name.replace(/_tenant_isolation$/, ''))
        return queryResult(
          tableNames.map((tablename) => ({
            tablename,
            policyname: `${tablename}_tenant_isolation`,
            permissive: 'PERMISSIVE',
            roles: '{public}',
            cmd: 'ALL',
            qual:
              tablename === 'conversations'
                ? "true OR current_setting('cvg.tenant_id', true) IS NOT NULL"
                : "tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')",
            with_check:
              "tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
          }))
        ) as unknown as QueryResult<T>
      }
    }

    await expect(assertTenantIsolationSchema(client)).rejects.toThrow(
      'tenant isolation policies are not fully installed'
    )
  })

  it('keeps PostgreSQL mode fail-closed unless DATABASE_URL is explicitly provided', async () => {
    await expect(
      buildServerFromEnv({ NODE_ENV: 'test', API_PERSISTENCE_MODE: 'postgres' })
    ).rejects.toThrow(
      'DATABASE_URL is required for PostgreSQL persistence mode'
    )

    const app = await buildServerFromEnv({
      NODE_ENV: 'test',
      API_PERSISTENCE_MODE: 'memory'
    })
    const response = await app.inject({ method: 'GET', url: '/health' })
    await app.close()

    expect(response.statusCode).toBe(200)
  })

  it('rejects an unset or unknown runtime environment before starting the API', async () => {
    await expect(
      buildServerFromEnv({ API_PERSISTENCE_MODE: 'memory' })
    ).rejects.toThrow('NODE_ENV must be explicitly set')
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'staging',
        API_PERSISTENCE_MODE: 'memory'
      })
    ).rejects.toThrow('NODE_ENV must be explicitly set')
  })

  it('rejects invalid or in-memory persistence selection in production', async () => {
    await expect(
      buildServerFromEnv(
        {
          NODE_ENV: 'production',
          API_PERSISTENCE_MODE: 'memory'
        },
        { webhookVerifier: () => true }
      )
    ).rejects.toThrow(/Production requires PostgreSQL/)
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'test',
        API_PERSISTENCE_MODE: 'unexpected'
      })
    ).rejects.toThrow(/must be memory or postgres/)
    await expect(
      buildServerFromEnv(
        {
          NODE_ENV: 'production',
          API_PERSISTENCE_MODE: 'postgres',
          DATABASE_URL: 'postgres://fixture.invalid/cvg'
        },
        { webhookVerifier: () => true }
      )
    ).rejects.toThrow(/tenant-scoped PostgreSQL RLS enforcement/)
    await expect(
      buildServerFromEnv(
        {
          NODE_ENV: 'production',
          API_PERSISTENCE_MODE: 'postgres',
          DATABASE_URL: 'postgres://fixture.invalid/cvg',
          POSTGRES_RLS_ENFORCEMENT: 'true',
          OUTBOX_DURABLE_INBOUND: 'true',
          API_ALLOWED_ORIGINS: 'https://console.example.test',
          API_REQUIRE_HTTPS: 'true',
          API_TRUSTED_PROXY_HOPS: '0'
        },
        { webhookVerifier: () => true }
      )
    ).rejects.toThrow(/INBOUND_TENANT_ID/)
  })

  it('requires a trusted inbound agent and supports an injected runtime', async () => {
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'production',
        API_PERSISTENCE_MODE: 'postgres',
        DATABASE_URL: 'postgres://fixture.invalid/cvg',
        INBOUND_TENANT_ID: postgresTenantA,
        POSTGRES_RLS_ENFORCEMENT: 'true',
        OUTBOX_DURABLE_INBOUND: 'true',
        API_ALLOWED_ORIGINS: 'https://console.example.test',
        API_REQUIRE_HTTPS: 'true',
        API_TRUSTED_PROXY_HOPS: '0'
      })
    ).rejects.toThrow(/INBOUND_AGENT_ID/)

    await expect(
      buildServerFromEnv({
        NODE_ENV: 'test',
        API_PERSISTENCE_MODE: 'memory',
        INBOUND_AGENT_ID: 'agent_invalid'
      })
    ).rejects.toThrow(/INBOUND_AGENT_ID must be a valid agent id/)

    const injectedRuntime = {
      resolveAgentId: () => postgresInboundAgent as AgentId
    }
    const app = await buildServerFromEnv(
      {
        NODE_ENV: 'test',
        API_PERSISTENCE_MODE: 'memory',
        INBOUND_AGENT_ID: postgresInboundAgent
      },
      { agentRuntime: injectedRuntime }
    )
    await app.close()
  })

  const itWithPostgres = testDatabaseUrl ? it : it.skip

  itWithPostgres(
    'uses PostgreSQL-backed webhook replay state across reserve and commit operations',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_replay_${Date.now()}`
      await client.connect()

      try {
        await client.query(`
          CREATE SCHEMA ${schemaName};
          SET search_path TO ${schemaName};
           CREATE TABLE webhook_replay_events (
             event_key text PRIMARY KEY CHECK (btrim(event_key) <> ''),
             status text NOT NULL CHECK (status IN ('reserved', 'committed')),
             expires_at timestamptz NOT NULL,
             created_at timestamptz NOT NULL DEFAULT now(),
             lease_generation bigint NOT NULL DEFAULT 0,
             lease_token text,
             CONSTRAINT webhook_replay_events_lease_generation_check
               CHECK (lease_generation >= 0),
             CONSTRAINT webhook_replay_events_fencing_check
               CHECK (
                 (status = 'reserved' AND lease_generation > 0 AND lease_token IS NOT NULL AND btrim(lease_token) <> '')
                 OR (status = 'committed' AND lease_token IS NULL)
               )
           );
          CREATE INDEX idx_webhook_replay_events_expires
            ON webhook_replay_events (expires_at);
        `)
        const pool = {
          connect: async () => ({
            query: client.query.bind(client),
            release: () => undefined
          })
        } as unknown as PostgresPoolLike
        const store = new PostgresWebhookReplayStore(pool)
        const eventKey = `webhook:whatsapp:pg-replay-${Date.now()}`
        const expiresAt = Date.now() + 60_000

        const first = await store.reserve(eventKey, expiresAt)
        expect(first).toMatchObject({ key: eventKey, generation: 1 })
        if (!first) throw new Error('fixture failed to reserve replay event')
        await expect(store.reserve(eventKey, expiresAt)).resolves.toBe(false)
        await expect(store.release(first)).resolves.toBe(true)
        const second = await store.reserve(eventKey, expiresAt)
        expect(second).toMatchObject({ key: eventKey, generation: 1 })
        if (!second)
          throw new Error('fixture failed to re-reserve replay event')
        await expect(store.commit(second)).resolves.toBe(true)
        await expect(store.claim(eventKey, expiresAt)).resolves.toBe(false)
        await expect(
          client.query(
            'SELECT status FROM webhook_replay_events WHERE event_key = $1',
            [eventKey]
          )
        ).resolves.toMatchObject({ rows: [{ status: 'committed' }] })
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )

  itWithPostgres(
    'commits and rolls back the tenant-scoped runtime finalizer atomically',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_atomic_${Date.now()}`
      const tenantId = 'tenant_00000000-0000-4000-8000-000000000083' as TenantId
      await client.connect()

      try {
        await runPostgresMigrations(client, { schemaName })
        const controlPlane = new PostgresControlPlaneRepository(client)
        const agent = await controlPlane.createAgent(
          { tenantId },
          {
            slug: 'atomic-runtime-agent',
            name: 'Atomic Runtime Agent',
            description: 'Fixture de finalização transacional'
          }
        )
        const version = await controlPlane.createVersion(
          { tenantId },
          agent.id,
          AgentConfigSchema.parse({
            persona: { name: 'Fixture', role: 'secretary', tone: 'calm' },
            greeting: 'Resposta controlada.',
            promptBlocks: [],
            responseTemplates: {},
            model: {
              provider: 'fake',
              model: 'deterministic-v1',
              temperature: 0,
              maxTokens: 128,
              timeoutMs: 1000,
              retries: 0,
              secretRef: 'secret://controlled/atomic-runtime'
            },
            policies: {
              version: 'atomic-runtime-v1',
              minConfidence: 0.7,
              lowConfidence: 'clarify',
              maxClarifications: 2,
              enabledActions: ['respond'],
              approvalActions: [],
              blockedActions: []
            },
            plugins: [],
            knowledge: [],
            handoff: {
              lowConfidenceDestination: 'controlled-reception',
              destinations: ['controlled-reception'],
              maxClarifications: 2
            }
          }),
          'atomic.test'
        )
        const pool = {
          connect: async () => ({
            query: client.query.bind(client),
            release: () => undefined
          })
        } as unknown as PostgresPoolLike
        const runtime = new TenantScopedPostgresRuntimeRepository(pool)
        const created = await runtime.createWithSession({
          tenantId,
          channel: 'whatsapp',
          senderRef: 'fixture-atomic-sender',
          externalMessageId: 'atomic-inbound-1',
          body: 'Mensagem de teste atomico'
        })
        const trace = atomicTrace(
          tenantId,
          agent.id as AgentId,
          version.id as AgentVersionId,
          created.conversation.id,
          created.session.id
        )

        await expect(
          runtime.completeInboundRuntime({
            tenantId,
            conversationId: created.conversation.id,
            sessionId: created.session.id,
            inboundMessageId: created.message.id,
            trace,
            toolAuditEvents: [],
            correlationId: created.conversation.correlationId
          })
        ).resolves.toEqual({ status: 'completed' })

        await expect(
          client.query<{ count: string }>(
            `SELECT count(*)::text
             FROM messages
             WHERE conversation_id = $1 AND direction = 'outbound'`,
            [created.conversation.id]
          )
        ).resolves.toMatchObject({ rows: [{ count: '1' }] })
        await expect(
          client.query<{ count: string }>(
            `SELECT count(*)::text
             FROM platform_execution_traces
             WHERE trace_id = $1`,
            [trace.traceId]
          )
        ).resolves.toMatchObject({ rows: [{ count: '1' }] })

        const unsafeInbound = await runtime.createWithSession({
          tenantId,
          channel: 'whatsapp',
          senderRef: 'fixture-atomic-sender',
          externalMessageId: 'atomic-inbound-unsafe',
          body: 'Mensagem insegura',
          conversationId: created.conversation.id,
          sessionId: created.session.id
        })
        const unsafeTrace = {
          ...atomicTrace(
            tenantId,
            agent.id as AgentId,
            version.id as AgentVersionId,
            created.conversation.id,
            created.session.id
          ),
          response: {
            text: 'Diagnóstico: gastrite.',
            mode: 'answer' as const
          }
        }
        await expect(
          runtime.completeInboundRuntime({
            tenantId,
            conversationId: created.conversation.id,
            sessionId: created.session.id,
            inboundMessageId: unsafeInbound.message.id,
            trace: unsafeTrace,
            toolAuditEvents: [],
            correlationId: createCorrelationId()
          })
        ).rejects.toMatchObject({ code: 'validation_failed' })
        await expect(
          client.query<{ count: string }>(
            `SELECT count(*)::text
             FROM messages
             WHERE external_message_id = $1`,
            [`runtime:${unsafeTrace.traceId}`]
          )
        ).resolves.toMatchObject({ rows: [{ count: '0' }] })
        await expect(
          client.query<{ runtime_status: string }>(
            `SELECT runtime_status
             FROM messages
             WHERE id = $1`,
            [unsafeInbound.message.id]
          )
        ).resolves.toMatchObject({ rows: [{ runtime_status: 'pending' }] })

        const invalidProviderInbound = await runtime.createWithSession({
          tenantId,
          channel: 'whatsapp',
          senderRef: 'fixture-atomic-sender',
          externalMessageId: 'atomic-inbound-invalid-provider',
          body: 'Mensagem com provider inválido',
          conversationId: created.conversation.id,
          sessionId: created.session.id
        })
        const invalidProviderTrace = {
          ...atomicTrace(
            tenantId,
            agent.id as AgentId,
            version.id as AgentVersionId,
            created.conversation.id,
            created.session.id
          ),
          provider: {
            provider: 'fake',
            model: 'deterministic-v1',
            externalCall: true
          }
        } as unknown as TestRunTrace
        await expect(
          runtime.completeInboundRuntime({
            tenantId,
            conversationId: created.conversation.id,
            sessionId: created.session.id,
            inboundMessageId: invalidProviderInbound.message.id,
            trace: invalidProviderTrace,
            toolAuditEvents: [],
            correlationId: createCorrelationId()
          })
        ).rejects.toMatchObject({ code: 'validation_failed' })
        await expect(
          client.query<{ count: string }>(
            `SELECT count(*)::text
             FROM messages
             WHERE external_message_id = $1`,
            [`runtime:${invalidProviderTrace.traceId}`]
          )
        ).resolves.toMatchObject({ rows: [{ count: '0' }] })
        await expect(
          client.query<{ runtime_status: string }>(
            `SELECT runtime_status
             FROM messages
             WHERE id = $1`,
            [invalidProviderInbound.message.id]
          )
        ).resolves.toMatchObject({ rows: [{ runtime_status: 'pending' }] })

        const rollbackInbound = await runtime.createWithSession({
          tenantId,
          channel: 'whatsapp',
          senderRef: 'fixture-atomic-sender',
          externalMessageId: 'atomic-inbound-2',
          body: 'Mensagem de rollback',
          conversationId: created.conversation.id,
          sessionId: created.session.id
        })
        const rollbackTrace = atomicTrace(
          tenantId,
          'agent_00000000-0000-4000-8000-000000000084' as AgentId,
          version.id as AgentVersionId,
          created.conversation.id,
          created.session.id
        )
        await expect(
          runtime.completeInboundRuntime({
            tenantId,
            conversationId: created.conversation.id,
            sessionId: created.session.id,
            inboundMessageId: rollbackInbound.message.id,
            trace: rollbackTrace,
            toolAuditEvents: [],
            correlationId: createCorrelationId()
          })
        ).rejects.toThrow('Trace agent not found')
        await expect(
          client.query<{ count: string }>(
            `SELECT count(*)::text
             FROM messages
             WHERE external_message_id = $1`,
            [`runtime:${rollbackTrace.traceId}`]
          )
        ).resolves.toMatchObject({ rows: [{ count: '0' }] })
        await expect(
          client.query<{ count: string }>(
            `SELECT count(*)::text
             FROM platform_execution_traces
             WHERE trace_id = $1`,
            [rollbackTrace.traceId]
          )
        ).resolves.toMatchObject({ rows: [{ count: '0' }] })
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )

  itWithPostgres(
    'rejects a superuser runtime connection when RLS enforcement is requested',
    async () => {
      await expect(
        buildServerFromEnv(
          {
            NODE_ENV: 'production',
            API_PERSISTENCE_MODE: 'postgres',
            DATABASE_URL: testDatabaseUrl,
            INBOUND_TENANT_ID: postgresTenantA,
            INBOUND_AGENT_ID: postgresInboundAgent,
            POSTGRES_RLS_ENFORCEMENT: 'true',
            OUTBOX_DURABLE_INBOUND: 'true',
            API_ALLOWED_ORIGINS: 'https://console.example.test',
            API_REQUIRE_HTTPS: 'true',
            API_TRUSTED_PROXY_HOPS: '0',
            CVG_RATE_LIMIT_KEYRING: rateLimitKeyRingEnv
          },
          {
            webhookVerifier: () => true,
            operatorIdentityResolver: trustedProductionIdentity
          }
        )
      ).rejects.toThrow(/non-superuser without BYPASSRLS/)
    }
  )

  itWithPostgres(
    'validates tenant-scoped startup with separate migration and runtime roles',
    async () => {
      const admin = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_startup_${Date.now()}`
      const roleName = `cvg_runtime_${Date.now()}_${randomBytes(4).toString('hex')}`
      const password = randomBytes(18).toString('hex')
      const migrationRoleName = `cvg_migration_${Date.now()}_${randomBytes(4).toString('hex')}`
      const migrationPassword = randomBytes(18).toString('hex')
      const runtimeUrl = new URL(testDatabaseUrl as string)
      runtimeUrl.username = roleName
      runtimeUrl.password = password
      const migrationUrl = new URL(testDatabaseUrl as string)
      migrationUrl.username = migrationRoleName
      migrationUrl.password = migrationPassword
      let app: Awaited<ReturnType<typeof buildServerFromEnv>> | undefined
      // AUD19-005: the runtime role must hold SELECT/INSERT/UPDATE on every
      // tenant-scoped table in the canonical inventory (deployment
      // obligation); the fixture derives the list so it cannot drift.
      // webhook_replay_events keeps its own preflight branch (with DELETE).
      const protectedTables = [...TENANT_SCHEMA_TABLES, 'webhook_replay_events']
      const serverEnv = {
        NODE_ENV: 'production' as const,
        API_PERSISTENCE_MODE: 'postgres',
        DATABASE_URL: runtimeUrl.toString(),
        DATABASE_MIGRATION_URL: migrationUrl.toString(),
        INBOUND_TENANT_ID: postgresTenantA,
        INBOUND_AGENT_ID: postgresInboundAgent,
        POSTGRES_AUTO_MIGRATE: 'true',
        POSTGRES_RLS_ENFORCEMENT: 'true',
        OUTBOX_DURABLE_INBOUND: 'true',
        API_ALLOWED_ORIGINS: 'https://console.example.test',
        API_REQUIRE_HTTPS: 'true',
        API_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
        POSTGRES_SCHEMA: schemaName,
        CVG_RATE_LIMIT_KEYRING: rateLimitKeyRingEnv
      }

      await admin.connect()
      try {
        await admin.query(
          `CREATE ROLE ${roleName} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`
        )
        await admin.query(
          `CREATE ROLE ${migrationRoleName} LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION`
        )
        await admin.query(
          `CREATE SCHEMA ${schemaName} AUTHORIZATION ${migrationRoleName}`
        )
        const migrationClient = new Client({
          connectionString: migrationUrl.toString()
        })
        await migrationClient.connect()
        await runPostgresMigrations(migrationClient, {
          schemaName,
          createSchema: false
        })
        await migrationClient.end()
        await admin.query(`GRANT USAGE ON SCHEMA ${schemaName} TO ${roleName}`)
        for (const table of protectedTables) {
          await admin.query(
            `GRANT SELECT, INSERT, UPDATE ON ${schemaName}.${table} TO ${roleName}`
          )
        }
        await admin.query(
          `GRANT DELETE ON ${schemaName}.webhook_replay_events TO ${roleName}`
        )
        await expect(
          buildServerFromEnv(serverEnv, {
            webhookVerifier: () => true,
            operatorIdentityResolver: trustedProductionIdentity
          })
        ).rejects.toThrow('least-privilege')
        await admin.query(
          `GRANT SELECT, INSERT, UPDATE, DELETE ON ${schemaName}.rate_limit_buckets TO ${roleName}`
        )
        await admin.query(
          `ALTER ROLE ${roleName} SET search_path TO ${schemaName}`
        )

        app = await buildServerFromEnv(serverEnv, {
          webhookVerifier: () => true,
          operatorIdentityResolver: trustedProductionIdentity,
          operatorSessionStore: createInMemoryOperatorSessionStore()
        })
        const health = await app.inject({
          method: 'GET',
          url: '/health',
          headers: { 'x-forwarded-proto': 'https' }
        })
        expect(health.statusCode).toBe(200)
        const ordinary = await app.inject({
          method: 'GET',
          url: '/v1/conversations?limit=1',
          headers: { 'x-forwarded-proto': 'https' }
        })
        expect(ordinary.statusCode).toBe(200)
      } finally {
        await app?.close()
        await admin.query(`DROP OWNED BY ${roleName}`)
        await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await admin.query(`DROP ROLE IF EXISTS ${roleName}`)
        await admin.query(`DROP ROLE IF EXISTS ${migrationRoleName}`)
        await admin.end()
      }
    }
  )

  itWithPostgres(
    'rejects missing rate-limit table or index before PostgreSQL startup',
    async () => {
      const admin = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_rate_limit_preflight_${Date.now()}`
      await admin.connect()
      const env = {
        NODE_ENV: 'test' as const,
        API_PERSISTENCE_MODE: 'postgres',
        DATABASE_URL: testDatabaseUrl as string,
        POSTGRES_AUTO_MIGRATE: 'false',
        POSTGRES_SCHEMA: schemaName
      }

      try {
        await runPostgresMigrations(admin, { schemaName })
        await admin.query(
          `DROP INDEX ${schemaName}.idx_rate_limit_buckets_reset_at`
        )
        await expect(
          buildServerFromEnv(env, { webhookVerifier: () => true })
        ).rejects.toThrow(/rate-limit storage.*index/i)

        await admin.query(
          `CREATE INDEX idx_rate_limit_buckets_reset_at ON ${schemaName}.rate_limit_buckets (reset_at)`
        )
        await admin.query(`DROP TABLE ${schemaName}.rate_limit_buckets`)
        await expect(
          buildServerFromEnv(env, { webhookVerifier: () => true })
        ).rejects.toThrow(/rate-limit storage.*table/i)
      } finally {
        await admin.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await admin.end()
      }
    }
  )

  itWithPostgres(
    'runs inbound, timeline, task, approval and audit endpoints against PostgreSQL when configured',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_api_${Date.now()}`
      await client.connect()

      try {
        await runInitialPostgresMigration(client, { schemaName })
        const logs: Array<{
          event: string
          correlationId: string
          sessionId?: string | null
        }> = []
        const app = buildServer({
          persistence: { kind: 'postgres', client },
          runtimeLogger: (entry) => logs.push(entry)
        })

        const inbound = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/whatsapp/messages',
          payload: {
            externalMessageId: 'api-pg-msg-1',
            senderRef: 'fixture-sender',
            body: 'Mensagem ficticia em modo postgres',
            receivedAt: '2026-04-29T13:00:00-03:00'
          }
        })
        const inboundBody = inbound.json() as Envelope<{
          conversationId: string
          sessionId: string
          accepted: boolean
        }>
        const duplicate = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/whatsapp/messages',
          payload: {
            externalMessageId: 'api-pg-msg-1',
            senderRef: 'fixture-sender',
            body: 'Mensagem ficticia em modo postgres',
            receivedAt: '2026-04-29T13:00:00-03:00'
          }
        })
        const sameExternalMessageOtherChannel = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/web/messages',
          payload: {
            externalMessageId: 'api-pg-msg-1',
            senderRef: 'fixture-web-sender',
            body: 'Mensagem ficticia em outro canal',
            receivedAt: '2026-04-29T13:01:00-03:00'
          }
        })
        const conversationList = await app.inject({
          method: 'GET',
          url: '/v1/conversations?limit=10&offset=0',
          headers: {
            'x-operator-id': 'operator.postgres',
            'x-operator-role': 'Operator'
          }
        })
        const timeline = await app.inject({
          method: 'GET',
          url: `/v1/conversations/${inboundBody.data.conversationId}/timeline`,
          headers: {
            'x-operator-id': 'operator.postgres',
            'x-operator-role': 'Operator'
          }
        })
        const approval = await app.inject({
          method: 'POST',
          url: '/v1/approvals',
          payload: {
            sessionId: inboundBody.data.sessionId,
            proposedAction: 'create_appointment_draft',
            summary: 'Aprovacao ficticia em postgres',
            riskLevel: 'medium'
          }
        })
        const approvalBody = approval.json() as Envelope<{ id: string }>
        const decision = await app.inject({
          method: 'POST',
          url: `/v1/approvals/${approvalBody.data.id}/decision`,
          headers: {
            'x-operator-id': 'approver.postgres',
            'x-operator-role': 'Approver'
          },
          payload: { decision: 'approved' }
        })
        const task = await app.inject({
          method: 'POST',
          url: '/v1/tasks',
          payload: {
            sessionId: inboundBody.data.sessionId,
            title: 'Tarefa ficticia postgres',
            description: 'Validar modo postgres controlado',
            priority: 'high',
            source: 'postgres-mode-test',
            idempotencyKey: 'postgres-task-1'
          }
        })
        const taskBody = task.json() as Envelope<{ id: string; status: string }>
        const taskStatus = await app.inject({
          method: 'PATCH',
          url: `/v1/tasks/${taskBody.data.id}/status`,
          headers: {
            'x-operator-id': 'operator.postgres',
            'x-operator-role': 'Operator'
          },
          payload: { status: 'in_progress' }
        })
        const audit = await app.inject({
          method: 'GET',
          url: `/v1/audit/sessions/${inboundBody.data.sessionId}`,
          headers: {
            'x-operator-id': 'supervisor.postgres',
            'x-operator-role': 'Supervisor'
          }
        })
        const evidence = await app.inject({
          method: 'GET',
          url: `/v1/observability/audit-evidence?sessionId=${inboundBody.data.sessionId}`,
          headers: {
            'x-operator-id': 'supervisor.postgres',
            'x-operator-role': 'Supervisor'
          }
        })
        await app.close()

        expect(inboundBody.data.accepted).toBe(true)
        expect(
          (duplicate.json() as Envelope<{ accepted: boolean }>).data.accepted
        ).toBe(false)
        const otherChannelBody =
          sameExternalMessageOtherChannel.json() as Envelope<{
            accepted: boolean
            conversationId: string
          }>
        expect(otherChannelBody.data.accepted).toBe(true)
        expect(otherChannelBody.data.conversationId).not.toBe(
          inboundBody.data.conversationId
        )
        expect(
          (
            conversationList.json() as Envelope<{
              items: Array<{
                id: string
                openSessionId: string | null
                lastMessageBody: string | null
              }>
            }>
          ).data.items
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: otherChannelBody.data.conversationId,
              lastMessageBody: 'Mensagem ficticia em outro canal'
            }),
            expect.objectContaining({
              id: inboundBody.data.conversationId,
              openSessionId: inboundBody.data.sessionId,
              lastMessageBody: 'Mensagem ficticia em modo postgres'
            })
          ])
        )
        expect(
          (
            conversationList.json() as Envelope<{
              items: Array<{
                id: string
                openSessionId: string | null
                lastMessageBody: string | null
              }>
            }>
          ).data.items
        ).toHaveLength(2)
        expect(
          (timeline.json() as Envelope<{ messages: unknown[] }>).data.messages
        ).toHaveLength(1)
        expect(
          (decision.json() as Envelope<{ status: string }>).data.status
        ).toBe('approved')
        expect(taskBody.data.status).toBe('open')
        expect(
          (taskStatus.json() as Envelope<{ status: string }>).data.status
        ).toBe('in_progress')
        expect(
          (
            audit.json() as Envelope<{ events: Array<{ type: string }> }>
          ).data.events.map((event) => event.type)
        ).toContain('approval_decision')
        expect(
          (
            evidence.json() as Envelope<{
              summary: { totalEvents: number }
              export: { externalDispatch: boolean }
            }>
          ).data
        ).toMatchObject({
          summary: { totalEvents: expect.any(Number) },
          export: { externalDispatch: false }
        })
        expect(
          logs.every((entry) => entry.correlationId.startsWith('corr_'))
        ).toBe(true)
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )

  itWithPostgres(
    'keeps PostgreSQL inbound idempotency isolated by tenant',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_api_tenant_${Date.now()}`
      await client.connect()

      try {
        await runInitialPostgresMigration(client, { schemaName })
        const app = buildServer({
          persistence: { kind: 'postgres', client }
        })
        const input = {
          externalMessageId: 'same-postgres-external-id',
          senderRef: 'fixture-sender',
          body: 'Mensagem isolada por tenant',
          receivedAt: '2026-08-23T10:00:00-03:00'
        }
        const first = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/whatsapp/messages',
          headers: { 'x-tenant-id': postgresTenantA },
          payload: input
        })
        const duplicate = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/whatsapp/messages',
          headers: { 'x-tenant-id': postgresTenantA },
          payload: input
        })
        const otherTenant = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/whatsapp/messages',
          headers: { 'x-tenant-id': postgresTenantB },
          payload: input
        })
        const firstSessionId = first.json().data.sessionId as string
        const otherSessionId = otherTenant.json().data.sessionId as string
        await app.inject({
          method: 'POST',
          url: '/v1/tasks',
          headers: { 'x-tenant-id': postgresTenantA },
          payload: {
            sessionId: firstSessionId,
            title: 'Tarefa A',
            description: 'Escopo A',
            priority: 'medium',
            source: 'postgres-tenant-scope',
            idempotencyKey: 'postgres-tenant-task-a'
          }
        })
        await app.inject({
          method: 'POST',
          url: '/v1/tasks',
          headers: { 'x-tenant-id': postgresTenantB },
          payload: {
            sessionId: otherSessionId,
            title: 'Tarefa B',
            description: 'Escopo B',
            priority: 'medium',
            source: 'postgres-tenant-scope',
            idempotencyKey: 'postgres-tenant-task-b'
          }
        })
        await app.inject({
          method: 'POST',
          url: '/v1/approvals',
          headers: { 'x-tenant-id': postgresTenantA },
          payload: {
            sessionId: firstSessionId,
            proposedAction: 'create_appointment_draft',
            summary: 'Aprovação A',
            riskLevel: 'medium'
          }
        })
        await app.inject({
          method: 'POST',
          url: '/v1/approvals',
          headers: { 'x-tenant-id': postgresTenantB },
          payload: {
            sessionId: otherSessionId,
            proposedAction: 'create_appointment_draft',
            summary: 'Aprovação B',
            riskLevel: 'medium'
          }
        })
        const tasksA = await app.inject({
          method: 'GET',
          url: '/v1/tasks',
          headers: {
            'x-operator-id': 'supervisor.pg-a',
            'x-operator-role': 'Supervisor',
            'x-tenant-id': postgresTenantA
          }
        })
        const tasksB = await app.inject({
          method: 'GET',
          url: '/v1/tasks',
          headers: {
            'x-operator-id': 'supervisor.pg-b',
            'x-operator-role': 'Supervisor',
            'x-tenant-id': postgresTenantB
          }
        })
        const approvalsA = await app.inject({
          method: 'GET',
          url: '/v1/approvals',
          headers: {
            'x-operator-id': 'supervisor.pg-a',
            'x-operator-role': 'Supervisor',
            'x-tenant-id': postgresTenantA
          }
        })
        const approvalsB = await app.inject({
          method: 'GET',
          url: '/v1/approvals',
          headers: {
            'x-operator-id': 'supervisor.pg-b',
            'x-operator-role': 'Supervisor',
            'x-tenant-id': postgresTenantB
          }
        })
        const crossTenantAudit = await app.inject({
          method: 'GET',
          url: `/v1/audit/sessions/${firstSessionId}`,
          headers: {
            'x-operator-id': 'supervisor.pg-b',
            'x-operator-role': 'Supervisor',
            'x-tenant-id': postgresTenantB
          }
        })
        await app.close()

        expect(first.statusCode).toBe(200)
        expect(first.json().data.accepted).toBe(true)
        expect(duplicate.statusCode).toBe(200)
        expect(duplicate.json().data.accepted).toBe(false)
        expect(otherTenant.statusCode).toBe(200)
        expect(otherTenant.json().data.accepted).toBe(true)
        expect(tasksA.json().data).toHaveLength(1)
        expect(tasksB.json().data).toHaveLength(1)
        expect(approvalsA.json().data).toHaveLength(1)
        expect(approvalsB.json().data).toHaveLength(1)
        expect(crossTenantAudit.statusCode).toBe(400)
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )

  itWithPostgres(
    'keeps human takeover and session continuation fail-closed on PostgreSQL',
    async () => {
      const client = new Client({ connectionString: testDatabaseUrl })
      const schemaName = `cvg_api_handoff_${Date.now()}`
      await client.connect()

      try {
        await runInitialPostgresMigration(client, { schemaName })
        const platform = new InMemoryControlPlaneStore()
        const agent = await createPostgresHandoffAgent(
          platform,
          postgresTenantA
        )
        const app = buildServer({
          persistence: { kind: 'postgres', client },
          platform,
          agentRuntime: {
            resolveAgentId: () => agent.id,
            approvedKnowledge: {
              version: 'postgres-knowledge-v1',
              answer: 'Endereço fictício PostgreSQL.',
              source: 'controlled://postgres-test'
            }
          }
        })
        const inboundHeaders = { 'x-tenant-id': postgresTenantA }
        const operatorHeaders = {
          'x-operator-id': 'supervisor.pg-handoff',
          'x-operator-role': 'Supervisor',
          'x-tenant-id': postgresTenantA
        }
        const first = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/web/messages',
          headers: inboundHeaders,
          payload: {
            externalMessageId: 'pg-handoff-1',
            senderRef: 'fixture-sender',
            body: 'Olá',
            receivedAt: '2026-08-23T10:00:00-03:00'
          }
        })
        const firstData = first.json().data as {
          conversationId: string
          sessionId: string
        }
        const accepted = await app.inject({
          method: 'POST',
          url: `/v1/sessions/${firstData.sessionId}/takeover`,
          headers: operatorHeaders,
          payload: { event: 'accept_handoff' }
        })
        const paused = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/web/messages',
          headers: inboundHeaders,
          payload: {
            externalMessageId: 'pg-handoff-2',
            senderRef: 'fixture-sender',
            body: 'Aguardo o atendimento humano',
            conversationId: firstData.conversationId,
            sessionId: firstData.sessionId,
            receivedAt: '2026-08-23T10:01:00-03:00'
          }
        })
        await app.inject({
          method: 'POST',
          url: `/v1/sessions/${firstData.sessionId}/takeover`,
          headers: operatorHeaders,
          payload: { event: 'resolve_handoff' }
        })
        const released = await app.inject({
          method: 'POST',
          url: `/v1/sessions/${firstData.sessionId}/takeover`,
          headers: operatorHeaders,
          payload: { event: 'release_to_bot' }
        })
        const resumed = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/web/messages',
          headers: inboundHeaders,
          payload: {
            externalMessageId: 'pg-handoff-3',
            senderRef: 'fixture-sender',
            body: 'Qual endereço?',
            conversationId: firstData.conversationId,
            sessionId: firstData.sessionId,
            receivedAt: '2026-08-23T10:02:00-03:00'
          }
        })
        const timeline = await app.inject({
          method: 'GET',
          url: `/v1/conversations/${firstData.conversationId}/timeline`,
          headers: operatorHeaders
        })
        await app.close()

        expect(first.statusCode).toBe(200)
        expect(accepted.statusCode).toBe(200)
        expect(paused.json().data.runtime).toMatchObject({
          status: 'paused',
          reason: 'human_takeover_active',
          trace: null
        })
        expect(released.statusCode).toBe(200)
        expect(resumed.json().data.runtime).toMatchObject({
          status: 'completed',
          trace: { response: { text: 'Endereço fictício PostgreSQL.' } }
        })
        expect(timeline.json().data).toMatchObject({
          messages: expect.arrayContaining([
            expect.objectContaining({ externalMessageId: 'pg-handoff-3' })
          ]),
          sessions: [expect.objectContaining({ takeoverState: 'BOT_ACTIVE' })]
        })
      } finally {
        await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
        await client.end()
      }
    }
  )
})

// SPEC 0158: boot must reject catalog drift as the actual serving role.
// This file is in the repository's standard test:postgres selection.
async function withServingReplaySchema(
  run: (fixture: {
    admin: Client
    schema: string
    store: PostgresWebhookReplayStore
    assertBootRejected: () => Promise<void>
  }) => Promise<void>
): Promise<void> {
  if (!testDatabaseUrl) throw new Error('TEST_DATABASE_URL required')
  const suffix = randomBytes(6).toString('hex')
  const schema = `cvg_f02_boot_${suffix}`
  const runtimeRole = `cvg_f02_runtime_${suffix}`
  const migrationRole = `cvg_f02_migration_${suffix}`
  const runtimePassword = randomBytes(18).toString('hex')
  const migrationPassword = randomBytes(18).toString('hex')
  const runtimeUrl = new URL(testDatabaseUrl)
  runtimeUrl.username = runtimeRole
  runtimeUrl.password = runtimePassword
  const migrationUrl = new URL(testDatabaseUrl)
  migrationUrl.username = migrationRole
  migrationUrl.password = migrationPassword
  const admin = new Client({ connectionString: testDatabaseUrl })
  let runtimeClient: Client | undefined
  let runtimeCreated = false
  let migrationCreated = false
  await admin.connect()
  try {
    await admin.query(
      `CREATE ROLE ${runtimeRole} LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
    )
    runtimeCreated = true
    await admin.query(
      `CREATE ROLE ${migrationRole} LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`
    )
    migrationCreated = true
    await admin.query(`CREATE SCHEMA ${schema} AUTHORIZATION ${migrationRole}`)
    const migrationClient = new Client({
      connectionString: migrationUrl.toString()
    })
    await migrationClient.connect()
    try {
      await runPostgresMigrations(migrationClient, {
        schemaName: schema,
        createSchema: false
      })
    } finally {
      await migrationClient.end()
    }
    await admin.query(`GRANT USAGE ON SCHEMA ${schema} TO ${runtimeRole}`)
    for (const table of [...TENANT_SCHEMA_TABLES, 'webhook_replay_events']) {
      await admin.query(
        `GRANT SELECT, INSERT, UPDATE ON ${schema}.${table} TO ${runtimeRole}`
      )
    }
    await admin.query(
      `GRANT DELETE ON ${schema}.webhook_replay_events TO ${runtimeRole}`
    )
    await admin.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${schema}.rate_limit_buckets TO ${runtimeRole}`
    )
    await admin.query(`ALTER ROLE ${runtimeRole} SET search_path TO ${schema}`)
    await admin.query(`SET search_path TO ${schema}`)

    runtimeClient = new Client({ connectionString: runtimeUrl.toString() })
    await runtimeClient.connect()
    const runtimeSchema = await runtimeClient.query<{
      current_schema: string
      role_name: string
    }>('SELECT current_schema(), current_user AS role_name')
    expect(runtimeSchema.rows[0]?.current_schema).toBe(schema)
    expect(runtimeSchema.rows[0]?.role_name).toBe(runtimeRole)
    const pool = {
      connect: async () => ({
        query: runtimeClient!.query.bind(runtimeClient),
        release: () => undefined
      })
    } as unknown as PostgresPoolLike
    const store = new PostgresWebhookReplayStore(pool)
    const env = {
      NODE_ENV: 'production',
      API_PERSISTENCE_MODE: 'postgres',
      DATABASE_URL: runtimeUrl.toString(),
      DATABASE_MIGRATION_URL: migrationUrl.toString(),
      INBOUND_TENANT_ID: postgresTenantA,
      INBOUND_AGENT_ID: postgresInboundAgent,
      POSTGRES_AUTO_MIGRATE: 'false',
      POSTGRES_RLS_ENFORCEMENT: 'true',
      OUTBOX_DURABLE_INBOUND: 'true',
      API_ALLOWED_ORIGINS: 'https://console.example.test',
      API_REQUIRE_HTTPS: 'true',
      API_TRUSTED_PROXY_ADDRESSES: '127.0.0.1',
      POSTGRES_SCHEMA: schema,
      CVG_RATE_LIMIT_KEYRING: rateLimitKeyRingEnv
    }
    const assertBootRejected = async () => {
      let app: Awaited<ReturnType<typeof buildServerFromEnv>> | undefined
      try {
        app = await buildServerFromEnv(env, {
          webhookVerifier: () => true,
          operatorIdentityResolver: trustedProductionIdentity,
          operatorSessionStore: createInMemoryOperatorSessionStore()
        })
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain(
          'webhook replay storage is not fully installed'
        )
        return
      } finally {
        await app?.close()
      }
      throw new Error(
        'PostgreSQL serving boot accepted a degraded replay catalog'
      )
    }
    await run({ admin, schema, store, assertBootRejected })
  } finally {
    await runtimeClient?.end()
    await admin.query(`DROP SCHEMA IF EXISTS ${schema}_other CASCADE`)
    if (runtimeCreated) await admin.query(`DROP OWNED BY ${runtimeRole}`)
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    if (runtimeCreated) await admin.query(`DROP ROLE ${runtimeRole}`)
    if (migrationCreated) await admin.query(`DROP ROLE ${migrationRole}`)
    await admin.end()
  }
}

describe('SPEC 0158 serving-role webhook replay preflight', () => {
  const itWithPostgres = testDatabaseUrl ? it : it.skip
  const expiresAt = () => Date.now() + 60_000
  async function assertBaselineStore(store: PostgresWebhookReplayStore) {
    const reservation = await store.reserve(
      `synthetic:baseline:${randomBytes(4).toString('hex')}`,
      expiresAt()
    )
    expect(reservation).not.toBe(false)
    if (!reservation) throw new Error('baseline reserve failed')
    await expect(store.commit(reservation)).resolves.toBe(true)
  }

  const mutations = [
    [
      'fencing constraint moved to another table',
      `ALTER TABLE webhook_replay_events DROP CONSTRAINT webhook_replay_events_fencing_check; CREATE TABLE decoy_fencing (key text, CONSTRAINT webhook_replay_events_fencing_check CHECK (true))`
    ],
    [
      'fencing CHECK replaced by true',
      `ALTER TABLE webhook_replay_events DROP CONSTRAINT webhook_replay_events_fencing_check; ALTER TABLE webhook_replay_events ADD CONSTRAINT webhook_replay_events_fencing_check CHECK (true)`
    ],
    [
      'generation CHECK becomes permissive',
      `ALTER TABLE webhook_replay_events DROP CONSTRAINT webhook_replay_events_lease_generation_check; ALTER TABLE webhook_replay_events ADD CONSTRAINT webhook_replay_events_lease_generation_check CHECK (lease_generation >= -1)`
    ],
    [
      'fencing CHECK is NOT VALID',
      `ALTER TABLE webhook_replay_events DROP CONSTRAINT webhook_replay_events_fencing_check; ALTER TABLE webhook_replay_events ADD CONSTRAINT webhook_replay_events_fencing_check CHECK (status = 'reserved' AND lease_generation > 0 AND lease_token IS NOT NULL AND btrim(lease_token) <> '' OR status = 'committed' AND lease_token IS NULL) NOT VALID`
    ],
    [
      'event key CHECK becomes permissive',
      `ALTER TABLE webhook_replay_events DROP CONSTRAINT webhook_replay_events_event_key_check; ALTER TABLE webhook_replay_events ADD CONSTRAINT webhook_replay_events_event_key_check CHECK (true)`
    ],
    [
      'status CHECK becomes permissive',
      `ALTER TABLE webhook_replay_events DROP CONSTRAINT webhook_replay_events_status_check; ALTER TABLE webhook_replay_events ADD CONSTRAINT webhook_replay_events_status_check CHECK (true)`
    ],
    [
      'created_at becomes nullable',
      `ALTER TABLE webhook_replay_events ALTER COLUMN created_at DROP NOT NULL`
    ],
    [
      'created_at default disappears',
      `ALTER TABLE webhook_replay_events ALTER COLUMN created_at DROP DEFAULT`
    ],
    [
      'lease_generation becomes nullable',
      `ALTER TABLE webhook_replay_events ALTER COLUMN lease_generation DROP NOT NULL`
    ],
    [
      'lease_generation default disappears',
      `ALTER TABLE webhook_replay_events ALTER COLUMN lease_generation DROP DEFAULT`
    ],
    [
      'lease token type changes',
      `ALTER TABLE webhook_replay_events ALTER COLUMN lease_token TYPE varchar(200)`
    ],
    [
      'unexpected NOT NULL column blocks reservations',
      `ALTER TABLE webhook_replay_events ADD COLUMN unexpected text NOT NULL`
    ],
    [
      'PK becomes deferrable',
      `ALTER TABLE webhook_replay_events DROP CONSTRAINT webhook_replay_events_pkey; ALTER TABLE webhook_replay_events ADD CONSTRAINT webhook_replay_events_pkey PRIMARY KEY (event_key) DEFERRABLE`
    ],
    [
      'table becomes unlogged',
      `ALTER TABLE webhook_replay_events SET UNLOGGED`
    ],
    [
      'table inherits another table',
      `CREATE TABLE replay_parent (); ALTER TABLE webhook_replay_events INHERIT replay_parent`
    ],
    [
      'expiry index is on the wrong column',
      `DROP INDEX idx_webhook_replay_events_expires; CREATE INDEX idx_webhook_replay_events_expires ON webhook_replay_events (created_at)`
    ],
    [
      'expiry index has a predicate',
      `DROP INDEX idx_webhook_replay_events_expires; CREATE INDEX idx_webhook_replay_events_expires ON webhook_replay_events (expires_at) WHERE status = 'reserved'`
    ],
    [
      'expiry index is unique',
      `DROP INDEX idx_webhook_replay_events_expires; CREATE UNIQUE INDEX idx_webhook_replay_events_expires ON webhook_replay_events (expires_at)`
    ],
    [
      'extra unique index changes replay writes',
      `CREATE UNIQUE INDEX replay_status_unique ON webhook_replay_events (status)`
    ],
    [
      'expiry index name exists on another table',
      `DROP INDEX idx_webhook_replay_events_expires; CREATE TABLE decoy_index (expires_at timestamptz); CREATE INDEX idx_webhook_replay_events_expires ON decoy_index (expires_at)`
    ],
    [
      'user trigger suppresses reservation',
      `CREATE FUNCTION suppress_replay() RETURNS trigger LANGUAGE plpgsql AS 'BEGIN RETURN NULL; END'; CREATE TRIGGER suppress_replay BEFORE INSERT ON webhook_replay_events FOR EACH ROW EXECUTE FUNCTION suppress_replay()`
    ],
    [
      'rewrite rule suppresses reservation',
      `CREATE RULE suppress_replay AS ON INSERT TO webhook_replay_events DO INSTEAD NOTHING`
    ],
    [
      'cross-schema FK references replay state',
      `CREATE SCHEMA __OTHER_SCHEMA__; CREATE TABLE __OTHER_SCHEMA__.reference (event_key text REFERENCES webhook_replay_events(event_key))`
    ],
    [
      'RLS policy is installed',
      `CREATE POLICY replay_policy ON webhook_replay_events USING (true)`
    ]
  ] as const

  itWithPostgres.each(mutations)(
    'blocks serving boot after %s',
    async (label, mutation) => {
      await withServingReplaySchema(
        async ({ admin, schema, store, assertBootRejected }) => {
          if (label.includes('suppress') || label.includes('cross-schema FK')) {
            await assertBaselineStore(store)
          }
          await admin.query(
            mutation.replaceAll('__OTHER_SCHEMA__', `${schema}_other`)
          )
          if (label === 'user trigger suppresses reservation') {
            await expect(
              store.reserve('synthetic:trigger', expiresAt())
            ).resolves.toBe(false)
          }
          if (label === 'rewrite rule suppresses reservation') {
            await expect(
              store.reserve('synthetic:rule', expiresAt())
            ).rejects.toThrow(/INSERT RETURNING/)
          }
          if (label === 'cross-schema FK references replay state') {
            await admin.query(`INSERT INTO webhook_replay_events
          (event_key, status, expires_at, lease_generation)
          VALUES ('synthetic:expired-fk', 'committed', now() - interval '1 minute', 1)`)
            await admin.query(
              `INSERT INTO ${schema}_other.reference (event_key) VALUES ('synthetic:expired-fk')`
            )
            await expect(
              store.reserve('synthetic:fk', expiresAt())
            ).rejects.toThrow(/foreign key/)
          }
          await assertBootRejected()
        }
      )
    }
  )

  itWithPostgres(
    'blocks an invalid expiry index left by a failed concurrent build',
    async () => {
      await withServingReplaySchema(
        async ({ admin, schema, assertBootRejected }) => {
          await admin.query(`INSERT INTO webhook_replay_events
        (event_key, status, expires_at, lease_generation)
        VALUES ('synthetic:one', 'committed', now() + interval '1 minute', 1),
               ('synthetic:two', 'committed', now() + interval '1 minute', 1)`)
          await admin.query('DROP INDEX idx_webhook_replay_events_expires')
          await expect(
            admin.query(
              'CREATE UNIQUE INDEX CONCURRENTLY idx_webhook_replay_events_expires ON webhook_replay_events (expires_at)'
            )
          ).rejects.toThrow()
          const index = await admin.query<{ indisvalid: boolean }>(
            `SELECT i.indisvalid FROM pg_index AS i
         JOIN pg_class AS c ON c.oid = i.indexrelid
         JOIN pg_namespace AS n ON n.oid = c.relnamespace
         WHERE n.nspname = $1 AND c.relname = 'idx_webhook_replay_events_expires'`,
            [schema]
          )
          expect(index.rows).toEqual([{ indisvalid: false }])
          await assertBootRejected()
        }
      )
    }
  )

  itWithPostgres(
    'blocks a CHECK bound to an application function',
    async () => {
      await withServingReplaySchema(
        async ({ admin, schema, assertBootRejected }) => {
          await admin.query(`CREATE FUNCTION ${schema}.btrim(text) RETURNS text
        LANGUAGE sql IMMUTABLE AS 'SELECT ''x''::text';
        ALTER TABLE webhook_replay_events DROP CONSTRAINT webhook_replay_events_event_key_check;
        ALTER TABLE webhook_replay_events ADD CONSTRAINT webhook_replay_events_event_key_check
          CHECK (${schema}.btrim(event_key) <> '')`)
          const catalog = await admin.query<{ definition: string }>(
            `SELECT pg_get_constraintdef(oid, true) AS definition FROM pg_constraint
         WHERE conrelid = 'webhook_replay_events'::regclass
           AND conname = 'webhook_replay_events_event_key_check'`
          )
          expect(catalog.rows[0]?.definition).toContain(`${schema}.btrim`)
          await assertBootRejected()
        }
      )
    }
  )
})
