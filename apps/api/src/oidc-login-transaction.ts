import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual
} from 'node:crypto'

const COOKIE_NAME = 'cvg_oidc_pending'
const LOGIN_AGE_MS = 5 * 60 * 1_000
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const SEALED_PATTERN = /^[A-Za-z0-9_-]{100,2048}$/

export interface OidcLoginTransactionOptions {
  issuer: string
  authorizationEndpoint: string
  clientId: string
  redirectUri: string
  /** A deployment-shared, secret 32-byte key. Keep it outside source control. */
  cookieKey: Buffer
  /** Reserve once and atomically consume across all API replicas. */
  stateStore: OidcLoginStateStore
  now?: () => number
}

export interface OidcLoginStateStore {
  reserve(stateDigest: string, expiresAt: number): Promise<boolean>
  consume(stateDigest: string): Promise<boolean>
}

export interface StartedOidcLogin {
  authorizationUrl: string
  setCookie: string
}

export interface PendingOidcLogin {
  nonce: string
  codeVerifier: string
}

interface LoginPayload extends PendingOidcLogin {
  state: string
  issuedAt: number
}

/**
 * Create the browser redirect for Authorization Code + PKCE. The encrypted
 * callback cookie is shared across replicas when they use the same key.
 * The eventual callback must exchange the code exactly once at the IdP.
 */
export async function startOidcLogin(
  options: OidcLoginTransactionOptions
): Promise<StartedOidcLogin> {
  const { authorizationEndpoint, redirectUri } = validateOptions(options)
  const payload: LoginPayload = {
    state: randomToken(),
    nonce: randomToken(),
    codeVerifier: randomToken(),
    issuedAt: (options.now ?? Date.now)()
  }
  if (!Number.isSafeInteger(payload.issuedAt) || payload.issuedAt <= 0) {
    throw new Error('OIDC login clock is invalid')
  }

  const challenge = createHash('sha256')
    .update(payload.codeVerifier, 'ascii')
    .digest('base64url')
  authorizationEndpoint.searchParams.set('response_type', 'code')
  authorizationEndpoint.searchParams.set('response_mode', 'query')
  authorizationEndpoint.searchParams.set('scope', 'openid')
  authorizationEndpoint.searchParams.set('client_id', options.clientId)
  authorizationEndpoint.searchParams.set('redirect_uri', redirectUri.href)
  authorizationEndpoint.searchParams.set('state', payload.state)
  authorizationEndpoint.searchParams.set('nonce', payload.nonce)
  authorizationEndpoint.searchParams.set('code_challenge', challenge)
  authorizationEndpoint.searchParams.set('code_challenge_method', 'S256')
  authorizationEndpoint.searchParams.set('max_age', '300')

  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', options.cookieKey, iv)
  cipher.setAAD(binding(options))
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final()
  ])
  const sealed = Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    'base64url'
  )
  if (
    !(await options.stateStore.reserve(
      stateDigest(payload.state),
      payload.issuedAt + LOGIN_AGE_MS
    ))
  ) {
    throw new Error('OIDC login state could not be reserved')
  }
  return {
    authorizationUrl: authorizationEndpoint.href,
    setCookie: cookieHeader(sealed, redirectUri.protocol === 'https:', 300)
  }
}

/** Validate the callback state before passing the authorization code to the IdP. */
export async function readOidcLoginCallback(
  cookieHeaderValue: unknown,
  returnedState: unknown,
  options: OidcLoginTransactionOptions
): Promise<PendingOidcLogin> {
  validateOptions(options)
  const sealed = readCookie(cookieHeaderValue)
  if (
    !sealed ||
    typeof returnedState !== 'string' ||
    !TOKEN_PATTERN.test(returnedState)
  ) {
    throw new Error('OIDC login transaction is invalid')
  }
  try {
    const bytes = Buffer.from(sealed, 'base64url')
    if (bytes.length < 12 + 16 + 1 || bytes.toString('base64url') !== sealed) {
      throw new Error('noncanonical cookie')
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      options.cookieKey,
      bytes.subarray(0, 12)
    )
    decipher.setAAD(binding(options))
    decipher.setAuthTag(bytes.subarray(12, 28))
    const payload = JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final()
      ]).toString('utf8')
    ) as Partial<LoginPayload>
    const now = (options.now ?? Date.now)()
    if (
      !TOKEN_PATTERN.test(payload.state ?? '') ||
      !TOKEN_PATTERN.test(payload.nonce ?? '') ||
      !TOKEN_PATTERN.test(payload.codeVerifier ?? '') ||
      !Number.isSafeInteger(payload.issuedAt) ||
      !Number.isSafeInteger(now) ||
      (payload.issuedAt ?? 0) > now ||
      now - (payload.issuedAt ?? 0) >= LOGIN_AGE_MS ||
      !timingSafeEqual(
        Buffer.from(payload.state ?? '', 'ascii'),
        Buffer.from(returnedState, 'ascii')
      )
    ) {
      throw new Error('invalid payload')
    }
    if (!(await options.stateStore.consume(stateDigest(returnedState)))) {
      throw new Error('state already consumed')
    }
    return { nonce: payload.nonce!, codeVerifier: payload.codeVerifier! }
  } catch {
    throw new Error('OIDC login transaction is invalid')
  }
}

export function clearOidcLoginCookie(
  options: OidcLoginTransactionOptions
): string {
  const { redirectUri } = validateOptions(options)
  return cookieHeader('', redirectUri.protocol === 'https:', 0)
}

function validateOptions(options: OidcLoginTransactionOptions): {
  authorizationEndpoint: URL
  redirectUri: URL
} {
  if (
    !Buffer.isBuffer(options.cookieKey) ||
    options.cookieKey.length !== 32 ||
    typeof options.stateStore?.reserve !== 'function' ||
    typeof options.stateStore?.consume !== 'function' ||
    !options.clientId ||
    options.clientId.length > 256
  ) {
    throw new Error('OIDC login configuration is invalid')
  }
  const issuer = parseTrustedUrl(options.issuer)
  const authorizationEndpoint = parseTrustedUrl(options.authorizationEndpoint)
  const redirectUri = parseTrustedUrl(options.redirectUri)
  if (
    issuer.origin !== authorizationEndpoint.origin ||
    authorizationEndpoint.search ||
    redirectUri.search ||
    !redirectUri.pathname.endsWith('/callback')
  ) {
    throw new Error('OIDC login configuration is invalid')
  }
  return { authorizationEndpoint, redirectUri }
}

function parseTrustedUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('OIDC login configuration is invalid')
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost'
  if (
    (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error('OIDC login configuration is invalid')
  }
  return url
}

function binding(options: OidcLoginTransactionOptions): Buffer {
  return Buffer.from(
    JSON.stringify([options.issuer, options.clientId, options.redirectUri]),
    'utf8'
  )
}

function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

function stateDigest(state: string): string {
  return createHash('sha256').update(state, 'ascii').digest('hex')
}

function readCookie(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 8192) return null
  let found: string | null = null
  for (const segment of value.split(';')) {
    const [name, ...rest] = segment.trim().split('=')
    if (name !== COOKIE_NAME) continue
    const candidate = rest.join('=')
    if (found !== null || !SEALED_PATTERN.test(candidate)) return null
    found = candidate
  }
  return found
}

function cookieHeader(value: string, secure: boolean, maxAge: number): string {
  return [
    `${COOKIE_NAME}=${value}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    ...(maxAge === 0 ? ['Expires=Thu, 01 Jan 1970 00:00:00 GMT'] : []),
    ...(secure ? ['Secure'] : [])
  ].join('; ')
}
