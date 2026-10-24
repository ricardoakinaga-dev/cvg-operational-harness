/**
 * SPEC0254 §4.2 — OIDC authority over `openid-client` (P1), public API only:
 * `discovery` with `ClientSecretBasic`, `id_token_signed_response_alg: RS256`,
 * `enableNonRepudiationChecks` (the ID token signature is verified against
 * the issuer JWKS), a 5 s timeout and a transport wrapper; then
 * `authorizationCodeGrant` with PKCE, nonce, state, an expected ID token and
 * `maxAge: 300`. Plain-HTTP requests are never enabled (O12).
 *
 * The transport wrapper (D12) marks an operation as unavailable per call
 * (AsyncLocalStorage, R2-O2) on a network/TLS/timeout error or an HTTP
 * status >= 500 or 429 (R2-O7); the callback answers 503 for those and 401
 * for every other library error.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import * as oidc from 'openid-client'
import type { OidcLoginConfig } from './oidc-config.ts'
import type { OidcIdentityPolicy } from './oidc-identity.ts'
import type { OperatorCookieProfile } from './operator-session.ts'
import {
  clearOidcLoginCookie,
  readOidcLoginCallback,
  startOidcLogin,
  type OidcLoginStateStore,
  type OidcLoginTransactionOptions,
  type PendingOidcLogin,
  type StartedOidcLogin
} from './oidc-login-transaction.ts'

const TIMEOUT_SECONDS = 5
const MAX_AUTHENTICATION_AGE_SECONDS = 300

/** `fetch`-shaped transport; injected only with NODE_ENV=test. */
export type OidcTransport = (
  url: string,
  init: oidc.CustomFetchOptions
) => Promise<Response>

export class OidcIdpUnavailableError extends Error {
  constructor() {
    super('OIDC identity provider is unavailable')
    this.name = 'OidcIdpUnavailableError'
  }
}

export class OidcTokenRejectedError extends Error {
  constructor() {
    super('OIDC token response was rejected')
    this.name = 'OidcTokenRejectedError'
  }
}

export interface OidcOperatorAuthority {
  readonly issuer: string
  readonly identityPolicy: OidcIdentityPolicy
  /** SPEC0259 §4.3: the profile of the pending cookie this authority writes. */
  readonly cookieProfile: OperatorCookieProfile
  start(input: {
    stateStore: OidcLoginStateStore
    previousSessionId?: string
  }): Promise<StartedOidcLogin>
  /** Validates the pending cookie and the state, then consumes the state. */
  readCallback(input: {
    cookieHeader: unknown
    state: string
    stateStore: OidcLoginStateStore
  }): Promise<PendingOidcLogin>
  /** Exchanges the code; returns the claims of the verified ID token. */
  complete(input: {
    code: string
    state: string
    pending: PendingOidcLogin
  }): Promise<Record<string, unknown>>
  clearPendingCookie(): string
}

const inertStateStore: OidcLoginStateStore = {
  reserve: async () => false,
  consume: async () => false
}

function discoveryInvalid(): Error {
  return new Error('OIDC discovery metadata is invalid')
}

/** §4.2 boot refusals, beyond what the library checks. */
function assertDiscoveryMetadata(
  issuer: string,
  metadata: oidc.ServerMetadata
): void {
  // Byte-exact: the library compares only normalized URLs (M19).
  if (metadata.issuer !== issuer) throw discoveryInvalid()
  const origin = new URL(issuer).origin
  for (const endpoint of [
    metadata.authorization_endpoint,
    metadata.token_endpoint,
    metadata.jwks_uri
  ]) {
    let url: URL
    try {
      url = new URL(String(endpoint))
    } catch {
      throw discoveryInvalid()
    }
    if (
      typeof endpoint !== 'string' ||
      url.protocol !== 'https:' ||
      url.origin !== origin
    ) {
      throw discoveryInvalid()
    }
  }
  const includes = (values: unknown, expected: string) =>
    Array.isArray(values) && values.includes(expected)
  if (
    !includes(metadata.response_types_supported, 'code') ||
    !includes(metadata.code_challenge_methods_supported, 'S256') ||
    !includes(
      metadata.token_endpoint_auth_methods_supported,
      'client_secret_basic'
    ) ||
    !includes(metadata.id_token_signing_alg_values_supported, 'RS256')
  ) {
    throw discoveryInvalid()
  }
}

