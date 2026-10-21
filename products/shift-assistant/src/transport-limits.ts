/**
 * Transport ceilings and deadlines for every channel and Whisper call of the
 * product (SPEC 0179 section 8.2, AUD-0621 F21). Bodies are read as streams
 * and counted chunk by chunk; nothing buffers more than its ceiling, and the
 * deadline covers the whole body, not only the headers.
 */

export const KiB = 1024
export const MiB = 1024 * KiB

/** Byte ceilings are constants: they are never raised through the environment. */
export const LIMITS = {
  sendTextBytes: 32 * KiB,
  sendResponseBytes: 64 * KiB,
  mediaBytes: 10 * MiB,
  evolutionMediaJsonBytes: 16 * MiB,
  whisperResponseBytes: 256 * KiB,
  transcriptChars: 16_384,
  inboundTextChars: 16_384,
  inboundIdChars: 256
} as const

export const DEFAULT_TIMEOUTS = {
  sendMs: 10_000,
  mediaMs: 15_000,
  whisperMs: 120_000,
  modelMs: 60_000,
  jobMs: 210_000,
  shutdownMs: 10_000
} as const

export type TransportErrorCode =
  | 'TRANSPORT_TIMEOUT'
  | 'TRANSPORT_ABORTED'
  | 'TRANSPORT_NETWORK'
  | 'TRANSPORT_HTTP_STATUS'
  | 'TRANSPORT_REDIRECT'
  | 'EGRESS_DENIED'
  | 'BODY_TOO_LARGE'
  | 'BODY_INVALID'
  | 'MEDIA_TOO_LARGE'
  | 'MEDIA_INVALID'
  | 'TEXT_TOO_LARGE'

/**
 * Stable, content-free error. `retryable` tells the inbox whether a later
 * attempt may succeed; it never carries body, URL or secret.
 */
export class TransportError extends Error {
  readonly code: TransportErrorCode
  readonly retryable: boolean
  readonly status?: number

  constructor(
    code: TransportErrorCode,
    retryable: boolean,
    options: { status?: number } = {}
  ) {
    super(code)
    this.name = 'TransportError'
    this.code = code
    this.retryable = retryable
    if (options.status !== undefined) this.status = options.status
  }
}

/**
 * Result of an outbound send that failed. `not_sent` means the request never
 * left the process (local validation or egress denial); anything after the
 * request started is `uncertain`: the channel may have accepted it.
 */
export class DispatchError extends TransportError {
  readonly outcome: 'not_sent' | 'uncertain'

  constructor(
    code: TransportErrorCode,
    outcome: 'not_sent' | 'uncertain',
    options: { status?: number } = {}
  ) {
    super(code, outcome === 'not_sent', options)
    this.name = 'DispatchError'
    this.outcome = outcome
  }
}

/** Deadline combined with optional caller signals (pause, shutdown, job). */
export function deadlineSignal(
  timeoutMs: number,
  ...signals: Array<AbortSignal | undefined>
): AbortSignal {
  const parts = [AbortSignal.timeout(timeoutMs)]
  for (const signal of signals) if (signal) parts.push(signal)
  return AbortSignal.any(parts)
}

export function isTimeout(signal: AbortSignal): boolean {
  const reason: unknown = signal.reason
  return reason instanceof Error && reason.name === 'TimeoutError'
}

/**
 * Settles with `operation`, or rejects as soon as `signal` aborts even when
 * the operation ignores the signal (a hung socket or a stuck dependency).
 */
export function untilAborted<T>(
  operation: Promise<T>,
  signal: AbortSignal
): Promise<T> {
  if (signal.aborted) {
    operation.catch(() => undefined)
    return Promise.reject(abortErrorFor(signal))
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortErrorFor(signal))
    signal.addEventListener('abort', onAbort, { once: true })
    operation.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      }
    )
  })
}

export function abortErrorFor(signal: AbortSignal): TransportError {
  return new TransportError(
    isTimeout(signal) ? 'TRANSPORT_TIMEOUT' : 'TRANSPORT_ABORTED',
    true
  )
}

/** Maps fetch failures to stable codes, keeping the signal's first cause. */
export function transportFailure(
  error: unknown,
  signal: AbortSignal
): TransportError {
  if (error instanceof TransportError) return error
  if (signal.aborted) return abortErrorFor(signal)
  if (error instanceof Error && error.name === 'EgressDeniedError') {
    return new TransportError('EGRESS_DENIED', false)
  }
  return new TransportError('TRANSPORT_NETWORK', true)
}

