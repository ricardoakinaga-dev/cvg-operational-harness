import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, relative, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.env.CVG_CANDIDATE_ROOT
const outputDir = process.env.CVG_ROUTE_OUTPUT_DIR
const expectedHead = process.env.CVG_EXPECTED_ROOT_SHA
if (!root || !outputDir || !expectedHead) {
  throw new Error('candidate root, output directory and expected HEAD are required')
}
if (process.env.NODE_ENV !== 'development') {
  throw new Error('NODE_ENV=development is required for this synthetic probe')
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sourceManifest(): Array<{ path: string; sha256: string }> {
  const roots = ['apps/api/src', 'packages/shared/src']
  const paths = roots.flatMap((directory) => {
    const absolute = resolve(root!, directory)
    const visit = (current: string): string[] =>
      readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
        const target = join(current, entry.name)
        return entry.isDirectory() ? visit(target) : [target]
      })
    return visit(absolute)
  })
  paths.push(
    resolve(root, 'package.json'),
    resolve(root, 'package-lock.json'),
    resolve(root, 'apps/api/package.json'),
    resolve(root, 'packages/shared/package.json'),
    resolve(root, 'tsconfig.json')
  )
  return paths
    .sort()
    .map((path) => ({
      path: relative(root!, path),
      sha256: sha256(readFileSync(path))
    }))
}

function currentHead(): string {
  return execFileSync('git', ['-C', root!, 'rev-parse', 'HEAD'], {
    encoding: 'utf8'
  }).trim()
}

const initialHead = currentHead()
if (initialHead !== expectedHead) throw new Error('candidate HEAD changed before probe')
const initialSources = sourceManifest()
const initialServerSha = initialSources.find(
  (entry) => entry.path === 'apps/api/src/server.ts'
)?.sha256
if (!initialServerSha) throw new Error('server.ts is missing from source manifest')

const [{ buildServer }, identityModule, sessionModule] = await Promise.all([
  import(pathToFileURL(resolve(root, 'apps/api/src/server.ts')).href),
  import(pathToFileURL(resolve(root, 'apps/api/src/operator-identity.ts')).href),
  import(pathToFileURL(resolve(root, 'apps/api/src/operator-session.ts')).href)
])

const signingKey = 'aud0589-synthetic-signing-key-for-local-route-probe-only'
const resolver = identityModule.createTrustedOperatorIdentityResolver({
  secret: signingKey
})
const backingStore = sessionModule.createInMemoryOperatorSessionStore()
let revokeCalls = 0
const sessionStore = {
  ...backingStore,
  async revoke(sessionId: string) {
    revokeCalls += 1
    return backingStore.revoke(sessionId)
  }
}
const allowedOrigin = 'http://127.0.0.1:4173'
const app = buildServer({
  identityMode: 'trusted',
  operatorIdentityResolver: resolver,
  operatorSessionStore: sessionStore,
  httpSecurity: { allowedOrigins: [allowedOrigin] },
  rateLimiter: { check: () => ({ allowed: true, retryAfterSeconds: 0 }) },
  requestMetricsEnabled: false
})

await app.ready()
const routeTree = app.printRoutes({ commonPrefix: false })
writeFileSync(resolve(outputDir, 'route-tree.txt'), `${routeTree}\n`)
const stack: string[] = []
const routes: Array<{ method: string; path: string }> = []
for (const line of routeTree.split('\n')) {
  if (!line.trim()) continue
  const match = line.match(/^((?:│   |    )*)(?:├── |└── )(.+) \(([^)]+)\)$/)
  if (!match) throw new Error(`unparsed Fastify route tree line: ${line}`)
  const depth = match[1]!.length / 4
  const segment = match[2]!
  const path = depth === 0 ? segment : `${stack[depth - 1]}${segment}`
  stack[depth] = path
  stack.length = depth + 1
  for (const method of match[3]!.split(', ')) routes.push({ method, path })
}
const missingRoutes = routes.filter(
  (route) =>
    !app.hasRoute({ method: route.method as never, url: route.path })
)
if (missingRoutes.length) {
  throw new Error(`route parser mismatch: ${JSON.stringify(missingRoutes)}`)
}

const publicSessionExempt = (path: string): string | null => {
  if (['/health', '/live', '/ready', '/health/metrics'].includes(path)) {
    return 'health_or_observability'
  }
  if (path === '/v1/session/logout') return 'idempotent_logout'
  if (path.startsWith('/v1/webhooks/')) return 'webhook_signature_boundary'
  return null
}
const protectedRoutes = routes.filter((route) => !publicSessionExempt(route.path))
const urlFor = (path: string): string =>
  path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_all, name: string) =>
    name === 'channel'
      ? 'web'
      : name === 'provider'
        ? 'synthetic'
        : '00000000-0000-4000-8000-000000000701'
  )
const mutationMethods = new Set(['POST', 'PUT', 'PATCH'])
const forgedHeaders = {
  'x-operator-id': 'operator.forged.synthetic',
  'x-operator-role': 'Admin',
  'x-tenant-id': 'tenant_00000000-0000-4000-8000-000000000999',
  'x-cvg-operator-token': 'forged.synthetic.invalid.signature',
  authorization: 'Bearer forged.synthetic.invalid'
}
const unknownCookie = 'cvg_operator_session=opsess_unknownsynthetic0001'
const scenarioResults: Record<
  string,
  Array<{ method: string; path: string; status: number; errorCode: string | null }>
> = {}

