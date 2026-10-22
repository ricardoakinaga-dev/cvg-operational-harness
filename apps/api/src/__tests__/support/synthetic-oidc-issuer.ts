/**
 * SPEC0254 §4.10 — synthetic OpenID Provider for tests only.
 *
 * Never imported outside `__tests__` (O12) and excluded from the runtime
 * build. Keys, certificates, passwords and TOTP secrets are generated per run
 * and never written to the repository. Data is synthetic: `tenant_<uuid>`
 * test tenants, `synthetic-*` groups, no e-mail or name.
 */
import {
  createHash,
  createHmac,
  generateKeyPairSync,
  randomBytes,
  sign as signBytes,
  type KeyObject
} from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, request as httpsRequest } from 'node:https'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface SyntheticTransportInit {
  method?: string
  headers?: Record<string, string>
  body?: unknown
  signal?: AbortSignal | null
}

/** A `fetch`-shaped transport (the shape `openid-client` uses). */
export type SyntheticTransport = (
  url: string,
  init: SyntheticTransportInit
) => Promise<Response>

export interface SyntheticUser {
  readonly username: string
  readonly password: string
  readonly totpSecret: Buffer
  readonly sub: string
  readonly groups: unknown
  /** ID token lifetime in seconds (default 300). */
  readonly idTokenTtlSeconds?: number
}

export type SignatureMode =
  | 'valid'
  | 'other-key-known-kid'
  | 'unknown-kid'
  | 'none'
  | 'HS256'

export interface SyntheticIssuerControls {
  /** Fields merged into the discovery document (`undefined` removes). */
  metadata?: Record<string, unknown>
  /** Claims merged into the next ID tokens (`undefined` removes). */
  claims?: Record<string, unknown>
  signature?: SignatureMode
  tokenStatus?: number
  jwksStatus?: number
  jwksDown?: boolean
  /** Every endpoint fails at the network level. */
  down?: boolean
  /** The authorization endpoint redirects with `error=access_denied`. */
  authorizeError?: boolean
  discoveryDelayMs?: number
}

interface IssuedCode {
  readonly user: SyntheticUser
  readonly nonce: string
  readonly challenge: string
  readonly redirectUri: string
  readonly authTime: number
  readonly expiresAt: number
  used: boolean
}

interface SigningKey {
  readonly kid: string
  readonly privateKey: KeyObject
  readonly publicJwk: Record<string, unknown>
}

interface SyntheticResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface SyntheticOidcIssuerOptions {
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
  groupsClaim: string
}

export class SyntheticTransportError extends TypeError {
  constructor(message: string) {
    super(message)
    this.name = 'SyntheticTransportError'
  }
}

function generateSigningKey(): SigningKey {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048
  })
  const kid = `synthetic-${randomBytes(8).toString('hex')}`
  return {
    kid,
    privateKey,
    publicJwk: {
      ...publicKey.export({ format: 'jwk' }),
      kid,
      alg: 'RS256',
      use: 'sig'
    }
  }
}

function base64url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url')
}

/** RFC 6238 TOTP (HMAC-SHA1, 30 s step, 6 digits). */
export function syntheticTotp(secret: Buffer, atMs = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(atMs / 1_000 / 30)))
  const digest = createHmac('sha1', secret).update(counter).digest()
  const offset = digest[digest.length - 1]! & 0x0f
  const binary = digest.readUInt32BE(offset) & 0x7fffffff
  return String(binary % 1_000_000).padStart(6, '0')
}

function json(status: number, body: unknown): SyntheticResponse {
  return {
    status,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify(body)
  }
}

function decodeFormComponent(value: string): string {
  return decodeURIComponent(value.replaceAll('+', ' '))
}

export class SyntheticOidcIssuer {
  issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
  readonly groupsClaim: string
  readonly calls = { discovery: 0, authorize: 0, token: 0, jwks: 0 }
  controls: SyntheticIssuerControls = {}
  /** Every value the IdP produced or received that must never leak (O11). */
  readonly secrets = new Set<string>()
  private signingKey = generateSigningKey()
  private readonly otherKey = generateSigningKey()
  private readonly retiredKeys: SigningKey[] = []
  private readonly users = new Map<string, SyntheticUser>()
  private readonly codes = new Map<string, IssuedCode>()

