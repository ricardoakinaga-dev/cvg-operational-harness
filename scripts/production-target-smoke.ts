#!/usr/bin/env tsx
/**
 * PLAN0374 Fase C (C5, C7, C8, C9) — smoke against a REMOTE production
 * target, run from an operator machine with HTTPS access only (no Docker,
 * no database credential). Companion of scripts/production-stack-smoke.ts,
 * which proves the same image locally with its own PostgreSQL.
 *
 * Checks (each PASS, FAIL or SKIPPED with a reason):
 *   - plain HTTP answers 426 from the API, not a redirect (C5);
 *   - HTTPS /live and /ready answer 200 (C5, C7);
 *   - API security headers, HSTS included, which proves the proxy is the
 *     trusted forwarder (C5);
 *   - a hostile Origin is refused, simple and preflight (C5);
 *   - a protected route without session answers 401 (C8);
 *   - two operators log in through GET /v1/session with tokens minted by
 *     the issuer, reuse the session cookie, reach a protected route, hold
 *     distinct roles and see role enforcement (C8); SKIPPED without tokens;
 *   - /health/metrics is not published unless expected (C7);
 *   - the deployed image digest equals the certified one (C9; the API has
 *     no build-info route, so the operator reads the deployed digest from
 *     the platform);
 *   - rate limiting over N anonymous requests, observation only (0374 Obs).
 *
 * Tokens, cookies and operator ids are never written to the output.
 *
 * Usage:
 *   SMOKE_TARGET_URL=https://<host> [SMOKE_* below] \
 *     npx tsx scripts/production-target-smoke.ts [--output <file.json>]
 * Exit: 0 no FAIL, 1 at least one FAIL, 2 invalid configuration.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { OperatorRoleSchema, type OperatorRole } from '@cvg/shared'
import { API_CONTENT_SECURITY_POLICY } from '../apps/api/src/http-security.ts'
import { TRUSTED_OPERATOR_TOKEN_HEADER } from '../apps/api/src/operator-identity.ts'

export type Verdict = 'PASS' | 'FAIL' | 'SKIPPED'
export type PlanItem = 'C5' | 'C7' | 'C8' | 'C9'

export interface TargetCheck {
  readonly name: string
  readonly items: readonly PlanItem[]
  readonly verdict: Verdict
  readonly reason?: string
  readonly detail?: unknown
}

export interface OperatorCredential {
  readonly label: string
  readonly token: string
  readonly expectedRole?: OperatorRole
}

export interface TargetSmokeConfig {
  /** HTTPS origin of the deployed proxy. */
  readonly targetUrl: string
  /** Plain HTTP origin, or null to skip the 426 check explicitly. */
  readonly plainHttpUrl: string | null
  readonly allowedOrigin?: string
  readonly hostileOrigin: string
  /** Route every operator role may read (task:view). */
  readonly protectedPath: string
  /** Route only Admin may read (agent:view). */
  readonly roleProbePath: string
  readonly operators: readonly OperatorCredential[]
  readonly rateLimitRequests: number
  readonly expectMetrics: boolean
  readonly expectedImageDigest?: string
  readonly deployedImageDigest?: string
  readonly timeoutMs: number
  /** Tests only (fake server over plain HTTP); never read from env. */
  readonly allowInsecureTarget?: boolean
}

export interface TargetSmokeReport {
  readonly schemaVersion: 1
  readonly kind: 'cvg-production-target-smoke'
  readonly task: string
  readonly plan: string
  readonly items: readonly PlanItem[]
  readonly target: {
    readonly origin: string
    readonly plainHttp: string | null
  }
  readonly startedAt: string
  readonly finishedAt: string
  readonly dataPolicy: string
  readonly checks: readonly TargetCheck[]
  readonly summary: {
    readonly pass: number
    readonly fail: number
    readonly skipped: number
  }
  readonly complete: boolean
  readonly cleanup: readonly {
    readonly label: string
    readonly logout: number | string
  }[]
  readonly status: 'PASS' | 'FAIL'
}

export class TargetSmokeConfigError extends Error {}

