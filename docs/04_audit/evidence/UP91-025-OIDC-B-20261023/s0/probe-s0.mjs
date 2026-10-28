// S0 da SPEC0259 (§8, passo 1): sonda de semântica de cookies do Chromium
// fixado, fora do código do produto. Servidores mínimos em Node (sem código
// CVG), hosts da §4.11, CA efêmera por openssl e confiança TLS por SPKI.
// Uso: node docs/04_audit/evidence/UP91-025-OIDC-B-20261023/s0/probe-s0.mjs <saida.json>
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import https from 'node:https'
import tls from 'node:tls'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'

const outPath = process.argv[2]
if (!outPath) throw new Error('usage: probe-s0.mjs <out.json>')

const dir = mkdtempSync(join(tmpdir(), 'cvg-u08-s0-'))
const openssl = (args) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] })

function makeLeaf(name, sans) {
  openssl(['req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${name}.key`, '-subj', `/CN=${sans[0]}`, '-out', `${name}.csr`])
  writeFileSync(
    join(dir, `${name}.ext`),
    `basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${sans.map((s) => `DNS:${s}`).join(',')}\n`
  )
  openssl(['x509', '-req', '-in', `${name}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-days', '2', '-sha256', '-extfile', `${name}.ext`, '-out', `${name}.crt`])
  const pub = openssl(['x509', '-in', `${name}.crt`, '-pubkey', '-noout'])
  const der = execFileSync('openssl', ['pkey', '-pubin', '-outform', 'der'], { input: pub })
  const spki = execFileSync('openssl', ['dgst', '-sha256', '-binary'], { input: der }).toString('base64')
  return { key: readFileSync(join(dir, `${name}.key`)), cert: readFileSync(join(dir, `${name}.crt`)), spki }
}

openssl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-subj', '/CN=cvg-u08-s0-ephemeral-ca', '-days', '2', '-out', 'ca.crt'])
const testLeaf = makeLeaf('test', ['console.cvg.test', 'api.cvg.test', 'sibling.cvg.test', 'evil.other.test'])
const idpLeaf = makeLeaf('idp', ['localhost'])

const COOKIE_PENDING = '__Host-' + 'cvg_oidc_pending'
const COOKIE_OPERATOR = '__Host-' + 'cvg_operator_session'
const edgeLog = []
const hex = (s) => Buffer.from(s, 'latin1').toString('hex')
function cookieNames(header) {
  if (!header) return []
  return header.split(';').map((seg) => {
    const eq = seg.indexOf('=')
    const name = eq === -1 ? seg : seg.slice(0, eq)
    return name.replace(/^[ \t]+|[ \t]+$/g, '')
  })
}

let edgePort = 0
let idpPort = 0
const origin = (host) => `https://${host}:${edgePort}`
let loginCounter = 0

const edge = https.createServer({ key: testLeaf.key, cert: testLeaf.cert }, (req, res) => {
  const host = (req.headers.host ?? '').split(':')[0]
  const names = cookieNames(req.headers.cookie)
  const entry = { host, method: req.method, path: req.url.split('?')[0], cookieNamesHex: names.map(hex), status: 0 }
  edgeLog.push(entry)
  const send = (status, headers, body = '') => {
    entry.status = status
    res.writeHead(status, headers)
    res.end(body)
  }
  const consoleOrigin = origin('console.cvg.test')
  const cors = req.headers.origin === consoleOrigin
    ? { 'access-control-allow-origin': consoleOrigin, 'access-control-allow-credentials': 'true', vary: 'Origin' }
    : {}
  if (host === 'console.cvg.test') {
    return send(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }, '<!doctype html><html lang="pt-BR"><title>console s0</title><p>console</p></html>')
  }
  if (host === 'api.cvg.test') {
    if (req.method === 'OPTIONS') {
      return send(204, { ...cors, 'access-control-allow-methods': 'GET, POST', 'access-control-allow-headers': 'accept, content-type', 'access-control-max-age': '600' })
    }
    if (req.method === 'POST' && req.url === '/start') {
      loginCounter += 1
      return send(200, {
        ...cors,
        'content-type': 'application/json',
        'set-cookie': `${COOKIE_PENDING}=s0-pending-${loginCounter}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`
      }, JSON.stringify({ authorizationUrl: `https://localhost:${idpPort}/authorize` }))
    }
    if (req.method === 'GET' && req.url.startsWith('/callback')) {
      return send(303, {
        location: `${consoleOrigin}/`,
        'cache-control': 'private, no-store',
        'set-cookie': [
          `${COOKIE_OPERATOR}=s0-operator-${loginCounter}; Path=/; HttpOnly; Secure; SameSite=Strict`,
          `${COOKIE_PENDING}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
        ]
      })
    }
    if (req.method === 'GET' && req.url === '/session') {
      return send(200, { ...cors, 'content-type': 'application/json', 'cache-control': 'private, no-store' }, JSON.stringify({ cookieNamesHex: names.map(hex) }))
    }
    return send(404, cors)
  }
  if (host === 'sibling.cvg.test') {
    const plants = {
      '/plant6': ['cvg_probe_control6=1; Domain=cvg.test; Secure; Path=/'],
      '/plant7': [
        'cvg_probe_control7=1; Domain=cvg.test; Secure; Path=/',
        `${COOKIE_OPERATOR}=evil; Domain=cvg.test; Secure; Path=/`,
        `${COOKIE_PENDING}=evil; Domain=cvg.test; Secure; Path=/`
      ],
      '/plant8': [`=${COOKIE_PENDING}=x; Domain=cvg.test; Secure; Path=/`, 'cvg_probe_control8=1; Domain=cvg.test; Secure; Path=/'],
      // \xA0 é escrito como o byte 0xA0 cru: o Node serializa cabeçalhos em latin1.
      '/plant9': [`\xA0${COOKIE_PENDING}=x; Domain=cvg.test; Secure; Path=/`, 'cvg_probe_control9=1; Domain=cvg.test; Secure; Path=/']
    }
    const plant = plants[req.url]
    if (plant) return send(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': plant }, '<!doctype html><html lang="pt-BR"><title>irmã</title><p>irmã</p></html>')
    return send(404, {})
  }
  return send(404, {})
})

const idpLog = []
const idp = https.createServer({ key: idpLeaf.key, cert: idpLeaf.cert }, (req, res) => {
  idpLog.push({ method: req.method, path: req.url.split('?')[0], cookieNamesHex: cookieNames(req.headers.cookie).map(hex) })
  if (req.url.startsWith('/authorize') && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    return res.end('<!doctype html><html lang="pt-BR"><title>IdP s0</title><form method="post" action="/authorize"><button type="submit">Entrar</button></form></html>')
  }
  if (req.url.startsWith('/authorize') && req.method === 'POST') {
    req.resume()
    req.on('end', () => {
      res.writeHead(302, { location: `${origin('api.cvg.test')}/callback?code=s0code&state=s0state` })
      res.end()
    })
    return
  }
  res.writeHead(404)
  res.end()
})

const listen = (server) => new Promise((resolve, reject) => {
  server.once('error', reject)
  server.listen(0, '127.0.0.1', () => resolve(server.address().port))
})

async function rawSetCookieBytes(path) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host: '127.0.0.1', port: edgePort, servername: 'sibling.cvg.test', ca: readFileSync(join(dir, 'ca.crt')) }, () => {
      socket.write(`GET ${path} HTTP/1.1\r\nHost: sibling.cvg.test:${edgePort}\r\nConnection: close\r\n\r\n`)
    })
    const chunks = []
    socket.on('data', (c) => chunks.push(c))
    socket.on('end', () => {
      const raw = Buffer.concat(chunks)
      const head = raw.subarray(0, raw.indexOf('\r\n\r\n'))
      const lines = []
      let start = 0
      for (let i = 0; i < head.length - 1; i += 1) {
        if (head[i] === 0x0d && head[i + 1] === 0x0a) {
          lines.push(head.subarray(start, i))
          start = i + 2
        }
      }
      lines.push(head.subarray(start))
      resolve(lines.filter((l) => l.subarray(0, 11).toString('latin1').toLowerCase() === 'set-cookie:').map((l) => l.toString('hex')))
    })
    socket.on('error', reject)
  })
}

const checks = {}
const record = (id, pass, detail) => {
  checks[id] = { pass, ...detail }
}
let browser
let tlsTrust = 'spki-list'
const startedAt = new Date().toISOString()
try {
  edgePort = await listen(edge)
  idpPort = await listen(idp)
  const consoleOrigin = origin('console.cvg.test')
  const apiOrigin = origin('api.cvg.test')
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-proxy-server',
      '--host-resolver-rules=MAP console.cvg.test 127.0.0.1, MAP api.cvg.test 127.0.0.1, MAP sibling.cvg.test 127.0.0.1, MAP evil.other.test 127.0.0.1, MAP localhost 127.0.0.1',
      `--ignore-certificate-errors-spki-list=${testLeaf.spki},${idpLeaf.spki}`
    ]
  })
  // Confiança TLS: primeiro só pela flag SPKI (PB10).
  let ctx = await browser.newContext()
  let page = await ctx.newPage()
  try {
    await page.goto(`${consoleOrigin}/`)
  } catch (error) {
    tlsTrust = `ignoreHTTPSErrors (flag SPKI recusada: ${String(error.message).split('\n')[0]})`
    await ctx.close()
    ctx = await browser.newContext({ ignoreHTTPSErrors: true })
    page = await ctx.newPage()
    await page.goto(`${consoleOrigin}/`)
  }
  const ctxOptions = tlsTrust === 'spki-list' ? {} : { ignoreHTTPSErrors: true }

  const apiCookies = async (c) => (await c.cookies()).map((k) => ({ name: k.name, nameHex: hex(k.name), domain: k.domain, sameSite: k.sameSite, secure: k.secure, httpOnly: k.httpOnly }))
  const lastEdge = (host, path) => [...edgeLog].reverse().find((e) => e.host === host && e.path === path)

  async function login(p) {
    const authorizationUrl = await p.evaluate(async (api) => {
      const r = await fetch(`${api}/start`, { method: 'POST', credentials: 'include' })
      return (await r.json()).authorizationUrl
    }, apiOrigin)
    const afterStart = await apiCookies(p.context())
    await p.evaluate((u) => location.assign(u), authorizationUrl)
    await p.waitForURL(`https://localhost:${idpPort}/authorize`)
    const landed = p.waitForURL(`${consoleOrigin}/`)
    await p.getByRole('button', { name: 'Entrar' }).click()
    await landed
    return { afterStart, callback: lastEdge('api.cvg.test', '/callback') }
  }

  // Login 1: checagens 1, 2, 4 e 5.
  const l1 = await login(page)
  const pending1 = l1.afterStart.find((k) => k.name === COOKIE_PENDING)
  record(1, Boolean(pending1 && pending1.domain === 'api.cvg.test' && pending1.sameSite === 'Lax' && pending1.secure && pending1.httpOnly), { cookieAfterStart: pending1 ?? null })
  const cb1Names = l1.callback.cookieNamesHex
  record(2, cb1Names.includes(hex(COOKIE_PENDING)), { callbackCookieNamesHex: cb1Names, initiator: 'documento do IdP (POST do formulário → 302 → GET)' })
  const afterCb1 = await apiCookies(ctx)
  const op1 = afterCb1.find((k) => k.name === COOKIE_OPERATOR)
  record(4, Boolean(op1 && op1.domain === 'api.cvg.test' && op1.sameSite === 'Strict' && op1.secure && op1.httpOnly), { operatorCookie: op1 ?? null })
  const sessionView = await page.evaluate(async (api) => (await fetch(`${api}/session`, { credentials: 'include' })).json(), apiOrigin)
  record(5, sessionView.cookieNamesHex.includes(hex(COOKIE_OPERATOR)) && lastEdge('api.cvg.test', '/session').cookieNamesHex.includes(hex(COOKIE_OPERATOR)), { sessionCookieNamesHex: sessionView.cookieNamesHex, readableByConsole: true })

  // Login 2 no mesmo contexto: checagem 3 (com o operacional já gravado).
  const l2 = await login(page)
  const cb2Names = l2.callback.cookieNamesHex
  record(3, cb2Names.includes(hex(COOKIE_PENDING)) && !cb2Names.includes(hex(COOKIE_OPERATOR)), { operatorPresentBefore: Boolean((await apiCookies(ctx)).find((k) => k.name === COOKIE_OPERATOR)), callbackCookieNamesHex: cb2Names })
  record('2b', cb2Names.includes(hex(COOKIE_PENDING)), { note: 'checagem 2 repetida no segundo login' })
  const consoleCookieRequests = edgeLog.filter((e) => e.host === 'console.cvg.test' && e.cookieNamesHex.length > 0)
  await ctx.close()

  async function plantAndObserve(path, controlName) {
    const c = await browser.newContext(ctxOptions)
    const p = await c.newPage()
    await p.goto(`${origin('sibling.cvg.test')}${path}`)
    const cookies = await apiCookies(c)
    await p.goto(`${consoleOrigin}/`)
    await p.evaluate(async (api) => (await fetch(`${api}/session`, { credentials: 'include' })).json(), apiOrigin)
    const apiEntry = lastEdge('api.cvg.test', '/session')
    const allCookies = (await c.cookies()).map((k) => ({ nameHex: hex(k.name), valueHex: hex(k.value), domain: k.domain }))
    await c.close()
    return { cookies, allCookies, apiNamesHex: apiEntry.cookieNamesHex, controlInContext: cookies.some((k) => k.name === controlName && k.domain === '.cvg.test'), controlAtApi: apiEntry.cookieNamesHex.includes(hex(controlName)) }
  }

  const p6 = await plantAndObserve('/plant6', 'cvg_probe_control6')
  record(6, p6.controlInContext && p6.controlAtApi, { cookies: p6.cookies, apiCookieNamesHex: p6.apiNamesHex })

  const p7 = await plantAndObserve('/plant7', 'cvg_probe_control7')
  const host7 = p7.cookies.filter((k) => k.name.startsWith('__Host-'))
  record(7, p7.controlInContext && p7.controlAtApi && host7.length === 0 && !p7.apiNamesHex.includes(hex(COOKIE_OPERATOR)) && !p7.apiNamesHex.includes(hex(COOKIE_PENDING)), { controlInContext: p7.controlInContext, controlAtApi: p7.controlAtApi, hostPrefixedInContext: host7, apiCookieNamesHex: p7.apiNamesHex })

  const p8 = await plantAndObserve('/plant8', 'cvg_probe_control8')
  const nameless = p8.allCookies.filter((k) => k.nameHex === '' || Buffer.from(k.valueHex, 'hex').toString('latin1').startsWith('__Host-'))
  record(8, p8.controlInContext && p8.controlAtApi && nameless.length === 0 && !p8.apiNamesHex.includes(hex(COOKIE_PENDING)), { controlInContext: p8.controlInContext, controlAtApi: p8.controlAtApi, namelessInContext: nameless, apiCookieNamesHex: p8.apiNamesHex, setCookieRawHex: await rawSetCookieBytes('/plant8') })

  const p9 = await plantAndObserve('/plant9', 'cvg_probe_control9')
  const stored9 = p9.allCookies.filter((k) => k.nameHex !== hex('cvg_probe_control9'))
  record(9, null, {
    registroSemResultadoEsperado: true,
    controlInContext: p9.controlInContext,
    controlAtApi: p9.controlAtApi,
    storedOtherCookies: stored9,
    stored: stored9.length > 0,
    sentToApi: p9.apiNamesHex.some((h) => h !== hex('cvg_probe_control9')),
    apiCookieNamesHex: p9.apiNamesHex,
    setCookieRawHex: await rawSetCookieBytes('/plant9')
  })

  const result = {
    probe: 'S0 SPEC0259 §8',
    startedAt,
    finishedAt: new Date().toISOString(),
    node: process.version,
    browser: `Chromium ${browser.version()} (Playwright headless)`,
    tlsTrust,
    hosts: { console: consoleOrigin, api: apiOrigin, sibling: origin('sibling.cvg.test'), idp: `https://localhost:${idpPort}` },
    spki: { test: testLeaf.spki, idp: idpLeaf.spki },
    checks,
    consoleHostRequestsWithCookies: consoleCookieRequests.length,
    pass1to8: [1, 2, 3, 4, 5, 6, 7, 8].every((i) => checks[i]?.pass === true),
    edgeLog,
    idpLog
  }
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify({ pass1to8: result.pass1to8, tlsTrust, checks: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, v.pass])) }))
} finally {
  await browser?.close()
  await new Promise((r) => edge.close(r))
  await new Promise((r) => idp.close(r))
  rmSync(dir, { recursive: true, force: true })
}
