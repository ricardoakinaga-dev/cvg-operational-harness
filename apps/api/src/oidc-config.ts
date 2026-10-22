/**
 * SPEC0254 §4.1 — OIDC operator login configuration.
 *
 * Validated without I/O, before any pool, listener or poller. Error messages
 * name the variable, never its value. In this slice the OIDC login exists
 * only with NODE_ENV=test (synthetic IdP); production and development refuse
 * it at boot.
 */
import { createHash } from 'node:crypto'
import { canonicalizeJson } from '@cvg/harness-contracts'
import { TenantIdSchema, type TenantId } from '@cvg/platform'
import { normalizeOrigin, parseAllowedOrigins } from './http-security.ts'

export const OPERATOR_LOGIN_ENV = 'CVG_OPERATOR_LOGIN'
export const OIDC_CALLBACK_PATH = '/v1/auth/oidc/callback'
/** `oidc-v<N>-<sha256 hex>`; the order between versions is the order of N. */
export const OIDC_AUTHORITY_VERSION_PATTERN =
  /^oidc-v([1-9][0-9]{0,8})-([0-9a-f]{64})$/

const ROLES = ['Operator', 'Approver', 'Supervisor', 'Admin'] as const
const RESERVED_CLAIMS = new Set([
  'iss',
  'sub',
  'aud',
  'exp',
  'iat',
  'nbf',
  'auth_time',
  'nonce',
  'acr',
  'amr',
  'azp',
  '__proto__',
  'constructor',
  'prototype'
])
const PLACEHOLDER = /replace[_-]?me|change[_-]?me|example/i
// Same loopback hosts as the login transaction (`oidc-login-transaction.ts`).
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost'])

export type OidcMatrixRole = (typeof ROLES)[number]

export interface OidcMfaPolicy {
  readonly version: string
  readonly requiredAmr: readonly string[]
}

export interface OidcGroupMatrixEntry {
  readonly group: string
  readonly tenantId: TenantId
  readonly role: OidcMatrixRole
  readonly active: boolean
}

export interface OidcGroupMatrix {
  readonly version: number
  readonly claim: string
  readonly entries: readonly OidcGroupMatrixEntry[]
}

export interface OidcLoginConfig {
  readonly kind: 'oidc'
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly redirectUri: string
  readonly consoleOrigin: string
  readonly pendingCookieKey: Buffer
  readonly mfaPolicy: OidcMfaPolicy
  readonly groupMatrix: OidcGroupMatrix
  readonly authorityVersion: string
}

function invalid(name: string): Error {
  return new Error(`${name} is invalid for OIDC login`)
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]
  if (value === undefined || value.trim() === '') {
    throw new Error(`${name} is required for OIDC login`)
  }
  return value
}

function isLoopback(url: URL): boolean {
  return LOOPBACK_HOSTS.has(url.hostname)
}

function parseUrl(name: string, value: string): URL {
  if (value !== value.trim() || value.includes('?') || value.includes('#')) {
    throw invalid(name)
  }
  try {
    const url = new URL(value)
    if (url.username || url.password || url.search || url.hash) {
      throw new Error()
    }
    return url
  } catch {
    throw invalid(name)
  }
}

