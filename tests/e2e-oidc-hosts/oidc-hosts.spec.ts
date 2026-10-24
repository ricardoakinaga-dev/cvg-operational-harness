/**
 * SPEC0259 Q8 and Q9 (U08, slice B1) — the OIDC console in Chromium on three
 * synthetic HTTPS hosts: console (real NGINX), API (entrypoint) and IdP
 * (`https://localhost`, another site), plus a mirror of the console, a second
 * allowed origin, a sibling origin and another site. TLS trust only by the
 * SPKI pins of the two ephemeral leaves (PB10). Each item runs in a fresh
 * browser context. Raw requests go through the edge with the ephemeral CA.
 * Synthetic users only; no real IdP, account, data or production.
 */
import AxeBuilder from '@axe-core/playwright'
import {
  chromium,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page
} from '@playwright/test'
import {
  hexName,
  loadProofState,
  ProofControl,
  rawEdge,
  rawIdpLogin,
  setCookieValue,
  totpFor,
  type EdgeLogEntry,
  type ProofState,
  type ProofUser
} from '../support/oidc-hosts/proof-client.ts'

const HOST_SESSION = '__Host-' + 'cvg_operator_session'
const HOST_PENDING = '__Host-' + 'cvg_oidc_pending'
const LEGACY_SESSION = 'cvg_operator_session'
const LEGACY_PENDING = 'cvg_oidc_pending'
const TENANT_A = 'tenant_0254aaaa-0000-4000-8000-00000000000a'
const TENANT_B = 'tenant_0254bbbb-0000-4000-8000-00000000000b'
const TEXT = {
  signIn: 'Entre com sua conta para continuar.',
  expired: 'A sessão expirou. Entre novamente.',
  unavailable: 'Sessão indisponível no momento. Tente novamente.',
  invalidConfiguration: 'Configuração do console inválida.',
  denied: 'Não foi possível entrar com esta conta.',
  loginUnavailable: 'Login indisponível no momento. Tente novamente.',
  noPermission: 'Sem permissão para esta área.',
  panelError: 'Erro ao carregar dados operacionais.',
  itemUnavailable: 'Este item não está mais disponível para você.'
}

test.describe.configure({ mode: 'serial' })

let state: ProofState
let control: ProofControl
let browser: Browser
const histories: string[] = []
const s0: Record<string, unknown> = {}

function consoleUrl(): string {
  return `${state.origins.console}/`
}

function csp(): string {
  return `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src ${state.origins.api}; form-action 'self'`
}

test.beforeAll(async () => {
  state = loadProofState()
  control = new ProofControl(state)
  const hosts = Object.values(state.origins)
    .map((origin) => new URL(origin).hostname)
    .filter((host) => host.endsWith('.test'))
  browser = await chromium.launch({
    args: [
      '--no-proxy-server',
      `--host-resolver-rules=${hosts.map((host) => `MAP ${host} 127.0.0.1`).join(', ')}`,
      `--ignore-certificate-errors-spki-list=${state.spki.join(',')}`
    ]
  })
})

test.afterAll(async () => {
  await browser?.close()
})

test.afterEach(async () => {
  // Slots a flow reserved and did not use (a refused or incomplete login).
  await control.cancelReservations()
  // DB10: no paced start or callback above 5 s between release and answer.
  const pacer = await control.pacer()
  expect(pacer.violations).toEqual([])
})

/**
 * DB10: the pacer waits here, before a flow starts, so the edge releases its
 * requests at once (the console's own 30 s request timeout never meets a
 * held request). The reservation succeeds only when it fits the 70 s window.
 */
async function pace(slots: { start?: number; callback?: number }) {
  await control.reserve(slots)
}

async function newContext(): Promise<BrowserContext> {
  // No ignoreHTTPSErrors: TLS trust comes only from the SPKI pins.
  return browser.newContext()
}

async function recordHistory(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page)
  const { entries } = (await cdp.send('Page.getNavigationHistory')) as {
    entries: { url: string }[]
  }
  for (const entry of entries) histories.push(entry.url)
  return entries.map((entry) => entry.url)
}

function expectHistoryClean(urls: string[]) {
  for (const url of urls) {
    expect(url, 'no code in any history entry').not.toContain('code=')
    const parsed = new URL(url)
    if (parsed.origin === state.origins.console) {
      expect(url).toBe(consoleUrl())
    }
    if (parsed.origin !== state.origins.idp) {
      for (const parameter of ['state=', 'nonce=', 'code_challenge=']) {
        expect(url).not.toContain(parameter)
      }
    }
  }
}

async function axe(page: Page, label: string) {
  const result = await new AxeBuilder({ page }).analyze()
  const violations = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact
  }))
  test.info().annotations.push({
    type: 'axe',
    description: JSON.stringify({ state: label, violations })
  })
  expect(
    violations.filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical'
    ),
    label
  ).toEqual([])
}

async function focusByTab(page: Page, isTarget: () => Promise<boolean>) {
  for (let index = 0; index < 40; index += 1) {
    if (await isTarget()) return
    await page.keyboard.press('Tab')
  }
  throw new Error('target never received the keyboard focus')
}

const activeText = (page: Page) =>
  page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
const activeId = (page: Page) =>
  page.evaluate(() => document.activeElement?.id ?? '')

