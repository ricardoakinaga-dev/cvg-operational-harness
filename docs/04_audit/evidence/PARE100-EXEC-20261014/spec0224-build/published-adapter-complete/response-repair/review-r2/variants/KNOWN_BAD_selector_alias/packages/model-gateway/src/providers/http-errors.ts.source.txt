import { ModelProviderError, type ModelProviderErrorKind } from '../errors.ts'

export function mapHttpStatusToKind(status: number): ModelProviderErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 429) return 'rate_limited'
  if (status === 400 || status === 404 || status === 409 || status === 422) {
    return 'invalid_request'
  }
  if (status >= 500) return 'unavailable'
  return 'internal'
}

export function providerHttpError(
  providerId: string,
  status: number
): ModelProviderError {
  const kind = mapHttpStatusToKind(status)
  return new ModelProviderError(
    providerId,
    kind,
    `Provider responded with status ${status}`,
    status
  )
}

export function networkError(
  providerId: string,
  error: unknown
): ModelProviderError {
  if (error instanceof ModelProviderError) return error
  if (error instanceof Error && error.name === 'AbortError') {
    return new ModelProviderError(providerId, 'cancelled', 'Provider aborted')
  }
  if (error instanceof Error && error.name === 'TimeoutError') {
    return new ModelProviderError(providerId, 'timeout', 'Provider timed out')
  }
  return new ModelProviderError(
    providerId,
    'connection',
    'Provider connection failed'
  )
}

export function assertResponseSize(
  providerId: string,
  body: string,
  maxBytes: number
): void {
  const bytes = new TextEncoder().encode(body).length
  if (bytes > maxBytes) {
    throw new ModelProviderError(
      providerId,
      'response_too_large',
      `Provider response exceeded ${maxBytes} bytes`
    )
  }
}