async function send(route: { method: string; path: string }, headers: Record<string, string>) {
  const response = await app.inject({
    method: route.method,
    url: urlFor(route.path),
    headers,
    ...(mutationMethods.has(route.method) ? { payload: {} } : {})
  })
  let errorCode: string | null = null
  try {
    errorCode = (response.json() as { error?: { code?: string } }).error?.code ?? null
  } catch {
    // Health and HEAD responses may have no JSON body.
  }
  return { method: route.method, path: route.path, status: response.statusCode, errorCode }
}

const scenarios = [
  { name: 'no_cookie', headers: { origin: allowedOrigin } },
  { name: 'forged_legacy_and_invalid_tokens', headers: { origin: allowedOrigin, ...forgedHeaders } },
  { name: 'unknown_session_cookie', headers: { origin: allowedOrigin, cookie: unknownCookie } }
]
for (const scenario of scenarios) {
  scenarioResults[scenario.name] = []
  for (const route of routes) {
    if (scenario.name === 'unknown_session_cookie' && route.path === '/v1/session/logout') {
      continue
    }
    scenarioResults[scenario.name]!.push(await send(route, scenario.headers))
  }
}

const identity = {
  operatorId: 'operator.aud0589.synthetic',
  role: 'Admin' as const,
  tenantId: 'tenant_00000000-0000-4000-8000-000000000701'
}
const cookieSession = await sessionStore.create({
  identity,
  expiresAt: Date.now() + 60_000
})
const cookie = `${sessionModule.OPERATOR_SESSION_COOKIE}=${encodeURIComponent(cookieSession.sessionId)}`
const positiveControls = []
for (const path of ['/v1/session', '/v1/tasks', '/v1/admin/agents']) {
  const response = await send({ method: 'GET', path }, { origin: allowedOrigin, cookie })
  positiveControls.push(response)
}

const bootstrapToken = identityModule.createTrustedOperatorIdentityToken(
  identity,
  signingKey
)
const bootstrapResponse = await send(
  { method: 'GET', path: '/v1/session' },
  { origin: allowedOrigin, 'x-cvg-operator-token': bootstrapToken }
)
const bootstrapReplay = await send(
  { method: 'GET', path: '/v1/session' },
  { origin: allowedOrigin, 'x-cvg-operator-token': bootstrapToken }
)
const directTokenControls = []
for (const path of ['/v1/tasks', '/v1/admin/agents']) {
  const token = identityModule.createTrustedOperatorIdentityToken(identity, signingKey)
  directTokenControls.push(
    await send({ method: 'GET', path }, { origin: allowedOrigin, 'x-cvg-operator-token': token })
  )
}
const noSessionLogout = scenarioResults.no_cookie?.find(
  (result) => result.method === 'POST' && result.path === '/v1/session/logout'
)

const finalHead = currentHead()
const finalSources = sourceManifest()
if (finalHead !== initialHead || JSON.stringify(finalSources) !== JSON.stringify(initialSources)) {
  await app.close()
  throw new Error('candidate source changed during route probe; evidence is invalid')
}

const protectedByScenario = Object.fromEntries(
  Object.entries(scenarioResults).map(([name, results]) => [
    name,
    results.filter((result) => !publicSessionExempt(result.path))
  ])
)
const output = {
  audit: 'AUD-0589',
  candidateHead: initialHead,
  sourceManifest: initialSources,
  sourceManifestSha256: sha256(JSON.stringify(initialSources)),
  nodeVersion: process.version,
  profile: 'NODE_ENV=development; trusted resolver; synthetic identity; in-memory session store; no DB or external provider',
  routeTemplateCount: new Set(routes.map((route) => route.path)).size,
  routeMethodPairCount: routes.length,
  routeRegistryChecked: missingRoutes.length === 0,
  sessionProtectedPairCount: protectedRoutes.length,
  protectedPairExpectedUnauthorizedCounts: Object.fromEntries(
    Object.entries(protectedByScenario).map(([name, results]) => [
      name,
      results.filter((result) => result.status === 401).length
    ])
  ),
  scenarios: scenarioResults,
  positiveControls,
  validBootstrapTokenExchange: bootstrapResponse,
  bootstrapTokenReplay: bootstrapReplay,
  validSignedTokenWithoutCookie: directTokenControls,
  unknownSessionCookieId: 'synthetic-only; value omitted',
  logoutWithoutCookie: noSessionLogout ?? null,
  revokeCalls,
  sourceStableDuringProbe: finalHead === initialHead && JSON.stringify(finalSources) === JSON.stringify(initialSources),
  note: 'Probe output is observation evidence. It does not claim protected route business success, production composition, PostgreSQL behavior, webhook signature validity, or real IdP behavior.'
}
writeFileSync(resolve(outputDir, 'probe-results.json'), `${JSON.stringify(output, null, 2)}\n`)
await app.close()
process.stdout.write(
  `${JSON.stringify({
    candidateHead: initialHead,
    routeTemplates: output.routeTemplateCount,
    routeMethodPairs: routes.length,
    protectedPairs: protectedRoutes.length,
    noCookie401: output.protectedPairExpectedUnauthorizedCounts.no_cookie,
    forged401: output.protectedPairExpectedUnauthorizedCounts.forged_legacy_and_invalid_tokens,
    unknownCookie401: output.protectedPairExpectedUnauthorizedCounts.unknown_session_cookie,
    positiveControls,
    validBootstrapTokenExchange: bootstrapResponse,
    bootstrapTokenReplay: bootstrapReplay,
    validSignedTokenWithoutCookie: directTokenControls,
    logoutWithoutCookie: noSessionLogout,
    revokeCalls
  })}\n`
)
