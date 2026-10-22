// @vitest-environment node
/**
 * SPEC0254 O7 (composition refusals, I3/I4/I6) and O8 (CSRF by exact
 * `Origin` and HMAC token refusal in the OIDC mode). The OIDC authority is a
 * stub here: these guards never reach the IdP.
 */
import { randomBytes } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createConfiguredOperatorIdentityResolver,
  createTrustedOperatorIdentityToken
} from '../operator-identity.ts'
import {
  createInMemoryOperatorSessionStore,
  type OperatorSessionStore
} from '../operator-session.ts'
import { hasOperatorSessionCookieName } from '../oidc-routes.ts'
import { buildServer, buildServerFromEnv } from '../server.ts'
import { SYNTHETIC_TENANT_A } from './support/synthetic-oidc-issuer.ts'

const CONSOLE = 'https://console.synthetic.test'
const SIBLING = 'https://sibling.synthetic.test'
const VERSION = `oidc-v1-${'a'.repeat(64)}`

type App = ReturnType<typeof buildServer>
const opened: App[] = []

afterEach(async () => {
  vi.unstubAllEnvs()
  while (opened.length) await opened.pop()!.close()
})

function stubAuthority() {
  return {
    issuer: 'https://idp.synthetic.test',
    start: vi.fn(),
    readCallback: vi.fn(),
    complete: vi.fn(),
    clearPendingCookie: vi.fn(() => 'cvg_oidc_pending=; Max-Age=0')
  }
}

function operatorLogin(authorityVersion = VERSION) {
  return {
    kind: 'oidc' as const,
    authorityVersion,
    consoleOrigin: CONSOLE,
    authority: stubAuthority() as never,
    stateStore: { reserve: vi.fn(), consume: vi.fn() }
  }
}

function build(options: Parameters<typeof buildServer>[0]) {
  const app = buildServer(options)
  opened.push(app)
  return app
}

describe('SPEC0254 O7 — composition refusals', () => {
  it('refuses casePrincipalAuthority without the OIDC login outside NODE_ENV=test (I3)', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(() =>
      build({
        identityMode: 'trusted',
        casePrincipalAuthority: { authorityVersion: 'synthetic-authority-v1' }
      })
    ).toThrow(/casePrincipalAuthority/)
  })

  it('keeps casePrincipalAuthority without the login for test fixtures only', () => {
    expect(() =>
      build({
        identityMode: 'trusted',
        casePrincipalAuthority: { authorityVersion: 'synthetic-authority-v1' }
      })
    ).not.toThrow()
  })

  it('refuses the OIDC login together with an HMAC resolver (I6)', () => {
    expect(() =>
      build({
        identityMode: 'trusted',
        operatorSessionStore: createInMemoryOperatorSessionStore(),
        operatorIdentityResolver: () => ({
          operatorId: 'hmac.operator',
          role: 'Operator',
          tenantId: SYNTHETIC_TENANT_A
        }),
        operatorLogin: operatorLogin()
      } as never)
    ).toThrow(/operatorIdentityResolver|HMAC/)
  })

  it('refuses a casePrincipalAuthority version different from the login', () => {
    expect(() =>
      build({
        identityMode: 'trusted',
        operatorSessionStore: createInMemoryOperatorSessionStore(),
        operatorLogin: operatorLogin(),
        casePrincipalAuthority: {
          authorityVersion: `oidc-v2-${'b'.repeat(64)}`
        }
      } as never)
    ).toThrow(/authority version/)
    expect(() =>
      build({
        identityMode: 'trusted',
        operatorSessionStore: createInMemoryOperatorSessionStore(),
        operatorLogin: operatorLogin(),
        casePrincipalAuthority: { authorityVersion: VERSION }
      } as never)
    ).not.toThrow()
  })

  it('requires trusted identity and a session store for the OIDC login', () => {
    expect(() =>
      build({
        identityMode: 'simulation',
        operatorSessionStore: createInMemoryOperatorSessionStore(),
        operatorLogin: operatorLogin()
      } as never)
    ).toThrow(/trusted/)
    expect(() =>
      build({
        identityMode: 'trusted',
        operatorLogin: operatorLogin()
      } as never)
    ).toThrow(/session store/)
  })

  it.each(['development', 'production'])(
    'refuses the OIDC login and an injected transport with NODE_ENV=%s (I4)',
    (environment) => {
      vi.stubEnv('NODE_ENV', environment)
      expect(() =>
        build({
          identityMode: 'trusted',
          durableInbound: true,
          outbox: {} as never,
          operatorSessionStore: createInMemoryOperatorSessionStore(),
          operatorLogin: operatorLogin()
        } as never)
      ).toThrow(/not qualified/)
      expect(() =>
        build({
          identityMode: 'trusted',
          durableInbound: true,
          outbox: {} as never,
          oidcTransport: async () => new Response('{}')
        } as never)
      ).toThrow(/oidcTransport/)
    }
  )

  it('keeps trusted HMAC composition at 503 on case, conversation and task readers (guard)', async () => {
    const key = {
      keyId: 'guard-synthetic',
      secret: randomBytes(32).toString('base64url')
    }
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: 'test',
      CVG_IDENTITY_MODE: 'trusted',
      CVG_OPERATOR_IDENTITY_KEYRING: JSON.stringify({ current: key })
    }
    const app = (await buildServerFromEnv(env, {
      operatorIdentityResolver: createConfiguredOperatorIdentityResolver(env)!
    })) as unknown as App
    opened.push(app)
    for (const role of [
      'Operator',
      'Approver',
      'Supervisor',
      'Admin'
    ] as const) {
      for (const url of ['/v1/conversations', '/v1/cases', '/v1/tasks']) {
        const token = createTrustedOperatorIdentityToken(
          {
            operatorId: `guard.${role.toLowerCase()}`,
            role,
            tenantId: SYNTHETIC_TENANT_A
          },
          key
        )
        const response = await app.inject({
          method: 'GET',
          url,
          headers: { 'x-cvg-operator-token': token }
        })
        // Fail closed for every role: 503 (no principal authority), except
        // the registry, where Operator/Approver lack the permission (403)
        // before any scope is resolved.
        const expected =
          url === '/v1/cases' && (role === 'Operator' || role === 'Approver')
            ? 403
            : 503
        expect(response.statusCode, `${role} ${url}`).toBe(expected)
      }
    }
  })
})

