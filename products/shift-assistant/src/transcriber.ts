import type { FetchLike } from './egress.ts'
import {
  assertNotRedirect,
  deadlineSignal,
  DEFAULT_TIMEOUTS,
  LIMITS,
  readLimitedJson,
  TransportError,
  transportFailure,
  untilAborted
} from './transport-limits.ts'
import type { MediaFile } from './whatsapp.ts'

export interface Transcriber {
  transcribe(audio: MediaFile, signal?: AbortSignal): Promise<string>
}

export interface WhisperOptions {
  /** Local Whisper server exposing the OpenAI-compatible transcription API. */
  baseUrl: string
  model: string
  language: string
  fetch: FetchLike
  /** Total deadline, including the response body (default 120 s). */
  timeoutMs?: number
}

const EXTENSIONS: Record<string, string> = {
  'audio/ogg': 'ogg',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/wav': 'wav',
  'audio/webm': 'webm'
}

/** Whisper running locally (faster-whisper-server, whisper.cpp, LocalAI...). */
export class WhisperTranscriber implements Transcriber {
  readonly #options: WhisperOptions

  constructor(options: WhisperOptions) {
    this.#options = { ...options, baseUrl: options.baseUrl.replace(/\/+$/, '') }
  }

  async transcribe(audio: MediaFile, caller?: AbortSignal): Promise<string> {
    if (audio.bytes.byteLength > LIMITS.mediaBytes) {
      throw new TransportError('MEDIA_TOO_LARGE', false)
    }
    const mimetype = audio.mimetype.split(';')[0]!.trim()
    const form = new FormData()
    form.append(
      'file',
      new Blob([new Uint8Array(audio.bytes)], { type: mimetype }),
      `audio.${EXTENSIONS[mimetype] ?? 'ogg'}`
    )
    form.append('model', this.#options.model)
    form.append('language', this.#options.language)
    form.append('response_format', 'json')
    const signal = deadlineSignal(
      this.#options.timeoutMs ?? DEFAULT_TIMEOUTS.whisperMs,
      caller
    )
    let response: Response
    try {
      response = await untilAborted(
        this.#options.fetch(
          `${this.#options.baseUrl}/v1/audio/transcriptions`,
          { method: 'POST', body: form, signal }
        ),
        signal
      )
    } catch (error) {
      throw transportFailure(error, signal)
    }
    assertNotRedirect(response)
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined)
      throw new TransportError(
        'TRANSPORT_HTTP_STATUS',
        response.status >= 500,
        {
          status: response.status
        }
      )
    }
    const body = (await readLimitedJson(
      response,
      LIMITS.whisperResponseBytes,
      signal
    )) as { text?: unknown } | null
    if (
      !body ||
      typeof body.text !== 'string' ||
      body.text.length > LIMITS.transcriptChars
    ) {
      throw new TransportError('BODY_INVALID', false)
    }
    return body.text.trim()
  }
}