async function submitIdpByKeyboard(page: Page, user: ProofUser, totp?: string) {
  await page.waitForURL(
    (url) => url.origin === state.origins.idp && url.pathname === '/authorize'
  )
  await expect(page.getByLabel('Usuário')).toBeVisible()
  const code = totp ?? totpFor(user)
  await control.secrets([code])
  await focusByTab(page, async () => (await activeId(page)) === 'username')
  await page.keyboard.type(user.username)
  await page.keyboard.press('Tab')
  expect(await activeId(page)).toBe('password')
  await page.keyboard.type(user.password)
  await page.keyboard.press('Tab')
  expect(await activeId(page)).toBe('totp')
  await page.keyboard.type(code)
  await page.keyboard.press('Enter')
}

async function submitIdp(page: Page, user: ProofUser, totp?: string) {
  await page.waitForURL(
    (url) => url.origin === state.origins.idp && url.pathname === '/authorize'
  )
  const code = totp ?? totpFor(user)
  await control.secrets([code])
  await page.getByLabel('Usuário').fill(user.username)
  await page.getByLabel('Senha').fill(user.password)
  await page.getByLabel('Código de verificação').fill(code)
  await page.getByRole('button', { name: 'Entrar' }).click()
}

async function landedOnConsole(page: Page) {
  await page.waitForURL((url) => url.origin === state.origins.console)
  await expect.poll(() => page.url()).toBe(consoleUrl())
}

/** Login started by "Entrar" (mouse), used to set up the other items. */
async function login(page: Page, user: ProofUser) {
  await page.goto(consoleUrl())
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  await pace({ start: 1, callback: 1 })
  await page.getByRole('button', { name: 'Entrar' }).click()
  await submitIdp(page, user)
  await landedOnConsole(page)
  await expect(page.getByText(user.operatorId)).toBeVisible()
}

/**
 * A new login from an authenticated console page: the same calls as
 * "Entrar" (start from the console origin, then a top-level navigation).
 */
