import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { describe, expect, it } from 'vitest'
import {
  readPostgresMigrationSql,
  runPostgresMigrations,
  TenantScopedPostgresControlPlaneRepository
} from '@cvg/persistence'
import {
  ensureControlledAgentPreset,
  createControlledReferencePreset
} from '@cvg/platform'
import { buildServer } from '../../../api/src/server.ts'
import { createPostgresControlledWorker } from '../postgres-controlled.ts'

const testDatabaseUrl = process.env.TEST_DATABASE_URL
const tenantId = 'tenant_00000000-0000-4000-8000-000000000173'

describe('API to PostgreSQL worker outbox bridge', () => {
  const itWithPostgres = testDatabaseUrl ? it : it.skip

  itWithPostgres(
    'consumes the event written by the API through a separate worker pool',
    async () => {
      const databaseUrl = testDatabaseUrl as string
      const schemaName = `cvg_worker_bridge_${Date.now()}_${randomBytes(3).toString('hex')}`
      const migrationClient = new Client({ connectionString: databaseUrl })
      const apiPool = new Pool({
        connectionString: databaseUrl,
        options: `-c search_path=${schemaName}`
      })
      let app: Awaited<ReturnType<typeof buildServer>> | undefined
      let worker: ReturnType<typeof createPostgresControlledWorker> | undefined

      await migrationClient.connect()
      try {
        await runPostgresMigrations(migrationClient, { schemaName })
        const platform = new TenantScopedPostgresControlPlaneRepository(apiPool)
        const agent = await ensureControlledAgentPreset(
          platform,
          createControlledReferencePreset(),
          tenantId
        )
        app = buildServer({
          persistence: { kind: 'postgres-pool', pool: apiPool },
          durableInbound: true,
          inboundTenantResolver: () => tenantId
        })
        const response = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/channels/web/messages',
          payload: {
            senderRef: 'synthetic-worker-bridge-173',
            externalMessageId: 'worker-bridge-173',
            body: 'Mensagem fictícia de integração controlada',
            receivedAt: '2026-09-05T12:00:00.000Z'
          }
        })
        expect(response.statusCode).toBe(200)
        const payload = response.json<{
          data: {
            outbox: {
              id: string
              status: string
              conversationId: string
              sessionId: string
              inboundMessageId: string
            }
          }
        }>()
        expect(payload.data.outbox.status).toBe('pending')

        worker = createPostgresControlledWorker({
          DATABASE_URL: databaseUrl,
          POSTGRES_SCHEMA: schemaName,
          POSTGRES_RLS_ENFORCEMENT: 'true',
          CVG_WORKER_CONTROLLED_MODE: 'true',
          CVG_WORKER_TENANT_ID: tenantId,
          CVG_WORKER_ID: 'worker-bridge-173',
          CVG_WORKER_AGENT_ID: agent.id
        })
        const processed = await worker.worker.processNext()
        expect(processed).toMatchObject({
          id: payload.data.outbox.id,
          type: 'inbound.process',
          status: 'processed'
        })
        const context = await worker.adapter.findInboundRuntimeContext(
          tenantId,
          payload.data.outbox.conversationId,
          payload.data.outbox.sessionId,
          payload.data.outbox.inboundMessageId
        )
        expect(context?.message.runtimeStatus).toBe('completed')
      } finally {
        await app?.close()
        await worker?.pool.end()
        await apiPool.end()
        await migrationClient
          .query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
          .catch(() => undefined)
        await migrationClient.end()
      }
    }
  )

  it('keeps the bridge migration source available to the worker package', async () => {
    const migration = await readPostgresMigrationSql(
      '0011_outbox_payload_redaction'
    )
    expect(migration).toContain('payload_protection_version')
  })
})
