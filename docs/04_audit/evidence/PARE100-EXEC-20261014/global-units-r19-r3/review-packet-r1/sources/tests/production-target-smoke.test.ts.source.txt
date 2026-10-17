// @vitest-environment node
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { API_CONTENT_SECURITY_POLICY } from '../apps/api/src/http-security.ts'
import {
  runTargetSmoke,
  TargetSmokeConfigError,
  targetSmokeConfigFromEnv,
  type TargetCheck,
  type TargetSmokeConfig
} from '../scripts/production-target-smoke.ts'

const ALLOWED_ORIGIN = 'https://console.synthetic.test'
const COOKIE_NAME = 'cvg_operator_session'
const TOKENS: Record<string, { operatorId: string; role: string }> = {
  'tok-admin': { operatorId: 'op.synthetic.admin', role: 'Admin' },
  'tok-operator': {
    operatorId: 'op.synthetic.operator',
    role: 'Operator'
  }
}

interface Scenario {
  plainRedirects?: boolean
  dropHsts?: boolean
  acceptHostileOrigin?: boolean
  insecureCookie?: boolean
  publishMetrics?: boolean
  rateLimitAfter?: number
}

/**
 * In-process stand-in for proxy + API: emulates the production responses
 * the smoke relies on (426, probes, headers, CORS, sessions, roles).
 */
function fakeTarget(scenario: Scenario) {
  const sessions = new Map<string, { operatorId: string; role: string }>()
  const tokenUses = new Set<string>()
  let anonymousHits = 0
  let sessionCounter = 0
  const securityHeaders = (secure: boolean): Record<string, string> => ({
    'content-security-policy': API_CONTENT_SECURITY_POLICY,
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    ...(secure && !scenario.dropHsts
      ? { 'strict-transport-security': 'max-age=31536000' }
      : {})
  })
  const sessionOf = (request: IncomingMessage) => {
    const match = new RegExp(`${COOKIE_NAME}=([^;]+)`).exec(
      request.headers.cookie ?? ''
    )
    return match ? sessions.get(match[1] ?? '') : undefined
  }
  const send = (
    response: ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {}
  ) => {
    response.writeHead(status, {
      'content-type': 'application/json',
      ...securityHeaders(true),
      ...headers
    })
    response.end(JSON.stringify(body))
  }

  const tls = createServer((request, response) => {
    const url = request.url ?? '/'
    const origin = request.headers.origin
    if (origin && origin !== ALLOWED_ORIGIN && !scenario.acceptHostileOrigin) {
      send(response, 403, { success: false, error: { code: 'forbidden' } })
      return
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204, {
        'access-control-allow-origin': origin ?? '',
        vary: 'Origin'
      })
      response.end()
      return
    }
    const cors = origin ? { 'access-control-allow-origin': origin } : {}
    if (url === '/live') {
      send(response, 200, { success: true, data: { status: 'ok' } }, cors)
      return
    }
    if (url === '/ready') {
      send(response, 200, { success: true, data: { ready: true } }, cors)
      return
    }
    if (url === '/health/metrics') {
      send(response, scenario.publishMetrics ? 200 : 404, {})
      return
    }
    if (url === '/v1/session' && request.method === 'GET') {
      const token = request.headers['x-cvg-operator-token']
      if (typeof token === 'string') {
        const identity = TOKENS[token]
        if (!identity || tokenUses.has(token)) {
          send(response, 401, { success: false })
          return
        }
        tokenUses.add(token)
        sessionCounter += 1
        const id = `sess${sessionCounter}`
        sessions.set(id, identity)
        send(
          response,
          200,
          { success: true, data: { identity } },
          {
            'set-cookie': `${COOKIE_NAME}=${id}; Path=/; HttpOnly; SameSite=Strict; Max-Age=300${
              scenario.insecureCookie ? '' : '; Secure'
            }`
          }
        )
        return
      }
      const session = sessionOf(request)
      send(
        response,
        session ? 200 : 401,
        session ? { success: true, data: { identity: session } } : {}
      )
      return
    }
    if (url === '/v1/session/logout' && request.method === 'POST') {
      send(response, 200, { success: true })
      return
    }
    if (url === '/v1/tasks') {
      const session = sessionOf(request)
      if (!session) {
        anonymousHits += 1
        const limited =
          scenario.rateLimitAfter !== undefined &&
          anonymousHits > scenario.rateLimitAfter
        send(response, limited ? 429 : 401, {})
        return
      }
      send(response, 200, { success: true, data: [] })
      return
    }
    if (url === '/v1/admin/agents') {
      const session = sessionOf(request)
      send(response, !session ? 401 : session.role === 'Admin' ? 200 : 403, {})
      return
    }
    send(response, 404, {})
  })

  const plain = createServer((_request, response) => {
    if (scenario.plainRedirects) {
      response.writeHead(308, { location: 'https://target.synthetic.test/' })
      response.end()
      return
    }
    response.writeHead(426, { upgrade: 'TLS/1.2', ...securityHeaders(false) })
    response.end(JSON.stringify({ success: false }))
  })
  return { tls, plain }
}

