import { describe, expect, it, vi } from 'vitest'
import {
  ensureControlledSecretaryPreset,
  InMemoryControlPlaneStore,
  TenantIdSchema
} from '@cvg/platform'
import {
  createControlledNoopHandlers,
  createPostgresControlledHandlers,
  createPostgresControlledWorker,
  parseControlledDrainLimit
} from '../postgres-controlled.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000182'
const agentId = 'agent_00000000-0000-4000-8000-000000000182'
const correlationId = 'corr_00000000-0000-4000-8000-000000000182'
const createdAt = new Date('2026-09-05T12:00:00.000Z')

function baseEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox_worker_hardening_182',
    type: 'inbound.process',
    payload: { redacted: true },
    tenantId: TenantIdSchema.parse(tenantId),
    correlationId,
    conversationId: 'conv_worker_hardening_182',
    sessionId: 'sess_worker_hardening_182',
    inboundMessageId: 'msg_worker_hardening_182',
    status: 'processing' as const,
    createdAt,
    ...overrides
  } as never
}

function workerEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    DATABASE_URL: 'postgres://fixture.invalid/cvg',
    POSTGRES_RLS_ENFORCEMENT: 'true',
    CVG_WORKER_CONTROLLED_MODE: 'true',
    CVG_WORKER_TENANT_ID: tenantId,
    ...overrides
  }
}

function pendingMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg_worker_hardening_182',
    conversationId: 'conv_worker_hardening_182',
    externalMessageId: 'worker-hardening-message-182',
    direction: 'inbound' as const,
    body: 'Mensagem sintetica do worker.',
    runtimeStatus: 'pending' as const,
    createdAt,
    ...overrides
  }
}

function pendingContext(session: unknown) {
  return {
    message: pendingMessage(),
    channel: 'web' as const,
    senderRef: 'worker-hardening-sender-182',
    correlationId,
    session
  }
}

describe('controlled PostgreSQL worker environment gates', () => {
  it('rejects missing, unsafe or unguarded environment configurations', () => {
    const handlers = createControlledNoopHandlers()

    expect(() =>
      createPostgresControlledWorker(
        workerEnv({ DATABASE_URL: undefined }),
        handlers
      )
    ).toThrow(/DATABASE_URL is required/)
    expect(() =>
      createPostgresControlledWorker(
        workerEnv({ POSTGRES_RLS_ENFORCEMENT: 'false' }),
        handlers
      )
    ).toThrow(/RLS enforcement/)
    expect(() =>
      createPostgresControlledWorker(
        workerEnv({ CVG_WORKER_CONTROLLED_MODE: 'false' }),
        handlers
      )
    ).toThrow(/explicit controlled mode/)
    expect(() =>
      createPostgresControlledWorker(
        workerEnv({ CVG_WORKER_TENANT_ID: 'tenant-invalid' }),
        handlers
      )
    ).toThrow()
    expect(() =>
      createPostgresControlledWorker(
        workerEnv({ POSTGRES_SCHEMA: '1invalid' }),
        handlers
      )
    ).toThrow(/Invalid PostgreSQL schema name/)
  })

  it('builds the default schema-less worker without external effects', async () => {
    const runtime = createPostgresControlledWorker(
      workerEnv({ POSTGRES_SCHEMA: '   ', CVG_WORKER_ID: '   ' }),
      createControlledNoopHandlers()
    )

    expect(runtime.worker).toBeDefined()
    expect(runtime.adapter).toBeDefined()
    await runtime.pool.end()
  })

  it('parses bounded drain limits and noop handlers', () => {
    expect(parseControlledDrainLimit(undefined, 4)).toBe(4)
    expect(parseControlledDrainLimit('100')).toBe(100)
    expect(() => parseControlledDrainLimit('')).toThrow(/between 1 and 100/)
    expect(() => parseControlledDrainLimit('abc')).toThrow(/between 1 and 100/)
    expect(() => parseControlledDrainLimit('1.5')).toThrow(/between 1 and 100/)

    const noop = createControlledNoopHandlers()
    expect(noop.inboundProcess(baseEvent())).toEqual({
      status: 'controlled_inbound_consumed',
      externalEffects: false
    })
    expect(noop.messageOutbound(baseEvent())).toEqual({
      status: 'controlled_outbound_suppressed',
      externalEffects: false
    })
  })

  it('suppresses outbound without touching any injected port', async () => {
    const conversations = {
      findInboundRuntimeContext: vi.fn(() => {
        throw new Error('outbound must not read conversations')
      }),
      completeInboundRuntime: vi.fn(() => {
        throw new Error('outbound must not finalize runtime state')
      })
    }
    const platform = {
      resolvePublished: vi.fn(() => {
        throw new Error('outbound must not resolve published versions')
      })
    }
    const handlers = createPostgresControlledHandlers(
      {},
      conversations as never,
      platform as never
    )

    expect(
      handlers.messageOutbound(baseEvent({ type: 'message.outbound' }))
    ).toEqual({
      status: 'controlled_outbound_suppressed',
      externalEffects: false
    })
    expect(conversations.findInboundRuntimeContext).not.toHaveBeenCalled()
    expect(conversations.completeInboundRuntime).not.toHaveBeenCalled()
    expect(platform.resolvePublished).not.toHaveBeenCalled()
  })

  it('rejects malformed configured agent ids and accepts the fallback variable', () => {
    expect(() =>
      createPostgresControlledHandlers(
        { CVG_WORKER_AGENT_ID: 'agent-invalid' },
        {} as never,
        {} as never
      )
    ).toThrow()

    const handlers = createPostgresControlledHandlers(
      { INBOUND_AGENT_ID: agentId },
      {} as never,
      {} as never
    )
    expect(handlers.messageOutbound(baseEvent())).toEqual({
      status: 'controlled_outbound_suppressed',
      externalEffects: false
    })
  })
})

