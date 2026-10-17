export const ModelGatewayErrorCodes = {
  invalid_request: 'invalid_request',
  prompt_unknown: 'prompt_unknown',
  prompt_revoked: 'prompt_revoked',
  prompt_hash_mismatch: 'prompt_hash_mismatch',
  profile_unknown: 'profile_unknown',
  provider_unknown: 'provider_unknown',
  policy_denied: 'policy_denied',
  budget_exceeded: 'budget_exceeded',
  circuit_open: 'circuit_open',
  provider_timeout: 'provider_timeout',
  provider_unavailable: 'provider_unavailable',
  provider_rate_limited: 'provider_rate_limited',
  provider_auth_failed: 'provider_auth_failed',
  provider_invalid_request: 'provider_invalid_request',
  provider_connection_reset: 'provider_connection_reset',
  provider_response_too_large: 'provider_response_too_large',
  provider_malformed_response: 'provider_malformed_response',
  schema_invalid: 'schema_invalid',
  cancelled: 'cancelled',
  internal_error: 'internal_error'
} as const

export type ModelGatewayErrorCode =
  (typeof ModelGatewayErrorCodes)[keyof typeof ModelGatewayErrorCodes]

export class ModelGatewayError extends Error {
  readonly code: ModelGatewayErrorCode
  readonly retryable: boolean
  readonly status?: number

  constructor(
    code: ModelGatewayErrorCode,
    message: string,
    options: { retryable?: boolean; status?: number } = {}
  ) {
    super(message)
    this.name = 'ModelGatewayError'
    this.code = code
    this.retryable = options.retryable ?? false
    if (options.status !== undefined) {
      this.status = options.status
    }
  }
}

export type ModelProviderErrorKind =
  | 'timeout'
  | 'rate_limited'
  | 'unavailable'
  | 'auth'
  | 'invalid_request'
  | 'connection'
  | 'response_too_large'
  | 'malformed_response'
  | 'cancelled'
  | 'internal'

const RETRYABLE_PROVIDER_ERRORS: ReadonlySet<ModelProviderErrorKind> = new Set([
  'timeout',
  'rate_limited',
  'unavailable',
  'connection'
])

export class ModelProviderError extends Error {
  readonly kind: ModelProviderErrorKind
  readonly status?: number
  readonly providerId: string

  constructor(
    providerId: string,
    kind: ModelProviderErrorKind,
    message: string,
    status?: number
  ) {
    super(message)
    this.name = 'ModelProviderError'
    this.providerId = providerId
    this.kind = kind
    if (status !== undefined) {
      this.status = status
    }
  }

  get retryable(): boolean {
    return RETRYABLE_PROVIDER_ERRORS.has(this.kind)
  }
}

export function toGatewayError(
  error: unknown,
  providerId?: string
): ModelGatewayError {
  if (error instanceof ModelGatewayError) return error
  if (error instanceof ModelProviderError) {
    const status = error.status
    switch (error.kind) {
      case 'timeout':
        return new ModelGatewayError(
          'provider_timeout',
          'Model provider timed out',
          { retryable: true, ...(status !== undefined ? { status } : {}) }
        )
      case 'rate_limited':
        return new ModelGatewayError(
          'provider_rate_limited',
          'Model provider rate limited the request',
          { retryable: true, ...(status !== undefined ? { status } : {}) }
        )
      case 'unavailable':
        return new ModelGatewayError(
          'provider_unavailable',
          'Model provider is unavailable',
          { retryable: true, ...(status !== undefined ? { status } : {}) }
        )
      case 'connection':
        return new ModelGatewayError(
          'provider_connection_reset',
          'Model provider connection failed',
          { retryable: true, ...(status !== undefined ? { status } : {}) }
        )
      case 'auth':
        return new ModelGatewayError(
          'provider_auth_failed',
          'Model provider rejected the credentials',
          status !== undefined ? { status } : {}
        )
      case 'invalid_request':
        return new ModelGatewayError(
          'provider_invalid_request',
          'Model provider rejected the request',
          status !== undefined ? { status } : {}
        )
      case 'response_too_large':
        return new ModelGatewayError(
          'provider_response_too_large',
          'Model provider response exceeded the size limit'
        )
      case 'malformed_response':
        return new ModelGatewayError(
          'provider_malformed_response',
          'Model provider returned a malformed response'
        )
      case 'cancelled':
        return new ModelGatewayError('cancelled', 'Model call was cancelled')
      default:
        return new ModelGatewayError(
          'internal_error',
          `Model provider ${providerId ?? 'unknown'} failed`
        )
    }
  }
  if (
    error instanceof Error &&
    (error.name === 'AbortError' || error.name === 'TimeoutError')
  ) {
    return new ModelGatewayError('provider_timeout', 'Model call timed out', {
      retryable: true
    })
  }
  return new ModelGatewayError(
    'internal_error',
    'Unexpected model gateway error'
  )
}
