import type { Server } from 'node:http'
import { OpenAICompatibleProvider } from '@cvg/model-gateway'
import { ShiftAssistant, type ShiftLogger } from './assistant.ts'
import type { ShiftConfig } from './config.ts'
import { allowlistedFetch, type FetchLike } from './egress.ts'
import {
  buildOrganizerGateway,
  ModelOrganizer,
  type Organizer
} from './organizer.ts'
import { buildShiftServer } from './server.ts'
import { ShiftStore } from './store.ts'
import { WhisperTranscriber } from './transcriber.ts'
import { EvolutionClient, WahaClient, type WhatsAppClient } from './whatsapp.ts'

export interface StopResult {
  /** False when the shutdown budget expired with work still in flight. */
  clean: boolean
}

export interface ShiftApp {
  assistant: ShiftAssistant
  store: ShiftStore
  whatsapp: WhatsAppClient
  server: Server
  /** Starts listening and the reminder loop; returns the bound port. */
  start(): Promise<number>
  /** Idempotent; bounded by SHIFT_SHUTDOWN_TIMEOUT_MS. */
  stop(): Promise<StopResult>
}

export interface ComposeOptions {
  logger?: ShiftLogger
  clock?: () => Date
  /** Network implementation under the egress allowlist (tests only). */
  fetchImpl?: FetchLike
  /**
   * Synthetic, in-process organizer for local tests and the sandbox. It
   * never contacts a model; production composition always uses the model
   * gateway, which denies clinical notes (NO_MODEL).
   */
  organizer?: Organizer
}

/**
 * Single composition of the shift assistant, shared by the process entry
 * point, the demo and the integration tests.
 */
export function composeShiftApp(
  config: ShiftConfig,
  options: ComposeOptions = {}
): ShiftApp {
  const { env, members } = config
  const store = new ShiftStore(env.SHIFT_DATA_DIR)
  const guarded = (origins: string[]) =>
    allowlistedFetch(origins, options.fetchImpl)
  const channelLimits = {
    sendTimeoutMs: env.SHIFT_SEND_TIMEOUT_MS,
    mediaTimeoutMs: env.SHIFT_MEDIA_TIMEOUT_MS,
    maxMediaBytes: env.SHIFT_MAX_MEDIA_BYTES
  }

  const whatsapp: WhatsAppClient =
    env.SHIFT_PROVIDER === 'waha'
      ? new WahaClient({
          baseUrl: env.WAHA_URL!,
          apiKey: env.WAHA_API_KEY!,
          session: env.WAHA_SESSION,
          fetch: guarded([env.WAHA_URL!]),
          ...channelLimits
        })
      : new EvolutionClient({
          baseUrl: env.EVOLUTION_URL!,
          apiKey: env.EVOLUTION_API_KEY!,
          instance: env.EVOLUTION_INSTANCE!,
          fetch: guarded([env.EVOLUTION_URL!]),
          ...channelLimits
        })

  const transcriber = new WhisperTranscriber({
    baseUrl: env.WHISPER_URL,
    model: env.WHISPER_MODEL,
    language: 'pt',
    fetch: guarded([env.WHISPER_URL]),
    timeoutMs: env.SHIFT_WHISPER_TIMEOUT_MS
  })

  // The organizer reaches its provider only through the public model
  // gateway. Shift notes are CLINICAL, so the gateway answers policy_denied
  // before any provider, DNS or HTTP (NO_MODEL; D2 is a separate decision).
  // The provider keeps its own SSRF guard: HTTPS and the configured host
  // only; plain HTTP is accepted only for a loopback model.
  const local = env.LLM_LOCATION === 'local'
  const organizer =
    options.organizer ??
    new ModelOrganizer(
      buildOrganizerGateway({
        provider: new OpenAICompatibleProvider({
          id: 'shift-organizer',
          baseUrl: env.LLM_BASE_URL,
          model: env.LLM_MODEL,
          location: local ? 'local' : 'external',
          ...(env.LLM_API_KEY ? { apiKey: env.LLM_API_KEY } : {}),
          ...(local
            ? {
                allowHttp: true,
                allowPrivateNetworks: true,
                requiresApiKey: false
              }
            : {})
        }),
        model: env.LLM_MODEL,
        location: local ? 'local' : 'external',
        timeoutMs: env.SHIFT_MODEL_TIMEOUT_MS
      }),
      {
        profile: local ? 'local' : 'balanced',
        timeoutMs: env.SHIFT_MODEL_TIMEOUT_MS
      }
    )

  const assistant = new ShiftAssistant({
    store,
    members,
    whatsapp,
    transcriber,
    organizer,
    jobTimeoutMs: env.SHIFT_JOB_TIMEOUT_MS,
    maxPendingMessages: env.SHIFT_MAX_PENDING_MESSAGES,
    ...(options.logger ? { logger: options.logger } : {}),
    ...(options.clock ? { clock: options.clock } : {})
  })

  const server = buildShiftServer({
    assistant,
    store,
    whatsapp,
    webhookSecret: env.SHIFT_WEBHOOK_SECRET,
    ...(options.clock ? { clock: options.clock } : {})
  })

  const intervalMs = env.SHIFT_TICK_SECONDS * 1000
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let stopping: Promise<StopResult> | undefined

  // One round at a time: the next round is scheduled only after the
  // previous one finished, so rounds never overlap.
  const schedule = () => {
    if (!running) return
    timer = setTimeout(() => {
      void assistant
        .tick()
        .catch((error: unknown) =>
          options.logger?.error('shift.tick.failed', {
            error: error instanceof Error ? error.name : 'unknown'
          })
        )
        .finally(schedule)
    }, intervalMs)
    timer.unref?.()
  }

  return {
    assistant,
    store,
    whatsapp,
    server,
    async start() {
      assistant.resumePending()
      await new Promise<void>((resolve) =>
        server.listen(env.SHIFT_PORT, env.SHIFT_HOST, resolve)
      )
      running = true
      assistant.schedulerStarted(intervalMs)
      schedule()
      const address = server.address()
      return typeof address === 'object' && address
        ? address.port
        : env.SHIFT_PORT
    },
    stop() {
      stopping ??= (async () => {
        running = false
        if (timer) clearTimeout(timer)
        assistant.beginStop()
        const closed = new Promise<void>((resolve) =>
          server.close(() => resolve())
        )
        server.closeIdleConnections()
        const drained = await assistant.drain(env.SHIFT_SHUTDOWN_TIMEOUT_MS)
        // Whatever is still open after the budget is cut.
        server.closeAllConnections()
        await closed
        return { clean: drained }
      })()
      return stopping
    }
  }
}