const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/
const HSTS_MIN_AGE_SECONDS = 300
const MAX_RATE_LIMIT_REQUESTS = 300

function originOf(raw: string, name: string, protocols: string[]): string {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new TargetSmokeConfigError(`${name} is not a URL`)
  }
  if (!protocols.includes(parsed.protocol)) {
    throw new TargetSmokeConfigError(
      `${name} must use ${protocols.join(' or ')}`
    )
  }
  if (parsed.username || parsed.password) {
    throw new TargetSmokeConfigError(`${name} must not carry credentials`)
  }
  return parsed.origin
}

function routePath(raw: string | undefined, fallback: string, name: string) {
  const value = raw?.trim() || fallback
  if (!/^\/[A-Za-z0-9/_.-]*$/.test(value)) {
    throw new TargetSmokeConfigError(`${name} must be an absolute path`)
  }
  return value
}

function integerInRange(
  raw: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number
): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new TargetSmokeConfigError(
      `${name} must be an integer ${min}..${max}`
    )
  }
  return value
}

function operatorFromEnv(
  env: NodeJS.ProcessEnv,
  label: 'A' | 'B'
): OperatorCredential | undefined {
  const token = env[`SMOKE_OPERATOR_${label}_TOKEN`]?.trim()
  const rawRole = env[`SMOKE_OPERATOR_${label}_ROLE`]?.trim()
  if (!token) return undefined
  if (!rawRole) return { label, token }
  const role = OperatorRoleSchema.safeParse(rawRole)
  if (!role.success) {
    throw new TargetSmokeConfigError(
      `SMOKE_OPERATOR_${label}_ROLE must be Operator, Approver, Supervisor or Admin`
    )
  }
  return { label, token, expectedRole: role.data }
}

/** Reads SMOKE_* variables; HTTPS is mandatory for the target. */
export function targetSmokeConfigFromEnv(
  env: NodeJS.ProcessEnv
): TargetSmokeConfig {
  const rawTarget = env.SMOKE_TARGET_URL?.trim()
  if (!rawTarget)
    throw new TargetSmokeConfigError('SMOKE_TARGET_URL is required')
  const targetUrl = originOf(rawTarget, 'SMOKE_TARGET_URL', ['https:'])
  const rawPlain = env.SMOKE_PLAIN_HTTP_URL?.trim()
  const plainHttpUrl =
    rawPlain === 'skip'
      ? null
      : rawPlain
        ? originOf(rawPlain, 'SMOKE_PLAIN_HTTP_URL', ['http:'])
        : `http://${new URL(targetUrl).hostname}`
  const rawAllowed = env.SMOKE_ALLOWED_ORIGIN?.trim()
  const operators = (['A', 'B'] as const)
    .map((label) => operatorFromEnv(env, label))
    .filter((operator): operator is OperatorCredential => Boolean(operator))
  const expectMetrics = env.SMOKE_EXPECT_METRICS?.trim() ?? 'false'
  if (expectMetrics !== 'true' && expectMetrics !== 'false') {
    throw new TargetSmokeConfigError(
      'SMOKE_EXPECT_METRICS must be true or false'
    )
  }
  const expectedImageDigest = env.SMOKE_EXPECTED_IMAGE_DIGEST?.trim()
  const deployedImageDigest = env.SMOKE_DEPLOYED_IMAGE_DIGEST?.trim()
  return {
    targetUrl,
    plainHttpUrl,
    ...(rawAllowed
      ? {
          allowedOrigin: originOf(rawAllowed, 'SMOKE_ALLOWED_ORIGIN', [
            'https:',
            'http:'
          ])
        }
      : {}),
    hostileOrigin: originOf(
      env.SMOKE_HOSTILE_ORIGIN?.trim() || 'https://hostile.invalid',
      'SMOKE_HOSTILE_ORIGIN',
      ['https:', 'http:']
    ),
    protectedPath: routePath(
      env.SMOKE_PROTECTED_PATH,
      '/v1/tasks',
      'SMOKE_PROTECTED_PATH'
    ),
    roleProbePath: routePath(
      env.SMOKE_ROLE_PROBE_PATH,
      '/v1/admin/agents',
      'SMOKE_ROLE_PROBE_PATH'
    ),
    operators,
    rateLimitRequests: integerInRange(
      env.SMOKE_RATE_LIMIT_REQUESTS,
      40,
      'SMOKE_RATE_LIMIT_REQUESTS',
      0,
      MAX_RATE_LIMIT_REQUESTS
    ),
    expectMetrics: expectMetrics === 'true',
    ...(expectedImageDigest ? { expectedImageDigest } : {}),
    ...(deployedImageDigest ? { deployedImageDigest } : {}),
    timeoutMs: integerInRange(
      env.SMOKE_TIMEOUT_MS,
      10_000,
      'SMOKE_TIMEOUT_MS',
      100,
      120_000
    )
  }
}

