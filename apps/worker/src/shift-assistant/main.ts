import { OpenAICompatibleProvider } from '@cvg/model-gateway'
import { ShiftAssistant, type ShiftLogger } from './assistant.ts'
import { loadShiftConfig } from './config.ts'
import { allowlistedFetch } from './egress.ts'
import { ModelOrganizer } from './organizer.ts'
import { buildShiftServer } from './server.ts'
import { ShiftStore } from './store.ts'
import { WhisperTranscriber } from './transcriber.ts'
import { EvolutionClient, WahaClient, type WhatsAppClient } from './whatsapp.ts'

const logger: ShiftLogger = {
  info: (event, fields) =>
    console.log(JSON.stringify({ level: 'info', event, ...fields })),
  error: (event, fields) =>
    console.error(JSON.stringify({ level: 'error', event, ...fields }))
}

async function start(): Promise<void> {
  const { env, members } = loadShiftConfig(process.env)
  const store = new ShiftStore(env.SHIFT_DATA_DIR)

  const whatsappOrigin =
    env.SHIFT_PROVIDER === 'waha' ? env.WAHA_URL! : env.EVOLUTION_URL!
  const whatsapp: WhatsAppClient =
    env.SHIFT_PROVIDER === 'waha'
      ? new WahaClient({
          baseUrl: env.WAHA_URL!,
          apiKey: env.WAHA_API_KEY!,
          session: env.WAHA_SESSION,
          fetch: allowlistedFetch([whatsappOrigin])
        })
      : new EvolutionClient({
          baseUrl: env.EVOLUTION_URL!,
          apiKey: env.EVOLUTION_API_KEY!,
          instance: env.EVOLUTION_INSTANCE!,
          fetch: allowlistedFetch([whatsappOrigin])
        })

  const transcriber = new WhisperTranscriber({
    baseUrl: env.WHISPER_URL,
    model: env.WHISPER_MODEL,
    language: 'pt',
    fetch: allowlistedFetch([env.WHISPER_URL])
  })

  // The model-gateway provider applies its own SSRF guard (https, host pinned).
  const organizer = new ModelOrganizer(
    new OpenAICompatibleProvider({
      id: 'shift-organizer',
      baseUrl: env.LLM_BASE_URL,
      model: env.LLM_MODEL,
      location: 'external',
      apiKey: env.LLM_API_KEY
    }),
    env.LLM_MODEL
  )

  const assistant = new ShiftAssistant({
    store,
    members,
    whatsapp,
    transcriber,
    organizer,
    logger
  })
  const resumed = assistant.resumePending()

  const app = buildShiftServer({
    assistant,
    store,
    whatsapp,
    webhookSecret: env.SHIFT_WEBHOOK_SECRET
  })
  await new Promise<void>((resolve) =>
    app.listen(env.SHIFT_PORT, env.SHIFT_HOST, resolve)
  )

  const timer = setInterval(() => {
    void assistant.tick().catch((error: unknown) =>
      logger.error('shift.tick.failed', {
        error: error instanceof Error ? error.name : 'unknown'
      })
    )
  }, env.SHIFT_TICK_SECONDS * 1000)

  const stop = async () => {
    clearInterval(timer)
    await new Promise<void>((resolve) => app.close(() => resolve()))
    await assistant.idle()
    process.exit(0)
  }
  process.once('SIGTERM', () => void stop())
  process.once('SIGINT', () => void stop())

  logger.info('shift.started', {
    provider: env.SHIFT_PROVIDER,
    members: members.length,
    resumedMessages: resumed,
    paused: store.paused
  })
}

start().catch((error: unknown) => {
  console.error(
    JSON.stringify({
      level: 'error',
      event: 'shift.start.failed',
      message: error instanceof Error ? error.message : 'unknown'
    })
  )
  process.exit(1)
})