  constructor(options: SyntheticOidcIssuerOptions) {
    this.issuer = options.issuer
    this.clientId = options.clientId
    this.clientSecret = options.clientSecret
    this.redirectUri = options.redirectUri
    this.groupsClaim = options.groupsClaim
    this.secrets.add(options.clientSecret)
  }

  addUser(input: {
    groups: unknown
    idTokenTtlSeconds?: number
  }): SyntheticUser {
    const user: SyntheticUser = {
      username: `synthetic-user-${randomBytes(6).toString('hex')}`,
      password: randomBytes(18).toString('base64url'),
      totpSecret: randomBytes(20),
      sub: `synthetic-sub-${randomBytes(12).toString('hex')}`,
      groups: input.groups,
      ...(input.idTokenTtlSeconds !== undefined
        ? { idTokenTtlSeconds: input.idTokenTtlSeconds }
        : {})
    }
    this.users.set(user.username, user)
    this.secrets.add(user.password)
    this.secrets.add(user.sub)
    this.secrets.add(user.totpSecret.toString('base64url'))
    this.secrets.add(user.totpSecret.toString('hex'))
    if (Array.isArray(input.groups)) {
      for (const group of input.groups) {
        if (typeof group === 'string') this.secrets.add(group)
      }
    }
    return user
  }

  /** New signing key; the JWKS keeps the previous key too. */
  rotateKey(): void {
    this.retiredKeys.push(this.signingKey)
    this.signingKey = generateSigningKey()
  }

  metadata(): Record<string, unknown> {
    const base: Record<string, unknown> = {
      issuer: this.issuer,
      authorization_endpoint: `${this.issuer}/authorize`,
      token_endpoint: `${this.issuer}/token`,
      jwks_uri: `${this.issuer}/jwks`,
      response_types_supported: ['code'],
      subject_types_supported: ['public'],
      scopes_supported: ['openid'],
      grant_types_supported: ['authorization_code'],
      id_token_signing_alg_values_supported: ['RS256'],
      code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic']
    }
    for (const [key, value] of Object.entries(this.controls.metadata ?? {})) {
      if (value === undefined) delete base[key]
      else base[key] = value
    }
    return base
  }