/** Discovery at boot (before listen). Any failure refuses the boot (I11). */
export async function discoverOidcOperatorAuthority(
  config: OidcLoginConfig,
  options: { transport?: OidcTransport } = {}
): Promise<OidcOperatorAuthority> {
  if (options.transport !== undefined && process.env.NODE_ENV !== 'test') {
    throw new Error('An injected OIDC transport requires NODE_ENV=test')
  }
  const marks = new AsyncLocalStorage<{ unavailable: boolean }>()
  const base: OidcTransport =
    options.transport ?? ((url, init) => fetch(url, init as RequestInit))
  const transport: oidc.CustomFetch = async (url, init) => {
    const mark = marks.getStore()
    const signal = init.signal
    try {
      const response = await (signal
        ? Promise.race([
            base(url, init),
            new Promise<never>((_resolve, reject) => {
              if (signal.aborted) reject(signal.reason)
              signal.addEventListener('abort', () => reject(signal.reason), {
                once: true
              })
            })
          ])
        : base(url, init))
      if (mark && (response.status >= 500 || response.status === 429)) {
        mark.unavailable = true
      }
      return response
    } catch (error) {
      if (mark) mark.unavailable = true
      throw error
    }
  }

  let configuration: oidc.Configuration
  try {
    configuration = await oidc.discovery(
      new URL(config.issuer),
      config.clientId,
      { id_token_signed_response_alg: 'RS256' },
      oidc.ClientSecretBasic(config.clientSecret),
      {
        [oidc.customFetch]: transport,
        execute: [oidc.enableNonRepudiationChecks],
        timeout: TIMEOUT_SECONDS
      }
    )
  } catch {
    throw new Error('OIDC discovery failed')
  }
  const metadata = configuration.serverMetadata()
  assertDiscoveryMetadata(config.issuer, metadata)
  configuration.timeout = TIMEOUT_SECONDS

  const transaction = (
    stateStore: OidcLoginStateStore
  ): OidcLoginTransactionOptions => ({
    issuer: config.issuer,
    authorizationEndpoint: metadata.authorization_endpoint!,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    cookieKey: config.pendingCookieKey,
    stateStore,
    cookieProfile: config.cookieProfile
  })
  const clearPending = clearOidcLoginCookie(transaction(inertStateStore))

  return {
    issuer: config.issuer,
    cookieProfile: config.cookieProfile,
    identityPolicy: {
      issuer: config.issuer,
      clientId: config.clientId,
      requiredAmr: config.mfaPolicy.requiredAmr,
      matrix: config.groupMatrix
    },
    start: ({ stateStore, previousSessionId }) =>
      startOidcLogin(
        transaction(stateStore),
        previousSessionId !== undefined ? { previousSessionId } : {}
      ),
    readCallback: ({ cookieHeader, state, stateStore }) =>
      readOidcLoginCallback(cookieHeader, state, transaction(stateStore)),
    complete: async ({ code, state, pending }) => {
      const callback = new URL(config.redirectUri)
      callback.searchParams.set('code', code)
      callback.searchParams.set('state', state)
      const mark = { unavailable: false }
      try {
        const tokens = await marks.run(mark, () =>
          oidc.authorizationCodeGrant(configuration, callback, {
            pkceCodeVerifier: pending.codeVerifier,
            expectedNonce: pending.nonce,
            expectedState: state,
            idTokenExpected: true,
            maxAge: MAX_AUTHENTICATION_AGE_SECONDS
          })
        )
        const claims = tokens.claims()
        if (!claims) throw new Error('ID token is missing')
        return claims as unknown as Record<string, unknown>
      } catch {
        if (mark.unavailable) throw new OidcIdpUnavailableError()
        throw new OidcTokenRejectedError()
      }
    },
    clearPendingCookie: () => clearPending
  }
}