interface Guarded {
  app: App
  sessions: OperatorSessionStore & { revoked: string[] }
  cookie: string
}

async function guarded(): Promise<Guarded> {
  const inner = createInMemoryOperatorSessionStore()
  const sessions = Object.assign(
    {
      create: inner.create,
      get: inner.get,
      async revoke(sessionId: string) {
        sessions.revoked.push(sessionId)
        await inner.revoke(sessionId)
      }
    },
    { revoked: [] as string[] }
  )
  const app = build({
    identityMode: 'trusted',
    operatorSessionStore: sessions,
    operatorLogin: operatorLogin(),
    httpSecurity: { allowedOrigins: [CONSOLE, SIBLING] },
    webhookVerifier: () => true
  } as never)
  const record = await sessions.create({
    identity: {
      operatorId: 'oidc_guard_supervisor',
      role: 'Supervisor',
      tenantId: SYNTHETIC_TENANT_A
    },
    expiresAt: Date.now() + 60_000
  })
  return { app, sessions, cookie: `cvg_operator_session=${record.sessionId}` }
}

const caseId = '0254aaaa-0000-4000-8000-000000000001'
const mutations = [
  {
    method: 'POST',
    url: '/v1/tasks',
    payload: { sessionId: 'session_synthetic', title: 'synthetic' }
  },
  {
    method: 'PATCH',
    url: '/v1/tasks/task_synthetic/status',
    payload: { status: 'done' }
  },
  {
    method: 'PUT',
    url: `/v1/cases/${caseId}/assignments/oidc_guard_operator`,
    payload: { status: 'ACTIVE', expectedRevision: 0 }
  },
  { method: 'POST', url: '/v1/session/logout' }
] as const

function effects(app: App) {
  const state = app.persistence.memoryDb!.state
  return {
    tasks: state.tasks.length,
    audit: state.auditEvents.length
  }
}