interface Observed {
  readonly status: number
  readonly headers: Headers
  readonly body: unknown
}

interface TransportError {
  readonly error: string
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

function isTransportError(
  value: Observed | TransportError
): value is TransportError {
  return 'error' in value
}

function transportReason(error: unknown): string {
  const cause = (error as { cause?: unknown })?.cause
  if (cause && typeof (cause as { code?: unknown }).code === 'string') {
    return (cause as { code: string }).code
  }
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout'
  if (cause instanceof Error && cause.message) return cause.message
  return error instanceof Error ? error.name : 'unknown'
}

/** Prefers the transport failure, if any, over the HTTP-level reason. */
function because(
  results: readonly (Observed | TransportError)[],
  reason: string
): string {
  const failed = results.find(isTransportError)
  return failed ? `transport: ${failed.error}` : reason
}

function hashed(value: unknown): string | undefined {
  return typeof value === 'string'
    ? createHash('sha256').update(value).digest('hex').slice(0, 12)
    : undefined
}

function parseSetCookie(header: string | undefined): {
  pair?: string
  attributes: readonly string[]
} {
  if (!header) return { attributes: [] }
  const [pair, ...attributes] = header.split(';').map((part) => part.trim())
  return {
    ...(pair && /^[^=\s]+=[^\s]+$/.test(pair) ? { pair } : {}),
    attributes: attributes.map((attribute) =>
      attribute.replace(/\s+/g, '').toLowerCase()
    )
  }
}

function identityOf(body: unknown): { operatorId?: string; role?: string } {
  const identity = (body as { data?: { identity?: Record<string, unknown> } })
    ?.data?.identity
  return {
    ...(typeof identity?.operatorId === 'string'
      ? { operatorId: identity.operatorId }
      : {}),
    ...(typeof identity?.role === 'string' ? { role: identity.role } : {})
  }
}

function normalizedDigest(value: string): string {
  const at = value.lastIndexOf('@')
  return (at >= 0 ? value.slice(at + 1) : value).trim().toLowerCase()
}

/** Runs every check against the configured target; never throws on HTTP. */
export async function runTargetSmoke(
  config: TargetSmokeConfig,
  fetchImpl: FetchLike = fetch
): Promise<TargetSmokeReport> {
  const startedAt = new Date().toISOString()
  const checks: TargetCheck[] = []
  const record = (
    name: string,
    items: readonly PlanItem[],
    verdict: Verdict,
    reason?: string,
    detail?: unknown
  ) => {
    checks.push({
      name,
      items,
      verdict,
      ...(reason !== undefined ? { reason } : {}),
      ...(detail !== undefined ? { detail } : {})
    })
  }
  const call = async (
    base: string,
    pathname: string,
    init: { method?: string; headers?: Record<string, string> } = {}
  ): Promise<Observed | TransportError> => {
    try {
      const response = await fetchImpl(`${base}${pathname}`, {
        method: init.method ?? 'GET',
        headers: init.headers ?? {},
        redirect: 'manual',
        signal: AbortSignal.timeout(config.timeoutMs)
      })
      const text = await response.text()
      let body: unknown = text.slice(0, 200)
      try {
        body = JSON.parse(text)
      } catch {
        // Non-JSON bodies are kept as a short excerpt.
      }
      return { status: response.status, headers: response.headers, body }
    } catch (error) {
      return { error: transportReason(error) }
    }
  }
  const status = (result: Observed | TransportError) =>
    isTransportError(result) ? result.error : result.status
  const target = config.targetUrl

  // C5: the target itself must be HTTPS.
  if (config.allowInsecureTarget) {
    record(
      'config.target_https',
      ['C5'],
      'SKIPPED',
      'insecure target allowed by the test harness'
    )
  } else {
    const https = target.startsWith('https://')
    record(
      'config.target_https',
      ['C5'],
      https ? 'PASS' : 'FAIL',
      https ? undefined : 'SMOKE_TARGET_URL must be https'
    )
  }

  // C5: plain HTTP reaches the API and is refused with 426 (no redirect).
  if (config.plainHttpUrl === null) {
    record(
      'c5.plain_http_426',
      ['C5'],
      'SKIPPED',
      'SMOKE_PLAIN_HTTP_URL=skip; acceptance C5 requires 426 without TLS'
    )
  } else {
    const live = await call(config.plainHttpUrl, '/live')
    const session = await call(config.plainHttpUrl, '/v1/session')
    const both = [live, session]
    const pass = both.every((result) => status(result) === 426)
    const redirected = both.some(
      (result) =>
        !isTransportError(result) && result.status >= 300 && result.status < 400
    )
    record(
      'c5.plain_http_426',
      ['C5'],
      pass ? 'PASS' : 'FAIL',
      pass
        ? undefined
        : redirected
          ? 'redirect instead of 426: the proxy must forward plain HTTP to the API'
          : because(both, 'plain HTTP did not answer 426'),
      {
        live: status(live),
        session: status(session),
        upgrade: isTransportError(live) ? null : live.headers.get('upgrade')
      }
    )
  }

  // C5/C7: liveness and readiness through TLS.
  const live = await call(target, '/live')
  const liveOk =
    !isTransportError(live) &&
    live.status === 200 &&
    (live.body as { data?: { status?: unknown } })?.data?.status === 'ok'
  record(
    'c5.https_live_200',
    ['C5', 'C7'],
    liveOk ? 'PASS' : 'FAIL',
    liveOk
      ? undefined
      : because([live], 'GET /live over HTTPS did not answer 200 ok'),
    { status: status(live) }
  )
  const ready = await call(target, '/ready')
  const readyOk =
    !isTransportError(ready) &&
    ready.status === 200 &&
    (ready.body as { data?: { ready?: unknown } })?.data?.ready === true
  record(
    'c7.https_ready_200',
    ['C7'],
    readyOk ? 'PASS' : 'FAIL',
    readyOk
      ? undefined
      : because([ready], 'GET /ready over HTTPS did not answer 200 ready'),
    { status: status(ready) }
  )

  // C5: API headers; HSTS is only emitted for a trusted forwarded https.
  if (isTransportError(live)) {
    record('c5.security_headers', ['C5'], 'FAIL', `transport: ${live.error}`)
  } else {
    const hsts = live.headers.get('strict-transport-security') ?? ''
    const maxAge = Number(/max-age=(\d+)/i.exec(hsts)?.[1] ?? 0)
    const observed = {
      contentSecurityPolicy:
        live.headers.get('content-security-policy') ===
        API_CONTENT_SECURITY_POLICY,
      nosniff: live.headers.get('x-content-type-options') === 'nosniff',
      frameDeny: live.headers.get('x-frame-options') === 'DENY',
      noReferrer: live.headers.get('referrer-policy') === 'no-referrer',
      hsts: maxAge >= HSTS_MIN_AGE_SECONDS
    }
    const missing = Object.entries(observed)
      .filter(([, ok]) => !ok)
      .map(([name]) => name)
    record(
      'c5.security_headers',
      ['C5'],
      missing.length === 0 ? 'PASS' : 'FAIL',
      missing.length === 0
        ? undefined
        : `missing or wrong: ${missing.join(', ')}${
            observed.hsts
              ? ''
              : ' (no HSTS: the proxy is not the trusted forwarder)'
          }`,
      { ...observed, hstsMaxAge: maxAge, server: live.headers.get('server') }
    )
  }

  // C5: hostile origins are refused, simple request and preflight.
  const hostileSimple = await call(target, '/ready', {
    headers: { origin: config.hostileOrigin }
  })
  const hostilePreflight = await call(target, '/v1/session', {
    method: 'OPTIONS',
    headers: {
      origin: config.hostileOrigin,
      'access-control-request-method': 'GET',
      'access-control-request-headers': TRUSTED_OPERATOR_TOKEN_HEADER
    }
  })
  const refused = (result: Observed | TransportError) =>
    !isTransportError(result) &&
    result.status === 403 &&
    result.headers.get('access-control-allow-origin') === null
  record(
    'c5.cors_hostile_origin_refused',
    ['C5'],
    refused(hostileSimple) && refused(hostilePreflight) ? 'PASS' : 'FAIL',
    refused(hostileSimple) && refused(hostilePreflight)
      ? undefined
      : because(
          [hostileSimple, hostilePreflight],
          'a hostile Origin was not refused with 403 and no allow-origin'
        ),
    { simple: status(hostileSimple), preflight: status(hostilePreflight) }
  )
  if (config.allowedOrigin) {
    const allowed = await call(target, '/v1/session', {
      method: 'OPTIONS',
      headers: {
        origin: config.allowedOrigin,
        'access-control-request-method': 'GET',
        'access-control-request-headers': TRUSTED_OPERATOR_TOKEN_HEADER
      }
    })
    const ok =
      !isTransportError(allowed) &&
      allowed.status === 204 &&
      allowed.headers.get('access-control-allow-origin') ===
        config.allowedOrigin
    record(
      'c5.cors_allowed_origin_preflight',
      ['C5'],
      ok ? 'PASS' : 'FAIL',
      ok
        ? undefined
        : because([allowed], 'the allowed origin preflight was not accepted'),
      { status: status(allowed) }
    )
  } else {
    record(
      'c5.cors_allowed_origin_preflight',
      ['C5'],
      'SKIPPED',
      'SMOKE_ALLOWED_ORIGIN not set'
    )
  }

  // C8: no session, no access.
  const anonymous = await call(target, config.protectedPath)
  record(
    'c8.no_session_401',
    ['C8'],
    status(anonymous) === 401 ? 'PASS' : 'FAIL',
    status(anonymous) === 401
      ? undefined
      : because(
          [anonymous],
          `${config.protectedPath} without session did not answer 401`
        ),
    { path: config.protectedPath, status: status(anonymous) }
  )

  // C8: operator logins (token -> session cookie), reuse and protected route.
  const sessions: { label: string; cookie: string; role: string }[] = []
  for (const operator of config.operators) {
    const name = `c8.operator_${operator.label.toLowerCase()}_login`
    const login = await call(target, '/v1/session', {
      headers: { [TRUSTED_OPERATOR_TOKEN_HEADER]: operator.token }
    })
    if (isTransportError(login)) {
      record(name, ['C8'], 'FAIL', `transport: ${login.error}`)
      continue
    }
    const cookie = parseSetCookie(
      login.headers.getSetCookie()[0] ??
        login.headers.get('set-cookie') ??
        undefined
    )
    const identity = identityOf(login.body)
    const cookieFlags = {
      httpOnly: cookie.attributes.includes('httponly'),
      secure: cookie.attributes.includes('secure'),
      sameSiteStrict: cookie.attributes.includes('samesite=strict')
    }
    const reuse = cookie.pair
      ? await call(target, '/v1/session', { headers: { cookie: cookie.pair } })
      : undefined
    const reused =
      reuse && !isTransportError(reuse) ? identityOf(reuse.body) : {}
    const protectedResult = cookie.pair
      ? await call(target, config.protectedPath, {
          headers: { cookie: cookie.pair }
        })
      : undefined
    const problems = [
      login.status === 200 ? null : `login ${login.status}`,
      cookie.pair ? null : 'no session cookie',
      cookieFlags.httpOnly && cookieFlags.secure && cookieFlags.sameSiteStrict
        ? null
        : 'cookie lacks HttpOnly/Secure/SameSite=Strict',
      operator.expectedRole && identity.role !== operator.expectedRole
        ? `role ${identity.role ?? 'none'} != expected ${operator.expectedRole}`
        : null,
      reuse &&
      status(reuse) === 200 &&
      reused.role === identity.role &&
      reused.operatorId === identity.operatorId
        ? null
        : 'session cookie was not accepted on reuse',
      protectedResult && status(protectedResult) === 200
        ? null
        : `${config.protectedPath} with session did not answer 200`
    ].filter((problem): problem is string => problem !== null)
    record(
      name,
      ['C8'],
      problems.length === 0 ? 'PASS' : 'FAIL',
      problems.length === 0 ? undefined : problems.join('; '),
      {
        status: login.status,
        role: identity.role ?? null,
        operatorIdSha256: hashed(identity.operatorId) ?? null,
        cookie: cookieFlags,
        reuse: reuse ? status(reuse) : null,
        protected: protectedResult ? status(protectedResult) : null
      }
    )
    if (problems.length === 0 && cookie.pair && identity.role) {
      sessions.push({
        label: operator.label,
        cookie: cookie.pair,
        role: identity.role
      })
    }
  }
  if (config.operators.length < 2) {
    record(
      'c8.distinct_roles',
      ['C8'],
      'SKIPPED',
      'set SMOKE_OPERATOR_A_TOKEN and SMOKE_OPERATOR_B_TOKEN (tokens from the issuer)'
    )
  } else {
    const roles = new Set(sessions.map((session) => session.role))
    const pass = sessions.length === config.operators.length && roles.size >= 2
    record(
      'c8.distinct_roles',
      ['C8'],
      pass ? 'PASS' : 'FAIL',
      pass
        ? undefined
        : 'two successful logins with distinct roles are required',
      { logins: sessions.length, roles: [...roles] }
    )
  }
  if (sessions.length === 0) {
    record(
      'c8.role_enforcement',
      ['C8'],
      'SKIPPED',
      'no operator session available'
    )
  } else {
    const observed = []
    for (const session of sessions) {
      const result = await call(target, config.roleProbePath, {
        headers: { cookie: session.cookie }
      })
      const expected = session.role === 'Admin' ? 200 : 403
      observed.push({
        label: session.label,
        role: session.role,
        expected,
        status: status(result)
      })
    }
    const pass = observed.every((entry) => entry.status === entry.expected)
    record(
      'c8.role_enforcement',
      ['C8'],
      pass ? 'PASS' : 'FAIL',
      pass
        ? undefined
        : `${config.roleProbePath} is Admin-only (agent:view): expected 200 for Admin, 403 otherwise`,
      { path: config.roleProbePath, observed }
    )
  }
  const cleanup: { label: string; logout: number | string }[] = []
  for (const session of sessions) {
    const logout = await call(target, '/v1/session/logout', {
      method: 'POST',
      headers: { cookie: session.cookie }
    })
    cleanup.push({ label: session.label, logout: status(logout) })
  }

  // C7: request metrics stay unpublished unless explicitly expected.
  const metrics = await call(target, '/health/metrics')
  const metricsOk = config.expectMetrics
    ? status(metrics) === 200
    : status(metrics) === 404 || status(metrics) === 403
  record(
    'c7.metrics_exposure',
    ['C7'],
    metricsOk ? 'PASS' : 'FAIL',
    metricsOk
      ? undefined
      : because(
          [metrics],
          config.expectMetrics
            ? '/health/metrics expected but not reachable'
            : '/health/metrics is published without being expected'
        ),
    { expected: config.expectMetrics, status: status(metrics) }
  )

  // C9: same digest as the certification.
  if (!config.expectedImageDigest || !config.deployedImageDigest) {
    record(
      'c9.image_digest_match',
      ['C9'],
      'SKIPPED',
      'set SMOKE_EXPECTED_IMAGE_DIGEST (certification) and SMOKE_DEPLOYED_IMAGE_DIGEST (read from the platform; the API exposes no build-info route)'
    )
  } else {
    const expected = normalizedDigest(config.expectedImageDigest)
    const deployed = normalizedDigest(config.deployedImageDigest)
    const wellFormed =
      DIGEST_PATTERN.test(expected) && DIGEST_PATTERN.test(deployed)
    const pass = wellFormed && expected === deployed
    record(
      'c9.image_digest_match',
      ['C9'],
      pass ? 'PASS' : 'FAIL',
      pass
        ? undefined
        : wellFormed
          ? 'deployed digest differs from the certified digest'
          : 'digests must be sha256:<64 hex>',
      { expected, deployed }
    )
  }

  // Observation only: how the rate limit treats anonymous traffic.
  if (config.rateLimitRequests === 0) {
    record(
      'c5.rate_limit_observation',
      ['C5'],
      'SKIPPED',
      'SMOKE_RATE_LIMIT_REQUESTS=0'
    )
  } else {
    const statuses: Record<string, number> = {}
    let first429At: number | null = null
    for (let index = 1; index <= config.rateLimitRequests; index += 1) {
      const result = await call(target, config.protectedPath)
      const key = String(status(result))
      statuses[key] = (statuses[key] ?? 0) + 1
      if (first429At === null && status(result) === 429) first429At = index
    }
    const answered = Object.entries(statuses)
      .filter(([key]) => /^\d+$/.test(key))
      .reduce((sum, [, count]) => sum + count, 0)
    record(
      'c5.rate_limit_observation',
      ['C5'],
      answered > 0 ? 'PASS' : 'FAIL',
      answered > 0
        ? 'observation only; anonymous budget is 300 requests/min per client IP (apps/api/src/server.ts)'
        : 'no request was answered',
      {
        path: config.protectedPath,
        requests: config.rateLimitRequests,
        statuses,
        first429At
      }
    )
  }

  const summary = {
    pass: checks.filter((check) => check.verdict === 'PASS').length,
    fail: checks.filter((check) => check.verdict === 'FAIL').length,
    skipped: checks.filter((check) => check.verdict === 'SKIPPED').length
  }
  return {
    schemaVersion: 1,
    kind: 'cvg-production-target-smoke',
    task: 'PLAN0374-B-FABLE-20261007',
    plan: 'docs/03_build/0374_plano_producao_harness.md, Fase C',
    items: ['C5', 'C7', 'C8', 'C9'],
    target: { origin: target, plainHttp: config.plainHttpUrl },
    startedAt,
    finishedAt: new Date().toISOString(),
    dataPolicy:
      'no secrets or personal data: tokens and cookies are never recorded; operator ids only as a sha256 prefix',
    checks,
    summary,
    complete: summary.skipped === 0,
    cleanup,
    status: summary.fail > 0 ? 'FAIL' : 'PASS'
  }
}

function outputPath(argv: readonly string[]): string | undefined {
  const index = argv.indexOf('--output')
  if (index < 0) return undefined
  const value = argv[index + 1]
  if (!value) throw new TargetSmokeConfigError('--output requires a file')
  return path.resolve(value)
}

async function main(): Promise<number> {
  let config: TargetSmokeConfig
  let output: string | undefined
  try {
    config = targetSmokeConfigFromEnv(process.env)
    output = outputPath(process.argv)
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    return 2
  }
  const report = await runTargetSmoke(config)
  for (const check of report.checks) {
    process.stdout.write(
      `${check.verdict} ${check.name}${check.reason ? ` — ${check.reason}` : ''}\n`
    )
  }
  const json = `${JSON.stringify(report, null, 2)}\n`
  if (output) {
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, json)
  }
  process.stdout.write(
    `${JSON.stringify({ status: report.status, summary: report.summary, complete: report.complete, ...(output ? { output } : {}) })}\n`
  )
  if (!output) process.stdout.write(json)
  return report.status === 'PASS' ? 0 : 1
}

// Run only as the entry point (tsx), never when imported by the test.
// scripts/ compiles as CommonJS for the typecheck, so no import.meta here.
if (/production-target-smoke\.[cm]?[jt]s$/.test(process.argv[1] ?? '')) {
  main()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      process.stderr.write(
        `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`
      )
      process.exitCode = 1
    })
}
