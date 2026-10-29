// @vitest-environment node
/**
 * SPEC0254 O3, O4, O5, O11 and the route-level part of O6, in process:
 * `buildServer` with in-memory stores and the synthetic IdP over an
 * in-memory (and, once, HTTPS) transport. Every refusal ends without a
 * session and without a principal write (except the P4 deactivation).
 */
import type { InjectOptions, LightMyRequestResponse } from 'fastify'
import { CompositeTelemetry } from '@cvg/observability'
import { CaseAuthorityError } from '@cvg/persistence'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverOidcOperatorAuthority } from '../oidc-authority.ts'
import { parseOperatorLoginConfig } from '../oidc-config.ts'
import {
  createInMemoryOperatorSessionStore,
  type OperatorSessionStore
} from '../operator-session.ts'
import { buildServer, type RuntimeLogEntry } from '../server.ts'
import {
  cookiePair,
  createSyntheticStateStore,
  expectedOperatorId,
  findLeaks,
  setCookies,
  SyntheticOidcIssuer,
  syntheticClientMaterial,
  syntheticOidcEnv,
  syntheticTotp,
  SYNTHETIC_TENANT_A,
  type SyntheticTransport,
  type SyntheticUser
} from './support/synthetic-oidc-issuer.ts'

const ISSUER = 'https://idp.synthetic.test'
const CONSOLE = 'https://console.synthetic.test'
const SIBLING = 'https://sibling.synthetic.test'
const REDIRECT = 'https://api.synthetic.test/v1/auth/oidc/callback'
const CLIENT = 'cvg-synthetic-console'
const START = '/v1/auth/oidc/start'
const material = syntheticClientMaterial()

type App = ReturnType<typeof buildServer>
type Inject = LightMyRequestResponse

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
    API_ALLOWED_ORIGINS: `${CONSOLE},${SIBLING}`,
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

function newIssuer(secret = material.clientSecret) {
  return new SyntheticOidcIssuer({
    issuer: ISSUER,
    clientId: CLIENT,
    clientSecret: secret,
    redirectUri: REDIRECT,
    groupsClaim: 'synthetic_groups'
  })
}

interface SpySessions extends OperatorSessionStore {
  created: number
  revoked: string[]
  failCreate: boolean
  /** Runs right after the store accepted a create (before the route continues). */
  afterCreate?: () => Promise<void>
  lastPrincipalRevision?: number
}

function spySessions(): SpySessions {
  const inner = createInMemoryOperatorSessionStore()
  const store: SpySessions = {
    created: 0,
    revoked: [],
    failCreate: false,
    async create(input) {
      if (store.failCreate) throw new Error('synthetic session outage')
      const record = await inner.create(input)
      store.created += 1
      store.lastPrincipalRevision = input.principalRevision
      await store.afterCreate?.()
      return record
    },
    get: (sessionId) => inner.get(sessionId),
    async revoke(sessionId) {
      store.revoked.push(sessionId)
      await inner.revoke(sessionId)
    }
  }
  return store
}

interface Harness {
  app: App
  idp: SyntheticOidcIssuer
  authorityVersion: string
  stateStore: ReturnType<typeof createSyntheticStateStore>
  sessions: SpySessions
  telemetry: CompositeTelemetry
  logs: RuntimeLogEntry[]
  texts: string[]
  inject: (options: InjectOptions) => Promise<Inject>
  start: (headers?: Record<string, string | string[]>) => Promise<Inject>
}

const opened: App[] = []

async function harness(
  input: {
    idp?: SyntheticOidcIssuer
    env?: NodeJS.ProcessEnv
    transport?: SyntheticTransport
    stateStore?: ReturnType<typeof createSyntheticStateStore>
  } = {}
): Promise<Harness> {
  const idp = input.idp ?? newIssuer()
  const config = parseOperatorLoginConfig(loginEnv(input.env))!
  const transport = input.transport ?? idp.fetch
  const authority = await discoverOidcOperatorAuthority(config, { transport })
  const stateStore = input.stateStore ?? createSyntheticStateStore()
  const sessions = spySessions()
  const telemetry = new CompositeTelemetry()
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
    oidcTransport: transport,
    httpSecurity: { allowedOrigins: [CONSOLE, SIBLING] },
    telemetry,
    runtimeLogger: (entry) => logs.push(entry)
  })
  opened.push(app)
  const texts: string[] = []
  const inject = async (options: InjectOptions): Promise<Inject> => {
    const response = await app.inject(options)
    const opts = options as { method?: string; url?: unknown }
    const authorizationUrlAllowed =
      opts.method === 'POST' &&
      opts.url === START &&
      response.statusCode === 200
    texts.push(JSON.stringify(response.headers))
    if (!authorizationUrlAllowed) texts.push(response.body)
    return response
  }
  return {
    app,
    idp,
    authorityVersion: config.authorityVersion,
    stateStore,
    sessions,
    telemetry,
    logs,
    texts,
    inject,
    start: (headers = { origin: CONSOLE }) =>
      inject({ method: 'POST', url: START, headers })
  }
}

afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  while (opened.length) await opened.pop()!.close()
})

function pendingOf(response: Inject): string {
  const pending = setCookies(response.headers['set-cookie']).find((cookie) =>
    cookie.startsWith('cvg_oidc_pending=')
  )
  expect(pending).toBeDefined()
  return cookiePair(pending!)
}

function sessionCookieOf(response: Inject): string {
  const cookie = setCookies(response.headers['set-cookie']).find(
    (value) =>
      value.startsWith('cvg_operator_session=') && !value.includes('Max-Age=0')
  )
  expect(cookie).toBeDefined()
  return cookiePair(cookie!)
}

function clearsPending(response: Inject): boolean {
  return setCookies(response.headers['set-cookie']).some(
    (cookie) =>
      cookie.startsWith('cvg_oidc_pending=;') && cookie.includes('Max-Age=0')
  )
}

function touchesOperationalCookie(response: Inject): boolean {
  return setCookies(response.headers['set-cookie']).some((cookie) =>
    cookie.startsWith('cvg_operator_session=')
  )
}

interface Flow {
  start: Inject
  pending: string
  authorizationUrl: string
  callbackPath: string
}

async function begin(
  h: Harness,
  user: SyntheticUser,
  headers: Record<string, string> = { origin: CONSOLE },
  transport?: SyntheticTransport
): Promise<Flow> {
  const start = await h.start(headers)
  expect(start.statusCode).toBe(200)
  const authorizationUrl = start.json().data.authorizationUrl as string
  const authorized = await h.idp.login(authorizationUrl, user, transport)
  expect(authorized.status).toBe(302)
  const target = new URL(authorized.location!)
  return {
    start,
    pending: pendingOf(start),
    authorizationUrl,
    callbackPath: `${target.pathname}${target.search}`
  }
}

function callback(h: Harness, path: string, cookie?: string) {
  return h.inject({
    method: 'GET',
    url: path,
    headers: cookie ? { cookie } : {}
  })
}

async function login(h: Harness, user: SyntheticUser, cookie?: string) {
  const flow = await begin(
    h,
    user,
    cookie ? { origin: CONSOLE, cookie } : { origin: CONSOLE }
  )
  const done = await callback(h, flow.callbackPath, flow.pending)
  expect(done.statusCode).toBe(303)
  return { ...flow, done, session: sessionCookieOf(done) }
}

function principal(h: Harness, operatorId: string) {
  return h.app.caseAuthority.readSnapshot(SYNTHETIC_TENANT_A as never, (s) =>
    s.principal(operatorId)
  )
}

function principalAudits(h: Harness) {
  return h.app.persistence.memoryDb!.state.auditEvents.filter(
    (event) =>
      (event.payload as { event?: string } | undefined)?.event ===
      'case_principal_changed'
  )
}

function assertNoLeaks(h: Harness) {
  const texts = [
    ...h.texts,
    ...h.logs.map((entry) => JSON.stringify(entry)),
    ...h.telemetry.logs().map((entry) => JSON.stringify(entry)),
    ...h.app.persistence.memoryDb!.state.auditEvents.map((event) =>
      JSON.stringify(event)
    )
  ]
  expect(findLeaks(texts, h.idp.secrets)).toEqual([])
  expect(findLeaks(texts, [material.pendingCookieKey])).toEqual([])
}

// SPEC0259 §4.5: the callback lands on the console with a fixed fragment.
const LANDED_NEGADO = `${CONSOLE}/#cvg-login=negado`
const LANDED_INDISPONIVEL = `${CONSOLE}/#cvg-login=indisponivel`

function expectLanding(response: Inject, location: string) {
  expect(response.statusCode).toBe(303)
  expect(response.headers.location).toBe(location)
  expect(response.body).toBe('')
  expect(response.headers['cache-control']).toBe('private, no-store')
}

