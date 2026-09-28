import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import https from 'node:https'

const worktree = '/tmp/cvg-pr301-corporate-20260928'
const base = '/tmp/cvg-pr302-https-browser-20260928'
const require = createRequire(`${worktree}/package.json`)
const Fastify = require('fastify')
const { chromium } = require('@playwright/test')
const { installHttpSecurityHooks, normalizeHttpSecurityOptions } = await import(
  `${worktree}/apps/api/src/http-security.ts`
)
const {
  HOST_OPERATOR_SESSION_COOKIE,
  parseOperatorSessionCookie,
  serializeOperatorSessionCookie
} = await import(`${worktree}/apps/api/src/operator-session.ts`)

const tls = {
  key: await readFile(`${base}/key.pem`),
  cert: await readFile(`${base}/cert.pem`)
}
const consoleOrigin = 'https://console.example.test:4197'
const apiOrigin = 'https://api.example.test:4198'
const idpOrigin = 'https://idp.other.test:4199'
const siblingOrigin = 'https://sibling.example.test:4200'
const evilOrigin = 'https://evil.other.test:4201'
const sessionIds = {
  a: 'opsess_synthetic_browser_a_20260928',
  b: 'opsess_synthetic_browser_b_20260928'
}
const identities = {
  a: {
    operatorId: 'synthetic.operator.a',
    tenantId: 'tenant_00000000-0000-4000-8000-000000000701',
    role: 'Supervisor'
  },
  b: {
    operatorId: 'synthetic.operator.b',
    tenantId: 'tenant_00000000-0000-4000-8000-000000000702',
    role: 'Operator'
  }
}
const observed = {
  consoleCookies: [],
  apiSessions: [],
  callbackCookies: [],
  mutations: 0,
  evilRequests: 0,
  nginxSessionStatus: null,
  csp: null
}
let sessionUnavailable = false
const servers = []
let browser
let api
let contextA
let contextB

function envelope(data, error = null) {
  return {
    success: error === null,
    data: error === null ? data : null,
    error,
    meta: { correlationId: 'corr_pr302_synthetic_browser' }
  }
}

async function listen(server, port) {
  servers.push(server)
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
}

async function rawMutation(origin, cookie) {
  return new Promise((resolve, reject) => {
    const headers = {
      host: 'api.example.test:4198',
      cookie,
      'content-type': 'application/json'
    }
    if (origin !== null) headers.origin = origin
    const request = https.request(
      {
        hostname: '127.0.0.1',
        port: 4198,
        servername: 'api.example.test',
        path: '/v1/synthetic-mutation',
        method: 'POST',
        rejectUnauthorized: false,
        headers
      },
      (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      }
    )
    request.on('error', reject)
    request.end('{}')
  })
}