describe('controlled PostgreSQL inbound handler paths', () => {
  it('runs the pinned session version, redacts history and never rebinds', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await ensureControlledSecretaryPreset(platform, tenantId)
    const published = await platform.resolvePublished({ tenantId }, agent.id)
    if (!published) throw new Error('Fixture preset did not publish a version')

    const inboundMessage = pendingMessage()
    const earlierMessage = pendingMessage({
      id: 'msg_worker_hardening_earlier',
      direction: 'inbound',
      body: 'contato ana@example.com',
      runtimeStatus: 'completed'
    })
    const session = {
      id: 'sess_worker_hardening_182',
      conversationId: 'conv_worker_hardening_182',
      status: 'open' as const,
      takeoverState: 'BOT_ACTIVE' as const,
      agentId: agent.id,
      agentVersionId: published.id,
      createdAt,
      updatedAt: createdAt
    }
    const conversations = {
      findInboundRuntimeContext: vi.fn().mockResolvedValue({
        ...pendingContext(session),
        message: inboundMessage
      }),
      bindSessionAgentVersion: vi.fn(),
      timeline: vi.fn().mockResolvedValue({
        messages: [inboundMessage, earlierMessage],
        sessions: [session]
      }),
      completeInboundRuntime: vi
        .fn()
        .mockResolvedValue({ status: 'completed' as const }),
      markInboundRuntimeCompleted: vi.fn()
    }
    const handlers = createPostgresControlledHandlers(
      {},
      conversations as never,
      platform as never
    )

    const result = await handlers.inboundProcess(baseEvent())

    expect(result).toMatchObject({
      status: 'completed',
      runtimeStatus: 'completed',
      externalEffects: false
    })
    expect(conversations.bindSessionAgentVersion).not.toHaveBeenCalled()
    expect(conversations.completeInboundRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        conversationId: 'conv_worker_hardening_182',
        sessionId: 'sess_worker_hardening_182',
        inboundMessageId: 'msg_worker_hardening_182',
        correlationId
      })
    )
  })

  it('fails closed when mapping, published version or session binding are unavailable', async () => {
    const mappingHandlers = createPostgresControlledHandlers(
      {},
      {
        findInboundRuntimeContext: vi
          .fn()
          .mockResolvedValue(pendingContext(null)),
        markInboundRuntimeCompleted: vi.fn()
      } as never,
      new InMemoryControlPlaneStore() as never
    )
    await expect(
      mappingHandlers.inboundProcess(baseEvent({ sessionId: undefined }))
    ).rejects.toThrow(/agent mapping is not configured/)

    const conversations = {
      findInboundRuntimeContext: vi
        .fn()
        .mockResolvedValue(pendingContext(null)),
      markInboundRuntimeCompleted: vi.fn()
    }
    const missingPublished = createPostgresControlledHandlers(
      { CVG_WORKER_AGENT_ID: agentId },
      conversations as never,
      { resolvePublished: vi.fn().mockResolvedValue(null) } as never
    )
    await expect(
      missingPublished.inboundProcess(baseEvent({ sessionId: null }))
    ).resolves.toMatchObject({
      status: 'not_configured',
      reason: 'published_version_missing',
      externalEffects: false
    })
    expect(conversations.markInboundRuntimeCompleted).toHaveBeenCalledWith(
      'msg_worker_hardening_182',
      tenantId
    )

    const bindingSession = {
      id: 'sess_worker_hardening_182',
      conversationId: 'conv_worker_hardening_182',
      status: 'open' as const,
      takeoverState: 'BOT_ACTIVE' as const,
      createdAt,
      updatedAt: createdAt
    }
    const bindingHandlers = createPostgresControlledHandlers(
      { CVG_WORKER_AGENT_ID: agentId },
      {
        findInboundRuntimeContext: vi
          .fn()
          .mockResolvedValue(pendingContext(bindingSession)),
        bindSessionAgentVersion: vi.fn().mockResolvedValue({
          agentId: null,
          agentVersionId: null
        }),
        markInboundRuntimeCompleted: vi.fn()
      } as never,
      {
        resolvePublished: vi
          .fn()
          .mockResolvedValue({ id: 'agent_version_fixture_182' })
      } as never
    )
    await expect(bindingHandlers.inboundProcess(baseEvent())).rejects.toThrow(
      /session agent binding failed/
    )
  })

  it('marks the inbound message completed when the pinned runtime cannot execute', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await ensureControlledSecretaryPreset(platform, tenantId)
    const session = {
      id: 'sess_worker_hardening_182',
      conversationId: 'conv_worker_hardening_182',
      status: 'open' as const,
      takeoverState: 'BOT_ACTIVE' as const,
      agentId: agent.id,
      agentVersionId: 'agent_version_00000000-0000-4000-8000-000000000000',
      createdAt,
      updatedAt: createdAt
    }
    const conversations = {
      findInboundRuntimeContext: vi
        .fn()
        .mockResolvedValue(pendingContext(session)),
      bindSessionAgentVersion: vi.fn(),
      timeline: vi.fn().mockResolvedValue({
        messages: [pendingMessage()],
        sessions: [session]
      }),
      completeInboundRuntime: vi.fn(),
      markInboundRuntimeCompleted: vi.fn()
    }
    const handlers = createPostgresControlledHandlers(
      {},
      conversations as never,
      platform as never
    )

    await expect(handlers.inboundProcess(baseEvent())).resolves.toMatchObject({
      status: 'not_configured',
      reason: 'pinned_version_missing',
      externalEffects: false
    })
    expect(conversations.markInboundRuntimeCompleted).toHaveBeenCalledWith(
      'msg_worker_hardening_182',
      tenantId
    )
    expect(conversations.completeInboundRuntime).not.toHaveBeenCalled()
  })
})
