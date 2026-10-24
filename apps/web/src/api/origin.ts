/**
 * SPEC0259 §4.6–§4.8 — console build profile, single transport and login
 * landing. Pure functions without compile-time constants, so the build
 * configuration (`vite.config.mts`) and the tests import them directly.
 */

export type ConsoleLoginProfile =
  | { readonly kind: 'current' }
  | {
      readonly kind: 'oidc'
      readonly consoleOrigin: string
      readonly apiOrigin: string
    }

/** Values compiled into `__CVG_OPERATOR_LOGIN__` and the two origins. */
export interface ConsoleBuildProfile {
  readonly login: '' | 'oidc'
  readonly consoleOrigin: string
  readonly apiOrigin: string
}

export type LoginLanding = 'negado' | 'indisponivel'

const LOGIN_FRAGMENTS: Readonly<Record<string, LoginLanding>> = {
  '#cvg-login=negado': 'negado',
  '#cvg-login=indisponivel': 'indisponivel'
}

// C0 controls and DEL: `new URL` silently drops TAB and LF (SPEC0259 §4.7).
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

function present(value: string | undefined): value is string {
  return value !== undefined && value !== ''
}

/** An exact `https:` origin: no user, password, path, query or fragment. */
export function isExactHttpsOrigin(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.origin === value
  } catch {
    return false
  }
}

/**
 * §4.6 — validates the build environment. The current profile (empty login)
 * keeps the relative transport and refuses any origin ("perfil parcial");
 * the OIDC profile needs the trusted identity mode, no controlled test, a
 * NODE_ENV other than `test` and two exact `https:` origins on distinct
 * hosts. Every refusal throws, so the build produces no artifact.
 */
export function resolveConsoleBuildProfile(
  env: Readonly<Record<string, string | undefined>>
): ConsoleBuildProfile {
  const login = env.VITE_CVG_OPERATOR_LOGIN
  const consoleOrigin = env.VITE_CVG_CONSOLE_ORIGIN
  const apiOrigin = env.VITE_CVG_API_ORIGIN
  if (!present(login)) {
    if (present(consoleOrigin) || present(apiOrigin)) {
      throw new Error(
        'Console build profile is partial (perfil parcial): set VITE_CVG_OPERATOR_LOGIN=oidc or remove VITE_CVG_CONSOLE_ORIGIN and VITE_CVG_API_ORIGIN'
      )
    }
    return { login: '', consoleOrigin: '', apiOrigin: '' }
  }
  if (login !== 'oidc') {
    throw new Error('VITE_CVG_OPERATOR_LOGIN must be empty or oidc')
  }
  if (env.VITE_CVG_WEB_IDENTITY_MODE !== 'trusted') {
    throw new Error(
      'The OIDC console requires VITE_CVG_WEB_IDENTITY_MODE=trusted'
    )
  }
  if (env.VITE_CVG_CONTROLLED_TEST === 'true') {
    throw new Error('The OIDC console refuses VITE_CVG_CONTROLLED_TEST=true')
  }
  if (env.NODE_ENV === 'test') {
    throw new Error('The OIDC console refuses NODE_ENV=test')
  }
  if (!present(consoleOrigin) || !isExactHttpsOrigin(consoleOrigin)) {
    throw new Error('VITE_CVG_CONSOLE_ORIGIN must be an exact https: origin')
  }
  if (!present(apiOrigin) || !isExactHttpsOrigin(apiOrigin)) {
    throw new Error('VITE_CVG_API_ORIGIN must be an exact https: origin')
  }
  if (new URL(consoleOrigin).hostname === new URL(apiOrigin).hostname) {
    throw new Error('The console and the API must be on distinct hosts')
  }
  return { login: 'oidc', consoleOrigin, apiOrigin }
}

/**
 * §4.7 — the single URL function of every console call. The current profile
 * returns the path unchanged; the OIDC profile accepts only `/v1/` paths that
 * stay under `/v1/` of the compiled API origin after normalization. Any
 * violation is a programming error raised before a request exists.
 */
export function resolveApiUrl(
  profile: ConsoleLoginProfile,
  path: string
): string {
  if (profile.kind !== 'oidc') return path
  if (
    typeof path !== 'string' ||
    !path.startsWith('/v1/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    CONTROL_CHARACTERS.test(path)
  ) {
    throw new Error('Console API path is invalid')
  }
  const url = new URL(path, profile.apiOrigin)
  if (url.origin !== profile.apiOrigin || !url.pathname.startsWith('/v1/')) {
    throw new Error('Console API path is invalid')
  }
  return url.href
}

export function createApiUrl(
  profile: ConsoleLoginProfile
): (path: string) => string {
  return (path) => resolveApiUrl(profile, path)
}

/** §4.8 / PB13 — only an `https:` URL without user or password navigates. */
export function parseAuthorizationUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  return url.href
}

/** §4.8 — exactly one of the two landing fragments, or nothing. */
export function readLoginFragment(hash: string): LoginLanding | null {
  return Object.prototype.hasOwnProperty.call(LOGIN_FRAGMENTS, hash)
    ? LOGIN_FRAGMENTS[hash]!
    : null
}