describe('SPEC0254 O3 — OIDC login happy path in process', () => {
  it('logs in with password + TOTP, restores by cookie and reads the tenant as Supervisor', async () => {
    const h = await harness()
    const user = h.idp.addUser({
      groups: ['synthetic-a-supervisor', 'synthetic-unrelated']
    })
    const flow = await begin(h, user)
    expect(flow.start.headers['cache-control']).toBe('private, no-store')
    const pendingHeader = setCookies(flow.start.headers['set-cookie'])[0]!
    expect(pendingHeader).toContain('HttpOnly; SameSite=Lax; Max-Age=300')
    const authorization = new URL(flow.authorizationUrl)
    expect(authorization.origin).toBe(ISSUER)
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256')

    const done = await callback(h, flow.callbackPath, flow.pending)
    expect(done.statusCode).toBe(303)
    expect(done.headers.location).toBe(`${CONSOLE}/`)
    expect(done.headers['cache-control']).toBe('private, no-store')
    expect(done.body).toBe('')
    expect(clearsPending(done)).toBe(true)
    const operational = setCookies(done.headers['set-cookie']).find((cookie) =>
      cookie.startsWith('cvg_operator_session=opsess_')
    )!
    expect(operational).toContain('HttpOnly')
    expect(operational).toContain('SameSite=Strict')
    expect(operational).toContain('Path=/')
    // I8: at most 15 min and never beyond the ID token exp (300 s here).
    const maxAge = Number(/Max-Age=(\d+)/.exec(operational)?.[1])
    expect(maxAge).toBeGreaterThan(0)
    expect(maxAge).toBeLessThanOrEqual(300)
    expect(h.idp.calls.token).toBe(1)
    expect(h.idp.calls.jwks).toBe(1)

    const cookie = cookiePair(operational)
    const operatorId = expectedOperatorId(ISSUER, user.sub)
    const restored = await h.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { cookie }
    })
    expect(restored.statusCode).toBe(200)
    expect(restored.json().data.identity).toEqual({
      operatorId,
      role: 'Supervisor',
      tenantId: SYNTHETIC_TENANT_A
    })
    for (const url of ['/v1/cases', '/v1/tasks']) {
      const response = await h.inject({
        method: 'GET',
        url,
        headers: { cookie }
      })
      expect(response.statusCode).toBe(200)
    }

    const stored = await principal(h, operatorId)
    expect(stored).toMatchObject({
      active: true,
      role: 'Supervisor',
      revision: 1,
      identitySource: 'verified_adapter',
      authorityVersion: h.authorityVersion
    })
    expect(principalAudits(h)).toHaveLength(1)

    // Second login of the same user: current principal, nothing to write.
    await login(h, user)
    expect((await principal(h, operatorId))?.revision).toBe(1)
    expect(principalAudits(h)).toHaveLength(1)
    expect(h.idp.calls.token).toBe(2)
    assertNoLeaks(h)
  })

  it('keeps trusted case routes at 503 without the OIDC login', async () => {
    const sessions = createInMemoryOperatorSessionStore()
    const app = buildServer({
      identityMode: 'trusted',
      operatorSessionStore: sessions,
      httpSecurity: { allowedOrigins: [CONSOLE] }
    })
    opened.push(app)
    const record = await sessions.create({
      identity: {
        operatorId: 'oidc_supervisor_without_login',
        role: 'Supervisor',
        tenantId: SYNTHETIC_TENANT_A
      },
      expiresAt: Date.now() + 60_000,
      principalRevision: 1
    })
    for (const url of ['/v1/cases', '/v1/tasks']) {
      const response = await app.inject({
        method: 'GET',
        url,
        headers: { cookie: `cvg_operator_session=${record.sessionId}` }
      })
      expect(response.statusCode).toBe(503)
    }
    const start = await app.inject({
      method: 'POST',
      url: START,
      headers: { origin: CONSOLE }
    })
    expect(start.statusCode).toBe(404)
  })

  it('logs in end to end over the HTTPS synthetic IdP with an ephemeral CA', async () => {
    const idp = newIssuer()
    const endpoint = await idp.listenHttps()
    try {
      const h = await harness({
        idp,
        transport: endpoint.transport,
        env: { CVG_OIDC_ISSUER: endpoint.issuer }
      })
      const user = idp.addUser({ groups: ['synthetic-a-operator'] })
      const flow = await begin(h, user, { origin: CONSOLE }, endpoint.transport)
      const done = await callback(h, flow.callbackPath, flow.pending)
      expect(done.statusCode).toBe(303)
      expect(idp.calls).toMatchObject({ discovery: 1, token: 1, jwks: 1 })
      const session = await h.inject({
        method: 'GET',
        url: '/v1/session',
        headers: { cookie: sessionCookieOf(done) }
      })
      expect(session.json().data.identity.role).toBe('Operator')
      assertNoLeaks(h)
    } finally {
      await endpoint.close()
    }
  })
})

