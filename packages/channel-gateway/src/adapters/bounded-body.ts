import { ChannelError } from '../errors.ts'

/**
 * SPEC 0248 §3.5 (AUD-0621 F21): channel sends carry a byte ceiling and a
 * deadline down to the transport, and read the provider body under both.
 */

/** Name shared by the transport and the body reader for a body over its ceiling. */
export const RESPONSE_TOO_LARGE_ERROR = 'ResponseTooLargeError'

export const DEFAULT_CHANNEL_SEND_TIMEOUT_MS = 20_000
export const MAX_CHANNEL_SEND_TIMEOUT_MS = 120_000

/**
 * SPEC 0268 — a 5xx means the request reached the destination but the outcome
 * is unknown (proxy 502/504, 500 after processing): the gateway must keep the
 * operation UNCERTAIN instead of releasing it for a blind resend. 429 is an
 * explicit refusal before processing and stays retryable.
 */
export function statusEffectOptions(status: number): {
  effectUnknown?: boolean
} {
  return status >= 500 ? { effectUnknown: true } : {}
}

/** The ceiling error; the transport attaches the response status. */
export function responseTooLarge(status?: number): Error {
  const error = new Error('Response exceeds maxResponseBytes')
  error.name = RESPONSE_TOO_LARGE_ERROR
  return status === undefined ? error : Object.assign(error, { status })
}

export function isResponseTooLarge(error: unknown): error is Error {
  return error instanceof Error && error.name === RESPONSE_TOO_LARGE_ERROR
}

/**
 * Maps a body over its ceiling. A known non-2xx status wins and maps as that
 * status does (provider_rejected; 5xx is effect-unknown, 429 retryable); otherwise the
 * adapter's size rejection stays as it was.
 */
export function oversizedResponseError(
  error: Error,
  label: string
): ChannelError {
  const status = (error as { status?: unknown }).status
  if (typeof status === 'number' && (status < 200 || status >= 300)) {
    return new ChannelError(
      'provider_rejected',
      `${label} responded with status ${status}`,
      status === 429,
      statusEffectOptions(status)
    )
  }
  return new ChannelError(
    'provider_rejected',
    `${label} response exceeded the size limit`
  )
}

/** Races a whole send (DNS guard included) against the send deadline. */
export function raceSignal<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  // An abandoned send that settles after the deadline is never unhandled.
  void operation.catch(() => undefined)
  let onAbort!: () => void
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
  })
  return Promise.race([operation, aborted]).finally(() =>
    signal.removeEventListener('abort', onAbort)
  )
}

/** The send deadline: an integer in 1..120000 ms, 20000 by default. */
export function channelSendTimeoutMs(
  value: number | undefined,
  label: string
): number {
  const timeoutMs = value ?? DEFAULT_CHANNEL_SEND_TIMEOUT_MS
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > MAX_CHANNEL_SEND_TIMEOUT_MS
  ) {
    throw new ChannelError(
      'invalid_config',
      `${label} timeoutMs must be an integer in 1..${MAX_CHANNEL_SEND_TIMEOUT_MS}`
    )
  }
  return timeoutMs
}

/**
 * Drains a provider body without keeping it: a declared length above the
 * ceiling is refused before reading, the stream is cancelled as soon as it
 * passes the ceiling, and the deadline ends a body that never finishes.
 */
export async function drainBoundedBody(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<void> {
  const body = response.body
  if (!body) return
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) > maxBytes) {
    await body.cancel().catch(() => undefined)
    throw responseTooLarge()
  }
  const reader = body.getReader()
  const abort = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', abort, { once: true })
  let total = 0
  try {
    for (;;) {
      signal.throwIfAborted()
      const { value, done } = await reader.read()
      signal.throwIfAborted()
      if (done) return
      total += value.byteLength
      if (total > maxBytes) throw responseTooLarge()
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  } finally {
    signal.removeEventListener('abort', abort)
    reader.releaseLock()
  }
}
