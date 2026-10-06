import { createHash, randomBytes } from 'node:crypto'
import { Client, type QueryResult, type QueryResultRow } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  assertTenantIsolationSchema,
  assertTenantIsolationMigrationState,
  assertMigrationRoleIsLeastPrivilege,
  assertMigrationRoleSecurityBoundary,
  assertRuntimeRoleIsLeastPrivilege,
  assertWebhookReplaySchema,
  buildServer,
  buildServerFromEnv
} from '../server.ts'
import {
  runInitialPostgresMigration,
  readPostgresMigrationSql,
  runPostgresMigrations,
  PostgresControlPlaneRepository,
  TenantScopedPostgresRuntimeRepository,
  type PostgresPoolLike,
  type PostgresQueryable
} from '@cvg/persistence'
import {
  AgentConfigSchema,
  InMemoryControlPlaneStore,
  createTraceId,
  type AgentId,
  type AgentVersionId,
  type TestRunTrace,
  type TenantId
} from '@cvg/platform'
import { createCorrelationId } from '@cvg/shared'
import { PostgresWebhookReplayStore } from '../webhook-security.ts'

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
  await platform.publishVersion({ tenantId }, approved.id)
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
      '0002_capability_approvals'
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
      '0002_capability_approvals'
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
          !text.includes("c.relname = 'tenant_isolation_quarantine'")
        ) {
          const relationNames = (values?.[0] as string[] | undefined) ?? []
          return queryResult(
            relationNames.map(() => ({
              owner: 'migration_user',
              can_select: true,
              can_insert: true,
              can_update: true,
              can_delete: relationNames.includes('webhook_replay_events'),
              can_truncate: false,
              can_trigger: false,
              can_references: false
            }))
          ) as unknown as QueryResult<T>
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
        if (text.includes('FROM pg_class')) {
          return queryResult(
            names.map((relname) => ({
              relname,
              relrowsecurity: true,
              relforcerowsecurity: true
            }))
          ) as unknown as QueryResult<T>
        }
        if (text.includes('information_schema.columns')) {
          return queryResult(
            names.flatMap((table_name) => [
              { table_name, column_name: 'tenant_id' },
              { table_name, column_name: 'tenant_isolation_quarantined' }
            ])
          ) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_constraint')) {
          return queryResult(
            names.map((conname) => ({ conname }))
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
            qual: "tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')",
            with_check:
              "tenant_isolation_quarantined = false AND tenant_id = NULLIF(current_setting('cvg.tenant_id', true), '')"
          }))
        ) as unknown as QueryResult<T>
      }
    }

    await expect(assertTenantIsolationSchema(client)).resolves.toBeUndefined()
  })

  it('requires the complete durable webhook replay catalog contract', async () => {
    const catalogClient = (relkind: string): PostgresQueryable => ({
      async query<T extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: unknown[]
      ): Promise<QueryResult<T>> {
        const names = (values?.[0] as string[] | undefined) ?? []
        if (text.includes('FROM pg_class')) {
          return queryResult([
            { relname: 'webhook_replay_events', relkind }
          ]) as unknown as QueryResult<T>
        }
        if (text.includes('information_schema.columns')) {
          return queryResult([
            { table_name: 'webhook_replay_events', column_name: 'event_key' },
            { table_name: 'webhook_replay_events', column_name: 'status' },
            {
              table_name: 'webhook_replay_events',
              column_name: 'expires_at'
            }
          ]) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_constraint')) {
          return queryResult(
            names.map((conname) => ({ conname }))
          ) as unknown as QueryResult<T>
        }
        if (text.includes('FROM pg_indexes')) {
          return queryResult(
            names.map((indexname) => ({ indexname }))
          ) as unknown as QueryResult<T>
        }
        return queryResult([]) as unknown as QueryResult<T>
      }
    })

    await expect(assertWebhookReplaySchema(catalogClient('r'))).resolves.toBe(
      undefined
    )
    await expect(assertWebhookReplaySchema(catalogClient('v'))).rejects.toThrow(
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
          POSTGRES_RLS_ENFORCEMENT: 'true'
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
        POSTGRES_RLS_ENFORCEMENT: 'true'
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
            event_key text PRIMARY KEY,
            status text NOT NULL CHECK (status IN ('reserved', 'committed')),
            expires_at timestamptz NOT NULL,
            created_at timestamptz NOT NULL DEFAULT now()
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

        await expect(store.reserve(eventKey, expiresAt)).resolves.toBe(true)
        await expect(store.reserve(eventKey, expiresAt)).resolves.toBe(false)
        await expect(store.release(eventKey)).resolves.toBe(true)
        await expect(store.reserve(eventKey, expiresAt)).resolves.toBe(true)
        await expect(store.commit(eventKey)).resolves.toBe(true)
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
            POSTGRES_RLS_ENFORCEMENT: 'true'
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
      const protectedTables = [
        'conversations',
        'messages',
        'sessions',
        'agent_runs',
        'tool_calls',
        'approval_requests',
        'tasks',
        'audit_events',
        'idempotency',
        'outbox_events',
        'platform_agents',
        'platform_agent_versions',
        'platform_test_runs',
        'platform_execution_traces',
        'platform_capability_approvals',
        'webhook_replay_events'
      ]

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
        await admin.query(
          `ALTER ROLE ${roleName} SET search_path TO ${schemaName}`
        )

        app = await buildServerFromEnv(
          {
            NODE_ENV: 'production',
            API_PERSISTENCE_MODE: 'postgres',
            DATABASE_URL: runtimeUrl.toString(),
            DATABASE_MIGRATION_URL: migrationUrl.toString(),
            INBOUND_TENANT_ID: postgresTenantA,
            INBOUND_AGENT_ID: postgresInboundAgent,
            POSTGRES_AUTO_MIGRATE: 'true',
            POSTGRES_RLS_ENFORCEMENT: 'true',
            POSTGRES_SCHEMA: schemaName
          },
          {
            webhookVerifier: () => true,
            operatorIdentityResolver: trustedProductionIdentity
          }
        )
        const health = await app.inject({ method: 'GET', url: '/health' })
        expect(health.statusCode).toBe(200)
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