const servers: Server[] = []

async function listen(server: Server): Promise<string> {
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve()))
      )
  )
})

async function configFor(
  scenario: Scenario,
  overrides: Partial<TargetSmokeConfig> = {},
  omit: readonly (keyof TargetSmokeConfig)[] = []
): Promise<TargetSmokeConfig> {
  const { tls, plain } = fakeTarget(scenario)
  const config = {
    targetUrl: await listen(tls),
    plainHttpUrl: await listen(plain),
    allowedOrigin: ALLOWED_ORIGIN,
    hostileOrigin: 'https://hostile.invalid',
    protectedPath: '/v1/tasks',
    roleProbePath: '/v1/admin/agents',
    operators: [
      { label: 'A', token: 'tok-admin', expectedRole: 'Admin' },
      {
        label: 'B',
        token: 'tok-operator',
        expectedRole: 'Operator'
      }
    ],
    rateLimitRequests: 8,
    expectMetrics: false,
    expectedImageDigest: `sha256:${'a'.repeat(64)}`,
    deployedImageDigest: `registry.synthetic.test/harness@sha256:${'a'.repeat(64)}`,
    timeoutMs: 5_000,
    allowInsecureTarget: true,
    ...overrides
  } satisfies TargetSmokeConfig
  for (const key of omit) delete (config as Record<string, unknown>)[key]
  return config
}

/** A loopback port with nothing listening: connections are refused. */
async function closedPort(): Promise<string> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

function verdicts(checks: readonly TargetCheck[]): Record<string, string> {
  return Object.fromEntries(checks.map((check) => [check.name, check.verdict]))
}