describe('SPEC0254 O4 — POST /v1/auth/oidc/start', () => {
  it.each([
    ['no Origin', {}],
    ['Origin null', { origin: 'null' }],
    ['a sibling Origin in the allowlist', { origin: SIBLING }],
    ['an http: Origin', { origin: 'http://console.synthetic.test' }],
    ['a repeated Origin', { origin: [CONSOLE, CONSOLE] }]
  ])(
    'refuses %s with 403 before the body and without state',
    async (_name, headers) => {
      const h = await harness()
      // The last body is malformed JSON: the 403 comes before the parser.
      for (const payload of [undefined, { unexpected: true }, '{']) {
        const response = await h.inject({
          method: 'POST',
          url: START,
          headers: {
            ...(headers as Record<string, string>),
            ...(payload === '{' ? { 'content-type': 'application/json' } : {})
          },
          ...(payload ? { payload } : {})
        })
        expect(response.statusCode).toBe(403)
        expect(response.json().error.code).toBe('forbidden')
        expect(response.headers['cache-control']).toBe('private, no-store')
        expect(touchesOperationalCookie(response)).toBe(false)
        expect(setCookies(response.headers['set-cookie'])).toEqual([])
      }
      expect(h.stateStore.reserved).toBe(0)
    }
  )

  it('accepts an absent or empty body and refuses any other body with 400', async () => {
    const h = await harness()
    expect((await h.start()).statusCode).toBe(200)
    const empty = await h.inject({
      method: 'POST',
      url: START,
      headers: { origin: CONSOLE },
      payload: {}
    })
    expect(empty.statusCode).toBe(200)
    for (const payload of [{ returnTo: '/admin' }, [], 'null']) {
      const response = await h.inject({
        method: 'POST',
        url: START,
        headers: { origin: CONSOLE, 'content-type': 'application/json' },
        payload: typeof payload === 'string' ? payload : JSON.stringify(payload)
      })
      expect(response.statusCode).toBe(400)
      expect(response.json().error.code).toBe('validation_failed')
    }
    expect(h.stateStore.reserved).toBe(2)
  })

  it('limits start to 10 per minute per IP (429 with Retry-After)', async () => {
    const h = await harness()
    for (let index = 0; index < 10; index += 1) {
      expect((await h.start()).statusCode).toBe(200)
    }
    const limited = await h.start()
    expect(limited.statusCode).toBe(429)
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    expect(limited.headers['cache-control']).toBe('private, no-store')
    expect(h.stateStore.reserved).toBe(10)
  })

  it('answers 503 when the state store is unavailable', async () => {
    const h = await harness()
    h.stateStore.unavailable = true
    const response = await h.start()
    expect(response.statusCode).toBe(503)
    expect(response.json().error.code).toBe('configuration_error')
    expect(setCookies(response.headers['set-cookie'])).toEqual([])
  })

  it('clears an expired, unknown, malformed or duplicated operational cookie and starts without a previous session', async () => {
    const h = await harness()
    const expiring = await h.sessions.create({
      identity: {
        operatorId: 'oidc_expiring_operator',
        role: 'Operator',
        tenantId: SYNTHETIC_TENANT_A
      },
      expiresAt: Date.now() + 25,
      principalRevision: 1
    })
    await new Promise((resolve) => setTimeout(resolve, 40))
    const cookies = [
      `cvg_operator_session=${expiring.sessionId}`,
      `cvg_operator_session=opsess_${'A'.repeat(43)}`,
      'cvg_operator_session=%%%',
      'cvg_operator_session=',
      `cvg_operator_session=${expiring.sessionId}; cvg_operator_session=${expiring.sessionId}`
    ]
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    for (const cookie of cookies) {
      const flow = await begin(h, user, { origin: CONSOLE, cookie })
      const cleared = setCookies(flow.start.headers['set-cookie']).find(
        (value) => value.startsWith('cvg_operator_session=;')
      )
      expect(cleared).toContain('Max-Age=0')
      const done = await callback(h, flow.callbackPath, flow.pending)
      expect(done.statusCode).toBe(303)
    }
    expect(h.sessions.revoked).toEqual([])
  })

  it('retires the previous browser session when a valid cookie starts a new login (D7)', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const first = await login(h, user)
    const second = await login(h, user, first.session)
    expect(second.session).not.toBe(first.session)
    expect(h.sessions.revoked).toHaveLength(1)
    const old = await h.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { cookie: first.session }
    })
    expect(old.statusCode).toBe(401)
    const current = await h.inject({
      method: 'GET',
      url: '/v1/session',
      headers: { cookie: second.session }
    })
    expect(current.statusCode).toBe(200)
  })
})