  /** In-memory transport: same handler as the HTTPS server. */
  readonly fetch: SyntheticTransport = async (url, init) => {
    const signal = init.signal ?? undefined
    if (signal?.aborted) throw signal.reason
    const target = new URL(url)
    if (this.controls.down || target.origin !== new URL(this.issuer).origin) {
      throw new SyntheticTransportError('synthetic IdP is unreachable')
    }
    if (
      target.pathname === '/.well-known/openid-configuration' &&
      this.controls.discoveryDelayMs
    ) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, this.controls.discoveryDelayMs)
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer)
            reject(signal.reason)
          },
          { once: true }
        )
      })
    }
    if (target.pathname === '/jwks' && this.controls.jwksDown) {
      this.calls.jwks += 1
      throw new SyntheticTransportError('synthetic JWKS is unreachable')
    }
    const response = this.handle(
      (init.method ?? 'GET').toUpperCase(),
      target,
      init.headers ?? {},
      typeof init.body === 'string'
        ? init.body
        : init.body instanceof URLSearchParams
          ? init.body.toString()
          : ''
    )
    return new Response(response.body === '' ? null : response.body, {
      status: response.status,
      headers: response.headers
    })
  }

  /**
   * Browser step at the authorization endpoint: password + TOTP. Returns the
   * redirect target (callback URL with `code` and `state`) or `null` when the
   * IdP refuses to issue a code.
   */
  async authorize(
    authorizationUrl: string,
    credentials: { username: string; password: string; totp: string },
    transport: SyntheticTransport = this.fetch
  ): Promise<{ status: number; location: string | null }> {
    const response = await transport(authorizationUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(credentials).toString()
    })
    return {
      status: response.status,
      location: response.headers.get('location')
    }
  }

  login(
    authorizationUrl: string,
    user: SyntheticUser,
    transport?: SyntheticTransport
  ) {
    const totp = syntheticTotp(user.totpSecret)
    this.secrets.add(totp)
    return this.authorize(
      authorizationUrl,
      { username: user.username, password: user.password, totp },
      transport
    )
  }

  private handle(
    method: string,
    target: URL,
    headers: Record<string, string>,
    body: string
  ): SyntheticResponse {
    switch (target.pathname) {
      case '/.well-known/openid-configuration':
        this.calls.discovery += 1
        return json(200, this.metadata())
      case '/authorize':
        this.calls.authorize += 1
        return this.handleAuthorize(method, target, body)
      case '/token':
        this.calls.token += 1
        return this.handleToken(method, headers, body)
      case '/jwks':
        this.calls.jwks += 1
        if (this.controls.jwksStatus) {
          return json(this.controls.jwksStatus, { error: 'server_error' })
        }
        return json(200, {
          keys: [this.signingKey, ...this.retiredKeys].map(
            (key) => key.publicJwk
          )
        })
      default:
        return json(404, { error: 'not_found' })
    }
  }

  private handleAuthorize(
    method: string,
    target: URL,
    body: string
  ): SyntheticResponse {
    const query = target.searchParams
    const state = query.get('state')
    const nonce = query.get('nonce')
    const challenge = query.get('code_challenge')
    const redirectUri = query.get('redirect_uri')
    if (
      method !== 'POST' ||
      query.get('client_id') !== this.clientId ||
      redirectUri !== this.redirectUri ||
      query.get('response_type') !== 'code' ||
      !(query.get('scope') ?? '').split(' ').includes('openid') ||
      query.get('code_challenge_method') !== 'S256' ||
      !state ||
      !nonce ||
      !challenge
    ) {
      return json(400, { error: 'invalid_request' })
    }
    this.secrets.add(state)
    this.secrets.add(nonce)
    this.secrets.add(challenge)
    const location = new URL(redirectUri)
    if (this.controls.authorizeError) {
      location.searchParams.set('error', 'access_denied')
      location.searchParams.set('state', state)
      return { status: 302, headers: { location: location.href }, body: '' }
    }
    const form = new URLSearchParams(body)
    const user = this.users.get(form.get('username') ?? '')
    const totp = form.get('totp') ?? ''
    const now = Date.now()
    const validTotp =
      user !== undefined &&
      [-30_000, 0, 30_000].some(
        (drift) => syntheticTotp(user.totpSecret, now + drift) === totp
      )
    if (!user || form.get('password') !== user.password || !validTotp) {
      return json(401, { error: 'access_denied' })
    }
    const code = randomBytes(32).toString('base64url')
    this.secrets.add(code)
    this.codes.set(code, {
      user,
      nonce,
      challenge,
      redirectUri,
      authTime: Math.floor(now / 1_000),
      expiresAt: now + 60_000,
      used: false
    })
    location.searchParams.set('code', code)
    location.searchParams.set('state', state)
    return { status: 302, headers: { location: location.href }, body: '' }
  }

  private handleToken(
    method: string,
    headers: Record<string, string>,
    body: string
  ): SyntheticResponse {
    const authorization = Object.entries(headers).find(
      ([name]) => name.toLowerCase() === 'authorization'
    )?.[1]
    const credentials = /^Basic ([A-Za-z0-9+/=]+)$/.exec(authorization ?? '')
    const decoded = credentials
      ? Buffer.from(credentials[1]!, 'base64').toString('utf8')
      : ''
    const separator = decoded.indexOf(':')
    const clientId =
      separator > 0 ? decodeFormComponent(decoded.slice(0, separator)) : ''
    const secret =
      separator > 0 ? decodeFormComponent(decoded.slice(separator + 1)) : ''
    if (
      method !== 'POST' ||
      clientId !== this.clientId ||
      secret !== this.clientSecret
    ) {
      return json(401, { error: 'invalid_client' })
    }
    if (this.controls.tokenStatus) {
      return json(this.controls.tokenStatus, {
        error:
          this.controls.tokenStatus >= 500 ? 'server_error' : 'invalid_grant'
      })
    }
    const form = new URLSearchParams(body)
    const code = form.get('code') ?? ''
    const verifier = form.get('code_verifier') ?? ''
    this.secrets.add(verifier)
    const issued = this.codes.get(code)
    if (
      form.get('grant_type') !== 'authorization_code' ||
      !issued ||
      issued.used ||
      issued.expiresAt <= Date.now() ||
      form.get('redirect_uri') !== issued.redirectUri ||
      createHash('sha256').update(verifier, 'ascii').digest('base64url') !==
        issued.challenge
    ) {
      if (issued) issued.used = true
      return json(400, { error: 'invalid_grant' })
    }
    issued.used = true
    const idToken = this.idToken(issued)
    const accessToken = randomBytes(32).toString('base64url')
    this.secrets.add(idToken)
    this.secrets.add(accessToken)
    return json(200, {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: 300,
      id_token: idToken
    })
  }

  private idToken(issued: IssuedCode): string {
    const now = Math.floor(Date.now() / 1_000)
    const claims: Record<string, unknown> = {
      iss: this.issuer,
      sub: issued.user.sub,
      aud: this.clientId,
      iat: now,
      exp: now + (issued.user.idTokenTtlSeconds ?? 300),
      auth_time: issued.authTime,
      nonce: issued.nonce,
      amr: ['pwd', 'otp'],
      [this.groupsClaim]: issued.user.groups
    }
    for (const [key, value] of Object.entries(this.controls.claims ?? {})) {
      if (value === undefined) delete claims[key]
      else claims[key] = value
    }
    const mode = this.controls.signature ?? 'valid'
    const key =
      mode === 'valid'
        ? this.signingKey
        : mode === 'other-key-known-kid'
          ? { ...this.otherKey, kid: this.signingKey.kid }
          : this.otherKey
    const header =
      mode === 'none'
        ? { alg: 'none', typ: 'JWT' }
        : mode === 'HS256'
          ? { alg: 'HS256', typ: 'JWT', kid: this.signingKey.kid }
          : {
              alg: 'RS256',
              typ: 'JWT',
              kid: mode === 'unknown-kid' ? 'synthetic-unknown-kid' : key.kid
            }
    const input = `${base64url(JSON.stringify(header))}.${base64url(
      JSON.stringify(claims)
    )}`
    const signature =
      mode === 'none'
        ? ''
        : mode === 'HS256'
          ? createHmac('sha256', this.clientSecret).update(input).digest()
          : signBytes('sha256', Buffer.from(input), key.privateKey)
    return `${input}.${base64url(signature)}`
  }

  /**
   * Serve the same handler over HTTPS on 127.0.0.1 with an ephemeral CA and
   * leaf certificate (SAN localhost, 127.0.0.1) generated by `openssl` in a
   * temporary directory removed on close. Without `openssl` this throws: the
   * test fails instead of skipping (D5).
   */
  async listenHttps(): Promise<SyntheticHttpsEndpoint> {
    const directory = mkdtempSync(join(tmpdir(), 'cvg-synthetic-idp-'))
    try {
      const file = (name: string) => join(directory, name)
      const openssl = (args: string[]) =>
        execFileSync('openssl', args, { stdio: 'pipe' })
      openssl([
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        file('ca.key'),
        '-out',
        file('ca.crt'),
        '-days',
        '1',
        '-subj',
        '/CN=CVG synthetic test CA',
        '-addext',
        'basicConstraints=critical,CA:TRUE',
        '-addext',
        'keyUsage=critical,keyCertSign,cRLSign'
      ])
      openssl([
        'req',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        file('leaf.key'),
        '-out',
        file('leaf.csr'),
        '-subj',
        '/CN=localhost'
      ])
      writeFileSync(
        file('leaf.ext'),
        [
          'subjectAltName=DNS:localhost,IP:127.0.0.1',
          'basicConstraints=CA:FALSE',
          'keyUsage=digitalSignature,keyEncipherment',
          'extendedKeyUsage=serverAuth'
        ].join('\n')
      )
      openssl([
        'x509',
        '-req',
        '-in',
        file('leaf.csr'),
        '-CA',
        file('ca.crt'),
        '-CAkey',
        file('ca.key'),
        '-CAcreateserial',
        '-out',
        file('leaf.crt'),
        '-days',
        '1',
        '-extfile',
        file('leaf.ext')
      ])
      const ca = readFileSync(file('ca.crt'))
      const server = createServer(
        {
          key: readFileSync(file('leaf.key')),
          cert: readFileSync(file('leaf.crt'))
        },
        (request, response) => {
          const chunks: Buffer[] = []
          request.on('data', (chunk: Buffer) => chunks.push(chunk))
          request.on('end', () => {
            if (this.controls.down) {
              request.socket.destroy()
              return
            }
            const target = new URL(request.url ?? '/', this.issuer)
            if (target.pathname === '/jwks' && this.controls.jwksDown) {
              this.calls.jwks += 1
              request.socket.destroy()
              return
            }
            const headers: Record<string, string> = {}
            for (const [name, value] of Object.entries(request.headers)) {
              if (typeof value === 'string') headers[name] = value
            }
            const result = this.handle(
              request.method ?? 'GET',
              target,
              headers,
              Buffer.concat(chunks).toString('utf8')
            )
            response.writeHead(result.status, result.headers)
            response.end(result.body)
          })
        }
      )
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve)
      )
      const port = (server.address() as AddressInfo).port
      this.issuer = `https://localhost:${port}`
      const caFile = file('ca.crt')
      const transport: SyntheticTransport = (url, init) =>
        new Promise((resolve, reject) => {
          const target = new URL(url)
          const outgoing = httpsRequest(
            {
              host: target.hostname,
              port: target.port,
              path: `${target.pathname}${target.search}`,
              method: init.method ?? 'GET',
              headers: init.headers ?? {},
              ca,
              ...(init.signal ? { signal: init.signal } : {})
            },
            (incoming) => {
              const chunks: Buffer[] = []
              incoming.on('data', (chunk: Buffer) => chunks.push(chunk))
              incoming.on('end', () => {
                const responseHeaders = new Headers()
                for (const [name, value] of Object.entries(incoming.headers)) {
                  if (typeof value === 'string')
                    responseHeaders.set(name, value)
                }
                const payload = Buffer.concat(chunks)
                resolve(
                  new Response(payload.length ? payload : null, {
                    status: incoming.statusCode ?? 500,
                    headers: responseHeaders
                  })
                )
              })
              incoming.on('error', reject)
            }
          )
          outgoing.on('error', reject)
          outgoing.end(
            typeof init.body === 'string'
              ? init.body
              : init.body instanceof URLSearchParams
                ? init.body.toString()
                : undefined
          )
        })
      let closed = false
      return {
        issuer: this.issuer,
        caFile,
        transport,
        close: async () => {
          if (closed) return
          closed = true
          server.closeAllConnections()
          await new Promise<void>((resolve) => server.close(() => resolve()))
          rmSync(directory, { recursive: true, force: true })
        }
      }
    } catch (error) {
      rmSync(directory, { recursive: true, force: true })
      throw error
    }
  }
}

