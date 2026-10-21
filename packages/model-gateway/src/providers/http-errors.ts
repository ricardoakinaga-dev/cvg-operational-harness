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

/** Name of the transport error raised when a body passes its byte ceiling. */
export const RESPONSE_TOO_LARGE_ERROR = 'ResponseTooLargeError'

export function networkError(
  providerId: string,
  error: unknown,
  maxBytes?: number
): ModelProviderError {
  if (error instanceof ModelProviderError) return error
  if (error instanceof Error && error.name === RESPONSE_TOO_LARGE_ERROR) {
    return tooLarge(providerId, maxBytes)
  }
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
    throw tooLarge(providerId, maxBytes)
  }
}

function tooLarge(providerId: string, maxBytes?: number): ModelProviderError {
  return new ModelProviderError(
    providerId,
    'response_too_large',
    maxBytes === undefined
      ? 'Provider response exceeded the size limit'
      : `Provider response exceeded ${maxBytes} bytes`
  )
}

/**
 * Reads a provider body under its byte ceiling and the call's signal (SPEC
 * 0248 §3.5): a declared length above the ceiling is refused before reading,
 * the stream is cancelled as soon as it passes the ceiling, and an abort ends
 * the read. A response without a stream (empty body or a minimal adapter)
 * falls back to `text()` with the same size check.
 */
export async function readBoundedText(
  providerId: string,
  response: Response,
  maxBytes: number,
  signal?: AbortSignal
): Promise<string> {
  const body = response.body
  if (!body) {
    let text: string
    try {
      text = await response.text()
    } catch (error) {
      throw networkError(providerId, error)
    }
    assertResponseSize(providerId, text, maxBytes)
    return text
  }
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) > maxBytes) {
    await body.cancel().catch(() => undefined)
    throw tooLarge(providerId, maxBytes)
  }
  const reader = body.getReader()
  const abort = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal?.addEventListener('abort', abort, { once: true })
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      signal?.throwIfAborted()
      const { value, done } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) throw tooLarge(providerId, maxBytes)
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw networkError(providerId, error, maxBytes)
  } finally {
    signal?.removeEventListener('abort', abort)
    reader.releaseLock()
  }
  return new TextDecoder().decode(Buffer.concat(chunks, total))
}
