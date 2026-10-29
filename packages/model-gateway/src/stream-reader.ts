import { ModelProviderError } from './errors.ts'
import { networkError } from './providers/http-errors.ts'

/**
 * SPEC 0284 §6: incremental frame reader shared by the SSE (OpenAI-compatible)
 * and NDJSON (Ollama) providers. Internal; not exported by the barrel.
 */
export interface StreamLimits {
  /** Total body bytes (SPEC 0248 ceiling, also counted here). */
  maxBytes: number
  maxEvents: number
  maxEventBytes: number
  idleTimeoutMs: number
}

export const DEFAULT_MAX_STREAM_EVENTS = 4096
export const DEFAULT_MAX_STREAM_EVENT_BYTES = 64 * 1024
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 30_000

/** A positive safe integer, or the construction fails (SPEC 0284 §6.3). */
export function streamLimit(
  providerId: string,
  name: string,
  value: number | undefined,
  fallback: number
): number {
  const limit = value ?? fallback
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    throw new ModelProviderError(
      providerId,
      'invalid_request',
      `${name} must be a positive safe integer`
    )
  }
  return limit
}

function tooLarge(providerId: string, what: string): ModelProviderError {
  return new ModelProviderError(
    providerId,
    'response_too_large',
    `Provider stream exceeded the ${what} limit`
  )
}

/**
 * Yields one payload per SSE event (`data:` lines joined by "\n") or per
 * NDJSON line. A frame or line that is still incomplete when the body ends is
 * never yielded. The body is cancelled on every exit that is not its end.
 */
export async function* readStreamFrames(
  providerId: string,
  response: Response,
  kind: 'sse' | 'ndjson',
  limits: StreamLimits,
  signal: AbortSignal
): AsyncGenerator<string> {
  const body = response.body
  if (!body) return
  const declared = response.headers.get('content-length')
  if (declared !== null && Number(declared) > limits.maxBytes) {
    await body.cancel().catch(() => undefined)
    throw tooLarge(providerId, 'byte')
  }
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8')
  let aborted: unknown
  const onAbort = () => {
    aborted = signal.reason ?? new DOMException('aborted', 'AbortError')
    void reader.cancel().catch(() => undefined)
  }
  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })

  let pending = ''
  let totalBytes = 0
  let events = 0
  let dataLines: string[] = []
  let eventBytes = 0
  let finished = false

  const countEvent = () => {
    events += 1
    if (events > limits.maxEvents) throw tooLarge(providerId, 'event count')
  }

  // Returns the frames completed by the text appended to `pending`.
  const drain = (atEnd: boolean): string[] => {
    const frames: string[] = []
    for (;;) {
      if (kind === 'ndjson') {
        const at = pending.indexOf('\n')
        if (at < 0) break
        const line = pending.slice(0, at).replace(/\r$/, '')
        pending = pending.slice(at + 1)
        if (Buffer.byteLength(line) > limits.maxEventBytes) {
          throw tooLarge(providerId, 'event size')
        }
        if (line.trim() !== '') {
          countEvent()
          frames.push(line)
        }
        continue
      }
      const match = /\r\n|\n|\r/.exec(pending)
      if (!match) break
      // A "\r" at the very end may be the first half of "\r\n".
      if (match[0] === '\r' && match.index === pending.length - 1 && !atEnd) {
        break
      }
      const line = pending.slice(0, match.index)
      pending = pending.slice(match.index + match[0].length)
      if (line === '') {
        countEvent()
        if (dataLines.length > 0) {
          frames.push(dataLines.join('\n'))
          dataLines = []
          eventBytes = 0
        }
        continue
      }
      if (line.startsWith(':')) continue
      const colon = line.indexOf(':')
      const field = colon < 0 ? line : line.slice(0, colon)
      if (field === 'data') {
        let value = colon < 0 ? '' : line.slice(colon + 1)
        if (value.startsWith(' ')) value = value.slice(1)
        // A running size, including the "\n" the join puts between lines:
        // linear in the lines of one event, and an empty line still counts.
        eventBytes += Buffer.byteLength(value) + (dataLines.length > 0 ? 1 : 0)
        if (eventBytes > limits.maxEventBytes) {
          throw tooLarge(providerId, 'event size')
        }
        dataLines.push(value)
      }
    }
    if (Buffer.byteLength(pending) > limits.maxEventBytes) {
      throw tooLarge(providerId, 'event size')
    }
    return frames
  }

  try {
    for (;;) {
      if (aborted !== undefined) throw networkError(providerId, aborted)
      let idle: ReturnType<typeof setTimeout> | undefined
      const stalled = new Promise<never>((_, reject) => {
        idle = setTimeout(
          () =>
            reject(
              new ModelProviderError(
                providerId,
                'timeout',
                'Provider stream was idle past its limit'
              )
            ),
          limits.idleTimeoutMs
        )
      })
      stalled.catch(() => undefined)
      let step: ReadableStreamReadResult<Uint8Array>
      try {
        step = await Promise.race([reader.read(), stalled])
      } catch (error) {
        throw error instanceof ModelProviderError
          ? error
          : networkError(providerId, aborted ?? error, limits.maxBytes)
      } finally {
        clearTimeout(idle)
      }
      if (aborted !== undefined) throw networkError(providerId, aborted)
      if (step.done) {
        pending += decoder.decode()
        for (const frame of drain(true)) yield frame
        finished = true
        return
      }
      totalBytes += step.value.byteLength
      if (totalBytes > limits.maxBytes) throw tooLarge(providerId, 'byte')
      pending += decoder.decode(step.value, { stream: true })
      for (const frame of drain(false)) yield frame
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    if (!finished) await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