describe('SPEC0254 O5 — GET /v1/auth/oidc/callback refusals', () => {
  async function expectRefusal(
    h: Harness,
    response: Inject,
    input: { tokenCalls: number; sessionsBefore: number; operatorId?: string }
  ) {
    expectLanding(response, LANDED_NEGADO)
    expect(clearsPending(response)).toBe(true)
    expect(touchesOperationalCookie(response)).toBe(false)
    expect(h.idp.calls.token).toBe(input.tokenCalls)
    expect(h.sessions.created).toBe(input.sessionsBefore)
    if (input.operatorId) {
      expect(await principal(h, input.operatorId)).toBeNull()
    }
  }

  it('refuses invalid parameters, cookies and states without calling the token endpoint', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const operatorId = expectedOperatorId(ISSUER, user.sub)
    const flow = await begin(h, user)
    const target = new URL(flow.callbackPath, 'https://api.synthetic.test')
    const code = target.searchParams.get('code')!
    const state = target.searchParams.get('state')!
    const other = 'B'.repeat(43)
    const tampered = `${flow.pending.slice(0, -1)}${flow.pending.endsWith('A') ? 'B' : 'A'}`
    const cases: [string, string | undefined][] = [
      [`/v1/auth/oidc/callback?code=${code}`, flow.pending],
      [`/v1/auth/oidc/callback?state=${state}`, flow.pending],
      [
        `/v1/auth/oidc/callback?code=${code}&state=${state}&state=${state}`,
        flow.pending
      ],
      [
        `/v1/auth/oidc/callback?code=${code}&code=${code}&state=${state}`,
        flow.pending
      ],
      [
        `/v1/auth/oidc/callback?code=${code}&error=access_denied&state=${state}`,
        flow.pending
      ],
      [
        `/v1/auth/oidc/callback?code=${code}&state=${state}&pad=${'x'.repeat(4_100)}`,
        flow.pending
      ],
      [flow.callbackPath, undefined],
      [flow.callbackPath, tampered],
      [flow.callbackPath, `${flow.pending}; ${flow.pending}`],
      [`/v1/auth/oidc/callback?code=${code}&state=${other}`, flow.pending]
    ]
    for (const [path, cookie] of cases) {
      await expectRefusal(h, await callback(h, path, cookie), {
        tokenCalls: 0,
        sessionsBefore: 0,
        operatorId
      })
    }
    expect(h.stateStore.consumed).toBe(0)
    // Sequence (M24): the code was not burned and the state not consumed.
    const done = await callback(h, flow.callbackPath, flow.pending)
    expect(done.statusCode).toBe(303)
    expect(h.idp.calls.token).toBe(1)
    // Replay (M13): the state is consumed; no new token call.
    await expectRefusal(h, await callback(h, flow.callbackPath, flow.pending), {
      tokenCalls: 1,
      sessionsBefore: 1
    })
    assertNoLeaks(h)
  })

  it('refuses a pending cookie older than 5 minutes and one bound to another client', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    const otherClient = await harness({
      idp: h.idp,
      env: { CVG_OIDC_CLIENT_ID: 'cvg-synthetic-other-console' }
    })
    await expectRefusal(
      otherClient,
      await callback(otherClient, flow.callbackPath, flow.pending),
      { tokenCalls: 0, sessionsBefore: 0 }
    )
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 5 * 60_000 + 1_000)
    await expectRefusal(h, await callback(h, flow.callbackPath, flow.pending), {
      tokenCalls: 0,
      sessionsBefore: 0
    })
  })

  it('refuses an IdP error after consuming the state', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    h.idp.controls.authorizeError = true
    const flow = await begin(h, user)
    expect(flow.callbackPath).toContain('error=access_denied')
    await expectRefusal(h, await callback(h, flow.callbackPath, flow.pending), {
      tokenCalls: 0,
      sessionsBefore: 0
    })
    expect(h.stateStore.consumed).toBe(1)
    assertNoLeaks(h)
  })

  it.each([
    ['another key with a known kid', 'other-key-known-kid'],
    ['an unknown kid', 'unknown-kid'],
    ['alg none', 'none'],
    ['HS256', 'HS256']
  ] as const)(
    'refuses an ID token signed with %s',
    async (_name, signature) => {
      const h = await harness()
      const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
      const flow = await begin(h, user)
      h.idp.controls.signature = signature
      await expectRefusal(
        h,
        await callback(h, flow.callbackPath, flow.pending),
        {
          tokenCalls: 1,
          sessionsBefore: 0,
          operatorId: expectedOperatorId(ISSUER, user.sub)
        }
      )
      assertNoLeaks(h)
    }
  )

  const seconds = () => Math.floor(Date.now() / 1_000)
  it.each([
    ['a wrong iss', () => ({ iss: 'https://other.synthetic.test' })],
    ['a wrong aud', () => ({ aud: 'other-client' })],
    ['a wrong azp', () => ({ azp: 'other-client' })],
    ['a wrong nonce', () => ({ nonce: 'N'.repeat(43) })],
    ['an expired exp', () => ({ exp: seconds() - 120 })],
    [
      'an auth_time older than 5 minutes',
      () => ({ auth_time: seconds() - 400 })
    ],
    ['amr without otp', () => ({ amr: ['pwd'] })],
    ['amr absent', () => ({ amr: undefined })]
  ])('refuses an ID token with %s', async (_name, claims) => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    h.idp.controls.claims = claims()
    await expectRefusal(h, await callback(h, flow.callbackPath, flow.pending), {
      tokenCalls: 1,
      sessionsBefore: 0,
      operatorId: expectedOperatorId(ISSUER, user.sub)
    })
    assertNoLeaks(h)
  })

  it.each([
    ['groups absent', undefined],
    ['groups as a scalar', 'synthetic-a-operator'],
    ['nested groups', [['synthetic-a-operator']]],
    ['a non-string group', ['synthetic-a-operator', 7]],
    ['no group of the matrix', ['synthetic-unrelated']],
    ['two eligible groups', ['synthetic-a-operator', 'synthetic-a-approver']]
  ])('refuses %s', async (_name, groups) => {
    const h = await harness()
    const user = h.idp.addUser({ groups })
    const flow = await begin(h, user)
    await expectRefusal(h, await callback(h, flow.callbackPath, flow.pending), {
      tokenCalls: 1,
      sessionsBefore: 0,
      operatorId: expectedOperatorId(ISSUER, user.sub)
    })
    assertNoLeaks(h)
  })

  it('reads the groups claim only as an own property (M30, prototype pollution)', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: undefined })
    const flow = await begin(h, user)
    Object.defineProperty(Object.prototype, 'synthetic_groups', {
      value: ['synthetic-a-supervisor'],
      configurable: true,
      writable: true
    })
    let response: Inject
    try {
      response = await callback(h, flow.callbackPath, flow.pending)
    } finally {
      delete (Object.prototype as Record<string, unknown>).synthetic_groups
    }
    await expectRefusal(h, response, {
      tokenCalls: 1,
      sessionsBefore: 0,
      operatorId: expectedOperatorId(ISSUER, user.sub)
    })
    expect(
      h.logs.some(
        (entry) =>
          entry.event === 'operator_login.callback' &&
          entry.errorCode === 'groups_invalid'
      )
    ).toBe(true)
  })

  it('logs the refusal reason without secrets', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    h.idp.controls.claims = { amr: ['pwd'] }
    await callback(h, flow.callbackPath, flow.pending)
    const entry = h.logs.find((log) => log.event === 'operator_login.callback')
    expect(entry).toMatchObject({ status: 'error', errorCode: 'mfa_missing' })
    expect(
      h.telemetry
        .logs()
        .some((log) => JSON.stringify(log).includes('mfa_missing'))
    ).toBe(true)
    assertNoLeaks(h)
  })

  it('does not issue a code for a wrong TOTP and refuses a reused code', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const start = await h.start()
    const url = start.json().data.authorizationUrl as string
    const current = syntheticTotp(user.totpSecret)
    const wrong = String((Number(current) + 1) % 1_000_000).padStart(6, '0')
    const refused = await h.idp.authorize(url, {
      username: user.username,
      password: user.password,
      totp: wrong
    })
    expect(refused).toEqual({ status: 401, location: null })
    expect(h.idp.calls.token).toBe(0)

    const first = await begin(h, user)
    expect(
      (await callback(h, first.callbackPath, first.pending)).statusCode
    ).toBe(303)
    const second = await begin(h, user)
    const reused = new URL(second.callbackPath, 'https://api.synthetic.test')
    reused.searchParams.set(
      'code',
      new URL(
        first.callbackPath,
        'https://api.synthetic.test'
      ).searchParams.get('code')!
    )
    await expectRefusal(
      h,
      await callback(h, `${reused.pathname}${reused.search}`, second.pending),
      { tokenCalls: 2, sessionsBefore: 1 }
    )
    assertNoLeaks(h)
  })

  it('refuses a wrong client secret at the token endpoint with 401', async () => {
    const idp = newIssuer(syntheticClientMaterial().clientSecret)
    const h = await harness({ idp })
    const user = idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    await expectRefusal(h, await callback(h, flow.callbackPath, flow.pending), {
      tokenCalls: 1,
      sessionsBefore: 0
    })
  })

  it.each([
    ['token endpoint 500', { tokenStatus: 500 }],
    ['token endpoint 429 (R2-O7)', { tokenStatus: 429 }],
    ['JWKS 500 (fresh configuration)', { jwksStatus: 500 }],
    ['JWKS unreachable (fresh configuration)', { jwksDown: true }],
    ['IdP unreachable', { down: true }]
  ])(
    'lands %s on #cvg-login=indisponivel, clearing only the pending cookie',
    async (_name, controls) => {
      const h = await harness()
      const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
      const flow = await begin(h, user)
      Object.assign(h.idp.controls, controls)
      const response = await callback(h, flow.callbackPath, flow.pending)
      expectLanding(response, LANDED_INDISPONIVEL)
      expect(clearsPending(response)).toBe(true)
      expect(touchesOperationalCookie(response)).toBe(false)
      expect(h.sessions.created).toBe(0)
      expect(
        await principal(h, expectedOperatorId(ISSUER, user.sub))
      ).toBeNull()
      assertNoLeaks(h)
    }
  )

  it('keeps the pending cookie when the state store is unavailable', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    h.stateStore.unavailable = true
    const response = await callback(h, flow.callbackPath, flow.pending)
    expectLanding(response, LANDED_INDISPONIVEL)
    expect(setCookies(response.headers['set-cookie'])).toEqual([])
    expect(h.idp.calls.token).toBe(0)
    h.stateStore.unavailable = false
    expect(
      (await callback(h, flow.callbackPath, flow.pending)).statusCode
    ).toBe(303)
  })

  it('limits the callback to 30 per minute per IP without touching the pending cookie', async () => {
    const h = await harness()
    for (let index = 0; index < 30; index += 1) {
      await callback(h, '/v1/auth/oidc/callback')
    }
    const limited = await callback(h, '/v1/auth/oidc/callback')
    expectLanding(limited, LANDED_INDISPONIVEL)
    expect(setCookies(limited.headers['set-cookie'])).toEqual([])
  })

  it('rotates keys: the cached configuration refuses the new kid, a new one accepts it', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    await login(h, user)
    h.idp.rotateKey()
    const flow = await begin(h, user)
    await expectRefusal(h, await callback(h, flow.callbackPath, flow.pending), {
      tokenCalls: 2,
      sessionsBefore: 1
    })
    const fresh = await harness({ idp: h.idp })
    await login(fresh, user)
  })
})

