// @vitest-environment node
/**
 * SPEC0254 O10 — the real entrypoint (`tsx apps/api/src/main.ts`, child
 * process) with PostgreSQL and the synthetic IdP over HTTPS (ephemeral CA in
 * `NODE_EXTRA_CA_CERTS` of the child only). The IdP runs on another host and
 * scheme (`https://localhost:<port>`) than the API (`http://127.0.0.1`).
 *
 * Ad-hoc runs without TEST_DATABASE_URL skip (repo convention); a required
 * gate sets OIDC0254_PG_REQUIRED=1 and a missing database fails instead.
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { request as httpRequest } from 'node:http'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  createOidcPostgresFixture,
  type OidcPostgresFixture
} from './support/oidc-postgres-fixture.ts'
import {
  cookiePair,
  findLeaks,
  SyntheticOidcIssuer,
  syntheticClientMaterial,
  syntheticOidcEnv,
  type SyntheticHttpsEndpoint,
  type SyntheticUser
} from './support/synthetic-oidc-issuer.ts'

const databaseUrl = process.env.TEST_DATABASE_URL
if (process.env.OIDC0254_PG_REQUIRED === '1' && !databaseUrl) {
  throw new Error('OIDC0254_PG_REQUIRED=1 requires TEST_DATABASE_URL')
}
const describePg = databaseUrl ? describe : describe.skip

const PORT = Number(process.env.OIDC0254_API_PORT ?? 3456)
const API = `http://127.0.0.1:${PORT}`
const CONSOLE = 'http://localhost:4456'
const REDIRECT = `${API}/v1/auth/oidc/callback`
const CLIENT = 'cvg-synthetic-console'
const material = syntheticClientMaterial()

interface HttpResult {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

function call(
  method: string,
  path: string,
  headers: Record<string, string> = {}
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest(
      `${API}${path}`,
      { method, headers },
      (incoming) => {
        const chunks: Buffer[] = []
        incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
        incoming.on('end', () =>
          resolve({
            status: incoming.statusCode ?? 0,
            headers: incoming.headers,
            body: Buffer.concat(chunks).toString('utf8')
          })
        )
        incoming.on('error', reject)
      }
    )
    outgoing.on('error', reject)
    outgoing.end()
  })
}

function cookies(result: HttpResult): string[] {
  const value = result.headers['set-cookie']
  return Array.isArray(value) ? value : value ? [value] : []
}

interface Child {
  process: ChildProcess
  output: () => string
  exited: Promise<number | null>
  stop: () => Promise<void>
}

function spawnApi(env: NodeJS.ProcessEnv): Child {
  const child = spawn(
    join(process.cwd(), 'node_modules/.bin/tsx'),
    ['apps/api/src/main.ts'],
    { cwd: process.cwd(), env }
  )
  let output = ''
  child.stdout.on('data', (chunk) => {
    output += String(chunk)
  })
  child.stderr.on('data', (chunk) => {
    output += String(chunk)
  })
  const exited = new Promise<number | null>((resolve) =>
    child.once('close', (code) => resolve(code))
  )
  return {
    process: child,
    output: () => output,
    exited,
    stop: async () => {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM')
        const timer = setTimeout(() => child.kill('SIGKILL'), 10_000)
        await exited
        clearTimeout(timer)
      }
    }
  }
}

async function waitReady(child: Child): Promise<void> {
  const deadline = Date.now() + 45_000
  while (Date.now() < deadline) {
    if (child.process.exitCode !== null) {
      throw new Error(`API exited early: ${child.output()}`)
    }
    try {
      const live = await call('GET', '/live')
      if (live.status === 200) return
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  throw new Error(`API did not become ready: ${child.output().slice(-2_000)}`)
}

async function portFree(): Promise<boolean> {
  try {
    await call('GET', '/live')
    return false
  } catch {
    return true
  }
}

describePg('SPEC0254 O10 — entrypoint with PostgreSQL and HTTPS IdP', () => {
  let fixture: OidcPostgresFixture
  let endpoint: SyntheticHttpsEndpoint
  const idp = new SyntheticOidcIssuer({
    issuer: 'https://localhost',
    clientId: CLIENT,
    clientSecret: material.clientSecret,
    redirectUri: REDIRECT,
    groupsClaim: 'synthetic_groups'
  })
  const children: Child[] = []
  const texts: string[] = []

  const environment = (patch: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv => {
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      NODE_ENV: 'test',
      PORT: String(PORT),
      NODE_EXTRA_CA_CERTS: endpoint.caFile,
      CVG_IDENTITY_MODE: 'trusted',
      API_ALLOWED_ORIGINS: CONSOLE,
      ...fixture.env,
      ...syntheticOidcEnv({
        issuer: endpoint.issuer,
        clientId: CLIENT,
        clientSecret: material.clientSecret,
        pendingCookieKey: material.pendingCookieKey,
        redirectUri: REDIRECT,
        consoleOrigin: CONSOLE
      }),
      ...patch
    }
    for (const key of Object.keys(env)) {
      if (env[key] === undefined) delete env[key]
    }
    return env
  }

  const start = async (patch?: NodeJS.ProcessEnv) => {
    const child = spawnApi(environment(patch))
    children.push(child)
    await waitReady(child)
    return child
  }

  const record = (result: HttpResult, allowBody = false) => {
    texts.push(JSON.stringify(result.headers))
    if (!allowBody) texts.push(result.body)
    return result
  }

  const beginLogin = async (user: SyntheticUser, cookie?: string) => {
    const started = record(
      await call('POST', '/v1/auth/oidc/start', {
        origin: CONSOLE,
        ...(cookie ? { cookie } : {})
      }),
      true
    )
    expect(started.status).toBe(200)
    const pending = cookiePair(
      cookies(started).find((value) => value.startsWith('cvg_oidc_pending='))!
    )
    const authorized = await idp.login(
      JSON.parse(started.body).data.authorizationUrl,
      user,
      endpoint.transport
    )
    expect(authorized.status).toBe(302)
    const target = new URL(authorized.location!)
    return { pending, path: `${target.pathname}${target.search}` }
  }

  const finishLogin = async (flow: { pending: string; path: string }) =>
    record(await call('GET', flow.path, { cookie: flow.pending }))

  const login = async (user: SyntheticUser, cookie?: string) => {
    const done = await finishLogin(await beginLogin(user, cookie))
    expect(done.status).toBe(303)
    expect(done.headers.location).toBe(`${CONSOLE}/`)
    return cookiePair(
      cookies(done).find((value) =>
        value.startsWith('cvg_operator_session=opsess_')
      )!
    )
  }

  const session = (cookie: string) =>
    call('GET', '/v1/session', { cookie }).then((result) => record(result))

  beforeAll(async () => {
    if (!(await portFree())) {
      throw new Error(`port ${PORT} is busy; set OIDC0254_API_PORT`)
    }
    fixture = await createOidcPostgresFixture(databaseUrl!)
    endpoint = await idp.listenHttps()
  }, 120_000)

  afterEach(async () => {
    for (const child of children.splice(0)) await child.stop()
  })

  afterAll(async () => {
    await endpoint?.close()
    await fixture?.close()
  })

  it('logs in through the entrypoint, restores, restarts, rotates, logs out, expires and recovers', async () => {
    const supervisor = idp.addUser({ groups: ['synthetic-a-supervisor'] })
    let api = await start()
    const first = await login(supervisor)
    expect(idp.calls.token).toBe(1)
    expect((await session(first)).status).toBe(200)
    for (const path of ['/v1/cases', '/v1/tasks']) {
      expect(record(await call('GET', path, { cookie: first })).status).toBe(
        200
      )
    }

    // Restart: the PG session survives.
    await api.stop()
    api = await start()
    expect((await session(first)).status).toBe(200)

    // New login in the same browser retires the previous family (switchIdentity).
    const second = await login(supervisor, first)
    expect((await session(first)).status).toBe(401)
    expect((await session(second)).status).toBe(200)

    // Logout requires the exact Origin.
    const refused = record(
      await call('POST', '/v1/session/logout', { cookie: second })
    )
    expect(refused.status).toBe(403)
    expect((await session(second)).status).toBe(200)
    const loggedOut = record(
      await call('POST', '/v1/session/logout', {
        cookie: second,
        origin: CONSOLE
      })
    )
    expect(loggedOut.status).toBe(200)
    expect((await session(second)).status).toBe(401)

    // ID token exp of 5 s caps the session.
    const short = idp.addUser({
      groups: ['synthetic-a-operator'],
      idTokenTtlSeconds: 5
    })
    const shortCookie = await login(short)
    expect((await session(shortCookie)).status).toBe(200)
    await new Promise((resolve) => setTimeout(resolve, 6_000))
    expect((await session(shortCookie)).status).toBe(401)

    // Session role without login and its connections closed → 503, cookie kept.
    const live = await login(supervisor)
    const pendingFlow = await beginLogin(supervisor)
    await fixture.admin.query(`ALTER ROLE ${fixture.roles.session} NOLOGIN`)
    await fixture.admin.query(
      'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = $1',
      [fixture.roles.session]
    )
    const down = record(await call('GET', '/v1/cases', { cookie: live }))
    expect(down.status).toBe(503)
    expect(cookies(down)).toEqual([])
    const downCallback = await finishLogin(pendingFlow)
    expect(downCallback.status).toBe(503)
    expect(cookies(downCallback)).toEqual([])
    await fixture.admin.query(`ALTER ROLE ${fixture.roles.session} LOGIN`)
    const deadline = Date.now() + 15_000
    let recovered = 0
    while (Date.now() < deadline) {
      recovered = (await call('GET', '/v1/cases', { cookie: live })).status
      if (recovered === 200) break
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
    expect(recovered).toBe(200)
    expect((await finishLogin(pendingFlow)).status).toBe(303)

    await api.stop()
    const output = children.map((child) => child.output()).join('\n')
    expect(output).not.toContain(fixture.password)
    expect(
      findLeaks([...texts, output], [...idp.secrets, material.pendingCookieKey])
    ).toEqual([])
  }, 180_000)

  it('exits 1 before listen on invalid OIDC configurations, without secrets on stderr', async () => {
    const keyring = JSON.stringify({
      current: { keyId: 'entrypoint', secret: material.pendingCookieKey }
    })
    const cases: [string, NodeJS.ProcessEnv, RegExp][] = [
      ['partial (no mode)', { CVG_OPERATOR_LOGIN: undefined }, /partial/],
      [
        'production',
        {
          NODE_ENV: 'production',
          CVG_OPERATOR_IDENTITY_KEYRING: keyring,
          DATABASE_MIGRATION_URL: undefined,
          API_REQUIRE_HTTPS: 'true',
          OUTBOX_DURABLE_INBOUND: 'true',
          WEBHOOK_SIGNING_SECRET: material.clientSecret,
          INBOUND_TENANT_ID: 'tenant_0254aaaa-0000-4000-8000-00000000000a',
          INBOUND_AGENT_ID: 'agent_0254aaaa-0000-4000-8000-0000000000a1'
        },
        /not qualified/
      ],
      [
        'development',
        {
          NODE_ENV: 'development',
          WEBHOOK_SIGNING_SECRET: material.clientSecret
        },
        /not qualified/
      ],
      ['memory', { API_PERSISTENCE_MODE: 'memory' }, /API_PERSISTENCE_MODE/],
      [
        'RLS off',
        { POSTGRES_RLS_ENFORCEMENT: 'false' },
        /POSTGRES_RLS_ENFORCEMENT/
      ],
      [
        'HMAC keyring',
        { CVG_OPERATOR_IDENTITY_KEYRING: keyring },
        /CVG_OPERATOR_IDENTITY_KEYRING/
      ],
      [
        'http: issuer',
        { CVG_OIDC_ISSUER: 'http://localhost:9' },
        /CVG_OIDC_ISSUER/
      ],
      [
        'placeholder secret',
        { CVG_OIDC_CLIENT_SECRET: `replace_me_${material.pendingCookieKey}` },
        /CVG_OIDC_CLIENT_SECRET/
      ],
      [
        'session store absent',
        { CVG_OPERATOR_SESSION_DATABASE_URL: undefined },
        /CVG_OPERATOR_SESSION_DATABASE_URL/
      ],
      [
        'matrix claim __proto__',
        {
          CVG_OIDC_GROUP_MATRIX: JSON.stringify({
            version: 1,
            claim: '__proto__',
            entries: [
              {
                group: 'synthetic-a-operator',
                tenantId: 'tenant_0254aaaa-0000-4000-8000-00000000000a',
                role: 'Operator',
                active: true
              }
            ]
          })
        },
        /CVG_OIDC_GROUP_MATRIX/
      ]
    ]
    for (const [name, patch, expected] of cases) {
      // Refused before discovery, pools and listen: the IdP is never called.
      const discoveries = idp.calls.discovery
      const child = spawnApi(environment(patch))
      children.push(child)
      const timeout = new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), 20_000)
      )
      const code = await Promise.race([child.exited, timeout])
      await child.stop()
      expect(code, name).toBe(1)
      expect(child.output(), `${name}: ${child.output().slice(-600)}`).toMatch(
        expected
      )
      expect(child.output(), name).toContain('api.startup_failed')
      expect(idp.calls.discovery, name).toBe(discoveries)
      for (const secret of [
        material.clientSecret,
        material.pendingCookieKey,
        fixture.password
      ]) {
        expect(child.output(), name).not.toContain(secret)
      }
      expect(await portFree(), name).toBe(true)
    }
  }, 300_000)
})
