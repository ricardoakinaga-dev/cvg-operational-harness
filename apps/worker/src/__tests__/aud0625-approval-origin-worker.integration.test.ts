import { randomBytes } from 'node:crypto'
import { Client, Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runPostgresMigrations } from '@cvg/persistence'
import { buildServer } from '../../../api/src/server.ts'
import {
  CONTROLLED_KERNEL_EFFECT_SCOPES,
  KERNEL_WORKER_RUNTIME,
  createPostgresKernelHandlers,
  createPostgresKernelRuntime,
  type PostgresKernelRuntime
} from '../kernel-composition.ts'
import { createPostgresControlledWorker } from '../postgres-controlled.ts'

// SPEC 0291 AP09: the production worker (CVG_WORKER_RUNTIME=kernel) runs GovernedAgentRuntime
// with the approvalId of the message envelope and no executionRef. An approval asked in one
// conversation must not execute from a message of another conversation.
const url = process.env.TEST_DATABASE_URL
const TENANT = 'tenant_00000000-0000-4000-8000-000000000b91'
const AGENT = 'agent_00000000-0000-4000-8000-000000000b91'

interface Inbound {
  data: {
    conversationId: string
    sessionId: string
    correlationId?: string
    outbox: { id: string }
  }
}

describe('SPEC 0291 AP09: approval origin at the kernel worker (PostgreSQL)', () => {
  const itWithPostgres = url ? it : it.skip
  let schemaName: string
  let migrationClient: Client
  let apiPool: Pool
  let kernelPool: Pool
  let app: ReturnType<typeof buildServer> | undefined
  let runtime: PostgresKernelRuntime
  let worker: ReturnType<typeof createPostgresControlledWorker>

  const env = (): NodeJS.ProcessEnv => ({
    DATABASE_URL: url as string,
    POSTGRES_SCHEMA: schemaName,
    POSTGRES_RLS_ENFORCEMENT: 'true',
    CVG_WORKER_CONTROLLED_MODE: 'true',
    CVG_WORKER_TENANT_ID: TENANT,
    CVG_WORKER_AGENT_ID: AGENT,
    CVG_WORKER_RUNTIME: KERNEL_WORKER_RUNTIME,
    CVG_WORKER_ID: 'worker-origin'
  })
  const envelope = (overrides: Record<string, unknown> = {}): string =>
    JSON.stringify({
      cvgTurn: {
        capability: 'record.update',
        action: 'record.update',
        resource: { type: 'record_draft', id: 'draft_origin' },
        dataClassification: 'INTERNAL',
        operatorId: 'op_synthetic_kernel',
        operatorRole: 'Operator',
        agentVersion: 'synthetic-v1',
        agentProfile: 'assistant',
        modelProfile: 'fast',
        message: 'synthetic controlled record draft update',
        idempotencyKey: 'kernel-op-origin',
        ...overrides
      }
    })
  async function inject(input: {
    id: string
    body: string
    conversationId?: string
    sessionId?: string
  }): Promise<Inbound> {
    const response = await app!.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        senderRef: 'synthetic-origin-sender',
        externalMessageId: input.id,
        body: input.body,
        receivedAt: '2026-09-13T12:00:00.000Z',
        ...(input.conversationId !== undefined
          ? { conversationId: input.conversationId }
          : {}),
        ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {})
      }
    })
    expect(response.statusCode).toBe(200)
    return response.json<Inbound>()
  }

  beforeAll(async () => {
    if (!url) return
    schemaName = `cvg_origin_${Date.now()}_${randomBytes(3).toString('hex')}`
    migrationClient = new Client({ connectionString: url })
    await migrationClient.connect()
    await runPostgresMigrations(migrationClient, { schemaName })
    const options = {
      connectionString: url,
      options: `-c search_path=${schemaName}`
    }
    apiPool = new Pool(options)
    kernelPool = new Pool(options)
    app = buildServer({
      persistence: { kind: 'postgres-pool', pool: apiPool },
      durableInbound: true,
      inboundTenantResolver: () => TENANT
    })
    runtime = createPostgresKernelRuntime({
      pool: kernelPool,
      tenantId: TENANT as never,
      env: env(),
      agentId: AGENT as never
    })
    worker = createPostgresControlledWorker(
      env(),
      createPostgresKernelHandlers(env(), runtime)
    )
    await runtime.preflight()
  }, 120_000)

  afterAll(async () => {
    await app?.close()
    await worker?.pool.end()
    await kernelPool?.end()
    await apiPool?.end()
    await migrationClient
      ?.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      .catch(() => undefined)
    await migrationClient?.end().catch(() => undefined)
  })

  itWithPostgres(
    'an approval asked in conversation A is denied from a message of conversation B, and still runs once in A',
    async () => {
      const asked = await inject({ id: 'origin-a-1', body: envelope() })
      await worker.worker.processNext(asked.data.outbox.id)
      const requested = await runtime.approvals.list(TENANT, 'REQUESTED')
      expect(requested).toHaveLength(1)
      const approval = requested[0]!
      expect(approval.origin).toMatchObject({
        conversationId: asked.data.conversationId,
        sessionId: asked.data.sessionId
      })
      await runtime.approvals.submit(
        TENANT,
        approval.approvalId,
        'op_synthetic_kernel'
      )
      await runtime.approvals.approve(TENANT, approval.approvalId, {
        approverId: 'op_synthetic_approver'
      })

      // A message of another conversation carries the same approvalId.
      const elsewhere = await inject({
        id: 'origin-b-1',
        body: envelope({ approvalId: approval.approvalId })
      })
      expect(elsewhere.data.conversationId).not.toBe(asked.data.conversationId)
      await worker.worker.processNext(elsewhere.data.outbox.id)
      expect(runtime.toolInvocations).toHaveLength(0)
      expect(runtime.turnResults.at(-1)).toMatchObject({
        outcome: 'denied',
        reason: 'origin_mismatch'
      })
      expect(
        (await runtime.approvals.get(TENANT, approval.approvalId)).status
      ).toBe('APPROVED')

      // The denial consumed nothing: the conversation that asked can still execute it.
      const back = await inject({
        id: 'origin-a-2',
        body: envelope({ approvalId: approval.approvalId }),
        conversationId: asked.data.conversationId,
        sessionId: asked.data.sessionId
      })
      await worker.worker.processNext(back.data.outbox.id)
      expect(runtime.toolInvocations).toHaveLength(1)
      expect(runtime.turnResults.at(-1)).toMatchObject({ outcome: 'executed' })
      expect(
        (await runtime.approvals.get(TENANT, approval.approvalId)).status
      ).toBe('EXECUTED')
    },
    120_000
  )

  it('tripwire: the kernel worker composes only synthetic effects; a real effect needs this binding integrated and reviewed first', () => {
    expect(Object.values(CONTROLLED_KERNEL_EFFECT_SCOPES)).not.toHaveLength(0)
    for (const scope of Object.values(CONTROLLED_KERNEL_EFFECT_SCOPES))
      expect(scope).toBe('controlled_fake')
  })
})