export interface SyntheticHttpsEndpoint {
  readonly issuer: string
  /** Ephemeral CA certificate, for `NODE_EXTRA_CA_CERTS` of a child process. */
  readonly caFile: string
  /** `fetch`-shaped HTTPS transport that trusts only the ephemeral CA. */
  readonly transport: SyntheticTransport
  close(): Promise<void>
}

/** Synthetic in-memory OIDC state store with outage controls (tests only). */
export function createSyntheticStateStore() {
  const states = new Map<string, number>()
  const store = {
    unavailable: false,
    reserved: 0,
    consumed: 0,
    size: () => states.size,
    async reserve(digest: string, expiresAt: number): Promise<boolean> {
      if (store.unavailable) throw new Error('synthetic state store outage')
      if (states.has(digest)) return false
      states.set(digest, expiresAt)
      store.reserved += 1
      return true
    },
    async consume(digest: string): Promise<boolean> {
      if (store.unavailable) throw new Error('synthetic state store outage')
      const expiresAt = states.get(digest)
      states.delete(digest)
      if (expiresAt === undefined || expiresAt <= Date.now()) return false
      store.consumed += 1
      return true
    }
  }
  return store
}

/** Read all `Set-Cookie` values of an inject/fetch response. */
export function setCookies(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String)
  return typeof value === 'string' ? [value] : []
}

