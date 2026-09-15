import { InMemoryControlPlaneStore } from '@cvg/platform'
import { describe, expect, it } from 'vitest'
import { buildServerFromEnv } from '../server.ts'

const tenantId = 'tenant_00000000-0000-4000-8000-000000000841'
const agentId = 'agent_00000000-0000-4000-8000-000000000841'
const fakeDatabaseUrl = 'postgres://fixture:fixture@127.0.0.1:1/fixture'

interface Envelope<T> {
  success: boolean
  data: T | null
  error: { code: string; message: string } | null
}

describe('buildServerFromEnv boundaries', () => {
  it('requires an explicit NODE_ENV and valid persistence mode', async () => {
    await expect(
      buildServerFromEnv({ API_PERSISTENCE_MODE: 'memory' })
    ).rejects.toThrow(/NODE_ENV/)
    await expect(
      buildServerFromEnv({ NODE_ENV: 'test', API_PERSISTENCE_MODE: 'archive' })
    ).rejects.toThrow(/API_PERSISTENCE_MODE/)
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'production',
        API_PERSISTENCE_MODE: 'memory'
      })
    ).rejects.toThrow(/Production requires PostgreSQL persistence/)
  })

  it('fails production PostgreSQL bootstraps before any connection', async () => {
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'production',
        API_PERSISTENCE_MODE: 'postgres'
      })
    ).rejects.toThrow(/DATABASE_URL is required/)
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'production',
        API_PERSISTENCE_MODE: 'postgres',
        DATABASE_URL: fakeDatabaseUrl
      })
    ).rejects.toThrow(/RLS enforcement/)
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'production',
        API_PERSISTENCE_MODE: 'postgres',
        DATABASE_URL: fakeDatabaseUrl,
        POSTGRES_RLS_ENFORCEMENT: 'true'
      })
    ).rejects.toThrow(/OUTBOX_DURABLE_INBOUND/)
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'production',
        API_PERSISTENCE_MODE: 'postgres',
        DATABASE_URL: fakeDatabaseUrl,
        POSTGRES_RLS_ENFORCEMENT: 'true',
        OUTBOX_DURABLE_INBOUND: 'true'
      })
    ).rejects.toThrow(/INBOUND_TENANT_ID or an injected tenant resolver/)
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'production',
        API_PERSISTENCE_MODE: 'postgres',
        DATABASE_URL: fakeDatabaseUrl,
        POSTGRES_RLS_ENFORCEMENT: 'true',
        OUTBOX_DURABLE_INBOUND: 'true',
        INBOUND_TENANT_ID: tenantId
      })
    ).rejects.toThrow(/INBOUND_AGENT_ID or an injected agent runtime/)
    await expect(
      buildServerFromEnv(
        {
          NODE_ENV: 'production',
          API_PERSISTENCE_MODE: 'postgres',
          DATABASE_URL: fakeDatabaseUrl,
          POSTGRES_RLS_ENFORCEMENT: 'true',
          OUTBOX_DURABLE_INBOUND: 'true',
          INBOUND_TENANT_ID: tenantId,
          INBOUND_AGENT_ID: agentId
        },
        { inboundTenantResolver: () => tenantId }
      )
    ).rejects.toThrow(/operator identity resolver/)
  })

  it('rejects unsafe schema names and invalid inbound identifiers', async () => {
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'development',
        API_PERSISTENCE_MODE: 'postgres',
        DATABASE_URL: fakeDatabaseUrl,
        POSTGRES_SCHEMA: 'Bad-Schema'
      })
    ).rejects.toThrow(/schema/i)
    await expect(
      buildServerFromEnv(
        {
          NODE_ENV: 'development',
          API_PERSISTENCE_MODE: 'memory',
          INBOUND_TENANT_ID: 'not-a-tenant'
        },
        { webhookVerifier: () => true }
      )
    ).rejects.toThrow(/INBOUND_TENANT_ID/)
    await expect(
      buildServerFromEnv(
        {
          NODE_ENV: 'development',
          API_PERSISTENCE_MODE: 'memory',
          INBOUND_AGENT_ID: 'not-an-agent'
        },
        { webhookVerifier: () => true }
      )
    ).rejects.toThrow(/INBOUND_AGENT_ID/)
  })

  it('requires a signing secret outside test mode when no verifier is injected', async () => {
    await expect(
      buildServerFromEnv({
        NODE_ENV: 'development',
        API_PERSISTENCE_MODE: 'memory'
      })
    ).rejects.toThrow(/WEBHOOK_SIGNING_SECRET/)
  })

  it('wires configured tenant and agent resolvers into memory mode', async () => {
    const platform = new InMemoryControlPlaneStore()
    const agent = await platform.createAgent(
      { tenantId },
      {
        slug: 'env-resolution-agent',
        name: 'Env Resolution Agent',
        description: 'Fixture'
      }
    )
    const app = await buildServerFromEnv(
      {
        NODE_ENV: 'test',
        API_PERSISTENCE_MODE: 'memory',
        INBOUND_TENANT_ID: tenantId,
        INBOUND_AGENT_ID: agent.id
      },
      { platform }
    )
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'env-resolution-1',
        senderRef: 'fixture-sender',
        body: 'Mensagem fictícia com resolução configurada',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    const body = response.json() as Envelope<{
      accepted: boolean
      runtime: { status: string; reason: string }
    }>
    expect(body.data?.accepted).toBe(true)
    expect(body.data?.runtime).toMatchObject({
      status: 'not_configured',
      reason: 'published_version_missing'
    })
  })

  it('uses an injected verifier and closes the app when the preset seeding fails', async () => {
    const verifierApp = await buildServerFromEnv(
      {
        NODE_ENV: 'development',
        API_PERSISTENCE_MODE: 'memory'
      },
      { webhookVerifier: () => false }
    )
    const denied = await verifierApp.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'env-resolution-2',
        senderRef: 'fixture-sender',
        body: 'Entrega sem assinatura',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    await verifierApp.close()
    expect(denied.statusCode).toBe(401)

    class FailingPresetStore extends InMemoryControlPlaneStore {
      override async createAgent(
        ...args: Parameters<InMemoryControlPlaneStore['createAgent']>
      ): ReturnType<InMemoryControlPlaneStore['createAgent']> {
        void args
        throw new Error('controlled preset failure')
      }
    }
    await expect(
      buildServerFromEnv(
        {
          NODE_ENV: 'development',
          API_PERSISTENCE_MODE: 'memory',
          WEBHOOK_SIGNING_SECRET: 'development-only-controlled-secret-123456'
        },
        { platform: new FailingPresetStore() }
      )
    ).rejects.toThrow(/controlled preset failure/)
  })

  it('accepts injected resolvers without re-reading the environment', async () => {
    const app = await buildServerFromEnv(
      {
        NODE_ENV: 'test',
        API_PERSISTENCE_MODE: 'memory'
      },
      {
        inboundTenantResolver: () => tenantId,
        agentRuntime: { resolveAgentId: () => null }
      }
    )
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/web/messages',
      payload: {
        externalMessageId: 'env-resolution-3',
        senderRef: 'fixture-sender',
        body: 'Mensagem fictícia com resolver injetado',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(200)
    const body = response.json() as Envelope<{
      runtime: { reason: string }
    }>
    expect(body.data?.runtime.reason).toBe('agent_mapping_missing')
  })
})