async function startFromConsole(page: Page) {
  const authorizationUrl = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/v1/auth/oidc/start`, {
      method: 'POST',
      credentials: 'include'
    })
    const body = (await response.json()) as {
      data: { authorizationUrl: string }
    }
    return body.data.authorizationUrl
  }, state.origins.api)
  await page.evaluate((url) => window.location.assign(url), authorizationUrl)
}

async function cookieValue(context: BrowserContext, name: string) {
  const cookies = await context.cookies()
  return cookies.find(
    (cookie) => cookie.name === name && cookie.domain === 'api.cvg.test'
  )?.value
}

async function rawSession(value: string): Promise<number> {
  const response = await rawEdge(state, {
    host: 'api.cvg.test',
    method: 'GET',
    path: '/v1/session',
    headers: {
      origin: state.origins.console,
      cookie: `${HOST_SESSION}=${value}`
    }
  })
  return response.status
}

interface Captured {
  pending: string
  callbackPath: string
  capturedAt: number
}

/**
 * Q9i2 capture, by raw HTTP (the SPEC's equivalent alternative): start with
 * the console Origin and POST to the IdP without following the redirect.
 * The callback is never opened here.
 */
async function capture(user: ProofUser): Promise<Captured> {
  const started = await rawEdge(state, {
    host: 'api.cvg.test',
    method: 'POST',
    path: '/v1/auth/oidc/start',
    headers: { origin: state.origins.console }
  })
  expect(started.status).toBe(200)
  const pending = setCookieValue(started, HOST_PENDING)
  expect(pending).toBeTruthy()
  const authorizationUrl = JSON.parse(started.body).data
    .authorizationUrl as string
  const code = totpFor(user)
  await control.secrets([code, pending!])
  const authorized = await rawIdpLogin(state, authorizationUrl, {
    username: user.username,
    password: user.password,
    totp: code
  })
  expect(authorized.status).toBe(302)
  const location = new URL(String(authorized.headers.location))
  expect(location.origin).toBe(state.origins.api)
  return {
    pending: pending!,
    callbackPath: `${location.pathname}${location.search}`,
    capturedAt: Date.now()
  }
}

async function rawCallback(path: string, cookie: string) {
  return rawEdge(state, {
    host: 'api.cvg.test',
    method: 'GET',
    path,
    headers: { cookie }
  })
}

/** Full raw login (used for the Supervisor that manages grants). */
async function rawLogin(user: ProofUser): Promise<string> {
  await pace({ start: 1, callback: 1 })
  const captured = await capture(user)
  const done = await rawCallback(
    captured.callbackPath,
    `${HOST_PENDING}=${captured.pending}`
  )
  expect(done.status).toBe(303)
  const session = setCookieValue(done, HOST_SESSION)
  expect(session).toBeTruthy()
  await control.secrets([session!])
  return session!
}

function rawApi(
  method: string,
  path: string,
  session: string,
  body?: unknown,
  origin: string | null = state.origins.console
) {
  return rawEdge(state, {
    host: 'api.cvg.test',
    method,
    path,
    headers: {
      cookie: `${HOST_SESSION}=${session}`,
      ...(origin !== null ? { origin } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {})
  })
}

const names = (entry: EdgeLogEntry) =>
  entry.cookieNamesHex.map((hex) => Buffer.from(hex, 'hex').toString('latin1'))

// ---------------------------------------------------------------------------

test('Q8 — the real NGINX serves the console with the exact CSP and never the API', async () => {
  const fetchConsole = (path: string) =>
    rawEdge(state, { host: 'console.cvg.test', method: 'GET', path })
  const index = await fetchConsole('/')
  const asset = /src="(\/assets\/[^"]+\.js)"/.exec(index.body)?.[1]
  expect(asset).toBeTruthy()
  const seq = await control.lastSeq()
  for (const path of ['/', '/index.html', asset!, '/qualquer/rota']) {
    const response = await fetchConsole(path)
    expect(response.status, path).toBe(200)
    expect(response.headers['content-security-policy'], path).toBe(csp())
    expect(response.headers['x-content-type-options'], path).toBe('nosniff')
    expect(response.headers['referrer-policy'], path).toBe('no-referrer')
    expect(String(response.headers.server ?? ''), path).not.toMatch(/\d/)
    if (path !== asset) {
      expect(response.headers['cache-control'], path).toBe('no-store')
      expect(response.body).toContain('<div id="root">')
    }
  }
  for (const path of ['/v1', '/v1/session', '/health', '/live', '/ready']) {
    const response = await fetchConsole(path)
    expect(response.status, path).toBe(404)
    expect(response.body, path).not.toContain('<div id="root">')
    expect(response.headers['content-security-policy'], path).toBe(csp())
    expect(response.headers['x-content-type-options'], path).toBe('nosniff')
  }
  const log = await control.edgeLog(seq)
  expect(log.filter((entry) => entry.host === 'api.cvg.test')).toEqual([])
})

test('S0 — the pinned Chromium keeps the cookie semantics of the design', async () => {
  const context = await newContext()
  const page = await context.newPage()
  const plantAndObserve = async (cookies: string[], controlName: string) => {
    const { id } = await control.plant(cookies)
    await page.goto(`${state.origins.sibling}/plant/${id}`)
    const stored = await context.cookies()
    const seq = await control.lastSeq()
    await page.goto(consoleUrl())
    await expect(page.getByText(TEXT.signIn)).toBeVisible()
    const api = (await control.edgeLog(seq)).filter(
      (entry) => entry.host === 'api.cvg.test' && entry.path === '/v1/session'
    )
    expect(api.length).toBeGreaterThan(0)
    const sent = api.flatMap((entry) => entry.cookieNamesHex)
    const controlStored = stored.some(
      (cookie) => cookie.name === controlName && cookie.domain === '.cvg.test'
    )
    expect(controlStored, controlName).toBe(true)
    expect(sent, controlName).toContain(hexName(controlName))
    return { stored, sent }
  }
  const six = await plantAndObserve(
    ['cvg_probe_control6=1; Domain=cvg.test; Secure; Path=/'],
    'cvg_probe_control6'
  )
  s0.check6 = true
  const seven = await plantAndObserve(
    [
      'cvg_probe_control7=1; Domain=cvg.test; Secure; Path=/',
      `${HOST_SESSION}=evil; Domain=cvg.test; Secure; Path=/`,
      `${HOST_PENDING}=evil; Domain=cvg.test; Secure; Path=/`
    ],
    'cvg_probe_control7'
  )
  expect(
    seven.stored.filter((cookie) => cookie.name.startsWith('__Host-'))
  ).toEqual([])
  expect(seven.sent).not.toContain(hexName(HOST_SESSION))
  expect(seven.sent).not.toContain(hexName(HOST_PENDING))
  s0.check7 = true
  const eight = await plantAndObserve(
    [
      `=${HOST_PENDING}=x; Domain=cvg.test; Secure; Path=/`,
      'cvg_probe_control8=1; Domain=cvg.test; Secure; Path=/'
    ],
    'cvg_probe_control8'
  )
  expect(
    eight.stored.filter(
      (cookie) => cookie.name === '' || cookie.value.startsWith('__Host-')
    )
  ).toEqual([])
  expect(eight.sent).not.toContain(hexName(HOST_PENDING))
  s0.check8 = true
  const nine = await plantAndObserve(
    [
      ` ${HOST_PENDING}=x; Domain=cvg.test; Secure; Path=/`,
      'cvg_probe_control9=1; Domain=cvg.test; Secure; Path=/'
    ],
    'cvg_probe_control9'
  )
  // Check 9 is a record: whatever the browser sends, the API treats it as
  // no pending cookie (exact name, §4.3) and the console stays signed out.
  s0.check9 = {
    sentNamesHex: nine.sent.filter(
      (hex) => hex !== hexName('cvg_probe_control9')
    ),
    storedNamesHex: nine.stored.map((cookie) => hexName(cookie.name))
  }
  void six
  test.info().annotations.push({ type: 's0', description: JSON.stringify(s0) })
  await context.close()
})

test('Q9a — first visit asks to sign in and the API answers with credentialed CORS', async () => {
  const context = await newContext()
  const page = await context.newPage()
  const seq = await control.lastSeq()
  await page.goto(consoleUrl())
  await expect(page.getByText(TEXT.signIn)).toBeVisible()
  const button = page.getByRole('button', { name: 'Entrar' })
  await expect(button).toBeFocused()
  const session = (await control.edgeLog(seq)).find(
    (entry) => entry.host === 'api.cvg.test' && entry.path === '/v1/session'
  )
  expect(session?.origin).toBe(state.origins.console)
  expect(session?.status).toBe(401)
  expect(session?.acac).toBe(true)
  expect(session?.acao).toBe(state.origins.console)
  await axe(page, 'first-visit')
  await context.close()
})

test('Q9b/c/d — keyboard login, cookies per host and reload by cookie only', async () => {
  const user = await control.user(['synthetic-a-operator'])
  const context = await newContext()
  const page = await context.newPage()
  const seq = await control.lastSeq()
  await page.goto(consoleUrl())
  const button = page.getByRole('button', { name: 'Entrar' })
  await expect(button).toBeVisible()
  await focusByTab(page, async () => (await activeText(page)) === 'Entrar')
  await pace({ start: 1, callback: 1 })
  await page.keyboard.press('Enter')
  await submitIdpByKeyboard(page, user)
  await landedOnConsole(page)
  await expect(page.getByText(user.operatorId)).toBeVisible()
  expect(page.url()).toBe(consoleUrl())
  await axe(page, 'authenticated')
  const first = await cookieValue(context, HOST_SESSION)
  expect(first).toBeTruthy()
  await control.secrets([first!])

  // c: a second login in the same context.
  const second = await control.lastSeq()
  await pace({ start: 1, callback: 1 })
  await startFromConsole(page)
  await submitIdp(page, user)
  await landedOnConsole(page)
  await expect(page.getByText(user.operatorId)).toBeVisible()
  const secondLog = await control.edgeLog(second)
  const callback = secondLog.find(
    (entry) => entry.path === '/v1/auth/oidc/callback'
  )!
  expect(names(callback)).toContain(HOST_PENDING)
  expect(names(callback)).not.toContain(HOST_SESSION)
  const fromConsole = secondLog.filter(
    (entry) =>
      entry.host === 'api.cvg.test' &&
      entry.origin === state.origins.console &&
      entry.path === '/v1/session'
  )
  expect(fromConsole.length).toBeGreaterThan(0)
  for (const entry of fromConsole) expect(names(entry)).toContain(HOST_SESSION)
  const consoleHost = (await control.edgeLog(seq)).filter(
    (entry) => entry.host === 'console.cvg.test'
  )
  expect(consoleHost.length).toBeGreaterThan(0)
  for (const entry of consoleHost) {
    expect(names(entry).filter((name) => /cvg/i.test(name))).toEqual([])
  }
  const current = await cookieValue(context, HOST_SESSION)
  expect(current).toBeTruthy()
  expect(current).not.toBe(first)
  await control.secrets([current!])
  expect(await rawSession(first!)).toBe(401)

  // d: reload restores only by the cookie; nothing stored by the console.
  await page.reload()
  await expect(page.getByText(user.operatorId)).toBeVisible()
  const storage = await page.evaluate(async () => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    cookie: document.cookie
  }))
  expect(storage).toEqual({ local: 0, session: 0, databases: 0, cookie: '' })
  expectHistoryClean(await recordHistory(context, page))
  await context.close()
})

test('Q9e — tenant, grant and role: item outside the grant and "no permission"', async () => {
  const conversationX = await control.seedConversation(TENANT_A, 'X0259')
  const conversationY = await control.seedConversation(TENANT_A, 'Y0259')
  await control.seedConversation(TENANT_B, 'Z0259')
  const operatorA = await control.user(['synthetic-a-operator'])
  const operatorB = await control.user(['synthetic-b-operator'])
  const supervisor = await control.user(['synthetic-a-supervisor'])
  const contextA = await newContext()
  const pageA = await contextA.newPage()
  await login(pageA, operatorA)
  const sessionA = (await cookieValue(contextA, HOST_SESSION))!
  await control.secrets([sessionA])
  const supervisorSession = await rawLogin(supervisor)
  const cases = await rawApi(
    'GET',
    `/v1/cases?kind=core_conversation&resourceId=${conversationX.conversationId}`,
    supervisorSession
  )
  expect(cases.status).toBe(200)
  const caseX = JSON.parse(cases.body).data.items[0].caseId as string
  const grant = (revision: number, status: 'ACTIVE' | 'REVOKED') =>
    rawApi(
      'PUT',
      `/v1/cases/${caseX}/assignments/${operatorA.operatorId}`,
      supervisorSession,
      { status, expectedRevision: revision }
    )
  expect((await grant(0, 'ACTIVE')).status).toBe(200)

  await pageA.reload()
  await expect(
    pageA.locator('button.rowButton', { hasText: 'Sintético X0259' })
  ).toBeVisible()
  await expect(pageA.getByText('Sintético Y0259')).toHaveCount(0)
  const conversations = JSON.parse(
    (await rawApi('GET', '/v1/conversations?limit=25&offset=0', sessionA)).body
  ).data.items as { id: string; openSessionId: string }[]
  const sessionX = conversations.find(
    (item) => item.id === conversationX.conversationId
  )!.openSessionId
  expect(
    conversations.some((item) => item.id === conversationY.conversationId)
  ).toBe(false)
  const title = 'Tarefa sintética 0259'
  const created = await rawApi('POST', '/v1/tasks', sessionA, {
    sessionId: sessionX,
    title,
    description: 'Somente sintético, sem efeito externo',
    priority: 'medium',
    source: 'spec0259-q9e',
    idempotencyKey: `spec0259-q9e-${Date.now()}`
  })
  expect(created.status).toBe(200)
  expect(JSON.parse(created.body).data.title).toBe(title)
  await pageA.reload()
  const start = pageA.getByRole('button', { name: `Iniciar ${title}` })
  await expect(start).toBeVisible()
  expect((await grant(1, 'REVOKED')).status).toBe(200)
  await start.click()
  await expect(pageA.getByText(TEXT.itemUnavailable)).toBeVisible()

  // Route choice (first red): no panel route answers 403 to a role of the
  // synthetic matrix, so the edge answers 403, then 503, on GET /v1/tasks.
  await control.fault('/v1/tasks', '403')
  await pageA.reload()
  await expect(pageA.getByText(TEXT.noPermission)).toBeVisible()
  await axe(pageA, 'no-permission')
  await control.fault('/v1/tasks', '503')
  await pageA.reload()
  await expect(pageA.getByText(TEXT.panelError).first()).toBeVisible()
  await expect(pageA.getByText(TEXT.noPermission)).toHaveCount(0)
  await control.fault('/v1/tasks', null)
  await contextA.close()

  // Code review O1: a real 403 of the API (a Supervisor lacks task:update)
  // reaches the console page readable, with credentialed CORS, not as a
  // network failure.
  const contextS = await newContext()
  const pageS = await contextS.newPage()
  await login(pageS, supervisor)
  const forbidden = await pageS.evaluate(async (api) => {
    const response = await fetch(`${api}/v1/tasks`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: '{}'
    })
    const body = (await response.json()) as { error?: { code?: string } }
    return { status: response.status, code: body.error?.code }
  }, state.origins.api)
  expect(forbidden).toEqual({ status: 403, code: 'forbidden' })
  await contextS.close()

  const contextB = await newContext()
  const pageB = await contextB.newPage()
  await login(pageB, operatorB)
  await expect(pageB.getByText('Nenhuma conversa carregada.')).toBeVisible()
  await expect(pageB.getByText('Sintético X0259')).toHaveCount(0)
  await expect(pageB.getByText('Sintético Z0259')).toHaveCount(0)
  await contextB.close()
})

test('Q9f — keyboard logout clears the cookie and the old value is refused', async () => {
  const user = await control.user(['synthetic-a-approver'])
  const context = await newContext()
  const page = await context.newPage()
  await login(page, user)
  const value = (await cookieValue(context, HOST_SESSION))!
  await control.secrets([value])
  const seq = await control.lastSeq()
  await focusByTab(
    page,
    async () => (await activeText(page)) === 'Encerrar sessão'
  )
  await page.keyboard.press('Enter')
  await expect(page.getByText('Sessão encerrada.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeFocused()
  const logout = (await control.edgeLog(seq)).find(
    (entry) => entry.path === '/v1/session/logout'
  )
  expect(logout?.status).toBe(200)
  expect(await cookieValue(context, HOST_SESSION)).toBeUndefined()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible()
  expect(await rawSession(value)).toBe(401)
  await context.close()
})

test('Q9g — the console expires by its timer and the API refuses the old cookie', async () => {
  test.setTimeout(240_000)
  const user = await control.user(['synthetic-a-operator'], 30)
  const context = await newContext()
  const page = await context.newPage()
  await login(page, user)
  const value = (await cookieValue(context, HOST_SESSION))!
  await control.secrets([value])
  const status = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/v1/session`, {
      credentials: 'include'
    })
    return response.status
  }, state.origins.api)
  expect(status).toBe(200)
  await expect(page.getByText(TEXT.expired)).toBeVisible({ timeout: 90_000 })
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeFocused()
  await axe(page, 'expired')
  expect(await rawSession(value)).toBe(401)
  await context.close()
})

