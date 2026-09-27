#!/usr/bin/env node
import assert from 'node:assert/strict'
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const base = 'http://127.0.0.1:8087'
const issuer = `${base}/realms/cvg-local`
const callback = 'http://127.0.0.1:3000/v1/auth/oidc/callback'
const clientId = 'cvg-local-operator'
const groupPath = '/tenant_00000000-0000-4000-8000-000000000701/Supervisor'
const adminPassword = process.env.CVG_LOCAL_IDP_ADMIN_PASSWORD

if (!adminPassword) {
  throw new Error(
    'CVG_LOCAL_IDP_ADMIN_PASSWORD is required for local verification'
  )
}

const realm = JSON.parse(
  await readFile(
    fileURLToPath(new URL('./realm-cvg-local.json', import.meta.url)),
    'utf8'
  )
)
assert.equal(realm.realm, 'cvg-local')
assert.equal(realm.browserFlow, 'cvg-browser-mfa')
assert.equal(
  realm.clients[0]?.attributes?.['pkce.code.challenge.method'],
  'S256'
)
assert.equal(realm.clients[0]?.directAccessGrantsEnabled, false)
assert.deepEqual(realm.clients[0]?.redirectUris, [callback])

async function json(url, init = {}) {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => null)
  return { response, body }
}

function authorizationUrl(state, challenge) {
  const url = new URL(`${issuer}/protocol/openid-connect/auth`)
  for (const [key, value] of Object.entries({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: callback,
    scope: 'openid',
    state,
    nonce: `nonce-${state}`,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  })) {
    url.searchParams.set(key, value)
  }
  return url
}

function totp(secret) {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const digest = createHmac('sha1', Buffer.from(secret))
    .update(counter)
    .digest()
  const offset = digest[digest.length - 1] & 15
  return String(
    (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  ).padStart(6, '0')
}

function idTokenClaims(token) {
  const payload = token?.split('.')[1]
  assert.ok(payload, 'ID token missing')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
}

async function exchangeCode(code, verifier) {
  const { response, body } = await json(
    `${issuer}/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: clientId,
        redirect_uri: callback,
        code,
        code_verifier: verifier
      })
    }
  )
  assert.equal(
    response.status,
    200,
    `OIDC code exchange failed: ${body?.error}`
  )
  return idTokenClaims(body.id_token)
}

async function adminJson(token, path, init = {}) {
  return json(`${base}/admin/realms/cvg-local${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body ? { 'content-type': 'application/json' } : {})
    }
  })
}