/**
 * Reads at most `maxBytes` of `response`, cancelling the stream as soon as a
 * chunk crosses the ceiling. A declared Content-Length above the ceiling is
 * refused before reading; a low or missing one is never trusted.
 */
export async function readLimitedBytes(
  response: Response,
  maxBytes: number,
  signal: AbortSignal,
  tooLarge: TransportErrorCode = 'BODY_TOO_LARGE'
): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    throw new TransportError(tooLarge, false)
  }
  if (!response.body) return new Uint8Array()
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  const onAbort = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', onAbort, { once: true })
  try {
    for (;;) {
      if (signal.aborted) throw abortErrorFor(signal)
      const { done, value } = await untilAborted(reader.read(), signal)
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined)
        throw new TransportError(tooLarge, false)
      }
      chunks.push(value)
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error instanceof TransportError
      ? error
      : transportFailure(error, signal)
  } finally {
    signal.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

/** Bounded JSON read with strict UTF-8. */
export async function readLimitedJson(
  response: Response,
  maxBytes: number,
  signal: AbortSignal
): Promise<unknown> {
  const bytes = await readLimitedBytes(response, maxBytes, signal)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new TransportError('BODY_INVALID', false)
  }
}

/** 3xx is never followed: the configured service cannot bounce us elsewhere. */
export function assertNotRedirect(response: Response): void {
  if (
    response.type === 'opaqueredirect' ||
    (response.status >= 300 && response.status < 400)
  ) {
    void response.body?.cancel().catch(() => undefined)
    throw new TransportError('TRANSPORT_REDIRECT', false, {
      status: response.status
    })
  }
}

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Strict base64 with the decoded size checked before any decoding, so an
 * oversized inline payload never becomes a Buffer.
 */
export function decodeBase64Media(value: string, maxBytes: number): Uint8Array {
  const text = value.replace(/\s+/g, '')
  if (text.length === 0 || text.length % 4 !== 0 || !BASE64.test(text)) {
    throw new TransportError('MEDIA_INVALID', false)
  }
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  const decodedBytes = (text.length / 4) * 3 - padding
  if (decodedBytes > maxBytes)
    throw new TransportError('MEDIA_TOO_LARGE', false)
  return new Uint8Array(Buffer.from(text, 'base64'))
}

const MEDIA_TYPES = new Set([
  'audio/ogg',
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/webm',
  'image/jpeg',
  'image/png',
  'image/webp'
])

/** Closed list of media types the assistant keeps and transcribes. */
export function acceptedMediaType(mimetype: string | undefined): string {
  const base = (mimetype ?? '').split(';')[0]!.trim().toLowerCase()
  if (!MEDIA_TYPES.has(base)) throw new TransportError('MEDIA_INVALID', false)
  return base
}

/** UTF-8 size of `text`. */
export function utf8Bytes(text: string): number {
  return Buffer.byteLength(text, 'utf8')
}

/**
 * Splits a reply into at most `maxParts` pieces of at most `maxBytes` UTF-8
 * bytes each, on code point boundaries and preferably at line breaks. Text
 * beyond the last part is cut with a notice; the full note stays stored.
 */
export function splitForChannel(
  text: string,
  maxBytes: number = LIMITS.sendTextBytes,
  maxParts = 4
): string[] {
  if (utf8Bytes(text) <= maxBytes) return [text]
  const notice = '\n… (texto longo; a nota completa ficou guardada)'
  const parts: string[] = []
  let rest = text
  while (rest.length > 0 && parts.length < maxParts) {
    const last = parts.length === maxParts - 1
    const budget = last ? maxBytes - utf8Bytes(notice) : maxBytes
    if (utf8Bytes(rest) <= (last ? maxBytes : budget)) {
      parts.push(rest)
      rest = ''
      break
    }
    let cut = 0
    let bytes = 0
    for (const char of rest) {
      const size = utf8Bytes(char)
      if (bytes + size > budget) break
      bytes += size
      cut += char.length
    }
    const newline = rest.lastIndexOf('\n', cut)
    const end = !last && newline > cut / 2 ? newline + 1 : cut
    parts.push(last ? `${rest.slice(0, end)}${notice}` : rest.slice(0, end))
    rest = rest.slice(end)
  }
  return parts
}
