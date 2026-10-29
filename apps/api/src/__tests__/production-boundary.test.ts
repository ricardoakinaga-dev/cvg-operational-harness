import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildServer } from '../server.ts'
import { createInMemoryOperatorSessionStore } from '../operator-session.ts'
import { SYNTHETIC_AUTHORITY_VERSION } from './case-authorization-fixtures.ts'

/**
 * SPEC 0262 §5: a trusted route needs a current principal and the principal
 * authority is composed only under the controlled test profile. The server is
 * built under NODE_ENV=test and the request path runs as production; the
 * principal is the verified-adapter kind a trusted deployment accepts.
 */
async function buildProductionLike(
  options: Parameters<typeof buildServer>[0],
  principal: {
    tenantId: string
    operatorId: string
    role: 'Operator' | 'Approver' | 'Supervisor' | 'Admin'
  }
) {
  vi.stubEnv('NODE_ENV', 'test')
  let app: ReturnType<typeof buildServer>
  try {
    app = buildServer({
      ...options,
      casePrincipalAuthority: { authorityVersion: SYNTHETIC_AUTHORITY_VERSION }
    })
  } finally {
    vi.stubEnv('NODE_ENV', 'production')
  }
  await app.caseAuthority.applyVerifiedPrincipalState({
    tenantId: principal.tenantId as never,
    operatorId: principal.operatorId,
    role: principal.role,
    active: true,
    expectedRevision: 0,
    authorityVersion: SYNTHETIC_AUTHORITY_VERSION,
    proofRef: `synthetic-proof:${principal.operatorId}`,
    identitySource: 'verified_adapter'
  })
  return app
}

const operatorHeaders = {
  'x-operator-id': 'operator.production',
  'x-operator-role': 'Supervisor'
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('production boundary authentication', () => {
  it('rejects self-asserted operator headers when no trusted resolver is configured', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = buildServer({
      durableInbound: true,
      operatorSessionStore: createInMemoryOperatorSessionStore()
    })
    const response = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: operatorHeaders
    })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'unauthorized' }
    })
  })

  it('accepts a trusted resolver and verifier in controlled production-like tests', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = await buildProductionLike(
      {
        durableInbound: true,
        operatorIdentityResolver: () => ({
          operatorId: 'trusted.production',
          role: 'Supervisor',
          tenantId: 'tenant_00000000-0000-4000-8000-000000000061'
        }),
        webhookVerifier: () => true,
        inboundTenantResolver: () =>
          'tenant_00000000-0000-4000-8000-000000000061',
        operatorSessionStore: createInMemoryOperatorSessionStore()
      },
      {
        tenantId: 'tenant_00000000-0000-4000-8000-000000000061',
        operatorId: 'trusted.production',
        role: 'Supervisor'
      }
    )
    // SPEC0251 (§6 adjustment c): /v1/tasks is case-scoped and answers 503
    // without a trusted principal authority; the trusted-resolver probe uses
    // a protected route without case scope permitted to the Supervisor.
    const tasks = await app.inject({
      method: 'GET',
      url: '/v1/observability/audit-evidence',
      headers: { 'x-operator-role': 'forged' }
    })
    const health = await app.inject({ method: 'GET', url: '/health' })
    const webhook = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {
        externalMessageId: 'production-boundary-1',
        senderRef: '+5511000000000',
        body: 'Mensagem fictícia de boundary',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    await app.close()

    expect(tasks.statusCode).toBe(200)
    expect(webhook.statusCode).toBe(200)
    expect(health.headers['x-content-type-options']).toBe('nosniff')
    expect(health.headers['x-frame-options']).toBe('DENY')
  })

  it('does not allow low-level construction to disable production mutation authentication', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = buildServer({
      durableInbound: true,
      requireAuthenticatedMutations: false,
      operatorSessionStore: createInMemoryOperatorSessionStore()
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId: 'sess_00000000-0000-4000-8000-000000000061',
        title: 'Tarefa fictícia',
        description: 'Não deve ser criada sem identidade',
        priority: 'medium',
        source: 'production-boundary',
        idempotencyKey: 'production-boundary-task'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'unauthorized' }
    })
  })

  it('rejects low-level production construction that leaves inbound execution inline', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() => buildServer()).toThrow(
      'Production requires durable inbound processing'
    )
    expect(() => buildServer({ durableInbound: false })).toThrow(
      'Production requires durable inbound processing'
    )
  })

  it('rejects an unscoped PostgreSQL client in production construction', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(() =>
      buildServer({
        persistence: {
          kind: 'postgres',
          client: { query: async () => ({ rows: [] }) } as never
        }
      })
    ).toThrow('tenant-scoped pool and startup preflight')
  })

  it('fails closed outside test mode even when NODE_ENV is not production', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const app = buildServer({
      durableInbound: true,
      operatorSessionStore: createInMemoryOperatorSessionStore()
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/tasks',
      payload: {
        sessionId: 'sess_00000000-0000-4000-8000-000000000061',
        title: 'Tarefa fictícia',
        description: 'Não deve ser criada sem identidade',
        priority: 'medium',
        source: 'development-boundary',
        idempotencyKey: 'development-boundary-task'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'unauthorized' }
    })
  })

  it('fails production webhooks closed without a verifier', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = buildServer({
      durableInbound: true,
      operatorSessionStore: createInMemoryOperatorSessionStore()
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {
        externalMessageId: 'production-boundary-2',
        senderRef: '+5511000000000',
        body: 'Mensagem fictícia de boundary',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'unauthorized' }
    })
  })

  it('fails production webhooks closed without a trusted tenant resolver', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = buildServer({
      durableInbound: true,
      webhookVerifier: () => true,
      operatorSessionStore: createInMemoryOperatorSessionStore()
    })
    const response = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {
        externalMessageId: 'production-boundary-tenant',
        senderRef: '+5511000000000',
        body: 'Mensagem fictícia de tenant boundary',
        receivedAt: '2026-08-23T10:00:00-03:00'
      }
    })
    await app.close()

    expect(response.statusCode).toBe(401)
    expect(response.json()).toMatchObject({
      success: false,
      error: { code: 'unauthorized' }
    })
  })

  it('binds trusted production identities to the requested tenant', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const app = await buildProductionLike(
      {
        durableInbound: true,
        operatorIdentityResolver: () => ({
          operatorId: 'trusted.production',
          role: 'Admin',
          tenantId: 'tenant_00000000-0000-4000-8000-000000000061'
        }),
        operatorSessionStore: createInMemoryOperatorSessionStore()
      },
      {
        tenantId: 'tenant_00000000-0000-4000-8000-000000000061',
        operatorId: 'trusted.production',
        role: 'Admin'
      }
    )
    const mismatch = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: {
        'x-tenant-id': 'tenant_00000000-0000-4000-8000-000000000062'
      }
    })
    const appWithoutTenantBinding = buildServer({
      durableInbound: true,
      operatorIdentityResolver: () => ({
        operatorId: 'trusted.without-tenant',
        role: 'Admin'
      }),
      operatorSessionStore: createInMemoryOperatorSessionStore()
    })
    const missingBinding = await appWithoutTenantBinding.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: { 'x-tenant-id': 'tenant_00000000-0000-4000-8000-000000000061' }
    })
    await app.close()
    await appWithoutTenantBinding.close()

    expect(mismatch.statusCode).toBe(403)
    expect(missingBinding.statusCode).toBe(401)
  })
})