async function main() {
  const discovery = await json(`${issuer}/.well-known/openid-configuration`)
  assert.equal(discovery.response.status, 200)
  assert.equal(discovery.body?.issuer, issuer)

  const verifier = randomBytes(32).toString('base64url')
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  const missingPkce = authorizationUrl('missing-pkce', challenge)
  missingPkce.searchParams.delete('code_challenge')
  missingPkce.searchParams.delete('code_challenge_method')
  const noPkce = await fetch(missingPkce, { redirect: 'manual' })
  assert.equal(noPkce.status, 302)
  assert.equal(
    new URL(noPkce.headers.get('location')).searchParams.get('error'),
    'invalid_request'
  )

  const badRedirect = authorizationUrl('bad-redirect', challenge)
  badRedirect.searchParams.set('redirect_uri', 'http://evil.invalid/callback')
  const invalidRedirect = await fetch(badRedirect, { redirect: 'manual' })
  assert.equal(invalidRedirect.status, 400)

  const admin = await json(
    `${base}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: 'local-admin',
        password: adminPassword
      })
    }
  )
  assert.equal(admin.response.status, 200, 'local admin login failed')
  const adminToken = admin.body.access_token
  const flows = await adminJson(
    adminToken,
    '/authentication/flows/cvg-browser-forms-mfa/executions'
  )
  assert.equal(flows.response.status, 200)
  assert.deepEqual(
    flows.body.map((item) => [item.providerId, item.requirement]),
    [
      ['auth-username-password-form', 'REQUIRED'],
      ['auth-otp-form', 'REQUIRED']
    ]
  )

  const username = `operator.synthetic.${randomUUID()}`
  const password = randomBytes(24).toString('base64url')
  const created = await adminJson(adminToken, '/users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      enabled: true,
      credentials: [{ type: 'password', value: password, temporary: false }]
    })
  })
  assert.equal(created.response.status, 201, 'synthetic user creation failed')
  const userId = created.response.headers.get('location')?.split('/').at(-1)
  assert.ok(userId, 'synthetic user id missing')

  let browser
  try {
    const groups = await adminJson(adminToken, '/groups')
    const parent = groups.body.find(
      (group) => group.name === groupPath.split('/')[1]
    )
    assert.ok(parent, 'synthetic tenant group missing')
    const children = await adminJson(
      adminToken,
      `/groups/${parent.id}/children`
    )
    const supervisor = children.body.find((group) => group.path === groupPath)
    assert.ok(supervisor, 'synthetic Supervisor group missing')
    const membership = await adminJson(
      adminToken,
      `/users/${userId}/groups/${supervisor.id}`,
      {
        method: 'PUT'
      }
    )
    assert.equal(membership.response.status, 204)

    browser = await chromium.launch({ headless: true })
    const enrollmentContext = await browser.newContext()
    const enrollment = await enrollmentContext.newPage()
    await enrollment.goto(authorizationUrl('enrollment', challenge).toString())
    await enrollment.locator('#username').fill(username)
    await enrollment.locator('#password').fill(password)
    await enrollment.locator('#kc-login').click()
    await enrollment.locator('#kc-totp-settings-form').waitFor()
    const otpSecret = await enrollment.locator('#totpSecret').inputValue()
    const enrollmentCode = totp(otpSecret)
    await enrollment.locator('#totp').fill(enrollmentCode)
    await enrollment.locator('#userLabel').fill('synthetic-device')
    await enrollment.locator('#saveTOTPBtn').click()
    await enrollmentContext.close()

    const secondContext = await browser.newContext()
    const second = await secondContext.newPage()
    await second.goto(authorizationUrl('verified-mfa', challenge).toString())
    await second.locator('#username').fill(username)
    await second.locator('#password').fill(password)
    await second.locator('#kc-login').click()
    await second.locator('#kc-otp-login-form').waitFor()
    const validCode = totp(otpSecret)
    await second
      .locator('input[name="otp"]')
      .fill(validCode === '000000' ? '999999' : '000000')
    await second.locator('#kc-login').click()
    await second.locator('#kc-otp-login-form').waitFor()
    assert.match(
      await second.locator('body').innerText(),
      /Invalid authenticator code/
    )

    while (totp(otpSecret) === enrollmentCode) {
      await new Promise((resolve) => setTimeout(resolve, 1_000))
    }
    await second.locator('input[name="otp"]').fill(totp(otpSecret))
    const callbackRequest = second.waitForRequest(
      (request) => request.url().startsWith(callback),
      { timeout: 10_000 }
    )
    await second.locator('#kc-login').click()
    const redirect = new URL((await callbackRequest).url())
    assert.equal(redirect.searchParams.get('state'), 'verified-mfa')
    const code = redirect.searchParams.get('code')
    assert.ok(code, 'OIDC authorization code missing after valid OTP')
    const claims = await exchangeCode(code, verifier)
    assert.equal(claims.iss, issuer)
    assert.equal(claims.aud, clientId)
    assert.ok(claims.amr?.includes('pwd'), 'ID token lacks password AMR')
    assert.ok(claims.amr?.includes('otp'), 'ID token lacks verified OTP AMR')
    assert.ok(
      Number.isSafeInteger(claims.auth_time) &&
        claims.auth_time <= Math.floor(Date.now() / 1000) &&
        claims.auth_time >= Math.floor(Date.now() / 1000) - 300,
      'ID token lacks fresh authentication time'
    )
    assert.ok(
      claims.groups?.includes(groupPath),
      'ID token lacks synthetic tenant group'
    )
    await secondContext.close()
    process.stdout.write(
      JSON.stringify({
        result: 'LOCAL_OIDC_MFA_PASS',
        discovery: true,
        pkceMissingRejected: true,
        badRedirectRejected: true,
        otpEnrollmentRequired: true,
        wrongOtpRejected: true,
        verifiedPasswordAmr: true,
        verifiedOtpAmr: true,
        freshAuthTime: true,
        syntheticGroup: groupPath
      }) + '\n'
    )
  } finally {
    await browser?.close()
    const deleted = await adminJson(adminToken, `/users/${userId}`, {
      method: 'DELETE'
    })
    assert.equal(deleted.response.status, 204, 'synthetic user cleanup failed')
  }
}

await main()