try {
  api = Fastify({ https: tls, logger: false })
  installHttpSecurityHooks(
    api,
    normalizeHttpSecurityOptions({
      allowedOrigins: [consoleOrigin],
      operatorConsoleOrigin: consoleOrigin,
      enforceHttps: true
    })
  )
  api.get('/set', async (request, reply) => {
    const who = request.query?.who === 'b' ? 'b' : 'a'
    const record = {
      sessionId: sessionIds[who],
      identity: identities[who],
      expiresAt: Date.now() + 15 * 60_000
    }
    reply.header('set-cookie', [
      serializeOperatorSessionCookie(record, true, HOST_OPERATOR_SESSION_COOKIE),
      '__Host-cvg_oidc_pending=synthetic_pending; Secure; HttpOnly; SameSite=Lax; Path=/'
    ])
    return envelope({ set: who })
  })
  api.get('/v1/session', async (request, reply) => {
    observed.apiSessions.push({ cookie: request.headers.cookie ?? '', origin: request.headers.origin ?? null })
    if (sessionUnavailable) {
      reply.code(503)
      return envelope(null, { code: 'configuration_error', message: 'Operator session store is unavailable' })
    }
    const sessionId = parseOperatorSessionCookie(
      request.headers.cookie,
      HOST_OPERATOR_SESSION_COOKIE
    )
    const who = Object.entries(sessionIds).find(([, id]) => id === sessionId)?.[0]
    if (!who) {
      reply.code(401)
      return envelope(null, { code: 'unauthorized', message: 'Operator session is missing' })
    }
    return envelope({ identity: identities[who], expiresAt: new Date(Date.now() + 15 * 60_000).toISOString() })
  })
  api.get('/v1/conversations', async () => envelope({ items: [], pageInfo: { limit: 25, offset: 0, total: 0, hasNextPage: false } }))
  api.get('/v1/approvals', async () => envelope([]))
  api.get('/v1/tasks', async () => envelope([]))
  api.post('/v1/synthetic-mutation', async () => {
    observed.mutations += 1
    return envelope({ changed: true })
  })
  api.get('/v1/auth/oidc/callback', async (request) => {
    observed.callbackCookies.push(request.headers.cookie ?? '')
    return envelope({ observed: true })
  })
  await api.listen({ port: 4198, host: '127.0.0.1' })

  await listen(
    https.createServer(tls, (request, response) => {
      observed.consoleCookies.push(request.headers.cookie ?? '')
      const upstream = http.request(
        {
          hostname: '127.0.0.1',
          port: 4217,
          method: request.method,
          path: request.url,
          headers: request.headers
        },
        (upstreamResponse) => {
          if (request.url === '/v1/session') {
            observed.nginxSessionStatus = upstreamResponse.statusCode
          }
          if (request.url === '/') {
            observed.csp = upstreamResponse.headers['content-security-policy'] ?? null
          }
          response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers)
          upstreamResponse.pipe(response)
        }
      )
      upstream.on('error', (error) => {
        response.writeHead(502)
        response.end(error.message)
      })
      request.pipe(upstream)
    }),
    4197
  )
  await listen(
    https.createServer(tls, (_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(`<a href="${apiOrigin}/v1/auth/oidc/callback?code=synthetic&state=synthetic">continue to API</a>`)
    }),
    4199
  )
  await listen(
    https.createServer(tls, (_request, response) => {
      response.writeHead(200, {
        'content-type': 'text/plain',
        'set-cookie': '__Host-cvg_operator_session=evil; Domain=example.test; Secure; Path=/'
      })
      response.end('synthetic sibling')
    }),
    4200
  )
  await listen(
    https.createServer(tls, (_request, response) => {
      observed.evilRequests += 1
      response.writeHead(200)
      response.end('unexpected')
    }),
    4201
  )

  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-proxy-server',
      '--host-resolver-rules=MAP api.example.test 127.0.0.1, MAP console.example.test 127.0.0.1, MAP idp.other.test 127.0.0.1, MAP sibling.example.test 127.0.0.1, MAP evil.other.test 127.0.0.1'
    ]
  })
  contextA = await browser.newContext({ ignoreHTTPSErrors: true })
  const pageA = await contextA.newPage()
  await pageA.goto(consoleOrigin)
  await pageA.getByText('Uma sessão confiável é necessária para continuar.').waitFor()
  assert.equal(observed.apiSessions.at(-1)?.origin, consoleOrigin)
  const responseHeaders = async () => {
    const captured = pageA.waitForResponse(
      (response) => response.url() === `${apiOrigin}/v1/session`
    )
    const status = await pageA.evaluate(async (url) => {
      const response = await fetch(url, { credentials: 'include' })
      return response.status
    }, `${apiOrigin}/v1/session`)
    const networkResponse = await captured
    const headers = await networkResponse.allHeaders()
    return {
      status,
      allowOrigin: headers['access-control-allow-origin'],
      allowCredentials: headers['access-control-allow-credentials'],
      vary: headers.vary,
      cacheControl: headers['cache-control']
    }
  }
  const assertCorsAndCache = (headers, status) => {
    assert.equal(headers.status, status)
    assert.equal(headers.allowOrigin, consoleOrigin)
    assert.equal(headers.allowCredentials, 'true')
    assert.match(headers.vary, /Origin/)
    assert.equal(headers.cacheControl, 'private, no-store')
  }
  assertCorsAndCache(await responseHeaders(), 401)

  await pageA.goto(`${apiOrigin}/set?who=a`)
  await pageA.goto(consoleOrigin)
  await pageA.getByText(identities.a.operatorId).waitFor()
  assertCorsAndCache(await responseHeaders(), 200)
  assert.ok(observed.apiSessions.at(-1)?.cookie.includes(`${HOST_OPERATOR_SESSION_COOKIE}=${sessionIds.a}`))
  assert.ok(observed.consoleCookies.every((cookie) => !cookie.includes('__Host-cvg_')))
  assert.equal(observed.csp.includes(`connect-src ${apiOrigin};`), true)
  assert.equal(observed.csp.includes("script-src 'self'"), true)

  sessionUnavailable = true
  await pageA.goto(consoleOrigin)
  await pageA.getByText('Sessão temporariamente indisponível. Tente novamente.').waitFor()
  assertCorsAndCache(await responseHeaders(), 503)
  sessionUnavailable = false
  await pageA.getByRole('button', { name: 'Tentar novamente' }).click()
  await pageA.getByText(identities.a.operatorId).waitFor()

  const blockedByCsp = await pageA.evaluate(async (url) => {
    try {
      await fetch(url, { credentials: 'include' })
      return false
    } catch {
      return true
    }
  }, `${evilOrigin}/v1/session`)
  assert.equal(blockedByCsp, true)
  assert.equal(observed.evilRequests, 0)

  const apiSessionCount = observed.apiSessions.length
  const nginxSession = await pageA.goto(`${consoleOrigin}/v1/session`)
  assert.equal(nginxSession.status(), 404)
  assert.equal(observed.nginxSessionStatus, 404)
  assert.equal(observed.apiSessions.length, apiSessionCount)

  await pageA.goto(`${idpOrigin}/redirect`)
  await pageA.getByText('continue to API').click()
  assert.match(observed.callbackCookies.at(-1), /__Host-cvg_oidc_pending=synthetic_pending/)
  assert.doesNotMatch(observed.callbackCookies.at(-1), /__Host-cvg_operator_session=/)

  const sessionCookie = `${HOST_OPERATOR_SESSION_COOKIE}=${sessionIds.a}`
  assert.equal(await rawMutation(consoleOrigin, sessionCookie), 200)
  for (const origin of [null, siblingOrigin, 'null', 'http://console.example.test:4197']) {
    assert.equal(await rawMutation(origin, sessionCookie), 403)
  }
  assert.equal(observed.mutations, 1)

  contextB = await browser.newContext({ ignoreHTTPSErrors: true })
  const pageB = await contextB.newPage()
  await pageB.goto(`${apiOrigin}/set?who=b`)
  await pageB.goto(consoleOrigin)
  await pageB.getByText(identities.b.operatorId).waitFor()
  assert.ok(observed.apiSessions.at(-1)?.cookie.includes(`${HOST_OPERATOR_SESSION_COOKIE}=${sessionIds.b}`))
  assert.ok(observed.consoleCookies.every((cookie) => !cookie.includes('__Host-cvg_')))

  await pageB.goto(`${siblingOrigin}/inject`)
  await pageB.goto(consoleOrigin)
  await pageB.getByText(identities.b.operatorId).waitFor()
  assert.ok(observed.apiSessions.at(-1)?.cookie.includes(`${HOST_OPERATOR_SESSION_COOKIE}=${sessionIds.b}`))
  assert.ok(!observed.apiSessions.at(-1)?.cookie.includes(`${HOST_OPERATOR_SESSION_COOKIE}=evil`))

  const result = {
    verdict: 'SYNTHETIC_PRODUCT_TRANSPORT_PASS',
    codeCommit: 'ed012a46ba722a2945f39ac7014475273818efa8',
    node: process.version,
    browser: `Chromium ${browser.version()}`,
    consoleOrigin,
    apiOrigin,
    image: 'cvg-pr302-web:ed012a4',
    imageDigest: 'sha256:e6d0f2574fc9d1f18e949baa5da8524aef98239285d511bce6368f893528ab19',
    nginxV1Status: observed.nginxSessionStatus,
    csp: observed.csp,
    apiCookieNeverReachedConsole: observed.consoleCookies.every((cookie) => !cookie.includes('__Host-cvg_')),
    distinctOperatorSessionsRestoredByRealWebBundle: true,
    corsAndNoStoreVerifiedOnStatuses: [200, 401, 503],
    session503RetryRecovered: true,
    apiHookCredentialedCorsAndCsrfChecked: true,
    crossSiteCallbackReceivedLaxWithoutStrict: true,
    siblingCookieInjectionRejected: true,
    cspBlockedUnapprovedNetworkRequest: observed.evilRequests === 0,
    productApiEntrypointUsed: false,
    corporateOidcClientUsed: false
  }
  await writeFile(`${base}/result.json`, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(result)}\n`)
} finally {
  await contextB?.close()
  await contextA?.close()
  await browser?.close()
  await api?.close()
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))))
}
