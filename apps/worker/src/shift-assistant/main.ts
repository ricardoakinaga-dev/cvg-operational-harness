import type { ShiftLogger } from './assistant.ts'
import { composeShiftApp } from './compose.ts'
import { loadShiftConfig } from './config.ts'

const logger: ShiftLogger = {
  info: (event, fields) =>
    console.log(JSON.stringify({ level: 'info', event, ...fields })),
  error: (event, fields) =>
    console.error(JSON.stringify({ level: 'error', event, ...fields }))
}

async function start(): Promise<void> {
  const config = loadShiftConfig(process.env)
  const app = composeShiftApp(config, { logger })
  const pending = app.store.unprocessedMessages().length
  const port = await app.start()

  const stop = async () => {
    await app.stop()
    process.exit(0)
  }
  process.once('SIGTERM', () => void stop())
  process.once('SIGINT', () => void stop())

  logger.info('shift.started', {
    provider: config.env.SHIFT_PROVIDER,
    port,
    members: config.members.length,
    resumedMessages: pending,
    paused: app.store.paused
  })
}

start().catch((error: unknown) => {
  logger.error('shift.start.failed', {
    message: error instanceof Error ? error.message : 'unknown'
  })
  process.exit(1)
})