export function cookiePair(setCookie: string): string {
  return setCookie.split(';')[0]!
}

export const SYNTHETIC_TENANT_A = 'tenant_0254aaaa-0000-4000-8000-00000000000a'
export const SYNTHETIC_TENANT_B = 'tenant_0254bbbb-0000-4000-8000-00000000000b'

/** §7 fixture matrix: one group per role of tenant A, a disabled one, B. */
export function syntheticGroupMatrix(version = 1) {
  return {
    version,
    claim: 'synthetic_groups',
    entries: [
      {
        group: 'synthetic-a-operator',
        tenantId: SYNTHETIC_TENANT_A,
        role: 'Operator',
        active: true
      },
      {
        group: 'synthetic-a-approver',
        tenantId: SYNTHETIC_TENANT_A,
        role: 'Approver',
        active: true
      },
      {
        group: 'synthetic-a-supervisor',
        tenantId: SYNTHETIC_TENANT_A,
        role: 'Supervisor',
        active: true
      },
      {
        group: 'synthetic-a-disabled',
        tenantId: SYNTHETIC_TENANT_A,
        role: 'Operator',
        active: false
      },
      {
        group: 'synthetic-b-operator',
        tenantId: SYNTHETIC_TENANT_B,
        role: 'Operator',
        active: true
      }
    ]
  }
}

