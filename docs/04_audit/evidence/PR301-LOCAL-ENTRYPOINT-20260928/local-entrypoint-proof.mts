import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { chromium } from '@playwright/test'
import { Client } from 'pg'
import { runPostgresMigrations, TENANT_SCHEMA_TABLES } from '@cvg/persistence'
import {
  grantOperatorSessionFunctions,
  runOperatorSessionMigrations
} from '../packages/persistence/src/operator-session-migrations.ts'
import { buildServerFromEnv } from '../apps/api/src/server.ts'

const adminPassword = process.env.CVG_LOCAL_IDP_ADMIN_PASSWORD
const dbUrl = process.env.TEST_DATABASE_URL
assert.ok(adminPassword && dbUrl, 'synthetic IdP/PG environment missing')
const idp = 'http://127.0.0.1:8087'
const issuer = `${idp}/realms/cvg-local`
const api = 'http://127.0.0.1:3000'
const consoleOrigin = 'http://127.0.0.1:4173'
const callback = `${api}/v1/auth/oidc/callback`
const clientId = 'cvg-local-operator'
const tenantId = 'tenant_00000000-0000-4000-8000-000000000701'
const groupPath = `/${tenantId}/Supervisor`
const suffix = Date.now().toString(36)
const productSchema = `cvg_product_${suffix}`
const authSchema = `cvg_auth_${suffix}`
const pm = `cvg_pm_${suffix}`
const pr = `cvg_pr_${suffix}`
const am = `cvg_am_${suffix}`
const ar = `cvg_ar_${suffix}`
const rateLimitKeyRing = JSON.stringify({
  budgetSecret: 'synthetic-local-entrypoint-budget-secret-20260928-000001',
  current: {
    keyId: 'local-entrypoint-v1',
    secret: 'synthetic-local-entrypoint-signing-secret-20260928-000001'
  },
  previous: []
})