test('Q9h — CSRF and origin: sibling, second allowed origin and raw requests', async () => {
  const user = await control.user(['synthetic-a-operator'])
  const context = await newContext()
  const page = await context.newPage()
  await login(page, user)
  const value = (await cookieValue(context, HOST_SESSION))!
  await control.secrets([value])
  const before = await control.tasksCount()
  const payload = {
    sessionId: 'sess_spec0259_absent',
    title: 'Tarefa forjada',
    description: 'Somente sintético',
    priority: 'medium',
    source: 'spec0259-q9h',
    idempotencyKey: `spec0259-q9h-${Date.now()}`
  }
  let seq = await control.lastSeq()
  await page.goto(`${state.origins.sibling}/`)
  // The task POST is credentialed JSON (preflight); the start is a simple
  // POST without body, so the request itself reaches the API (§4.8).
  await pace({ start: 1 })
  const sibling = await page.evaluate(
    async ({ api, body }) => {
      const result: string[] = []
      const attempts: [string, RequestInit][] = [
        [
          '/v1/tasks',
          {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body
          }
        ],
        ['/v1/auth/oidc/start', { method: 'POST', credentials: 'include' }]
      ]
      for (const [path, init] of attempts) {
        try {
          await fetch(`${api}${path}`, init)
          result.push('read')
        } catch {
          result.push('blocked')
        }
      }
      return result
    },
    { api: state.origins.api, body: JSON.stringify(payload) }
  )
  expect(sibling).toEqual(['blocked', 'blocked'])
  const fromSibling = (await control.edgeLog(seq)).filter(
    (entry) =>
      entry.host === 'api.cvg.test' && entry.origin === state.origins.sibling
  )
  expect(fromSibling.map((entry) => `${entry.method} ${entry.path}`)).toEqual(
    expect.arrayContaining(['OPTIONS /v1/tasks', 'POST /v1/auth/oidc/start'])
  )
  for (const entry of fromSibling) {
    expect(entry.status).toBe(403)
    expect(entry.acao).toBeNull()
  }
  for (const origin of [
    state.origins.sibling,
    'null',
    `http://console.cvg.test:${state.edgePort}`,
    null
  ]) {
    const response = await rawApi('POST', '/v1/tasks', value, payload, origin)
    expect(response.status, String(origin)).toBe(403)
  }
  seq = await control.lastSeq()
  await page.goto(`${state.origins.reports}/`)
  const reports = await page.evaluate(
    async ({ api, body }) => {
      try {
        await fetch(`${api}/v1/tasks`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'text/plain' },
          body
        })
        return 'read'
      } catch {
        return 'blocked'
      }
    },
    { api: state.origins.api, body: JSON.stringify(payload) }
  )
  expect(reports).toBe('blocked')
  const fromReports = (await control.edgeLog(seq)).filter(
    (entry) =>
      entry.host === 'api.cvg.test' && entry.origin === state.origins.reports
  )
  expect(fromReports).toHaveLength(1)
  expect(fromReports[0]).toMatchObject({
    method: 'POST',
    path: '/v1/tasks',
    status: 403,
    acao: state.origins.reports,
    acac: false
  })
  expect(names(fromReports[0]!)).toContain(HOST_SESSION)
  expect(await control.tasksCount()).toBe(before)
  await context.close()
})

