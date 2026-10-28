// @vitest-environment node
/**
 * SPEC0259 Q8 (renderizador, sem Docker) e Q10 (fronteira). O modelo NGINX
 * do console só tem o placeholder da origem da API; o renderizador recusa
 * origem que não seja `https:` exata e placeholder restante. Nada de fora dos
 * testes importa o suporte da prova de três hosts.
 */
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  SyntheticOidcIssuer,
  syntheticTotp
} from '../apps/api/src/__tests__/support/synthetic-oidc-issuer.ts'
import { createProofCertificates } from './support/oidc-hosts/certificates.ts'
import { cookieNamesHex } from './support/oidc-hosts/edge.ts'
import {
  CONSOLE_NGINX_TEMPLATE_PATH,
  renderConsoleNginxConf
} from './support/oidc-hosts/nginx-console.ts'
import { LoginPacer, PACER_WINDOW_MS } from './support/oidc-hosts/pacer.ts'

const root = process.cwd()
const template = readFileSync(join(root, CONSOLE_NGINX_TEMPLATE_PATH), 'utf8')
const CSP = (api: string) =>
  `default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src ${api}; form-action 'self'`

describe('SPEC0259 Q8 — console NGINX template renderer', () => {
  it('renders the exact CSP with the API origin and leaves no placeholder', () => {
    const api = 'https://api.cvg.test:8443'
    const rendered = renderConsoleNginxConf(template, api)
    expect(rendered).not.toMatch(/__CVG_[A-Z_]+__/)
    expect(rendered).toContain(`"${CSP(api)}" always;`)
    const blocks = rendered.match(/location [^{]+\{[^}]*\}/g) ?? []
    expect(blocks.length).toBeGreaterThanOrEqual(6)
    for (const block of blocks) {
      expect(block, block).toContain(
        `add_header Content-Security-Policy "${CSP(api)}" always;`
      )
      expect(block, block).toContain(
        'add_header X-Content-Type-Options "nosniff" always;'
      )
      expect(block, block).toContain(
        'add_header Referrer-Policy "no-referrer" always;'
      )
    }
  })

  it('answers 404 for /v1, /v1/ and the probes without a proxy and keeps no-store on the SPA', () => {
    expect(template).not.toMatch(/proxy_pass|fastcgi_pass|uwsgi_pass|grpc_pass/)
    expect(template).toMatch(/server_tokens off;/)
    for (const location of [
      'location = /v1 {',
      'location ^~ /v1/ {',
      'location = /health {',
      'location = /live {',
      'location = /ready {'
    ]) {
      const start = template.indexOf(location)
      expect(start, location).toBeGreaterThanOrEqual(0)
      const block = template.slice(start, template.indexOf('}', start))
      expect(block, location).toContain('return 404;')
      expect(block, location).not.toContain('try_files')
    }
    const spa = template.slice(template.indexOf('location / {'))
    expect(spa).toContain('try_files $uri /index.html;')
    expect(spa).toContain('add_header Cache-Control "no-store" always;')
  })

  it.each([
    'http://api.cvg.test',
    'https://api.cvg.test/',
    'https://api.cvg.test/v1',
    'https://api.cvg.test?x=1',
    'https://user:secret@api.cvg.test',
    "https://api.cvg.test; script-src 'unsafe-inline'",
    'https://api.cvg.test https://evil.other.test',
    '*',
    'https:',
    "'self'",
    ''
  ])('refuses the API origin %j', (value) => {
    expect(() => renderConsoleNginxConf(template, value)).toThrow()
  })

  it('refuses a placeholder left after rendering', () => {
    expect(() =>
      renderConsoleNginxConf(
        `${template}\n# __CVG_OTHER__\n`,
        'https://api.cvg.test'
      )
    ).toThrow(/placeholder/)
    expect(() =>
      renderConsoleNginxConf('server { }', 'https://api.cvg.test')
    ).toThrow(/placeholder/)
  })
})

