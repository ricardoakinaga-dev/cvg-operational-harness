import type { ProviderUsage } from './contracts.ts'
import { ModelGatewayError } from './errors.ts'
import { isValidProviderUsage } from './token-meter.ts'

/**
 * SPEC 0284 §4: the internal stream contract. Not exported by the package
 * barrel (D1): the caller of `generate` still receives one `ModelResult`.
 */
export type ProviderStreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'usage'; usage: ProviderUsage }
  | { type: 'finish'; reason: string }

/** Set as soon as a byte of model output was seen (SPEC 0284 §7.3). */
export interface StreamProgress {
  outputSeen: boolean
}

export interface StreamOutcome {
  text: string
  usage?: ProviderUsage
  finishReason: string
}

/** The terminal decision does not wait longer than this for `return()`. */
const CLOSE_GRACE_MS = 1_000

/**
 * Consumes a provider stream into at most one terminal outcome (SPEC 0284
 * §4.1). The partial text lives only here; it becomes a result only when the
 * stream finished cleanly, and it is never part of an error.
 */
export async function assembleProviderStream(
  stream: AsyncIterable<ProviderStreamEvent>,
  options: {
    signal: AbortSignal
    externalSignal: AbortSignal | undefined
    progress: StreamProgress
  }
): Promise<StreamOutcome> {
  const { signal, externalSignal, progress } = options
  const iterator = stream[Symbol.asyncIterator]()
  const parts: string[] = []
  let usage: ProviderUsage | undefined
  let finishReason: string | undefined
  let closed = false

  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    const closing = Promise.resolve(iterator.return?.()).catch(() => undefined)
    let grace: ReturnType<typeof setTimeout> | undefined
    await Promise.race([
      closing,
      new Promise<void>((resolve) => {
        grace = setTimeout(resolve, CLOSE_GRACE_MS)
      })
    ])
    clearTimeout(grace)
  }

  const aborted = (): ModelGatewayError =>
    externalSignal?.aborted === true
      ? new ModelGatewayError('cancelled', 'Model call was cancelled')
      : new ModelGatewayError('provider_timeout', 'Model provider timed out', {
          retryable: true
        })

  let onAbort: (() => void) | undefined
  const abortion = new Promise<never>((_, reject) => {
    onAbort = () => reject(aborted())
    if (signal.aborted) onAbort()
    else signal.addEventListener('abort', onAbort, { once: true })
  })
  // The race below may settle first; never leave this promise unhandled.
  abortion.catch(() => undefined)

  const violation = (message: string): ModelGatewayError =>
    new ModelGatewayError('provider_malformed_response', message)

  try {
    for (;;) {
      const step = await Promise.race([iterator.next(), abortion])
      if (step.done) break
      const event = step.value
      if (finishReason !== undefined) {
        throw violation('Provider stream continued after its finish event')
      }
      switch (event.type) {
        case 'delta':
          if (typeof event.text !== 'string') {
            throw violation('Provider stream delta was not text')
          }
          if (event.text.length > 0) {
            progress.outputSeen = true
            parts.push(event.text)
          }
          break
        case 'usage':
          if (usage !== undefined || !isValidProviderUsage(event.usage)) {
            throw violation('Provider stream reported invalid token usage')
          }
          usage = event.usage
          break
        case 'finish':
          if (typeof event.reason !== 'string' || event.reason === '') {
            throw violation('Provider stream finish had no reason')
          }
          finishReason = event.reason
          break
        default:
          throw violation('Provider stream event was not recognised')
      }
    }
    if (finishReason === undefined) {
      throw new ModelGatewayError(
        'provider_connection_reset',
        'Model provider stream ended without a finish event',
        { retryable: true }
      )
    }
    closed = true
    return {
      text: parts.join(''),
      ...(usage !== undefined ? { usage } : {}),
      finishReason
    }
  } catch (error) {
    await close()
    throw error
  } finally {
    if (onAbort) signal.removeEventListener('abort', onAbort)
  }
}
