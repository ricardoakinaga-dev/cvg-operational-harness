// @vitest-environment node
/**
 * SPEC0259 (U08, fatia B1) — Q1 a Q5 da API, em processo.
 *
 * Perfil HTTPS: modo OIDC com `enforceHttps`, proxy confiável `127.0.0.1` e
 * `X-Forwarded-Proto: https` (o `inject` sai de 127.0.0.1). Console, API e
 * segunda origem permitida em hosts distintos do mesmo site sintético; a
 * irmã não está na allowlist. Nenhum dado real, IdP real ou rede externa.
 */
import { connect, type AddressInfo } from 'node:net'
import type { InjectOptions, LightMyRequestResponse } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverOidcOperatorAuthority } from '../oidc-authority.ts'
import { parseOperatorLoginConfig } from '../oidc-config.ts'
import {
  createInMemoryOperatorSessionStore,
  parseOperatorSessionCookie,
  type OperatorSessionStore
} from '../operator-session.ts'
import { buildApiWithProductionSessions } from '../production-bootstrap.ts'
import { InMemoryRateLimiter, type RateLimiterPort } from '../rate-limit.ts'
import {
  buildServer,
  buildServerFromEnv,
  type RuntimeLogEntry
} from '../server.ts'
import {
  cookiePair,
  createSyntheticStateStore,
  setCookies,
  SyntheticOidcIssuer,
  syntheticClientMaterial,
  syntheticOidcEnv,
  type SyntheticUser
} from './support/synthetic-oidc-issuer.ts'

const ISSUER = 'https://idp.other.test'
const CONSOLE = 'https://console.cvg.test'
const REPORTS = 'https://reports.cvg.test'
const SIBLING = 'https://sibling.cvg.test'
const API_HOST = 'api.cvg.test'
const REDIRECT = `https://${API_HOST}/v1/auth/oidc/callback`
const CLIENT = 'cvg-synthetic-console'
const START = '/v1/auth/oidc/start'
const CALLBACK = '/v1/auth/oidc/callback'
const HOST_SESSION = '__Host-' + 'cvg_operator_session'
const HOST_PENDING = '__Host-' + 'cvg_oidc_pending'
const LEGACY_SESSION = 'cvg_operator_session'
const LEGACY_PENDING = 'cvg_oidc_pending'
const NEGADO = `${CONSOLE}/#cvg-login=negado`
const INDISPONIVEL = `${CONSOLE}/#cvg-login=indisponivel`
const material = syntheticClientMaterial()

type App = ReturnType<typeof buildServer>
type Inject = LightMyRequestResponse
type Profile = 'https' | 'http'

function loginEnv(patch: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    CVG_IDENTITY_MODE: 'trusted',
    API_PERSISTENCE_MODE: 'postgres',
    POSTGRES_RLS_ENFORCEMENT: 'true',
    DATABASE_URL: 'postgresql://cvg_runtime:synthetic@127.0.0.1:1/db',
    DATABASE_MIGRATION_URL:
      'postgresql://cvg_migration:synthetic@127.0.0.1:1/db',
    CVG_OPERATOR_SESSION_DATABASE_URL:
      'postgresql://cvg_session:synthetic@127.0.0.1:1/db',
    CVG_OPERATOR_AUTH_SCHEMA: 'cvg_synthetic_auth',
    CVG_OPERATOR_SESSION_ROLE: 'cvg_session',
    API_ALLOWED_ORIGINS: `${CONSOLE},${REPORTS}`,
    ...syntheticOidcEnv({
      issuer: ISSUER,
      clientId: CLIENT,
      clientSecret: material.clientSecret,
      pendingCookieKey: material.pendingCookieKey,
      redirectUri: REDIRECT,
      consoleOrigin: CONSOLE
    }),
    ...patch
  }
}

const httpsEnv = (patch: NodeJS.ProcessEnv = {}) =>
  loginEnv({ API_REQUIRE_HTTPS: 'true', ...patch })

interface SpySessions extends OperatorSessionStore {
  revoked: string[]
  failGet: boolean
}

function spySessions(): SpySessions {
  const inner = createInMemoryOperatorSessionStore()
  const store: SpySessions = {
    revoked: [],
    failGet: false,
    create: (input) => inner.create(input),
    async get(sessionId) {
      if (store.failGet) throw new Error('synthetic session outage')
      return inner.get(sessionId)
    },
    async revoke(sessionId) {
      store.revoked.push(sessionId)
      await inner.revoke(sessionId)
    }
  }
  return store
}

interface SwitchLimiter extends RateLimiterPort {
  denyGlobal: boolean
}

function switchLimiter(): SwitchLimiter {
  const inner = new InMemoryRateLimiter()
  const limiter: SwitchLimiter = {
    denyGlobal: false,
    check(key, policy) {
      if (limiter.denyGlobal && key.startsWith('ip:')) {
        return { allowed: false, retryAfterSeconds: 7 }
      }
      // The start limit (10/min) is the A's; these tests start many logins.
      if (key.startsWith('oidc:start:')) {
        return { allowed: true, retryAfterSeconds: 0 }
      }
      return inner.check(key, policy)
    }
  }
  return limiter
}

interface Harness {
  app: App
  idp: SyntheticOidcIssuer
  authority: Awaited<ReturnType<typeof discoverOidcOperatorAuthority>>
  stateStore: ReturnType<typeof createSyntheticStateStore>
  sessions: SpySessions
  limiter: SwitchLimiter
  logs: RuntimeLogEntry[]
  profile: Profile
  inject: (options: InjectOptions) => Promise<Inject>
}