test('Q9i — cookie tossing and login CSRF, with positive controls and live material', async () => {
  test.setTimeout(300_000)
  const attacker = await control.user(['synthetic-a-operator'])
  const victimUser = await control.user(['synthetic-a-approver'])

  // i1 — victim without an API cookie.
  {
    const context = await newContext()
    const page = await context.newPage()
    const { id } = await control.plant([
      'cvg_probe_control=1; Domain=cvg.test; Secure; Path=/',
      `${HOST_SESSION}=evil; Domain=cvg.test; Secure; Path=/`,
      `${HOST_PENDING}=evil; Domain=cvg.test; Secure; Path=/`
    ])
    await page.goto(`${state.origins.sibling}/plant/${id}`)
    const seq = await control.lastSeq()
    await page.goto(consoleUrl())
    await expect(page.getByText(TEXT.signIn)).toBeVisible()
    const cookies = await context.cookies()
    expect(
      cookies.some(
        (cookie) =>
          cookie.name === 'cvg_probe_control' && cookie.domain === '.cvg.test'
      )
    ).toBe(true)
    const apiEntries = (await control.edgeLog(seq)).filter(
      (entry) => entry.host === 'api.cvg.test'
    )
    expect(
      apiEntries.some((entry) => names(entry).includes('cvg_probe_control'))
    ).toBe(true)
    expect(
      cookies.filter(
        (cookie) =>
          cookie.name.startsWith('__Host-') && cookie.domain === '.cvg.test'
      )
    ).toEqual([])
    await context.close()
  }

  // i2 — login CSRF with the attacker's pending under the legacy name.
  let attackerSession: string
  {
    await control.reserve({ start: 1, callback: 2 })
    const captured = await capture(attacker)
    const tokenCalls = (await control.idpCalls()).token
    const context = await newContext()
    const page = await context.newPage()
    const { id } = await control.plant(
      [
        `${LEGACY_PENDING}=${captured.pending}; Domain=cvg.test; Secure; Path=/; SameSite=Lax`
      ],
      `${state.origins.api}${captured.callbackPath}`
    )
    await page.goto(`${state.origins.sibling}/plant/${id}`)
    expect(
      (await context.cookies()).some(
        (cookie) =>
          cookie.name === LEGACY_PENDING && cookie.domain === '.cvg.test'
      )
    ).toBe(true)
    const seq = await control.lastSeq()
    await page.getByRole('link', { name: 'Continuar' }).click()
    await landedOnConsole(page)
    await expect(page.getByText(TEXT.denied)).toBeVisible()
    const log = await control.edgeLog(seq)
    const callback = log.find(
      (entry) => entry.path === '/v1/auth/oidc/callback'
    )!
    expect(names(callback)).toContain(LEGACY_PENDING)
    expect(names(callback)).not.toContain(HOST_PENDING)
    expect(callback.landing).toBe('negado')
    const session = log.find(
      (entry) =>
        entry.path === '/v1/session' && entry.origin === state.origins.console
    )
    expect(session?.status).toBe(401)
    expect((await control.idpCalls()).token).toBe(tokenCalls)
    await context.close()

    // Live material: the same code and state still log the attacker in.
    const done = await rawCallback(
      captured.callbackPath,
      `${HOST_PENDING}=${captured.pending}`
    )
    expect(Date.now() - captured.capturedAt).toBeLessThan(50_000)
    expect(done.status).toBe(303)
    expect(done.headers.location).toBe(consoleUrl())
    attackerSession = setCookieValue(done, HOST_SESSION)!
    await control.secrets([attackerSession])
    const identity = await rawApi('GET', '/v1/session', attackerSession)
    expect(JSON.parse(identity.body).data.identity.operatorId).toBe(
      attacker.operatorId
    )
    expect((await control.idpCalls()).token).toBe(tokenCalls + 1)
    await control.cancelReservations()
  }

  // i3 — the victim is already authenticated and has a live pending.
  {
    const context = await newContext()
    const page = await context.newPage()
    await login(page, victimUser)
    await control.reserve({ start: 3, callback: 3 })
    await startFromConsole(page)
    await page.waitForURL((url) => url.origin === state.origins.idp)
    const savedSession = (await cookieValue(context, HOST_SESSION))!
    const savedPending = (await cookieValue(context, HOST_PENDING))!
    expect(savedSession && savedPending).toBeTruthy()
    await control.secrets([savedSession, savedPending])
    const captured = await capture(attacker)
    const tokenCalls = (await control.idpCalls()).token
    const { id } = await control.plant(
      [
        'cvg_probe_control=1; Domain=cvg.test; Secure; Path=/',
        `${HOST_SESSION}=evil; Domain=cvg.test; Secure; Path=/`,
        `${HOST_PENDING}=evil; Domain=cvg.test; Secure; Path=/`,
        `${LEGACY_PENDING}=${captured.pending}; Domain=cvg.test; Secure; Path=/; SameSite=Lax`,
        `${LEGACY_SESSION}=${attackerSession}; Domain=cvg.test; Secure; Path=/`
      ],
      `${state.origins.api}${captured.callbackPath}`
    )
    await page.goto(`${state.origins.sibling}/plant/${id}`)
    const cookies = await context.cookies()
    const hostOnly = (name: string) =>
      cookies.find(
        (cookie) => cookie.name === name && cookie.domain === 'api.cvg.test'
      )?.value
    expect(
      cookies.some(
        (cookie) =>
          cookie.name === 'cvg_probe_control' && cookie.domain === '.cvg.test'
      )
    ).toBe(true)
    expect(
      cookies.some(
        (cookie) =>
          cookie.name === LEGACY_PENDING && cookie.domain === '.cvg.test'
      )
    ).toBe(true)
    expect(
      cookies.filter(
        (cookie) =>
          cookie.name.startsWith('__Host-') && cookie.domain === '.cvg.test'
      )
    ).toEqual([])
    expect(hostOnly(HOST_SESSION)).toBe(savedSession)
    expect(hostOnly(HOST_PENDING)).toBe(savedPending)
    const seq = await control.lastSeq()
    await page.getByRole('link', { name: 'Continuar' }).click()
    await landedOnConsole(page)
    const log = await control.edgeLog(seq)
    const callback = log.find(
      (entry) => entry.path === '/v1/auth/oidc/callback'
    )!
    expect(names(callback)).toContain(LEGACY_PENDING)
    expect(names(callback)).toContain('cvg_probe_control')
    expect(callback.status).toBe(303)
    // Code review M2: the refusal itself lands on "negado" and clears the
    // victim's pending (I8); a limit, limiter or state-store path would land
    // on "indisponivel" and keep it. The victim's own session still answers.
    expect(callback.landing).toBe('negado')
    expect(await cookieValue(context, HOST_PENDING)).toBeUndefined()
    await expect(page.getByText(victimUser.operatorId)).toBeVisible()
    const view = await page.evaluate(async (api) => {
      const response = await fetch(`${api}/v1/session`, {
        credentials: 'include'
      })
      return (await response.json()) as {
        data: { identity: { operatorId: string } }
      }
    }, state.origins.api)
    expect(view.data.identity.operatorId).toBe(victimUser.operatorId)
    expect((await control.idpCalls()).token).toBe(tokenCalls)

    // Live material of the fresh capture.
    const done = await rawCallback(
      captured.callbackPath,
      `${HOST_PENDING}=${captured.pending}`
    )
    expect(Date.now() - captured.capturedAt).toBeLessThan(50_000)
    expect(done.status).toBe(303)
    const fresh = setCookieValue(done, HOST_SESSION)!
    await control.secrets([fresh])
    expect(
      JSON.parse((await rawApi('GET', '/v1/session', fresh)).body).data.identity
        .operatorId
    ).toBe(attacker.operatorId)

    // The next login of the victim ends with the victim's identity.
    await startFromConsole(page)
    await submitIdp(page, victimUser)
    await landedOnConsole(page)
    await expect(page.getByText(victimUser.operatorId)).toBeVisible()
    await expect(page.getByText(attacker.operatorId)).toHaveCount(0)
    await control.cancelReservations()
    expectHistoryClean(await recordHistory(context, page))
    await context.close()
  }
})