function databaseRole(name: string, value: string): string {
  try {
    const url = new URL(value)
    if (
      !['postgres:', 'postgresql:'].includes(url.protocol) ||
      !url.username ||
      url.searchParams.has('user')
    ) {
      throw new Error()
    }
    return decodeURIComponent(url.username)
  } catch {
    throw invalid(name)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function hasExactKeys(
  value: unknown,
  keys: readonly string[]
): value is Record<string, unknown> {
  if (!isRecord(value)) return false
  const own = Object.keys(value).sort()
  return (
    own.length === keys.length &&
    [...keys].sort().every((key, index) => own[index] === key)
  )
}

function parseJson(name: string, value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw invalid(name)
  }
}

function parseMfaPolicy(value: string): OidcMfaPolicy {
  const name = 'CVG_OIDC_MFA_POLICY'
  const policy = parseJson(name, value)
  if (
    !hasExactKeys(policy, ['version', 'requiredAmr']) ||
    typeof policy.version !== 'string' ||
    !/^[A-Za-z0-9._-]{1,64}$/.test(policy.version) ||
    !Array.isArray(policy.requiredAmr) ||
    policy.requiredAmr.length < 1 ||
    policy.requiredAmr.length > 8 ||
    !policy.requiredAmr.every(
      (amr) => typeof amr === 'string' && /^[a-z0-9_-]{1,32}$/.test(amr)
    ) ||
    new Set(policy.requiredAmr).size !== policy.requiredAmr.length
  ) {
    throw invalid(name)
  }
  return {
    version: policy.version,
    requiredAmr: [...(policy.requiredAmr as string[])]
  }
}

function parseGroupMatrix(value: string): OidcGroupMatrix {
  const name = 'CVG_OIDC_GROUP_MATRIX'
  const matrix = parseJson(name, value)
  if (
    !hasExactKeys(matrix, ['version', 'claim', 'entries']) ||
    typeof matrix.version !== 'number' ||
    !Number.isInteger(matrix.version) ||
    matrix.version < 1 ||
    matrix.version > 999_999_999 ||
    typeof matrix.claim !== 'string' ||
    !/^[A-Za-z0-9_.:-]{1,64}$/.test(matrix.claim) ||
    RESERVED_CLAIMS.has(matrix.claim) ||
    !Array.isArray(matrix.entries) ||
    matrix.entries.length < 1 ||
    matrix.entries.length > 256
  ) {
    throw invalid(name)
  }
  const groups = new Set<string>()
  const entries = matrix.entries.map((entry: unknown) => {
    if (
      !hasExactKeys(entry, ['group', 'tenantId', 'role', 'active']) ||
      typeof entry.group !== 'string' ||
      entry.group.length < 1 ||
      entry.group.length > 256 ||
      groups.has(entry.group) ||
      !TenantIdSchema.safeParse(entry.tenantId).success ||
      !ROLES.includes(entry.role as OidcMatrixRole) ||
      typeof entry.active !== 'boolean'
    ) {
      throw invalid(name)
    }
    groups.add(entry.group)
    return {
      group: entry.group,
      tenantId: entry.tenantId as TenantId,
      role: entry.role as OidcMatrixRole,
      active: entry.active
    }
  })
  return { version: matrix.version, claim: matrix.claim, entries }
}

/**
 * `oidc-v<N>-<D>`: N orders versions (P5); D detects an edit made without a
 * higher N. Neither the secret, the redirect, the console nor the order of
 * the matrix entries or of the required amr values changes D.
 */
export function computeOidcAuthorityVersion(input: {
  issuer: string
  clientId: string
  mfaPolicy: OidcMfaPolicy
  groupMatrix: OidcGroupMatrix
}): string {
  const byCodeUnit = (left: string, right: string) =>
    left < right ? -1 : left > right ? 1 : 0
  const digest = createHash('sha256')
    .update(
      canonicalizeJson({
        issuer: input.issuer,
        clientId: input.clientId,
        mfaPolicy: {
          version: input.mfaPolicy.version,
          requiredAmr: [...input.mfaPolicy.requiredAmr].sort(byCodeUnit)
        },
        groupMatrix: {
          version: input.groupMatrix.version,
          claim: input.groupMatrix.claim,
          entries: [...input.groupMatrix.entries]
            .sort((left, right) => byCodeUnit(left.group, right.group))
            .map((entry) => ({ ...entry }))
        }
      }),
      'utf8'
    )
    .digest('hex')
  return `oidc-v${input.groupMatrix.version}-${digest}`
}

export function parseOidcAuthorityVersion(
  value: string
): { readonly n: number; readonly digest: string } | null {
  const match = OIDC_AUTHORITY_VERSION_PATTERN.exec(value)
  return match ? { n: Number(match[1]), digest: match[2]! } : null
}

/**
 * `null` without the OIDC mode. Throws (without echoing values) on a partial,
 * invalid or unqualified configuration.
 */
export function parseOperatorLoginConfig(
  env: NodeJS.ProcessEnv
): OidcLoginConfig | null {
  const mode = env[OPERATOR_LOGIN_ENV]
  if (mode === undefined || mode === '') {
    const partial = Object.keys(env).some(
      (key) =>
        (key.startsWith('CVG_OIDC_') ||
          key === 'CVG_OPERATOR_CONSOLE_ORIGIN') &&
        env[key] !== undefined
    )
    if (partial) {
      throw new Error(
        'OIDC operator login configuration is partial: set CVG_OPERATOR_LOGIN=oidc or remove the CVG_OIDC_* variables'
      )
    }
    return null
  }
  if (mode !== 'oidc') {
    throw new Error('CVG_OPERATOR_LOGIN must be empty or oidc')
  }
  if (env.NODE_ENV !== 'test') {
    throw new Error('OIDC login is not qualified for this environment')
  }
  if (env.CVG_IDENTITY_MODE?.trim() !== 'trusted') {
    throw new Error('CVG_IDENTITY_MODE must be trusted for OIDC login')
  }
  if (env.API_PERSISTENCE_MODE !== 'postgres') {
    throw new Error('API_PERSISTENCE_MODE must be postgres for OIDC login')
  }
  if (env.POSTGRES_RLS_ENFORCEMENT !== 'true') {
    throw new Error('POSTGRES_RLS_ENFORCEMENT must be true for OIDC login')
  }
  if (env.CVG_OPERATOR_IDENTITY_KEYRING?.trim()) {
    throw new Error(
      'CVG_OPERATOR_IDENTITY_KEYRING must be absent for OIDC login'
    )
  }
  if (
    Object.keys(env).some(
      (key) => key.startsWith('CVG_LOCAL_OIDC_') && env[key] !== undefined
    )
  ) {
    throw new Error('CVG_LOCAL_OIDC_* must be absent for OIDC login')
  }
  required(env, 'CVG_OPERATOR_SESSION_DATABASE_URL')
  required(env, 'CVG_OPERATOR_AUTH_SCHEMA')
  const sessionRole = required(env, 'CVG_OPERATOR_SESSION_ROLE').trim()
  const runtimeRole = databaseRole(
    'DATABASE_URL',
    required(env, 'DATABASE_URL')
  )
  const migrationRole = databaseRole(
    'DATABASE_MIGRATION_URL',
    required(env, 'DATABASE_MIGRATION_URL')
  )
  if (migrationRole === runtimeRole || migrationRole === sessionRole) {
    throw new Error(
      'DATABASE_MIGRATION_URL must use a role distinct from the runtime and session roles'
    )
  }

  const issuer = required(env, 'CVG_OIDC_ISSUER')
  const issuerUrl = parseUrl('CVG_OIDC_ISSUER', issuer)
  if (issuerUrl.protocol !== 'https:') throw invalid('CVG_OIDC_ISSUER')

  const clientId = required(env, 'CVG_OIDC_CLIENT_ID')
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(clientId)) {
    throw invalid('CVG_OIDC_CLIENT_ID')
  }

  const clientSecret = required(env, 'CVG_OIDC_CLIENT_SECRET')
  if (clientSecret.length < 32 || PLACEHOLDER.test(clientSecret)) {
    throw invalid('CVG_OIDC_CLIENT_SECRET')
  }

  const redirectUri = required(env, 'CVG_OIDC_REDIRECT_URI')
  const redirect = parseUrl('CVG_OIDC_REDIRECT_URI', redirectUri)
  if (
    redirect.pathname !== OIDC_CALLBACK_PATH ||
    !(
      redirect.protocol === 'https:' ||
      (redirect.protocol === 'http:' && isLoopback(redirect))
    )
  ) {
    throw invalid('CVG_OIDC_REDIRECT_URI')
  }

  let consoleOrigin: string
  try {
    consoleOrigin = normalizeOrigin(
      required(env, 'CVG_OPERATOR_CONSOLE_ORIGIN')
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('required')) {
      throw error
    }
    throw invalid('CVG_OPERATOR_CONSOLE_ORIGIN')
  }
  let allowed: string[]
  try {
    allowed = parseAllowedOrigins(env.API_ALLOWED_ORIGINS)
  } catch {
    allowed = []
  }
  if (!allowed.includes(consoleOrigin) || consoleOrigin === issuerUrl.origin) {
    throw invalid('CVG_OPERATOR_CONSOLE_ORIGIN')
  }

  const rawKey = required(env, 'CVG_OIDC_PENDING_COOKIE_KEY')
  const pendingCookieKey = Buffer.from(rawKey, 'base64url')
  if (
    !/^[A-Za-z0-9_-]{43}$/.test(rawKey) ||
    pendingCookieKey.length !== 32 ||
    pendingCookieKey.toString('base64url') !== rawKey
  ) {
    throw invalid('CVG_OIDC_PENDING_COOKIE_KEY')
  }

  const mfaPolicy = parseMfaPolicy(required(env, 'CVG_OIDC_MFA_POLICY'))
  const groupMatrix = parseGroupMatrix(required(env, 'CVG_OIDC_GROUP_MATRIX'))

  return {
    kind: 'oidc',
    issuer,
    clientId,
    clientSecret,
    redirectUri,
    consoleOrigin,
    pendingCookieKey,
    mfaPolicy,
    groupMatrix,
    authorityVersion: computeOidcAuthorityVersion({
      issuer,
      clientId,
      mfaPolicy,
      groupMatrix
    })
  }
}