describe('SPEC0254 O6 — producer through the callback (memory)', () => {
  it('creates one principal for two simultaneous first logins and both sessions', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const first = await begin(h, user)
    const second = await begin(h, user)
    const [a, b] = await Promise.all([
      callback(h, first.callbackPath, first.pending),
      callback(h, second.callbackPath, second.pending)
    ])
    expect([a.statusCode, b.statusCode]).toEqual([303, 303])
    expect(h.sessions.created).toBe(2)
    expect(
      (await principal(h, expectedOperatorId(ISSUER, user.sub)))?.revision
    ).toBe(1)
    expect(principalAudits(h)).toHaveLength(1)
  })

  it('SPEC 0262 §6.2: a principal that moves after the session was created retires the new family and sets no cookie', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const operatorId = expectedOperatorId(ISSUER, user.sub)
    const flow = await begin(h, user)
    h.sessions.afterCreate = async () => {
      const current = await principal(h, operatorId)
      await h.app.caseAuthority.applyVerifiedPrincipalState({
        tenantId: current!.tenantId,
        operatorId,
        role: current!.role,
        active: current!.active,
        expectedRevision: current!.revision,
        authorityVersion: current!.authorityVersion,
        proofRef: 'synthetic-proof:moved',
        identitySource: 'verified_adapter'
      })
    }
    const response = await callback(h, flow.callbackPath, flow.pending)
    expectLanding(response, LANDED_NEGADO)
    expect(touchesOperationalCookie(response)).toBe(false)
    expect(h.sessions.created).toBe(1)
    expect(h.sessions.revoked).toHaveLength(1)
  })

  it('binds the created session to the revision of the principal the login made current', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    await login(h, user)
    const current = await principal(h, expectedOperatorId(ISSUER, user.sub))
    expect(current?.revision).toBe(1)
    expect(h.sessions.lastPrincipalRevision).toBe(1)
  })

  it('lands on indisponivel without a session after two principal conflicts in a row', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    const write = vi
      .spyOn(h.app.caseAuthority, 'applyVerifiedPrincipalState')
      .mockRejectedValue(
        new CaseAuthorityError(
          'principal_conflict',
          'Principal revision is stale'
        )
      )
    const response = await callback(h, flow.callbackPath, flow.pending)
    expectLanding(response, LANDED_INDISPONIVEL)
    expect(write).toHaveBeenCalledTimes(2)
    expect(h.sessions.created).toBe(0)
    expect(clearsPending(response)).toBe(true)
  })

  it('lands on indisponivel without a session when the principal write fails', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    vi.spyOn(
      h.app.caseAuthority,
      'applyVerifiedPrincipalState'
    ).mockRejectedValue(
      new CaseAuthorityError('case_authority_unavailable', 'unavailable')
    )
    const response = await callback(h, flow.callbackPath, flow.pending)
    expectLanding(response, LANDED_INDISPONIVEL)
    expect(h.sessions.created).toBe(0)
  })

  it('lands on indisponivel and keeps the operational cookie when the session store fails', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const flow = await begin(h, user)
    h.sessions.failCreate = true
    const response = await callback(h, flow.callbackPath, flow.pending)
    expectLanding(response, LANDED_INDISPONIVEL)
    expect(touchesOperationalCookie(response)).toBe(false)
    expect(clearsPending(response)).toBe(true)
    // The principal is current before the session (I2).
    expect(
      (await principal(h, expectedOperatorId(ISSUER, user.sub)))?.revision
    ).toBe(1)
  })

  it('deactivates on an inactive matrix entry (P4) and cuts the open session on case routes', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const operatorId = expectedOperatorId(ISSUER, user.sub)
    const first = await login(h, user)
    const before = await h.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: { cookie: first.session }
    })
    expect(before.statusCode).toBe(200)
    // Row 2: no principal and an inactive entry → refused without a write.
    const moved = h.idp.addUser({ groups: ['synthetic-a-disabled'] })
    const movedId = expectedOperatorId(ISSUER, moved.sub)
    const refused = await begin(h, moved)
    expectLanding(
      await callback(h, refused.callbackPath, refused.pending),
      LANDED_NEGADO
    )
    expect(await principal(h, movedId)).toBeNull()

    // P4 on an existing principal: same subject, now only in the disabled group.
    ;(user as { groups: unknown }).groups = ['synthetic-a-disabled']
    const flow = await begin(h, user)
    const response = await callback(h, flow.callbackPath, flow.pending)
    expectLanding(response, LANDED_NEGADO)
    expect(await principal(h, operatorId)).toMatchObject({
      active: false,
      role: 'Operator',
      revision: 2,
      authorityVersion: h.authorityVersion
    })
    const audits = principalAudits(h)
    expect(audits.at(-1)?.payload).toMatchObject({ active: false, revision: 2 })
    const after = await h.inject({
      method: 'GET',
      url: '/v1/tasks',
      headers: { cookie: first.session }
    })
    expect(after.statusCode).toBe(401)
    assertNoLeaks(h)
  })

  it('refuses a role drift under the same matrix version without writing (P3)', async () => {
    const h = await harness()
    const user = h.idp.addUser({ groups: ['synthetic-a-operator'] })
    const operatorId = expectedOperatorId(ISSUER, user.sub)
    await login(h, user)
    ;(user as { groups: unknown }).groups = ['synthetic-a-supervisor']
    const flow = await begin(h, user)
    const response = await callback(h, flow.callbackPath, flow.pending)
    expectLanding(response, LANDED_NEGADO)
    expect(await principal(h, operatorId)).toMatchObject({
      role: 'Operator',
      revision: 1
    })
    expect(principalAudits(h)).toHaveLength(1)
    expect(h.sessions.created).toBe(1)
  })
})
