/**
 * SPEC 0262 §5 / R09 — closed route classification and the trusted-mode
 * principal guard. Synthetic data only.
 */
import { describe, expect, it, vi } from 'vitest'
import { buildServer } from '../server.ts'
import {
  createTrustedOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'
import { createInMemoryOperatorSessionStore } from '../operator-session.ts'
import { classifyOperatorRoute } from '../operator-route-class.ts'
import type { RegisteredRoute } from '../operator-route-class.ts'
import {
  provisionPrincipal,
  SYNTHETIC_AUTHORITY_VERSION
} from './case-authorization-fixtures.ts'

const key = 'principal-guard-synthetic-signing-key-abcdefghijklmnop'
const tenant = 'tenant_00000000-0000-4000-8000-000000000262'
const now = 1_800_000_000_000

type Role = 'Operator' | 'Approver' | 'Supervisor' | 'Admin'

function trustedServer() {
  const app = buildServer({
    identityMode: 'trusted',
    operatorIdentityResolver: createTrustedOperatorIdentityResolver({
      secret: key,
      now: () => now
    }),
    operatorSessionStore: createInMemoryOperatorSessionStore(),
    casePrincipalAuthority: { authorityVersion: SYNTHETIC_AUTHORITY_VERSION }
  } as never)
  return app as typeof app & {
    operatorRouteInventory: RegisteredRoute[]
  }
}

const token = (operatorId: string, role: Role) =>
  createTrustedOperatorIdentityToken(
    { operatorId, role, tenantId: tenant },
    key,
    () => now,
    120
  )

describe('SPEC 0262 §5 closed route classification', () => {
  const cases: Array<[string, string, string]> = [
    ['GET', '/health', 'probe'],
    ['HEAD', '/live', 'probe'],
    ['GET', '/ready', 'probe'],
    ['GET', '/health/metrics', 'probe'],
    ['POST', '/health', 'operator'],
    ['POST', '/v1/webhooks/channels/:channel/messages', 'webhook'],
    ['GET', '/v1/webhooks/channels/:channel/messages', 'operator'],
    ['POST', '/v1/auth/oidc/start', 'oidc_bootstrap'],
    ['GET', '/v1/auth/oidc/callback', 'oidc_bootstrap'],
    ['POST', '/v1/auth/oidc/callback', 'operator'],
    ['GET', '/v1/session', 'session'],
    ['HEAD', '/v1/session', 'session'],
    ['POST', '/v1/session', 'operator'],
    ['POST', '/v1/session/logout', 'logout'],
    ['GET', '/v1/tasks', 'operator'],
    ['GET', '/v1/some/future/route', 'operator'],
    ['GET', '/health/', 'operator'],
    ['GET', '/healthz', 'operator']
  ]
  for (const [method, template, expected] of cases) {
    it(`${method} ${template} is ${expected}`, () => {
      expect(classifyOperatorRoute(method, template)).toBe(expected)
    })
  }

  it('an unresolved route is never an exception', () => {
    expect(classifyOperatorRoute('GET', undefined)).toBe('operator')
  })
})

describe('SPEC 0262 §5 runtime route inventory', () => {
  it('classifies every registered pair; only the named pairs are not operator routes', async () => {
    const app = trustedServer()
    await app.ready()
    const inventory = app.operatorRouteInventory
    expect(inventory.length).toBeGreaterThan(60)
    const independent = inventory
      .filter((route) => route.class !== 'operator')
      .map((route) => `${route.method} ${route.template} ${route.class}`)
      .sort()
    expect(independent).toEqual(
      [
        'GET /health probe',
        'HEAD /health probe',
        'GET /live probe',
        'HEAD /live probe',
        'GET /ready probe',
        'HEAD /ready probe',
        'GET /health/metrics probe',
        'HEAD /health/metrics probe',
        'GET /v1/session session',
        'HEAD /v1/session session',
        'POST /v1/session/logout logout',
        'POST /v1/webhooks/channels/:channel/messages webhook'
      ].sort()
    )
    // Every other registered pair, including derived HEADs, is protected.
    for (const route of inventory) {
      expect(route.class).toBe(
        classifyOperatorRoute(route.method, route.template)
      )
    }
    await app.close()
  })
})

describe('SPEC 0262 §5 principal guard (trusted mode)', () => {
  it('a per-request signed token without a principal is 401 before the role matrix; with a principal the handler answers as before', async () => {
    const app = trustedServer()
    // Operator on an Admin-only route: 403 from the handler once the
    // principal is current, 401 from the guard before that.
    const first = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: { 'x-cvg-operator-token': token('guard.operator', 'Operator') }
    })
    expect(first.statusCode).toBe(401)
    expect(first.headers['cache-control']).toBe('no-store')
    await provisionPrincipal(app, {
      tenantId: tenant as never,
      operatorId: 'guard.operator',
      role: 'Operator'
    })
    const second = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: { 'x-cvg-operator-token': token('guard.operator', 'Operator') }
    })
    expect(second.statusCode).toBe(403)
    await app.close()
  })

  it('an inactive principal or a role that differs from the credential is 401', async () => {
    const app = trustedServer()
    await provisionPrincipal(app, {
      tenantId: tenant as never,
      operatorId: 'guard.admin',
      role: 'Admin'
    })
    const ok = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: { 'x-cvg-operator-token': token('guard.admin', 'Admin') }
    })
    expect(ok.statusCode).toBe(200)
    const drift = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: { 'x-cvg-operator-token': token('guard.admin', 'Supervisor') }
    })
    expect(drift.statusCode).toBe(401)
    await provisionPrincipal(app, {
      tenantId: tenant as never,
      operatorId: 'guard.admin',
      role: 'Admin',
      active: false,
      expectedRevision: 1
    })
    const inactive = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: { 'x-cvg-operator-token': token('guard.admin', 'Admin') }
    })
    expect(inactive.statusCode).toBe(401)
    await app.close()
  })

  it('a principal outage is 503; an absent credential keeps the handler 401', async () => {
    const app = trustedServer()
    const noCredential = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents'
    })
    expect(noCredential.statusCode).toBe(401)
    const spy = vi
      .spyOn(app.caseAuthority, 'readSnapshot')
      .mockRejectedValue(new Error('synthetic principal outage'))
    const outage = await app.inject({
      method: 'GET',
      url: '/v1/admin/agents',
      headers: { 'x-cvg-operator-token': token('guard.admin', 'Admin') }
    })
    spy.mockRestore()
    expect(outage.statusCode).toBe(503)
    expect(outage.json().error.code).toBe('configuration_error')
    await app.close()
  })

  it('probes, the webhook route and unregistered paths do not need an operator principal', async () => {
    const app = trustedServer()
    for (const url of ['/health', '/live']) {
      expect((await app.inject({ url })).statusCode).toBe(200)
    }
    const missing = await app.inject({ url: '/v1/does-not-exist' })
    expect(missing.statusCode).toBe(404)
    const webhook = await app.inject({
      method: 'POST',
      url: '/v1/webhooks/channels/whatsapp/messages',
      payload: {}
    })
    // The webhook has its own authority: never the guard's 401/503.
    expect([401, 403, 400, 422, 503]).toContain(webhook.statusCode)
    expect(webhook.json().error.message).not.toMatch(/principal/i)
    await app.close()
  })
})