test('Q9j — the callback lands on the console and the IdP refuses a wrong redirect_uri', async () => {
  const user = await control.user(['synthetic-a-operator'])
  await pace({ start: 2, callback: 1 })
  const captured = await capture(user)
  const evil = encodeURIComponent(`${state.origins.evil}/`)
  const done = await rawCallback(
    `${captured.callbackPath}&return_to=${evil}`,
    `${HOST_PENDING}=${captured.pending}`
  )
  expect(done.status).toBe(303)
  expect(done.headers.location).toBe(consoleUrl())
  await control.secrets([setCookieValue(done, HOST_SESSION) ?? 'absent0'])

  const started = await rawEdge(state, {
    host: 'api.cvg.test',
    method: 'POST',
    path: '/v1/auth/oidc/start',
    headers: { origin: state.origins.console }
  })
  const authorization = new URL(JSON.parse(started.body).data.authorizationUrl)
  authorization.searchParams.set(
    'redirect_uri',
    `${state.origins.evil}/v1/auth/oidc/callback`
  )
  const context = await newContext()
  const page = await context.newPage()
  const response = await page.goto(authorization.href)
  expect(response?.status()).toBe(400)
  const refused = await rawIdpLogin(state, authorization.href, {
    username: user.username,
    password: user.password,
    totp: totpFor(user)
  })
  expect(refused.status).toBe(400)
  expect(refused.headers.location).toBeUndefined()
  await context.close()
})