describe('SPEC0254 O8 — CSRF by exact Origin in the OIDC mode', () => {
  it.each([
    ['no Origin', {}],
    ['Origin null', { origin: 'null' }],
    ['a sibling Origin', { origin: SIBLING }],
    ['an http: Origin', { origin: 'http://console.synthetic.test' }],
    ['a repeated Origin', { origin: [CONSOLE, CONSOLE] }]
  ])(
    'refuses every cookie mutation with %s before any effect',
    async (_name, origin) => {
      const g = await guarded()
      const before = effects(g.app)
      for (const mutation of mutations) {
        const response = await g.app.inject({
          method: mutation.method,
          url: mutation.url,
          headers: { cookie: g.cookie, ...(origin as Record<string, string>) },
          ...('payload' in mutation ? { payload: mutation.payload } : {})
        })
        expect(response.statusCode, `${mutation.method} ${mutation.url}`).toBe(
          403
        )
        expect(response.json().error.code).toBe('forbidden')
        if (!('origin' in origin) || origin.origin === SIBLING) {
          // Answered by the CSRF hook itself (the others by the HTTP hook).
          expect(response.json().error.message).toBe('Origin is not allowed')
          expect(response.headers['cache-control']).toBe('no-store')
        }
      }
      expect(effects(g.app)).toEqual(before)
      expect(g.sessions.revoked).toEqual([])
      const alive = await g.app.inject({
        method: 'GET',
        url: '/v1/session',
        headers: { cookie: g.cookie }
      })
      expect(alive.statusCode).toBe(200)
    }
  )

  it('detects the cookie name exactly like the session parser (M11, M28)', async () => {
    const g = await guarded()
    const cookies: (string | string[])[] = [
      'cvg_operator_session=%%%',
      `${g.cookie}; ${g.cookie}`,
      'cvg_operator_session=',
      'cvg_operator_session',
      ' cvg_operator_session =x',
      'other=1;cvg_operator_session=x',
      ['other=1', 'cvg_operator_session=x']
    ]
    for (const cookie of cookies) {
      const response = await g.app.inject({
        method: 'POST',
        url: '/v1/session/logout',
        headers: { cookie: cookie as string }
      })
      expect(response.statusCode, JSON.stringify(cookie)).toBe(403)
    }
    expect(g.sessions.revoked).toEqual([])
    // A real array header: every element is examined.
    expect(
      hasOperatorSessionCookieName(['other=1', ' cvg_operator_session =x'])
    ).toBe(true)
    expect(
      hasOperatorSessionCookieName(['other=1', 'cvg_operator_sessions=x'])
    ).toBe(false)
  })

  it('lets the exact console Origin through to the existing flow', async () => {
    const g = await guarded()
    const task = await g.app.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { cookie: g.cookie, origin: CONSOLE },
      payload: mutations[0].payload
    })
    // The route itself answers (role refusal of the current flow).
    expect(task.json().error.message).toBe('Role cannot perform task:update')
    const logout = await g.app.inject({
      method: 'POST',
      url: '/v1/session/logout',
      headers: { cookie: g.cookie, origin: CONSOLE }
    })
    expect(logout.statusCode).toBe(200)
    expect(g.sessions.revoked).toHaveLength(1)
    const gone = await g.app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { cookie: g.cookie }
    })
    expect(gone.statusCode).toBe(401)
  })

  it('keeps cookie-less webhooks unchanged', async () => {
    const g = await guarded()
    const plain = build({
      identityMode: 'trusted',
      operatorSessionStore: createInMemoryOperatorSessionStore(),
      httpSecurity: { allowedOrigins: [CONSOLE, SIBLING] },
      webhookVerifier: () => true
    })
    const request = {
      method: 'POST' as const,
      url: '/v1/webhooks/channels/whatsapp/messages',
      headers: { 'x-tenant-id': SYNTHETIC_TENANT_A },
      payload: {
        externalMessageId: 'oidc-guard-webhook-1',
        senderRef: '+5511900000000',
        body: 'Synthetic guard',
        receivedAt: '2026-10-22T12:00:00.000Z'
      }
    }
    const withLogin = await g.app.inject(request)
    const without = await plain.inject(request)
    expect(withLogin.statusCode).toBe(without.statusCode)
    expect(withLogin.statusCode).not.toBe(403)
  })
})

describe('SPEC0254 O8 — HMAC tokens are disabled in the OIDC mode (I6, D10)', () => {
  it.each(['/v1/session', '/v1/cases'])(
    'refuses x-cvg-operator-token on %s with and without a valid cookie, without Set-Cookie',
    async (url) => {
      const g = await guarded()
      for (const cookie of [undefined, g.cookie]) {
        const response = await g.app.inject({
          method: 'GET',
          url,
          headers: {
            'x-cvg-operator-token': 'synthetic.token.value',
            ...(cookie ? { cookie } : {})
          }
        })
        expect(response.statusCode).toBe(401)
        expect(response.json().error.message).toBe(
          'Bootstrap tokens are disabled'
        )
        expect(response.headers['set-cookie']).toBeUndefined()
        expect(response.headers['cache-control']).toBe('no-store')
      }
      const alive = await g.app.inject({
        method: 'GET',
        url: '/v1/session',
        headers: { cookie: g.cookie }
      })
      expect(alive.statusCode).toBe(200)
    }
  )

  it('keeps the probes independent of the token header', async () => {
    const g = await guarded()
    const health = await g.app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-cvg-operator-token': 'synthetic.token.value' }
    })
    expect(health.statusCode).toBe(200)
  })

  it('restores GET /v1/session only by cookie and never creates a session', async () => {
    const g = await guarded()
    const missing = await g.app.inject({ method: 'GET', url: '/v1/session' })
    expect(missing.statusCode).toBe(401)
    expect(missing.json().error.message).toBe(
      'Operator session is missing or expired'
    )
    const restored = await g.app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { cookie: g.cookie }
    })
    expect(restored.statusCode).toBe(200)
    expect(restored.headers['set-cookie']).toBeUndefined()
    expect(restored.json().data.identity.operatorId).toBe(
      'oidc_guard_supervisor'
    )
  })
})