function walk(directory: string, out: string[] = []): string[] {
  for (const entry of readdirSync(directory)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(directory, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

describe('SPEC0259 Q10 — boundary of the three-host proof support', () => {
  it('is never imported outside tests', () => {
    const roots = ['apps', 'packages', 'legacy', 'deploy']
    const runtimeFiles = roots
      .flatMap((name) => walk(join(root, name)))
      .filter(
        (file) =>
          /\.(ts|tsx|mts|mjs|js|conf|template)$/.test(file) &&
          !file.includes(`${'/'}__tests__${'/'}`) &&
          !/\.test\.(ts|tsx|js)$/.test(file)
      )
    expect(runtimeFiles.length).toBeGreaterThan(100)
    const offenders = runtimeFiles.filter((file) =>
      /oidc-hosts|synthetic-oidc-issuer|support\/oidc-postgres-fixture/.test(
        readFileSync(file, 'utf8')
      )
    )
    expect(offenders.map((file) => relative(root, file))).toEqual([])
    for (const file of ['vite.config.mts', 'Dockerfile']) {
      expect(readFileSync(join(root, file), 'utf8')).not.toMatch(/oidc-hosts/)
    }
  })

  it('is never imported by products or by the scripts of the bar', () => {
    const files = ['products', 'scripts']
      .flatMap((name) => walk(join(root, name)))
      .filter(
        (file) =>
          /\.(ts|tsx|mts|mjs|js|cjs)$/.test(file) &&
          !file.includes(`${'/'}__tests__${'/'}`) &&
          !/\.test\.(ts|tsx|js)$/.test(file)
      )
    expect(files.length).toBeGreaterThan(50)
    // The runner and the bar contract name the proof; none imports its support.
    const offenders = files.filter((file) =>
      /support\/oidc-hosts\/|synthetic-oidc-issuer|support\/oidc-postgres-fixture/.test(
        readFileSync(file, 'utf8')
      )
    )
    expect(offenders.map((file) => relative(root, file))).toEqual([])
  })

  it('keeps the NGINX template free of secrets and of test support', () => {
    expect(template).not.toMatch(
      /password|secret|private|ssl_certificate|BEGIN /i
    )
    expect(template).not.toMatch(/cvg\.test|localhost|127\.0\.0\.1/)
    expect(template).not.toMatch(/[A-Za-z0-9+/_-]{40,}/)
  })
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('SPEC0259 §4.11 — login pacer (DB10)', () => {
  it('releases at most 9 starts in a 70 s window and waits for the window', async () => {
    let now = 1_000_000
    const pacer = new LoginPacer(() => now)
    for (let index = 0; index < 9; index += 1) await pacer.release('start')
    let released = false
    const tenth = pacer.release('start').then(() => {
      released = true
    })
    await sleep(400)
    expect(released).toBe(false)
    now += PACER_WINDOW_MS + 1
    await tenth
    expect(released).toBe(true)
    expect(pacer.snapshot().start).toBe(1)
  })

  it('reserves slots only when they fit and releases reserved requests at once', async () => {
    let now = 5_000_000
    const pacer = new LoginPacer(() => now)
    for (let index = 0; index < 20; index += 1) await pacer.release('callback')
    await pacer.reserve({ start: 3, callback: 5 })
    for (let index = 0; index < 5; index += 1) await pacer.release('callback')
    expect(pacer.snapshot().callback).toBe(25)
    let reserved = false
    const waiting = pacer.reserve({ callback: 1 }).then(() => {
      reserved = true
    })
    await sleep(400)
    expect(reserved).toBe(false)
    now += PACER_WINDOW_MS + 1
    await waiting
    expect(reserved).toBe(true)
    pacer.cancelReservations()
    expect(pacer.snapshot().reserved).toEqual({ start: 0, callback: 0 })
  })
})

describe('SPEC0259 §4.11 — edge log keeps only cookie names', () => {
  it('records names in hex, trimming only SP and HTAB, never values', () => {
    const names = cookieNamesHex(' a=1;\tb=2; \u00a0c=3; =x; d')
    expect(
      names.map((hex) => Buffer.from(hex, 'hex').toString('latin1'))
    ).toEqual(['a', 'b', '\u00a0c', '', 'd'])
    expect(cookieNamesHex(undefined)).toEqual([])
  })
})

describe('SPEC0259 §4.10 — synthetic IdP login page and shared CA', () => {
  const redirectUri = 'https://api.cvg.test/v1/auth/oidc/callback'
  const issuer = () =>
    new SyntheticOidcIssuer({
      issuer: 'https://localhost:9443',
      clientId: 'cvg-synthetic-console',
      clientSecret: 'S'.repeat(40),
      redirectUri,
      groupsClaim: 'synthetic_groups'
    })
  const authorizeUrl = (redirect = redirectUri) => {
    const url = new URL('https://localhost:9443/authorize')
    for (const [key, value] of Object.entries({
      client_id: 'cvg-synthetic-console',
      redirect_uri: redirect,
      response_type: 'code',
      scope: 'openid',
      state: 'A'.repeat(43),
      nonce: 'B'.repeat(43),
      code_challenge: 'C'.repeat(43),
      code_challenge_method: 'S256'
    })) {
      url.searchParams.set(key, value)
    }
    return url.href
  }

  it('serves a labeled form without script and refuses a wrong redirect_uri', async () => {
    const idp = issuer()
    const page = await idp.fetch(authorizeUrl(), { method: 'GET' })
    expect(page.status).toBe(200)
    const html = await page.text()
    expect(html).toContain('lang="pt-BR"')
    expect(html).toContain('<form method="post" action="/authorize?')
    for (const label of ['Usuário', 'Senha', 'Código de verificação']) {
      expect(html).toContain(`>${label}</label>`)
    }
    expect(html).toContain('<button type="submit">Entrar</button>')
    expect(html).not.toMatch(/<script/i)
    const refused = await idp.fetch(
      authorizeUrl('https://evil.other.test/v1/auth/oidc/callback'),
      { method: 'GET' }
    )
    expect(refused.status).toBe(400)
  })

  it('answers a wrong TOTP with the page and no code', async () => {
    const idp = issuer()
    const user = idp.addUser({ groups: ['synthetic-a-operator'] })
    const current = syntheticTotp(user.totpSecret)
    const wrong = String((Number(current) + 500_000) % 1_000_000).padStart(
      6,
      '0'
    )
    const response = await idp.fetch(authorizeUrl(), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: user.username,
        password: user.password,
        totp: wrong
      }).toString()
    })
    expect(response.status).toBe(401)
    expect(response.headers.get('location')).toBeNull()
    expect(await response.text()).toContain('Código inválido')
  })

  it('listens with a leaf of the CA shared with the test edge', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'cvg-0259-support-'))
    try {
      const certificates = createProofCertificates(directory)
      expect(certificates.test.spki).toMatch(/^[A-Za-z0-9+/]{43}=$/)
      const idp = issuer()
      const endpoint = await idp.listenHttps({
        ca: certificates.ca,
        key: certificates.idp.key,
        cert: certificates.idp.cert
      })
      try {
        const discovery = await endpoint.transport(
          `${endpoint.issuer}/.well-known/openid-configuration`,
          { method: 'GET' }
        )
        expect(discovery.status).toBe(200)
        expect((await discovery.json()).issuer).toBe(endpoint.issuer)
      } finally {
        await endpoint.close()
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 60_000)
})
