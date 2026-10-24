import {
  apiClient,
  type OperatorIdentity,
  type OperatorSessionView
} from '../api/client.ts'

export type WebIdentityMode = 'trusted' | 'simulation'

export type WebSessionStatus =
  | 'loading'
  | 'authenticated'
  | 'authentication_required'
  | 'expired'
  | 'reauthenticating'
  | 'unavailable'
  /** SPEC0259 §4.8: OIDC profile only; no action is offered. */
  | 'configuration_error'

export interface TrustedWebSession extends OperatorSessionView {
  identity: OperatorIdentity
}

export type BootstrapTokenProvider =
  | (() => string | null | Promise<string | null>)
  | undefined

export interface SessionBootstrap {
  load(): Promise<TrustedWebSession>
  logout(): Promise<void>
}

interface RuntimeBootstrapWindow {
  __CVG_OPERATOR_BOOTSTRAP_TOKEN__?: string
  __CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__?: () =>
    | string
    | null
    | Promise<string | null>
}

export function getDefaultWebIdentityMode(): WebIdentityMode {
  const configured = __CVG_WEB_IDENTITY_MODE__.trim()
  const controlledTestProfile =
    __CVG_WEB_MODE__ === 'test' || __CVG_WEB_CONTROLLED_TEST__
  if (configured === 'simulation') {
    if (!controlledTestProfile) {
      throw new Error(
        'Simulation web identity mode requires an explicit controlled test profile'
      )
    }
    return 'simulation'
  }
  if (configured === 'trusted') return 'trusted'
  if (configured === '') return controlledTestProfile ? 'simulation' : 'trusted'
  throw new Error('VITE_CVG_WEB_IDENTITY_MODE must be trusted or simulation')
}

export function createTrustedSessionBootstrap(
  tokenProvider: BootstrapTokenProvider = runtimeBootstrapTokenProvider
): SessionBootstrap {
  return {
    async load(): Promise<TrustedWebSession> {
      // SPEC0250 §3.5 / SPEC0144 invariant 3 (AUD0621 F12): a fresh host
      // token is exchanged once; without one, the existing session is
      // restored from the HttpOnly cookie before authentication is required.
      const token = tokenProvider ? await tokenProvider() : null
      const bootstrapToken = token?.trim() ? token.trim() : null
      return apiClient.getSession(bootstrapToken)
    },
    async logout(): Promise<void> {
      await apiClient.logoutSession()
    }
  }
}

/**
 * SPEC0259 §4.6: the OIDC bundle has no bootstrap token provider (the
 * compile-time comparison lets the bundler drop the window lookups); the
 * OIDC session is restored only by the HttpOnly cookie.
 */
export const runtimeBootstrapTokenProvider: BootstrapTokenProvider =
  __CVG_OPERATOR_LOGIN__ === 'oidc'
    ? undefined
    : () => {
        const runtime = globalThis as typeof globalThis & RuntimeBootstrapWindow
        if (runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__) {
          return runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__()
        }
        const token = runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN__ ?? null
        if (token) delete runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN__
        return token
      }
