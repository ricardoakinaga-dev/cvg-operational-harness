import {
  ApiRequestError,
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
      const token = tokenProvider ? await tokenProvider() : null
      if (!token?.trim()) {
        throw new ApiRequestError(
          'Uma sessão confiável é necessária para continuar.',
          401,
          'unauthorized'
        )
      }
      return apiClient.getSession(token.trim())
    },
    async logout(): Promise<void> {
      await apiClient.logoutSession()
    }
  }
}

export const runtimeBootstrapTokenProvider: BootstrapTokenProvider = () => {
  const runtime = globalThis as typeof globalThis & RuntimeBootstrapWindow
  if (runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__) {
    return runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN_PROVIDER__()
  }
  const token = runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN__ ?? null
  if (token) delete runtime.__CVG_OPERATOR_BOOTSTRAP_TOKEN__
  return token
}
