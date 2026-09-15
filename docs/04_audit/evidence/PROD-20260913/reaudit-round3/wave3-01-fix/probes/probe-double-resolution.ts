/**
 * Independent verifier probe for WAVE3-01 fix.
 * Runs against whatever tree PROBE_ROOT points at (never the repo directly).
 * Scenario A: double-resolving admin route + replay-protected resolver, fresh
 *             headers object per request (the real HTTP shape): first request
 *             must reach business logic, later request with same token must be
 *             replay-rejected.
 * Scenario B: Fastify headers-object identity across requests (falsification:
 *             can one request's memo entry leak into another request?).
 * Scenario C: same token, separate requests, same literal client headers
 *             object (second inject) -> must be replay-rejected.
 * Scenario D: tenant-less trusted identity -> fail closed 401.
 */
import { join } from 'node:path'

interface Envelope {
  success: boolean
  data: unknown
  error: { code: string; message: string } | null
}

type HttpResult = { status: number; code: string | null }

async function main() {
  const root = process.env.PROBE_ROOT
  if (!root) throw new Error('PROBE_ROOT is required')

  const { buildServer } = await import(join(root, 'apps/api/src/server.ts'))
  const {
    TRUSTED_OPERATOR_TOKEN_HEADER,
    createLocalIdentityKeyRing,
    createTrustedOperatorIdentityResolver,
    createTrustedOperatorIdentityToken
  } = await import(join(root, 'apps/api/src/operator-identity.ts'))

  const now = 1_700_000_000_000
  const key = {
    keyId: 'kid_wave3_probe',
    secret: 'wave3-probe-secret-abcdefghijklmnopqrst'
  }
  const tenantA = 'tenant_00000000-0000-4000-8000-0000000009a1'
  const revokeUrl =
    '/v1/admin/capability-approvals/approval_00000000-0000-4000-8000-0000000009f1/revoke'

  async function injectRevoke(
    app: Awaited<ReturnType<typeof buildServer>>,
    headers: Record<string, string>
  ): Promise<HttpResult> {
    const response = await app.inject({
      method: 'POST',
      url: revokeUrl,
      headers
    })
    const body = response.json() as Envelope
    return { status: response.statusCode, code: body.error?.code ?? null }
  }

  function makeResolver() {
    const keyRing = createLocalIdentityKeyRing({ current: key })
    return createTrustedOperatorIdentityResolver({ keyRing, now: () => now })
  }

  function makeToken() {
    return createTrustedOperatorIdentityToken(
      {
        operatorId: 'operator.wave3.probe',
        role: 'Supervisor',
        tenantId: tenantA
      },
      key,
      () => now
    )
  }

  const results: Record<string, unknown> = {}

  // Scenario A: fresh headers object per request (real HTTP shape)
  {
    const token = makeToken()
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: makeResolver()
    })
    try {
      const first = await injectRevoke(app, {
        [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
        'x-tenant-id': tenantA
      })
      const replay = await injectRevoke(app, {
        [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
        'x-tenant-id': tenantA
      })
      results.scenarioA_freshHeaders = {
        first,
        replay,
        firstExpected: '400 invalid_action (business outcome)',
        replayExpected: '401 unauthorized (cross-request replay)'
      }
    } finally {
      await app.close()
    }
  }

  // Scenario B: does Fastify reuse the request.headers object across requests?
  {
    const token = makeToken()
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: makeResolver()
    })
    try {
      const seenHeaders: object[] = []
      app.addHook('onRequest', async (request) => {
        seenHeaders.push(request.headers)
      })
      await injectRevoke(app, {
        [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
        'x-tenant-id': tenantA
      })
      await injectRevoke(app, {
        [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
        'x-tenant-id': tenantA
      })
      results.scenarioB_headersObjectIdentity = {
        sameObjectAcrossRequests: seenHeaders[0] === seenHeaders[1],
        note: 'true would mean one request memo could leak into another'
      }
    } finally {
      await app.close()
    }
  }

  // Scenario C: same literal client headers object reused for two injects
  {
    const token = makeToken()
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: makeResolver()
    })
    try {
      const literalHeaders = {
        [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
        'x-tenant-id': tenantA
      }
      const first = await injectRevoke(app, literalHeaders)
      const second = await injectRevoke(app, literalHeaders)
      results.scenarioC_literalHeaderObjectReuse = {
        first,
        second,
        secondExpected: '401 unauthorized (server sees distinct headers objects)'
      }
    } finally {
      await app.close()
    }
  }

  // Scenario D: tenant-less trusted identity must fail closed
  {
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: () => ({
        operatorId: 'trusted.operator',
        role: 'Supervisor'
      })
    })
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/tasks',
        headers: { 'x-operator-id': 'trusted.operator' }
      })
      const body = response.json() as Envelope
      results.scenarioD_tenantLess = {
        status: response.statusCode,
        code: body.error?.code ?? null,
        expected: '401 unauthorized'
      }
    } finally {
      await app.close()
    }
  }

  // Scenario E: two concurrent requests with the same token, fresh headers each
  {
    const token = makeToken()
    const app = buildServer({
      identityMode: 'trusted',
      operatorIdentityResolver: makeResolver()
    })
    try {
      const [a, b] = await Promise.all([
        injectRevoke(app, {
          [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
          'x-tenant-id': tenantA
        }),
        injectRevoke(app, {
          [TRUSTED_OPERATOR_TOKEN_HEADER]: token,
          'x-tenant-id': tenantA
        })
      ])
      results.scenarioE_concurrentSameToken = {
        statuses: [a.status, b.status].sort(),
        codes: [a.code, b.code].sort(),
        expected: '[400, 401] - exactly one request consumes the token'
      }
    } finally {
      await app.close()
    }
  }

  console.log(JSON.stringify(results, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
