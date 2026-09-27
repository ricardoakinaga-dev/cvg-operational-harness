import { describe, expect, it, vi } from 'vitest'
import {
  createControlledNoopHandlers,
  createPostgresControlledHandlers,
  createPostgresControlledWorker,
  parseControlledDrainLimit,
  POSTGRES_CONTROLLED_QUEUE_ADAPTER
} from '../postgres-controlled.ts'
import {
  ensureControlledAgentPreset,
  createControlledReferencePreset,
  InMemoryControlPlaneStore,
  TenantIdSchema
} from '@cvg/platform'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000172'

describe('controlled PostgreSQL worker boundary', () => {
  it('constructs a tenant-scoped worker without opening an external effect path', async () => {
    const runtime = createPostgresControlledWorker(
      {
        DATABASE_URL: 'postgres://fixture.invalid/cvg',
        POSTGRES_SCHEMA: 'cvg_fixture',
        POSTGRES_RLS_ENFORCEMENT: 'true',
        CVG_WORKER_CONTROLLED_MODE: 'true',
        CVG_WORKER_TENANT_ID: tenantId,
        CVG_WORKER_ID: 'worker-postgres-fixture'
      },
      createControlledNoopHandlers()
    )

    expect(runtime.adapter).toBeDefined()
    expect(runtime.worker).toBeDefined()
    expect(POSTGRES_CONTROLLED_QUEUE_ADAPTER).toBe('postgres-controlled')
    await runtime.pool.end()
  })

  it('keeps the one-shot drain bounded', () => {
    expect(parseControlledDrainLimit(undefined)).toBe(10)
    expect(parseControlledDrainLimit('1')).toBe(1)
    expect(() => parseControlledDrainLimit('0')).toThrow(
      'CVG_WORKER_MAX_EVENTS must be an integer between 1 and 100'
    )
    expect(() => parseControlledDrainLimit('101')).toThrow(
      'CVG_WORKER_MAX_EVENTS must be an integer between 1 and 100'
    )
  })

  it('rejects the controlled PostgreSQL adapter in production', () => {
    expect(() =>
      createPostgresControlledWorker({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://fixture.invalid/cvg',
        POSTGRES_RLS_ENFORCEMENT: 'true',
        CVG_WORKER_CONTROLLED_MODE: 'true',
        CVG_WORKER_TENANT_ID: tenantId
      })
    ).toThrow(/disabled in production/)
  })

  it('runs a committed inbound event through the deterministic runtime and finalizer', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await ensureControlledAgentPreset(
      platform,
      createControlledReferencePreset(),
      tenantId
    )
    const published = await platform.resolvePublished({ tenantId }, agent.id)
    if (!published) throw new Error('Worker fixture did not publish a version')

    const conversationId = 'conv_worker_controlled_172'
    const sessionId = 'sess_worker_controlled_172'
    const inboundMessageId = 'msg_worker_controlled_172'
    const createdAt = new Date('2026-09-05T12:00:00.000Z')
    const session = {
      id: sessionId,
      conversationId,
      status: 'open' as const,
      takeoverState: 'BOT_ACTIVE' as const,
      createdAt,
      updatedAt: createdAt
    }
    const message = {
      id: inboundMessageId,
      conversationId,
      externalMessageId: 'worker-controlled-message-172',
      direction: 'inbound' as const,
      body: 'Mensagem determinística para o worker.',
      runtimeStatus: 'pending' as const,
      createdAt
    }
    const conversations = {
      findInboundRuntimeContext: vi.fn().mockResolvedValue({
        message,
        channel: 'web' as const,
        senderRef: 'worker-controlled-sender-172',
        correlationId: 'corr_00000000-0000-4000-8000-000000000172',
        session
      }),
      bindSessionAgentVersion: vi.fn().mockResolvedValue({
        ...session,
        agentId: agent.id,
        agentVersionId: published.id
      }),
      timeline: vi.fn().mockResolvedValue({
        messages: [message],
        sessions: [session]
      }),
      completeInboundRuntime: vi
        .fn()
        .mockResolvedValue({ status: 'completed' as const }),
      markInboundRuntimeCompleted: vi.fn()
    }
    const handlers = createPostgresControlledHandlers(
      { CVG_WORKER_AGENT_ID: agent.id },
      conversations as never,
      platform as never
    )
    const event = {
      id: 'outbox_worker_controlled_172',
      type: 'inbound.process',
      payload: { redacted: true },
      tenantId: TenantIdSchema.parse(tenantId),
      correlationId: 'corr_00000000-0000-4000-8000-000000000172',
      conversationId,
      sessionId,
      inboundMessageId,
      status: 'processing' as const,
      createdAt
    } as Parameters<typeof handlers.inboundProcess>[0]

    const result = await handlers.inboundProcess(event)

    expect(result).toMatchObject({
      status: 'completed',
      runtimeStatus: 'completed',
      externalEffects: false
    })
    expect(conversations.bindSessionAgentVersion).toHaveBeenCalledWith(
      tenantId,
      sessionId,
      agent.id,
      published.id
    )
    expect(conversations.completeInboundRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        conversationId,
        sessionId,
        inboundMessageId,
        correlationId: event.correlationId
      })
    )
  })

  it('fails closed for malformed, missing and human-owned inbound work', async () => {
    const conversations = {
      findInboundRuntimeContext: vi.fn(),
      markInboundRuntimeCompleted: vi.fn()
    }
    const platform = new InMemoryControlPlaneStore()
    const handlers = createPostgresControlledHandlers(
      {},
      conversations as never,
      platform as never
    )
    const baseEvent = {
      id: 'outbox_worker_controlled_173',
      type: 'inbound.process',
      payload: { redacted: true },
      tenantId,
      correlationId: 'corr_00000000-0000-4000-8000-000000000173',
      conversationId: 'conv_worker_controlled_173',
      sessionId: 'sess_worker_controlled_173',
      inboundMessageId: 'msg_worker_controlled_173',
      status: 'processing' as const,
      createdAt: new Date('2026-09-05T12:00:00.000Z')
    } as Parameters<typeof handlers.inboundProcess>[0]

    await expect(
      handlers.inboundProcess({ ...baseEvent, conversationId: null })
    ).rejects.toThrow(/runtime identifiers/)
    conversations.findInboundRuntimeContext.mockResolvedValueOnce(null)
    await expect(handlers.inboundProcess(baseEvent)).rejects.toThrow(
      /context was not found/
    )
    conversations.findInboundRuntimeContext.mockResolvedValueOnce({
      message: {
        id: 'msg_worker_controlled_173',
        conversationId: 'conv_worker_controlled_173',
        externalMessageId: 'worker-controlled-message-173',
        direction: 'inbound',
        body: 'Fixture',
        runtimeStatus: 'completed',
        createdAt: baseEvent.createdAt
      },
      channel: 'web',
      senderRef: 'fixture',
      correlationId: baseEvent.correlationId,
      session: null
    })
    await expect(handlers.inboundProcess(baseEvent)).resolves.toMatchObject({
      status: 'already_completed',
      externalEffects: false
    })
    conversations.findInboundRuntimeContext.mockResolvedValueOnce({
      message: {
        id: 'msg_worker_controlled_173',
        conversationId: 'conv_worker_controlled_173',
        externalMessageId: 'worker-controlled-message-173',
        direction: 'inbound',
        body: 'Fixture',
        runtimeStatus: 'pending',
        createdAt: baseEvent.createdAt
      },
      channel: 'web',
      senderRef: 'fixture',
      correlationId: baseEvent.correlationId,
      session: {
        id: 'sess_worker_controlled_173',
        conversationId: 'conv_worker_controlled_173',
        status: 'open',
        takeoverState: 'HUMAN_ACTIVE',
        createdAt: baseEvent.createdAt,
        updatedAt: baseEvent.createdAt
      }
    })
    await expect(handlers.inboundProcess(baseEvent)).resolves.toMatchObject({
      status: 'paused_human_takeover',
      externalEffects: false
    })
  })
})