async function json(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init)
  return { response, body: await response.json().catch(() => null) }
}
async function adminJson(token: string, route: string, init: RequestInit = {}) {
  return json(`${idp}/admin/realms/cvg-local${route}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {})
    }
  })
}
function totp(secret: string) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', Buffer.from(secret)).update(counter).digest()
  const offset = digest[digest.length - 1]! & 15
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}
function enrollmentUrl() {
  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const url = new URL(`${issuer}/protocol/openid-connect/auth`)
  for (const [key, value] of Object.entries({
    response_type: 'code', client_id: clientId, redirect_uri: callback,
    scope: 'openid', state: 'synthetic-enrollment', nonce: `nonce-${randomUUID()}`,
    code_challenge: challenge, code_challenge_method: 'S256'
  })) url.searchParams.set(key, value)
  return url.toString()
}
const connection = (role: string, password: string) => {
  const url = new URL(dbUrl)
  url.username = role
  url.password = password
  return url.toString()
}

let app: Awaited<ReturnType<typeof buildServerFromEnv>> | undefined
let productMigrator: Client | undefined
let authMigrator: Client | undefined
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
let userId: string | undefined
let adminToken: string | undefined
let observed: Record<string, unknown> | undefined
const successServer = createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain' }).end('synthetic login success')
})
const admin = new Client({ connectionString: dbUrl })
let connected = false
try {
  const discovery = await json(`${issuer}/.well-known/openid-configuration`)
  assert.equal(discovery.response.status, 200)
  assert.equal(discovery.body.issuer, issuer)
  const adminLogin = await json(`${idp}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: 'local-admin', password: adminPassword })
  })
  assert.equal(adminLogin.response.status, 200, 'synthetic admin login failed')
  adminToken = adminLogin.body.access_token
  const username = `operator.synthetic.${randomUUID()}`
  const password = randomBytes(24).toString('base64url')
  const created = await adminJson(adminToken, '/users', {
    method: 'POST',
    body: JSON.stringify({ username, enabled: true, credentials: [{ type: 'password', value: password, temporary: false }] })
  })
  assert.equal(created.response.status, 201)
  userId = created.response.headers.get('location')?.split('/').at(-1)
  assert.ok(userId)
  const groups = await adminJson(adminToken, '/groups')
  const parent = groups.body.find((group: { name: string }) => group.name === tenantId)
  assert.ok(parent)
  const children = await adminJson(adminToken, `/groups/${parent.id}/children`)
  const supervisor = children.body.find((group: { path: string }) => group.path === groupPath)
  assert.ok(supervisor)
  assert.equal((await adminJson(adminToken, `/users/${userId}/groups/${supervisor.id}`, { method: 'PUT' })).response.status, 204)

  await admin.connect()
  connected = true
  const databaseName = (await admin.query<{name: string}>('SELECT current_database() AS name')).rows[0]!.name
  for (const [role, pass] of [[pm,'synthetic_pm'],[pr,'synthetic_pr'],[am,'synthetic_am'],[ar,'synthetic_ar']]) {
    await admin.query(`CREATE ROLE ${role} LOGIN PASSWORD '${pass}' NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`)
  }
  await admin.query(`GRANT CREATE ON DATABASE "${databaseName}" TO ${pm}, ${am}`)
  await admin.query(`CREATE SCHEMA ${productSchema} AUTHORIZATION ${pm}`)
  productMigrator = new Client({ connectionString: connection(pm, 'synthetic_pm') })
  await productMigrator.connect()
  await runPostgresMigrations(productMigrator, { schemaName: productSchema, createSchema: false })
  authMigrator = new Client({ connectionString: connection(am, 'synthetic_am') })
  await authMigrator.connect()
  await runOperatorSessionMigrations(authMigrator, authSchema, productSchema)
  await grantOperatorSessionFunctions(authMigrator, authSchema, ar)
  await admin.query(`GRANT USAGE ON SCHEMA ${productSchema} TO ${pr}`)
  for (const table of [...TENANT_SCHEMA_TABLES, 'webhook_replay_events']) {
    await admin.query(`GRANT SELECT, INSERT, UPDATE ON ${productSchema}.${table} TO ${pr}`)
  }
  await admin.query(`GRANT DELETE ON ${productSchema}.webhook_replay_events TO ${pr}`)
  await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${productSchema}.rate_limit_buckets TO ${pr}`)
  await admin.query(`ALTER ROLE ${pr} SET search_path TO ${productSchema}`)
  app = await buildServerFromEnv({
    NODE_ENV: 'development', CVG_IDENTITY_MODE: 'trusted',
    API_PERSISTENCE_MODE: 'postgres', POSTGRES_RLS_ENFORCEMENT: 'true',
    POSTGRES_AUTO_MIGRATE: 'false', DATABASE_URL: connection(pr, 'synthetic_pr'),
    POSTGRES_SCHEMA: productSchema, OPERATOR_SESSION_DATABASE_URL: connection(ar, 'synthetic_ar'),
    POSTGRES_AUTH_SCHEMA: authSchema, POSTGRES_AUTH_ROLE: ar,
    CVG_LOCAL_OIDC_ISSUER: issuer, CVG_LOCAL_OIDC_CLIENT_ID: clientId,
    CVG_LOCAL_OIDC_REDIRECT_URI: callback,
    CVG_LOCAL_OIDC_SUCCESS_REDIRECT_URL: `${consoleOrigin}/`,
    CVG_OIDC_PENDING_COOKIE_KEY: randomBytes(32).toString('base64url'),
    CVG_RATE_LIMIT_KEYRING: rateLimitKeyRing, API_ALLOWED_ORIGINS: consoleOrigin,
    INBOUND_TENANT_ID: tenantId,
    INBOUND_AGENT_ID: 'agent_00000000-0000-4000-8000-000000000701'
  }, { webhookVerifier: () => true })
  await app.listen({ port: 3000, host: '127.0.0.1' })
  await new Promise<void>(resolve => successServer.listen(4173, '127.0.0.1', resolve))
  browser = await chromium.launch({ headless: true })

  const initialContext = await browser.newContext()
  const enrollment = await initialContext.newPage()
  await enrollment.goto(enrollmentUrl())
  await enrollment.locator('#username').fill(username)
  await enrollment.locator('#password').fill(password)
  await enrollment.locator('#kc-login').click()
  await enrollment.locator('#kc-totp-settings-form').waitFor()
  const otpSecret = await enrollment.locator('#totpSecret').inputValue()
  const enrollmentCode = totp(otpSecret)
  await enrollment.locator('#totp').fill(enrollmentCode)
  await enrollment.locator('#userLabel').fill('synthetic-device')
  await enrollment.locator('#saveTOTPBtn').click()
  await initialContext.close()

  const context = await browser.newContext()
  const unauth = await context.request.get(`${api}/v1/session`)
  assert.equal(unauth.status(), 401)
  const started = await context.request.post(`${api}/v1/auth/oidc/start`, { headers: { origin: consoleOrigin } })
  assert.equal(started.status(), 200)
  const startBody = await started.json()
  const authorizationUrl = startBody.data.authorizationUrl as string
  assert.ok(authorizationUrl.startsWith(`${issuer}/protocol/openid-connect/auth`))
  const state = new URL(authorizationUrl).searchParams.get('state')
  assert.ok(state)
  const pendingCookies = await context.cookies(api)
  assert.ok(pendingCookies.some(cookie => cookie.name === 'cvg_oidc_pending'))
  const page = await context.newPage()
  let callbackUrl = ''
  page.on('request', request => {
    if (request.url().startsWith(callback)) callbackUrl = request.url()
  })
  await page.goto(authorizationUrl)
  await page.locator('#username').fill(username)
  await page.locator('#password').fill(password)
  await page.locator('#kc-login').click()
  await page.locator('#kc-otp-login-form').waitFor()
  const wrongCode = totp(otpSecret) === '000000' ? '999999' : '000000'
  await page.locator('input[name="otp"]').fill(wrongCode)
  await page.locator('#kc-login').click()
  await page.locator('#kc-otp-login-form').waitFor()
  assert.match(await page.locator('body').innerText(), /Invalid authenticator code/)
  assert.equal((await context.request.get(`${api}/v1/session`)).status(), 401)
  const preMfaSessions = await authMigrator.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${authSchema}.operator_sessions`
  )
  assert.equal(preMfaSessions.rows[0]?.count, '0')
  while (totp(otpSecret) === enrollmentCode) await new Promise(resolve => setTimeout(resolve, 1000))
  await page.locator('input[name="otp"]').fill(totp(otpSecret))
  const callbackResponse = page.waitForResponse(response => response.url().startsWith(callback), { timeout: 20000 })
  await page.locator('#kc-login').click()
  const returned = await callbackResponse
  assert.equal(returned.status(), 303)
  await page.waitForURL(`${consoleOrigin}/`, { timeout: 20000 })
  const current = await context.request.get(`${api}/v1/session`)
  assert.equal(current.status(), 200)
  const identity = (await current.json()).data.identity
  assert.equal(identity.tenantId, tenantId)
  assert.equal(identity.role, 'Supervisor')
  const operationalCookie = (await context.cookies(api))
    .find(cookie => cookie.name === 'cvg_operator_session')
  assert.ok(operationalCookie)
  const sessionDigest = createHash('sha256')
    .update(operationalCookie.value, 'utf8').digest()
  const persisted = await authMigrator.query<{ revoked: boolean }>(
    `SELECT f.revoked_at IS NOT NULL AS revoked FROM ${authSchema}.operator_sessions s JOIN ${authSchema}.operator_session_families f ON f.family_id=s.family_id WHERE s.token_digest=$1`,
    [sessionDigest]
  )
  assert.equal(persisted.rows.length, 1)
  assert.equal(persisted.rows[0]?.revoked, false)
  assert.ok(callbackUrl.includes(`state=${state}`))
  const remainingStates = await authMigrator.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${authSchema}.oidc_login_states`
  )
  assert.equal(remainingStates.rows[0]?.count, '0')
  await context.addCookies(pendingCookies
    .filter(cookie => cookie.name === 'cvg_oidc_pending')
    .map(cookie => ({ name: cookie.name, value: cookie.value, url: api })))
  const replay = await context.request.get(callbackUrl)
  assert.equal(replay.status(), 401)
  const logout = await context.request.post(`${api}/v1/session/logout`, { headers: { origin: consoleOrigin } })
  assert.equal(logout.status(), 200)
  await context.addCookies([{ name: operationalCookie.name,
    value: operationalCookie.value, url: api }])
  assert.equal((await context.request.get(`${api}/v1/session`)).status(), 401)
  const revoked = await authMigrator.query<{ revoked: boolean }>(
    `SELECT f.revoked_at IS NOT NULL AS revoked FROM ${authSchema}.operator_sessions s JOIN ${authSchema}.operator_session_families f ON f.family_id=s.family_id WHERE s.token_digest=$1`,
    [sessionDigest]
  )
  assert.equal(revoked.rows[0]?.revoked, true)
  await context.close()
  observed = { verdict: 'PASS', scope: 'local-Keycloak-OTP-browser-API-PostgreSQL',
    noCookie: 401, wrongOtpRejected: true, preMfaSession: 401,
    preMfaRows: 0, callback: 303, session: 200, persistedSessionRows: 1,
    role: identity.role, consumedStatesRemaining: 0,
    replayWithRestoredPendingCookie: 401, logout: 200,
    oldCookieAfterLogout: 401, familyRevokedInPostgres: true }
} finally {
  const cleanupErrors: string[] = []
  const cleanup = async (name: string, action: () => Promise<unknown>) => {
    try { await action() } catch { cleanupErrors.push(name) }
  }
  if (browser) await cleanup('browser', () => browser!.close())
  if (app) await cleanup('api', () => app!.close())
  if (successServer.listening) await cleanup('console', () => new Promise<void>(
    (resolve, reject) => successServer.close(error => error ? reject(error) : resolve())
  ))
  if (productMigrator) await cleanup('product_migrator', () => productMigrator!.end())
  if (authMigrator) await cleanup('auth_migrator', () => authMigrator!.end())
  if (connected) {
    await cleanup('auth_schema', () => admin.query(`DROP SCHEMA IF EXISTS ${authSchema} CASCADE`))
    await cleanup('product_schema', () => admin.query(`DROP SCHEMA IF EXISTS ${productSchema} CASCADE`))
    for (const role of [ar, am, pr, pm]) {
      await cleanup(`role_owned_${role}`, () => admin.query(`DROP OWNED BY ${role}`))
      await cleanup(`role_${role}`, () => admin.query(`DROP ROLE IF EXISTS ${role}`))
    }
    const inventory = await admin.query<{ roles: string; schemas: string }>(
      `SELECT (SELECT count(*)::text FROM pg_roles WHERE rolname LIKE 'cvg_%') AS roles, (SELECT count(*)::text FROM information_schema.schemata WHERE schema_name LIKE 'cvg_%') AS schemas`
    )
    assert.equal(inventory.rows[0]?.roles, '0')
    assert.equal(inventory.rows[0]?.schemas, '0')
    await cleanup('admin_connection', () => admin.end())
  }
  if (userId && adminToken) {
    const deleted = await adminJson(adminToken, `/users/${userId}`, { method: 'DELETE' })
    assert.equal(deleted.response.status, 204)
    const listed = await adminJson(adminToken, '/users?search=operator.synthetic.')
    assert.equal(listed.response.status, 200)
    assert.equal(listed.body.filter((user: { username?: string }) =>
      user.username?.startsWith('operator.synthetic.')).length, 0)
  }
  assert.deepEqual(cleanupErrors, [])
}
assert.ok(observed)
process.stdout.write(JSON.stringify({ ...observed, cleanup: 'ZERO_SYNTHETIC_OBJECTS' }) + '\n')
