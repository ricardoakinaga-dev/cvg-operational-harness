import type { FetchLike } from './egress.ts'
import type { MediaFile } from './whatsapp.ts'

export interface Transcriber {
  transcribe(audio: MediaFile): Promise<string>
}

export interface WhisperOptions {
  /** Local Whisper server exposing the OpenAI-compatible transcription API. */
  baseUrl: string
  model: string
  language: string
  fetch: FetchLike
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

  async transcribe(audio: MediaFile): Promise<string> {
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
    const response = await this.#options.fetch(
      `${this.#options.baseUrl}/v1/audio/transcriptions`,
      {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(this.#options.timeoutMs ?? 120_000)
      }
    )
    if (!response.ok) {
      throw new Error(
        `Whisper transcription failed with HTTP ${response.status}`
      )
    }
    const body = (await response.json()) as { text?: unknown }
    if (typeof body.text !== 'string') {
      throw new Error('Whisper transcription returned no text')
    }
    return body.text.trim()
  }
}
