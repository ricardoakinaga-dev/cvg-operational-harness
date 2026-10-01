import type { Server } from 'node:http'
import { OpenAICompatibleProvider } from '@cvg/model-gateway'
import { ShiftAssistant, type ShiftLogger } from './assistant.ts'
import type { ShiftConfig } from './config.ts'
import { allowlistedFetch, type FetchLike } from './egress.ts'
import { ModelOrganizer } from './organizer.ts'
import { buildShiftServer } from './server.ts'
import { ShiftStore } from './store.ts'
import { WhisperTranscriber } from './transcriber.ts'
import { EvolutionClient, WahaClient, type WhatsAppClient } from './whatsapp.ts'

export interface ShiftApp {
  assistant: ShiftAssistant
  store: ShiftStore
  whatsapp: WhatsAppClient
  server: Server
  /** Starts listening and the reminder loop; returns the bound port. */
  start(): Promise<number>
  stop(): Promise<void>
}

export interface ComposeOptions {
  logger?: ShiftLogger
  clock?: () => Date
  /** Network implementation under the egress allowlist (tests only). */
  fetchImpl?: FetchLike
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

  const whatsapp: WhatsAppClient =
    env.SHIFT_PROVIDER === 'waha'
      ? new WahaClient({
          baseUrl: env.WAHA_URL!,
          apiKey: env.WAHA_API_KEY!,
          session: env.WAHA_SESSION,
          fetch: guarded([env.WAHA_URL!])
        })
      : new EvolutionClient({
          baseUrl: env.EVOLUTION_URL!,
          apiKey: env.EVOLUTION_API_KEY!,
          instance: env.EVOLUTION_INSTANCE!,
          fetch: guarded([env.EVOLUTION_URL!])
        })

  const transcriber = new WhisperTranscriber({
    baseUrl: env.WHISPER_URL,
    model: env.WHISPER_MODEL,
    language: 'pt',
    fetch: guarded([env.WHISPER_URL])
  })

  // The model-gateway provider applies its own SSRF guard: HTTPS and the
  // configured host only; plain HTTP is accepted only for a loopback model.
  const local = env.LLM_LOCATION === 'local'
  const organizer = new ModelOrganizer(
    new OpenAICompatibleProvider({
      id: 'shift-organizer',
      baseUrl: env.LLM_BASE_URL,
      model: env.LLM_MODEL,
      location: local ? 'local' : 'external',
      ...(env.LLM_API_KEY ? { apiKey: env.LLM_API_KEY } : {}),
      ...(local
        ? { allowHttp: true, allowPrivateNetworks: true, requiresApiKey: false }
        : {})
    }),
    env.LLM_MODEL
  )

  const assistant = new ShiftAssistant({
    store,
    members,
    whatsapp,
    transcriber,
    organizer,
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

  let timer: ReturnType<typeof setInterval> | undefined

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
      timer = setInterval(() => {
        void assistant.tick().catch((error: unknown) =>
          options.logger?.error('shift.tick.failed', {
            error: error instanceof Error ? error.name : 'unknown'
          })
        )
      }, env.SHIFT_TICK_SECONDS * 1000)
      const address = server.address()
      return typeof address === 'object' && address
        ? address.port
        : env.SHIFT_PORT
    },
    async stop() {
      if (timer) clearInterval(timer)
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await assistant.idle()
    }
  }
}