test('Q9k — the same bundle on the mirror origin makes no API call', async () => {
  const context = await newContext()
  const page = await context.newPage()
  const seq = await control.lastSeq()
  await page.goto(`${state.origins.mirror}/`)
  const notice = page.getByText(TEXT.invalidConfiguration)
  await expect(notice).toBeVisible()
  await expect(notice).toBeFocused()
  await page.waitForTimeout(1_000)
  const log = await control.edgeLog(seq)
  expect(log.filter((entry) => entry.host === 'api.cvg.test')).toEqual([])
  await axe(page, 'configuration-error')
  await context.close()
})

test('Q9l — the CSP blocks another origin before the network', async () => {
  const context = await newContext()
  const page = await context.newPage()
  const violations: string[] = []
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) {
      violations.push(message.text())
    }
  })
  await page.goto(consoleUrl())
  await expect(page.getByText(TEXT.signIn)).toBeVisible()
  const seq = await control.lastSeq()
  const outcome = await page.evaluate(async (evil) => {
    try {
      await fetch(`${evil}/x`, { credentials: 'include' })
      return 'reached'
    } catch {
      return 'blocked'
    }
  }, state.origins.evil)
  expect(outcome).toBe('blocked')
  const log = await control.edgeLog(seq)
  expect(log.filter((entry) => entry.host === 'evil.other.test')).toEqual([])
  expect(violations.length).toBeGreaterThan(0)
  await context.close()
})