describe('production target smoke (PLAN0374 Fase C)', () => {
  it('passes every check against a conforming target', async () => {
    const report = await runTargetSmoke(await configFor({ rateLimitAfter: 5 }))

    expect(verdicts(report.checks)).toEqual({
      'config.target_https': 'SKIPPED',
      'c5.plain_http_426': 'PASS',
      'c5.https_live_200': 'PASS',
      'c7.https_ready_200': 'PASS',
      'c5.security_headers': 'PASS',
      'c5.cors_hostile_origin_refused': 'PASS',
      'c5.cors_allowed_origin_preflight': 'PASS',
      'c8.no_session_401': 'PASS',
      'c8.operator_a_login': 'PASS',
      'c8.operator_b_login': 'PASS',
      'c8.distinct_roles': 'PASS',
      'c8.role_enforcement': 'PASS',
      'c7.metrics_exposure': 'PASS',
      'c9.image_digest_match': 'PASS',
      'c5.rate_limit_observation': 'PASS'
    })
    expect(report.status).toBe('PASS')
    expect(report.complete).toBe(false)
    expect(report.cleanup).toEqual([
      { label: 'A', logout: 200 },
      { label: 'B', logout: 200 }
    ])
    const rate = report.checks.find(
      (check) => check.name === 'c5.rate_limit_observation'
    )
    // c8.no_session_401 already used one anonymous request of the budget.
    expect(rate?.detail).toMatchObject({
      statuses: { '401': 4, '429': 4 },
      first429At: 5
    })
    // Secrets and operator ids never reach the report.
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('tok-')
    expect(serialized).not.toContain('op.synthetic.')
    expect(serialized).not.toContain('sess1')
  })

  it('fails a misconfigured target and names each failure', async () => {
    const report = await runTargetSmoke(
      await configFor(
        {
          plainRedirects: true,
          dropHsts: true,
          acceptHostileOrigin: true,
          insecureCookie: true,
          publishMetrics: true
        },
        {
          deployedImageDigest: `sha256:${'b'.repeat(64)}`,
          rateLimitRequests: 0
        }
      )
    )
    const byName = Object.fromEntries(
      report.checks.map((check) => [check.name, check])
    )

    expect(report.status).toBe('FAIL')
    expect(byName['c5.plain_http_426']?.verdict).toBe('FAIL')
    expect(byName['c5.plain_http_426']?.reason).toContain('redirect')
    expect(byName['c5.security_headers']?.verdict).toBe('FAIL')
    expect(byName['c5.security_headers']?.reason).toContain('trusted forwarder')
    expect(byName['c5.cors_hostile_origin_refused']?.verdict).toBe('FAIL')
    expect(byName['c8.operator_a_login']?.verdict).toBe('FAIL')
    expect(byName['c8.operator_a_login']?.reason).toContain('Secure')
    expect(byName['c8.distinct_roles']?.verdict).toBe('FAIL')
    expect(byName['c8.role_enforcement']?.verdict).toBe('SKIPPED')
    expect(byName['c7.metrics_exposure']?.verdict).toBe('FAIL')
    expect(byName['c9.image_digest_match']?.verdict).toBe('FAIL')
    expect(byName['c5.rate_limit_observation']?.verdict).toBe('SKIPPED')
    expect(byName['c5.https_live_200']?.verdict).toBe('PASS')
  })

  it('fails a role that differs from the expected one', async () => {
    const report = await runTargetSmoke(
      await configFor(
        {},
        {
          operators: [
            {
              label: 'A',
              token: 'tok-operator',
              expectedRole: 'Admin'
            }
          ],
          rateLimitRequests: 0
        }
      )
    )
    const login = report.checks.find(
      (check) => check.name === 'c8.operator_a_login'
    )

    expect(login?.verdict).toBe('FAIL')
    expect(login?.reason).toContain('role Operator != expected Admin')
    expect(
      report.checks.find((check) => check.name === 'c8.distinct_roles')?.verdict
    ).toBe('SKIPPED')
    expect(report.status).toBe('FAIL')
  })

  it('skips what is not configured and reports transport failures', async () => {
    const report = await runTargetSmoke(
      await configFor(
        {},
        {
          plainHttpUrl: await closedPort(),
          operators: [],
          rateLimitRequests: 0
        },
        ['allowedOrigin', 'expectedImageDigest', 'deployedImageDigest']
      )
    )
    const byName = verdicts(report.checks)
    const plain = report.checks.find(
      (check) => check.name === 'c5.plain_http_426'
    )

    expect(plain?.verdict).toBe('FAIL')
    expect(plain?.detail).toMatchObject({ live: 'ECONNREFUSED' })
    expect(byName['c5.cors_allowed_origin_preflight']).toBe('SKIPPED')
    expect(byName['c8.distinct_roles']).toBe('SKIPPED')
    expect(byName['c8.role_enforcement']).toBe('SKIPPED')
    expect(byName['c9.image_digest_match']).toBe('SKIPPED')
    expect(byName['c5.https_live_200']).toBe('PASS')
    expect(report.status).toBe('FAIL')
  })

  it('reads SMOKE_* variables and refuses an insecure target', () => {
    expect(() => targetSmokeConfigFromEnv({})).toThrow(TargetSmokeConfigError)
    expect(() =>
      targetSmokeConfigFromEnv({ SMOKE_TARGET_URL: 'http://harness.invalid' })
    ).toThrow('SMOKE_TARGET_URL must use https:')
    expect(() =>
      targetSmokeConfigFromEnv({
        SMOKE_TARGET_URL: 'https://harness.invalid',
        SMOKE_OPERATOR_A_TOKEN: 'synthetic',
        SMOKE_OPERATOR_A_ROLE: 'Root'
      })
    ).toThrow('SMOKE_OPERATOR_A_ROLE')

    const derived = targetSmokeConfigFromEnv({
      SMOKE_TARGET_URL: 'https://harness.invalid/ignored/path'
    })
    expect(derived).toMatchObject({
      targetUrl: 'https://harness.invalid',
      plainHttpUrl: 'http://harness.invalid',
      protectedPath: '/v1/tasks',
      roleProbePath: '/v1/admin/agents',
      rateLimitRequests: 40,
      expectMetrics: false,
      operators: []
    })
    expect(derived.allowInsecureTarget).toBeUndefined()

    const explicit = targetSmokeConfigFromEnv({
      SMOKE_TARGET_URL: 'https://harness.invalid',
      SMOKE_PLAIN_HTTP_URL: 'skip',
      SMOKE_OPERATOR_A_TOKEN: 'synthetic-a',
      SMOKE_OPERATOR_A_ROLE: 'Admin',
      SMOKE_OPERATOR_B_TOKEN: 'synthetic-b',
      SMOKE_RATE_LIMIT_REQUESTS: '0',
      SMOKE_EXPECTED_IMAGE_DIGEST: `sha256:${'c'.repeat(64)}`
    })
    expect(explicit.plainHttpUrl).toBeNull()
    expect(explicit.operators).toEqual([
      { label: 'A', token: 'synthetic-a', expectedRole: 'Admin' },
      { label: 'B', token: 'synthetic-b' }
    ])
    expect(explicit.rateLimitRequests).toBe(0)
  })
})