const opened: App[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  while (opened.length) await opened.pop()!.close()
})

function newIssuer() {
  return new SyntheticOidcIssuer({
    issuer: ISSUER,
    clientId: CLIENT,
    clientSecret: material.clientSecret,
    redirectUri: REDIRECT,
    groupsClaim: 'synthetic_groups'
  })
}

async function harness(
  input: { profile?: Profile; idp?: SyntheticOidcIssuer } = {}
): Promise<Harness> {
  const profile = input.profile ?? 'https'
  const idp = input.idp ?? newIssuer()
  const config = parseOperatorLoginConfig(
    profile === 'https' ? httpsEnv() : loginEnv()
  )!
  const authority = await discoverOidcOperatorAuthority(config, {
    transport: idp.fetch
  })
  const stateStore = createSyntheticStateStore()
  const sessions = spySessions()
  const limiter = switchLimiter()
  const logs: RuntimeLogEntry[] = []
  const app = buildServer({
    identityMode: 'trusted',
    operatorSessionStore: sessions,
    operatorLogin: {
      kind: 'oidc',
      authorityVersion: config.authorityVersion,
      consoleOrigin: config.consoleOrigin,
      authority,
      stateStore
    },
    oidcTransport: idp.fetch,
    rateLimiter: limiter,
    httpSecurity:
      profile === 'https'
        ? {
            allowedOrigins: [CONSOLE, REPORTS],
            enforceHttps: true,
            trustedProxyAddresses: ['127.0.0.1']
          }
        : { allowedOrigins: [CONSOLE, REPORTS] },
    runtimeLogger: (entry) => logs.push(entry)
  })
  // Q2: a route that throws reaches the global error handler (500).
  app.get('/v1/__spec0259_throw', async () => {
    throw new Error('synthetic unexpected failure')
  })
  opened.push(app)
  const inject = (options: InjectOptions): Promise<Inject> => {
    const headers = { ...((options.headers as Record<string, string>) ?? {}) }
    if (profile === 'https') {
      headers['x-forwarded-proto'] ??= 'https'
      headers.host ??= API_HOST
    }
    return app.inject({ ...options, headers })
  }
  return {
    app,
    idp,
    authority,
    stateStore,
    sessions,
    limiter,
    logs,
    profile,
    inject
  }
}

function names(profile: Profile) {
  return profile === 'https'
    ? { session: HOST_SESSION, pending: HOST_PENDING }
    : { session: LEGACY_SESSION, pending: LEGACY_PENDING }
}

function findCookie(response: Inject, name: string, live = true) {
  return setCookies(response.headers['set-cookie']).find(
    (cookie) =>
      cookie.startsWith(`${name}=`) &&
      (live ? !cookie.includes('Max-Age=0') : cookie.includes('Max-Age=0'))
  )
}

interface Flow {
  start: Inject
  pending: string
  pendingValue: string
  callbackPath: string
  code: string
  state: string
}

async function begin(
  h: Harness,
  user: SyntheticUser,
  cookie?: string
): Promise<Flow> {
  const start = await h.inject({
    method: 'POST',
    url: START,
    headers: { origin: CONSOLE, ...(cookie ? { cookie } : {}) }
  })
  expect(start.statusCode).toBe(200)
  const pendingHeader = findCookie(start, names(h.profile).pending)
  expect(pendingHeader).toBeDefined()
  const pending = cookiePair(pendingHeader!)
  const authorized = await h.idp.login(
    start.json().data.authorizationUrl as string,
    user
  )
  expect(authorized.status).toBe(302)
  const target = new URL(authorized.location!)
  return {
    start,
    pending,
    pendingValue: pending.slice(pending.indexOf('=') + 1),
    callbackPath: `${target.pathname}${target.search}`,
    code: target.searchParams.get('code')!,
    state: target.searchParams.get('state')!
  }
}

function callback(
  h: Harness,
  path: string,
  cookie?: string,
  headers: Record<string, string> = {}
) {
  return h.inject({
    method: 'GET',
    url: path,
    headers: { ...headers, ...(cookie !== undefined ? { cookie } : {}) }
  })
}

async function login(h: Harness, user: SyntheticUser, cookie?: string) {
  const flow = await begin(h, user, cookie)
  const done = await callback(h, flow.callbackPath, flow.pending)
  expect(done.statusCode).toBe(303)
  expect(done.headers.location).toBe(`${CONSOLE}/`)
  const sessionHeader = findCookie(done, names(h.profile).session)
  expect(sessionHeader).toBeDefined()
  const session = cookiePair(sessionHeader!)
  return {
    flow,
    done,
    session,
    sessionId: session.slice(session.indexOf('=') + 1)
  }
}

function sessionView(h: Harness, cookie?: string, origin = CONSOLE) {
  return h.inject({
    method: 'GET',
    url: '/v1/session',
    headers: { origin, ...(cookie !== undefined ? { cookie } : {}) }
  })
}

function hooksOf(app: App): Record<string, ((...args: never[]) => unknown)[]> {
  const symbol = Object.getOwnPropertySymbols(app).find(
    (candidate) => candidate.description === 'fastify.hooks'
  )!
  return (
    app as unknown as Record<
      symbol,
      Record<string, ((...args: never[]) => unknown)[]>
    >
  )[symbol]!
}

function expectCredentialedCors(response: Inject) {
  expect(response.headers['access-control-allow-origin']).toBe(CONSOLE)
  expect(response.headers['access-control-allow-credentials']).toBe('true')
  expect(String(response.headers.vary)).toMatch(/\bOrigin\b/)
}