test('Q9m — wrong TOTP, user outside the matrix and token endpoint 500', async () => {
  const operator = await control.user(['synthetic-a-operator'])
  const outsider = await control.user(['synthetic-unrelated'])
  const context = await newContext()
  const page = await context.newPage()
  await page.goto(consoleUrl())
  let seq = await control.lastSeq()
  await pace({ start: 1 })
  await page.getByRole('button', { name: 'Entrar' }).click()
  const wrong = String(
    (Number(totpFor(operator)) + 500_000) % 1_000_000
  ).padStart(6, '0')
  await submitIdp(page, operator, wrong)
  await expect(page.getByText('Código inválido')).toBeVisible()
  expect(new URL(page.url()).origin).toBe(state.origins.idp)
  expect(
    (await control.edgeLog(seq)).filter(
      (entry) => entry.path === '/v1/auth/oidc/callback'
    )
  ).toEqual([])

  await page.goto(consoleUrl())
  await pace({ start: 1, callback: 1 })
  await page.getByRole('button', { name: 'Entrar' }).click()
  await submitIdp(page, outsider)
  await landedOnConsole(page)
  await expect(page.getByText(TEXT.denied)).toBeVisible()
  expect(page.url()).toBe(consoleUrl())
  await expect(page.getByRole('button', { name: 'Entrar' })).toBeFocused()
  await axe(page, 'login-denied')

  await control.idpControls({ tokenStatus: 500 })
  try {
    const tokenCalls = (await control.idpCalls()).token
    seq = await control.lastSeq()
    await pace({ start: 1, callback: 1 })
    await page.getByRole('button', { name: 'Entrar' }).click()
    await submitIdp(page, operator)
    await landedOnConsole(page)
    await expect(page.getByText(TEXT.loginUnavailable)).toBeVisible()
    expect((await control.idpCalls()).token).toBe(tokenCalls + 1)
    const callback = (await control.edgeLog(seq)).find(
      (entry) => entry.path === '/v1/auth/oidc/callback'
    )
    expect(callback?.status).toBe(303)
    expect(callback?.landing).toBe('indisponivel')
  } finally {
    await control.idpControls({ tokenStatus: null })
  }
  expectHistoryClean(await recordHistory(context, page))
  await context.close()
})

test('Q9n — an unavailable session keeps the cookie and recovers on retry', async () => {
  const user = await control.user(['synthetic-a-supervisor'])
  const context = await newContext()
  const page = await context.newPage()
  await login(page, user)
  const value = (await cookieValue(context, HOST_SESSION))!
  await control.secrets([value])
  for (const mode of ['503', 'cut'] as const) {
    await control.fault('/v1/session', mode)
    try {
      await page.reload()
      await expect(page.getByText(TEXT.unavailable)).toBeVisible()
      const retry = page.getByRole('button', { name: 'Tentar novamente' })
      await expect(retry).toBeFocused()
      await expect(page.getByRole('button', { name: 'Entrar' })).toHaveCount(0)
      expect(await cookieValue(context, HOST_SESSION)).toBe(value)
      if (mode === '503') await axe(page, 'unavailable')
    } finally {
      await control.fault('/v1/session', null)
    }
    await page.keyboard.press('Enter')
    await expect(page.getByText(user.operatorId)).toBeVisible()
  }
  await context.close()
})

test('Q10 — no code, token, secret, password or TOTP in URLs, logs or the report', async () => {
  const pacer = await control.pacer()
  test.info().annotations.push({
    type: 'pacer',
    description: JSON.stringify({
      paced: pacer.paced.length,
      maxLatencyMs: Math.max(
        0,
        ...pacer.paced.map((entry) => entry.latencyMs ?? 0)
      ),
      violations: pacer.violations.length
    })
  })
  const annotations = JSON.stringify(test.info().annotations)
  // I9 exception of the A: only IdP entries may carry state, nonce and
  // code_challenge (checked by expectHistoryClean); every other entry is
  // checked against every synthetic secret.
  const outsideIdp = histories.filter(
    (url) => new URL(url).origin !== state.origins.idp
  )
  // Positive control: a registered synthetic canary is found by the check.
  const canary = `cvg-0259-canary-${Date.now()}`
  await control.secrets([canary])
  const control0 = await control.leakCheck({
    canary: `prefix ${canary} suffix`
  })
  expect(control0.leakedSources).toEqual(['proof:canary'])
  expect(control0.secrets).toBeGreaterThan(10)
  const result = await control.leakCheck({
    histories: outsideIdp.join('\n'),
    annotations
  })
  expect(result.checkedSources).toEqual(
    expect.arrayContaining(['edgeLog', 'apiOutput', 'nginxLog'])
  )
  expect(result.leakedSources).toEqual([])
  expect(histories.length).toBeGreaterThan(0)
})