export const SYNTHETIC_MFA_POLICY = {
  version: 'synthetic-mfa-v1',
  requiredAmr: ['pwd', 'otp']
}

/** Fresh client secret and pending-cookie key for one test run. */
export function syntheticClientMaterial() {
  return {
    clientSecret: randomBytes(32).toString('base64url'),
    pendingCookieKey: randomBytes(32).toString('base64url')
  }
}

/** OIDC part of the environment for one synthetic configuration. */
export function syntheticOidcEnv(input: {
  issuer: string
  clientId?: string
  clientSecret: string
  pendingCookieKey: string
  redirectUri: string
  consoleOrigin: string
  matrix?: unknown
  mfaPolicy?: unknown
}): NodeJS.ProcessEnv {
  return {
    CVG_OPERATOR_LOGIN: 'oidc',
    CVG_OIDC_ISSUER: input.issuer,
    CVG_OIDC_CLIENT_ID: input.clientId ?? 'cvg-synthetic-console',
    CVG_OIDC_CLIENT_SECRET: input.clientSecret,
    CVG_OIDC_REDIRECT_URI: input.redirectUri,
    CVG_OPERATOR_CONSOLE_ORIGIN: input.consoleOrigin,
    CVG_OIDC_PENDING_COOKIE_KEY: input.pendingCookieKey,
    CVG_OIDC_MFA_POLICY: JSON.stringify(
      input.mfaPolicy ?? SYNTHETIC_MFA_POLICY
    ),
    CVG_OIDC_GROUP_MATRIX: JSON.stringify(
      input.matrix ?? syntheticGroupMatrix()
    )
  }
}

/** Expected operator identifier for a synthetic subject (§4.4). */
export function expectedOperatorId(issuer: string, sub: string): string {
  return `oidc_${createHash('sha256')
    .update(JSON.stringify([issuer, sub]))
    .digest('hex')}`
}

/** O11: no sensitive value of `secrets` occurs in any collected text. */
export function findLeaks(
  texts: Iterable<string>,
  secrets: Iterable<string>
): string[] {
  const leaks: string[] = []
  const corpus = [...texts]
  for (const secret of secrets) {
    if (!secret || secret.length < 6) continue
    if (corpus.some((text) => text.includes(secret))) leaks.push(secret)
  }
  return leaks
}