// ---------------------------------------------------------------------------
// Q1 — configuração
// ---------------------------------------------------------------------------

async function refusal(
  build: () => Promise<{ close: () => Promise<unknown> }>
): Promise<string> {
  let app: { close: () => Promise<unknown> } | undefined
  try {
    app = await build()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  await app.close()
  return 'boot accepted the configuration'
}

describe('SPEC0259 Q1 — HTTPS profile configuration refuses the boot', () => {
  const httpConsole = 'http://console.cvg.test'
  const sameHost = `https://${API_HOST}:8443`
  const httpRedirect = 'http://127.0.0.1:3456/v1/auth/oidc/callback'
  const cases: [string, NodeJS.ProcessEnv, RegExp, string][] = [
    [
      'an http: console',
      httpsEnv({
        CVG_OPERATOR_CONSOLE_ORIGIN: httpConsole,
        API_ALLOWED_ORIGINS: `${httpConsole},${REPORTS}`
      }),
      /CVG_OPERATOR_CONSOLE_ORIGIN/,
      'console.cvg.test'
    ],
    [
      'a console on the API host',
      httpsEnv({
        CVG_OPERATOR_CONSOLE_ORIGIN: sameHost,
        API_ALLOWED_ORIGINS: `${sameHost},${REPORTS}`
      }),
      /CVG_OPERATOR_CONSOLE_ORIGIN/,
      API_HOST
    ],
    [
      'an http: redirect',
      httpsEnv({ CVG_OIDC_REDIRECT_URI: httpRedirect }),
      /CVG_OIDC_REDIRECT_URI/,
      '127.0.0.1:3456'
    ]
  ]

  it.each(cases)(
    'refuses %s before any pool or listener, naming the variable only',
    async (_name, env, expected, value) => {
      expect(() => parseOperatorLoginConfig(env)).toThrow(expected)
      for (const build of [
        () => buildServerFromEnv(env),
        () => buildApiWithProductionSessions(env)
      ]) {
        const message = await refusal(build)
        expect(message).toMatch(expected)
        expect(message).not.toContain(value)
        expect(message).not.toContain(material.clientSecret)
      }
    }
  )

  it('keeps the HTTP profile cases of the A accepted', () => {
    const accepted = parseOperatorLoginConfig(
      loginEnv({
        CVG_OPERATOR_CONSOLE_ORIGIN: 'http://localhost:4456',
        API_ALLOWED_ORIGINS: 'http://localhost:4456',
        CVG_OIDC_REDIRECT_URI: 'http://127.0.0.1:3456/v1/auth/oidc/callback'
      })
    )
    expect(accepted?.consoleOrigin).toBe('http://localhost:4456')
    expect(parseOperatorLoginConfig(httpsEnv())?.consoleOrigin).toBe(CONSOLE)
  })
})

// ---------------------------------------------------------------------------
// Q2 — CORS com credenciais só para o console
// ---------------------------------------------------------------------------

describe('SPEC0259 Q2 — credentialed CORS only for the console origin', () => {
  it('answers ACAO, ACAC and Vary in 200, 401, 403, 404, 429, 500 and 503', async () => {
    const h = await harness()
    const supervisor = h.idp.addUser({ groups: ['synthetic-a-supervisor'] })
    const { session } = await login(h, supervisor)
    const statuses: number[] = []
    const check = (response: Inject, status: number) => {
      expect(response.statusCode).toBe(status)
      expectCredentialedCors(response)
      expect(response.headers['access-control-expose-headers']).toBeDefined()
      statuses.push(status)
    }
    check(await sessionView(h, session), 200)
    check(await sessionView(h), 401)
    // Route 403: a Supervisor lacks task:update.
    check(
      await h.inject({
        method: 'POST',
        url: '/v1/tasks',
        headers: { origin: CONSOLE, cookie: session },
        payload: {}
      }),
      403
    )
    check(
      await h.inject({
        method: 'GET',
        url: '/v1/spec0259-missing',
        headers: { origin: CONSOLE }
      }),
      404
    )
    h.limiter.denyGlobal = true
    check(await sessionView(h, session), 429)
    h.limiter.denyGlobal = false
    check(
      await h.inject({
        method: 'GET',
        url: '/v1/__spec0259_throw',
        headers: { origin: CONSOLE }
      }),
      500
    )
    h.sessions.failGet = true
    check(
      await h.inject({
        method: 'GET',
        url: '/v1/tasks',
        headers: { origin: CONSOLE, cookie: session }
      }),
      503
    )
    expect(statuses).toEqual([200, 401, 403, 404, 429, 500, 503])
  })

  it('accepts the credentialed preflight only for GET, POST, PATCH and accept, content-type', async () => {
    const h = await harness()
    for (const method of ['GET', 'POST', 'PATCH']) {
      const preflight = await h.inject({
        method: 'OPTIONS',
        url: '/v1/tasks',
        headers: {
          origin: CONSOLE,
          'access-control-request-method': method,
          'access-control-request-headers': 'content-type, accept'
        }
      })
      expect(preflight.statusCode).toBe(204)
      expectCredentialedCors(preflight)
      expect(preflight.headers['access-control-allow-methods']).toBe(
        'GET, POST, PATCH'
      )
      expect(preflight.headers['access-control-allow-headers']).toBe(
        'accept, content-type'
      )
      expect(preflight.headers['access-control-max-age']).toBe('600')
    }
    for (const [method, requested] of [
      ['POST', 'x-tenant-id'],
      ['POST', 'x-operator-role'],
      ['GET', 'x-cvg-operator-token'],
      ['POST', 'content-type, x-operator-id'],
      ['DELETE', undefined],
      ['OPTIONS', undefined]
    ] as const) {
      const refused = await h.inject({
        method: 'OPTIONS',
        url: '/v1/tasks',
        headers: {
          origin: CONSOLE,
          'access-control-request-method': method,
          ...(requested ? { 'access-control-request-headers': requested } : {})
        }
      })
      expect(refused.statusCode).toBe(403)
      expect(refused.headers['access-control-allow-origin']).toBeUndefined()
      expect(
        refused.headers['access-control-allow-credentials']
      ).toBeUndefined()
    }
  })

  it('keeps another allowed origin without ACAC and refuses a sibling without ACAO', async () => {
    const h = await harness()
    const real = await sessionView(h, undefined, REPORTS)
    expect(real.statusCode).toBe(401)
    expect(real.headers['access-control-allow-origin']).toBe(REPORTS)
    expect(real.headers['access-control-allow-credentials']).toBeUndefined()
    expect(String(real.headers.vary)).toMatch(/\bOrigin\b/)
    const preflight = await h.inject({
      method: 'OPTIONS',
      url: '/v1/tasks',
      headers: {
        origin: REPORTS,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'x-tenant-id'
      }
    })
    expect(preflight.statusCode).toBe(204)
    expect(preflight.headers['access-control-allow-origin']).toBe(REPORTS)
    expect(
      preflight.headers['access-control-allow-credentials']
    ).toBeUndefined()
    expect(preflight.headers['access-control-allow-methods']).toBe(
      'GET, POST, PATCH, OPTIONS'
    )
    for (const origin of [SIBLING, 'null', `http://console.cvg.test`]) {
      const refused = await sessionView(h, undefined, origin)
      expect(refused.statusCode).toBe(403)
      expect(refused.headers['access-control-allow-origin']).toBeUndefined()
      expect(
        refused.headers['access-control-allow-credentials']
      ).toBeUndefined()
    }
    const absent = await h.inject({ method: 'GET', url: '/v1/session' })
    expect(absent.headers['access-control-allow-origin']).toBeUndefined()
    expect(absent.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('installs the HTTP hook as the first onRequest after the target hook', async () => {
    const h = await harness()
    await h.app.ready()
    const onRequest = hooksOf(h.app).onRequest!.map((hook) => hook.name)
    expect(onRequest[0]).toBe('requestTargetOnRequest')
    expect(onRequest[1]).toBe('httpSecurityOnRequest')
    expect(
      onRequest.filter((name) => name === 'httpSecurityOnRequest')
    ).toHaveLength(1)
  })

  it('never sends ACAC without the OIDC login', async () => {
    const app = buildServer({
      identityMode: 'simulation',
      httpSecurity: { allowedOrigins: [CONSOLE] }
    })
    opened.push(app)
    const response = await app.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { origin: CONSOLE }
    })
    expect(response.headers['access-control-allow-origin']).toBe(CONSOLE)
    expect(response.headers['access-control-allow-credentials']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Q3 — cookies __Host- no perfil HTTPS e comparação exata do nome
// ---------------------------------------------------------------------------

const UNICODE_PREFIXES: [string, string][] = [
  ['U+00A0', ' '],
  ['U+FEFF', '﻿'],
  ['U+200B', '​'],
  ['U+2003', ' '],
  ['U+3000', '　'],
  ['U+0085', '\u0085'],
  ['U+000B', '\u000b'],
  ['U+000C', '\u000c'],
  ['U+2028', ' ']
]

function caseVariants(name: string): string[] {
  return name.startsWith('__Host-')
    ? [name.replace('__Host-', '__HOST-'), name.replace('__Host-', '__host-')]
    : [name.toUpperCase(), name.replace('cvg_', 'CVG_')]
}

const listening = new WeakMap<App, number>()

async function rawRequest(
  app: App,
  head: Buffer[],
  profile: Profile
): Promise<{ status: number; location: string | null }> {
  if (!listening.has(app)) {
    await app.listen({ port: 0, host: '127.0.0.1' })
    listening.set(app, (app.server.address() as AddressInfo).port)
  }
  const port = listening.get(app)!
  return new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1', () => {
      socket.write(
        Buffer.concat([
          ...head,
          Buffer.from(
            `Host: ${API_HOST}\r\n${profile === 'https' ? 'X-Forwarded-Proto: https\r\n' : ''}Connection: close\r\n\r\n`,
            'latin1'
          )
        ])
      )
    })
    const chunks: Buffer[] = []
    socket.on('data', (chunk: Buffer) => chunks.push(chunk))
    socket.on('error', reject)
    socket.on('end', () => {
      const text = Buffer.concat(chunks).toString('latin1')
      const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0)
      const location = /\r\nlocation: ([^\r]*)\r\n/i.exec(text)?.[1] ?? null
      resolve({ status, location })
    })
  })
}

describe('SPEC0259 Q3 — host-prefixed cookies in the HTTPS profile', () => {
  it('writes and clears __Host- cookies with Secure, HttpOnly, Path=/ and no Domain', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    const pending = findCookie(flow.start, HOST_PENDING)!
    expect(pending).toMatch(/^__Host-cvg_oidc_pending=[A-Za-z0-9_-]+; /)
    for (const attribute of [
      'Path=/',
      'HttpOnly',
      'SameSite=Lax',
      'Max-Age=300',
      'Secure'
    ]) {
      expect(pending.split('; ')).toContain(attribute)
    }
    expect(pending).not.toMatch(/domain=/i)

    const done = await callback(h, flow.callbackPath, flow.pending)
    expect(done.statusCode).toBe(303)
    const operational = findCookie(done, HOST_SESSION)!
    expect(operational).toMatch(/^__Host-cvg_operator_session=opsess_/)
    for (const attribute of [
      'Path=/',
      'HttpOnly',
      'SameSite=Strict',
      'Secure'
    ]) {
      expect(operational.split('; ')).toContain(attribute)
    }
    expect(operational).not.toMatch(/domain=/i)
    const clearedPending = findCookie(done, HOST_PENDING, false)!
    expect(clearedPending.split('; ')).toEqual(
      expect.arrayContaining(['Path=/', 'Secure', 'Max-Age=0'])
    )
    expect(setCookies(done.headers['set-cookie']).join('\n')).not.toMatch(
      /(^|\n)cvg_/
    )

    const session = cookiePair(operational)
    const sessionId = session.slice(session.indexOf('=') + 1)
    // 401 of the session hook clears by the __Host- name with Secure.
    const unknown = await h.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: {
        origin: CONSOLE,
        cookie: `${HOST_SESSION}=opsess_unknown_0259`
      }
    })
    expect(unknown.statusCode).toBe(401)
    const cleared401 = findCookie(unknown, HOST_SESSION, false)!
    expect(cleared401.split('; ')).toEqual(
      expect.arrayContaining(['Path=/', 'Secure', 'Max-Age=0'])
    )
    // Logout revokes and clears by the __Host- name.
    const logout = await h.inject({
      method: 'POST',
      url: '/v1/session/logout',
      headers: { origin: CONSOLE, cookie: session }
    })
    expect(logout.statusCode).toBe(200)
    expect(h.sessions.revoked).toEqual([sessionId])
    const clearedLogout = findCookie(logout, HOST_SESSION, false)!
    expect(clearedLogout.split('; ')).toEqual(
      expect.arrayContaining(['Path=/', 'Secure', 'Max-Age=0'])
    )
    expect((await sessionView(h, session)).statusCode).toBe(401)
  })

  it('never authenticates, revokes or reads a pending with the legacy names', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const { sessionId } = await login(h, user)
    const legacy = `${LEGACY_SESSION}=${sessionId}`
    expect(
      (
        await h.inject({
          method: 'GET',
          url: '/v1/tasks',
          headers: { origin: CONSOLE, cookie: legacy }
        })
      ).statusCode
    ).toBe(401)
    expect((await sessionView(h, legacy)).statusCode).toBe(401)
    const logout = await h.inject({
      method: 'POST',
      url: '/v1/session/logout',
      headers: { origin: CONSOLE, cookie: legacy }
    })
    expect(logout.statusCode).toBe(200)
    expect(h.sessions.revoked).toEqual([])
    expect(
      (await sessionView(h, `${HOST_SESSION}=${sessionId}`)).statusCode
    ).toBe(200)
    // Mutation with the legacy name and no Origin: the CSRF guard answers.
    const mutation = await h.inject({
      method: 'POST',
      url: '/v1/tasks',
      headers: { cookie: legacy },
      payload: {}
    })
    expect(mutation.statusCode).toBe(403)
    // Both names: only __Host- counts.
    const other = await login(
      h,
      h.idp.addUser({ groups: ['synthetic-a-approver'] })
    )
    const both = await sessionView(
      h,
      `${LEGACY_SESSION}=${other.sessionId}; ${HOST_SESSION}=${sessionId}`
    )
    expect(both.statusCode).toBe(200)
    expect(both.json().data.identity.role).toBe('Operator')
    // A legacy pending with a valid state is refused before the token endpoint.
    const flow = await begin(h, user)
    const tokenCalls = h.idp.calls.token
    const consumed = h.stateStore.consumed
    const refused = await callback(
      h,
      flow.callbackPath,
      `${LEGACY_PENDING}=${flow.pendingValue}`
    )
    expect(refused.statusCode).toBe(303)
    expect(refused.headers.location).toBe(NEGADO)
    expect(h.idp.calls.token).toBe(tokenCalls)
    expect(h.stateStore.consumed).toBe(consumed)
  })

  it.each(['https', 'http'] as const)(
    'compares the cookie name exactly in the %s profile (Unicode spaces, case, SP and HTAB)',
    async (profile) => {
      const h = await harness({ profile })
      const { session: sessionName, pending: pendingName } = names(profile)
      const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
      const { sessionId } = await login(h, user)
      const variants = [
        ...UNICODE_PREFIXES.map(([, prefix]) => `${prefix}${sessionName}`),
        ...caseVariants(sessionName)
      ]
      for (const name of variants) {
        const response = await sessionView(h, `other=1; ${name}=${sessionId}`)
        expect(response.statusCode, JSON.stringify(name)).toBe(401)
        expect(
          parseOperatorSessionCookie(
            `${name}=${sessionId}`,
            profile === 'https'
              ? { profile: 'host-prefixed' }
              : { profile: 'legacy', secure: false }
          ),
          JSON.stringify(name)
        ).toBeNull()
      }
      for (const separator of [' ', '\t', ' \t ']) {
        const response = await sessionView(
          h,
          `other=1;${separator}${sessionName}${separator}=${separator}${sessionId}`
        )
        expect(response.statusCode, JSON.stringify(separator)).toBe(200)
      }
      // Pending: the same names are not the pending cookie.
      for (const name of [
        ...UNICODE_PREFIXES.map(([, prefix]) => `${prefix}${pendingName}`),
        ...caseVariants(pendingName)
      ]) {
        const flow = await begin(h, user)
        const tokenCalls = h.idp.calls.token
        const refused = await callback(
          h,
          flow.callbackPath,
          `${name}=${flow.pendingValue}`
        )
        expect(refused.statusCode, JSON.stringify(name)).toBe(303)
        expect(refused.headers.location).toBe(NEGADO)
        expect(h.idp.calls.token).toBe(tokenCalls)
      }
      const flow = await begin(h, user)
      const accepted = await callback(
        h,
        flow.callbackPath,
        `other=1;\t ${pendingName} =${flow.pendingValue}`
      )
      expect(accepted.statusCode).toBe(303)
      expect(accepted.headers.location).toBe(`${CONSOLE}/`)
    },
    60_000
  )

  it.each(['https', 'http'] as const)(
    'refuses the raw 0xA0 byte before the name over a socket in the %s profile',
    async (profile) => {
      const h = await harness({ profile })
      const { session: sessionName, pending: pendingName } = names(profile)
      const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
      const { sessionId } = await login(h, user)
      const flow = await begin(h, user)
      const tokenCalls = h.idp.calls.token
      const line = (prefix: number[], name: string, value: string) =>
        Buffer.concat([
          Buffer.from('Cookie: other=1; ', 'latin1'),
          Buffer.from(prefix),
          Buffer.from(`${name}=${value}\r\n`, 'latin1')
        ])
      const sessionRaw = await rawRequest(
        h.app,
        [
          Buffer.from('GET /v1/session HTTP/1.1\r\n'),
          line([0xa0], sessionName, sessionId)
        ],
        profile
      )
      expect(sessionRaw.status).toBe(401)
      const sessionControl = await rawRequest(
        h.app,
        [
          Buffer.from('GET /v1/session HTTP/1.1\r\n'),
          line([0x20], sessionName, sessionId)
        ],
        profile
      )
      expect(sessionControl.status).toBe(200)
      const pendingRaw = await rawRequest(
        h.app,
        [
          Buffer.from(`GET ${flow.callbackPath} HTTP/1.1\r\n`),
          line([0xa0], pendingName, flow.pendingValue)
        ],
        profile
      )
      expect(pendingRaw.status).toBe(303)
      expect(pendingRaw.location).toBe(NEGADO)
      expect(h.idp.calls.token).toBe(tokenCalls)
    }
  )

  it('fails closed on two raw cookies with the same exact name (O15)', async () => {
    const h = await harness()
    const first = await login(
      h,
      h.idp.addUser({ groups: ['synthetic-a-operator'] })
    )
    const second = await login(
      h,
      h.idp.addUser({ groups: ['synthetic-a-approver'] })
    )
    const response = await sessionView(
      h,
      `${HOST_SESSION}=${first.sessionId}; ${HOST_SESSION}=${second.sessionId}`
    )
    expect(response.statusCode).toBe(401)
  })

  it('refuses a composition whose authority and server cookie profiles differ', async () => {
    const idp = newIssuer()
    for (const [env, httpSecurity] of [
      [httpsEnv(), { allowedOrigins: [CONSOLE, REPORTS] }],
      [
        loginEnv(),
        {
          allowedOrigins: [CONSOLE, REPORTS],
          enforceHttps: true,
          trustedProxyAddresses: ['127.0.0.1']
        }
      ]
    ] as const) {
      const config = parseOperatorLoginConfig(env)!
      const authority = await discoverOidcOperatorAuthority(config, {
        transport: idp.fetch
      })
      expect(() =>
        buildServer({
          identityMode: 'trusted',
          operatorSessionStore: createInMemoryOperatorSessionStore(),
          operatorLogin: {
            kind: 'oidc',
            authorityVersion: config.authorityVersion,
            consoleOrigin: config.consoleOrigin,
            authority,
            stateStore: createSyntheticStateStore()
          },
          oidcTransport: idp.fetch,
          httpSecurity
        })
      ).toThrow(/cookie profile/)
    }
  })

  it('keeps the legacy names in the HTTP profile', async () => {
    const h = await harness({ profile: 'http' })
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const { done, session } = await login(h, user)
    expect(session.startsWith(`${LEGACY_SESSION}=opsess_`)).toBe(true)
    expect(setCookies(done.headers['set-cookie']).join('\n')).not.toContain(
      '__Host-'
    )
    expect((await sessionView(h, session)).statusCode).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// Q4 — private, no-store em todo /v1/** no modo OIDC
// ---------------------------------------------------------------------------

function registeredRoutes(app: App): { method: string; url: string }[] {
  const routes: { method: string; url: string }[] = []
  const stack: string[] = []
  for (const line of app.printRoutes({ commonPrefix: false }).split('\n')) {
    const match =
      /^((?:│ {3}| {4})*)(?:├── |└── )(\S+)(?: \(([^)]+)\))?$/u.exec(line)
    if (!match) continue
    const depth = match[1]!.length / 4
    stack.length = depth
    const url = `${stack.join('')}${match[2]}`
    stack.push(match[2]!)
    for (const method of (match[3] ?? '').split(', ').filter(Boolean)) {
      routes.push({ method, url })
    }
  }
  return routes
}

describe('SPEC0259 Q4 — private, no-store on every /v1/** answer of the OIDC mode', () => {
  it('covers the registered /v1/** inventory and the 200, 303, 401, 403, 404, 429 and 503 answers', async () => {
    const h = await harness()
    const supervisor = h.idp.addUser({ groups: ['synthetic-a-supervisor'] })
    const { session, done } = await login(h, supervisor)
    await h.app.ready()
    const inventory = registeredRoutes(h.app).filter(
      (route) => route.url.startsWith('/v1/') && route.method !== 'HEAD'
    )
    expect(inventory.length).toBeGreaterThan(40)
    const seen = new Set<number>()
    for (const route of inventory) {
      const url = route.url.replace(/:[A-Za-z]+/g, 'spec0259-synthetic')
      const response = await h.inject({
        method: route.method as NonNullable<InjectOptions['method']>,
        url,
        headers: { origin: CONSOLE, cookie: session },
        ...(route.method === 'GET' || route.method === 'OPTIONS'
          ? {}
          : { payload: {} })
      })
      expect(
        response.headers['cache-control'],
        `${route.method} ${route.url} → ${response.statusCode}`
      ).toBe('private, no-store')
      seen.add(response.statusCode)
    }
    expect(done.headers['cache-control']).toBe('private, no-store')
    seen.add(done.statusCode)
    const extra: Inject[] = [
      await sessionView(h),
      await h.inject({
        method: 'POST',
        url: '/v1/tasks',
        headers: { cookie: session },
        payload: {}
      }),
      await h.inject({ method: 'GET', url: '/v1/spec0259-missing' })
    ]
    h.limiter.denyGlobal = true
    extra.push(await sessionView(h, session))
    h.limiter.denyGlobal = false
    h.sessions.failGet = true
    extra.push(
      await h.inject({
        method: 'GET',
        url: '/v1/tasks',
        headers: { origin: CONSOLE, cookie: session }
      })
    )
    h.sessions.failGet = false
    for (const response of extra) {
      expect(response.headers['cache-control']).toBe('private, no-store')
      seen.add(response.statusCode)
    }
    for (const status of [200, 303, 401, 403, 404, 429, 503]) {
      expect(seen.has(status), String(status)).toBe(true)
    }
    // Probes keep their own cache headers.
    for (const probe of ['/health', '/live', '/ready', '/health/metrics']) {
      const response = await h.inject({ method: 'GET', url: probe })
      expect(response.headers['cache-control'] ?? null).not.toBe(
        'private, no-store'
      )
    }
  }, 60_000)

  it('keeps the current cache headers without the OIDC login', async () => {
    const app = buildServer({ identityMode: 'simulation' })
    opened.push(app)
    const tasks = await app.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: {
        'x-operator-id': 'operator.synthetic',
        'x-operator-role': 'Operator',
        'x-tenant-id': 'tenant_00000000-0000-4000-8000-000000000001'
      }
    })
    expect(tasks.headers['cache-control']).toBe('no-store')
    const missing = await app.inject({ method: 'GET', url: '/v1/missing' })
    expect(missing.headers['cache-control']).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Q5 — callback volta sempre ao console
// ---------------------------------------------------------------------------

describe('SPEC0259 Q5 — the callback always lands on the console', () => {
  it('lands refusals on #cvg-login=negado with the pending cleared', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-unrelated'] })
    const flow = await begin(h, user)
    const response = await callback(h, flow.callbackPath, flow.pending)
    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe(NEGADO)
    expect(response.body).toBe('')
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(findCookie(response, HOST_PENDING, false)).toBeDefined()
    expect(findCookie(response, HOST_SESSION)).toBeUndefined()
    expect(h.idp.calls.token).toBe(1)
    const entry = h.logs.find(
      (log) => log.event === 'operator_login.callback' && log.status === 'error'
    )
    expect(entry?.errorCode).toBe('no_eligible_group')
  })

  it('lands IdP outages on #cvg-login=indisponivel with the pending cleared', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    h.idp.controls.tokenStatus = 500
    const response = await callback(h, flow.callbackPath, flow.pending)
    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe(INDISPONIVEL)
    expect(findCookie(response, HOST_PENDING, false)).toBeDefined()
    expect(h.idp.calls.token).toBe(1)
  })

  it('keeps the pending on a state store outage and leaves it untouched on limits', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    h.stateStore.unavailable = true
    const outage = await callback(h, flow.callbackPath, flow.pending)
    expect(outage.statusCode).toBe(303)
    expect(outage.headers.location).toBe(INDISPONIVEL)
    expect(setCookies(outage.headers['set-cookie'])).toEqual([])
    h.stateStore.unavailable = false

    for (let index = 0; index < 30; index += 1) {
      await callback(h, CALLBACK)
    }
    const limited = await callback(h, flow.callbackPath, flow.pending)
    expect(limited.statusCode).toBe(303)
    expect(limited.headers.location).toBe(INDISPONIVEL)
    expect(setCookies(limited.headers['set-cookie'])).toEqual([])

    const broken = await harness()
    vi.spyOn(broken.limiter, 'check').mockImplementation((key) => {
      if (key.startsWith('oidc:callback:')) throw new Error('limiter down')
      return { allowed: true, retryAfterSeconds: 0 }
    })
    const failing = await callback(broken, CALLBACK, `${HOST_PENDING}=x`)
    expect(failing.statusCode).toBe(303)
    expect(failing.headers.location).toBe(INDISPONIVEL)
    expect(setCookies(failing.headers['set-cookie'])).toEqual([])
  })

  it('keeps the global 429 as JSON', async () => {
    const h = await harness()
    h.limiter.denyGlobal = true
    const response = await callback(h, CALLBACK)
    expect(response.statusCode).toBe(429)
    expect(response.json().error.code).toBe('rate_limited')
  })

  it('never lets the request choose the destination nor carries code, state or reason', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const evil = 'https://evil.other.test'
    for (const extra of ['return_to', 'next', 'redirect_uri', 'url']) {
      const flow = await begin(h, user)
      const response = await callback(
        h,
        `${flow.callbackPath}&${extra}=${encodeURIComponent(evil)}`,
        flow.pending,
        {
          host: 'evil.other.test',
          'x-forwarded-host': 'evil.other.test',
          // An allowed non-console origin passes the HTTP hook; a refused one
          // never reaches the handler (403 JSON of the hook, §4.5).
          origin: REPORTS,
          referer: `${evil}/`
        }
      )
      expect(response.statusCode).toBe(303)
      const location = String(response.headers.location)
      expect([`${CONSOLE}/`, NEGADO, INDISPONIVEL]).toContain(location)
      for (const forbidden of [
        flow.code,
        flow.state,
        'state_invalid',
        'evil'
      ]) {
        expect(location).not.toContain(forbidden)
      }
    }
    const success = await begin(h, user)
    const done = await callback(h, success.callbackPath, success.pending, {
      'x-forwarded-host': 'evil.other.test',
      referer: `${evil}/`
    })
    expect(done.headers.location).toBe(`${CONSOLE}/`)
  })

  it('maps an unexpected failure of the callback handler to #cvg-login=indisponivel (O5)', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    vi.spyOn(h.authority, 'clearPendingCookie').mockImplementation(() => {
      throw new TypeError('synthetic programming error')
    })
    const response = await callback(h, flow.callbackPath, flow.pending)
    expect(response.statusCode).toBe(303)
    expect(response.headers.location).toBe(INDISPONIVEL)
    expect(response.body).toBe('')
  })

  it.each([
    ['a failure without class', new Error('synthetic failure'), INDISPONIVEL],
    [
      'a 5xx failure',
      Object.assign(new Error('synthetic outage'), { statusCode: 503 }),
      INDISPONIVEL
    ],
    [
      'a 4xx failure',
      Object.assign(new Error('synthetic refusal'), { statusCode: 403 }),
      NEGADO
    ],
    [
      'a 4xx failure by status',
      Object.assign(new Error('synthetic refusal'), { status: 401 }),
      NEGADO
    ]
  ])(
    'lands %s after step 1 by its class and clears the pending (default exit, I8)',
    async (_name, failure, location) => {
      const h = await harness()
      const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
      const flow = await begin(h, user)
      // A seam outside the tabled steps: the success log of step 9 throws,
      // after the session exists and before any cookie is answered.
      const push = h.logs.push.bind(h.logs)
      vi.spyOn(h.logs, 'push').mockImplementation((entry) => {
        if (
          entry.event === 'operator_login.callback' &&
          entry.status === 'ok'
        ) {
          throw failure
        }
        return push(entry)
      })
      const response = await callback(h, flow.callbackPath, flow.pending)
      expect(response.statusCode).toBe(303)
      expect(response.headers.location).toBe(location)
      expect(response.body).toBe('')
      const cookies = setCookies(response.headers['set-cookie'])
      expect(cookies).toHaveLength(1)
      const cleared = findCookie(response, HOST_PENDING, false)!
      expect(cleared.split('; ')).toEqual(
        expect.arrayContaining(['Path=/', 'Secure', 'Max-Age=0'])
      )
      expect(cookies.join('\n')).not.toContain(HOST_SESSION)
    }
  )

  it('keeps the pending untouched when the default exit comes from step 1 or the state-store outage', async () => {
    const failing =
      (event: string, step: string) => (entry: RuntimeLogEntry) => {
        if (entry.event === event && entry.errorCode === step) {
          throw new Error('synthetic log failure')
        }
        return 0
      }
    // Step 1: the limiter fails and its log throws.
    const limited = await harness()
    vi.spyOn(limited.limiter, 'check').mockImplementation((key) => {
      if (key.startsWith('oidc:callback:')) throw new Error('limiter down')
      return { allowed: true, retryAfterSeconds: 0 }
    })
    vi.spyOn(limited.logs, 'push').mockImplementation(
      failing('operator_login.callback', 'rate_limited')
    )
    const first = await callback(limited, CALLBACK, `${HOST_PENDING}=x`)
    expect(first.statusCode).toBe(303)
    expect(first.headers.location).toBe(INDISPONIVEL)
    expect(setCookies(first.headers['set-cookie'])).toEqual([])
    // Step 3: the state store is out and its log throws.
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    h.stateStore.unavailable = true
    vi.spyOn(h.logs, 'push').mockImplementation(
      failing('operator_login.callback', 'state_unavailable')
    )
    const outage = await callback(h, flow.callbackPath, flow.pending)
    expect(outage.statusCode).toBe(303)
    expect(outage.headers.location).toBe(INDISPONIVEL)
    expect(setCookies(outage.headers['set-cookie'])).toEqual([])
  })

  it('keeps the start answering JSON', async () => {
    const h = await harness()
    const refused = await h.inject({
      method: 'POST',
      url: START,
      headers: { origin: REPORTS }
    })
    expect(refused.statusCode).toBe(403)
    expect(refused.json().error.code).toBe('forbidden')
  })
})
